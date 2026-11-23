// セーブ（端末内 localStorage）。版番号を持ち、古い形式は変換関数を通す
import { SAVE_VERSION, ECON } from './config.js';
const KEY = 'gifu-open-road:';

export function defaultSave() {
  return {
    v: SAVE_VERSION, created: Date.now(), playSec: 0,
    money: { cash: ECON.startCash, bank: ECON.startBank, stolen: 0 },
    weapons: [{ id: 'fist', ammo: 0, clip: 0 }, { id: 'pistol', ammo: 36, clip: 12 }], stored: [],
    missions: { done: {}, best: {} }, outfit: 0, hour: 9.5, explored: [], ownedCars: [], ownedProps: ['nagara'], homeId: 'nagara', pos: null,
    stats: { taxiFares: 0, taxiEarned: 0, crimes: 0, maxStars: 0, wantedSurvival: 0 },
  };
}

const MIGRATIONS = {
  // 0: 試作版（お金が数値1つ）→ 1
  0: (d) => ({ ...defaultSave(), ...d, v: 1, money: { cash: d.money || 0, bank: 0, stolen: 0 } }),
};
export function migrate(d) {
  if (!d || typeof d !== 'object') return null;
  let x = d; if (x.v == null) x.v = 0;
  let guard = 0;
  while (x.v < SAVE_VERSION && guard++ < 20) { const f = MIGRATIONS[x.v]; if (!f) return null; x = f(x); }
  return { ...defaultSave(), ...x };
}

function store() { try { return window.localStorage; } catch (e) { return null; } }
export function saveSlot(slot, data) {
  const s = store(); if (!s) return false;
  try { s.setItem(KEY + 'slot' + slot, JSON.stringify({ ...data, v: SAVE_VERSION, savedAt: Date.now() })); return true; } catch (e) { return false; }
}
export function loadSlot(slot) {
  const s = store(); if (!s) return null;
  try { const raw = s.getItem(KEY + 'slot' + slot); return raw ? migrate(JSON.parse(raw)) : null; } catch (e) { return null; }
}
export function listSlots() { return [0, 1, 2, 3].map(i => { const d = loadSlot(i); return d ? { slot: i, savedAt: d.savedAt, playSec: d.playSec, cash: d.money.cash + d.money.bank } : null; }); }
export function loadSettings() { const s = store(); try { return JSON.parse((s && s.getItem(KEY + 'settings')) || '{}'); } catch (e) { return {}; } }
export function saveSettings(v) { const s = store(); try { s && s.setItem(KEY + 'settings', JSON.stringify(v)); } catch (e) { /* 保存できない環境 */ } }
export function anonId() {
  const s = store(); let id = null;
  try { id = s && s.getItem(KEY + 'id'); if (!id) { id = Math.random().toString(36).slice(2, 12); s && s.setItem(KEY + 'id', id); } } catch (e) { id = 'guest'; }
  return id;
}
