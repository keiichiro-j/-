import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { apiErrorResponse } from '@/lib/apiError';
import type { BulkConfig, OverrideRange } from '@/lib/scoring';

export async function GET() {
  try {
    const sets = await store.getSets();
    return NextResponse.json({ sets });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

interface CreateSetBody {
  examName: string;
  questionCount: number;
  bulkConfig: BulkConfig;
  overrides: OverrideRange[];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateSetBody;
    const id = await store.createSet(body.examName, body.questionCount, body.bulkConfig, body.overrides || []);
    return NextResponse.json({ id });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
