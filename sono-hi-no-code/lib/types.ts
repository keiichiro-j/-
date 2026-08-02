export type ClothingCategory =
  | 'tops'
  | 'bottoms'
  | 'outer'
  | 'shoes'
  | 'accessory';

export const CATEGORY_LABEL: Record<ClothingCategory, string> = {
  tops: 'トップス',
  bottoms: 'ボトムス',
  outer: 'アウター',
  shoes: '靴',
  accessory: '小物',
};

export type ClothingStatus = 'active' | 'cleaning' | 'retired';

export const STATUS_LABEL: Record<ClothingStatus, string> = {
  active: '着用中',
  cleaning: 'クリーニング中',
  retired: '処分予定',
};

export type Season = 'spring' | 'summer' | 'autumn' | 'winter' | 'all';

export const SEASON_LABEL: Record<Season, string> = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬',
  all: '通年',
};

export type ConditionLevel = 'new' | 'good' | 'fair' | 'worn';

export const CONDITION_LABEL: Record<ConditionLevel, string> = {
  new: '新品・未使用',
  good: '良好',
  fair: '使用感あり',
  worn: 'かなり使用感あり',
};

export type BrandTier = 'luxury' | 'mid' | 'fast';

export const BRAND_TIER_LABEL: Record<BrandTier, string> = {
  luxury: 'ハイブランド',
  mid: '中価格帯ブランド',
  fast: 'ファストファッション',
};

export type Tpo =
  | 'work'
  | 'casual'
  | 'date'
  | 'formal'
  | 'sport'
  | 'home';

export const TPO_LABEL: Record<Tpo, string> = {
  work: '仕事',
  casual: 'カジュアル外出',
  date: 'デート',
  formal: 'フォーマル',
  sport: 'スポーツ・アクティブ',
  home: '在宅',
};

export interface ClothingItem {
  id: string;
  name: string;
  category: ClothingCategory;
  color: string;
  season: Season;
  material?: string;
  purchasedAt?: string;
  status: ClothingStatus;
  imageDataUrl?: string;
  brandTier: BrandTier;
  condition: ConditionLevel;
  originalPrice?: number;
  createdAt: string;
  lastWornAt?: string;
  wearCount: number;
  tpoTags?: Tpo[];
}

export interface Outfit {
  id: string;
  date: string;
  itemIds: string[];
  tpo: Tpo;
  weatherSummary?: string;
  reason: string;
  feedback?: 'good' | 'meh' | null;
  isFavorite: boolean;
  createdAt: string;
}

export type PersonalColorSeason = 'spring' | 'summer' | 'autumn' | 'winter';

export const PERSONAL_COLOR_LABEL: Record<PersonalColorSeason, string> = {
  spring: 'スプリング（明るく暖かい色系）',
  summer: 'サマー（柔らかく涼しい色系）',
  autumn: 'オータム（深みのある暖かい色系）',
  winter: 'ウィンター（クリアで鮮やかな色系）',
};

export interface UserProfile {
  heightCm?: number;
  weightKg?: number;
  gender?: 'male' | 'female' | 'other' | 'unspecified';
  faceImageDataUrl?: string;
  personalColor?: PersonalColorSeason;
  silhouetteNote?: string;
  homeLat?: number;
  homeLon?: number;
  homeLabel?: string;
  updatedAt?: string;
}

export interface WeatherInfo {
  temperature: number;
  precipitationProbability: number;
  weatherCode: number;
  description: string;
  isRain: boolean;
  minTemp: number;
  maxTemp: number;
}

export interface OutfitSuggestion {
  itemIds: string[];
  reason: string;
  score: number;
}
