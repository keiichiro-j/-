export function toDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

export function formatDateJa(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${m}月${d}日(${WEEKDAY_JA[date.getDay()]})`;
}

export function formatMonthDayShort(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number);
  return `${m}/${d}`;
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return toDateKey(date);
}

export function daysBetween(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  let cur = fromKey;
  while (cur <= toKey) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function startOfWeek(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const offset = date.getDay(); // 0 (Sun) - 6 (Sat)
  return addDays(dateKey, -offset);
}

export function startOfMonthKey(dateKey: string): string {
  const [y, m] = dateKey.split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

export function monthLabel(dateKey: string): string {
  const [y, m] = dateKey.split('-').map(Number);
  return `${y}年${m}月`;
}
