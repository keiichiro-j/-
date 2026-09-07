/**
 * アプリ全体で使う定数・純粋ロジック（外部サービス非依存）をまとめたファイル。
 * ファイル数を抑えるため、以前は theme.ts / eventCategory.ts / japaneseHoliday.ts / rokuyo.ts に
 * 分かれていた4つのnamespaceをここに集約している。
 */

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

/**
 * カレンダー予定の「種類」分類。
 * Google Calendarが標準で持つイベントカラー（colorId 1〜11）にそのまま乗せることで、
 * 台帳や追加のプロパティを持たずに種類→色の対応を予定自体に保存する。
 * CalendarEvent.getColor()/setColor() はこの colorId(文字列)をそのまま読み書きする。
 */
namespace EventCategory {
  export interface Category {
    /** Calendarのイベントカラー colorId（"1"〜"11"）。未設定は空文字 */
    id: string;
    label: string;
    hex: string;
  }

  const UNSET_HEX = "#dadce0";

  export const CATEGORIES: Category[] = [
    { id: "", label: "未設定", hex: UNSET_HEX },
    { id: "10", label: "有給", hex: "#51b749" },
    { id: "2", label: "午前半休", hex: "#7ae7bf" },
    { id: "7", label: "午後半休", hex: "#46d6db" },
    { id: "9", label: "ミーティング", hex: "#5484ed" },
    { id: "6", label: "来客対応", hex: "#ffb878" },
    { id: "3", label: "出張", hex: "#dbadff" },
    { id: "8", label: "その他", hex: "#e1e1e1" },
  ];

  export function labelFor(colorId: string): string {
    const found = CATEGORIES.filter((c) => c.id === colorId)[0];
    return found ? found.label : CATEGORIES[0].label;
  }

  export function hexFor(colorId: string): string {
    const found = CATEGORIES.filter((c) => c.id === colorId)[0];
    return found ? found.hex : UNSET_HEX;
  }
}

/**
 * 日本の国民の祝日判定（現行ルール basis）。
 * - 固定日の祝日、ハッピーマンデー（第n月曜）、春分・秋分の日（近似式）、振替休日、国民の休日に対応。
 * - 春分・秋分の近似式は 1980〜2099年の範囲で国立天文台の発表日と一致することが広く知られている式を使用。
 * - 2020/2021年（東京オリンピック特例による海の日・スポーツの日・山の日の移動）等、過去の特例日程は
 *   対象外（本アプリの実運用が2026年以降であるため、現行の恒久ルールのみを実装）。
 */
namespace JapaneseHoliday {
  function isSameDate(date: Date, year: number, month: number, day: number): boolean {
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  /** 指定月の第n月曜日の日付(day of month)を返す */
  function nthMondayDay(year: number, month: number, n: number): number {
    const firstDayWeekday = new Date(year, month - 1, 1).getDay();
    const firstMonday = 1 + ((8 - firstDayWeekday) % 7);
    return firstMonday + (n - 1) * 7;
  }

  /** 春分の日（近似式。1980〜2099年で成立） */
  function vernalEquinoxDay(year: number): number {
    return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  }

  /** 秋分の日（近似式。1980〜2099年で成立） */
  function autumnalEquinoxDay(year: number): number {
    return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  }

  /** 振替休日・国民の休日を含まない「本来の祝日」のみを判定する */
  function baseHolidayName(date: Date): string | null {
    const y = date.getFullYear();
    if (isSameDate(date, y, 1, 1)) return "元日";
    if (isSameDate(date, y, 1, nthMondayDay(y, 1, 2))) return "成人の日";
    if (isSameDate(date, y, 2, 11)) return "建国記念の日";
    if (isSameDate(date, y, 2, 23)) return "天皇誕生日";
    if (isSameDate(date, y, 3, vernalEquinoxDay(y))) return "春分の日";
    if (isSameDate(date, y, 4, 29)) return "昭和の日";
    if (isSameDate(date, y, 5, 3)) return "憲法記念日";
    if (isSameDate(date, y, 5, 4)) return "みどりの日";
    if (isSameDate(date, y, 5, 5)) return "こどもの日";
    if (isSameDate(date, y, 7, nthMondayDay(y, 7, 3))) return "海の日";
    if (isSameDate(date, y, 8, 11)) return "山の日";
    if (isSameDate(date, y, 9, nthMondayDay(y, 9, 3))) return "敬老の日";
    if (isSameDate(date, y, 9, autumnalEquinoxDay(y))) return "秋分の日";
    if (isSameDate(date, y, 10, nthMondayDay(y, 10, 2))) return "スポーツの日";
    if (isSameDate(date, y, 11, 3)) return "文化の日";
    if (isSameDate(date, y, 11, 23)) return "勤労感謝の日";
    return null;
  }

  function addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  /** 振替休日: 日曜の祝日の直後で、まだ祝日になっていない最初の日 */
  function isSubstituteHoliday(date: Date): boolean {
    let cursor = addDays(date, -1);
    while (baseHolidayName(cursor)) {
      if (cursor.getDay() === 0) {
        return true;
      }
      cursor = addDays(cursor, -1);
    }
    return false;
  }

  /** 国民の休日: 前後を祝日に挟まれた平日 */
  function isCitizensHoliday(date: Date): boolean {
    if (date.getDay() === 0) {
      return false;
    }
    return !!baseHolidayName(addDays(date, -1)) && !!baseHolidayName(addDays(date, 1));
  }

  /** 祝日名を返す（祝日でなければ null）。振替休日・国民の休日を含む */
  export function nameFor(date: Date): string | null {
    const base = baseHolidayName(date);
    if (base) {
      return base;
    }
    if (isSubstituteHoliday(date)) {
      return "振替休日";
    }
    if (isCitizensHoliday(date)) {
      return "国民の休日";
    }
    return null;
  }
}

/**
 * 六曜（先勝/友引/先負/仏滅/大安/赤口）の簡易判定。
 * 本来の六曜は旧暦（太陰太陽暦）の月+日の合計を6で割った余りから決まるため、
 * 正確な算出には朔（新月）のタイミングに基づく旧暦変換が必要。
 * 本アプリはネットワークを介した暦データ参照ができない実行環境のため、
 * 基準日からの経過日数を6日周期でローテーションさせる「近似値」として実装している。
 * 旧暦の月替わり（朔）のタイミングでこの近似は実際の六曜と数日程度ずれる場合がある。
 * 正確性が必須の用途では、外部の暦データ・APIに置き換えること。
 */
namespace RokuyoService {
  export const CYCLE: string[] = ["先勝", "友引", "先負", "仏滅", "大安", "赤口"];

  // 基準日: 2000-01-01（土）を「先勝」と仮定したローテーションの起点とする。
  const BASE_DATE = new Date(2000, 0, 1);

  function stripTime(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  export function forDate(date: Date): string {
    const diffDays = Math.round((stripTime(date) - stripTime(BASE_DATE)) / 86400000);
    const idx = ((diffDays % CYCLE.length) + CYCLE.length) % CYCLE.length;
    return CYCLE[idx];
  }
}
