import type {
  ClothingItem,
  Outfit,
  Season,
  Tpo,
  UserProfile,
  WeatherInfo,
  OutfitSuggestion,
} from './types';
import { STYLE_VIBE_LABEL, TPO_LABEL } from './types';

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

function itemSeasons(item: ClothingItem): Season[] {
  return item.season && item.season.length > 0 ? item.season : ['all'];
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

  if (!itemSeasons(item).some((s) => ctx.okSeasons.includes(s))) score -= 6;
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

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function matPrefix(item: ClothingItem): string {
  return item.material ? `${item.material}素材の` : '';
}

function brandPrefix(item: ClothingItem): string {
  return item.brand ? `${item.brand}の` : '';
}

function round(n: number): number {
  return Math.round(n);
}

type IntroTemplate = (top: ClothingItem, bottom: ClothingItem, weather: WeatherInfo) => string;

const INTRO_TEMPLATES: IntroTemplate[] = [
  (top, bottom, w) =>
    `気温${round(w.minTemp)}〜${round(w.maxTemp)}℃・${w.description}の予報。${matPrefix(
      top
    )}「${top.name}」に「${bottom.name}」を合わせた、季節感のある組み合わせです。`,
  (top, bottom, w) =>
    `${w.description}で過ごしやすい一日。${top.color}の「${top.name}」を主役に、「${bottom.name}」で全体のバランスを整えました。`,
  (top, bottom, w) =>
    `最高${round(w.maxTemp)}℃予想のため、${brandPrefix(
      top
    )}「${top.name}」×「${bottom.name}」で体温調整しやすいレイヤードに。`,
  (top, bottom, w) =>
    `${w.description}の日は、${matPrefix(bottom)}「${bottom.name}」に「${top.name}」を合わせて、動きやすさと見た目のバランスを両立させました。`,
  (top, bottom, w) =>
    `気温${round(w.minTemp)}〜${round(w.maxTemp)}℃想定。${top.color}×${bottom.color}の配色で「${top.name}」「${bottom.name}」を組み合わせました。`,
  (top, bottom, w) =>
    `${w.description}予報を踏まえ、${brandPrefix(bottom)}「${bottom.name}」に「${top.name}」を添えた、こなれた雰囲気の一着です。`,
];

const OUTER_RAIN_TEMPLATES: ((outer: ClothingItem, prob: number) => string)[] = [
  (outer, prob) => `降水確率${prob}%のため、「${outer.name}」で雨対策を万全に。`,
  (outer) => `雨予報なので「${outer.name}」を羽織って、足元や裾の跳ね返りにも配慮しました。`,
  (outer, prob) => `${prob}%の降水確率を踏まえ、${matPrefix(outer)}「${outer.name}」でしっかりガードします。`,
];

const OUTER_COLD_TEMPLATES: ((outer: ClothingItem) => string)[] = [
  (outer) => `気温が下がる予報のため「${outer.name}」で防寒しました。`,
  (outer) => `肌寒くなりそうなので、${matPrefix(outer)}「${outer.name}」をプラスして体温調整しやすく。`,
  (outer) => `冷え込み対策として${brandPrefix(outer)}「${outer.name}」を投入しています。`,
];

const SHOE_TEMPLATES: ((shoe: ClothingItem) => string)[] = [
  (shoe) => `足元は「${shoe.name}」でシーンに合わせて調整しました。`,
  (shoe) => `「${shoe.name}」で全体の印象を引き締めています。`,
  (shoe) => `歩きやすさも考慮して「${shoe.name}」をセレクトしました。`,
];

const ACCESSORY_TEMPLATES: ((acc: ClothingItem) => string)[] = [
  (acc) => `差し色に「${acc.name}」をプラスしました。`,
  (acc) => `「${acc.name}」で装いにアクセントを加えています。`,
  (acc) => `小物は「${acc.name}」でこなれ感を演出しました。`,
];

const TPO_TEMPLATES: ((label: string) => string)[] = [
  (label) => `シーンは「${label}」を想定した着こなしです。`,
  (label) => `「${label}」の場面にふさわしいバランスに整えました。`,
  (label) => `「${label}」でも浮かない、ちょうど良い塩梅を意識しています。`,
];

const RECENT_TEMPLATES: string[] = [
  '直近で着用済みのアイテムを含みますが、在庫の都合で再提案しています。',
  'ここ数日と近い組み合わせですが、他に候補が少ないため再度ご提案しています。',
];

const FRESH_TEMPLATES: string[] = [
  '直近3日の着用履歴とは重ならないよう選定しました。',
  'ここ数日着ていないアイテムを優先してピックアップしています。',
  '着用ローテーションを意識し、しばらく着ていない一着を選びました。',
];

const PERSONAL_COLOR_TEMPLATES: string[] = [
  'パーソナルカラー診断（簡易推定）に近い色味を優先しています。',
  '診断結果の色味との相性を考慮しました。',
];

const HEIGHT_TEMPLATES: ((h: number) => string)[] = [
  (h) => `身長${h}cmのバランスを踏まえた着丈感を意識しました。`,
  (h) => `身長${h}cmに合う着丈・シルエットを意識しています。`,
];

const STYLE_VIBE_TEMPLATES: ((label: string) => string)[] = [
  (label) => `設定中の世界観「${label}」の雰囲気に寄せた組み合わせです。`,
  (label) => `「${label}」らしさが出るよう、アイテムの選び方に反映しています。`,
];

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

  const intros = shuffle(INTRO_TEMPLATES);
  const outerTemplates = shuffle(weather.isRain ? OUTER_RAIN_TEMPLATES : OUTER_COLD_TEMPLATES);
  const shoeTemplates = shuffle(SHOE_TEMPLATES);
  const accTemplates = shuffle(ACCESSORY_TEMPLATES);
  const tpoTemplates = shuffle(TPO_TEMPLATES);
  const heightTemplates = shuffle(HEIGHT_TEMPLATES);
  const vibeTemplates = shuffle(STYLE_VIBE_TEMPLATES);

  for (let p = 0; p < patternCount; p++) {
    const topChoice = pickTop(tops, 1, usedTops)[0] ?? tops[p % tops.length];
    const bottomChoice =
      pickTop(bottoms, 1, usedBottoms)[0] ?? bottoms[p % bottoms.length];
    usedTops.add(topChoice.id);
    usedBottoms.add(bottomChoice.id);

    const itemIds = [topChoice.id, bottomChoice.id];
    const reasonParts: string[] = [];

    reasonParts.push(intros[p % intros.length](topChoice, bottomChoice, weather));

    if (needsOuter && outers[p % Math.max(outers.length, 1)]) {
      const outer = outers[p % outers.length];
      itemIds.push(outer.id);
      reasonParts.push(
        (outerTemplates[p % outerTemplates.length] as (o: ClothingItem, prob: number) => string)(
          outer,
          weather.precipitationProbability
        )
      );
    }

    if (shoes[p % Math.max(shoes.length, 1)]) {
      const shoe = shoes[p % shoes.length];
      itemIds.push(shoe.id);
      reasonParts.push(shoeTemplates[p % shoeTemplates.length](shoe));
    }

    if (accessories.length > 0 && p < accessories.length) {
      const acc = accessories[p];
      itemIds.push(acc.id);
      reasonParts.push(accTemplates[p % accTemplates.length](acc));
    }

    reasonParts.push(tpoTemplates[p % tpoTemplates.length](TPO_LABEL[tpo]));

    if (recentlyWorn.has(topChoice.id) || recentlyWorn.has(bottomChoice.id)) {
      reasonParts.push(RECENT_TEMPLATES[p % RECENT_TEMPLATES.length]);
    } else {
      reasonParts.push(FRESH_TEMPLATES[p % FRESH_TEMPLATES.length]);
    }

    if (profile?.personalColor) {
      reasonParts.push(PERSONAL_COLOR_TEMPLATES[p % PERSONAL_COLOR_TEMPLATES.length]);
    }
    if (profile?.heightCm) {
      reasonParts.push(heightTemplates[p % heightTemplates.length](profile.heightCm));
    }
    if (profile?.styleVibes && profile.styleVibes.length > 0) {
      const vibeLabel = profile.styleVibes.map((v) => STYLE_VIBE_LABEL[v]).join('・');
      reasonParts.push(vibeTemplates[p % vibeTemplates.length](vibeLabel));
    }

    const avgScore = scoreItem(topChoice, ctx) + scoreItem(bottomChoice, ctx);

    results.push({
      itemIds,
      reason: reasonParts.join(' '),
      score: avgScore,
    });
  }

  return results;
}
