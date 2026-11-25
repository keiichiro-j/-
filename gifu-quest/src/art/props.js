import { defineSprite } from '../gfx/atlas.js';
// アイテム・小物・技のエフェクト・背景の小物（decor）の絵（担当：アート）
// 下の「絵の道具」は art/{heroes,tiles,backdrops}.js からも使う。

// ---------------------------------------------------------------- 絵の道具
/** (x,y,s) から決まる 0..1 の疑似乱数（同じ入力なら同じ値） */
export function hash(x, y = 0, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** 種から作る乱数列（mulberry32） */
export function rng(seed) {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rgbCache = new Map();
function rgb(c) {
  let v = rgbCache.get(c);
  if (v) return v;
  let s = c.replace('#', '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  v = [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  rgbCache.set(c, v);
  return v;
}
/** 2色を t で混ぜる（#rrggbb） */
export function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  const f = (i) => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0');
  return '#' + f(0) + f(1) + f(2);
}
/** k>0 で明るく、k<0 で暗く */
export const shade = (c, k) => (k >= 0 ? mix(c, '#ffffff', k) : mix(c, '#000000', -k));
export const rgba = (c, a) => { const A = rgb(c); return `rgba(${A[0]},${A[1]},${A[2]},${a})`; };
export function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}
export function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2); }
export function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
/** 直前のパスを塗って輪郭を引く */
export function fs(ctx, fill, stroke, lw = 1) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
}
export function lin(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
  return g;
}
export function rad(ctx, x, y, r0, r1, stops, x1 = x, y1 = y) {
  const g = ctx.createRadialGradient(x, y, r0, x1, y1, r1);
  for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
  return g;
}
export function line(ctx, x0, y0, x1, y1, color, lw = 1) {
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
}
/** 光の輪（加算っぽいやわらかい円） */
export function glow(ctx, x, y, r, color, a = 0.6) {
  ctx.fillStyle = rad(ctx, x, y, 0, r, [0, rgba(color, a), 0.45, rgba(color, a * 0.35), 1, rgba(color, 0)]);
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
export function sparkle(ctx, x, y, r, color = '#ffffff', a = 1) {
  ctx.fillStyle = rgba(color, a);
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
}
/** 炎のかたまり（篝火・宝珠など）。t: 0..1 のゆらぎ位相 */
export function flame(ctx, x, y, w, h, t, cols = ['#ff5a1a', '#ffb02a', '#fff2a0']) {
  for (let k = 0; k < 3; k++) {
    const s = 1 - k * 0.3;
    const sway = Math.sin(t * Math.PI * 2 + k) * w * 0.12;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.5 * s, y);
    ctx.bezierCurveTo(x - w * 0.55 * s, y - h * 0.45 * s, x + sway - w * 0.15, y - h * 0.6 * s, x + sway, y - h * s);
    ctx.bezierCurveTo(x + sway + w * 0.2, y - h * 0.6 * s, x + w * 0.55 * s, y - h * 0.4 * s, x + w * 0.5 * s, y);
    ctx.quadraticCurveTo(x, y + h * 0.12 * s, x - w * 0.5 * s, y);
    ctx.fillStyle = cols[k]; ctx.fill();
  }
}

// ---------------------------------------------------------------- アイテム
const OUT = '#2a1a10';
function drawCoin(ctx, f) {
  const th = (f / 8) * Math.PI * 2;
  const c = Math.cos(th), sn = Math.sin(th);
  const cx = 10, cy = 12, rx = 7.6, ry = 10.6;
  const w = Math.abs(c) * rx;
  // ふち（厚み）
  const side = sn >= 0 ? 1 : -1;
  const thick = Math.max(0, 1 - Math.abs(c)) * 2.2 + 0.6;
  ell(ctx, cx + side * thick * 0.6, cy, Math.max(w, 1.4), ry);
  fs(ctx, '#b06e10', '#5a3406', 1.1);
  ell(ctx, cx - side * thick * 0.3, cy, Math.max(w, 1.0), ry);
  if (Math.abs(c) < 0.2) { fs(ctx, lin(ctx, 0, 2, 0, 22, [0, '#ffe680', 1, '#c88a10']), '#5a3406', 1); return; }
  fs(ctx, lin(ctx, cx - w, 2, cx + w, 22, [0, '#fff7b8', 0.35, '#ffd640', 0.75, '#e8a418', 1, '#b8740c']), '#5a3406', 1.1);
  ctx.save();
  ctx.translate(cx - side * thick * 0.3, cy);
  ctx.scale(c, 1);
  // 内側のふち
  ell(ctx, 0, 0, rx - 2.1, ry - 2.1);
  ctx.strokeStyle = 'rgba(150,90,10,0.55)'; ctx.lineWidth = 0.8; ctx.stroke();
  // 小判の横すじ（ござ目）
  ctx.strokeStyle = 'rgba(170,105,10,0.55)'; ctx.lineWidth = 0.6;
  for (let y = -6.5; y <= 6.5; y += 1.6) {
    if (Math.abs(y) < 2.4) continue;
    const hw = Math.sqrt(Math.max(0, 1 - (y * y) / ((ry - 2.5) * (ry - 2.5)))) * (rx - 2.8);
    ctx.beginPath(); ctx.moveTo(-hw, y); ctx.lineTo(hw, y); ctx.stroke();
  }
  // 中央の刻印
  rrect(ctx, -2.6, -2.2, 5.2, 4.4, 1); fs(ctx, '#f0b62a', '#9a5e0a', 0.7);
  line(ctx, 0, -1.3, 0, 1.3, '#9a5e0a', 0.7); line(ctx, -1.4, 0, 1.4, 0, '#9a5e0a', 0.7);
  ctx.restore();
  // ハイライト
  ctx.save(); ell(ctx, cx - side * thick * 0.3, cy, w, ry); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,240,0.75)';
  ell(ctx, cx - w * 0.45, cy - ry * 0.45, Math.max(0.6, w * 0.22), ry * 0.28, -0.3); ctx.fill();
  ctx.restore();
  if (f === 0 || f === 4) sparkle(ctx, cx + w * 0.55, cy - 6, 3.2, '#ffffff', 0.95);
}

/** さるぼぼ人形（アイテム・飾り用） */
export function drawSaruboboDoll(ctx, cx, cy, s = 1, bounce = 0) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  const R = '#d8332e', RD = '#9e1f1c', RO = '#5a0e0c';
  // ひも
  ctx.strokeStyle = '#e8c860'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, -15, 2.6, Math.PI, 0); ctx.stroke();
  // 手足（星形に開く）
  const limb = (x0, y0, x1, y1, w) => {
    line(ctx, x0, y0, x1, y1, RO, w + 2); line(ctx, x0, y0, x1, y1, R, w);
    ell(ctx, x1, y1, w * 0.62, w * 0.62); fs(ctx, R, RO, 0.9);
  };
  limb(-3, 3, -9, 1 - bounce, 4); limb(3, 3, 9, 1 - bounce, 4);
  limb(-2.5, 7, -6, 13, 4.2); limb(2.5, 7, 6, 13, 4.2);
  // 胴
  ell(ctx, 0, 6, 5.5, 6); fs(ctx, lin(ctx, -5, 0, 5, 12, [0, '#f05a4a', 1, RD]), RO, 1);
  // 腹掛け
  poly(ctx, [-4, 1.5, 4, 1.5, 3.4, 9.5, 0, 11, -3.4, 9.5]); fs(ctx, '#232323', '#000', 0.6);
  ctx.fillStyle = '#d8a83a'; ctx.beginPath(); ctx.arc(0, 5.5, 1.4, 0, 7); ctx.fill();
  // 頭（顔はない）
  ell(ctx, 0, -6, 7, 6.4); fs(ctx, rad(ctx, -2, -8, 1, 8, [0, '#ff7a64', 0.6, R, 1, RD]), RO, 1);
  // 頭巾（黒、とがった耳）
  ctx.beginPath();
  ctx.moveTo(-7.6, -4); ctx.quadraticCurveTo(-9, -11, -6.5, -13.5); ctx.lineTo(-4.5, -11.5);
  ctx.quadraticCurveTo(0, -14.5, 4.5, -11.5); ctx.lineTo(6.5, -13.5); ctx.quadraticCurveTo(9, -11, 7.6, -4);
  ctx.quadraticCurveTo(5, -9.5, 0, -9.5); ctx.quadraticCurveTo(-5, -9.5, -7.6, -4); ctx.closePath();
  fs(ctx, lin(ctx, 0, -14, 0, -4, [0, '#4a4a4a', 1, '#151515']), '#000', 0.9);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ell(ctx, -2.5, -6.5, 2, 1.3, -0.3); ctx.fill();
  ctx.restore();
}

function drawSkewer(ctx, f) {
  // 串
  line(ctx, 4, 28, 27, 3, '#5a3a1a', 3.2); line(ctx, 4, 28, 27, 3, '#d8b070', 1.8);
  const pieces = [[9.5, 21.5], [15.5, 14.5], [21.5, 8]];
  pieces.forEach(([x, y], i) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.85 + i * 0.12);
    rrect(ctx, -5, -4.4, 10, 8.8, 2.6);
    fs(ctx, lin(ctx, 0, -5, 0, 5, [0, '#b85a3a', 0.45, '#8a3220', 1, '#4e1a10']), '#2a0c06', 1.1);
    // 霜降り
    ctx.strokeStyle = 'rgba(255,225,205,0.75)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(-3.5, -1); ctx.quadraticCurveTo(-1, -2.5, 1, -0.6); ctx.quadraticCurveTo(2.5, 0.6, 3.6, -0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-3, 2); ctx.quadraticCurveTo(0, 1, 2.5, 2.6); ctx.stroke();
    // 焼き目
    ctx.strokeStyle = 'rgba(30,8,2,0.7)'; ctx.lineWidth = 1;
    for (const gx of [-2.2, 1.4]) { ctx.beginPath(); ctx.moveTo(gx - 1, -4); ctx.lineTo(gx + 1, 4); ctx.stroke(); }
    // つや
    ctx.fillStyle = 'rgba(255,240,220,0.6)'; ell(ctx, -2, -2.8, 2.6, 0.9, -0.1); ctx.fill();
    ctx.restore();
  });
  // ねぎ
  for (const [x, y] of [[12.5, 18], [18.5, 11.2]]) { ell(ctx, x, y, 1.6, 1.2); fs(ctx, '#7cc04a', '#2e5a1a', 0.6); }
  // 湯気
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
  for (let k = 0; k < 2; k++) {
    const ph = (f / 4 + k * 0.5) % 1;
    const x = 12 + k * 7, y = 8 - ph * 6;
    ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.9;
    ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.bezierCurveTo(x - 2, y + 2, x + 2, y, x, y - 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  sparkle(ctx, 24, 6 + (f % 2), 2.4, '#fff', 0.8);
}

function heartPath(ctx, cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + 9 * s);
  ctx.bezierCurveTo(cx - 3 * s, cy + 6 * s, cx - 10.5 * s, cy + 1.5 * s, cx - 10 * s, cy - 4 * s);
  ctx.bezierCurveTo(cx - 9.6 * s, cy - 9 * s, cx - 3 * s, cy - 10 * s, cx, cy - 5.2 * s);
  ctx.bezierCurveTo(cx + 3 * s, cy - 10 * s, cx + 9.6 * s, cy - 9 * s, cx + 10 * s, cy - 4 * s);
  ctx.bezierCurveTo(cx + 10.5 * s, cy + 1.5 * s, cx + 3 * s, cy + 6 * s, cx, cy + 9 * s);
  ctx.closePath();
}
function drawHeart(ctx) {
  heartPath(ctx, 12, 12.5, 1);
  fs(ctx, lin(ctx, 4, 3, 18, 22, [0, '#ff9ab0', 0.4, '#f03c64', 1, '#a0143a']), '#5a0a1e', 1.4);
  heartPath(ctx, 12, 12.5, 0.72);
  ctx.strokeStyle = 'rgba(255,200,215,0.45)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ell(ctx, 7.5, 7.8, 2.6, 1.6, -0.6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ell(ctx, 10.4, 6.3, 0.9, 0.7); ctx.fill();
}

const ORB = [
  ['#fffbe0', '#f2c440', '#94650c'], ['#e0ffc8', '#52c24e', '#1a5e26'], ['#d8f0ff', '#3c8eea', '#10347e'],
  ['#d8fff6', '#2ec2b0', '#0b5258'], ['#ffe4f6', '#c454d4', '#4c1470'], ['#ffffff', '#a6d8ff', '#3e6ea8'],
  ['#ffe8c8', '#ff5a2a', '#7e140c'], ['#fffaf0', '#ffc8ec', '#6a4ac8'],
  ['#fff0f6', '#ff7aa8', '#8a1a48'],   // 8：南の宝珠（さんご色）
];
function drawOrb(ctx, f, cols) {
  const [hi, mid, dk] = cols;
  const t = f / 8;
  const cx = 18, cy = 20;
  glow(ctx, cx, cy, 17, mid, 0.55 + 0.15 * Math.sin(t * Math.PI * 2));
  // 炎の光背
  ctx.globalAlpha = 0.55;
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k - 2) * 0.62;
    const L = 12 + 3 * Math.sin(t * Math.PI * 2 * 2 + k * 1.7);
    const bx = cx + Math.cos(a) * 9, by = cy + Math.sin(a) * 9;
    ctx.beginPath(); ctx.moveTo(bx - Math.sin(a) * 3, by + Math.cos(a) * 3);
    ctx.quadraticCurveTo(cx + Math.cos(a) * (L + 2) - Math.sin(a) * 2, cy + Math.sin(a) * (L + 2), cx + Math.cos(a + 0.25) * (L + 5), cy + Math.sin(a + 0.25) * (L + 5));
    ctx.quadraticCurveTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L, bx + Math.sin(a) * 3, by - Math.cos(a) * 3);
    ctx.fillStyle = shade(mid, 0.3); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 宝珠の形（上がとがった玉）
  const P = () => {
    ctx.beginPath(); ctx.moveTo(cx, cy - 15);
    ctx.bezierCurveTo(cx + 3, cy - 10, cx + 11, cy - 7, cx + 11, cy + 1.5);
    ctx.bezierCurveTo(cx + 11, cy + 8, cx + 6, cy + 11.5, cx, cy + 11.5);
    ctx.bezierCurveTo(cx - 6, cy + 11.5, cx - 11, cy + 8, cx - 11, cy + 1.5);
    ctx.bezierCurveTo(cx - 11, cy - 7, cx - 3, cy - 10, cx, cy - 15); ctx.closePath();
  };
  P(); fs(ctx, rad(ctx, cx - 3.5, cy - 3, 1, 15, [0, hi, 0.35, mid, 1, dk]), shade(dk, -0.45), 1.3);
  ctx.save(); P(); ctx.clip();
  // 中のうず（回る光の帯）
  ctx.strokeStyle = rgba(hi, 0.55); ctx.lineWidth = 2;
  const a0 = t * Math.PI * 2;
  ctx.beginPath(); ctx.ellipse(cx, cy + 1, 8, 4, -0.35, a0, a0 + 2.2); ctx.stroke();
  ctx.lineWidth = 1; ctx.strokeStyle = rgba(hi, 0.35);
  ctx.beginPath(); ctx.ellipse(cx, cy + 2, 6, 7.5, 0.5, -a0, -a0 + 2.5); ctx.stroke();
  // 下の反射
  ctx.fillStyle = rgba(hi, 0.35); ell(ctx, cx + 2, cy + 9, 6, 2.2); ctx.fill();
  ctx.restore();
  // ハイライト
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ell(ctx, cx - 4.5, cy - 4, 2.6, 4, 0.5); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ell(ctx, cx - 1.5, cy - 9.5, 1, 1.6, 0.4); ctx.fill();
  const sp = [[cx + 7, cy - 9], [cx - 9, cy + 6], [cx + 9, cy + 8], [cx - 2, cy - 15]][f % 4];
  sparkle(ctx, sp[0], sp[1], f % 2 ? 2.5 : 3.8, '#ffffff', 0.95);
}

function drawCheckpoint(ctx, f) {
  const on = f === 1;
  const S = '#9a9890', SD = '#68665e', SO = '#33322d';
  // 台座
  rrect(ctx, 2, 63, 26, 9, 2); fs(ctx, lin(ctx, 0, 63, 0, 72, [0, '#a8a69c', 1, '#5c5a52']), SO, 1);
  rrect(ctx, 5, 58, 20, 6, 1.5); fs(ctx, lin(ctx, 0, 58, 0, 64, [0, '#b0aea4', 1, '#6c6a62']), SO, 1);
  // 苔
  ctx.fillStyle = '#5f8a3a'; for (let i = 0; i < 6; i++) { ell(ctx, 4 + i * 4.3, 63.5 + (i % 2), 2.4, 1.2); ctx.fill(); }
  // 石柱（道標）
  poly(ctx, [8, 59, 22, 59, 21, 30, 9, 30]); fs(ctx, lin(ctx, 8, 0, 22, 0, [0, '#b6b4aa', 0.5, S, 1, SD]), SO, 1.1);
  ctx.strokeStyle = 'rgba(40,38,34,0.6)'; ctx.lineWidth = 0.9;
  // 刻まれた字（読めない飾りの線）
  const strokes = [[13, 34, 17, 34], [15, 33, 15, 38], [12.5, 38, 17.5, 38], [13, 41, 17, 41], [14, 41, 13, 45], [16, 41, 17, 45], [12.5, 47, 17.5, 47], [15, 47, 15, 52], [13, 50, 17, 52]];
  for (const s of strokes) { ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.moveTo(9.8, 31); ctx.lineTo(9.2, 58); ctx.stroke();
  // 赤い前掛け（灯がともると結ばれている）
  if (on) { poly(ctx, [8.5, 30.5, 21.5, 30.5, 20, 37, 15, 39, 10, 37]); fs(ctx, lin(ctx, 0, 30, 0, 39, [0, '#f04a3a', 1, '#a01a14']), '#5a0a08', 0.8); }
  // 火袋
  rrect(ctx, 7, 18, 16, 12, 1.5); fs(ctx, lin(ctx, 7, 0, 23, 0, [0, '#aeaca2', 1, '#6a685f']), SO, 1);
  rrect(ctx, 11, 20.5, 8, 7.5, 1);
  if (on) {
    fs(ctx, rad(ctx, 15, 25, 0.5, 6, [0, '#fff6c0', 0.5, '#ffb238', 1, '#d0561a']), '#3a1a08', 0.8);
    flame(ctx, 15, 27.5, 4, 6, 0.3, ['#ff6a1a', '#ffc040', '#fffad0']);
  } else fs(ctx, '#2a2824', '#1a1916', 0.8);
  line(ctx, 15, 20.5, 15, 28, on ? 'rgba(120,60,20,0.6)' : '#3a3833', 0.8);
  // 笠
  ctx.beginPath(); ctx.moveTo(1, 19); ctx.quadraticCurveTo(8, 17, 11, 11); ctx.lineTo(19, 11); ctx.quadraticCurveTo(22, 17, 29, 19); ctx.lineTo(29, 20.5); ctx.lineTo(1, 20.5); ctx.closePath();
  fs(ctx, lin(ctx, 0, 11, 0, 21, [0, '#b8b6ac', 1, '#5c5a52']), SO, 1.1);
  // 宝珠（てっぺん）
  ell(ctx, 15, 8.5, 3, 3); fs(ctx, '#a8a69c', SO, 0.9);
  ctx.beginPath(); ctx.moveTo(15, 3); ctx.quadraticCurveTo(16.5, 6, 15, 6.5); ctx.quadraticCurveTo(13.5, 6, 15, 3); fs(ctx, '#a8a69c', SO, 0.8);
  if (on) {
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 15, 24, 15, '#ffb050', 0.55);
    ctx.globalCompositeOperation = 'source-over';
    sparkle(ctx, 24, 12, 2, '#fff2b0', 0.9); sparkle(ctx, 5, 26, 1.6, '#fff2b0', 0.8);
  }
}

function drawSign(ctx) {
  const WD = '#7a4e28', WL = '#c89a60', WO = '#3a220e';
  // 柱
  for (const x of [7, 30]) { rrect(ctx, x, 12, 4, 32, 1); fs(ctx, lin(ctx, x, 0, x + 4, 0, [0, '#9a6a3a', 1, '#5a3618']), WO, 1); }
  // 板
  rrect(ctx, 2, 13, 36, 20, 1.5); fs(ctx, lin(ctx, 0, 13, 0, 33, [0, '#e8c890', 1, '#b88a52']), WO, 1.2);
  ctx.strokeStyle = 'rgba(120,80,40,0.35)'; ctx.lineWidth = 0.6;
  for (const y of [17, 22, 28]) { ctx.beginPath(); ctx.moveTo(3, y); ctx.bezierCurveTo(14, y - 1, 26, y + 1, 37, y); ctx.stroke(); }
  // 墨の字（読めない飾り）：縦書きの行
  ctx.strokeStyle = 'rgba(30,20,12,0.85)'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
  const r = rng(77);
  for (let col = 0; col < 6; col++) {
    const x = 33 - col * 5.2;
    let y = 16;
    while (y < 30) { const l = 1 + r() * 2.2; ctx.beginPath(); ctx.moveTo(x - r() * 1.2, y); ctx.lineTo(x + r() * 1.2, y + l); ctx.stroke(); y += l + 0.8 + r() * 1.2; }
  }
  // 屋根
  ctx.beginPath(); ctx.moveTo(0, 13); ctx.lineTo(4, 6); ctx.lineTo(36, 6); ctx.lineTo(40, 13); ctx.closePath();
  fs(ctx, lin(ctx, 0, 6, 0, 13, [0, '#6a6e76', 1, '#3a3e46']), '#1e2026', 1.1);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.8;
  for (let x = 5; x < 36; x += 3.2) { ctx.beginPath(); ctx.moveTo(x, 6.5); ctx.lineTo(x - 1.4, 12.5); ctx.stroke(); }
  rrect(ctx, 3, 4.5, 34, 2.4, 1); fs(ctx, '#4a4e56', '#1e2026', 0.8);
  // 柱の足元の草
  ctx.fillStyle = '#5e9a3a';
  for (const x of [6, 9, 29, 33]) { ctx.beginPath(); ctx.moveTo(x - 1.5, 44); ctx.lineTo(x, 39); ctx.lineTo(x + 1.5, 44); ctx.fill(); }
}

function drawUpHint(ctx, f) {
  const dy = f % 2 ? 0 : -0.8;
  ctx.beginPath(); ctx.arc(10, 8.5, 7.6, 0, Math.PI * 2);
  ctx.moveTo(7, 15); ctx.lineTo(10, 19.5); ctx.lineTo(13, 15);
  fs(ctx, lin(ctx, 0, 1, 0, 17, [0, '#ffffff', 1, '#dfe8f2']), '#20283a', 1.3);
  poly(ctx, [10, 3.5 + dy, 14.5, 8.5 + dy, 11.6, 8.5 + dy, 11.6, 13 + dy, 8.4, 13 + dy, 8.4, 8.5 + dy, 5.5, 8.5 + dy]);
  fs(ctx, lin(ctx, 0, 3, 0, 13, [0, '#ffb43a', 1, '#e8601a']), '#6a2a08', 0.9);
}

// ---------------------------------------------------------------- 技のエフェクト
function leafShape(ctx, L, W) {
  ctx.beginPath(); ctx.moveTo(-L, 0);
  ctx.bezierCurveTo(-L * 0.5, -W * 1.3, L * 0.4, -W * 1.1, L, 0);
  ctx.bezierCurveTo(L * 0.4, W * 1.1, -L * 0.5, W * 1.3, -L, 0); ctx.closePath();
}
function drawLeafFx(ctx, f, w, h, big) {
  const cx = w / 2, cy = h / 2;
  const L = big ? 12 : 7.5, W = big ? 6 : 3.6;
  // 風の筋
  ctx.strokeStyle = big ? 'rgba(220,255,180,0.6)' : 'rgba(220,255,200,0.55)'; ctx.lineWidth = big ? 1.4 : 1; ctx.lineCap = 'round';
  for (let k = 0; k < (big ? 3 : 2); k++) {
    const y = cy + (k - (big ? 1 : 0.5)) * (big ? 6 : 5);
    ctx.beginPath(); ctx.moveTo(1 + k * 2, y); ctx.lineTo(cx - L * 0.6, y + (cy - y) * 0.4); ctx.stroke();
  }
  if (big) glow(ctx, cx + 2, cy, 15, '#b8ff70', 0.55);
  ctx.save(); ctx.translate(cx + 2, cy); ctx.rotate(f * Math.PI / 2 * 0.5 - 0.3); ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.cos(f * Math.PI / 4)));
  leafShape(ctx, L, W);
  fs(ctx, lin(ctx, 0, -W, 0, W, [0, big ? '#d8ff9a' : '#a8ec6a', 0.5, big ? '#7cd84a' : '#5cba3a', 1, '#2e7a24']), '#1a4a14', big ? 1.3 : 1);
  line(ctx, -L * 0.9, 0, L * 0.85, 0, 'rgba(230,255,190,0.85)', big ? 1.1 : 0.7);
  ctx.strokeStyle = 'rgba(230,255,190,0.6)'; ctx.lineWidth = 0.6;
  for (let i = -2; i <= 2; i++) { const x = i * L * 0.3; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + L * 0.22, -W * 0.7); ctx.moveTo(x, 0); ctx.lineTo(x + L * 0.22, W * 0.7); ctx.stroke(); }
  ctx.restore();
  if (big) { sparkle(ctx, cx - 8 + f * 3, cy - 9, 2.2, '#fff', 0.9); sparkle(ctx, cx + 12 - f * 2, cy + 8, 1.8, '#f0ffd0', 0.8); }
}

/** 鵜（エフェクト・ミナモの肩の飾り） wing: -1(上)〜1(下) */
export function drawCormorant(ctx, x, y, s, wing) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const B = '#1c2430', BL = '#3a4a5a', O = '#05080c';
  // 奥の羽
  ctx.beginPath(); ctx.moveTo(-1, -1); ctx.quadraticCurveTo(-4, -2 - wing * 6, -8, -wing * 8.5); ctx.quadraticCurveTo(-4, -1 - wing * 2, 1, 1); ctx.closePath(); fs(ctx, '#121820', O, 0.8);
  // しっぽ
  poly(ctx, [-6, 0, -12, -1.5, -12, 2, -6, 2.5]); fs(ctx, B, O, 0.8);
  // 胴
  ell(ctx, -1, 0.8, 6.5, 3.2, -0.08); fs(ctx, lin(ctx, 0, -3, 0, 4, [0, BL, 1, B]), O, 0.9);
  // 首と頭
  ctx.beginPath(); ctx.moveTo(3, -1); ctx.quadraticCurveTo(6.5, -2.5, 8, -3.5); ctx.lineTo(9, -1.8); ctx.quadraticCurveTo(7, 0, 4, 2); ctx.closePath(); fs(ctx, B, O, 0.8);
  ell(ctx, 9, -3.2, 2.3, 1.9); fs(ctx, B, O, 0.8);
  // くちばし
  poly(ctx, [10.6, -3.8, 14.5, -3, 14, -2.2, 10.6, -2.4]); fs(ctx, '#f0b030', '#6a4008', 0.6);
  ctx.fillStyle = '#ffffff'; ell(ctx, 9.6, -2.3, 1.2, 0.8); ctx.fill();   // ほおの白
  ctx.fillStyle = '#5ad0a0'; ctx.fillRect(9.2, -4.1, 0.9, 0.9);             // 目（緑）
  // 手前の羽
  ctx.beginPath(); ctx.moveTo(-3, 0); ctx.quadraticCurveTo(0, -1 - wing * 7, -5, -wing * 10 - 0.5);
  ctx.quadraticCurveTo(-9, -wing * 8, -9, -wing * 6 + 1); ctx.quadraticCurveTo(-6, 1, -3, 1.5); ctx.closePath();
  fs(ctx, lin(ctx, 0, -wing * 10, 0, 2, [0, '#2a3644', 1, '#141a22']), O, 0.9);
  ctx.strokeStyle = 'rgba(140,170,200,0.35)'; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(-3, 0.5); ctx.quadraticCurveTo(-1.5, -wing * 5, -5, -wing * 9); ctx.stroke();
  ctx.restore();
}

function drawSlash(ctx, f) {
  const cx = 22, cy = 35;
  const a0 = [-1.35, -1.5, -1.5, -1.5][f], a1 = [0.2, 1.25, 1.45, 1.5][f];
  const R = [40, 42, 44, 45][f], th = [7, 12, 9, 4][f];
  const alpha = [0.9, 1, 0.7, 0.35][f];
  ctx.save();
  ctx.globalAlpha = alpha;
  // 外側のぼかし
  ctx.beginPath(); ctx.arc(cx, cy, R + 3, a0, a1); ctx.arc(cx - th - 2, cy, R - th + 2, a1, a0, true); ctx.closePath();
  ctx.fillStyle = 'rgba(150,210,255,0.35)'; ctx.fill();
  // 三日月の刃
  ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.arc(cx - th, cy, R - th * 0.4, a1, a0, true); ctx.closePath();
  const g = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
  g.addColorStop(0, 'rgba(200,235,255,0.2)'); g.addColorStop(0.35, 'rgba(255,255,255,1)'); g.addColorStop(0.7, 'rgba(190,225,255,0.95)'); g.addColorStop(1, 'rgba(120,170,230,0.25)');
  ctx.fillStyle = g; ctx.fill();
  // 芯の線
  ctx.beginPath(); ctx.arc(cx, cy, R - 1.2, a0 + 0.15, a1 - 0.1); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.3; ctx.stroke();
  // 速さの筋
  ctx.strokeStyle = 'rgba(210,235,255,0.6)'; ctx.lineWidth = 0.8;
  for (let k = 0; k < 4; k++) { const rr = R - th - 3 - k * 4; if (rr < 10) break; ctx.beginPath(); ctx.arc(cx - 4, cy, rr, a0 * 0.7 + k * 0.1, a1 * 0.7 - k * 0.05); ctx.stroke(); }
  ctx.restore();
  if (f >= 1) {
    const r = rng(f * 13);
    for (let k = 0; k < 6; k++) {
      const a = a0 + (a1 - a0) * r();
      sparkle(ctx, cx + Math.cos(a) * (R + 2 + f * 3 * r()), cy + Math.sin(a) * (R + 2 + f * 3 * r()), 1.5 + r() * 2, '#ffffff', alpha);
    }
  }
}

function drawBullet(ctx, f) {
  const p = f % 2;
  glow(ctx, 8, 8, 8, '#ff8a2a', 0.7);
  ell(ctx, 8, 8, 4.6 + p * 0.4, 4.6 + p * 0.4);
  fs(ctx, rad(ctx, 6.8, 6.8, 0.5, 5.5, [0, '#fffbe0', 0.4, '#ffc24a', 1, '#e04a14']), '#6a1a06', 1);
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ell(ctx, 6.6, 6.4, 1.3, 1); ctx.fill();
}

// ---------------------------------------------------------------- 背景の小物（decor）
const STONE_O = '#2e2d29';
function stoneGrad(ctx, x0, x1) { return lin(ctx, x0, 0, x1, 0, [0, '#c4c2b6', 0.45, '#a3a196', 1, '#6c6a61']); }
function moss(ctx, x, y, w, seed) {
  const r = rng(seed); ctx.fillStyle = 'rgba(90,130,50,0.85)';
  for (let i = 0; i < w / 2.5; i++) { ell(ctx, x + r() * w, y + r() * 2, 1.2 + r() * 1.6, 0.8 + r()); ctx.fill(); }
}
function drawToro(ctx) {
  // 春日灯籠
  rrect(ctx, 6, 64, 24, 6, 1.5); fs(ctx, stoneGrad(ctx, 6, 30), STONE_O, 1);
  poly(ctx, [9, 64, 27, 64, 25, 60, 11, 60]); fs(ctx, stoneGrad(ctx, 9, 27), STONE_O, 1);
  rrect(ctx, 14, 38, 8, 23, 1); fs(ctx, stoneGrad(ctx, 14, 22), STONE_O, 1);
  line(ctx, 14.5, 45, 21.5, 45, 'rgba(40,40,35,0.5)', 0.8); line(ctx, 14.5, 52, 21.5, 52, 'rgba(40,40,35,0.5)', 0.8);
  poly(ctx, [8, 38, 28, 38, 26, 34, 10, 34]); fs(ctx, stoneGrad(ctx, 8, 28), STONE_O, 1);
  // 火袋
  rrect(ctx, 10, 22, 16, 12, 1); fs(ctx, stoneGrad(ctx, 10, 26), STONE_O, 1);
  rrect(ctx, 13.5, 24.5, 9, 7.5, 0.8); fs(ctx, rad(ctx, 18, 28, 0.5, 6, [0, '#ffe6a0', 0.6, '#d88a3a', 1, '#5a3a20']), '#1e1c18', 0.8);
  line(ctx, 18, 24.5, 18, 32, 'rgba(60,40,20,0.7)', 0.7);
  // 笠（反り）
  ctx.beginPath(); ctx.moveTo(1, 22); ctx.quadraticCurveTo(4, 21, 6, 18); ctx.quadraticCurveTo(12, 13, 18, 11); ctx.quadraticCurveTo(24, 13, 30, 18); ctx.quadraticCurveTo(32, 21, 35, 22); ctx.lineTo(35, 23.5); ctx.lineTo(1, 23.5); ctx.closePath();
  fs(ctx, lin(ctx, 0, 11, 0, 24, [0, '#c8c6ba', 1, '#68665d']), STONE_O, 1.1);
  ell(ctx, 18, 9, 3.4, 2.4); fs(ctx, '#aeaca2', STONE_O, 0.9);
  ctx.beginPath(); ctx.moveTo(18, 2); ctx.quadraticCurveTo(20.5, 5.5, 18, 7); ctx.quadraticCurveTo(15.5, 5.5, 18, 2); fs(ctx, '#b8b6ac', STONE_O, 0.9);
  moss(ctx, 2, 21, 30, 3); moss(ctx, 7, 63, 22, 4);
}
function foliageBlob(ctx, x, y, rx, ry, base, seed, needle = false) {
  const r = rng(seed);
  ell(ctx, x, y, rx, ry); fs(ctx, shade(base, -0.25), shade(base, -0.6), 1.2);
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2, d = r() * 0.55;
    ell(ctx, x + Math.cos(a) * rx * d, y + Math.sin(a) * ry * d - ry * 0.15, rx * (0.35 + r() * 0.25), ry * (0.35 + r() * 0.2));
    ctx.fillStyle = shade(base, -0.1 + r() * 0.15); ctx.fill();
  }
  ctx.fillStyle = shade(base, 0.25);
  ell(ctx, x - rx * 0.2, y - ry * 0.45, rx * 0.55, ry * 0.3); ctx.fill();
  if (needle) {
    ctx.strokeStyle = rgba(shade(base, 0.45), 0.7); ctx.lineWidth = 0.7;
    for (let i = 0; i < rx * 1.2; i++) { const px = x - rx * 0.8 + r() * rx * 1.6, py = y - ry * 0.6 + r() * ry * 0.7; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 1.5 - r() * 3, py - 2.5); ctx.stroke(); }
  }
}
function drawPine(ctx) {
  // 幹（くねった黒松）
  ctx.beginPath(); ctx.moveTo(44, 120); ctx.bezierCurveTo(42, 95, 58, 85, 50, 60); ctx.bezierCurveTo(46, 48, 38, 42, 30, 36);
  ctx.lineTo(36, 32); ctx.bezierCurveTo(46, 40, 56, 48, 60, 62); ctx.bezierCurveTo(66, 85, 54, 98, 58, 120); ctx.closePath();
  fs(ctx, lin(ctx, 40, 0, 62, 0, [0, '#7a5a44', 0.5, '#5a3e2c', 1, '#3a261a']), '#1e130c', 1.3);
  ctx.strokeStyle = 'rgba(30,18,10,0.6)'; ctx.lineWidth = 0.8;
  for (let y = 66; y < 118; y += 6) { ctx.beginPath(); ctx.moveTo(48 + (y % 12) / 3, y); ctx.lineTo(54 + (y % 12) / 4, y + 2.5); ctx.stroke(); }
  // 枝
  line(ctx, 56, 70, 80, 60, '#3a261a', 4); line(ctx, 56, 70, 80, 60, '#5a3e2c', 2.4);
  line(ctx, 50, 54, 26, 58, '#3a261a', 3.5); line(ctx, 50, 54, 26, 58, '#5a3e2c', 2);
  const G = '#3f6e3a';
  foliageBlob(ctx, 22, 56, 18, 8, G, 11, true);
  foliageBlob(ctx, 80, 56, 18, 9, G, 12, true);
  foliageBlob(ctx, 34, 32, 24, 10, G, 13, true);
  foliageBlob(ctx, 62, 36, 20, 9, G, 14, true);
  foliageBlob(ctx, 48, 16, 20, 9, G, 15, true);
}
function drawCedar(ctx) {
  rrect(ctx, 31, 70, 8, 90, 2); fs(ctx, lin(ctx, 31, 0, 39, 0, [0, '#a0604a', 0.5, '#7a4434', 1, '#4a281c']), '#24120a', 1.1);
  ctx.strokeStyle = 'rgba(40,20,10,0.5)'; ctx.lineWidth = 0.6;
  for (let x = 32.5; x < 38; x += 1.8) { ctx.beginPath(); ctx.moveTo(x, 72); ctx.lineTo(x + 0.4, 158); ctx.stroke(); }
  const G = '#2f5a3a';
  for (let i = 0; i < 6; i++) {
    const y = 20 + i * 17, w = 10 + i * 4.6;
    ctx.beginPath(); ctx.moveTo(35, y - 16);
    ctx.quadraticCurveTo(35 + w * 0.5, y - 4, 35 + w, y + 10); ctx.quadraticCurveTo(35, y + 5, 35 - w, y + 10);
    ctx.quadraticCurveTo(35 - w * 0.5, y - 4, 35, y - 16); ctx.closePath();
    fs(ctx, lin(ctx, 35 - w, 0, 35 + w, 0, [0, shade(G, 0.18), 0.5, G, 1, shade(G, -0.35)]), '#132a1a', 1);
    ctx.strokeStyle = 'rgba(160,210,150,0.35)'; ctx.lineWidth = 0.7;
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(35 + k * w * 0.25, y + 6); ctx.lineTo(35 + k * w * 0.3, y + 1); ctx.stroke(); }
  }
}
function drawBamboo(ctx) {
  const r = rng(5);
  const stalks = [[14, 0.0], [26, 0.04], [38, -0.03], [48, 0.05]];
  for (const [x, lean] of stalks) {
    ctx.save(); ctx.translate(x, 140); ctx.rotate(lean);
    rrect(ctx, -2.6, -136, 5.2, 136, 2); fs(ctx, lin(ctx, -2.6, 0, 2.6, 0, [0, '#a6d27a', 0.4, '#6aa84a', 1, '#3a6e2c']), '#1e3a16', 0.9);
    for (let y = -20; y > -134; y -= 18 + r() * 6) { line(ctx, -2.8, y, 2.8, y, '#2e5a22', 1.2); line(ctx, -2.4, y - 1.2, 2.4, y - 1.2, 'rgba(220,255,190,0.5)', 0.6); }
    ctx.restore();
  }
  // 葉
  for (let i = 0; i < 26; i++) {
    const x = 6 + r() * 48, y = 4 + r() * 70, a = -0.6 + r() * 1.2 + (x < 30 ? Math.PI : 0) * 0.1;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a + (r() < 0.5 ? 0.5 : -0.5));
    leafShape(ctx, 7, 1.6); fs(ctx, r() < 0.5 ? '#5a9a3a' : '#7ab84a', '#24461a', 0.6);
    ctx.restore();
  }
}
function drawRock(ctx) {
  ctx.beginPath(); ctx.moveTo(3, 30); ctx.bezierCurveTo(1, 18, 10, 6, 24, 5); ctx.bezierCurveTo(38, 4, 50, 14, 50, 30); ctx.closePath();
  fs(ctx, lin(ctx, 10, 5, 40, 30, [0, '#b2ada0', 0.5, '#86817a', 1, '#57534c']), '#2a2824', 1.3);
  ctx.beginPath(); ctx.moveTo(18, 30); ctx.quadraticCurveTo(22, 18, 34, 12); ctx.strokeStyle = 'rgba(40,38,34,0.45)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ell(ctx, 18, 11, 8, 3, -0.3); ctx.fill();
  moss(ctx, 10, 6, 28, 9); moss(ctx, 4, 26, 44, 10);
}
function drawBush(ctx) {
  foliageBlob(ctx, 16, 20, 14, 11, '#4a8a3c', 21); foliageBlob(ctx, 40, 20, 14, 11, '#4a8a3c', 22); foliageBlob(ctx, 28, 14, 16, 12, '#529a42', 23);
  const r = rng(24);
  for (let i = 0; i < 9; i++) {
    const x = 8 + r() * 40, y = 8 + r() * 18;
    ctx.fillStyle = '#f08ab0'; for (let k = 0; k < 5; k++) { ell(ctx, x + Math.cos(k * 1.26) * 1.4, y + Math.sin(k * 1.26) * 1.4, 1.1, 1.1); ctx.fill(); }
    ctx.fillStyle = '#fff4a0'; ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ell(ctx, 28, 31, 24, 2); ctx.fill();
}
function drawGrassTuft(ctx) {
  const r = rng(31);
  for (let i = 0; i < 16; i++) {
    const x = 4 + r() * 28, h = 7 + r() * 10, lean = (r() - 0.5) * 8;
    ctx.beginPath(); ctx.moveTo(x - 1.6, 18); ctx.quadraticCurveTo(x + lean * 0.3, 18 - h * 0.6, x + lean, 18 - h); ctx.quadraticCurveTo(x + lean * 0.3 + 0.8, 18 - h * 0.5, x + 1.6, 18); ctx.closePath();
    ctx.fillStyle = mix('#3e7a2e', '#8ccc5a', r()); ctx.fill();
  }
  ctx.fillStyle = '#ffffff'; for (const [x, y] of [[10, 6], [25, 4]]) { for (let k = 0; k < 5; k++) { ell(ctx, x + Math.cos(k * 1.26) * 1.5, y + Math.sin(k * 1.26) * 1.5, 1.1, 1.1); ctx.fill(); } }
  ctx.fillStyle = '#f0c030'; ctx.fillRect(9.4, 5.4, 1.2, 1.2); ctx.fillRect(24.4, 3.4, 1.2, 1.2);
}
/** 瓦屋根（横から見た片流れ）。x0..x1 の幅、上端 y0、軒 y1 */
function tileRoof(ctx, x0, x1, y0, y1, col = '#4e5560') {
  ctx.beginPath(); ctx.moveTo(x0 - 6, y1); ctx.lineTo(x0 + 4, y0); ctx.lineTo(x1 - 4, y0); ctx.lineTo(x1 + 6, y1); ctx.closePath();
  fs(ctx, lin(ctx, 0, y0, 0, y1, [0, shade(col, 0.15), 1, shade(col, -0.3)]), '#16181c', 1.2);
  ctx.strokeStyle = 'rgba(15,17,20,0.6)'; ctx.lineWidth = 0.9;
  for (let x = x0; x <= x1; x += 4) { const t = (x - x0) / (x1 - x0); ctx.beginPath(); ctx.moveTo(x0 + 4 + t * (x1 - x0 - 8), y0 + 1); ctx.lineTo(x0 - 6 + t * (x1 - x0 + 12), y1 - 1); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(200,210,225,0.25)'; ctx.lineWidth = 0.7;
  for (let x = x0 + 2; x <= x1; x += 4) { const t = (x - x0) / (x1 - x0); ctx.beginPath(); ctx.moveTo(x0 + 4 + t * (x1 - x0 - 8), y0 + 1); ctx.lineTo(x0 - 6 + t * (x1 - x0 + 12), y1 - 1); ctx.stroke(); }
  // 軒先の丸瓦
  for (let x = x0 - 5; x <= x1 + 5; x += 4) { ell(ctx, x, y1, 1.9, 1.6); fs(ctx, shade(col, -0.1), '#16181c', 0.6); }
  rrect(ctx, x0 + 2, y0 - 2.5, x1 - x0 - 4, 3.5, 1.5); fs(ctx, shade(col, -0.05), '#16181c', 0.9);
}
function lattice(ctx, x, y, w, h, col = '#5a3420', bg = '#2a1a10') {
  ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col; for (let px = x + 1; px < x + w; px += 2.6) ctx.fillRect(px, y, 1.4, h);
  ctx.fillStyle = 'rgba(255,220,170,0.15)'; for (let px = x + 1; px < x + w; px += 2.6) ctx.fillRect(px, y, 0.5, h);
  ctx.strokeStyle = '#1a0e08'; ctx.lineWidth = 0.9; ctx.strokeRect(x, y, w, h);
}
function drawMachiya(ctx) {
  const WD = '#6a3e26';
  // 2階
  ctx.fillStyle = lin(ctx, 0, 30, 0, 60, [0, '#7a4a2e', 1, '#5a321e']); ctx.fillRect(14, 32, 122, 30);
  lattice(ctx, 24, 38, 40, 16); lattice(ctx, 86, 38, 40, 16);
  tileRoof(ctx, 10, 140, 20, 32);
  // 1階の庇
  ctx.fillStyle = lin(ctx, 0, 60, 0, 120, [0, '#6a3e26', 1, '#4a2a18']); ctx.fillRect(6, 66, 138, 54);
  tileRoof(ctx, 2, 148, 58, 68, '#555c66');
  // 出格子
  lattice(ctx, 12, 76, 52, 34, '#7a4a2c');
  rrect(ctx, 10, 108, 56, 4, 1); fs(ctx, '#3a2214', '#1a0e08', 0.8);
  // 入口ののれん（無地）
  ctx.fillStyle = '#1e140c'; ctx.fillRect(76, 72, 40, 48);
  for (let i = 0; i < 3; i++) { rrect(ctx, 77 + i * 13, 72, 12.2, 22, [0, 0, 2, 2]); fs(ctx, lin(ctx, 0, 72, 0, 94, [0, '#2c4a7a', 1, '#1c3058']), '#0c1428', 0.8); }
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ell(ctx, 96, 82, 5, 5); ctx.fill(); ctx.fillStyle = '#24406a'; ell(ctx, 96, 82, 3.2, 3.2); ctx.fill();
  // 柱
  ctx.fillStyle = '#3a2214'; for (const x of [6, 70, 120, 141]) ctx.fillRect(x, 66, 3.5, 54);
  // 杉玉（屋号なし）
  line(ctx, 130, 66, 130, 72, '#2a1a10', 1);
  ell(ctx, 130, 78, 6, 6); fs(ctx, rad(ctx, 128, 76, 1, 7, [0, '#8ab05a', 1, '#4a6a2a']), '#24361a', 1);
  // 土台
  ctx.fillStyle = '#7a7870'; ctx.fillRect(4, 116, 142, 4);
  // 外輪郭
  ctx.strokeStyle = '#1a0e08'; ctx.lineWidth = 1.2; ctx.strokeRect(6, 66, 138, 54); ctx.strokeRect(14, 32, 122, 26);
}
function drawGassho(ctx) {
  // 壁と土台
  ctx.fillStyle = '#7a7466'; ctx.fillRect(18, 140, 144, 10);
  ctx.fillStyle = lin(ctx, 0, 96, 0, 140, [0, '#8a5a36', 1, '#5c3a22']); ctx.fillRect(24, 96, 132, 46);
  ctx.strokeStyle = '#2e1a0e'; ctx.lineWidth = 1.2; ctx.strokeRect(24, 96, 132, 46);
  ctx.fillStyle = '#3e2414'; for (const x of [24, 66, 112, 152]) ctx.fillRect(x, 96, 4, 46);
  // 障子窓（ぼんやり明るい）
  for (const [x, y, w, h] of [[34, 106, 24, 20], [120, 106, 24, 20], [76, 112, 28, 28]]) {
    ctx.fillStyle = lin(ctx, 0, y, 0, y + h, [0, '#fff0c8', 1, '#e8c890']); ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 0.7;
    for (let k = x + 6; k < x + w; k += 6) { ctx.beginPath(); ctx.moveTo(k, y); ctx.lineTo(k, y + h); ctx.stroke(); }
    for (let k = y + 7; k < y + h; k += 7) { ctx.beginPath(); ctx.moveTo(x, k); ctx.lineTo(x + w, k); ctx.stroke(); }
    ctx.strokeStyle = '#2e1a0e'; ctx.lineWidth = 1.1; ctx.strokeRect(x, y, w, h);
  }
  // 茅葺き屋根（急な三角）
  ctx.beginPath(); ctx.moveTo(4, 102); ctx.lineTo(90, 4); ctx.lineTo(176, 102); ctx.lineTo(160, 100); ctx.lineTo(90, 22); ctx.lineTo(20, 100); ctx.closePath();
  ctx.fillStyle = '#4a3420'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(4, 102); ctx.lineTo(90, 4); ctx.lineTo(176, 102); ctx.closePath();
  fs(ctx, lin(ctx, 0, 4, 0, 102, [0, '#b89a62', 0.6, '#9a7a48', 1, '#6e5430']), '#3a2a16', 1.4);
  const r = rng(41);
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 160; i++) {
    const y = 10 + r() * 90, half = (y - 4) * 0.875, x = 90 - half + r() * half * 2;
    ctx.strokeStyle = r() < 0.5 ? 'rgba(70,50,25,0.45)' : 'rgba(230,210,150,0.35)';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (x < 90 ? -1.5 : 1.5), y + 4 + r() * 3); ctx.stroke();
  }
  // 屋根の窓（妻側の小窓）
  ctx.fillStyle = '#e8d098'; ctx.fillRect(83, 46, 14, 12); ctx.fillRect(80, 70, 20, 14);
  ctx.strokeStyle = '#3a2a16'; ctx.lineWidth = 1; ctx.strokeRect(83, 46, 14, 12); ctx.strokeRect(80, 70, 20, 14);
  line(ctx, 90, 46, 90, 58, '#5a3a20', 0.8); line(ctx, 90, 70, 90, 84, '#5a3a20', 0.8);
  // 雪
  ctx.beginPath(); ctx.moveTo(6, 100); ctx.lineTo(90, 6); ctx.lineTo(174, 100);
  ctx.lineTo(166, 96); ctx.quadraticCurveTo(150, 84, 146, 72); ctx.lineTo(90, 18); ctx.lineTo(34, 72); ctx.quadraticCurveTo(30, 84, 14, 96); ctx.closePath();
  ctx.save(); ctx.globalAlpha = 0.92; fs(ctx, lin(ctx, 0, 6, 0, 100, [0, '#ffffff', 1, '#d8e6f4']), '#7a8ca8', 1); ctx.restore();
  ctx.fillStyle = '#ffffff'; for (let i = 0; i < 7; i++) { ell(ctx, 18 + i * 24, 100 + (i % 2), 9, 3); ctx.fill(); }
}
function drawCastleWall(ctx) {
  // 石垣（反りのある勾配）
  ctx.beginPath(); ctx.moveTo(0, 80); ctx.quadraticCurveTo(6, 50, 10, 40); ctx.lineTo(110, 40); ctx.quadraticCurveTo(114, 50, 120, 80); ctx.closePath();
  fs(ctx, lin(ctx, 0, 40, 0, 80, [0, '#a29e92', 1, '#6a665c']), '#2a2824', 1.2);
  ctx.save(); ctx.clip();
  const r = rng(51);
  for (let row = 0; row < 6; row++) {
    const y = 40 + row * 7; let x = -4 + r() * 6;
    while (x < 124) { const w = 8 + r() * 9; rrect(ctx, x, y, w - 1, 6.2, 1.6); fs(ctx, shade('#8f8b80', (r() - 0.5) * 0.25), 'rgba(40,38,34,0.8)', 0.8); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x + 1, y + 0.8, w - 3, 1); x += w; }
  }
  ctx.restore();
  // 白壁（塀）
  ctx.fillStyle = lin(ctx, 0, 14, 0, 40, [0, '#f4f2ea', 1, '#d4d0c4']); ctx.fillRect(12, 16, 96, 24);
  ctx.fillStyle = '#3a3630'; ctx.fillRect(12, 34, 96, 6);
  ctx.strokeStyle = '#2a2824'; ctx.lineWidth = 1; ctx.strokeRect(12, 16, 96, 24);
  // 狭間（三角と四角の穴）
  ctx.fillStyle = '#1e1c1a';
  for (let i = 0; i < 4; i++) { const x = 24 + i * 24; if (i % 2) ctx.fillRect(x - 3, 23, 6, 6); else poly(ctx, [x, 22, x + 4, 29, x - 4, 29]), ctx.fill(); }
  tileRoof(ctx, 12, 108, 8, 16, '#4a5058');
}
function drawGate(ctx) {
  const WD = '#6a4428', WO = '#2a1a0c';
  for (const x of [10, 64]) { rrect(ctx, x, 22, 7, 68, 1); fs(ctx, lin(ctx, x, 0, x + 7, 0, [0, '#9a6a40', 1, '#4a2e18']), WO, 1.1); rrect(ctx, x - 2, 84, 11, 6, 1); fs(ctx, '#8a8880', '#3a3833', 0.9); }
  rrect(ctx, 4, 26, 74, 6, 1); fs(ctx, lin(ctx, 0, 26, 0, 32, [0, '#a87444', 1, '#5a3a20']), WO, 1.1);
  rrect(ctx, 12, 40, 56, 4, 1); fs(ctx, '#7a5030', WO, 0.9);
  tileRoof(ctx, 4, 76, 12, 24, '#4e5560');
  // 扉（開いている）
  for (const [x, w] of [[17, 10], [54, 10]]) { ctx.fillStyle = '#5a3820'; ctx.fillRect(x, 46, w, 42); ctx.strokeStyle = WO; ctx.lineWidth = 0.8; ctx.strokeRect(x, 46, w, 42); for (let y = 52; y < 88; y += 7) line(ctx, x, y, x + w, y, 'rgba(30,18,8,0.6)', 0.6); }
}
function drawChochin(ctx, f) {
  line(ctx, 12, 0, 12, 5, '#1a1a1a', 1);
  rrect(ctx, 7, 4, 10, 4, 1); fs(ctx, '#1e1e1e', '#000', 0.8);
  ell(ctx, 12, 19, 10, 12);
  fs(ctx, rad(ctx, 10, 16, 1, 13, [0, '#fff0b0', 0.35, '#ff8a4a', 1, '#c8281e']), '#5a0e08', 1.1);
  ctx.save(); ell(ctx, 12, 19, 10, 12); ctx.clip();
  ctx.strokeStyle = 'rgba(90,20,10,0.45)'; ctx.lineWidth = 0.6;
  for (let y = 9; y < 31; y += 2.4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(24, y); ctx.stroke(); }
  // 白い帯（字のかわりに丸い紋）
  ctx.fillStyle = 'rgba(255,250,230,0.85)'; ell(ctx, 12, 19, 4.2, 4.2); ctx.fill();
  ctx.fillStyle = '#c8281e'; ell(ctx, 12, 19, 2.4, 2.4); ctx.fill();
  ctx.restore();
  rrect(ctx, 7, 29.5, 10, 4, 1); fs(ctx, '#1e1e1e', '#000', 0.8);
  line(ctx, 12, 33.5, 12, 38, '#c8a040', 1);
}
function drawKagaribi(ctx, f) {
  // 三脚
  line(ctx, 16, 30, 6, 64, '#3a2414', 3); line(ctx, 16, 30, 26, 64, '#3a2414', 3); line(ctx, 16, 30, 16, 64, '#2a180c', 2.6);
  line(ctx, 9, 52, 23, 52, '#2a180c', 1.6);
  // 鉄のかご
  ctx.beginPath(); ctx.moveTo(4, 20); ctx.lineTo(28, 20); ctx.lineTo(22, 32); ctx.lineTo(10, 32); ctx.closePath();
  fs(ctx, '#2a2420', '#0c0a08', 1.1);
  ctx.strokeStyle = '#5a4a3a'; ctx.lineWidth = 0.9; for (let x = 7; x < 27; x += 4) { ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x + (16 - x) * 0.25, 32); ctx.stroke(); }
  // 薪
  line(ctx, 8, 21, 22, 15, '#5a3218', 2.6); line(ctx, 24, 21, 11, 15, '#6a3a1c', 2.6);
  // 火
  ctx.globalCompositeOperation = 'lighter'; glow(ctx, 16, 12, 18, '#ff9a3a', 0.5); ctx.globalCompositeOperation = 'source-over';
  flame(ctx, 16, 21, 22, 22 + (f % 2) * 3, f / 4, ['#e8401a', '#ffa030', '#fff4b0']);
  const r = rng(f + 3);
  for (let i = 0; i < 4; i++) { ctx.fillStyle = '#ffd070'; ctx.fillRect(8 + r() * 16, 4 - r() * 4 + f, 1.2, 1.2); }
}
function drawOnsen(ctx, f) {
  // 湯
  ell(ctx, 60, 40, 54, 11); fs(ctx, lin(ctx, 0, 30, 0, 50, [0, '#bfeee4', 1, '#5ab8b0']), null);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.8;
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(40 + i * 14 + f * 1.5, 40, 6, 1.5, 0, 0, Math.PI); ctx.stroke(); }
  // 岩の縁
  const r = rng(61);
  for (let i = 0; i < 12; i++) {
    const a = Math.PI * (i / 11), x = 60 - Math.cos(a) * 56, y = 44 + Math.sin(a) * 9;
    ell(ctx, x, y, 7 + r() * 4, 5 + r() * 2); fs(ctx, lin(ctx, 0, y - 6, 0, y + 6, [0, '#8a8478', 1, '#4a463e']), '#24221e', 1);
  }
  for (const x of [6, 114]) { ell(ctx, x, 38, 8, 7); fs(ctx, lin(ctx, 0, 30, 0, 46, [0, '#8a8478', 1, '#4a463e']), '#24221e', 1); }
  // 湯けむり
  for (let k = 0; k < 4; k++) {
    const ph = ((f / 4) + k * 0.27) % 1;
    const x = 26 + k * 22 + Math.sin(ph * 6 + k) * 4, y = 34 - ph * 30;
    ctx.fillStyle = `rgba(255,255,255,${0.42 * Math.sin(ph * Math.PI)})`;
    ell(ctx, x, y, 7 + ph * 8, 4 + ph * 5); ctx.fill();
  }
}
function drawSnowman(ctx) {
  ctx.fillStyle = 'rgba(120,150,190,0.3)'; ell(ctx, 18, 46, 15, 2.5); ctx.fill();
  ell(ctx, 18, 34, 13, 12); fs(ctx, rad(ctx, 13, 28, 1, 15, [0, '#ffffff', 0.7, '#e8f0fa', 1, '#b4c6dc']), '#6a7e9c', 1.1);
  ell(ctx, 18, 17, 9.5, 9); fs(ctx, rad(ctx, 15, 13, 1, 11, [0, '#ffffff', 0.7, '#eaf2fa', 1, '#b4c6dc']), '#6a7e9c', 1.1);
  // 炭の目・口
  ctx.fillStyle = '#1a1a1a'; ell(ctx, 15, 16, 1.4, 1.6); ctx.fill(); ell(ctx, 21.5, 16, 1.4, 1.6); ctx.fill();
  ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(18.2, 19, 3, 0.3, Math.PI - 0.3); ctx.stroke();
  ctx.fillStyle = '#e86a2a'; poly(ctx, [18, 17.5, 22.5, 18.6, 18, 19.6]); ctx.fill();
  ctx.fillStyle = 'rgba(255,120,120,0.35)'; ell(ctx, 13, 19.5, 1.8, 1); ctx.fill(); ell(ctx, 23, 19.5, 1.8, 1); ctx.fill();
  // 枝の腕
  line(ctx, 6, 30, -0, 24, '#5a3a20', 1.4); line(ctx, 30, 30, 35, 23, '#5a3a20', 1.4); line(ctx, 2, 26, 0, 22, '#5a3a20', 1);
  // わら帽子
  ctx.beginPath(); ctx.moveTo(6, 10.5); ctx.quadraticCurveTo(18, -2, 30, 10.5); ctx.quadraticCurveTo(18, 8, 6, 10.5);
  fs(ctx, lin(ctx, 0, 2, 0, 11, [0, '#e0c070', 1, '#a8843a']), '#5a4418', 1);
  ctx.strokeStyle = 'rgba(90,60,20,0.5)'; ctx.lineWidth = 0.6; for (let x = 10; x < 28; x += 3) { ctx.beginPath(); ctx.moveTo(18, 3); ctx.lineTo(x, 9.5); ctx.stroke(); }
  // ボタン
  ctx.fillStyle = '#2a2a2a'; ell(ctx, 18, 30, 1.4, 1.4); ctx.fill(); ell(ctx, 18, 36, 1.4, 1.4); ctx.fill();
}
function drawFence(ctx) {
  for (let x = 4; x < 72; x += 8) { rrect(ctx, x - 1.6, 4, 3.2, 26, 1.4); fs(ctx, lin(ctx, x - 1.6, 0, x + 1.6, 0, [0, '#d8c88a', 1, '#8a7a44']), '#3e361a', 0.8); line(ctx, x - 1.6, 14, x + 1.6, 14, '#6a5a2a', 0.8); }
  for (const y of [9, 20]) { rrect(ctx, 0, y - 1.4, 72, 2.8, 1.4); fs(ctx, lin(ctx, 0, y - 1.4, 0, y + 1.4, [0, '#e0d090', 1, '#8a7a44']), '#3e361a', 0.8); }
  ctx.fillStyle = '#1a1a1a'; for (let x = 4; x < 72; x += 8) for (const y of [9, 20]) { ctx.fillRect(x - 1.8, y - 1.6, 3.6, 0.9); ctx.fillRect(x - 1.8, y + 0.7, 3.6, 0.9); }
}
function drawBridgeRail(ctx) {
  const R = '#c8402e', RD = '#7a1e14', RO = '#3a0c08';
  rrect(ctx, 0, 7, 108, 4, 1.5); fs(ctx, lin(ctx, 0, 7, 0, 11, [0, '#e0604a', 1, RD]), RO, 0.9);
  rrect(ctx, 0, 19, 108, 3.5, 1.5); fs(ctx, lin(ctx, 0, 19, 0, 22.5, [0, '#d8503c', 1, RD]), RO, 0.9);
  for (let x = 14; x < 100; x += 10) line(ctx, x, 11, x, 19, RD, 1.6);
  for (const x of [4, 54, 104]) {
    rrect(ctx, x - 3, 8, 6, 24, 1); fs(ctx, lin(ctx, x - 3, 0, x + 3, 0, [0, '#e0604a', 1, RD]), RO, 0.9);
    // 擬宝珠（青銅）
    ell(ctx, x, 5.5, 3.4, 3); fs(ctx, rad(ctx, x - 1, 4.5, 0.5, 4, [0, '#c8e0b0', 0.5, '#6a9a6a', 1, '#2e4a34']), '#1a2a1e', 0.8);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + 1.6, 2, x, 3); ctx.quadraticCurveTo(x - 1.6, 2, x, 0); fs(ctx, '#6a9a6a', '#1a2a1e', 0.6);
    ctx.fillStyle = '#2e4a34'; ctx.fillRect(x - 3.2, 8, 6.4, 1.6);
  }
}
function drawNoren(ctx) {
  rrect(ctx, 0, 2, 60, 3, 1.5); fs(ctx, '#5a3820', '#24140a', 0.8);
  for (let i = 0; i < 3; i++) {
    const x = 1.5 + i * 19.2;
    ctx.beginPath(); ctx.moveTo(x, 5); ctx.lineTo(x + 18, 5); ctx.lineTo(x + 18, 40); ctx.quadraticCurveTo(x + 9, 42, x, 40); ctx.closePath();
    fs(ctx, lin(ctx, 0, 5, 0, 42, [0, '#2c4c80', 1, '#182e58']), '#0a1430', 0.9);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x + 4, 7); ctx.lineTo(x + 4, 38); ctx.stroke();
  }
  // 白抜きの紋（波）
  ctx.strokeStyle = 'rgba(245,245,235,0.9)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(30, 22, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(23, 24); ctx.quadraticCurveTo(26.5, 18, 30, 24); ctx.quadraticCurveTo(33.5, 30, 37, 24); ctx.stroke();
}
function drawYatai(ctx) {
  // 屋根（布）
  ctx.beginPath(); ctx.moveTo(2, 24); ctx.lineTo(10, 6); ctx.lineTo(100, 6); ctx.lineTo(108, 24); ctx.closePath();
  fs(ctx, lin(ctx, 0, 6, 0, 24, [0, '#f2ead8', 1, '#cfc4a8']), '#4a4030', 1.1);
  ctx.save(); ctx.clip(); ctx.fillStyle = '#c84a38';
  for (let x = 0; x < 110; x += 16) { poly(ctx, [x + 8, 6, x + 16, 6, x + 18, 24, x + 8, 24]); ctx.fill(); }
  ctx.restore();
  for (let x = 4; x < 108; x += 8) { ctx.beginPath(); ctx.arc(x + 4, 24, 4, 0, Math.PI); fs(ctx, (x / 8) % 2 ? '#c84a38' : '#f2ead8', '#4a4030', 0.7); }
  // 柱
  for (const x of [8, 100]) { rrect(ctx, x - 2, 24, 4, 60, 1); fs(ctx, '#7a5030', '#2a1a0c', 0.9); }
  // 台
  ctx.fillStyle = lin(ctx, 0, 54, 0, 84, [0, '#a87a4a', 1, '#6a4a2a']); ctx.fillRect(6, 56, 98, 28);
  ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = 1; ctx.strokeRect(6, 56, 98, 28);
  for (let y = 63; y < 84; y += 7) line(ctx, 7, y, 103, y, 'rgba(40,24,10,0.5)', 0.7);
  // ざると野菜（赤かぶ・りんご・漬物の樽）
  const basket = (x) => { ctx.beginPath(); ctx.ellipse(x, 55, 13, 4, 0, 0, Math.PI); ctx.lineTo(x - 13, 55); fs(ctx, '#c8a060', '#5a4020', 0.9); ell(ctx, x, 54.5, 13, 3); fs(ctx, '#d8b070', '#5a4020', 0.8); };
  basket(24);
  for (const [x, y] of [[18, 50], [24, 49], [30, 50], [21, 46]]) { ell(ctx, x, y, 3.6, 3.2); fs(ctx, rad(ctx, x - 1, y - 1, 0.4, 4, [0, '#ff8aa0', 1, '#a8183a']), '#4a0818', 0.7); line(ctx, x, y - 3, x + 0.5, y - 6, '#4a8a2a', 1); }
  basket(54);
  for (const [x, y] of [[48, 50], [54, 49], [60, 50], [51, 46], [57, 46]]) { ell(ctx, x, y, 3.2, 3); fs(ctx, rad(ctx, x - 1, y - 1, 0.4, 4, [0, '#ffd080', 1, '#d0401a']), '#5a1808', 0.7); }
  // 樽
  rrect(ctx, 74, 38, 22, 18, 3); fs(ctx, lin(ctx, 74, 0, 96, 0, [0, '#c8945a', 1, '#7a5028']), '#3a2410', 1);
  line(ctx, 74, 43, 96, 43, '#3a3a3a', 1.2); line(ctx, 74, 51, 96, 51, '#3a3a3a', 1.2);
  ell(ctx, 85, 38, 11, 2.4); fs(ctx, '#a8c060', '#3a4a1a', 0.8);
  // 値札（数字・字なし）
  rrect(ctx, 34, 60, 10, 8, 1); fs(ctx, '#f4f0e0', '#4a4030', 0.7);
}
function drawLamp(ctx) {
  rrect(ctx, 6, 78, 12, 6, 1.5); fs(ctx, '#2a2c30', '#0a0b0c', 1);
  rrect(ctx, 10, 26, 4, 54, 1.5); fs(ctx, lin(ctx, 10, 0, 14, 0, [0, '#4a4e56', 1, '#16181c']), '#0a0b0c', 0.9);
  ell(ctx, 12, 60, 3.6, 1.6); fs(ctx, '#2a2c30', '#0a0b0c', 0.8);
  // 灯
  poly(ctx, [5, 12, 19, 12, 17, 26, 7, 26]);
  fs(ctx, rad(ctx, 12, 18, 1, 10, [0, '#fffbe0', 0.5, '#ffe08a', 1, '#e8a040']), '#1a1a1a', 1);
  line(ctx, 12, 12, 12, 26, 'rgba(30,30,30,0.7)', 0.8);
  poly(ctx, [3, 12, 12, 4, 21, 12]); fs(ctx, '#2a2c30', '#0a0b0c', 1);
  rrect(ctx, 6, 26, 12, 2.5, 1); fs(ctx, '#2a2c30', '#0a0b0c', 0.8);
  ell(ctx, 12, 3, 1.6, 1.6); fs(ctx, '#3a3c40', '#0a0b0c', 0.6);
}

// ---------------------------------------------------------------- 沖縄の小物（ステージ8）
/** シーサー（正面向き）。(cx, by) は台座の下端の中央。open: 口を開けた阿形／閉じた吽形 */
export function drawShisa(ctx, cx, by, s = 1, open = true) {
  ctx.save(); ctx.translate(cx, by); ctx.scale(s, s);
  const B = '#d4793c', BL = '#f0a868', BD = '#8a3e1a', O = '#4a1e0a';
  // 台座（漆喰の白い台）
  rrect(ctx, -13, -6, 26, 6, 1.5); fs(ctx, lin(ctx, 0, -6, 0, 0, [0, '#f4f0e6', 1, '#b8b0a0']), '#5a5248', 1);
  // しっぽ（後ろで炎のように巻き上がる）
  ctx.beginPath(); ctx.moveTo(6, -10); ctx.bezierCurveTo(16, -12, 17, -22, 12, -27); ctx.bezierCurveTo(14, -22, 11, -18, 7, -16); ctx.closePath();
  fs(ctx, lin(ctx, 0, -27, 0, -10, [0, BL, 1, BD]), O, 0.9);
  ctx.strokeStyle = rgba(O, 0.6); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(13, -23, 2, 0, Math.PI * 1.5); ctx.stroke();
  // 胴と前足
  poly(ctx, [-9, -6, 9, -6, 7.5, -19, -7.5, -19]); fs(ctx, lin(ctx, -9, 0, 9, 0, [0, BL, 0.5, B, 1, BD]), O, 1);
  for (const x of [-5, 5]) {
    rrect(ctx, x - 2.6, -17, 5.2, 11.5, 2); fs(ctx, lin(ctx, x - 2.6, 0, x + 2.6, 0, [0, BL, 1, BD]), O, 0.9);
    ell(ctx, x, -6.5, 3.4, 1.8); fs(ctx, B, O, 0.8);
    line(ctx, x - 1, -7.6, x - 1, -5.6, O, 0.5); line(ctx, x + 1, -7.6, x + 1, -5.6, O, 0.5);
  }
  // たてがみ（巻き毛の輪）
  for (let k = 0; k < 11; k++) {
    const a = Math.PI * (0.9 + k / 10 * 1.2), x = Math.cos(a) * 12.5, y = -25 + Math.sin(a) * 11.5;
    ell(ctx, x, y, 3.6, 3.4); fs(ctx, lin(ctx, 0, y - 3, 0, y + 3, [0, BL, 1, B]), O, 0.8);
    ctx.strokeStyle = rgba(O, 0.7); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(x, y, 1.5, a, a + 4.2); ctx.stroke();
  }
  for (const sx of [-1, 1]) { ell(ctx, sx * 12, -16.5, 3.2, 3.6); fs(ctx, B, O, 0.8); ctx.strokeStyle = rgba(O, 0.7); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(sx * 12, -16.5, 1.4, 0, 4.4); ctx.stroke(); }
  // 頭
  ell(ctx, 0, -24, 10, 9); fs(ctx, rad(ctx, -3, -28, 1, 12, [0, '#ffc890', 0.5, B, 1, BD]), O, 1.1);
  // 耳
  for (const sx of [-1, 1]) { ell(ctx, sx * 9.5, -31, 2.6, 2, sx * 0.5); fs(ctx, B, O, 0.8); }
  // 太いまゆ（巻き）
  for (const sx of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(sx * 1.2, -28.5); ctx.quadraticCurveTo(sx * 5, -33, sx * 8.5, -29.5); ctx.quadraticCurveTo(sx * 7.5, -31.5, sx * 5, -30.2); ctx.quadraticCurveTo(sx * 3, -29.6, sx * 1.2, -28.5);
    fs(ctx, BD, O, 0.7);
  }
  // 大きな目
  for (const sx of [-1, 1]) {
    ell(ctx, sx * 4.4, -26.2, 3.1, 2.8); fs(ctx, '#fffaf0', O, 0.9);
    ell(ctx, sx * 4.0, -26, 1.6, 1.7); ctx.fillStyle = '#1a0e06'; ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(sx * 4.0 - 1, -27.2, 0.9, 0.9);
  }
  // 鼻
  ell(ctx, 0, -22.4, 4.2, 2.2); fs(ctx, lin(ctx, 0, -24.6, 0, -20.2, [0, '#e08a4a', 1, BD]), O, 0.9);
  ell(ctx, -1.7, -22, 0.9, 0.6); ctx.fillStyle = O; ctx.fill(); ell(ctx, 1.7, -22, 0.9, 0.6); ctx.fill();
  if (open) {
    // 阿：大きく開けた口（歯と舌）
    ell(ctx, 0, -17.6, 6.6, 3.6); fs(ctx, '#7a1410', O, 1);
    ell(ctx, 0, -16.4, 3.6, 1.8); ctx.fillStyle = '#e8606a'; ctx.fill();
    ctx.fillStyle = '#fffaf0';
    for (let k = -2; k <= 2; k++) ctx.fillRect(k * 2.2 - 0.8, -21, 1.6, 1.6);
    for (const sx of [-1, 1]) { poly(ctx, [sx * 5.4, -14.6, sx * 4.4, -17.6, sx * 3.4, -14.6]); ctx.fill(); poly(ctx, [sx * 5.4, -20.6, sx * 4.6, -18, sx * 3.6, -20.6]); ctx.fill(); }
  } else {
    // 吽：閉じた口と、上向きの牙
    ctx.beginPath(); ctx.moveTo(-6.6, -18.6); ctx.quadraticCurveTo(-3, -16.6, 0, -18); ctx.quadraticCurveTo(3, -16.6, 6.6, -18.6);
    ctx.strokeStyle = O; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#fffaf0';
    for (const sx of [-1, 1]) { poly(ctx, [sx * 4.6, -17.4, sx * 3.8, -20.4, sx * 3, -17.4]); fs(ctx, '#fffaf0', O, 0.5); }
    ctx.beginPath(); ctx.ellipse(0, -16.8, 5.4, 2.2, 0, 0, Math.PI); ctx.strokeStyle = rgba(O, 0.5); ctx.lineWidth = 0.6; ctx.stroke();
  }
  // つや（焼き物の光）
  ctx.fillStyle = 'rgba(255,240,215,0.5)'; ell(ctx, -5.5, -29.5, 2.4, 1.1, -0.4); ctx.fill();
  ctx.restore();
}
function drawShisaPair(ctx) {
  drawShisa(ctx, 16, 46, 1, true);
  drawShisa(ctx, 54, 46, 1, false);
}

/** ハイビスカスの花（5枚の花びら・長いしべ） */
function hibiscusFlower(ctx, x, y, r, rot, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  for (let k = 0; k < 5; k++) {
    const a = k * Math.PI * 2 / 5;
    ctx.save(); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-r * 0.75, -r * 0.35, -r * 0.7, -r * 1.05, 0, -r); ctx.bezierCurveTo(r * 0.7, -r * 1.05, r * 0.75, -r * 0.35, 0, 0);
    fs(ctx, lin(ctx, 0, -r, 0, 0, [0, shade(col, 0.25), 0.7, col, 1, shade(col, -0.35)]), shade(col, -0.55), 0.6);
    ctx.restore();
  }
  ell(ctx, 0, 0, r * 0.28, r * 0.28); ctx.fillStyle = shade(col, -0.55); ctx.fill();
  line(ctx, 0, 0, r * 0.95, -r * 0.55, '#ffe0a0', 0.9);
  ctx.fillStyle = '#ffd040'; for (let k = 0; k < 4; k++) { ell(ctx, r * (0.7 + k * 0.08), -r * (0.38 + k * 0.05), 0.7, 0.7); ctx.fill(); }
  ctx.restore();
}
function drawHibiscus(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ell(ctx, 30, 39, 26, 2); ctx.fill();
  foliageBlob(ctx, 16, 28, 14, 11, '#2e7a34', 81); foliageBlob(ctx, 44, 28, 14, 11, '#2e7a34', 82); foliageBlob(ctx, 30, 20, 17, 14, '#358a3a', 83);
  // 光沢のある葉（ぎざぎざの縁の葉）
  const r = rng(84);
  for (let i = 0; i < 12; i++) {
    const x = 6 + r() * 48, y = 10 + r() * 26;
    ctx.save(); ctx.translate(x, y); ctx.rotate(r() * 6.28);
    leafShape(ctx, 4, 2.4); fs(ctx, r() < 0.5 ? '#3e9a42' : '#5ab84e', '#164a1a', 0.6);
    line(ctx, -3.5, 0, 3.5, 0, 'rgba(220,255,200,0.6)', 0.4);
    ctx.restore();
  }
  for (const [x, y, rr, c] of [[14, 22, 6, '#e8202e'], [33, 12, 7, '#f02a3a'], [47, 24, 6, '#e8202e'], [26, 29, 5, '#ff6a3a'], [42, 9, 4.5, '#f02a3a']]) hibiscusFlower(ctx, x, y, rr, r() * 6.28, c);
  // つぼみ
  for (const [x, y] of [[8, 14], [52, 16]]) { ell(ctx, x, y, 1.6, 3, 0.4); fs(ctx, '#d81a2a', '#5a0a0e', 0.5); }
}

/** ヤシ（ココヤシ）。幹は節の輪、葉は羽のように垂れる */
function palmFrond(ctx, x0, y0, ang, len, seed, back = false) {
  const r = rng(seed);
  // 葉軸：上へ伸びてから弓なりに垂れる
  const cx = x0 + Math.cos(ang) * len * 0.55, cy = y0 + Math.sin(ang) * len * 0.55 - len * 0.18;
  const ex = x0 + Math.cos(ang) * len, ey = y0 + Math.sin(ang) * len * 0.25 + len * 0.42;
  const pt = (t) => [(1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * ex, (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * ey];
  const dark = back ? '#24561e' : '#2e6e26', light = back ? '#4e8a36' : '#8ccc52';
  for (let i = 1; i <= 20; i++) {
    const t = i / 20, [x, y] = pt(t), [x2, y2] = pt(Math.min(1, t + 0.05));
    const dx = x2 - x, dy = y2 - y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const ll = (1 - t * 0.55) * 14 * (0.85 + r() * 0.3);
    // 小葉は葉軸から前へ、下へ垂れる（左右2枚）
    for (const sd of [-1, 1]) {
      const nx = -uy * sd, ny = ux * sd;
      const tx = x + ux * ll * 0.55 + nx * ll * 0.35, ty = y + uy * ll * 0.55 + Math.abs(ny) * ll * 0.2 + ll * 0.65;
      const mx = x + ux * ll * 0.3 + nx * ll * 0.4, my = y + uy * ll * 0.3 + ny * ll * 0.4;
      ctx.beginPath(); ctx.moveTo(x - ux * 1.2, y - uy * 1.2); ctx.quadraticCurveTo(mx, my - 1.2, tx, ty); ctx.quadraticCurveTo(mx + ux * 1.5, my + 0.8, x + ux * 1.2, y + uy * 1.2); ctx.closePath();
      ctx.fillStyle = mix(dark, light, 0.25 + r() * 0.6 - (sd > 0 ? 0.15 : 0)); ctx.fill();
    }
  }
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, ex, ey);
  ctx.strokeStyle = back ? '#1e3a12' : '#2a4a18'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
  ctx.strokeStyle = back ? '#6a8a40' : '#b8d878'; ctx.lineWidth = 0.8; ctx.stroke();
}
function drawPalm(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ell(ctx, 36, 149, 14, 2); ctx.fill();
  // 幹（右へゆるく反る）
  const tr = (t) => [36 + Math.pow(t, 1.6) * 16, 150 - t * 108];
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) { const [x, y] = tr(i / 20); const w = 5.2 - i / 20 * 1.8; i ? ctx.lineTo(x - w, y) : ctx.moveTo(x - w, y); }
  for (let i = 20; i >= 0; i--) { const [x, y] = tr(i / 20); const w = 5.2 - i / 20 * 1.8; ctx.lineTo(x + w, y); }
  ctx.closePath(); fs(ctx, lin(ctx, 34, 0, 48, 0, [0, '#b89a74', 0.5, '#8a6a48', 1, '#4e3a26']), '#2a1e12', 1.1);
  for (let i = 1; i < 20; i++) { const [x, y] = tr(i / 20); const w = 5.2 - i / 20 * 1.8; ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x, y + 1.8, x + w, y - 0.4); ctx.strokeStyle = 'rgba(40,26,14,0.7)'; ctx.lineWidth = 0.8; ctx.stroke(); }
  const [hx, hy] = tr(1);
  // 奥の葉 → 実 → 手前の葉
  palmFrond(ctx, hx, hy, -2.75, 48, 1, true); palmFrond(ctx, hx, hy, -0.35, 48, 2, true); palmFrond(ctx, hx, hy, -1.75, 34, 3, true); palmFrond(ctx, hx, hy, -1.25, 36, 8, true);
  for (const [x, y] of [[hx - 4, hy + 4], [hx + 3, hy + 5], [hx - 0.5, hy + 8]]) { ell(ctx, x, y, 3.6, 3.8); fs(ctx, rad(ctx, x - 1, y - 1.5, 0.5, 4.5, [0, '#a8a040', 1, '#4e5a18']), '#2a2a0a', 0.8); }
  palmFrond(ctx, hx, hy, -3.1, 47, 4); palmFrond(ctx, hx, hy, -0.05, 47, 5); palmFrond(ctx, hx, hy, -2.35, 44, 6); palmFrond(ctx, hx, hy, -0.75, 44, 7); palmFrond(ctx, hx, hy, -1.55, 28, 9);
  ell(ctx, hx, hy, 4, 3); fs(ctx, '#6a5a2a', '#2a1e0a', 0.8);
}

/** アダン：タコの足のような支柱根、らせんに並ぶ剣のような葉、パイナップルのような実 */
function adanRosette(ctx, x, y, s, seed) {
  const r = rng(seed);
  for (let i = 0; i < 13; i++) {
    const a = -Math.PI / 2 + (i / 12 - 0.5) * 3.6 + (r() - 0.5) * 0.2, L = (20 + r() * 10) * s;
    const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L * 0.7 + Math.abs(Math.cos(a)) * L * 0.35;
    const mx = x + Math.cos(a) * L * 0.55, my = y + Math.sin(a) * L * 0.55 - 3 * s;
    const nx = -Math.sin(a) * 2 * s, ny = Math.cos(a) * 2 * s;
    ctx.beginPath(); ctx.moveTo(x + nx, y + ny); ctx.quadraticCurveTo(mx + nx, my + ny, ex, ey); ctx.quadraticCurveTo(mx - nx, my - ny, x - nx, y - ny); ctx.closePath();
    fs(ctx, lin(ctx, x, y - L, x, y + L * 0.4, [0, '#7ab84a', 0.5, '#3e8a34', 1, '#24561e']), '#173a14', 0.7);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.strokeStyle = 'rgba(210,240,170,0.5)'; ctx.lineWidth = 0.5; ctx.stroke();
  }
}
function drawAdan(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ell(ctx, 45, 99, 30, 2.5); ctx.fill();
  const BR = '#7a6248', BO = '#2e2214';
  // 支柱根
  for (const [x0, x1] of [[24, 40], [32, 42], [44, 46], [58, 50], [66, 52], [38, 44]]) {
    ctx.beginPath(); ctx.moveTo(x0 - 1.6, 100); ctx.quadraticCurveTo((x0 + x1) / 2 - 3, 84, x1 - 1.6, 70); ctx.lineTo(x1 + 1.6, 70); ctx.quadraticCurveTo((x0 + x1) / 2 + 3, 84, x0 + 1.6, 100); ctx.closePath();
    fs(ctx, lin(ctx, 0, 70, 0, 100, [0, '#9a8060', 1, '#5a4430']), BO, 0.8);
    for (let y = 76; y < 98; y += 5) { const t = (y - 70) / 30, x = x1 + (x0 - x1) * t; line(ctx, x - 1.4, y, x + 1.4, y + 0.6, 'rgba(40,26,14,0.6)', 0.6); }
  }
  // 幹と枝
  ctx.beginPath(); ctx.moveTo(41, 74); ctx.quadraticCurveTo(38, 56, 26, 42); ctx.lineTo(31, 40); ctx.quadraticCurveTo(44, 52, 47, 62); ctx.quadraticCurveTo(52, 50, 64, 36); ctx.lineTo(68, 39); ctx.quadraticCurveTo(56, 54, 51, 74); ctx.closePath();
  fs(ctx, lin(ctx, 30, 0, 64, 0, [0, '#a08868', 0.5, BR, 1, '#4a3a28']), BO, 1);
  for (let y = 46; y < 74; y += 4.5) line(ctx, 40 + (74 - y) * -0.2, y, 46 + (74 - y) * -0.1, y + 1, 'rgba(40,26,14,0.55)', 0.6);
  // 実（パイナップルのような集合果）
  const fx = 50, fy = 50;
  line(ctx, fx - 2, fy - 12, fx, fy - 7, '#3a2a14', 1.4);
  ell(ctx, fx, fy, 7.4, 9); fs(ctx, rad(ctx, fx - 2, fy - 3, 1, 10, [0, '#ffd04a', 0.55, '#f08a1e', 1, '#b04a10']), '#5a2408', 1);
  ctx.save(); ell(ctx, fx, fy, 7.4, 9); ctx.clip();
  ctx.strokeStyle = 'rgba(120,50,10,0.6)'; ctx.lineWidth = 0.6;
  for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(fx - 9, fy + k * 4 - 5); ctx.lineTo(fx + 9, fy + k * 4 + 5); ctx.stroke(); ctx.beginPath(); ctx.moveTo(fx - 9, fy + k * 4 + 5); ctx.lineTo(fx + 9, fy + k * 4 - 5); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,250,200,0.55)'; ell(ctx, fx - 3, fy - 4, 1.8, 2.6, -0.3); ctx.fill();
  // 葉のかたまり
  adanRosette(ctx, 28, 40, 1, 91); adanRosette(ctx, 66, 36, 1.05, 92); adanRosette(ctx, 46, 30, 0.8, 93);
}

/** さとうきび：節のある茎、細長い葉、銀色の穂 */
function drawSugarcane(ctx) {
  const r = rng(101);
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ell(ctx, 30, 109, 24, 2); ctx.fill();
  const stalks = [];
  for (let i = 0; i < 7; i++) stalks.push([9 + i * 7 + (r() - 0.5) * 3, 30 + r() * 34, (r() - 0.5) * 0.16]);
  const tip = (x, top, lean, y) => x + Math.sin(lean) * (110 - y);
  // 葉：茎の上のほうから長く出て、弓なりに垂れる
  const leaves = (back) => {
    for (const [x, top, lean] of stalks) {
      for (let k = 0; k < (back ? 3 : 4); k++) {
        const y = top + 4 + k * (back ? 12 : 8) + r() * 4, side = (k + (back ? 1 : 0)) % 2 ? -1 : 1, L = 22 + r() * 16;
        const sx = tip(x, top, lean, y);
        ctx.beginPath(); ctx.moveTo(sx, y); ctx.quadraticCurveTo(sx + side * L * 0.5, y - 16 - r() * 6, sx + side * L, y + 2 + r() * 12);
        ctx.quadraticCurveTo(sx + side * L * 0.5, y - 12, sx, y + 2.4); ctx.closePath();
        ctx.fillStyle = back ? mix('#2e5a22', '#4a7a30', r()) : mix('#5a9a38', '#b4d468', r()); ctx.fill();
        if (!back) { ctx.beginPath(); ctx.moveTo(sx, y + 1); ctx.quadraticCurveTo(sx + side * L * 0.5, y - 14, sx + side * L, y + 4); ctx.strokeStyle = 'rgba(240,255,210,0.35)'; ctx.lineWidth = 0.4; ctx.stroke(); }
      }
    }
  };
  leaves(true);
  for (const [x, top, lean] of stalks) {
    ctx.save(); ctx.translate(x, 110); ctx.rotate(lean);
    rrect(ctx, -2.2, top - 110, 4.4, 110 - top, 1.6); fs(ctx, lin(ctx, -2.2, 0, 2.2, 0, [0, '#d8c890', 0.35, '#a89a58', 0.75, '#7a5a5a', 1, '#4a3040']), '#2a1e1a', 0.8);
    for (let y = -5; y > top - 104; y -= 8 + r() * 3) { line(ctx, -2.5, y, 2.5, y, '#4a2e3a', 1.1); line(ctx, -2, y - 1.2, 2, y - 1.2, 'rgba(255,250,230,0.55)', 0.5); ell(ctx, 0.6, y - 2.2, 0.8, 0.6); ctx.fillStyle = 'rgba(90,60,40,0.6)'; ctx.fill(); }
    // 白い粉（ろう）
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-1.6, top - 110, 1.2, 110 - top);
    ctx.restore();
  }
  leaves(false);
  // 穂（冬に咲く銀色の穂：扇のように広がる）
  for (const [x, top, lean] of stalks.filter((_, i) => i % 2 === 0)) {
    const sx = tip(x, top, lean, top);
    line(ctx, sx, top + 2, sx + 1, top - 10, '#9a9a7a', 1);
    for (let k = 0; k < 9; k++) {
      const a = -Math.PI / 2 + (k / 8 - 0.5) * 1.2, L = 8 + r() * 5;
      ctx.beginPath(); ctx.moveTo(sx + 1, top - 8); ctx.quadraticCurveTo(sx + 1 + Math.cos(a) * L * 0.5, top - 8 + Math.sin(a) * L * 0.6, sx + 1 + Math.cos(a) * L, top - 8 + Math.sin(a) * L + 2);
      ctx.strokeStyle = rgba(mix('#fffaf0', '#c8b8d0', r()), 0.9); ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.stroke();
    }
  }
}

/** 赤瓦の平屋（寄棟の屋根に白い漆喰、棟の真ん中にシーサー） */
function drawRedroof(ctx) {
  const WD = '#6a4a30', WO = '#2a1a0e';
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ell(ctx, 80, 109, 74, 2.5); ctx.fill();
  // 石の基壇
  rrect(ctx, 10, 100, 140, 10, 1.5); fs(ctx, lin(ctx, 0, 100, 0, 110, [0, '#e8e0c8', 1, '#a8a088']), '#5a5040', 1);
  for (let x = 14; x < 148; x += 11) line(ctx, x, 100.5, x + 1, 109.5, 'rgba(90,80,64,0.6)', 0.6);
  // 壁と戸（雨端：軒下の縁側と柱）
  ctx.fillStyle = lin(ctx, 0, 62, 0, 100, [0, '#5a3e28', 1, '#3e2a1a']); ctx.fillRect(18, 64, 124, 36);
  for (let i = 0; i < 6; i++) {
    const x = 22 + i * 19.6;
    rrect(ctx, x, 68, 17, 30, 0.5); fs(ctx, lin(ctx, 0, 68, 0, 98, [0, '#c8a878', 1, '#8a6a44']), WO, 0.8);
    ctx.strokeStyle = 'rgba(60,36,18,0.6)'; ctx.lineWidth = 0.6;
    for (let y = 74; y < 98; y += 6) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 17, y); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x + 8.5, 68); ctx.lineTo(x + 8.5, 98); ctx.stroke();
  }
  rrect(ctx, 12, 97, 136, 4, 1); fs(ctx, lin(ctx, 0, 97, 0, 101, [0, '#a88a64', 1, '#6a5038']), WO, 0.8);
  for (const x of [14, 46, 78, 110, 142]) { rrect(ctx, x - 2, 58, 4, 41, 1); fs(ctx, lin(ctx, x - 2, 0, x + 2, 0, [0, '#8a6a48', 1, '#3e2a18']), WO, 0.8); }
  // 寄棟の赤瓦屋根
  const roof = () => { ctx.beginPath(); ctx.moveTo(2, 62); ctx.lineTo(44, 26); ctx.lineTo(116, 26); ctx.lineTo(158, 62); ctx.quadraticCurveTo(80, 66, 2, 62); ctx.closePath(); };
  roof(); fs(ctx, lin(ctx, 0, 26, 0, 64, [0, '#d86a42', 1, '#a83a22']), '#4a140a', 1.3);
  ctx.save(); roof(); ctx.clip();
  // 丸瓦の列と、その両わきの漆喰（下に向かって広がる）
  for (let i = -1; i <= 28; i++) {
    const u = i / 26, xt = 44 + u * 72, xb = 2 + u * 156;
    ctx.beginPath(); ctx.moveTo(xt - 1.4, 26); ctx.lineTo(xb - 2.4, 64); ctx.lineTo(xb + 2.4, 64); ctx.lineTo(xt + 1.4, 26); ctx.closePath();
    ctx.fillStyle = '#f2ede2'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(xt - 0.8, 26); ctx.lineTo(xb - 1.5, 64); ctx.lineTo(xb + 1.5, 64); ctx.lineTo(xt + 0.8, 26); ctx.closePath();
    ctx.fillStyle = lin(ctx, xb - 1.5, 0, xb + 1.5, 0, [0, '#f08a5a', 1, '#9a3218']); ctx.fill();
  }
  // 段の重なり
  for (let y = 31; y < 62; y += 5.5) { ctx.fillStyle = 'rgba(70,14,6,0.32)'; ctx.fillRect(0, y, 160, 1.2); ctx.fillStyle = 'rgba(255,250,240,0.55)'; ctx.fillRect(0, y + 1.2, 160, 0.6); }
  // 雨じみ
  ctx.fillStyle = 'rgba(60,40,30,0.15)'; ell(ctx, 50, 48, 10, 12); ctx.fill(); ell(ctx, 120, 52, 8, 10); ctx.fill();
  ctx.restore();
  // 隅棟（白い漆喰）と軒先
  for (const [x0, x1] of [[44, 3], [116, 157]]) { line(ctx, x0, 26, x1, 61.5, '#5a4e44', 4.4); line(ctx, x0, 26, x1, 61.5, '#f6f2e8', 3); }
  ctx.beginPath(); ctx.moveTo(2, 62); ctx.quadraticCurveTo(80, 66, 158, 62); ctx.strokeStyle = '#f4efe4'; ctx.lineWidth = 2.6; ctx.stroke();
  ctx.strokeStyle = '#4a140a'; ctx.lineWidth = 0.8; ctx.stroke();
  // 大棟
  rrect(ctx, 40, 21.5, 80, 6, 3); fs(ctx, lin(ctx, 0, 21.5, 0, 27.5, [0, '#ffffff', 1, '#cfc6b4']), '#5a4e44', 1);
  ctx.fillStyle = '#c8502e'; ctx.fillRect(42, 24.6, 76, 1.1);
  // 屋根のシーサー
  drawShisa(ctx, 80, 25, 0.55, true);
}

/** 石敢當（魔よけの石。字が刻まれている） */
function drawIshigantou(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ell(ctx, 15, 47, 13, 1.8); ctx.fill();
  poly(ctx, [5, 47, 25, 47, 24, 6, 15, 2.5, 6, 6]);
  fs(ctx, lin(ctx, 5, 0, 25, 0, [0, '#e8e2cc', 0.5, '#cfc6aa', 1, '#8a826a']), '#3a362c', 1.2);
  // 石灰岩の穴としみ
  const r = rng(111);
  for (let i = 0; i < 14; i++) { const x = 7 + r() * 16, y = 6 + r() * 38, pr = 0.4 + r() * 0.9; ell(ctx, x, y, pr * 1.2, pr); ctx.fillStyle = 'rgba(96,84,62,0.6)'; ctx.fill(); }
  ctx.fillStyle = 'rgba(70,90,60,0.35)'; ell(ctx, 9, 43, 4, 2); ctx.fill(); ell(ctx, 22, 41, 3, 1.6); ctx.fill();
  // 刻まれた字（彫りの影と、下の縁の光）
  ctx.font = `bold 9px 'Hiragino Mincho ProN','Yu Mincho','Noto Serif CJK JP','Noto Serif JP','IPAMincho','IPAGothic',serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ['石', '敢', '當'].forEach((ch, i) => {
    const y = 13 + i * 10.5;
    ctx.fillStyle = 'rgba(255,255,240,0.65)'; ctx.fillText(ch, 15.5, y + 0.7);
    ctx.fillStyle = '#3a3226'; ctx.fillText(ch, 15, y);
  });
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(6.5, 7, 1, 38);
}

/** 三線を立てた台（漆塗りの台・蛇皮の胴・黒い棹・カラクイ） */
function drawSanshinStand(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ell(ctx, 15, 59, 13, 1.6); ctx.fill();
  // 台（朱塗り）
  rrect(ctx, 3, 50, 24, 4, 1); fs(ctx, lin(ctx, 0, 50, 0, 54, [0, '#d8402e', 1, '#7a1a10']), '#3a0a06', 0.9);
  for (const x of [5, 23]) { rrect(ctx, x - 1, 53, 3, 7, 0.8); fs(ctx, '#8a1e14', '#3a0a06', 0.7); }
  rrect(ctx, 20, 28, 3, 23, 1); fs(ctx, lin(ctx, 20, 0, 23, 0, [0, '#d8402e', 1, '#7a1a10']), '#3a0a06', 0.8);
  // 棹（黒い漆）
  rrect(ctx, 13.6, 4, 2.8, 36, 1); fs(ctx, lin(ctx, 13.6, 0, 16.4, 0, [0, '#4a4a52', 0.4, '#1a1a1e', 1, '#000000']), '#000', 0.6);
  // 天（反った頭）
  ctx.beginPath(); ctx.moveTo(13.6, 5); ctx.quadraticCurveTo(13, 1, 16.5, 0.5); ctx.lineTo(16.6, 4); ctx.closePath(); fs(ctx, '#1a1a1e', '#000', 0.6);
  // カラクイ（糸巻き）
  for (const [y, s] of [[7, -1], [10, 1], [13, -1]]) { rrect(ctx, s < 0 ? 9 : 16, y - 0.9, 5, 1.8, 0.8); fs(ctx, '#2a1a10', '#000', 0.5); ell(ctx, s < 0 ? 9 : 21, y, 1.1, 1.3); fs(ctx, '#e8d8b0', '#4a3a20', 0.4); }
  // 胴（蛇皮）
  rrect(ctx, 6.5, 38, 17, 14, 3.5); fs(ctx, '#2a2218', '#000', 1);
  rrect(ctx, 7.8, 39.2, 14.4, 11.6, 3); fs(ctx, lin(ctx, 0, 39, 0, 51, [0, '#e8dcb8', 1, '#a8987a']), null);
  ctx.save(); rrect(ctx, 7.8, 39.2, 14.4, 11.6, 3); ctx.clip();
  ctx.fillStyle = 'rgba(60,46,26,0.55)';
  for (let y = 39; y < 52; y += 2.6) for (let x = 7 + ((y / 2.6) % 2) * 1.6; x < 23; x += 3.2) { ell(ctx, x, y, 1.2, 0.9); ctx.fill(); }
  ctx.fillStyle = 'rgba(40,30,16,0.55)'; ell(ctx, 12, 44, 2.4, 1.8); ctx.fill(); ell(ctx, 19, 47.5, 2, 1.6); ctx.fill();
  ctx.restore();
  // 胴巻き（ティーガー：赤い布）
  rrect(ctx, 6, 47, 18, 3.4, 1); fs(ctx, lin(ctx, 0, 47, 0, 50.4, [0, '#e04a5a', 1, '#8a1a2a']), '#3a0810', 0.6);
  ctx.fillStyle = '#f0c040'; for (let x = 8; x < 23; x += 3) ctx.fillRect(x, 48.2, 1.2, 1);
  // 駒と弦
  rrect(ctx, 12.5, 41.5, 5, 1.4, 0.4); fs(ctx, '#f0e8d0', '#5a4a30', 0.4);
  ctx.strokeStyle = 'rgba(255,250,230,0.85)'; ctx.lineWidth = 0.35;
  for (const dx of [-0.8, 0, 0.8]) { ctx.beginPath(); ctx.moveTo(15 + dx * 0.5, 6); ctx.lineTo(15 + dx, 46); ctx.stroke(); }
}

/** サンゴ（枝サンゴ・テーブルサンゴ・ノウサンゴ）と小さな魚 */
function drawCoral(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ell(ctx, 25, 35, 23, 1.8); ctx.fill();
  // ノウサンゴ（丸い）
  ell(ctx, 40, 30, 9, 6.5); fs(ctx, rad(ctx, 37, 27, 1, 10, [0, '#f8e4a0', 1, '#c89a48']), '#6a4a18', 0.9);
  ctx.save(); ell(ctx, 40, 30, 9, 6.5); ctx.clip(); ctx.strokeStyle = 'rgba(120,80,30,0.6)'; ctx.lineWidth = 0.6;
  for (let k = 0; k < 6; k++) { ctx.beginPath(); for (let x = 30; x <= 50; x += 1) { const y = 24 + k * 2.2 + Math.sin(x * 0.9 + k * 1.3) * 0.8; x > 30 ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
  ctx.restore();
  // 枝サンゴ（さんご色）
  const br = (x, y, a, L, w, d, r) => {
    const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L;
    line(ctx, x, y, ex, ey, '#8a2a40', w + 1.4); line(ctx, x, y, ex, ey, '#ff7aa8', w);
    if (d > 0) { br(ex, ey, a - 0.45 - r() * 0.2, L * 0.72, w * 0.78, d - 1, r); br(ex, ey, a + 0.4 + r() * 0.2, L * 0.72, w * 0.78, d - 1, r); }
    else { ell(ctx, ex, ey, w * 0.6, w * 0.6); ctx.fillStyle = '#ffd0e0'; ctx.fill(); }
  };
  const r = rng(121);
  br(18, 35, -Math.PI / 2 - 0.15, 9, 3.4, 3, r); br(12, 35, -Math.PI / 2 - 0.7, 7, 2.6, 2, r);
  ctx.strokeStyle = 'rgba(255,230,240,0.55)'; ctx.lineWidth = 0.6;
  // テーブルサンゴ（左奥）
  rrect(ctx, 1, 22, 13, 2.6, 1.3); fs(ctx, lin(ctx, 0, 22, 0, 25, [0, '#c8e0a0', 1, '#6a9a5a']), '#2a4a2a', 0.7);
  line(ctx, 7.5, 24.5, 7.5, 35, '#4a6a3a', 2);
  // 海藻
  ctx.strokeStyle = '#3a9a5a'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(30, 35); ctx.quadraticCurveTo(27, 28, 30, 22); ctx.quadraticCurveTo(33, 17, 30, 12); ctx.stroke();
  // 小さな青い魚（ルリスズメダイ）
  for (const [x, y] of [[34, 12], [42, 17]]) {
    ell(ctx, x, y, 2.6, 1.4); fs(ctx, '#3ab0ff', '#0a3a7a', 0.5);
    poly(ctx, [x + 2.2, y, x + 4.2, y - 1.4, x + 4.2, y + 1.4]); fs(ctx, '#3ab0ff', '#0a3a7a', 0.5);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 1.8, y - 0.6, 0.7, 0.7);
  }
}

export function defineProps() {
  defineSprite('item_coin', { w: 20, h: 24, frames: 8, draw: drawCoin });
  defineSprite('item_sarubobo', { w: 28, h: 32, draw: (ctx) => { glow(ctx, 14, 17, 14, '#ffb0a0', 0.45); drawSaruboboDoll(ctx, 14, 17, 1); } });
  defineSprite('item_skewer', { w: 30, h: 30, frames: 4, draw: drawSkewer });
  defineSprite('item_heart', { w: 24, h: 24, draw: drawHeart });
  for (let i = 0; i < ORB.length; i++) defineSprite(`item_orb_${i}`, { w: 36, h: 36, frames: 8, draw: (ctx, f) => drawOrb(ctx, f, ORB[i]) });
  defineSprite('prop_checkpoint', { w: 30, h: 72, frames: 2, draw: drawCheckpoint });
  defineSprite('prop_sign', { w: 40, h: 44, draw: drawSign });
  defineSprite('ui_up_hint', { w: 20, h: 20, frames: 2, ox: 10, oy: 20, draw: drawUpHint });
  const fx = (name, w, h, frames, draw) => defineSprite(name, { w, h, frames, ox: w / 2, oy: h / 2, draw });
  fx('fx_leaf', 20, 14, 4, (ctx, f) => drawLeafFx(ctx, f, 20, 14, false));
  fx('fx_leaf_big', 34, 26, 4, (ctx, f) => drawLeafFx(ctx, f, 34, 26, true));
  fx('fx_ukai', 26, 18, 4, (ctx, f) => drawCormorant(ctx, 12, 10, 1, [-0.9, 0, 0.9, 0][f]));
  fx('fx_bullet', 16, 16, 2, drawBullet);
  fx('fx_slash', 90, 70, 4, drawSlash);
  // 背景の小物
  const P = (name, w, h, draw, frames = 1) => defineSprite(name, { w, h, frames, draw });
  P('prop_toro', 36, 70, drawToro);
  P('prop_pine', 100, 120, drawPine);
  P('prop_cedar', 70, 160, drawCedar);
  P('prop_bamboo', 60, 140, drawBamboo);
  P('prop_rock', 52, 30, drawRock);
  P('prop_bush', 56, 32, drawBush);
  P('prop_grass', 36, 18, drawGrassTuft);
  P('prop_machiya', 150, 120, drawMachiya);
  P('prop_gassho', 180, 150, drawGassho);
  P('prop_castle_wall', 120, 80, drawCastleWall);
  P('prop_gate', 82, 90, drawGate);
  P('prop_torii_small', 82, 90, drawGate);
  P('prop_chochin', 24, 38, drawChochin);
  P('prop_kagaribi', 32, 64, drawKagaribi, 4);
  P('prop_onsen', 120, 56, drawOnsen, 4);
  P('prop_snowman', 36, 48, drawSnowman);
  P('prop_fence', 72, 30, drawFence);
  P('prop_bridge_rail', 108, 32, drawBridgeRail);
  P('prop_noren', 60, 44, drawNoren);
  P('prop_yatai_stall', 110, 84, drawYatai);
  P('prop_lamp', 24, 84, drawLamp);
  // 沖縄（ステージ8）
  P('prop_shisa', 70, 46, drawShisaPair);
  P('prop_shisa_a', 30, 42, (ctx) => drawShisa(ctx, 15, 42, 1, true));
  P('prop_shisa_un', 30, 42, (ctx) => drawShisa(ctx, 15, 42, 1, false));
  P('prop_hibiscus', 60, 40, drawHibiscus);
  P('prop_palm', 100, 152, drawPalm);
  P('prop_adan', 90, 100, drawAdan);
  P('prop_sugarcane', 60, 110, drawSugarcane);
  P('prop_redroof', 160, 110, drawRedroof);
  P('prop_ishigantou', 30, 48, drawIshigantou);
  P('prop_sanshin_stand', 30, 60, drawSanshinStand);
  P('prop_coral', 64, 46, (ctx) => { ctx.scale(1.28, 1.28); drawCoral(ctx); });
}
