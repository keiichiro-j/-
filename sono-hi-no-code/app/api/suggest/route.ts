import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { generateSuggestions } from '@/lib/suggest';
import type {
  ClothingItem,
  Outfit,
  OutfitSuggestion,
  Tpo,
  UserProfile,
  WeatherInfo,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

interface SuggestBody {
  items: ClothingItem[];
  weather: WeatherInfo;
  tpo: Tpo;
  history: Outfit[];
  profile?: UserProfile;
  patternCount?: number;
}

async function suggestWithClaude(
  body: SuggestBody,
  apiKey: string
): Promise<OutfitSuggestion[] | null> {
  try {
    const client = new Anthropic({ apiKey });
    const active = body.items.filter((i) => i.status === 'active');
    const recentIds = new Set(
      body.history
        .filter((o) => {
          const days = (Date.now() - new Date(o.date).getTime()) / 86400000;
          return days <= 3;
        })
        .flatMap((o) => o.itemIds)
    );

    const compactItems = active.map((i) => ({
      id: i.id,
      name: i.name,
      brand: i.brand,
      category: i.category,
      color: i.color,
      material: i.material,
      season: i.season,
      tpoTags: i.tpoTags ?? [],
      recentlyWorn: recentIds.has(i.id),
    }));

    const prompt = `あなたは経験豊富なプロのファッションコーディネーターです。ファッション誌やスタイリング記事で得られるような一般的なトレンド・着こなしの知見も踏まえながら、以下のJSON情報をもとに今日着るコーデを${
      body.patternCount ?? 3
    }パターン提案してください。

# クローゼット在庫（"active"のみ、着用可）
${JSON.stringify(compactItems)}

# 天気
${JSON.stringify(body.weather)}

# シーン(TPO)
${body.tpo}

# ユーザープロフィール（任意）
${JSON.stringify(body.profile ?? {})}

# 出力ルール
- 各パターンは最低でもトップスとボトムスのカテゴリを1つずつ含めること
- recentlyWorn: true のアイテムはできるだけ避け、在庫が無い場合のみ使用する
- 天候（気温・降水確率）に応じてアウターや靴を必要に応じて追加する
- reasonには「なぜこの組み合わせなのか」を、アイテムの色・素材・ブランドなど個々の特徴に触れながら日本語で具体的に記載する（100文字程度）
- ${body.patternCount ?? 3}パターンそれぞれで言い回し・文体・切り口を変え、同じような文章構成の繰り返しを避けること（例：気温の話から入るもの、色の相性から入るもの、シーンから入るものなど）
- ファッション誌のスタイリングコラムのような、説得力があり読んでいて楽しい文章にする
- 必ず次のJSON形式のみを出力すること。前後に説明文やコードブロック記法は付けない。

{"patterns": [{"itemIds": ["id1", "id2"], "reason": "..."}]}`;

    const msg = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = msg.content.find((c) => c.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return null;

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as {
      patterns: { itemIds: string[]; reason: string }[];
    };

    const validIds = new Set(active.map((i) => i.id));
    const results: OutfitSuggestion[] = parsed.patterns
      .map((p) => ({
        itemIds: p.itemIds.filter((id) => validIds.has(id)),
        reason: p.reason,
        score: 0,
      }))
      .filter((p) => p.itemIds.length > 0);

    return results.length > 0 ? results : null;
  } catch (err) {
    console.error('Claude suggestion failed, falling back to rule engine', err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as SuggestBody;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  let suggestions: OutfitSuggestion[] | null = null;
  let source: 'claude' | 'rule-based' = 'rule-based';

  if (apiKey) {
    suggestions = await suggestWithClaude(body, apiKey);
    if (suggestions) source = 'claude';
  }

  if (!suggestions) {
    suggestions = generateSuggestions(body);
  }

  return NextResponse.json({ suggestions, source });
}
