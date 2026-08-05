'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import MealForm from '@/components/MealForm';
import Mascot, { MASCOT_META } from '@/components/Mascot';
import { useMeals, useSettings, useWeights } from '@/lib/hooks';
import * as db from '@/lib/db';
import { formatDateJa, todayKey } from '@/lib/date';
import { bmiCategory, computeBmi, mascotVariant } from '@/lib/health';
import {
  MEAL_ICON,
  MEAL_LABEL,
  MEAL_TAG_VARS,
  MEAL_TYPES,
  mealTotals,
  type MealEntry,
  type MealType,
} from '@/lib/types';

export default function HomePage() {
  const { meals, loading, error, refresh } = useMeals();
  const { settings } = useSettings();
  const { weights } = useWeights();
  const [formState, setFormState] = useState<{ mealType: MealType; entry?: MealEntry } | null>(null);

  const today = todayKey();
  const todaysMeals = useMemo(() => meals.filter((m) => m.date === today), [meals, today]);

  const latestWeight = weights[0];
  const bmi = useMemo(
    () => (latestWeight && settings.heightCm ? computeBmi(latestWeight.weightKg, settings.heightCm) : null),
    [latestWeight, settings.heightCm]
  );
  const variant = mascotVariant(bmi);

  const entriesByType = useMemo(() => {
    const map = new Map<MealType, MealEntry[]>();
    for (const mt of MEAL_TYPES) map.set(mt, []);
    for (const meal of todaysMeals) map.get(meal.mealType)?.push(meal);
    return map;
  }, [todaysMeals]);

  const totals = useMemo(() => mealTotals(todaysMeals.flatMap((m) => m.items)), [todaysMeals]);
  const diff = settings.targetCalories - totals.calories;
  const progressPct = Math.min(100, (totals.calories / Math.max(1, settings.targetCalories)) * 100);
  const over = diff < 0;

  const handleDelete = async (entry: MealEntry) => {
    await db.deleteMeal(entry.id);
    setFormState(null);
    refresh();
  };

  return (
    <div>
      <PageHeader eyebrow="Today" title={formatDateJa(today)} />

      <div className="px-5 pb-3">
        <Link
          href="/settings"
          className="glass-card animate-fade-up flex flex-col items-center overflow-hidden rounded-2xl px-4 pb-4 pt-2 text-center"
        >
          <Mascot variant={variant} size={148} />
          <p className="font-display -mt-1 text-lg font-bold text-text">{MASCOT_META[variant].title}</p>
          <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-text-muted">
            {MASCOT_META[variant].message}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-text-faint">
            {latestWeight && <span>体重 {latestWeight.weightKg}kg</span>}
            {settings.heightCm && <span>身長 {settings.heightCm}cm</span>}
            {bmi !== null && (
              <span
                className="tag-chip"
                style={{ background: bmiCategory(bmi).colorVar, color: bmiCategory(bmi).textVar }}
              >
                BMI {bmi.toFixed(1)}
              </span>
            )}
          </div>
        </Link>
      </div>

      <div className="px-5 pb-3">
        <div className="glass-card animate-fade-up rounded-xl p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-semibold text-text-muted">
              摂取カロリー
              <span className="ml-1.5 font-display text-base font-bold text-text">{totals.calories}</span>
              <span className="ml-0.5 text-[11px] text-text-faint">/ {settings.targetCalories} kcal</span>
            </p>
            <p className={clsx('text-[11px] font-semibold', over ? 'text-danger-text' : 'text-brand')}>
              {over ? `+${-diff} kcal 超過` : `残り ${diff} kcal`}
            </p>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-text/5">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progressPct}%`,
                background: over ? 'var(--viz-critical)' : 'var(--brand)',
              }}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-5 mb-3 rounded-lg border border-danger-border bg-danger-bg px-3 py-2.5 text-xs text-danger-text">
          {error}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 px-5 pb-6">
        {loading
          ? MEAL_TYPES.map((mt) => <div key={mt} className="glass-card h-24 animate-pulse rounded-xl" />)
          : MEAL_TYPES.map((mt) => {
              const entries = entriesByType.get(mt) ?? [];
              const slotTotals = mealTotals(entries.flatMap((e) => e.items));
              const primary = entries[0];
              const tag = MEAL_TAG_VARS[mt];
              return (
                <button
                  key={mt}
                  onClick={() => setFormState({ mealType: mt, entry: primary })}
                  className="glass-card animate-pop-in flex flex-col overflow-hidden rounded-xl text-left"
                >
                  <div className="relative h-12 w-full">
                    {primary?.photoDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={primary.photoDataUrl} alt={MEAL_LABEL[mt]} className="h-full w-full object-cover" />
                    ) : (
                      <div
                        className="flex h-full w-full items-center justify-center text-base"
                        style={{ background: tag.bg, color: tag.text }}
                      >
                        {MEAL_ICON[mt]}
                      </div>
                    )}
                  </div>
                  <div className="px-1.5 py-1.5 text-center">
                    <p className="truncate text-[10px] font-semibold text-text-muted">{MEAL_LABEL[mt]}</p>
                    {entries.length > 0 ? (
                      <p className="text-[11px] font-bold text-text">{slotTotals.calories}kcal</p>
                    ) : (
                      <p className="text-[11px] font-semibold text-brand">＋記録</p>
                    )}
                  </div>
                </button>
              );
            })}
      </div>

      <Modal
        open={!!formState}
        onClose={() => setFormState(null)}
        title={formState ? `${MEAL_LABEL[formState.mealType]}を記録` : ''}
      >
        {formState && (
          <MealForm
            key={formState.entry?.id ?? formState.mealType}
            initial={formState.entry}
            defaultMealType={formState.mealType}
            defaultDate={today}
            onSaved={() => {
              setFormState(null);
              refresh();
            }}
            onDelete={formState.entry ? () => handleDelete(formState.entry as MealEntry) : undefined}
          />
        )}
      </Modal>
    </div>
  );
}
