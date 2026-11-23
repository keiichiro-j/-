// 手配度：犯行→目撃→通報→手配。three.jsに依存しない（テスト対象）
import { WANTED } from '../core/config.js';

// 犯行の重さ（設計書8章）
export const CRIMES = {
  speeding:   { stars: 1, name: '速度超過・信号無視', policeOnly: true },
  theft:      { stars: 1, name: '車両盗難' },
  assault:    { stars: 2, name: '暴行' },
  hitrun:     { stars: 2, name: 'ひき逃げ' },
  carjack:    { stars: 2, name: '車の強奪' },
  brandish:   { stars: 2, name: '武器の誇示' },
  shooting:   { stars: 2, name: '発砲' },
  robbery:    { stars: 3, name: '店舗強盗' },
  copAttack:  { stars: 3, name: '警官への攻撃', plusOne: true },
  bank:       { stars: 4, name: '銀行強盗' },
  explosion:  { stars: 4, name: '爆発' },
};

export function newWanted() {
  return { stars: 0, status: 'none', search: null, escapeT: 0, lostT: 0, detect: 0, seenNow: false,
    heat: { known: null, level: 0 }, lastCrime: null, history: [] };
}

// 警察が知っている特徴と、今の特徴の一致度（0〜1）
export function heatMatch(known, now) {
  if (!known) return 0.5;
  let n = 0, m = 0;
  for (const k of ['outfit', 'mask', 'weapon', 'car', 'carColor']) {
    if (known[k] == null) continue;
    n++; if (known[k] === now[k]) m++;
  }
  return n ? m / n : 0.5;
}

// 通報を受けて手配（by: 'civ'|'police'|'alarm'|'tracker'）
export function reportCrime(w, type, x, z, by = 'civ') {
  const c = CRIMES[type]; if (!c) return w;
  if (c.policeOnly && by !== 'police') return w;
  let stars = c.stars;
  if (c.plusOne && w.stars > 0) stars = Math.max(c.stars, w.stars + 1);
  const before = w.stars;
  w.stars = Math.min(5, Math.max(w.stars, stars));
  w.lastCrime = { type, x, z, by };
  w.history.push(type);
  if (by === 'police') { w.status = 'seen'; w.search = { x, z, r: w.stars * WANTED.searchRadiusPerStar }; w.detect = 1; }
  else if (w.status === 'none' || w.status === 'search' || w.status === 'unknown') {
    if (w.status !== 'search') w.status = 'unknown';
    w.search = { x, z, r: w.stars * WANTED.searchRadiusPerStar };
  }
  if (w.search) w.search.r = Math.max(w.search.r, w.stars * WANTED.searchRadiusPerStar);
  w.escapeT = 0;
  return w.stars !== before;
}

// 毎フレーム：policeSees＝警察のどれかが視認しているか（検出の進み具合は seeRate）
export function updateWanted(w, dt, o) {
  if (w.stars === 0) { w.status = 'none'; w.search = null; w.heat.level = Math.max(0, w.heat.level - dt / (WANTED.heatDecayDays * 480)); return w; }
  const now = o.features || {};
  if (o.policeSees) {
    const rate = WANTED.detectRate * (0.5 + heatMatch(w.heat.known, now) * 1.2) * (o.seeRate || 1);
    w.detect = Math.min(1, w.detect + rate * dt * (w.status === 'seen' || w.status === 'lost' ? 4 : 1));
  } else w.detect = Math.max(0, w.detect - dt * 0.25);
  w.seenNow = o.policeSees && w.detect >= 1;
  if (w.seenNow) {
    w.status = 'seen'; w.lostT = 0; w.escapeT = 0;
    w.search = { x: o.x, z: o.z, r: w.stars * WANTED.searchRadiusPerStar };
    w.heat.known = { ...now };
    w.heat.level = Math.min(1, w.heat.level + dt * 0.05);
  } else {
    if (w.status === 'seen') { w.status = 'lost'; w.lostT = 0; }
    if (w.status === 'lost') { w.lostT += dt; if (w.lostT > WANTED.lostBlinkSec) w.status = 'search'; }
    if (w.search) {
      const minR = w.stars * WANTED.searchRadiusPerStar * 0.5;
      w.search.r = Math.max(minR, w.search.r - WANTED.shrinkRate * dt);
      const d = Math.hypot(o.x - w.search.x, o.z - w.search.z);
      const inside = d < w.search.r;
      if (w.stars >= 5) {
        // 地図全体が捜索エリア：見つからずに長く隠れ続ければ解除
        if (w.status === 'search') { w.escapeT += dt * 0.5; if (w.escapeT >= w.stars * WANTED.escapeSecPerStar * 2) clearWanted(w); }
      } else if (!inside) {
        w.escapeT += dt;
        if (w.escapeT >= w.stars * WANTED.escapeSecPerStar) clearWanted(w);
      } else w.escapeT = Math.max(0, w.escapeT - dt * 0.5);
    }
  }
  return w;
}

export function clearWanted(w) {
  w.stars = 0; w.status = 'none'; w.search = null; w.escapeT = 0; w.detect = 0; w.lastCrime = null;
  return w;
}

// ★の表示状態：視認中＝白塗り、見失った直後＝白点滅、犯人未特定＝中空き、捜索エリア内＝赤
export function starStyle(w) {
  return { seen: 'solid', lost: 'blink', unknown: 'hollow', search: 'red', none: 'none' }[w.status] || 'none';
}
