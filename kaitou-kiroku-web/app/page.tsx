import Link from 'next/link';
import { store } from '@/lib/store';
import { Badge, EmptyState, SectionLabel } from '@/components/ui';
import { ScreenHeader } from '@/components/ScreenHeader';

export const dynamic = 'force-dynamic';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export default async function HomePage() {
  const sets = await store.getSets();

  return (
    <>
      <ScreenHeader
        title="📘 解答記録"
        right={
          <Link href="/settings" className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-[var(--accent)] active:opacity-70">
            ⚙ 設定
          </Link>
        }
      />
      <main className="px-3.5 pb-8 pt-3.5">
        <Link
          href="/new"
          className="mb-[18px] flex w-full items-center justify-center rounded-[9px] bg-[var(--accent)] px-4 py-[11px] text-[15px] font-semibold text-[var(--accent-text)] active:opacity-70"
        >
          ＋ 新しい解答セットを作成
        </Link>

        <SectionLabel>過去のセット</SectionLabel>

        {sets.length === 0 ? (
          <EmptyState>
            まだ解答セットがありません。
            <br />
            「＋ 新しい解答セットを作成」から始めましょう。
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {sets.map((set) => {
              const fullyAnswered = set.answeredCount >= set.questionCount;
              const href = `/sets/${set.id}/${fullyAnswered ? 'result' : 'answer'}`;
              return (
                <Link
                  key={set.id}
                  href={href}
                  className="flex w-full items-center justify-between gap-2.5 rounded-[14px] bg-[var(--bg-elevated)] px-3.5 py-3 shadow-[var(--shadow)] active:opacity-75"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold">{set.examName}</div>
                    <div className="mt-0.5 text-[12.5px] text-[var(--text-secondary)]">
                      全{set.questionCount}問・{formatDate(set.createdAt)}
                    </div>
                  </div>
                  {set.status === 'graded' ? (
                    <Badge tone={set.score !== null && set.score >= 70 ? 'success' : set.score !== null && set.score < 50 ? 'danger' : 'default'}>
                      {set.score}点
                    </Badge>
                  ) : (
                    <Badge>{set.gradedCount > 0 ? '採点中' : '未採点'}</Badge>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
