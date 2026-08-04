import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

interface AnalyzedItem {
  name: string;
  amount: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

const MEAL_LABEL_JA: Record<string, string> = {
  breakfast: '朝食',
  lunch: '昼食',
  dinner: '夕食',
  snack: '間食',
};

function sanitizeItems(raw: unknown): AnalyzedItem[] {
  if (!Array.isArray(raw)) return [];
  const num = (v: unknown) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
  };
  return raw
    .map((item) => {
      if (typeof item !== 'object' || item === null) return null;
      const rec = item as Record<string, unknown>;
      const name = typeof rec.name === 'string' ? rec.name.trim() : '';
      if (!name) return null;
      return {
        name,
        amount: typeof rec.amount === 'string' ? rec.amount.trim() : '',
        calories: num(rec.calories),
        protein: num(rec.protein),
        fat: num(rec.fat),
        carbs: num(rec.carbs),
      };
    })
    .filter((i): i is AnalyzedItem => i !== null)
    .slice(0, 12);
}

export async function POST(req: NextRequest) {
  const { imageDataUrl, mealType } = (await req.json()) as {
    imageDataUrl?: string;
    mealType?: string;
  };

  if (!imageDataUrl) {
    return NextResponse.json({ error: 'imageDataUrl is required' }, { status: 400 });
  }

  const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) {
    return NextResponse.json({ error: 'invalid image data url' }, { status: 400 });
  }
  const [, mediaType, base64] = match;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      items: [],
      source: 'none',
      note: 'AI画像解析APIキー未設定のため自動解析はできません。品目を手動で追加してください。',
    });
  }

  try {
    const client = new Anthropic({ apiKey });
    const mealLabel = mealType ? MEAL_LABEL_JA[mealType] ?? '食事' : '食事';
    const msg = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1200,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp',
                data: base64,
              },
            },
            {
              type: 'text',
              text: `これは${mealLabel}の写真です。写っている料理・食品をすべて識別してください。1枚の写真に複数の品目（主菜・副菜・汁物・飲み物など）が写っている場合は、それぞれ個別の項目に分割してください。

それぞれの品目について、写真から読み取れる範囲でおおよその「推定量」「推定カロリー(kcal)」「タンパク質(g)」「脂質(g)」「炭水化物(g)」を算出してください。詳細な計量は不要で、一般的な標準的な分量・調理法を仮定した大まかな目安で構いません。

必ず次のJSON形式のみを出力してください。前後の説明文やコードブロック記法は一切付けないでください。
{"items": [{"name": "品目名", "amount": "目安量(例: 茶碗1杯 / 150g)", "calories": 000, "protein": 0, "fat": 0, "carbs": 0}]}`,
            },
          ],
        },
      ],
    });

    const textBlock = msg.content.find((c) => c.type === 'text');
    if (textBlock && textBlock.type === 'text') {
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { items?: unknown };
        const items = sanitizeItems(parsed.items);
        if (items.length > 0) {
          return NextResponse.json({ items, source: 'claude' });
        }
      }
    }
    return NextResponse.json({
      items: [],
      source: 'claude',
      note: '写真から料理を認識できませんでした。品目を手動で追加してください。',
    });
  } catch (err) {
    console.error('Claude meal analysis failed', err);
    return NextResponse.json({
      items: [],
      source: 'error',
      note: 'AI解析中にエラーが発生しました。品目を手動で追加してください。',
    });
  }
}
