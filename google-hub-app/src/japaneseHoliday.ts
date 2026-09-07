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
