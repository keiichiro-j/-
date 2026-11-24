// ボスの絵（担当：ボス）。名前は boss_<name>_<anim>。すべて右向きに描く（左向きは flip）
// 基準点は足元中央（ox=w/2, oy=h）。弾などの小物は中心
import { defineSprite } from '../gfx/atlas.js';

const TAU = Math.PI * 2;

// ---------- 共通の描き方 ----------
export const OL = '#2a1612';   // 輪郭線
function lin(ctx, x0, y0, x1, y1, stops) { const g = ctx.createLinearGradient(x0, y0, x1, y1); for (let i = 0; i < stops.length; i++) g.addColorStop(i / (stops.length - 1), stops[i]); return g; }
function rad(ctx, x, y, r0, r1, stops, ox = 0, oy = 0) { const g = ctx.createRadialGradient(x + ox, y + oy, r0, x, y, r1); for (let i = 0; i < stops.length; i++) g.addColorStop(i / (stops.length - 1), stops[i]); return g; }
// 輪郭つきで塗る（path は関数で作る）
function paint(ctx, path, fill, lw = 2.6, stroke = OL) {
  ctx.beginPath(); path(ctx); ctx.fillStyle = fill; ctx.fill();
  if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
}
function ell(x, y, rx, ry, rot = 0) { return (c) => c.ellipse(x, y, rx, ry, rot, 0, TAU); }
// 立体的な楕円（光は左上から）
function ball(ctx, x, y, rx, ry, light, mid, dark, lw = 2.6, rot = 0) {
  paint(ctx, ell(x, y, rx, ry, rot), rad(ctx, x, y, Math.min(rx, ry) * 0.1, Math.max(rx, ry) * 1.1, [light, mid, dark], -rx * 0.35, -ry * 0.4), lw);
}
function shine(ctx, x, y, rx, ry, a = 0.5) { ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, -0.5, 0, TAU); ctx.fill(); }
function blush(ctx, x, y, r) { ctx.fillStyle = rad(ctx, x, y, 0, r, ['rgba(255,110,120,0.65)', 'rgba(255,110,120,0)']); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
function glowDot(ctx, x, y, r, color) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rad(ctx, x, y, 0, r, [color, 'rgba(0,0,0,0)']); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore(); }
// 目。mode: normal | glow（予告）| angry | hurt | dizzy | closed
function eye(ctx, x, y, r, mode = 'normal', lookX = 0.25, iris = '#2b1a12') {
  if (mode === 'hurt') { ctx.strokeStyle = OL; ctx.lineWidth = r * 0.35; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - r * 0.7, y - r * 0.6); ctx.lineTo(x + r * 0.5, y); ctx.lineTo(x - r * 0.7, y + r * 0.6); ctx.stroke(); return; }
  if (mode === 'closed') { ctx.strokeStyle = OL; ctx.lineWidth = r * 0.3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y - r * 0.2, r * 0.75, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); return; }
  if (mode === 'dizzy') {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = OL; ctx.stroke();
    ctx.beginPath(); for (let i = 0; i < 26; i++) { const a = i * 0.55, rr = r * 0.85 * (i / 26); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke();
    return;
  }
  const glow = mode === 'glow' || mode === 'angry';
  ctx.fillStyle = glow ? '#fff9d0' : '#fff';
  ctx.beginPath(); ctx.ellipse(x, y, r * 0.86, r, 0, 0, TAU); ctx.fill();
  ctx.lineWidth = Math.max(1.6, r * 0.18); ctx.strokeStyle = OL; ctx.stroke();
  const ix = x + lookX * r * 0.6, iy = y + r * 0.12;
  ctx.fillStyle = glow ? (mode === 'angry' ? '#e0281e' : '#f0a400') : iris;
  ctx.beginPath(); ctx.ellipse(ix, iy, r * 0.55, r * 0.68, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = glow ? '#3a0800' : '#120806';
  ctx.beginPath(); ctx.ellipse(ix, iy, r * (glow ? 0.18 : 0.32), r * 0.46, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ix - r * 0.2, iy - r * 0.3, r * 0.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(ix + r * 0.22, iy + r * 0.25, r * 0.09, 0, TAU); ctx.fill();
  if (glow) glowDot(ctx, ix, iy, r * 2.2, mode === 'angry' ? 'rgba(255,60,40,0.7)' : 'rgba(255,210,60,0.7)');
  if (mode === 'angry') { ctx.strokeStyle = OL; ctx.lineWidth = r * 0.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - r * 1.0, y - r * 1.25); ctx.lineTo(x + r * 0.8, y - r * 0.75); ctx.stroke(); }
}
// 怒りマーク（むかっ）
function angerMark(ctx, x, y, s) {
  ctx.strokeStyle = '#e8231a'; ctx.lineWidth = s * 0.22; ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const cx = x + Math.cos(a) * s * 0.42, cy = y + Math.sin(a) * s * 0.42;
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.3, a + Math.PI * 0.75, a + Math.PI * 1.25); ctx.stroke();
  }
}
// 汗・湯気
function sweat(ctx, x, y, s) { paint(ctx, (c) => { c.moveTo(x, y - s); c.quadraticCurveTo(x + s * 0.7, y + s * 0.2, x, y + s * 0.6); c.quadraticCurveTo(x - s * 0.7, y + s * 0.2, x, y - s); }, '#bfe6ff', 1.4, '#3a6a8a'); }
function stars(ctx, x, y, r, n, ph) { for (let i = 0; i < n; i++) { const a = ph + i * TAU / n; star(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.35, 5); } }
function star(ctx, x, y, s) { paint(ctx, (c) => { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? s * 0.45 : s; i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); }, '#ffe066', 1.2); }

function def(name, w, h, frames, draw, ox, oy) { defineSprite(name, { w, h, frames, ox: ox ?? w / 2, oy: oy ?? h, draw }); }

// =====================================================================
// 1. 大ムササビ（金華山）：茶色のふかふか、赤い鉢巻、大きな飛膜としっぽ
// =====================================================================
const MU = { fur: ['#f2b878', '#c27a3c', '#7a4320'], belly: ['#fff6e2', '#f5deb8', '#d8b88a'], memb: ['#d99a5c', '#a5612e', '#6e3a1a'], band: '#d9302a' };
function muHead(ctx, x, y, r, mode, ph = 0, angry = false) {
  // 耳
  paint(ctx, (c) => { c.moveTo(x - r * 0.75, y - r * 0.45); c.quadraticCurveTo(x - r * 0.9, y - r * 1.35, x - r * 0.25, y - r * 0.85); c.closePath(); }, MU.fur[1]);
  paint(ctx, (c) => { c.moveTo(x + r * 0.15, y - r * 0.9); c.quadraticCurveTo(x + r * 0.55, y - r * 1.5, x + r * 0.8, y - r * 0.5); c.closePath(); }, MU.fur[1]);
  ctx.fillStyle = '#f7a0a0'; ctx.beginPath(); ctx.ellipse(x + r * 0.45, y - r * 0.92, r * 0.12, r * 0.25, 0.4, 0, TAU); ctx.fill();
  ball(ctx, x, y, r * 1.08, r, MU.fur[0], MU.fur[1], MU.fur[2]);
  // 顔の白いところ
  paint(ctx, ell(x + r * 0.35, y + r * 0.3, r * 0.7, r * 0.55), rad(ctx, x + r * 0.35, y + r * 0.3, 2, r * 0.8, MU.belly), 0);
  // 鉢巻
  ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, r * 1.08, r, 0, 0, TAU); ctx.clip();
  ctx.fillStyle = MU.band; ctx.fillRect(x - r * 1.2, y - r * 0.62, r * 2.4, r * 0.3);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x - r * 1.2, y - r * 0.6, r * 2.4, r * 0.07);
  ctx.restore();
  // 鉢巻の結び目としっぽ（たなびく）
  const kx = x - r * 1.0, ky = y - r * 0.48;
  paint(ctx, (c) => { c.moveTo(kx, ky); c.quadraticCurveTo(kx - r * 0.6, ky - r * 0.4 + Math.sin(ph) * r * 0.2, kx - r * 1.0, ky - r * 0.15 + Math.sin(ph + 1) * r * 0.25); c.lineTo(kx - r * 0.9, ky + r * 0.1 + Math.sin(ph + 1) * r * 0.2); c.quadraticCurveTo(kx - r * 0.5, ky, kx, ky + r * 0.1); }, MU.band, 1.8);
  paint(ctx, (c) => { c.moveTo(kx, ky + r * 0.05); c.quadraticCurveTo(kx - r * 0.5, ky + r * 0.3, kx - r * 0.8, ky + r * 0.55 + Math.sin(ph + 2) * r * 0.2); c.lineTo(kx - r * 0.65, ky + r * 0.65 + Math.sin(ph + 2) * r * 0.2); c.quadraticCurveTo(kx - r * 0.3, ky + r * 0.35, kx, ky + r * 0.15); }, '#b8221c', 1.8);
  ball(ctx, kx, ky + r * 0.05, r * 0.16, r * 0.14, '#ff6a5a', MU.band, '#8a1410', 1.6);
  // 目・鼻・口
  eye(ctx, x + r * 0.42, y - r * 0.02, r * 0.34, mode, 0.35);
  if (mode !== 'hurt' && mode !== 'dizzy') eye(ctx, x - r * 0.18, y - r * 0.04, r * 0.28, mode, 0.35);
  else eye(ctx, x - r * 0.18, y - r * 0.04, r * 0.26, mode, 0.35);
  ball(ctx, x + r * 0.98, y + r * 0.22, r * 0.13, r * 0.1, '#7a4a40', '#3a1a14', '#200a08', 1.2);
  blush(ctx, x + r * 0.55, y + r * 0.45, r * 0.25);
  ctx.strokeStyle = OL; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.beginPath();
  if (angry || mode === 'glow') { ctx.moveTo(x + r * 0.55, y + r * 0.55); ctx.quadraticCurveTo(x + r * 0.75, y + r * 0.45, x + r * 0.92, y + r * 0.55); ctx.stroke(); // 歯
    ctx.fillStyle = '#fff'; ctx.fillRect(x + r * 0.66, y + r * 0.5, r * 0.1, r * 0.12); ctx.strokeRect(x + r * 0.66, y + r * 0.5, r * 0.1, r * 0.12); }
  else if (mode === 'dizzy') { ctx.moveTo(x + r * 0.55, y + r * 0.55); ctx.quadraticCurveTo(x + r * 0.75, y + r * 0.75, x + r * 0.95, y + r * 0.55); ctx.stroke(); ctx.fillStyle = '#f06a7a'; ctx.beginPath(); ctx.ellipse(x + r * 0.78, y + r * 0.72, r * 0.1, r * 0.14, 0, 0, TAU); ctx.fill(); }
  else { ctx.moveTo(x + r * 0.62, y + r * 0.5); ctx.quadraticCurveTo(x + r * 0.75, y + r * 0.6, x + r * 0.88, y + r * 0.48); ctx.stroke(); }
}
function muTail(ctx, x, y, len, curl, ph) {
  // ふさふさのしっぽ（太い曲線を何層か）
  const pts = [];
  for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push([x - u * len, y - Math.sin(u * Math.PI * 0.9) * curl * len + Math.sin(ph + u * 3) * 4]); }
  for (let layer = 0; layer < 2; layer++) {
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) { const u = i / 8, wdt = (layer ? 0.6 : 1) * (14 + Math.sin(u * Math.PI) * 18); const [px, py] = pts[i]; i ? ctx.lineTo(px, py - wdt) : ctx.moveTo(px, py - wdt); }
    for (let i = 8; i >= 0; i--) { const u = i / 8, wdt = (layer ? 0.6 : 1) * (14 + Math.sin(u * Math.PI) * 18); const [px, py] = pts[i]; ctx.lineTo(px, py + wdt * 0.8); }
    ctx.closePath();
    ctx.fillStyle = layer ? lin(ctx, x, y - len * curl, x, y + 20, ['rgba(255,220,170,0.7)', 'rgba(210,140,80,0)']) : lin(ctx, x, y - len * curl - 30, x, y + 30, [MU.fur[0], MU.fur[1], MU.fur[2]]);
    ctx.fill();
    if (!layer) { ctx.lineWidth = 2.6; ctx.strokeStyle = OL; ctx.lineJoin = 'round'; ctx.stroke(); }
  }
  // 先の黒っぽい毛
  const [tx, ty] = pts[8];
  ball(ctx, tx + 4, ty, 13, 16, '#8a5a3a', '#5a3420', '#2a160c', 2.2);
}
// 横向きの体。spread: 飛膜の開き(0..1)
function muBody(ctx, cx, cy, spread, ph, mode, opts = {}) {
  const bw = 46, bh = 34;
  if (spread > 0.05) {
    // 飛膜（前足から後ろ足まで）
    const s = spread;
    paint(ctx, (c) => {
      c.moveTo(cx + 30, cy - 4);
      c.quadraticCurveTo(cx + 62 * s + 20, cy - 30 * s - Math.sin(ph) * 6, cx + 54 * s + 26, cy + 10);
      c.quadraticCurveTo(cx + 10, cy + 26 + 22 * s, cx - 50 * s - 26, cy + 14 + 6 * s);
      c.quadraticCurveTo(cx - 62 * s - 20, cy - 26 * s + Math.sin(ph + 1) * 6, cx - 34, cy - 6);
      c.closePath();
    }, lin(ctx, cx, cy - 40, cx, cy + 50, MU.memb));
    // 膜のすじ
    ctx.strokeStyle = 'rgba(70,30,10,0.35)'; ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(cx + i * 10, cy + 4); ctx.quadraticCurveTo(cx + i * 22 * s, cy + 22 + 10 * s, cx + i * 30 * s, cy + 28 + 12 * s); ctx.stroke(); }
    // 前足・後ろ足の先
    ball(ctx, cx + 54 * s + 26, cy + 10, 8, 7, '#ffe2c0', '#e0a878', '#9a6038', 2);
    ball(ctx, cx - 50 * s - 26, cy + 14 + 6 * s, 9, 7, '#ffe2c0', '#e0a878', '#9a6038', 2);
  }
  // 胴
  ball(ctx, cx, cy, bw, bh, MU.fur[0], MU.fur[1], MU.fur[2]);
  paint(ctx, ell(cx + 8, cy + 12, bw * 0.62, bh * 0.5), rad(ctx, cx + 8, cy + 8, 2, bw * 0.7, MU.belly), 0);
  shine(ctx, cx - 14, cy - 18, 14, 6, 0.35);
  muHead(ctx, cx + 40, cy - 22, 30, mode, ph, opts.angry);
}

function defineMusasabi() {
  const N = 'boss_musasabi_';
  // 止まり木で待つ（座り）
  def(N + 'perch', 150, 130, 4, (ctx, f) => {
    const ph = f * TAU / 4, b = Math.sin(ph) * 2;
    muTail(ctx, 60, 96, 70, 1.2, ph);
    ball(ctx, 82, 88 + b * 0.5, 36, 40, MU.fur[0], MU.fur[1], MU.fur[2]);
    paint(ctx, ell(90, 96 + b * 0.5, 22, 28), rad(ctx, 90, 90, 2, 32, MU.belly), 0);
    // 足（枝をつかむ）
    ball(ctx, 70, 124, 12, 7, '#ffe2c0', '#e0a878', '#9a6038', 2); ball(ctx, 98, 124, 12, 7, '#ffe2c0', '#e0a878', '#9a6038', 2);
    ball(ctx, 108, 84 + b, 9, 12, MU.fur[0], MU.fur[1], MU.fur[2], 2);
    muHead(ctx, 92, 46 + b, 30, f === 3 ? 'closed' : 'normal', ph);
  });
  // 予告：身をかがめ、目が光り、飛膜を少し開く
  def(N + 'tell', 170, 130, 2, (ctx, f) => {
    const ph = f * Math.PI;
    muTail(ctx, 56, 104, 70, 1.4, ph);
    ctx.save(); ctx.translate(85, 100); ctx.scale(1.08, 0.88); ctx.translate(-85, -100);
    muBody(ctx, 80, 96, 0.35 + f * 0.1, ph, 'glow', { angry: true });
    ctx.restore();
    ball(ctx, 62, 124, 12, 7, '#ffe2c0', '#e0a878', '#9a6038', 2); ball(ctx, 100, 124, 12, 7, '#ffe2c0', '#e0a878', '#9a6038', 2);
  });
  // 滑空
  def(N + 'glide', 220, 130, 2, (ctx, f) => {
    const ph = f * Math.PI;
    muTail(ctx, 70, 82, 72, 0.25 + f * 0.1, ph);
    muBody(ctx, 112, 76, 1, ph, 'angry', { angry: true });
  });
  // 滑空（どんぐりを抱えて）
  def(N + 'glide2', 220, 130, 2, (ctx, f) => {
    const ph = f * Math.PI;
    muTail(ctx, 70, 82, 72, 0.25 + f * 0.1, ph);
    muBody(ctx, 112, 76, 1, ph, 'angry', { angry: true });
    for (let i = 0; i < 3; i++) acorn(ctx, 98 + i * 14, 112 + (i % 2) * 4, 1);
  });
  // 急降下（頭から）
  def(N + 'dive', 130, 170, 2, (ctx, f) => {
    ctx.save(); ctx.translate(65, 90); ctx.rotate(Math.PI / 2);
    muTail(ctx, -30, 6, 60, 0.15, f * Math.PI);
    muBody(ctx, 10, 0, 0.18, f * Math.PI, 'angry', { angry: true });
    ctx.restore();
    // 風を切る線
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(20 + i * 30, 10 + f * 8); ctx.lineTo(20 + i * 30, 50 + f * 8); ctx.stroke(); }
  });
  // 着地して休む（目を回している）＝隙
  def(N + 'rest', 200, 100, 4, (ctx, f) => {
    const ph = f * TAU / 4;
    muTail(ctx, 70, 80, 64, 0.5, ph);
    ctx.save(); ctx.translate(100, 70); ctx.scale(1.12, 0.82); ctx.translate(-100, -70);
    muBody(ctx, 98, 64, 0.6, 0, 'dizzy');
    ctx.restore();
    stars(ctx, 142, 24, 26, 3, ph);
    sweat(ctx, 172, 40, 7);
  });
  // 被弾
  def(N + 'hurt', 200, 120, 1, (ctx) => {
    muTail(ctx, 66, 84, 64, 0.9, 1);
    ctx.save(); ctx.translate(100, 80); ctx.scale(0.92, 1.1); ctx.translate(-100, -80);
    muBody(ctx, 98, 76, 0.4, 0, 'hurt');
    ctx.restore();
  });
  // 怒り（段階変化）：立ち上がって両手を上げる
  def(N + 'angry', 170, 160, 2, (ctx, f) => {
    const ph = f * Math.PI;
    muTail(ctx, 56, 132, 70, 1.5, ph);
    // 飛膜を大きく広げる
    paint(ctx, (c) => { c.moveTo(60, 70); c.quadraticCurveTo(10, 40 - f * 6, 22, 120); c.quadraticCurveTo(85, 150, 148, 120); c.quadraticCurveTo(160, 40 - f * 6, 110, 70); c.closePath(); }, lin(ctx, 85, 40, 85, 150, MU.memb));
    ball(ctx, 85, 108, 36, 44, MU.fur[0], MU.fur[1], MU.fur[2]);
    paint(ctx, ell(88, 116, 22, 30), rad(ctx, 88, 110, 2, 32, MU.belly), 0);
    ball(ctx, 24, 44 - f * 6, 10, 10, '#ffe2c0', '#e0a878', '#9a6038', 2); ball(ctx, 150, 44 - f * 6, 10, 10, '#ffe2c0', '#e0a878', '#9a6038', 2);
    ball(ctx, 68, 152, 12, 7, '#ffe2c0', '#e0a878', '#9a6038', 2); ball(ctx, 102, 152, 12, 7, '#ffe2c0', '#e0a878', '#9a6038', 2);
    muHead(ctx, 88, 60, 32, 'angry', ph, true);
    angerMark(ctx, 120, 26, 16);
  });
  def(N + 'acorn', 22, 26, 1, (ctx) => acorn(ctx, 11, 14, 1.25), 11, 13);
  // 木（背景：止まり木）
  def(N + 'tree', 200, 380, 1, (ctx) => {
    // 幹
    paint(ctx, (c) => { c.moveTo(80, 380); c.bezierCurveTo(88, 280, 70, 180, 90, 40); c.lineTo(118, 40); c.bezierCurveTo(112, 180, 130, 280, 124, 380); c.closePath(); }, lin(ctx, 80, 0, 126, 0, ['#5a3a28', '#7a5238', '#3a2418']));
    ctx.strokeStyle = 'rgba(30,15,10,0.4)'; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(92 + (i % 3) * 8, 360 - i * 40); ctx.quadraticCurveTo(98 + (i % 3) * 8, 340 - i * 40, 94 + (i % 3) * 8, 325 - i * 40); ctx.stroke(); }
    // 枝（止まり木）
    paint(ctx, (c) => { c.moveTo(100, 150); c.quadraticCurveTo(140, 140, 196, 146); c.lineTo(196, 158); c.quadraticCurveTo(140, 154, 104, 166); c.closePath(); }, '#6a4630');
    paint(ctx, (c) => { c.moveTo(100, 150); c.quadraticCurveTo(60, 140, 4, 146); c.lineTo(4, 158); c.quadraticCurveTo(60, 154, 96, 166); c.closePath(); }, '#6a4630');
    // 葉のかたまり
    const leaf = (x, y, r) => ball(ctx, x, y, r, r * 0.8, '#7ccf5a', '#3f8a3a', '#1f4a26', 2.2);
    leaf(60, 60, 44); leaf(150, 56, 46); leaf(104, 28, 46); leaf(36, 110, 30); leaf(176, 108, 30); leaf(104, 76, 40);
  });
}
function acorn(ctx, x, y, s) {
  paint(ctx, ell(x, y + 3 * s, 7 * s, 9 * s), rad(ctx, x, y + 3 * s, 1, 10 * s, ['#e8a060', '#a85a24', '#5a2c10']), 1.6);
  paint(ctx, (c) => { c.ellipse(x, y - 3 * s, 8.5 * s, 5 * s, 0, Math.PI, TAU); c.closePath(); }, '#7a5a3a', 1.6);
  ctx.strokeStyle = OL; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, y - 8 * s); ctx.lineTo(x + 2 * s, y - 12 * s); ctx.stroke();
  shine(ctx, x - 2.5 * s, y + 1 * s, 2 * s, 3 * s, 0.6);
}

export function defineBossArt() {
  defineMusasabi();
}
