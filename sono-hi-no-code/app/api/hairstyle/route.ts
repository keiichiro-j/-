import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { STYLE_VIBE_LABEL, type StyleVibe } from '@/lib/types';

export const dynamic = 'force-dynamic';

const FALLBACK_NOTES = [
  '輪郭を優しく見せる、顔まわりに軽さを出したレイヤースタイルが似合いやすい傾向です。',
  '顔の縦のラインを意識した、前髪を斜めに流すスタイルでバランスを取りやすいでしょう。',
  'サイドに高さを出さず、耳周りをすっきりさせるスタイルで印象が引き締まりやすいです。',
  '無造作な質感を活かしたスタイルで、こなれた雰囲気を出しやすいでしょう。',
];

function fallbackHairstyle(imageDataUrl: string): string {
  let hash = 0;
  for (let i = 0; i < imageDataUrl.length; i += 41) {
    hash = (hash * 31 + imageDataUrl.charCodeAt(i)) % 100000;
  }
  const note = FALLBACK_NOTES[hash % FALLBACK_NOTES.length];
  return `（簡易推定：AI画像解析APIキー未設定のため仮の診断です）${note}`;
}

export async function POST(req: NextRequest) {
  const { imageDataUrl, styleVibes } = (await req.json()) as {
    imageDataUrl: string;
    styleVibes?: StyleVibe[];
  };
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!imageDataUrl) {
    return NextResponse.json({ error: 'imageDataUrl is required' }, { status: 400 });
  }

  const vibeText =
    styleVibes && styleVibes.length > 0
      ? styleVibes.map((v) => STYLE_VIBE_LABEL[v]).join('・')
      : undefined;

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
                text: `この顔写真の輪郭・顔立ちの雰囲気から、似合いそうなヘアスタイルの方向性を2〜3文の日本語で提案してください。${
                  vibeText
                    ? `ユーザーが好む世界観は「${vibeText}」なので、その雰囲気に合うスタイルも意識してください。`
                    : ''
                }断定的な医療・美容の助言ではなく、あくまでスタイリングの参考としての一般的な提案にとどめてください。JSON形式 {"note": "..."} のみを出力し、前後に説明文は付けないこと。`,
              },
            ],
          },
        ],
      });

      const textBlock = msg.content.find((c) => c.type === 'text');
      if (textBlock && textBlock.type === 'text') {
        const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as { note: string };
          if (parsed.note) {
            return NextResponse.json({ note: parsed.note });
          }
        }
      }
    } catch (err) {
      console.error('Claude hairstyle analysis failed, falling back', err);
    }
  }

  return NextResponse.json({ note: fallbackHairstyle(imageDataUrl) });
}
