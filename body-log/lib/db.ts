import { createStore, get, set, del, keys } from 'idb-keyval';
import type { BackupData, MealEntry, Settings, WeightEntry } from './types';
import { DEFAULT_SETTINGS } from './types';

// Each store gets its own database: idb-keyval's createStore() only creates
// the single object store it's given during that database's upgrade, so
// reusing one database name across multiple createStore() calls leaves the
// later stores missing (NotFoundError on transaction).
const mealStore =
  typeof window !== 'undefined' ? createStore('body-log-meals', 'meals') : undefined;
const weightStore =
  typeof window !== 'undefined' ? createStore('body-log-weights', 'weights') : undefined;
const settingsStore =
  typeof window !== 'undefined' ? createStore('body-log-settings', 'settings') : undefined;

const SETTINGS_KEY = 'settings';

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function listMeals(): Promise<MealEntry[]> {
  if (!mealStore) return [];
  const ks = await keys(mealStore);
  const items = await Promise.all(ks.map((k) => get<MealEntry>(k, mealStore)));
  return items
    .filter((i): i is MealEntry => Boolean(i))
    .sort((a, b) => b.date.localeCompare(a.date) || a.createdAt.localeCompare(b.createdAt));
}

export async function saveMeal(
  meal: Omit<MealEntry, 'id' | 'createdAt' | 'updatedAt'> &
    Partial<Pick<MealEntry, 'id' | 'createdAt'>>
): Promise<MealEntry> {
  if (!mealStore) throw new Error('storage unavailable');
  const now = new Date().toISOString();
  const full: MealEntry = {
    ...meal,
    id: meal.id ?? genId(),
    createdAt: meal.createdAt ?? now,
    updatedAt: now,
  };
  await set(full.id, full, mealStore);
  return full;
}

export async function deleteMeal(id: string): Promise<void> {
  if (!mealStore) return;
  await del(id, mealStore);
}

export async function listWeights(): Promise<WeightEntry[]> {
  if (!weightStore) return [];
  const ks = await keys(weightStore);
  const items = await Promise.all(ks.map((k) => get<WeightEntry>(k, weightStore)));
  return items.filter((i): i is WeightEntry => Boolean(i)).sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveWeight(
  entry: Omit<WeightEntry, 'id' | 'createdAt'> & Partial<Pick<WeightEntry, 'id' | 'createdAt'>>
): Promise<WeightEntry> {
  if (!weightStore) throw new Error('storage unavailable');
  const full: WeightEntry = {
    ...entry,
    id: entry.id ?? genId(),
    createdAt: entry.createdAt ?? new Date().toISOString(),
  };
  await set(full.id, full, weightStore);
  return full;
}

export async function deleteWeight(id: string): Promise<void> {
  if (!weightStore) return;
  await del(id, weightStore);
}

export async function getSettings(): Promise<Settings> {
  if (!settingsStore) return DEFAULT_SETTINGS;
  const stored = await get<Settings>(SETTINGS_KEY, settingsStore);
  return stored ? { ...DEFAULT_SETTINGS, ...stored } : DEFAULT_SETTINGS;
}

export async function saveSettings(settings: Settings): Promise<void> {
  if (!settingsStore) return;
  await set(SETTINGS_KEY, settings, settingsStore);
}

export async function exportBackup(): Promise<BackupData> {
  const [meals, weights, settings] = await Promise.all([listMeals(), listWeights(), getSettings()]);
  return { meals, weights, settings, exportedAt: new Date().toISOString() };
}

export async function importBackup(data: BackupData): Promise<void> {
  if (!mealStore || !weightStore) return;
  await Promise.all([
    ...data.meals.map((m) => set(m.id, m, mealStore)),
    ...data.weights.map((w) => set(w.id, w, weightStore)),
  ]);
  if (data.settings) await saveSettings(data.settings);
}
