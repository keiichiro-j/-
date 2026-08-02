import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { generateListingCopy } from '@/lib/listing';
import { estimateResaleValue } from '@/lib/resale';
import {
  BRAND_TIER_LABEL,
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
    const price = estimateResaleValue(item);
    const seasons =
      item.season && item.season.length > 0
        ? item.season.map((s) => SEASON_LABEL[s]).join('・')
        : '通年';

    const prompt = `あなたはフリマアプリ（メルカリ等）の出品文作成が得意なライターです。以下のアイテム情報から、購入意欲を引き出す魅力的な出品文を作成してください。

# アイテム情報
- 名前: ${item.name}
- ブランド: ${item.brand ?? '不明'}（価格帯: ${BRAND_TIER_LABEL[item.brandTier]}）
- カテゴリ: ${CATEGORY_LABEL[item.category]}
- 色: ${item.color}
- 素材: ${item.material ?? '不明'}
- 季節: ${seasons}
- 状態: ${CONDITION_LABEL[item.condition]}
- 参考価格（リセール概算）: ¥${price}

# 出力ルール
- title: 40文字以内。ブランド名・アイテム名・特徴を含め、検索に引っかかりやすいタイトルにする
- body: 300〜500文字程度。冒頭の一言→状態→アイテム詳細（色・素材・季節等）→発送についての一言→ハッシュタグ、の構成で、実際にフリマアプリに貼り付けてすぐ使える体裁にする（見出しには■を使う）
- suggestedPrice: 参考価格を踏まえた妥当な出品価格（円・整数）
- 誇張しすぎず、事実に基づいた誠実な文章にする
- 必ず次のJSON形式のみを出力すること。前後に説明文やコードブロック記法は付けない。

{"title": "...", "body": "...", "suggestedPrice": 0}`;

    const msg = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = msg.content.find((c) => c.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return null;

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as ListingCopy;
    if (!parsed.title || !parsed.body) return null;
    return {
      title: parsed.title,
      body: parsed.body,
      suggestedPrice: parsed.suggestedPrice || price,
    };
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
