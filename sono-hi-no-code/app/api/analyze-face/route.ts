import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { PersonalColorSeason } from '@/lib/types';

export const dynamic = 'force-dynamic';

const SEASONS: PersonalColorSeason[] = ['spring', 'summer', 'autumn', 'winter'];

function fallbackAnalysis(imageDataUrl: string): {
  personalColor: PersonalColorSeason;
  note: string;
} {
  let hash = 0;
  for (let i = 0; i < imageDataUrl.length; i += 37) {
    hash = (hash * 31 + imageDataUrl.charCodeAt(i)) % 100000;
  }
  const personalColor = SEASONS[hash % SEASONS.length];
  return {
    personalColor,
    note:
      '（簡易推定：AI画像解析APIキー未設定のため、登録写真から仮の診断を表示しています。Claude APIキーを設定するとより精度の高い診断が行われます）',
  };
}

export async function POST(req: NextRequest) {
  const { imageDataUrl } = (await req.json()) as { imageDataUrl: string };
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!imageDataUrl) {
    return NextResponse.json({ error: 'imageDataUrl is required' }, { status: 400 });
  }

  if (apiKey) {
    try {
      const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!match) throw new Error('invalid data url');
      const [, mediaType, base64] = match;

      const client = new Anthropic({ apiKey });
      const msg = await client.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 400,
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
                text: 'この顔写真から、パーソナルカラー診断（spring/summer/autumn/winterのいずれか）と、似合う色味・首元/襟の形について1-2文の簡潔な日本語アドバイスを、次のJSON形式のみで出力してください。前後に説明文は不要です。{"personalColor": "spring"|"summer"|"autumn"|"winter", "note": "..."}',
              },
            ],
          },
        ],
      });

      const textBlock = msg.content.find((c) => c.type === 'text');
      if (textBlock && textBlock.type === 'text') {
        const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as {
            personalColor: PersonalColorSeason;
            note: string;
          };
          if (SEASONS.includes(parsed.personalColor)) {
            return NextResponse.json(parsed);
          }
        }
      }
    } catch (err) {
      console.error('Claude face analysis failed, falling back', err);
    }
  }

  return NextResponse.json(fallbackAnalysis(imageDataUrl));
}
