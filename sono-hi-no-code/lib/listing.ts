import {
  CATEGORY_LABEL,
  SEASON_LABEL,
  type ClothingItem,
  type ListingCopy,
  type Season,
} from './types';

const CONDITION_APPEAL: Record<ClothingItem['condition'], string> = {
  new: 'タグ付き・未使用に近い美品です。',
  good: '目立った傷や汚れのない良好な状態です。',
  fair: '多少の使用感はありますが、まだまだ着用いただけます。',
  worn: '使用感はありますが、普段使いには問題ない状態です。',
};

function seasonText(item: ClothingItem): string {
  const seasons: Season[] = item.season && item.season.length > 0 ? item.season : ['all'];
  if (seasons.includes('all')) return '通年';
  return seasons.map((s) => SEASON_LABEL[s]).join('・');
}

/**
 * Claude APIキー未設定時のフォールバック。フリマアプリでよくある構成
 * （タイトル→状態→特徴→発送→ハッシュタグ）に沿ったテンプレートで生成する。
 * 価格は表示しない方針のため含めない。
 */
export function generateListingCopy(item: ClothingItem): ListingCopy {
  const brandPart = item.brand ? `【${item.brand}】` : '';
  const title = `${brandPart}${item.name}${
    CATEGORY_LABEL[item.category] !== item.name ? ` ${CATEGORY_LABEL[item.category]}` : ''
  }`.slice(0, 40);

  const lines: string[] = [];
  lines.push(`${brandPart}${item.name}のご紹介です。`);
  lines.push('');
  lines.push(`■状態\n${CONDITION_APPEAL[item.condition]}`);
  lines.push(
    `■アイテム詳細\nカテゴリ：${CATEGORY_LABEL[item.category]}\n色：${item.color}${
      item.size ? `\nサイズ：${item.size}` : ''
    }${item.material ? `\n素材：${item.material}` : ''}${
      item.brand ? `\nブランド：${item.brand}` : ''
    }\n季節：${seasonText(item)}`
  );
  lines.push(
    `■発送について\nご購入後、迅速・丁寧に発送いたします。折りたたみ・畳みじわにご理解いただける方によろしくお願いいたします。`
  );
  lines.push('');
  lines.push(
    `#${CATEGORY_LABEL[item.category]} #${item.color}コーデ${item.brand ? ` #${item.brand}` : ''}`
  );

  return {
    title,
    body: lines.join('\n'),
  };
}
