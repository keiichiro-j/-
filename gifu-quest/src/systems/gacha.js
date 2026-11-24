// 武器の福引き（ガチャ）。純粋な計算だけ（DOM・描画なし）。仕様は docs/gacha.md
import W from '../data/weapons.json';

export const RARITIES = W.rarities;
export const WEAPONS = W.weapons;
export const COST = W.cost;
export const PITY = W.pity;
export const MAX_LEVEL = W.maxLevel;
const BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
const BY_RARITY = new Map(RARITIES.map((r) => [r.r, WEAPONS.filter((w) => w.rarity === r.r)]));
export const weaponById = (id) => BY_ID.get(id) || null;
export const rarityInfo = (r) => RARITIES.find((x) => x.r === r);

// 端末の日付（0時で切り替わる）
export function today(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function defaultGachaState() { return { lastFree: '', pity: 0, total: 0 }; }

export function canFree(d, now = new Date()) { return d.gacha.lastFree !== today(now); }
export function canAfford(d, n) { return d.coins >= (n === 10 ? COST.ten : COST.single); }

// レアリティを1つ決める。floor: これ以上を確定（10連の保証）。pityで極を確定
export function rollRarity(rand, pityCount, floor = 1) {
  if (pityCount >= PITY - 1) return 4;
  let x = rand();
  // 下限のあるときは下限以上の中で比率を保って引き直す
  const pool = RARITIES.filter((r) => r.r >= floor);
  const sum = pool.reduce((s, r) => s + r.rate, 0);
  x *= sum;
  for (const r of pool) { if (x < r.rate) return r.r; x -= r.rate; }
  return pool[pool.length - 1].r;
}

/**
 * ガチャを引く。d は save.data（weapons, gacha, coins を書き換える）
 * mode: 'free' | 'single' | 'ten'
 * 戻り値: { ok, reason?, results: [{ id, rarity, isNew, level, refund }] }
 */
export function pull(d, mode, rand = Math.random, now = new Date()) {
  const n = mode === 'ten' ? 10 : 1;
  if (mode === 'free') { if (!canFree(d, now)) return { ok: false, reason: 'free_used', results: [] }; }
  else {
    const cost = mode === 'ten' ? COST.ten : COST.single;
    if (d.coins < cost) return { ok: false, reason: 'coins', results: [] };
    d.coins -= cost;
  }
  if (mode === 'free') d.gacha.lastFree = today(now);
  const results = [];
  let hasHigh = false;
  for (let i = 0; i < n; i++) {
    const floor = (mode === 'ten' && i === n - 1 && !hasHigh) ? 3 : 1;
    const r = rollRarity(rand, d.gacha.pity, floor);
    if (r >= 3) hasHigh = true;
    d.gacha.pity = r === 4 ? 0 : d.gacha.pity + 1;
    d.gacha.total++;
    const list = BY_RARITY.get(r);
    const w = list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
    results.push(grant(d, w));
  }
  return { ok: true, results };
}

// 武器を渡す。重複はレベルアップ、最大レベルならコインに替える
export function grant(d, w) {
  const own = d.weapons[w.id];
  const res = { id: w.id, rarity: w.rarity, isNew: !own, level: 1, refund: 0 };
  if (!own) { d.weapons[w.id] = { lv: 1 }; if (!d.equipped) d.equipped = w.id; }
  else if (own.lv < MAX_LEVEL) { own.lv++; res.level = own.lv; }
  else { res.refund = rarityInfo(w.rarity).refund; res.level = own.lv; d.coins += res.refund; }
  if (own) res.level = d.weapons[w.id].lv;
  return res;
}

// ---- 装備の効果 ----
// 数値の効果はレベルで伸びる（Lv1=×1、Lv5=×1.6）。得意キャラならさらに×1.25
const SCALE = new Set(['atk', 'cd', 'spd', 'jmp', 'magnet', 'coinx', 'big', 'star', 'regen']);
export function weaponEffects(id, level = 1, charId = null) {
  const w = weaponById(id);
  const fx = { atk: 0, cd: 0, spd: 0, jmp: 0, heart: 0, magnet: 0, coinx: 0, star: 0, stomp: 0, pierce: 0, big: 0, guard: 0, regen: 0, wave: 0 };
  if (!w) return fx;
  const lvMul = 1 + W.levelScale * (Math.max(1, Math.min(MAX_LEVEL, level)) - 1);
  const aff = charId && (w.affinity === charId || charId === 'sarubobo') ? 1 + W.affinityBonus : 1;
  for (const [k, v] of Object.entries(w.fx)) {
    if (k === 'regen') fx.regen = Math.max(5, Math.round(v / (lvMul * aff)));   // 少ない数で回復＝強い
    else fx[k] = SCALE.has(k) ? v * lvMul * aff : v;
  }
  // 上限（ステージの設計を壊さない範囲）
  fx.cd = Math.min(fx.cd, 0.5); fx.jmp = Math.min(fx.jmp, 0.1); fx.spd = Math.min(fx.spd, 0.2);
  return fx;
}

// 効果を人が読める文に
export function describeEffects(fx) {
  const pct = (v) => `${Math.round(v * 100)}%`;
  const out = [];
  if (fx.atk) out.push(`攻撃 +${pct(fx.atk)}`);
  if (fx.cd) out.push(`技の待ち -${pct(fx.cd)}`);
  if (fx.spd) out.push(`速さ +${pct(fx.spd)}`);
  if (fx.jmp) out.push(`ジャンプ +${pct(fx.jmp)}`);
  if (fx.heart) out.push(`ハート +${fx.heart}`);
  if (fx.magnet) out.push(`コイン吸い寄せ ${(fx.magnet / 36).toFixed(1)}マス`);
  if (fx.coinx) out.push(`コイン2倍 ${pct(fx.coinx)}`);
  if (fx.star) out.push(`無敵 +${fx.star.toFixed(1)}秒`);
  if (fx.stomp) out.push(`踏みつけ +${fx.stomp}`);
  if (fx.pierce) out.push('技が貫く');
  if (fx.big) out.push(`技の範囲 +${pct(fx.big)}`);
  if (fx.guard) out.push(`守り ${fx.guard}回`);
  if (fx.regen) out.push(`${fx.regen}体ごとに回復`);
  if (fx.wave) out.push('刃の波を飛ばす');
  return out;
}
