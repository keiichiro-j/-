'use client';

import { useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import HistoryCalendar from '@/components/HistoryCalendar';
import Modal from '@/components/Modal';
import MealForm from '@/components/MealForm';
import { useMeals, useSettings } from '@/lib/hooks';
import * as db from '@/lib/db';
import { formatDateJa, todayKey } from '@/lib/date';
import { totalsByDay } from '@/lib/nutrition';
import { MEAL_ICON, MEAL_LABEL, MEAL_TAG_VARS, mealTotals, type MealEntry, type MealType } from '@/lib/types';

export default function HistoryPage() {
  const { meals, loading, error, refresh } = useMeals();
  const { settings } = useSettings();
  const [selected, setSelected] = useState(todayKey());
  const [formState, setFormState] = useState<{ mealType: MealType; entry?: MealEntry } | null>(null);

  const byDay = useMemo(() => totalsByDay(meals), [meals]);
  const selectedMeals = useMemo(
    () => meals.filter((m) => m.date === selected).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [meals, selected]
  );
  const selectedTotals = useMemo(() => mealTotals(selectedMeals.flatMap((m) => m.items)), [selectedMeals]);

  const handleDelete = async (entry: MealEntry) => {
    await db.deleteMeal(entry.id);
    setFormState(null);
    refresh();
  };

  return (
    <div>
      <PageHeader eyebrow="History" title="履歴" subtitle={`累計 ${meals.length}件の記録`} />

      {error && (
        <div className="mx-5 mb-3 rounded-lg border border-danger-border bg-danger-bg px-3 py-2.5 text-xs text-danger-text">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-4 px-5 pb-8">
        {loading ? (
          <div className="glass-card h-80 animate-pulse rounded-xl" />
        ) : (
          <>
            <HistoryCalendar byDay={byDay} target={settings.targetCalories} selected={selected} onSelect={setSelected} />

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-text-muted">{formatDateJa(selected)}</p>
                <p className="text-xs font-semibold text-text">
                  {selectedTotals.calories} / {settings.targetCalories} kcal
                </p>
              </div>

              {selectedMeals.length === 0 ? (
                <button
                  onClick={() => setFormState({ mealType: 'breakfast' })}
                  className="w-full rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-text-faint"
                >
                  この日の記録はありません。タップして追加
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  {selectedMeals.map((meal) => {
                    const t = mealTotals(meal.items);
                    const tag = MEAL_TAG_VARS[meal.mealType];
                    return (
                      <button
                        key={meal.id}
                        onClick={() => setFormState({ mealType: meal.mealType, entry: meal })}
                        className="glass-card flex items-center gap-3 rounded-lg p-2.5 text-left"
                      >
                        {meal.photoDataUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={meal.photoDataUrl}
                            alt={MEAL_LABEL[meal.mealType]}
                            className="h-12 w-12 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <div
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-lg"
                            style={{ background: tag.bg, color: tag.text }}
                          >
                            {MEAL_ICON[meal.mealType]}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="tag-chip mb-1" style={{ background: tag.bg, color: tag.text }}>
                            {MEAL_LABEL[meal.mealType]}
                          </span>
                          <p className="truncate text-sm font-semibold text-text">
                            {meal.items.map((i) => i.name).join('・') || '(品目未入力)'}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-bold text-text">{t.calories} kcal</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <Modal
        open={!!formState}
        onClose={() => setFormState(null)}
        title={formState ? `${MEAL_LABEL[formState.mealType]}を記録` : ''}
      >
        {formState && (
          <MealForm
            key={formState.entry?.id ?? `${formState.mealType}-${selected}`}
            initial={formState.entry}
            defaultMealType={formState.mealType}
            defaultDate={selected}
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
