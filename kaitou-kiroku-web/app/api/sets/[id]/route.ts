import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { apiErrorResponse } from '@/lib/apiError';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const detail = await store.getSetDetail(id);
    return NextResponse.json(detail);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
