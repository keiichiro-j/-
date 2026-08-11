'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DEFAULT_CHOICE_COUNT,
  MAX_CHOICE_COUNT,
  MAX_QUESTION_COUNT,
  MIN_CHOICE_COUNT,
  MIN_QUESTION_COUNT,
  buildQuestionConfigs,
  groupConsecutive,
  typeLabel,
  validateQuestionCount,
} from '@/lib/scoring';
import type { BulkConfig, OverrideRange, QuestionType } from '@/lib/scoring';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Field, SectionLabel, Select, TextInput } from '@/components/ui';

const CHOICE_COUNT_OPTIONS = Array.from(
  { length: MAX_CHOICE_COUNT - MIN_CHOICE_COUNT + 1 },
  (_, i) => MIN_CHOICE_COUNT + i
);

export default function NewSetPage() {
  const router = useRouter();
  const [examName, setExamName] = useState('');
  const [questionCount, setQuestionCount] = useState(100);
  const [bulkConfig, setBulkConfig] = useState<BulkConfig>({ qType: 'choice', choiceCount: DEFAULT_CHOICE_COUNT });
  const [bulkChoiceCount, setBulkChoiceCount] = useState(DEFAULT_CHOICE_COUNT);
  const [overrides, setOverrides] = useState<OverrideRange[]>([]);
  const [ovFrom, setOvFrom] = useState('');
  const [ovTo, setOvTo] = useState('');
  const [ovType, setOvType] = useState<QuestionType>('choice');
  const [ovChoiceCount, setOvChoiceCount] = useState(DEFAULT_CHOICE_COUNT);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const clampedCount = Math.min(MAX_QUESTION_COUNT, Math.max(0, questionCount || 0));
  const groups = useMemo(() => {
    if (clampedCount === 0) return [];
    return groupConsecutive(buildQuestionConfigs(clampedCount, bulkConfig, overrides));
  }, [clampedCount, bulkConfig, overrides]);

  function addOverride() {
    const from = Number(ovFrom);
    let to = Number(ovTo) || from;
    if (!from || from < 1) {
      setError('開始の問題番号を入力してください');
      return;
    }
    if (to < from) to = from;
    setOverrides((prev) => [...prev, { from, to, qType: ovType, choiceCount: ovChoiceCount }]);
    setOvFrom('');
    setOvTo('');
  }

  function removeOverride(index: number) {
    setOverrides((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreate() {
    setError('');
    const name = examName.trim();
    if (!name) {
      setError('資格名・試験名を入力してください');
      return;
    }
    if (!validateQuestionCount(questionCount)) {
      setError(`問題数は${MIN_QUESTION_COUNT}〜${MAX_QUESTION_COUNT}の範囲で入力してください`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examName: name, questionCount, bulkConfig, overrides }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '作成に失敗しました');
      router.push(`/sets/${data.id}/answer`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '作成に失敗しました');
      setSubmitting(false);
    }
  }

  return (
    <>
      <ScreenHeader title="新規セット設定" backHref="/" />
      <main className="px-3.5 pb-8 pt-3.5">
        <Field label="資格名・試験名">
          <TextInput
            value={examName}
            onChange={(e) => setExamName(e.target.value)}
            placeholder="例：ITパスポート 令和7年 秋期"
            maxLength={100}
          />
        </Field>
        <Field label={`問題数（${MIN_QUESTION_COUNT}〜${MAX_QUESTION_COUNT}問）`}>
          <TextInput
            type="number"
            inputMode="numeric"
            min={MIN_QUESTION_COUNT}
            max={MAX_QUESTION_COUNT}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
          />
        </Field>

        <SectionLabel>出題形式の一括設定</SectionLabel>
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <Select value={bulkChoiceCount} onChange={(e) => setBulkChoiceCount(Number(e.target.value))}>
            {CHOICE_COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {typeLabel('choice', n)}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={() => setBulkConfig({ qType: 'choice', choiceCount: bulkChoiceCount })}>
            全問 選択式にする
          </Button>
          <Button size="sm" onClick={() => setBulkConfig({ qType: 'text', choiceCount: DEFAULT_CHOICE_COUNT })}>
            全問 記述式にする
          </Button>
        </div>

        <SectionLabel>問題ごとの個別設定（必要な範囲だけ上書き）</SectionLabel>
        <div className="mb-2.5 rounded-[14px] border border-dashed border-[var(--border)] p-2.5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <TextInput
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="問"
              value={ovFrom}
              onChange={(e) => setOvFrom(e.target.value)}
              className="w-16 px-2 py-2 text-center text-[13px]"
            />
            <span className="text-[12px] text-[var(--text-secondary)]">〜</span>
            <TextInput
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="問"
              value={ovTo}
              onChange={(e) => setOvTo(e.target.value)}
              className="w-16 px-2 py-2 text-center text-[13px]"
            />
            <Select value={ovType} onChange={(e) => setOvType(e.target.value as QuestionType)}>
              <option value="choice">選択式</option>
              <option value="text">記述式</option>
            </Select>
            {ovType === 'choice' && (
              <Select value={ovChoiceCount} onChange={(e) => setOvChoiceCount(Number(e.target.value))}>
                {CHOICE_COUNT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {typeLabel('choice', n)}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <Button size="sm" className="w-full" onClick={addOverride}>
            この範囲を上書き設定に追加
          </Button>
        </div>

        {overrides.length > 0 && (
          <div className="mb-3 flex flex-col gap-1.5">
            {overrides.map((ov, i) => (
              <div key={i} className="flex items-center justify-between rounded-[9px] bg-[var(--bg-elevated)] px-2.5 py-2 text-[12.5px]">
                <span>
                  {ov.from === ov.to ? `問${ov.from}` : `問${ov.from}〜${ov.to}`}： {typeLabel(ov.qType, ov.choiceCount)}
                </span>
                <button onClick={() => removeOverride(i)} className="px-1.5 text-[13px] text-[var(--danger)]">
                  削除
                </button>
              </div>
            ))}
          </div>
        )}

        <SectionLabel>出題形式プレビュー</SectionLabel>
        <div className="overflow-hidden rounded-[14px]">
          {clampedCount === 0 ? (
            <div className="px-3 py-2 text-[12.5px] text-[var(--text-secondary)]">問題数を入力してください</div>
          ) : (
            groups.map((g, i) => (
              <div
                key={i}
                className="flex justify-between border-b border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[12.5px] last:border-b-0"
              >
                <span>{g.from === g.to ? `問${g.from}` : `問${g.from}〜${g.to}`}</span>
                <span className="text-[var(--text-secondary)]">{typeLabel(g.qType, g.choiceCount)}</span>
              </div>
            ))
          )}
        </div>

        <div className="sticky bottom-0 mt-4 bg-[var(--bg)] pb-[env(safe-area-inset-bottom)] pt-1">
          {error && <div className="mb-2 text-center text-[12.5px] text-[var(--danger)]">{error}</div>}
          <Button variant="primary" className="w-full" disabled={submitting} onClick={handleCreate}>
            {submitting ? '作成中…' : '解答入力へ進む'}
          </Button>
        </div>
      </main>
    </>
  );
}
