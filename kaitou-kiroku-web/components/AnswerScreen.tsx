'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { choiceLetters } from '@/lib/scoring';
import type { AnswerRow } from '@/lib/scoring';
import type { AnswerUpdate, SetSummary } from '@/lib/types';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/ui';

const AUTOSAVE_DELAY_MS = 700;

export default function AnswerScreen({
  setId,
  initialSet,
  initialAnswers,
}: {
  setId: string;
  initialSet: SetSummary;
  initialAnswers: AnswerRow[];
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState(initialAnswers);
  const [saveState, setSaveState] = useState('');
  const [navigating, setNavigating] = useState(false);
  const pendingRef = useRef<Map<number, AnswerUpdate>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = answers.length;
  const answeredCount = answers.filter((a) => a.userAnswer.trim()).length;

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const updates = Array.from(pendingRef.current.values());
    if (updates.length === 0) return;
    pendingRef.current = new Map();
    setSaveState('保存中…');
    try {
      const res = await fetch(`/api/sets/${setId}/answers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) throw new Error();
      setSaveState('保存済み');
    } catch {
      setSaveState('保存に失敗しました（電波状況をご確認ください）');
    }
  }, [setId]);

  const queueUpdate = useCallback(
    (no: number, partial: Partial<AnswerUpdate>) => {
      const prev = pendingRef.current.get(no) || { no };
      pendingRef.current.set(no, { ...prev, ...partial });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        flush();
      }, AUTOSAVE_DELAY_MS);
    },
    [flush]
  );

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') flush();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setUserAnswer(no: number, value: string) {
    setAnswers((prev) => prev.map((a) => (a.no === no ? { ...a, userAnswer: value } : a)));
    queueUpdate(no, { userAnswer: value });
  }

  function setMemo(no: number, value: string) {
    setAnswers((prev) => prev.map((a) => (a.no === no ? { ...a, memo: value } : a)));
    queueUpdate(no, { memo: value });
  }

  async function goToResult() {
    setNavigating(true);
    await flush();
    router.push(`/sets/${setId}/result`);
  }

  return (
    <>
      <ScreenHeader title="解答入力" backHref="/" />
      <main className="px-3.5 pb-8 pt-3.5">
        <div className="mb-2 truncate text-[13px] font-medium text-[var(--text-secondary)]">{initialSet.examName}</div>
        <div className="mb-1.5 h-1.5 overflow-hidden rounded bg-[var(--fill)]">
          <div
            className="h-full bg-[var(--accent)] transition-[width] duration-200"
            style={{ width: `${total > 0 ? (answeredCount / total) * 100 : 0}%` }}
          />
        </div>
        <div className="mb-2 flex min-h-[14px] items-center justify-between text-[12px] text-[var(--text-secondary)]">
          <span>{answeredCount} / {total}問 回答済み</span>
          <span>{saveState}</span>
        </div>

        <div className="flex flex-col gap-2.5">
          {answers.map((row) => (
            <div key={row.no} className="rounded-[14px] bg-[var(--bg-elevated)] p-3 shadow-[var(--shadow)]">
              <div className="mb-2 flex items-center justify-between text-[13.5px] font-semibold">
                <span>問{row.no}</span>
                <span className="text-[11px] font-normal text-[var(--text-secondary)]">
                  {row.qType === 'text' ? '記述式' : `${row.choiceCount}択`}
                </span>
              </div>

              {row.qType === 'choice' ? (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {choiceLetters(row.choiceCount).map((letter) => {
                    const selected = row.userAnswer === letter;
                    return (
                      <button
                        key={letter}
                        onClick={() => setUserAnswer(row.no, selected ? '' : letter)}
                        className={
                          'min-w-[40px] flex-1 rounded-[9px] border py-2.5 text-center text-[14px] ' +
                          (selected
                            ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-text)]'
                            : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)]')
                        }
                      >
                        {letter}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input
                  type="text"
                  value={row.userAnswer}
                  onChange={(e) => setUserAnswer(row.no, e.target.value)}
                  onBlur={() => flush()}
                  placeholder="解答を入力"
                  className="mb-2 w-full rounded-[9px] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-[11px] text-[15px] outline-none focus:outline-2 focus:outline-[var(--accent)]"
                />
              )}

              <textarea
                value={row.memo}
                onChange={(e) => setMemo(row.no, e.target.value)}
                onBlur={() => flush()}
                placeholder="備考（気づき・メモがあれば入力）"
                rows={1}
                className="w-full resize-y rounded-[9px] border border-dashed border-[var(--border)] bg-[var(--fill)] px-2.5 py-2 text-[12.5px] outline-none placeholder:text-[var(--text-secondary)]"
              />
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 mt-4 bg-[var(--bg)] pb-[env(safe-area-inset-bottom)] pt-1">
          <Button variant="primary" className="w-full" disabled={navigating} onClick={goToResult}>
            採点画面へ進む
          </Button>
        </div>
      </main>
    </>
  );
}
