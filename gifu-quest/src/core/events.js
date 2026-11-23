// 小さなイベントバス。システム間の疎結合用（効果音、実績、図鑑など）
const handlers = new Map();
export const events = {
  on(name, fn) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(fn); return () => handlers.get(name).delete(fn); },
  emit(name, data) { const hs = handlers.get(name); if (hs) for (const fn of hs) fn(data); },
  clear() { handlers.clear(); },
};
