// システム間のイベントバス（犯罪発生、爆発、発砲など）
const handlers = new Map();
export function on(type, fn) {
  if (!handlers.has(type)) handlers.set(type, []);
  handlers.get(type).push(fn);
  return () => { const a = handlers.get(type); const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); };
}
export function emit(type, data) {
  const a = handlers.get(type);
  if (a) for (const fn of a.slice()) fn(data);
}
export function clearAll() { handlers.clear(); }
