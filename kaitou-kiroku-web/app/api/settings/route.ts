import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { apiErrorResponse } from '@/lib/apiError';
import type { ThemeValue } from '@/lib/types';

export async function GET() {
  try {
    const theme = await store.getTheme();
    return NextResponse.json({ theme });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { theme: ThemeValue };
    if (body.theme !== 'light' && body.theme !== 'dark' && body.theme !== 'system') {
      return NextResponse.json({ error: '不正なテーマです' }, { status: 400 });
    }
    const theme = await store.saveTheme(body.theme);
    return NextResponse.json({ theme });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
