'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import MealForm from '@/components/MealForm';
import PfcBar from '@/components/PfcBar';
import { useMeals, useSettings } from '@/lib/hooks';
import * as db from '@/lib/db';
import { formatDateJa, todayKey } from '@/lib/date';
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
  const [formState, setFormState] = useState<{ mealType: MealType; entry?: MealEntry } | null>(null);

  const today = todayKey();
  const todaysMeals = useMemo(() => meals.filter((m) => m.date === today), [meals, today]);

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
      <PageHeader eyebrow="Today" title={formatDateJa(today)} subtitle="今日の食事を記録しましょう" />

      <div className="px-5 pb-4">
        <div className="glass-card animate-fade-up rounded-xl p-4">
          <div className="mb-2 flex items-end justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">摂取カロリー</p>
              <p className="font-display text-4xl font-bold text-text">
                {totals.calories}
                <span className="ml-1 font-sans text-sm font-medium text-text-faint">
                  / {settings.targetCalories} kcal
                </span>
              </p>
            </div>
            <p className={clsx('text-xs font-semibold', over ? 'text-danger-text' : 'text-brand')}>
              {over ? `+${-diff} kcal 超過` : `残り ${diff} kcal`}
            </p>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-text/5">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progressPct}%`,
                background: over ? 'var(--viz-critical)' : 'var(--brand)',
              }}
            />
          </div>
          <div className="mt-4 border-t border-border pt-3">
            <PfcBar protein={totals.protein} fat={totals.fat} carbs={totals.carbs} />
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-5 mb-3 rounded-lg border border-danger-border bg-danger-bg px-3 py-2.5 text-xs text-danger-text">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 px-5 pb-8">
        {loading
          ? MEAL_TYPES.map((mt) => (
              <div key={mt} className="glass-card h-32 animate-pulse rounded-xl" />
            ))
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
                  <div className="relative h-20 w-full">
                    {primary?.photoDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={primary.photoDataUrl} alt={MEAL_LABEL[mt]} className="h-full w-full object-cover" />
                    ) : (
                      <div
                        className="flex h-full w-full items-center justify-center text-2xl"
                        style={{ background: tag.bg, color: tag.text }}
                      >
                        {MEAL_ICON[mt]}
                      </div>
                    )}
                    <span
                      className="tag-chip absolute left-2 top-2"
                      style={{ background: tag.bg, color: tag.text }}
                    >
                      {MEAL_LABEL[mt]}
                    </span>
                  </div>
                  <div className="p-2.5">
                    {entries.length > 0 ? (
                      <p className="text-sm font-bold text-text">
                        {slotTotals.calories} kcal
                        {entries.length > 1 && (
                          <span className="ml-1 text-[10px] font-medium text-text-faint">{entries.length}件</span>
                        )}
                      </p>
                    ) : (
                      <p className="text-sm font-semibold text-brand">＋ 記録する</p>
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
