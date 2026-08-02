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
