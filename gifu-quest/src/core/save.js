// セーブ（設計書 9章）。端末内 localStorage「gq2_save」。保存できない環境でもゲームは止めない。
import { RUNTIME } from './config.js';
export const SAVE_KEY = 'gq2_save';
export const SAVE_VERSION = 1;

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    cleared: [],                       // クリアしたステージ番号
    sarubobo: {},                      // { "1": [true,false,false], ... }
    bestTime: {},                      // { "1": 123.4 }
    coins: 0,
    unlocked: ['leaf', 'minamo', 'gen', 'haku'],
    lastChar: 'leaf',
    seenOpening: false,
    seenSigns: [],
    defeated: [],                      // 倒した敵の種類（図鑑）
    noMissBoss: {},                    // ノーミスで倒したボス
    settings: { sound: false, sfxVol: 0.8, bgmVol: 0.6, quality: 'auto', shake: true, difficulty: 'normal', touchLayout: null, keymap: null },
  };
}

// 古い版のデータを新しい形に変換する
export function migrate(d) {
  if (!d || typeof d !== 'object') return defaultSave();
  const base = defaultSave();
  const out = { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) } };
  out.version = SAVE_VERSION;
  return out;
}

let data = null;
export const save = {
  get data() { if (!data) data = this.load(); return data; },
  load() {
    try { const raw = localStorage.getItem(SAVE_KEY); data = raw ? migrate(JSON.parse(raw)) : defaultSave(); }
    catch { data = defaultSave(); }
    applySettings(data.settings);
    return data;
  },
  write() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); return true; } catch { return false; } },
  reset() { data = defaultSave(); this.write(); },
  hasProgress() { const d = this.data; return d.cleared.length > 0 || d.seenOpening; },
};
export function applySettings(s) {
  RUNTIME.sound = !!s.sound; RUNTIME.sfxVol = s.sfxVol; RUNTIME.bgmVol = s.bgmVol;
  RUNTIME.quality = s.quality === 'auto' ? 'high' : s.quality; RUNTIME.autoQuality = s.quality === 'auto';
  RUNTIME.shake = s.shake; RUNTIME.difficulty = s.difficulty;
}
