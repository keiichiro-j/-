import {
  CATEGORY_LABEL,
  SEASON_LABEL,
  type ClothingCategory,
  type ClothingItem,
  type Season,
  type Tpo,
} from './types';

export interface PurchaseRecommendation {
  title: string;
  reason: string;
}

const SEASON_ORDER: Season[] = ['spring', 'summer', 'autumn', 'winter'];
const CORE_CATEGORIES: ClothingCategory[] = ['tops', 'bottoms', 'shoes', 'outer'];

/**
 * 所有アイテムのカテゴリ・季節・シーンの偏りをルールベースで分析し、
 * 次に購入すると良さそうなアイテムを最大3件提案する。
 */
export function generatePurchaseRecommendations(items: ClothingItem[]): PurchaseRecommendation[] {
  const active = items.filter((i) => i.status !== 'retired');
  const countBy = (cat: ClothingCategory) => active.filter((i) => i.category === cat).length;
  const counts: Record<ClothingCategory, number> = {
    tops: countBy('tops'),
    bottoms: countBy('bottoms'),
    outer: countBy('outer'),
    shoes: countBy('shoes'),
    accessory: countBy('accessory'),
  };

  const seasonsCovered = new Set<Season>();
  active.forEach((item) => {
    const seasons: Season[] = item.season && item.season.length > 0 ? item.season : ['all'];
    if (seasons.includes('all')) {
      SEASON_ORDER.forEach((s) => seasonsCovered.add(s));
    } else {
      seasons.forEach((s) => seasonsCovered.add(s));
    }
  });

  const tpoCovered = new Set<Tpo>();
  active.forEach((item) => (item.tpoTags ?? []).forEach((t) => tpoCovered.add(t)));

  const candidates: PurchaseRecommendation[] = [];

  if (counts.bottoms === 0) {
    candidates.push({
      title: 'ボトムス',
      reason: 'ボトムスが登録されていません。トップスを活かすためにも、まずは1着揃えるのがおすすめです。',
    });
  }
  if (counts.tops === 0) {
    candidates.push({
      title: 'トップス',
      reason: 'トップスが登録されていません。合わせやすいベーシックな1着から検討してみてください。',
    });
  }
  if (counts.shoes === 0) {
    candidates.push({
      title: '靴',
      reason: '靴が登録されていません。コーデ全体の印象を左右するアイテムなので、優先度高めで揃えたいところです。',
    });
  }
  if (counts.outer === 0) {
    candidates.push({
      title: 'アウター',
      reason: '羽織りものが手薄です。気温が下がる日の防寒やレイヤードの幅が広がります。',
    });
  }

  for (const s of SEASON_ORDER) {
    if (candidates.length >= 3) break;
    if (!seasonsCovered.has(s)) {
      candidates.push({
        title: `${SEASON_LABEL[s]}向けアイテム`,
        reason: `${SEASON_LABEL[s]}に対応する服が手薄です。季節の変わり目に向けて1着検討すると安心です。`,
      });
    }
  }

  if (candidates.length < 3 && !tpoCovered.has('formal')) {
    candidates.push({
      title: 'フォーマルアイテム',
      reason: '冠婚葬祭や改まった場面向けのアイテムが見当たりません。急な予定にも対応できると安心です。',
    });
  }

  if (candidates.length < 3) {
    const entries = CORE_CATEGORIES.map((cat) => [cat, counts[cat]] as const).sort(
      (a, b) => a[1] - b[1]
    );
    for (const [cat] of entries) {
      if (candidates.length >= 3) break;
      if (candidates.some((c) => c.title === CATEGORY_LABEL[cat])) continue;
      candidates.push({
        title: CATEGORY_LABEL[cat],
        reason: '他のカテゴリに比べて手持ちが少なめのカテゴリです。組み合わせの幅を広げる1着を検討してみては。',
      });
    }
  }

  return candidates.slice(0, 3);
}
