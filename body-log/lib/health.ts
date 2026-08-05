export type BmiCategoryKey = 'low' | 'normal' | 'obese1' | 'obese2';

export interface BmiCategory {
  key: BmiCategoryKey;
  label: string;
  colorVar: string;
  textVar: string;
}

export function computeBmi(weightKg: number, heightCm: number): number | null {
  if (!weightKg || !heightCm || weightKg <= 0 || heightCm <= 0) return null;
  const h = heightCm / 100;
  return weightKg / (h * h);
}

export function bmiCategory(bmi: number): BmiCategory {
  if (bmi < 18.5) {
    return { key: 'low', label: '低体重', colorVar: 'var(--tag-breakfast-bg)', textVar: 'var(--tag-breakfast-text)' };
  }
  if (bmi < 25) {
    return { key: 'normal', label: '標準体重', colorVar: 'var(--viz-good)', textVar: '#ffffff' };
  }
  if (bmi < 30) {
    return { key: 'obese1', label: '肥満(1度)', colorVar: 'var(--tag-lunch-bg)', textVar: 'var(--tag-lunch-text)' };
  }
  return { key: 'obese2', label: '肥満(2度以上)', colorVar: 'var(--tag-dinner-bg)', textVar: 'var(--tag-dinner-text)' };
}

export interface IdealWeightRange {
  min: number;
  max: number;
  standard: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function idealWeightRange(heightCm: number): IdealWeightRange | null {
  if (!heightCm || heightCm <= 0) return null;
  const h = heightCm / 100;
  return {
    min: round1(18.5 * h * h),
    max: round1(25 * h * h),
    standard: round1(22 * h * h),
  };
}

export type MascotVariant = BmiCategoryKey | 'noData';

export function mascotVariant(bmi: number | null): MascotVariant {
  if (bmi === null) return 'noData';
  return bmiCategory(bmi).key;
}
