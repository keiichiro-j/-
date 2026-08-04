'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { toDateKey } from '@/lib/date';
import type { DayTotal } from '@/lib/nutrition';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function statusColor(day: DayTotal | undefined, target: number): string | null {
  if (!day || day.calories <= 0) return null;
  if (day.calories > target * 1.15) return 'var(--viz-critical)';
  if (day.calories < target * 0.5) return 'var(--viz-warning)';
  return 'var(--viz-good)';
}

export default function HistoryCalendar({
  byDay,
  target,
  selected,
  onSelect,
}: {
  byDay: Map<string, DayTotal>;
  target: number;
  selected: string;
  onSelect: (key: string) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const [y, m] = selected.split('-').map(Number);
    return new Date(y, m - 1, 1);
  });

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
          aria-label="前の月"
        >
          ‹
        </button>
        <p className="text-sm font-bold text-text">
          {cursor.getFullYear()}年 {cursor.getMonth() + 1}月
        </p>
        <button
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-text/5 text-sm text-text-muted"
          aria-label="次の月"
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
          const day = byDay.get(key);
          const isSelected = key === selected;
          const isToday = key === todayKeyStr;
          const color = statusColor(day, target);
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={clsx(
                'relative mx-auto flex h-8 w-8 flex-col items-center justify-center rounded-full text-xs',
                isSelected ? 'brand-fill font-bold' : isToday ? 'border border-brand/60 text-text' : 'text-text-muted'
              )}
            >
              {date.getDate()}
              {color && !isSelected && (
                <span className="absolute -bottom-1 h-1.5 w-1.5 rounded-full" style={{ background: color }} />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-center gap-3 border-t border-border pt-3 text-[10px] text-text-faint">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--viz-good)' }} />
          適正
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--viz-critical)' }} />
          食べ過ぎ
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--viz-warning)' }} />
          食べなかった
        </span>
      </div>
    </div>
  );
}
