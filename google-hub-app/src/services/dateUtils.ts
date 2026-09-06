/** ミニカレンダー表示用の日付計算ユーティリティ（外部サービス非依存の純粋関数） */
namespace DateUtils {
  export interface MonthRange {
    startIso: string;
    endIso: string;
  }

  /** 指定年月（month は 0=1月 ... 11=12月）の月初〜翌月初のISO範囲を返す */
  export function getMonthRange(year: number, month: number): MonthRange {
    const start = new Date(year, month, 1, 0, 0, 0, 0);
    const end = new Date(year, month + 1, 1, 0, 0, 0, 0);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }
}
