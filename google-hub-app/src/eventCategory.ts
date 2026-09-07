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
