import { notFound } from 'next/navigation';
import { store } from '@/lib/store';
import { NotFoundError } from '@/lib/types';
import AnswerScreen from '@/components/AnswerScreen';

export const dynamic = 'force-dynamic';

async function loadDetail(id: string) {
  try {
    return await store.getSetDetail(id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}

export default async function AnswerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await loadDetail(id);
  return <AnswerScreen setId={id} initialSet={detail.set} initialAnswers={detail.answers} />;
}
