import type {
  ClothingItem,
  Outfit,
  Season,
  Tpo,
  UserProfile,
  WeatherInfo,
  OutfitSuggestion,
} from './types';
import { TPO_LABEL } from './types';

function seasonsForTemp(maxTemp: number): Season[] {
  if (maxTemp >= 27) return ['summer', 'all'];
  if (maxTemp >= 21) return ['summer', 'spring', 'all'];
  if (maxTemp >= 14) return ['spring', 'autumn', 'all'];
  if (maxTemp >= 8) return ['autumn', 'winter', 'all'];
  return ['winter', 'all'];
}

const PERSONAL_COLOR_KEYWORDS: Record<string, string[]> = {
  spring: ['オレンジ', 'コーラル', 'ベージュ', 'アイボリー', '黄', 'イエロー', 'ライトグリーン'],
  summer: ['ラベンダー', '水色', 'サックス', 'ピンク', 'グレー', 'パステル'],
  autumn: ['カーキ', 'ブラウン', '茶', 'マスタード', 'テラコッタ', 'キャメル', 'ダークグリーン'],
  winter: ['黒', 'ブラック', '白', 'ホワイト', '赤', 'レッド', 'ネイビー', 'シルバー'],
};

function daysAgo(dateStr: string): number {
  const diff = Date.now() - new Date(dateStr).getTime();
  return diff / (1000 * 60 * 60 * 24);
}

interface FeedbackStat {
  good: number;
  meh: number;
}

function buildFeedbackStats(history: Outfit[]): Map<string, FeedbackStat> {
  const map = new Map<string, FeedbackStat>();
  for (const outfit of history) {
    if (!outfit.feedback) continue;
    for (const itemId of outfit.itemIds) {
      const stat = map.get(itemId) ?? { good: 0, meh: 0 };
      if (outfit.feedback === 'good') stat.good += 1;
      else stat.meh += 1;
      map.set(itemId, stat);
    }
  }
  return map;
}

function recentlyWornSet(history: Outfit[], withinDays: number): Set<string> {
  const set = new Set<string>();
  for (const outfit of history) {
    if (daysAgo(outfit.date) <= withinDays) {
      outfit.itemIds.forEach((id) => set.add(id));
    }
  }
  return set;
}

function scoreItem(
  item: ClothingItem,
  ctx: {
    tpo: Tpo;
    okSeasons: Season[];
    recentlyWorn: Set<string>;
    feedbackStats: Map<string, FeedbackStat>;
    profile?: UserProfile;
  }
): number {
  let score = 10;

  if (!ctx.okSeasons.includes(item.season)) score -= 6;
  else score += 3;

  if (item.tpoTags && item.tpoTags.length > 0) {
    score += item.tpoTags.includes(ctx.tpo) ? 6 : -5;
  }

  if (ctx.recentlyWorn.has(item.id)) score -= 5;

  const stat = ctx.feedbackStats.get(item.id);
  if (stat) score += stat.good * 2 - stat.meh * 3;

  if (ctx.profile?.personalColor) {
    const keywords = PERSONAL_COLOR_KEYWORDS[ctx.profile.personalColor] ?? [];
    if (keywords.some((k) => item.color.includes(k))) score += 3;
  }

  score += Math.random() * 2;
  return score;
}

function pickTop(
  items: ClothingItem[],
  n: number,
  used: Set<string>
): ClothingItem[] {
  return items.filter((i) => !used.has(i.id)).slice(0, n);
}

export interface SuggestParams {
  items: ClothingItem[];
  weather: WeatherInfo;
  tpo: Tpo;
  history: Outfit[];
  profile?: UserProfile;
  patternCount?: number;
}

export function generateSuggestions(params: SuggestParams): OutfitSuggestion[] {
  const { items, weather, tpo, history, profile } = params;
  const patternCount = params.patternCount ?? 3;

  const active = items.filter((i) => i.status === 'active');
  const okSeasons = seasonsForTemp(weather.maxTemp);
  const recentlyWorn = recentlyWornSet(history, 3);
  const feedbackStats = buildFeedbackStats(history);

  const ctx = { tpo, okSeasons, recentlyWorn, feedbackStats, profile };

  const byCategory = (cat: ClothingItem['category']) =>
    active
      .filter((i) => i.category === cat)
      .map((i) => ({ item: i, score: scoreItem(i, ctx) }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.item);

  const tops = byCategory('tops');
  const bottoms = byCategory('bottoms');
  const outers = byCategory('outer');
  const shoes = byCategory('shoes');
  const accessories = byCategory('accessory');

  if (tops.length === 0 || bottoms.length === 0) {
    return [];
  }

  const needsOuter = weather.maxTemp < 19 || weather.isRain;
  const usedTops = new Set<string>();
  const usedBottoms = new Set<string>();
  const results: OutfitSuggestion[] = [];

  for (let p = 0; p < patternCount; p++) {
    const topChoice = pickTop(tops, 1, usedTops)[0] ?? tops[p % tops.length];
    const bottomChoice =
      pickTop(bottoms, 1, usedBottoms)[0] ?? bottoms[p % bottoms.length];
    usedTops.add(topChoice.id);
    usedBottoms.add(bottomChoice.id);

    const itemIds = [topChoice.id, bottomChoice.id];
    const reasonParts: string[] = [];

    reasonParts.push(
      `気温${Math.round(weather.minTemp)}〜${Math.round(weather.maxTemp)}℃・${weather.description}のため「${topChoice.name}」×「${bottomChoice.name}」を選択`
    );

    if (needsOuter && outers[p % Math.max(outers.length, 1)]) {
      const outer = outers[p % outers.length];
      itemIds.push(outer.id);
      reasonParts.push(
        weather.isRain
          ? `降水確率${weather.precipitationProbability}%のため「${outer.name}」で雨対策`
          : `気温が下がるため「${outer.name}」で防寒`
      );
    }

    if (shoes[p % Math.max(shoes.length, 1)]) {
      const shoe = shoes[p % shoes.length];
      itemIds.push(shoe.id);
      reasonParts.push(`足元は「${shoe.name}」でTPOに合わせて調整`);
    }

    if (accessories.length > 0 && p < accessories.length) {
      const acc = accessories[p];
      itemIds.push(acc.id);
      reasonParts.push(`差し色に「${acc.name}」をプラス`);
    }

    reasonParts.push(`シーンは「${TPO_LABEL[tpo]}」を想定`);

    if (recentlyWorn.has(topChoice.id) || recentlyWorn.has(bottomChoice.id)) {
      reasonParts.push('直近で着用済みのアイテムを含みますが在庫の都合で再提案しています');
    } else {
      reasonParts.push('直近3日の着用履歴と重複しないよう調整');
    }

    if (profile?.personalColor) {
      reasonParts.push(
        `パーソナルカラー診断（簡易推定）を考慮した色味を優先`
      );
    }
    if (profile?.heightCm) {
      reasonParts.push(
        `身長${profile.heightCm}cmに合わせた着丈・シルエットバランスを意識`
      );
    }

    const avgScore =
      scoreItem(topChoice, ctx) + scoreItem(bottomChoice, ctx);

    results.push({
      itemIds,
      reason: reasonParts.join('。') + '。',
      score: avgScore,
    });
  }

  return results;
}
