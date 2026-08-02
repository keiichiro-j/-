import type { BrandTier, ClothingCategory, ClothingItem, ConditionLevel } from './types';

const CATEGORY_BASELINE: Record<ClothingCategory, number> = {
  tops: 4000,
  bottoms: 6000,
  outer: 13000,
  shoes: 9000,
  accessory: 3500,
};

const BRAND_MULTIPLIER: Record<BrandTier, number> = {
  luxury: 2.4,
  mid: 1.1,
  fast: 0.45,
};

const CONDITION_MULTIPLIER: Record<ConditionLevel, number> = {
  new: 0.75,
  good: 0.5,
  fair: 0.32,
  worn: 0.15,
};

/**
 * あくまで概算。実際のフリマ相場APIが無いため、カテゴリ・ブランド帯・状態から
 * 統計的な相場感をシミュレートしている（企画書 6章の代替案に対応）。
 */
export function estimateResaleValue(item: ClothingItem): number {
  const conditionMultiplier = CONDITION_MULTIPLIER[item.condition];
  const brandMultiplier = BRAND_MULTIPLIER[item.brandTier];

  if (item.originalPrice && item.originalPrice > 0) {
    const fromOriginal = item.originalPrice * conditionMultiplier * (brandMultiplier / 1.1);
    const fromBaseline = CATEGORY_BASELINE[item.category] * brandMultiplier * conditionMultiplier;
    return Math.round(((fromOriginal * 2 + fromBaseline) / 3) / 100) * 100;
  }

  const base = CATEGORY_BASELINE[item.category] * brandMultiplier * conditionMultiplier;
  return Math.round(base / 100) * 100;
}

export function totalAssetValue(items: ClothingItem[]): number {
  return items
    .filter((i) => i.status !== 'retired')
    .reduce((sum, i) => sum + estimateResaleValue(i), 0);
}

export function assetBreakdownByCategory(
  items: ClothingItem[]
): { category: ClothingCategory; value: number; count: number }[] {
  const map = new Map<ClothingCategory, { value: number; count: number }>();
  for (const item of items) {
    if (item.status === 'retired') continue;
    const entry = map.get(item.category) ?? { value: 0, count: 0 };
    entry.value += estimateResaleValue(item);
    entry.count += 1;
    map.set(item.category, entry);
  }
  return Array.from(map.entries())
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.value - a.value);
}
