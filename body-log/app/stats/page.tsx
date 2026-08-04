'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import PageHeader from '@/components/PageHeader';
import CalorieBarChart from '@/components/CalorieBarChart';
import PfcPieChart from '@/components/PfcPieChart';
import WeightLineChart from '@/components/WeightLineChart';
import { useMeals, useSettings, useWeights } from '@/lib/hooks';
import { formatMonthDayShort } from '@/lib/date';
import { lastNDays, monthBuckets, totalsByDay, weekBuckets } from '@/lib/nutrition';
import { mealTotals } from '@/lib/types';

type Period = 'day' | 'week' | 'month';

const PERIOD_LABEL: Record<Period, string> = { day: '日別', week: '週別', month: '月別' };

export default function StatsPage() {
  const { meals, loading } = useMeals();
  const { weights } = useWeights();
  const { settings } = useSettings();
  const [period, setPeriod] = useState<Period>('day');

  const byDay = useMemo(() => totalsByDay(meals), [meals]);

  const barPoints = useMemo(() => {
    if (period === 'day') {
      return lastNDays(14).map((d) => ({
        label: formatMonthDayShort(d),
        calories: byDay.get(d)?.calories ?? 0,
      }));
    }
    if (period === 'week') {
      return weekBuckets(meals, 8).map((b) => ({ label: b.label, calories: b.total.calories }));
    }
    return monthBuckets(meals, 6).map((b) => ({ label: b.label, calories: b.total.calories }));
  }, [period, byDay, meals]);

  const target = period === 'day' ? settings.targetCalories : period === 'week' ? settings.targetCalories * 7 : settings.targetCalories * 30;

  const rangeDays = period === 'day' ? 14 : period === 'week' ? 56 : 180;
  const periodItems = useMemo(() => {
    const cutoff = lastNDays(rangeDays)[0];
    return meals.filter((m) => m.date >= cutoff).flatMap((m) => m.items);
  }, [meals, rangeDays]);
  const pfcTotals = useMemo(() => mealTotals(periodItems), [periodItems]);

  const avgDiff = useMemo(() => {
    const withData = barPoints.filter((p) => p.calories > 0);
    if (withData.length === 0) return 0;
    const avg = withData.reduce((sum, p) => sum + p.calories, 0) / withData.length;
    return Math.round(target - avg);
  }, [barPoints, target]);

  const weightPoints = useMemo(() => {
    const cutoff = lastNDays(rangeDays)[0];
    return weights
      .filter((w) => w.date >= cutoff)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((w) => ({ label: formatMonthDayShort(w.date), weightKg: w.weightKg }));
  }, [weights, rangeDays]);

  return (
    <div>
      <PageHeader eyebrow="Stats" title="グラフ・統計" subtitle="食事と体重の推移を振り返りましょう" />

      <div className="flex gap-2 px-5 pb-4">
        {(['day', 'week', 'month'] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={clsx(
              'flex-1 rounded-xl py-2 text-xs font-bold transition-colors',
              period === p ? 'brand-fill' : 'border border-border bg-text/5 text-text-muted'
            )}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mx-5 flex flex-col gap-3">
          <div className="glass-card h-52 animate-pulse rounded-xl" />
          <div className="glass-card h-32 animate-pulse rounded-xl" />
        </div>
      ) : (
        <div className="flex flex-col gap-4 px-5 pb-8">
          <div className="glass-card animate-fade-up rounded-xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-text">カロリー推移</p>
              <p className={clsx('text-xs font-semibold', avgDiff < 0 ? 'text-danger-text' : 'text-brand')}>
                平均 {avgDiff < 0 ? `+${-avgDiff}` : `-${avgDiff}`} kcal / 目標比
              </p>
            </div>
            <CalorieBarChart points={barPoints} target={target} />
          </div>

          <div className="glass-card animate-fade-up rounded-xl p-4">
            <p className="mb-3 text-sm font-bold text-text">PFCバランス</p>
            <PfcPieChart protein={pfcTotals.protein} fat={pfcTotals.fat} carbs={pfcTotals.carbs} />
          </div>

          <div className="glass-card animate-fade-up rounded-xl p-4">
            <p className="mb-3 text-sm font-bold text-text">体重の推移</p>
            <WeightLineChart points={weightPoints} />
            <p className="mt-2 text-[11px] text-text-faint">
              設定画面から体重を記録すると、カロリー収支との相関がここに表示されます。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
