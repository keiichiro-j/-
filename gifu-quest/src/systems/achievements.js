// 称号（実績）と、やり込みの記録をつける仕組み。仕様は docs/content.md。tests/achievements.test.js
// 判定（evaluate など）は純粋な計算。progress.install() でイベントにつなぐ（main.js から1回だけ）
// world や player の中身は書き換えない。読むのはイベントの中身・world.stats・save.data だけ
import A from '../data/achievements.json';
import META from '../data/stages.json';
import WEAPONS from '../data/weapons.json';
import { today } from './gacha.js';
import { addMission, syncGacha, ensureMissions } from './missions.js';

export const ACHIEVEMENTS = A.achievements;
const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
export const achievementDef = (id) => BY_ID.get(id) || null;
const MAIN = [1, 2, 3, 4, 5, 6];
const BOSS_COUNT = 6;
const RARITY = new Map(WEAPONS.weapons.map((w) => [w.id, w.rarity]));

function saruboboCount(d) { let n = 0; for (const k of MAIN) for (const v of d.sarubobo[k] || []) if (v) n++; return n; }
function targetsMet(d) { let n = 0; for (const s of MAIN) { const t = d.bestTime[s], m = META.stages[s]; if (t != null && m && t <= m.target) n++; } return n; }

/**
 * 称号の進み具合 { cur, max }（cur >= max で達成）。ctx: { signIds: [...] }（名物看板の id の一覧。無ければ判定しない）
 */
export function progressOf(a, d, ctx = {}) {
  const c = a.cond, n = c.n ?? 1;
  switch (c.type) {
    case 'mainCleared': return { cur: d.cleared.filter((s) => s >= 1 && s <= 6).length, max: n };
    case 'stageCleared': return { cur: d.cleared.includes(c.stage) ? 1 : 0, max: 1 };
    case 'seenEnding': return { cur: d.seenEnding ? 1 : 0, max: 1 };
    case 'sarubobo': return { cur: saruboboCount(d), max: n };
    case 'rec': return { cur: d.records[c.key] || 0, max: n };
    case 'noMissBoss': return { cur: Object.keys(d.noMissBoss).filter((k) => d.noMissBoss[k]).length, max: Math.min(n, BOSS_COUNT) };
    case 'charClear': return { cur: (d.records.charClears[c.char] || 0) > 0 ? 1 : 0, max: 1 };
    case 'weaponRarity': return { cur: Object.keys(d.weapons).some((id) => RARITY.get(id) >= c.r) ? 1 : 0, max: 1 };
    case 'weaponCount': return { cur: Object.keys(d.weapons).length, max: n };
    case 'gachaTotal': return { cur: d.gacha.total, max: n };
    case 'signsAll': { const ids = ctx.signIds; if (!ids || !ids.length) return { cur: 0, max: 1, unknown: true }; return { cur: ids.filter((id) => d.seenSigns.includes(id)).length, max: ids.length }; }
    case 'defeatedAll': return { cur: META.enemies.filter((e) => d.defeated.includes(e.kind)).length, max: META.enemies.length };
    case 'targets': return { cur: targetsMet(d), max: n };
    case 'rushClear': return { cur: d.bossRush.clears > 0 ? 1 : 0, max: 1 };
    case 'rushNoMiss': return { cur: d.bossRush.noMiss ? 1 : 0, max: 1 };
    default: return { cur: 0, max: 1, unknown: true };
  }
}
export function isMet(a, d, ctx) { const p = progressOf(a, d, ctx); return !p.unknown && p.cur >= p.max; }

/**
 * まだ得ていない称号を調べ、条件を満たしたものを得る（報酬のコインを d.coins に足す）
 * 戻り値：新しく得た称号の配列
 */
export function checkAchievements(d, ctx = {}, now = new Date(), out = []) {
  for (const a of ACHIEVEMENTS) {
    if (d.achievements[a.id]) continue;
    if (!isMet(a, d, ctx)) continue;
    d.achievements[a.id] = today(now);
    d.coins += a.reward;
    out.push(a);
  }
  return out;
}
export const gotCount = (d) => ACHIEVEMENTS.filter((a) => d.achievements[a.id]).length;

/**
 * ステージをクリアした時の記録（stage.js の finish から）。info: { stage, char, stats, target }
 * 練習（0）・試験用ステージ（90〜）は数えない。戻り値：達成したお題
 */
export function recordClear(d, info, now = new Date(), out = []) {
  const st = info.stage;
  if (typeof st !== 'number' || st < 1 || st > 7) return out;
  const R = d.records, s = info.stats || {};
  const noMiss = (s.hits || 0) + (s.misses || 0) === 0;
  R.clears++;
  R.charClears[info.char] = (R.charClears[info.char] || 0) + 1;
  if (noMiss) R.noMissClears++;
  addMission(d, 'clears', 1, {}, now, out);
  addMission(d, 'charClears', 1, { char: info.char }, now, out);
  if (noMiss) addMission(d, 'noMissClears', 1, {}, now, out);
  if (info.target != null && s.time != null && s.time <= info.target) addMission(d, 'targets', 1, {}, now, out);
  return out;
}

// ---- 実行時：イベントにつなぐ ----
// deps: { events, save, toast, signIds, now? }
export const progress = {
  deps: null, bossMark: -1, _q: [], _a: [],
  install(deps) {
    if (this.deps) return;
    this.deps = deps;
    const { events } = deps;
    const d = () => deps.save.data;
    events.on('stageEnter', () => { this.bossMark = -1; });
    events.on('coin', (e) => { const n = (e && e.n) || 1; d().records.coins += n; this.mission('coins', n); });
    events.on('enemyDefeated', () => { d().records.enemies++; this.mission('enemies', 1); });
    events.on('stomp', (e) => {
      const R = d().records, ch = (e && e.chain) || 1;
      R.stomps++; if (ch > R.bestChain) R.bestChain = ch;
      this.mission('stomps', 1); this.mission('chain', ch);
    });
    // ボス：登場した時の被弾・ミスの数を覚えておき、倒した時に増えていなければノーミス
    events.on('bossStart', (e) => { const W = e && e.boss && e.boss.world; this.bossMark = W ? W.stats.hits + W.stats.misses : -1; });
    events.on('bossDefeated', (e) => {
      const b = e && e.boss, W = b && b.world;
      d().records.bosses++;
      if (b && W && this.bossMark >= 0 && W.stats.hits + W.stats.misses === this.bossMark && b.id) d().noMissBoss[b.id] = true;
      this.bossMark = -1;
      this.mission('bosses', 1);
    });
  },
  now() { return this.deps && this.deps.now ? this.deps.now() : new Date(); },
  ctx() { return { signIds: this.deps ? this.deps.signIds : null }; },
  // お題を進め、達成があれば通知・称号の判定・保存
  mission(type, n, opt) {
    if (!this.deps) return;
    this._q.length = 0;
    addMission(this.deps.save.data, type, n, opt, this.now(), this._q);
    this.afterChange(this._q);
  },
  afterChange(done) {
    const { save, toast } = this.deps;
    const changed = done.length > 0;
    for (const r of done) toast && toast.push('mission', r.text, r.reward);
    this._a.length = 0;
    checkAchievements(save.data, this.ctx(), this.now(), this._a);
    for (const a of this._a) toast && toast.push('title', a.name, a.reward);
    if (changed || this._a.length) save.write();
    return this._a.length + done.length;
  },
  // マップ・記録画面に入った時など：日付の入れ替え・福引きのお題・保存されている状態から得られる称号を調べる
  check() {
    if (!this.deps) return 0;
    const d = this.deps.save.data;
    const rolled = ensureMissions(d, this.now());
    this._q.length = 0;
    syncGacha(d, this.now(), this._q);
    const n = this.afterChange(this._q);
    if (rolled && !n) this.deps.save.write();
    return n;
  },
  // ステージをクリアした時（stage.js の finish から。保存の前に呼ぶ）
  stageCleared(info) {
    if (!this.deps) return;
    this._q.length = 0;
    recordClear(this.deps.save.data, info, this.now(), this._q);
    this.afterChange(this._q);
  },
};
