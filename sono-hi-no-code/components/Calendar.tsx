'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { toDateKey } from '@/lib/date';
import type { Outfit } from '@/lib/types';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function feedbackDot(outfit?: Outfit) {
  if (!outfit) return null;
  if (outfit.feedback === 'good') return 'bg-[var(--success)]';
  if (outfit.feedback === 'meh') return 'bg-[var(--warn)]';
  return 'bg-text/25';
}

export default function Calendar({
  outfits,
  selected,
  onSelect,
}: {
  outfits: Outfit[];
  selected: string;
  onSelect: (key: string) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const [y, m] = selected.split('-').map(Number);
    return new Date(y, m - 1, 1);
  });

  const outfitByDate = useMemo(() => {
    const map = new Map<string, Outfit>();
    outfits.forEach((o) => map.set(o.date, o));
    return map;
  }, [outfits]);

  const days = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  }, [cursor]);

  const todayKeyStr = toDateKey(new Date());

  return (
    <div className="glass-card rounded-lg p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-text/5 text-sm text-text-muted"
        >
          ‹
        </button>
        <p className="text-sm font-bold text-text">
          {cursor.getFullYear()}年 {cursor.getMonth() + 1}月
        </p>
        <button
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-text/5 text-sm text-text-muted"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1.5 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-[10px] font-semibold text-text-faint">
            {w}
          </span>
        ))}
        {days.map((date, i) => {
          if (!date) return <span key={`empty-${i}`} />;
          const key = toDateKey(date);
          const outfit = outfitByDate.get(key);
          const isSelected = key === selected;
          const isToday = key === todayKeyStr;
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={clsx(
                'relative mx-auto flex h-8 w-8 flex-col items-center justify-center rounded-full text-xs',
                isSelected
                  ? 'brand-gradient font-bold text-white'
                  : isToday
                    ? 'border border-brand-pink/60 text-text'
                    : 'text-text-muted'
              )}
            >
              {date.getDate()}
              {outfit && (
                <span
                  className={clsx(
                    'absolute -bottom-1 h-1.5 w-1.5 rounded-full',
                    feedbackDot(outfit)
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
