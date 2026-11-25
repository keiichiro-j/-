// セーブ（設計書 9章）。端末内 localStorage「gq2_save」。保存できない環境でもゲームは止めない。担当：UI
import { RUNTIME } from './config.js';
import { input, DEFAULT_KEYS } from './input.js';
import CHARS from '../data/characters.json';
import WEAPONS from '../data/weapons.json';
export const SAVE_KEY = 'gq2_save';
export const SAVE_VERSION = 4;
// タッチボタンの初期配置（x,y は画面に対する割合の中心位置、s は倍率）。ui/touch.js と設定画面も使う
export const DEFAULT_TOUCH_LAYOUT = {
  pad: { x: 0.165, y: 0.8, s: 1 },
  jump: { x: 0.905, y: 0.78, s: 1 },
  attack: { x: 0.77, y: 0.86, s: 1 },
  pause: { x: 0.955, y: 0.08, s: 1 },
};

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
    seenHints: {},                     // 見終わった操作の案内（ステージ1の吹き出し）
    defeated: [],                      // 倒した敵の種類（図鑑）
    noMissBoss: {},                    // ノーミスで倒したボス
    weapons: {},                       // 持っている武器 { w01: { lv: 1 }, ... }（福引き）
    equipped: null,                    // 装備中の武器の id
    gacha: { lastFree: '', pity: 0, total: 0 },   // 無料の日付・天井までの回数・累計
    // v4：称号・毎日のお題・腕試し（docs/content.md）
    records: defaultRecords(),         // 累計の記録（称号の判定に使う）
    achievements: {},                  // 得た称号 { id: '2026-11-24' }
    missions: { date: '', list: [], gachaBase: 0 },   // 今日のお題 list: [{ id, p, done, char? }]
    bossRush: { best: 0, noMiss: false, clears: 0, tries: 0, most: 0 },   // 腕試し：ベスト（秒・0は記録なし）・ノーミス達成・クリア回数・挑戦回数・最多撃破
    settings: { sound: false, sfxVol: 0.8, bgmVol: 0.6, quality: 'auto', shake: true, difficulty: 'normal', touchLayout: null, keymap: null },
  };
}

export function defaultRecords() {
  return { coins: 0, enemies: 0, stomps: 0, bestChain: 0, clears: 0, noMissClears: 0, bosses: 0, missionsDone: 0, charClears: {}, noMissStages: {} };
}
const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const num = (v, lo, hi, def) => { const n = typeof v === 'string' && v.trim() !== '' ? +v : v; return typeof n === 'number' && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def; };
const oneOf = (v, list, def) => (list.includes(v) ? v : def);
const stageNo = (v) => { const n = typeof v === 'string' && /^\d+$/.test(v) ? +v : v; return Number.isInteger(n) && n >= 0 && n <= MAX_STAGE ? n : null; };
const MAX_STAGE = 8;                 // 0=れんしゅう, 1〜6, 7=うらステージ, 8=沖縄（全クリア後の特別ステージ）
const WEAPON_IDS = new Set(WEAPONS.weapons.map((w) => w.id));
const LAYOUT_KEYS = ['pad', 'jump', 'attack', 'pause'];
// 古い版のデータを新しい形に変換する（版ごとに順に上げる）
export function migrate(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return defaultSave();
  const base = defaultSave();
  let v = d.version | 0;
  // v0（版番号なし・試作版）：clear が {1:true,...}（または [ステージ1, ステージ2, ...] の配列）の形、best が秒の配列だった
  if (v < 1) {
    if (d.clear && !d.cleared) d.cleared = Array.isArray(d.clear) ? d.clear.map((c, i) => (c ? i + 1 : 0)).filter(Boolean) : Object.keys(obj(d.clear)).filter((k) => d.clear[k] === true).map(Number);
    if (Array.isArray(d.best) && !d.bestTime) { d.bestTime = {}; d.best.forEach((t, i) => { if (t) d.bestTime[i + 1] = t; }); }
    v = 1;
  }
  // v1 → v2：lastStage・seenEnding を追加（既定値で埋まる）
  if (v < 2) v = 2;
  // v2 → v3：武器と福引き（既定値で埋まる）
  if (v < 3) v = 3;
  // v3 → v4：称号・お題・腕試し。累計のクリア回数は、クリア済みのステージ数から始める
  if (v < 4) { if (!d.records) d.records = { clears: arr(d.cleared ?? d.clear).length }; v = 4; }
  const out = { ...base, ...d, settings: { ...base.settings, ...obj(d.settings) } };
  // 形の検査（壊れたデータでも止まらない。おかしな値は既定値に戻す）
  out.cleared = [...new Set(arr(out.cleared).map(stageNo).filter((n) => n != null))];
  const sb = obj(out.sarubobo); out.sarubobo = {};
  for (const k of Object.keys(sb)) { const n = stageNo(k); if (n == null) continue; const a = arr(sb[k]); out.sarubobo[n] = [a[0] === true || a[0] === 1, a[1] === true || a[1] === 1, a[2] === true || a[2] === 1]; }
  const bt = obj(out.bestTime); out.bestTime = {};
  for (const k of Object.keys(bt)) { const n = stageNo(k), t = num(bt[k], 0, 1e7, 0); if (n != null && t > 0) out.bestTime[n] = t; }
  out.coins = Math.floor(num(out.coins, 0, 1e9, 0));
  out.unlocked = arr(out.unlocked).filter((c, i, a) => CHARS[c] && a.indexOf(c) === i); for (const c of base.unlocked) if (!out.unlocked.includes(c)) out.unlocked.push(c);
  if (!CHARS[out.lastChar] || (CHARS[out.lastChar].hidden && !out.unlocked.includes(out.lastChar))) out.lastChar = base.lastChar;
  out.lastStage = stageNo(out.lastStage) ?? base.lastStage;
  out.seenOpening = !!out.seenOpening; out.seenEnding = !!out.seenEnding;
  out.seenSigns = arr(out.seenSigns).filter((x) => typeof x === 'string'); out.defeated = arr(out.defeated).filter((x) => typeof x === 'string'); out.noMissBoss = obj(out.noMissBoss);
  // 武器：今のデータに無い id（消えた武器・壊れた値）は捨てる
  const ws = obj(out.weapons); out.weapons = {};
  for (const k of Object.keys(ws)) { if (!WEAPON_IDS.has(k)) continue; const lv = Math.max(1, Math.min(WEAPONS.maxLevel, (obj(ws[k]).lv | 0) || 1)); out.weapons[k] = { lv }; }
  if (!out.weapons[out.equipped]) out.equipped = null;
  const g = obj(out.gacha);
  out.gacha = { lastFree: typeof g.lastFree === 'string' ? g.lastFree : '', pity: Math.max(0, Math.min(WEAPONS.pity - 1, g.pity | 0)), total: Math.max(0, g.total | 0) };
  // 称号・お題・腕試し（v4）
  const R0 = defaultRecords(), rec = obj(out.records); out.records = {};
  for (const k of Object.keys(R0)) if (k !== 'charClears' && k !== 'noMissStages') out.records[k] = Math.floor(num(rec[k], 0, 1e9, 0));
  const nm = obj(rec.noMissStages); out.records.noMissStages = {};
  for (const k of Object.keys(nm)) if (stageNo(k) != null && nm[k]) out.records.noMissStages[k] = true;   // ステージごとのノーミスクリア
  const cc = obj(rec.charClears); out.records.charClears = {};
  for (const k of Object.keys(cc)) if (CHARS[k]) out.records.charClears[k] = Math.floor(num(cc[k], 0, 1e9, 0));
  const ac = obj(out.achievements); out.achievements = {};
  for (const k of Object.keys(ac)) if (typeof k === 'string' && ac[k]) out.achievements[k] = typeof ac[k] === 'string' ? ac[k] : '?';
  const ms = obj(out.missions);
  out.missions = { date: typeof ms.date === 'string' ? ms.date : '', gachaBase: Math.floor(num(ms.gachaBase, 0, 1e9, 0)),
    list: arr(ms.list).filter((m) => m && typeof m.id === 'string').slice(0, 5).map((m) => ({ id: m.id, p: Math.floor(num(m.p, 0, 1e9, 0)), done: !!m.done, ...(CHARS[m.char] ? { char: m.char } : {}) })) };
  const br = obj(out.bossRush);
  out.bossRush = { best: num(br.best, 0, 1e7, 0), noMiss: !!br.noMiss, clears: Math.floor(num(br.clears, 0, 1e9, 0)), tries: Math.floor(num(br.tries, 0, 1e9, 0)), most: Math.floor(num(br.most, 0, 6, 0)) };
  const nb = obj(out.noMissBoss); out.noMissBoss = {};
  for (const k of Object.keys(nb)) if (nb[k]) out.noMissBoss[k] = true;
  // 設定
  const S = out.settings, B = base.settings;
  S.sound = typeof S.sound === 'boolean' ? S.sound : B.sound; S.shake = typeof S.shake === 'boolean' ? S.shake : B.shake;
  S.sfxVol = num(S.sfxVol, 0, 1, B.sfxVol); S.bgmVol = num(S.bgmVol, 0, 1, B.bgmVol);
  S.quality = oneOf(S.quality, ['high', 'low', 'auto'], B.quality); S.difficulty = oneOf(S.difficulty, ['easy', 'normal'], B.difficulty);
  if (S.touchLayout) {
    const L = obj(S.touchLayout), outL = {};
    for (const k of LAYOUT_KEYS) { const p = obj(L[k]), D = DEFAULT_TOUCH_LAYOUT[k]; outL[k] = { x: num(p.x, 0.04, 0.96, D.x), y: num(p.y, 0.06, 0.95, D.y), s: num(p.s, 0.6, 1.6, D.s) }; }
    S.touchLayout = outL;
  } else S.touchLayout = null;
  if (S.keymap) {
    const K = obj(S.keymap), outK = {};
    for (const k of Object.keys(DEFAULT_KEYS)) { const l = arr(K[k]).filter((c) => typeof c === 'string' && c); if (l.length) outK[k] = l; }
    S.keymap = Object.keys(outK).length ? outK : null;
  } else S.keymap = null;
  // さるぼぼ全18個そろっているのに解放されていない古いセーブ
  if (countSarubobo(out.sarubobo) >= 18 && CHARS.sarubobo && !out.unlocked.includes('sarubobo')) out.unlocked.push('sarubobo');
  out.seenHints = obj(out.seenHints);
  out.savedAt = Number.isFinite(+d.savedAt) && +d.savedAt > 0 ? +d.savedAt : 0;   // 最後に保存した時刻（Google アカウントのセーブと比べる）
  out.version = SAVE_VERSION;
  delete out.clear; delete out.best;
  return out;
}
function countSarubobo(sb) { let n = 0; for (const k of Object.keys(sb)) if (+k >= 1 && +k <= 6) for (const v of sb[k]) if (v) n++; return n; }

let data = null;
let storageOk = true;
export const save = {
  get data() { if (!data) this.load(); return data; },
  get storageOk() { return storageOk; },
  load() {
    // 保存場所が使えない（例外）ときだけ「保存できません」。中身が壊れているだけなら新しいデータで続ける
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); storageOk = true; } catch { storageOk = false; }
    try { data = raw ? migrate(JSON.parse(raw)) : defaultSave(); } catch { data = defaultSave(); }
    applySettings(data.settings);
    return data;
  },
  // 端末に保存し、Google とつながっていれば少し後にそちらにも送る（onWrite は core/cloud.js が入れる）
  write() {
    this.data.savedAt = Date.now();
    const ok = this.writeLocalOnly();
    if (this.onWrite) this.onWrite();
    return ok;
  },
  writeLocalOnly() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); storageOk = true; return true; } catch { storageOk = false; return false; }
  },
  // 別の端末（Google アカウント）のセーブに入れ替える
  replace(d) { data = migrate(d); applySettings(data.settings); this.writeLocalOnly(); },
  onWrite: null,
  // 進行だけ消す（設定と、オープニングを見たかどうかは残す）
  reset() { const s = data ? data.settings : null, op = data ? data.seenOpening : false; data = defaultSave(); if (s) data.settings = s; data.seenOpening = op; this.write(); applySettings(data.settings); },
  hasProgress() { const d = this.data; return d.cleared.length > 0 || d.seenOpening; },
  saruboboCount() { return countSarubobo(this.data.sarubobo); },
};
export function applySettings(s) {
  RUNTIME.sound = !!s.sound; RUNTIME.sfxVol = s.sfxVol; RUNTIME.bgmVol = s.bgmVol;
  // 画質「自動」で一度低画質に落ちていれば、設定を開き直しても高に戻さない
  const autoLowered = s.quality === 'auto' && RUNTIME.autoQuality && RUNTIME.quality === 'low';
  RUNTIME.quality = s.quality === 'auto' ? (autoLowered ? 'low' : 'high') : s.quality; RUNTIME.autoQuality = s.quality === 'auto';
  RUNTIME.shake = s.shake; RUNTIME.difficulty = s.difficulty;
  // キー設定
  input.keymap = s.keymap ? { ...structuredClone(DEFAULT_KEYS), ...structuredClone(s.keymap) } : structuredClone(DEFAULT_KEYS);
  input.rebuild();
}
