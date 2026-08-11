'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { JUDGMENTS, choiceLetters, computeSetStats, effectiveJudgment } from '@/lib/scoring';
import type { AnswerRow, Judgment } from '@/lib/scoring';
import type { GradingUpdate } from '@/lib/types';
import { ScreenHeader } from '@/components/ScreenHeader';

type Filter = 'all' | 'wrong' | 'memo' | 'ungraded';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'wrong', label: '不正解のみ' },
  { value: 'memo', label: '備考ありのみ' },
  { value: 'ungraded', label: '未採点のみ' },
];

export default function ResultScreen({ setId, initialAnswers }: { setId: string; initialAnswers: AnswerRow[] }) {
  const [answers, setAnswers] = useState(initialAnswers);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState('');

  const stats = useMemo(() => computeSetStats(answers), [answers]);

  const visibleAnswers = useMemo(() => {
    return answers.filter((row) => {
      const j = effectiveJudgment(row);
      if (filter === 'wrong') return j === JUDGMENTS.WRONG || j === JUDGMENTS.PARTIAL;
      if (filter === 'memo') return row.memo.trim();
      if (filter === 'ungraded') return j === JUDGMENTS.NONE;
      return true;
    });
  }, [answers, filter]);

  async function saveGrading(no: number, partial: Partial<GradingUpdate>) {
    setError('');
    try {
      const res = await fetch(`/api/sets/${setId}/grading`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: [{ no, ...partial }] }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setError('保存に失敗しました（電波状況をご確認ください）');
    }
  }

  function setCorrectAnswer(no: number, letter: string) {
    setAnswers((prev) =>
      prev.map((a) => (a.no === no ? { ...a, correctAnswer: a.correctAnswer === letter ? '' : letter } : a))
    );
    const row = answers.find((a) => a.no === no);
    const next = row?.correctAnswer === letter ? '' : letter;
    saveGrading(no, { correctAnswer: next });
  }

  function setJudgment(no: number, mark: Judgment) {
    setAnswers((prev) => prev.map((a) => (a.no === no ? { ...a, judgment: a.judgment === mark ? '' : mark } : a)));
    const row = answers.find((a) => a.no === no);
    const next = row?.judgment === mark ? '' : mark;
    saveGrading(no, { judgment: next });
  }

  return (
    <>
      <ScreenHeader title="採点結果" backHref="/" />
      <main className="px-3.5 pb-8 pt-3.5">
        <div className="mb-3.5 rounded-[14px] bg-[var(--bg-elevated)] py-5 text-center shadow-[var(--shadow)]">
          <div className="text-[44px] font-bold leading-none">
            {stats.percentage === null ? '--' : stats.percentage}
            <span className="ml-0.5 text-[17px] font-medium">点</span>
          </div>
          <div className="mt-1 text-[12.5px] text-[var(--text-secondary)]">
            正答 {stats.correctCount} / 採点済み {stats.graded}問（全{stats.total}問）
          </div>
        </div>

        {error && <div className="mb-2 text-center text-[12.5px] text-[var(--danger)]">{error}</div>}

        <div className="mb-3 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={clsx(
                'rounded-full border px-3 py-1 text-[12px]',
                filter === f.value
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-text)]'
                  : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)]'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {visibleAnswers.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-[var(--text-secondary)]">該当する問題がありません</div>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleAnswers.map((row) => {
              const j = effectiveJudgment(row);
              const markClass =
                j === JUDGMENTS.CORRECT
                  ? 'text-[var(--success)]'
                  : j === JUDGMENTS.PARTIAL
                    ? 'text-[var(--warning)]'
                    : j === JUDGMENTS.WRONG
                      ? 'text-[var(--danger)]'
                      : 'text-[var(--text-secondary)]';
              return (
                <div key={row.no} className="rounded-[14px] bg-[var(--bg-elevated)] p-3 shadow-[var(--shadow)]">
                  <div className="mb-1.5 flex items-center justify-between text-[13px]">
                    <span className="font-semibold">問{row.no}</span>
                    <span className={clsx('text-[14px] font-bold', markClass)}>{j || '未'}</span>
                  </div>
                  <div className="mb-1 text-[12.5px] text-[var(--text-secondary)]">
                    あなたの解答: {row.userAnswer.trim() || '（未回答）'}
                  </div>

                  {row.qType === 'choice' ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="mr-0.5 text-[11.5px] text-[var(--text-secondary)]">正解:</span>
                      {choiceLetters(row.choiceCount).map((letter) => {
                        const selected = row.correctAnswer === letter;
                        return (
                          <button
                            key={letter}
                            onClick={() => setCorrectAnswer(row.no, letter)}
                            className={clsx(
                              'h-[30px] w-[34px] rounded-[9px] border text-[12.5px]',
                              selected
                                ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-text)]'
                                : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)]'
                            )}
                          >
                            {letter}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="mr-0.5 text-[11.5px] text-[var(--text-secondary)]">自己採点:</span>
                      {([JUDGMENTS.CORRECT, JUDGMENTS.PARTIAL, JUDGMENTS.WRONG] as Judgment[]).map((mark) => {
                        const selected = row.judgment === mark;
                        const toneClass =
                          mark === JUDGMENTS.CORRECT
                            ? 'border-[var(--success)] text-[var(--success)] bg-[color-mix(in_srgb,var(--success)_20%,transparent)]'
                            : mark === JUDGMENTS.PARTIAL
                              ? 'border-[var(--warning)] text-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_20%,transparent)]'
                              : 'border-[var(--danger)] text-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]';
                        return (
                          <button
                            key={mark}
                            onClick={() => setJudgment(row.no, mark)}
                            className={clsx(
                              'rounded-lg border px-2.5 py-1 text-[12.5px]',
                              selected ? toneClass : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)]'
                            )}
                          >
                            {mark}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {row.memo.trim() && (
                    <div className="mt-2 rounded-lg bg-[var(--fill)] px-2 py-1.5 text-[12px]">備考: {row.memo}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
