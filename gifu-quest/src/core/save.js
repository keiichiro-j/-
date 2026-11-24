// セーブ（設計書 9章）。端末内 localStorage「gq2_save」。保存できない環境でもゲームは止めない。担当：UI
import { RUNTIME } from './config.js';
import { input, DEFAULT_KEYS } from './input.js';
export const SAVE_KEY = 'gq2_save';
export const SAVE_VERSION = 2;

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    cleared: [],                       // クリアしたステージ番号
    sarubobo: {},                      // { "1": [true,false,false], ... }
    bestTime: {},                      // { "1": 123.4 }
    coins: 0,                          // 持ちコイン（累計）
    unlocked: ['leaf', 'minamo', 'gen', 'haku'],
    lastChar: 'leaf',
    lastStage: 1,                      // マップで最後に選んだステージ
    seenOpening: false,
    seenEnding: false,
    seenSigns: [],                     // 読んだ看板の id（図鑑）
    defeated: [],                      // 倒した敵の種類（図鑑）
    noMissBoss: {},                    // ノーミスで倒したボス
    settings: { sound: false, sfxVol: 0.8, bgmVol: 0.6, quality: 'auto', shake: true, difficulty: 'normal', touchLayout: null, keymap: null },
  };
}

const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
// 古い版のデータを新しい形に変換する（版ごとに順に上げる）
export function migrate(d) {
  if (!d || typeof d !== 'object') return defaultSave();
  const base = defaultSave();
  let v = d.version | 0;
  // v0（版番号なし・試作版）：clear が {1:true,...} の形、best が秒の配列だった
  if (v < 1) {
    if (d.clear && !d.cleared) d.cleared = Object.keys(obj(d.clear)).filter((k) => d.clear[k]).map(Number);
    if (Array.isArray(d.best) && !d.bestTime) { d.bestTime = {}; d.best.forEach((t, i) => { if (t) d.bestTime[i + 1] = t; }); }
    v = 1;
  }
  // v1 → v2：lastStage・seenEnding を追加（既定値で埋まる）
  if (v < 2) v = 2;
  const out = { ...base, ...d, settings: { ...base.settings, ...obj(d.settings) } };
  // 形の検査（壊れたデータでも止まらない）
  out.cleared = arr(out.cleared).filter((n) => typeof n === 'number');
  out.sarubobo = obj(out.sarubobo);
  for (const k of Object.keys(out.sarubobo)) { const a = arr(out.sarubobo[k]); out.sarubobo[k] = [!!a[0], !!a[1], !!a[2]]; }
  out.bestTime = obj(out.bestTime);
  out.coins = Math.max(0, +out.coins || 0);
  out.unlocked = arr(out.unlocked); for (const c of base.unlocked) if (!out.unlocked.includes(c)) out.unlocked.push(c);
  out.seenSigns = arr(out.seenSigns); out.defeated = arr(out.defeated); out.noMissBoss = obj(out.noMissBoss);
  out.version = SAVE_VERSION;
  delete out.clear; delete out.best;
  return out;
}

let data = null;
let storageOk = true;
export const save = {
  get data() { if (!data) this.load(); return data; },
  get storageOk() { return storageOk; },
  load() {
    try { const raw = localStorage.getItem(SAVE_KEY); data = raw ? migrate(JSON.parse(raw)) : defaultSave(); }
    catch { data = defaultSave(); storageOk = false; }
    applySettings(data.settings);
    return data;
  },
  write() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); storageOk = true; return true; } catch { storageOk = false; return false; }
  },
  // 進行だけ消す（設定と、オープニングを見たかどうかは残す）
  reset() { const s = data ? data.settings : null, op = data ? data.seenOpening : false; data = defaultSave(); if (s) data.settings = s; data.seenOpening = op; this.write(); applySettings(data.settings); },
  hasProgress() { const d = this.data; return d.cleared.length > 0 || d.seenOpening; },
  saruboboCount() { let n = 0; for (const k of Object.keys(this.data.sarubobo)) if (+k >= 1 && +k <= 6) for (const v of this.data.sarubobo[k]) if (v) n++; return n; },
};
export function applySettings(s) {
  RUNTIME.sound = !!s.sound; RUNTIME.sfxVol = s.sfxVol; RUNTIME.bgmVol = s.bgmVol;
  RUNTIME.quality = s.quality === 'auto' ? 'high' : s.quality; RUNTIME.autoQuality = s.quality === 'auto';
  RUNTIME.shake = s.shake; RUNTIME.difficulty = s.difficulty;
  // キー設定
  input.keymap = s.keymap ? { ...structuredClone(DEFAULT_KEYS), ...structuredClone(s.keymap) } : structuredClone(DEFAULT_KEYS);
  input.rebuild();
}
