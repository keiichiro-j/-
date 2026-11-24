// 毎日のお題。純粋な計算だけ（DOM・描画なし）。仕様は docs/content.md。tests/missions.test.js
// 日付は福引きの無料と同じ端末の日付（systems/gacha.js の today()。0時で入れ替わる）
import M from '../data/missions.json';
import CHARS from '../data/characters.json';
import { today } from './gacha.js';

export const MISSIONS = M.missions;
const BY_ID = new Map(MISSIONS.map((m) => [m.id, m]));
export const missionDef = (id) => BY_ID.get(id) || null;

// 日付の文字列から決まる乱数（同じ日なら誰でも同じお題）
function seedOf(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let s = seed || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// その日のお題（perDay 個。group が重ならない）。戻り値 [{ id, char? }]
export function dailyMissions(date) {
  const r = rng(seedOf('gq-mission-' + date));
  const groups = [...new Set(MISSIONS.map((m) => m.group))];
  for (let i = groups.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [groups[i], groups[j]] = [groups[j], groups[i]]; }
  const out = [];
  for (const g of groups.slice(0, M.perDay)) {
    const list = MISSIONS.filter((m) => m.group === g);
    const m = list[Math.floor(r() * list.length)];
    const item = { id: m.id };
    if (m.type === 'charClears') item.char = M.chars[Math.floor(r() * M.chars.length)];
    out.push(item);
  }
  return out;
}

// 今日のお題になっているか確かめ、日付が変わっていれば入れ替える。戻り値：入れ替えたら true
export function ensureMissions(d, now = new Date()) {
  const day = today(now);
  if (d.missions.date === day && d.missions.list.length) return false;
  d.missions = { date: day, gachaBase: d.gacha.total, list: dailyMissions(day).map((m) => ({ ...m, p: 0, done: false })) };
  return true;
}

export function missionText(m) {
  const def = missionDef(m.id);
  if (!def) return '';
  return def.text.replace('{n}', def.n).replace('{char}', m.char && CHARS[m.char] ? CHARS[m.char].name : '');
}

function complete(d, m, def, out) {
  m.p = def.n; m.done = true;
  d.coins += def.reward;
  d.records.missionsDone++;
  out.push({ m, def, text: missionText(m), reward: def.reward });
}

/**
 * お題を進める。type はお題の種類（enemies, coins, stomps, chain, bosses, clears, noMissClears, charClears, targets）
 * amount：増やす数（chain は今の連続数）。opt.char：クリアしたキャラ（charClears）
 * 戻り値：このとき達成したお題の配列 [{ m, def, text, reward }]（報酬のコインは d.coins に足し済み）
 */
export function addMission(d, type, amount = 1, opt = {}, now = new Date(), out = []) {
  ensureMissions(d, now);
  for (const m of d.missions.list) {
    if (m.done) continue;
    const def = missionDef(m.id);
    if (!def || def.type !== type) continue;
    if (type === 'charClears' && opt.char !== m.char) continue;
    if (type === 'chain') m.p = Math.max(m.p, Math.min(def.n, amount));
    else m.p = Math.min(def.n, m.p + amount);
    if (m.p >= def.n) complete(d, m, def, out);
  }
  return out;
}

// 福引き：今日引いた回数（累計 − 日付が変わった時の累計）で判定する（福引き蔵の画面はイベントを出さないため）
export function syncGacha(d, now = new Date(), out = []) {
  ensureMissions(d, now);
  for (const m of d.missions.list) {
    const def = missionDef(m.id);
    if (m.done || !def || def.type !== 'gacha') continue;
    m.p = Math.max(0, Math.min(def.n, d.gacha.total - d.missions.gachaBase));
    if (m.p >= def.n) complete(d, m, def, out);
  }
  return out;
}

// 入れ替わりまでの秒数
export function secondsToReset(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(0, Math.round((next - now) / 1000));
}
export const doneCount = (d) => d.missions.list.filter((m) => m.done).length;
