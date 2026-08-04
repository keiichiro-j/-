import { addDays, startOfWeek, toDateKey } from './date';
import type { MealEntry, WeightEntry } from './types';
import { mealTotals } from './types';

export interface DayTotal {
  date: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  mealCount: number;
}

export function totalsByDay(meals: MealEntry[]): Map<string, DayTotal> {
  const map = new Map<string, DayTotal>();
  for (const meal of meals) {
    const t = mealTotals(meal.items);
    const existing = map.get(meal.date);
    if (existing) {
      existing.calories += t.calories;
      existing.protein += t.protein;
      existing.fat += t.fat;
      existing.carbs += t.carbs;
      existing.mealCount += 1;
    } else {
      map.set(meal.date, { date: meal.date, ...t, mealCount: 1 });
    }
  }
  return map;
}

export function lastNDays(n: number, endKey: string = toDateKey(new Date())): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(endKey, -i));
  return out;
}

export function weekBuckets(meals: MealEntry[], weeks: number): { label: string; total: DayTotal }[] {
  const byDay = totalsByDay(meals);
  const thisWeekStart = startOfWeek(toDateKey(new Date()));
  const buckets: { label: string; total: DayTotal }[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const weekStart = addDays(thisWeekStart, -7 * w);
    const acc: DayTotal = { date: weekStart, calories: 0, protein: 0, fat: 0, carbs: 0, mealCount: 0 };
    for (let d = 0; d < 7; d++) {
      const day = byDay.get(addDays(weekStart, d));
      if (day) {
        acc.calories += day.calories;
        acc.protein += day.protein;
        acc.fat += day.fat;
        acc.carbs += day.carbs;
        acc.mealCount += day.mealCount;
      }
    }
    const [, m, dd] = weekStart.split('-');
    buckets.push({ label: `${Number(m)}/${Number(dd)}〜`, total: acc });
  }
  return buckets;
}

export function monthBuckets(meals: MealEntry[], months: number): { label: string; total: DayTotal }[] {
  const byDay = totalsByDay(meals);
  const now = new Date();
  const buckets: { label: string; total: DayTotal }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const acc: DayTotal = { date: `${y}-${String(m + 1).padStart(2, '0')}`, calories: 0, protein: 0, fat: 0, carbs: 0, mealCount: 0 };
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const key = toDateKey(new Date(y, m, day));
      const total = byDay.get(key);
      if (total) {
        acc.calories += total.calories;
        acc.protein += total.protein;
        acc.fat += total.fat;
        acc.carbs += total.carbs;
        acc.mealCount += total.mealCount;
      }
    }
    buckets.push({ label: `${m + 1}月`, total: acc });
  }
  return buckets;
}

export function weightForDate(weights: WeightEntry[], dateKey: string): WeightEntry | undefined {
  // Most recent weight entry on or before dateKey (weights aren't logged daily).
  let best: WeightEntry | undefined;
  for (const w of weights) {
    if (w.date <= dateKey && (!best || w.date > best.date)) best = w;
  }
  return best;
}
