import { TILE, PHYS } from '../core/config.js';
import { isSolid, isSlope, isOneWay, slopeHeight } from './tiles.js';

// 縦と横を分けて解決する当たり判定（設計書 5章）。
// body: { x, y, w, h, vx, vy, onGround, dropTimer }（x,y は左上）
// opts.platforms: [{ x, y, w, h, dx, dy, oneWay }] 動く床（上からだけ乗れる）
// opts.onCeil(tx, ty) 頭をぶつけたタイル
const SUB = 8;
const PUSH_MAX = 8;   // 横の押し戻しはこの深さまで（それより深いのは前から重なっていたもの）
const EPS = 0.001;

export function moveBody(level, b, dt, opts = {}) {
  const wasGround = b.onGround;
  b.onGround = false; b.onSlope = false; b.wallL = false; b.wallR = false; b.hitCeil = false;
  b.groundTile = 0; b.platform = null;

  // 横
  const x0 = b.x, y0 = b.y;
  const dx = b.vx * dt;
  let n = Math.max(1, Math.ceil(Math.abs(dx) / SUB));
  for (let i = 0; i < n; i++) {
    b.x += dx / n;
    if (resolveX(level, b, dx / n, wasGround)) break;
  }

  // 縦
  const prevBottom = b.y + b.h;
  const dy = b.vy * dt;
  n = Math.max(1, Math.ceil(Math.abs(dy) / SUB));
  for (let i = 0; i < n; i++) {
    b.y += dy / n;
    if (dy < 0) { if (resolveUp(level, b, opts)) break; }
    else {
      const tol = wasGround ? PHYS.stepUp + 1 + Math.abs(dx) : 7 + Math.abs(dy) + Math.abs(dx) * 0.5;
      const g = findGround(level, b, prevBottom, tol, opts);
      if (g) { land(b, g); break; }
    }
  }

  // 下り坂・段差で地面に吸い付く
  if (!b.onGround && wasGround && b.vy >= 0 && !opts.noSnap) {
    let d = 4 + Math.abs(dx) * 1.2;
    const ctx = Math.floor((b.x + b.w / 2) / TILE), fy = Math.floor((b.y + b.h) / TILE);
    if (isSlope(level.get(ctx, fy)) || isSlope(level.get(ctx, fy - 1))) d = Math.max(d, TILE * 0.55);
    const oy = b.y;
    b.y += d;
    const g = findGround(level, b, oy + b.h, d + 1, opts);
    if (g) land(b, g); else b.y = oy;
  }

  // 坂・段差を上って低い天井に頭が入るなら、横に進まない（壁と同じ扱い）。
  // そのまま進むと頭が天井に埋まり、次の横の判定で押し戻されたり床を抜けたりする
  if (b.onGround && dx !== 0 && b.y < y0 - EPS && headBlocked(level, b, b.y)) {
    const gx = b.x, gy = b.y;
    b.x = x0;
    if (!headBlocked(level, b, y0)) {
      b.y = y0;
      const g = findGround(level, b, y0 + b.h, PHYS.stepUp + 1, opts);
      if (g) land(b, g); else b.onGround = wasGround;
      if (dx > 0) b.wallR = true; else b.wallL = true;
    } else { b.x = gx; b.y = gy; }   // もともと埋まっていた時は動かさない
  }
  return b;
}

// 動く床に運ばれる分だけ動かす。壁・天井は越えない（越えると床から外れて置いていかれる）
export function carryBody(level, b, dx, dy) {
  if (dx) {
    const n = Math.max(1, Math.ceil(Math.abs(dx) / SUB));
    for (let i = 0; i < n; i++) { b.x += dx / n; if (resolveX(level, b, dx / n, true)) break; }
  }
  if (dy < 0) {
    const n = Math.max(1, Math.ceil(-dy / SUB));
    for (let i = 0; i < n; i++) { b.y += dy / n; if (resolveUp(level, b, NO_OPTS)) break; }
  } else if (dy > 0) b.y += dy;
}
const NO_OPTS = {};

function land(b, g) {
  b.y = g.sy - b.h;
  if (b.vy > 0) b.vy = 0;
  b.onGround = true;
  b.groundTile = g.t;
  b.onSlope = g.slope;
  b.platform = g.platform || null;
}

function resolveX(level, b, dx, wasGround) {
  if (dx === 0) return false;
  const margin = wasGround ? PHYS.stepUp : (b.vy > 0 ? 6 : 0);
  const top = b.y + 1;
  const bottom = Math.max(top, b.y + b.h - 1 - margin);
  const ty0 = Math.floor(top / TILE), ty1 = Math.floor(bottom / TILE);
  // 深く重なっているタイル（頭が天井に少し入った時の横の列など）では押し戻さない。
  // 押し戻すと体が逆向きに1マス近く瞬間移動して天井に埋まる
  if (dx > 0) {
    const tx = Math.floor((b.x + b.w - EPS) / TILE);
    if (b.x + b.w - tx * TILE > dx + PUSH_MAX) return false;
    for (let ty = ty0; ty <= ty1; ty++) {
      if (isSolid(level.get(tx, ty))) { b.x = tx * TILE - b.w; b.wallR = true; return true; }
    }
  } else {
    const tx = Math.floor(b.x / TILE);
    if ((tx + 1) * TILE - b.x > -dx + PUSH_MAX) return false;
    for (let ty = ty0; ty <= ty1; ty++) {
      if (isSolid(level.get(tx, ty))) { b.x = (tx + 1) * TILE; b.wallL = true; return true; }
    }
  }
  return false;
}

function resolveUp(level, b, opts) {
  const ty = Math.floor(b.y / TILE);
  const tx0 = Math.floor(b.x / TILE), tx1 = Math.floor((b.x + b.w - EPS) / TILE);
  let hitL = false, hitR = false, hitTx = -1;
  for (let tx = tx0; tx <= tx1; tx++) {
    if (isSolid(level.get(tx, ty))) { if (tx === tx0) hitL = true; if (tx === tx1) hitR = true; if (hitTx < 0 || tx === Math.floor((b.x + b.w / 2) / TILE)) hitTx = tx; }
  }
  if (hitTx < 0) return false;
  // 角の補正：端の数ドットだけ引っかかったら横にずらす
  const cc = PHYS.cornerCorrect;
  if (tx0 !== tx1 && hitL !== hitR) {
    if (hitL) { const over = (tx0 + 1) * TILE - b.x; if (over <= cc && !isSolid(level.get(tx1, ty))) { b.x += over; return false; } }
    else { const over = b.x + b.w - tx1 * TILE; if (over <= cc && !isSolid(level.get(tx0, ty))) { b.x -= over; return false; } }
  }
  b.y = (ty + 1) * TILE;
  // 天井と床のすき間が体より低い（埋まっていた）時は、床の上に立たせる。押し下げると床を抜けて落ちる
  const fty = Math.floor((b.y + b.h - EPS) / TILE);
  if (fty * TILE < b.y + b.h) {
    for (let tx = tx0; tx <= tx1; tx++) if (isSolid(level.get(tx, fty))) { b.y = fty * TILE - b.h; break; }
  }
  b.vy = 0;
  b.hitCeil = true;
  if (opts.onCeil) opts.onCeil(hitTx, ty);
  return true;
}

// 足元の地面を探す。見つかれば { sy, t, slope, platform }
export function findGround(level, b, prevBottom, tol, opts = {}) {
  const feet = b.y + b.h;
  let best = null;
  const take = (sy, t, slope, platform) => { if (!best || sy < best.sy) best = { sy, t, slope, platform }; };

  // 坂（体の中心のx で判定）
  const cx = b.x + b.w / 2;
  const ctx = Math.floor(cx / TILE);
  const rTop = Math.floor((b.y + b.h * 0.5) / TILE), rBot = Math.floor(feet / TILE);
  let onSlopeColumn = false;
  for (let ty = rTop; ty <= rBot; ty++) {
    const t = level.get(ctx, ty);
    if (!isSlope(t)) continue;
    onSlopeColumn = true;
    const sy = ty * TILE + TILE - slopeHeight(t, cx - ctx * TILE);
    if (feet >= sy - EPS && prevBottom <= sy + Math.max(tol, TILE * 0.5)) take(sy, t, true);
  }

  // 固い・上からだけ乗れるタイル
  const ty = Math.floor((feet - EPS) / TILE);
  const tx0 = Math.floor((b.x + 1) / TILE), tx1 = Math.floor((b.x + b.w - 1 - EPS) / TILE);
  for (let tx = tx0; tx <= tx1; tx++) {
    const t = level.get(tx, ty);
    const sy = ty * TILE;
    if (feet <= sy) continue;
    if (isSolid(t)) {
      // 坂の真下にある固いタイルは坂を優先
      if (onSlopeColumn && tx === ctx) continue;
      if (prevBottom <= sy + tol) take(sy, t, false);
    } else if (isOneWay(t) && !(b.dropTimer > 0)) {
      if (prevBottom <= sy + 2 + Math.max(0, b.vy) * 0.002) take(sy, t, false);
    }
  }

  // 動く床
  if (opts.platforms) {
    for (const p of opts.platforms) {
      if (b.x + b.w <= p.x + 1 || b.x >= p.x + p.w - 1) continue;
      if (feet < p.y - EPS) continue;
      if (b.dropTimer > 0 && p.oneWay !== false) continue;
      // 乗ると頭が天井に埋まる高さ（天井へ押し上げられた時）なら乗らない：床が体を抜けていく
      if (prevBottom <= p.y + 3 + Math.abs(p.dy || 0) + tol * 0.3 && !headBlocked(level, b, p.y - b.h)) take(p.y, 0, false, p);
    }
  }
  return best;
}

// 体の上端を top にした時、頭が固いタイルに入るか
function headBlocked(level, b, top) {
  const ty = Math.floor((top + 0.01) / TILE);
  const tx0 = Math.floor((b.x + 1) / TILE), tx1 = Math.floor((b.x + b.w - 1 - EPS) / TILE);
  for (let tx = tx0; tx <= tx1; tx++) if (isSolid(level.get(tx, ty))) return true;
  return false;
}

// 体と重なるタイルのうち pred を満たすものがあるか（体を inset だけ小さくして判定）
export function overlapsTile(level, b, pred, inset = 2) {
  const tx0 = Math.floor((b.x + inset) / TILE), tx1 = Math.floor((b.x + b.w - inset - EPS) / TILE);
  const ty0 = Math.floor((b.y + inset) / TILE), ty1 = Math.floor((b.y + b.h - inset - EPS) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const t = level.get(tx, ty);
    if (pred(t, tx, ty)) return { t, tx, ty };
  }
  return null;
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
