import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { apiErrorResponse } from '@/lib/apiError';
import type { GradingUpdate } from '@/lib/types';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { updates: GradingUpdate[] };
    const summary = await store.saveGrading(id, body.updates || []);
    return NextResponse.json({ set: summary });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
