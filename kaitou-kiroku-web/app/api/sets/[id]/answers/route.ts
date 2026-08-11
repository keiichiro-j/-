import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { apiErrorResponse } from '@/lib/apiError';
import type { AnswerUpdate } from '@/lib/types';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { updates: AnswerUpdate[] };
    const summary = await store.saveAnswers(id, body.updates || []);
    return NextResponse.json({ set: summary });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
