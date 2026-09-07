/**
 * 6. カラーテーマ仕様
 * 「1900年代の冒険者の日記帳」モチーフの11色 + ランダム候補2色。
 * 適用範囲はコントロールパネルおよびその周辺のみ（本文は中立色で固定）。
 * 設定画面では「11色 + ランダム」の合計12択から選べる（既定は "random"）。
 */
namespace Theme {
  export const RANDOM_CHOICE_ID = "random";

  export const PALETTE_11: ThemeColor[] = [
    { name: "エクスペディションレッド", hex: "#E53935" },
    { name: "キャンプファイヤーオレンジ", hex: "#FB8C00" },
    { name: "アンティークゴールド", hex: "#FDD835" },
    { name: "ジャングルグリーン", hex: "#43A047" },
    { name: "コンパスティール", hex: "#00897B" },
    { name: "ボヤージュブルー", hex: "#1E88E5" },
    { name: "インクネイビー", hex: "#3949AB" },
    { name: "トワイライトパープル", hex: "#8E24AA" },
    { name: "ワイルドローズ", hex: "#D81B60" },
    { name: "レザーブラウン", hex: "#6D4C41" },
    { name: "ピューターグレー", hex: "#757575" },
  ];

  export const RANDOM_POOL: ThemeColor[] = [
    { name: "モスグリーン", hex: "#C0CA33" },
    { name: "グレイシャーシアン", hex: "#00ACC1" },
  ];

  const DARK_TEXT = "#1a1a1a";
  const LIGHT_TEXT = "#ffffff";
  const LUMINANCE_THRESHOLD = 140; // YIQ threshold (0-255)

  /** YIQ式で輝度を算出し、背景色に対して読みやすい文字色を返す */
  export function pickTextColor(hex: string): "#1a1a1a" | "#ffffff" {
    const yiq = yiqLuminance(hex);
    return yiq > LUMINANCE_THRESHOLD ? DARK_TEXT : LIGHT_TEXT;
  }

  export function yiqLuminance(hex: string): number {
    const normalized = hex.replace("#", "");
    const r = parseInt(normalized.substring(0, 2), 16);
    const g = parseInt(normalized.substring(2, 4), 16);
    const b = parseInt(normalized.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000;
  }

  function pickRandom<T>(items: T[], randomFn: () => number = Math.random): T {
    const index = Math.floor(randomFn() * items.length);
    return items[Math.min(index, items.length - 1)];
  }

  /**
   * 13.4 擬似コード準拠:
   * candidates = palette11 + [ランダムプールから1件抽選]
   * theme = candidates[起動ごとにランダム選択]
   */
  export function pickTheme(randomFn: () => number = Math.random): AppliedTheme {
    const bonusColor = pickRandom(RANDOM_POOL, randomFn);
    const candidates = PALETTE_11.concat([bonusColor]);
    const chosen = pickRandom(candidates, randomFn);
    return toApplied(chosen);
  }

  function toApplied(color: ThemeColor): AppliedTheme {
    return {
      name: color.name,
      hex: color.hex,
      textColor: pickTextColor(color.hex),
    };
  }

  /** 設定画面に表示する選択肢一覧（11色 + ランダム、合計12件）。ランダムはUI表示専用でhexは持たない */
  export function listChoices(): { id: string; name: string; hex: string | null }[] {
    const fixed: { id: string; name: string; hex: string | null }[] = PALETTE_11.map((c) => ({
      id: c.name,
      name: c.name,
      hex: c.hex,
    }));
    return fixed.concat([{ id: RANDOM_CHOICE_ID, name: "ランダム", hex: null }]);
  }

  /**
   * 個人設定の themeChoice（11色いずれかの name、または "random"）からテーマを決定する。
   * "random" または未知の値の場合は起動のたびに13.4の擬似コード通りランダム抽選する。
   */
  export function resolveTheme(themeChoice: string, randomFn: () => number = Math.random): AppliedTheme {
    const fixed = PALETTE_11.filter((c) => c.name === themeChoice)[0];
    if (fixed) {
      return toApplied(fixed);
    }
    return pickTheme(randomFn);
  }
}
