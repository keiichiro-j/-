import { NextResponse } from 'next/server';
import { NotFoundError, ValidationError } from './types';

export function apiErrorResponse(err: unknown): NextResponse {
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  const message = err instanceof Error ? err.message : '不明なエラーが発生しました';
  return NextResponse.json({ error: message }, { status: 500 });
}
