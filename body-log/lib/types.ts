export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export const MEAL_LABEL: Record<MealType, string> = {
  breakfast: '朝食',
  lunch: '昼食',
  dinner: '夕食',
  snack: '間食',
};

export const MEAL_ICON: Record<MealType, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍪',
};

export interface FoodItem {
  id: string;
  name: string;
  amount: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface MealEntry {
  id: string;
  date: string; // YYYY-MM-DD
  mealType: MealType;
  photoDataUrl?: string;
  items: FoodItem[];
  memo?: string;
  analyzedByAi: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WeightEntry {
  id: string;
  date: string; // YYYY-MM-DD
  weightKg: number;
  bodyFatPercent?: number;
  createdAt: string;
}

export interface Settings {
  targetCalories: number;
  targetProtein: number;
  targetFat: number;
  targetCarbs: number;
  targetWeightKg?: number;
}

export const DEFAULT_SETTINGS: Settings = {
  targetCalories: 2000,
  targetProtein: 90,
  targetFat: 55,
  targetCarbs: 250,
};

export interface BackupData {
  meals: MealEntry[];
  weights: WeightEntry[];
  settings: Settings;
  exportedAt: string;
}

export function mealTotals(items: FoodItem[]): {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
} {
  return items.reduce(
    (acc, item) => ({
      calories: acc.calories + (Number.isFinite(item.calories) ? item.calories : 0),
      protein: acc.protein + (Number.isFinite(item.protein) ? item.protein : 0),
      fat: acc.fat + (Number.isFinite(item.fat) ? item.fat : 0),
      carbs: acc.carbs + (Number.isFinite(item.carbs) ? item.carbs : 0),
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );
}
