import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { generateListingCopy } from '@/lib/listing';
import {
  CATEGORY_LABEL,
  CONDITION_LABEL,
  SEASON_LABEL,
  type ClothingItem,
  type ListingCopy,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

async function listingWithClaude(item: ClothingItem, apiKey: string): Promise<ListingCopy | null> {
  try {
    const client = new Anthropic({ apiKey });
    const seasons =
      item.season && item.season.length > 0
        ? item.season.map((s) => SEASON_LABEL[s]).join('・')
        : '通年';

    const imageMatch = item.imageDataUrl?.match(/^data:(image\/\w+);base64,(.+)$/);

    const promptText = `あなたはフリマアプリ（メルカリ等）の出品文作成が得意なライターです。以下のアイテム情報${
      imageMatch ? 'と実際の商品写真' : ''
    }から、購入意欲を引き出す魅力的で説得力のある出品文を作成してください。

# アイテム情報
- 名前: ${item.name}
- ブランド: ${item.brand ?? '不明'}
- カテゴリ: ${CATEGORY_LABEL[item.category]}
- 色: ${item.color}
- サイズ: ${item.size ?? '不明'}
- 素材: ${item.material ?? '不明'}
- 季節: ${seasons}
- 状態: ${CONDITION_LABEL[item.condition]}

# 出力ルール
- title: 40文字以内。ブランド名・アイテム名・特徴を含め、検索に引っかかりやすいタイトルにする
- body: 300〜500文字程度。冒頭の一言→状態→アイテム詳細（色・サイズ・素材・季節等）→発送についての一言→ハッシュタグ、の構成で、実際にフリマアプリに貼り付けてすぐ使える体裁にする（見出しには■を使う）
${
  imageMatch
    ? '- 添付した商品写真を実際によく観察し、デザインのディテール（シルエット、襟・袖の形、装飾、質感、色味の見え方など）を具体的に描写に盛り込むこと。写真から読み取れない情報は憶測で断定しない'
    : ''
}
- ブランドが分かる場合は、そのブランドが持つ一般的なイメージ・特徴（分かる範囲で）を自然に触れる。ただし憶測で誇張した事実を書かない
- 「ハイブランド」「中価格帯ブランド」「ファストファッション」のような価格帯・ブランドランクを示す表現は一切書かないこと
- 価格・金額には一切言及しないこと（価格はユーザー自身が別途設定するため）
- 誇張しすぎず、事実に基づいた誠実な文章にする
- 必ず次のJSON形式のみを出力すること。前後に説明文やコードブロック記法は付けない。

{"title": "...", "body": "..."}`;

    const content: Anthropic.MessageParam['content'] = imageMatch
      ? [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: imageMatch[1] as 'image/jpeg' | 'image/png' | 'image/webp',
              data: imageMatch[2],
            },
          },
          { type: 'text', text: promptText },
        ]
      : promptText;

    const msg = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1200,
      messages: [{ role: 'user', content }],
    });

    const textBlock = msg.content.find((c) => c.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return null;

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as ListingCopy;
    if (!parsed.title || !parsed.body) return null;
    return { title: parsed.title, body: parsed.body };
  } catch (err) {
    console.error('Claude listing generation failed, falling back', err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const { item } = (await req.json()) as { item: ClothingItem };
  if (!item) {
    return NextResponse.json({ error: 'item is required' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  let listing: ListingCopy | null = null;
  let source: 'claude' | 'rule-based' = 'rule-based';

  if (apiKey) {
    listing = await listingWithClaude(item, apiKey);
    if (listing) source = 'claude';
  }

  if (!listing) {
    listing = generateListingCopy(item);
  }

  return NextResponse.json({ listing, source });
}
