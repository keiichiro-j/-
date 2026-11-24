import { drawSprite, hasSprite } from '../gfx/atlas.js';
import { heroAnchor } from './heroes.js';
import { HERO_ANIMS } from '../actors/player.js';
import { weaponById } from '../systems/gacha.js';
// 武器を装備した主人公の「装い」：手に持った武器・武器の色の襟巻き・レアリティの光。
// 主人公の絵は焼き付け済みなので、コマごとの手と首の位置（heroAnchor）に重ねて描く。
// x, y はスプライトの基準点（足元中央）。o: { flip, sx, sy, alpha, weaponId, time, vx }
const HELD_SCALE = { fan: 0.4, umbrella: 0.48, hammer: 0.5, axe: 0.5, torch: 0.52, baton: 0.5, spade: 0.5, staff: 0.55 };
const RARE_GLOW = { 3: [255, 150, 120], 4: [255, 214, 110] };
// 武器の形のおおよその点（握る位置が原点、刃先が +x。weaponheld の絵の単位）。顔に重ならない向きを探すのに使う
const SHAPE_LEN = { katana: 32, tanto: 20, naginata: 24, spear: 30, hammer: 24, axe: 24, sickle: 18, umbrella: 26, torch: 22, staff: 28, baton: 22, spade: 26 };
const SHAPES = {};
function shapePts(kind) {
  if (SHAPES[kind]) return SHAPES[kind];
  const pts = [];
  if (kind === 'fan') { for (let i = 0; i <= 6; i++) { const a = -0.95 + i * 0.317; for (const r of [12, 24]) pts.push([-2 + Math.cos(a) * r, Math.sin(a) * r]); } }
  else { const L = SHAPE_LEN[kind] || 28; for (let i = 1; i <= 6; i++) pts.push([L * i / 6, 0]); }
  return (SHAPES[kind] = pts);
}
// 持ち方：元の角度で武器が顔にかかるコマ（勝利ポーズで腕を上げた時など）は、顔から離れる向きへ回す。
// どう回してもかかる時は体の後ろに描く。コマと武器の形ごとに1回だけ計算して覚えておく
const HOLD = new Map();
function holdFor(id, anim, f, P, kind, ws) {
  const key = id + '|' + anim + '|' + f + '|' + kind;
  let h = HOLD.get(key);
  if (h) return h;
  const pts = shapePts(kind), hx = P.hand.x, hy = P.hand.y;
  const hc = P.head || P.neck, R = (P.hr || 9) + 1.5;
  const hits = (ang) => {
    const c = Math.cos(ang), s = Math.sin(ang); let n = 0;
    for (const [px, py] of pts) { const x = hx + (px * c - py * s) * ws, y = hy + (px * s + py * c) * ws; if ((x - hc.x) ** 2 + (y - hc.y) ** 2 < R * R) n++; }
    return n;
  };
  let best = P.ang, bestN = hits(P.ang);
  if (bestN > 0) {
    for (let k = 1; k <= 9 && bestN > 0; k++) for (const sgn of [1, -1]) {
      const a = P.ang + sgn * k * 0.2, n = hits(a);
      if (n < bestN) { best = a; bestN = n; }
    }
  }
  // 手が顔の前にある（腕を上げた勝利ポーズなど）：武器は頭の後ろから上へ掲げる。握りを少し上へずらして頭の上にのぞかせる
  if (bestN > 0) { best = -Math.PI / 2 + 0.3; }
  const push = bestN > 0 ? R * 0.55 / ws : 0;
  h = { ang: best, behind: bestN > 0, ox: Math.cos(best) * push * ws, oy: Math.sin(best) * push * ws };
  HOLD.set(key, h);
  return h;
}

export function heroSpriteName(id, anim, weaponId) {
  if (weaponId && hasSprite(`hero_${id}_${anim}_bare`)) return `hero_${id}_${anim}_bare`;
  return `hero_${id}_${anim}`;
}

export function drawHeroDressed(ctx, id, anim, frame, x, y, o = {}) {
  const w = o.weaponId ? weaponById(o.weaponId) : null;
  const A = HERO_ANIMS[anim] || HERO_ANIMS.idle;
  const f = ((frame | 0) % A.frames + A.frames) % A.frames;
  if (!w) { drawSprite(ctx, `hero_${id}_${anim}`, f, x, y, o); return; }
  const dir = o.flip ? -1 : 1, sx = o.sx || 1, sy = o.sy || 1, alpha = o.alpha ?? 1, t = o.time || 0;
  const P = heroAnchor(id, anim, f);
  const map = (p) => ({ x: x + dir * (p.x - 32) * sx, y: y + (p.y - 54) * sy });
  const neck = map(P.neck), hand = map(P.hand);
  ctx.save();
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  // レアリティの光（特上・極）
  const g = RARE_GLOW[w.rarity];
  if (g) {
    const cx = neck.x, cy = neck.y + 10 * sy, r = (w.rarity >= 4 ? 34 : 26) * sx;
    const k = (w.rarity >= 4 ? 0.34 : 0.2) * (0.75 + 0.25 * Math.sin(t * 4));
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, `rgba(${g[0]},${g[1]},${g[2]},${k})`); gr.addColorStop(1, `rgba(${g[0]},${g[1]},${g[2]},0)`);
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  // 襟巻きの垂れ（体の後ろ）。走ると後ろへなびく
  const speed = Math.min(1, Math.abs(o.vx || 0) / 260);
  const back = -dir, wave = Math.sin(t * (6 + speed * 8));
  const len = (9 + speed * 7) * sx;
  for (let i = 0; i < 2; i++) {
    const ex = neck.x + back * (len - i * 3 * sx), ey = neck.y + (2.5 + i * 3.5 + wave * (1.5 + i) * (1 - speed * 0.6)) * sy + (1 - speed) * 4 * sy;
    ctx.beginPath();
    ctx.moveTo(neck.x + back * 1.5 * sx, neck.y - 1.2 * sy);
    ctx.quadraticCurveTo((neck.x + ex) / 2, neck.y + (wave * 2 - 1) * sy, ex, ey);
    ctx.lineTo(ex + dir * 1.2 * sx, ey + 3 * sy);
    ctx.quadraticCurveTo((neck.x + ex) / 2, neck.y + (wave * 2 + 3) * sy, neck.x, neck.y + 2 * sy);
    ctx.closePath();
    ctx.fillStyle = i ? shade(w.color, -0.18) : w.color; ctx.fill();
    ctx.lineWidth = 0.9 * sx; ctx.strokeStyle = 'rgba(30,18,12,0.85)'; ctx.stroke();
  }
  ctx.restore();
  // 手に持った武器（形ごとに手に合う大きさ）。顔にかかる時は向きを変える（holdFor）
  const ws = HELD_SCALE[w.kind] || 0.58;
  const H = holdFor(id, anim, f, P, w.kind, ws);
  const hopt = HELD_O; hopt.flip = dir < 0; hopt.rot = dir > 0 ? H.ang : -H.ang; hopt.sx = ws * sx; hopt.sy = ws * sy; hopt.alpha = alpha;
  const gx = hand.x + dir * H.ox * sx, gy = hand.y + H.oy * sy;
  if (H.behind) drawSprite(ctx, `weaponheld_${w.id}`, 0, gx, gy, hopt);
  // 本体
  drawSprite(ctx, heroSpriteName(id, anim, w.id), f, x, y, o);
  ctx.save();
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  // たすき（肩から腰へ斜めに掛けた布。体の前）
  const hip = map(P.hip);
  const ax = neck.x - dir * 3.2 * sx, ay = neck.y + 2.2 * sy, bx = hip.x + dir * 3.6 * sx, by = hip.y - 1.5 * sy;
  const nx = -(by - ay), ny = bx - ax, nl = Math.hypot(nx, ny) || 1, hw = 1.35 * sx;
  const ox = nx / nl * hw, oy = ny / nl * hw;
  ctx.beginPath(); ctx.moveTo(ax + ox, ay + oy); ctx.lineTo(bx + ox, by + oy); ctx.lineTo(bx - ox, by - oy); ctx.lineTo(ax - ox, ay - oy); ctx.closePath();
  ctx.fillStyle = w.color; ctx.fill(); ctx.lineWidth = 0.8 * sx; ctx.strokeStyle = 'rgba(30,18,12,0.85)'; ctx.stroke();
  if (w.rarity >= 3) { ctx.lineWidth = 0.7 * sx; ctx.strokeStyle = w.rarity >= 4 ? '#ffe27a' : '#ffd0c0'; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
  // 結び目
  ctx.beginPath(); ctx.arc(bx, by, 1.6 * sx, 0, 6.2832); ctx.fillStyle = shade(w.color, -0.2); ctx.fill(); ctx.stroke();
  ctx.restore();
  if (!H.behind) drawSprite(ctx, `weaponheld_${w.id}`, 0, gx, gy, hopt);
  // 極：きらめき
  if (w.rarity >= 4 && ((t * 3) | 0) % 2 === 0) {
    const a = t * 2.3, px = neck.x + Math.cos(a) * 14 * sx, py = neck.y + 10 * sy + Math.sin(a * 1.3) * 16 * sy;
    ctx.save(); ctx.globalAlpha *= alpha * 0.9; ctx.fillStyle = '#fff6c8';
    ctx.beginPath(); ctx.moveTo(px, py - 3 * sx); ctx.lineTo(px + 0.8 * sx, py); ctx.lineTo(px, py + 3 * sx); ctx.lineTo(px - 0.8 * sx, py); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(px - 3 * sx, py); ctx.lineTo(px, py + 0.8 * sx); ctx.lineTo(px + 3 * sx, py); ctx.lineTo(px, py - 0.8 * sx); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

const HELD_O = { flip: false, rot: 0, sx: 1, sy: 1, alpha: 1 };
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
