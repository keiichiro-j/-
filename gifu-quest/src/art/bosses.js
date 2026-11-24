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
  def(N + 'perch', 190, 150, 4, (ctx, f) => {
    const ph = f * TAU / 4, b = Math.sin(ph) * 2;
    ctx.translate(20, 20);
    muTail(ctx, 60, 96, 70, 1.2, ph);
    ball(ctx, 82, 88 + b * 0.5, 36, 40, MU.fur[0], MU.fur[1], MU.fur[2]);
    paint(ctx, ell(90, 96 + b * 0.5, 22, 28), rad(ctx, 90, 90, 2, 32, MU.belly), 0);
    // 足（枝をつかむ）
    ball(ctx, 70, 124, 12, 7, '#ffe2c0', '#e0a878', '#9a6038', 2); ball(ctx, 98, 124, 12, 7, '#ffe2c0', '#e0a878', '#9a6038', 2);
    ball(ctx, 108, 84 + b, 9, 12, MU.fur[0], MU.fur[1], MU.fur[2], 2);
    muHead(ctx, 92, 46 + b, 30, f === 3 ? 'closed' : 'normal', ph);
  });
  // 予告：身をかがめ、目が光り、飛膜を少し開く
  def(N + 'tell', 200, 160, 2, (ctx, f) => {
    const ph = f * Math.PI;
    ctx.translate(15, 30);
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
  def(N + 'angry', 210, 200, 2, (ctx, f) => {
    const ph = f * Math.PI;
    ctx.translate(20, 40);
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


// =====================================================================
// 2. 大山椒魚（長良川）：まだらの茶色、平たい頭、小さな丸い目、首にしめ縄
// =====================================================================
const SA = { skin: ['#b8a07a', '#7a6248', '#3e3024'], belly: ['#e8d8b8', '#c8b490', '#8a7458'], spot: 'rgba(50,36,24,0.45)' };
function saSpots(ctx, x, y, rx, ry, seed) {
  ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.clip();
  ctx.fillStyle = SA.spot;
  for (let i = 0; i < 14; i++) { const a = (i * 2.39 + seed) % TAU, d = ((i * 0.618 + seed * 0.3) % 1); ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * rx * d, y + Math.sin(a) * ry * d - ry * 0.2, 4 + (i % 3) * 3, 3 + (i % 2) * 2, a, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function saLeg(ctx, x, y, ph) {
  paint(ctx, (c) => { c.moveTo(x - 7, y - 10); c.quadraticCurveTo(x - 10 + ph, y + 6, x - 12 + ph, y + 12); c.lineTo(x + 8 + ph, y + 12); c.quadraticCurveTo(x + 6, y, x + 8, y - 10); c.closePath(); }, lin(ctx, x, y - 10, x, y + 12, [SA.skin[0], SA.skin[2]]), 2.2);
  ctx.strokeStyle = OL; ctx.lineWidth = 1.4; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x - 8 + ph + i * 7, y + 12); ctx.lineTo(x - 8 + ph + i * 7, y + 8); ctx.stroke(); }
}
// 横向き（頭が右）。open: 口の開き 0..1, mode: 目, ph: 動き
function saBody(ctx, x, y, open, mode, ph = 0, opts = {}) {
  // しっぽ（平たいかい）
  paint(ctx, (c) => { c.moveTo(x - 50, y - 18); c.quadraticCurveTo(x - 100, y - 30 + Math.sin(ph) * 8, x - 136, y - 6 + Math.sin(ph + 1) * 10); c.quadraticCurveTo(x - 104, y + 14 + Math.sin(ph) * 6, x - 50, y + 16); c.closePath(); }, lin(ctx, x, y - 30, x, y + 20, SA.skin));
  ctx.strokeStyle = 'rgba(40,28,18,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 56, y - 2); ctx.quadraticCurveTo(x - 96, y - 8 + Math.sin(ph) * 6, x - 128, y - 4 + Math.sin(ph + 1) * 9); ctx.stroke();
  if (!opts.noLegs) { saLeg(ctx, x - 34, y + 18, Math.sin(ph) * 4); saLeg(ctx, x + 40, y + 18, -Math.sin(ph) * 4); }
  // 胴
  ball(ctx, x, y, 72, 30, SA.skin[0], SA.skin[1], SA.skin[2]);
  paint(ctx, (c) => { c.ellipse(x + 4, y + 14, 60, 13, 0, 0, Math.PI); c.closePath(); }, lin(ctx, x, y + 8, x, y + 28, SA.belly), 0);
  saSpots(ctx, x, y, 72, 30, 1.3);
  // 体の横のひだ
  ctx.strokeStyle = 'rgba(40,28,18,0.4)'; ctx.lineWidth = 1.8;
  ctx.beginPath(); for (let i = 0; i < 9; i++) { const px = x - 52 + i * 13; ctx.moveTo(px, y + 6); ctx.quadraticCurveTo(px + 4, y + 12, px, y + 18); } ctx.stroke();
  // 背中のつや
  shine(ctx, x - 18, y - 20, 30, 6, 0.3);
  // 頭（下あごは開く）
  const hx = x + 70, hy = y - 6;
  ctx.save(); ctx.translate(hx - 20, hy + 6); ctx.rotate(open * 0.55);
  paint(ctx, ell(26, 6, 46, 14), lin(ctx, 0, -6, 0, 20, SA.belly));
  if (open > 0.2) { ctx.fillStyle = '#c84a50'; ctx.beginPath(); ctx.ellipse(30, 0, 34, 6, 0, 0, Math.PI); ctx.fill(); ctx.fillStyle = '#fff'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(10 + i * 9, -1); ctx.lineTo(14 + i * 9, -7); ctx.lineTo(18 + i * 9, -1); ctx.fill(); } }
  ctx.restore();
  ctx.save(); ctx.translate(hx - 20, hy + 2); ctx.rotate(-open * 0.35);
  if (open > 0.2) { ctx.fillStyle = '#7a1e2a'; ctx.beginPath(); ctx.ellipse(30, 6, 40, 12 * open, 0, 0, TAU); ctx.fill(); }
  paint(ctx, (c) => { c.ellipse(24, -2, 52, 24, 0, Math.PI * 0.95, Math.PI * 2.05); c.closePath(); }, rad(ctx, 24, -2, 4, 58, SA.skin, -20, -12));
  saSpots(ctx, 24, -2, 52, 22, 3.1);
  if (open > 0.2) { ctx.fillStyle = '#fff'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(14 + i * 9, 0); ctx.lineTo(18 + i * 9, 7); ctx.lineTo(22 + i * 9, 0); ctx.fill(); } }
  // 目（頭の上に小さく）
  eye(ctx, 28, -14, 7.5, mode, 0.4);
  eye(ctx, 46, -16, 6.5, mode, 0.4);
  if (mode === 'glow' || mode === 'angry') { glowDot(ctx, 28, -14, 22, mode === 'angry' ? 'rgba(255,60,40,0.8)' : 'rgba(120,230,255,0.9)'); }
  blush(ctx, 50, 0, 9);
  if (open <= 0.2) { ctx.strokeStyle = OL; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-14, 6); ctx.quadraticCurveTo(30, 16, 74, 2); ctx.stroke(); }
  ctx.restore();
  // しめ縄（首）
  const nx = x + 42;
  paint(ctx, (c) => { c.ellipse(nx, y - 2, 10, 30, 0.1, 0, TAU); }, lin(ctx, nx - 10, 0, nx + 10, 0, ['#f6e2a8', '#d8b860', '#9a7a30']), 2);
  ctx.strokeStyle = '#7a5a20'; ctx.lineWidth = 1.5; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(nx - 9, y - 2 + i * 8); ctx.lineTo(nx + 9, y + 2 + i * 8); ctx.stroke(); }
  // 紙垂（しで）
  for (const sy of [y + 26]) {
    paint(ctx, (c) => { c.moveTo(nx - 2, sy); c.lineTo(nx + 8, sy); c.lineTo(nx + 4, sy + 8); c.lineTo(nx + 12, sy + 8); c.lineTo(nx + 6, sy + 18); c.lineTo(nx - 2, sy + 18); c.lineTo(nx + 2, sy + 10); c.lineTo(nx - 4, sy + 10); c.closePath(); }, '#fff', 1.4);
  }
}
function defineSalamander() {
  const N = 'boss_salamander_';
  // 水面から頭と背中を出す（待機・水しぶきの予告）
  def(N + 'surface', 300, 120, 2, (ctx, f) => { saBody(ctx, 160, 80, f * 0.15, 'normal', f * Math.PI, { noLegs: true }); });
  def(N + 'puff', 300, 130, 2, (ctx, f) => {
    ctx.translate(150, 90); ctx.scale(1 + f * 0.04, 1 + f * 0.06); ctx.translate(-150, -90);
    saBody(ctx, 160, 88, 0, 'glow', f * Math.PI, { noLegs: true });
    // ほっぺがふくらむ
    ball(ctx, 252, 92, 18 + f * 4, 14 + f * 3, '#e8d8c0', '#c0a888', '#8a7458', 2);
    sweat(ctx, 268, 50, 6);
  });
  def(N + 'spit', 300, 130, 1, (ctx) => { saBody(ctx, 160, 88, 0.9, 'angry', 0, { noLegs: true }); });
  // 跳びかかって噛みつく
  def(N + 'bite', 320, 170, 2, (ctx, f) => {
    ctx.translate(160, 110); ctx.rotate(-0.28); ctx.translate(-160, -110);
    saBody(ctx, 150, 110, 0.85 + f * 0.15, 'angry', f * Math.PI);
  });
  // 陸で休む（背中が弱点）
  def(N + 'rest', 320, 110, 4, (ctx, f) => {
    const ph = f * TAU / 4;
    ctx.translate(160, 100); ctx.scale(1.04, 0.9 + Math.sin(ph) * 0.03); ctx.translate(-160, -100);
    saBody(ctx, 160, 70, 0.1, 'dizzy', 0);
    stars(ctx, 236, 26, 24, 3, ph);
  });
  def(N + 'hurt', 320, 120, 1, (ctx) => { ctx.translate(160, 100); ctx.scale(0.96, 1.08); ctx.translate(-160, -100); saBody(ctx, 160, 76, 0.5, 'hurt', 1); });
  // 怒り：上体を起こして吠える
  def(N + 'angry', 300, 200, 2, (ctx, f) => {
    ctx.translate(150, 170); ctx.rotate(-0.55 - f * 0.05); ctx.translate(-150, -170);
    saBody(ctx, 150, 150, 1, 'angry', f * Math.PI);
  });
  // 水しぶきの弾
  def(N + 'drop', 26, 26, 2, (ctx, f) => {
    paint(ctx, (c) => { c.moveTo(13, 2 + f); c.quadraticCurveTo(24, 14, 13, 24); c.quadraticCurveTo(2, 14, 13, 2 + f); }, rad(ctx, 13, 15, 1, 12, ['#ffffff', '#8fd4ff', '#2a7ac0']), 2, '#16405e');
    shine(ctx, 10, 12, 3, 5, 0.8);
  }, 13, 13);
  // 浮き足場（いかだ）
  def(N + 'raft', 112, 30, 1, (ctx) => {
    for (let i = 0; i < 5; i++) ball(ctx, 14 + i * 21, 15, 12, 11, '#c89a5a', '#8a6034', '#4a3018', 2);
    ctx.fillStyle = '#d8c070'; ctx.strokeStyle = OL; ctx.lineWidth = 1.5;
    for (const x of [26, 86]) { ctx.fillRect(x - 3, 2, 6, 26); ctx.strokeRect(x - 3, 2, 6, 26); }
  }, 56, 8);
}

// =====================================================================
// 3. 踊り神（郡上）：編み笠、藍の浴衣に白い流水模様、赤い帯、扇子。おかめ風の丸い白い顔
// =====================================================================
const DA = { indigo: ['#5a7ad0', '#2a3f88', '#141f48'], obi: ['#ff7a6a', '#d0302a', '#7a1410'], hat: ['#f2d590', '#c8a050', '#7a5a24'], skin: ['#fffaf2', '#f6e6d6', '#d8bca8'] };
function daFan(ctx, x, y, r, rot, open = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  const a0 = -Math.PI / 2 - 1.1 * open, a1 = -Math.PI / 2 + 1.1 * open;
  paint(ctx, (c) => { c.moveTo(0, 0); c.arc(0, 0, r, a0, a1); c.closePath(); }, rad(ctx, 0, 0, r * 0.3, r, ['#fff3c0', '#ffcf4a', '#e0402a']), 2);
  ctx.strokeStyle = 'rgba(120,40,10,0.5)'; ctx.lineWidth = 1;
  for (let i = 1; i < 8; i++) { const a = a0 + (a1 - a0) * i / 8; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke(); }
  ctx.fillStyle = '#d0302a'; ctx.beginPath(); ctx.arc(0, -r * 0.62, r * 0.16, 0, TAU); ctx.fill();   // 日の丸
  ctx.restore();
}
// 正面向きに近い立ち姿。arms: [左腕の角度, 右腕の角度]（0=下、PI=上）, eyes: 目のモード, bob: 上下
function daBody(ctx, x, y, o) {
  const bob = o.bob || 0, lean = o.lean || 0;
  ctx.save(); ctx.translate(x, y); ctx.rotate(lean); ctx.translate(-x, -y);
  // 下駄と足
  for (const s of [-1, 1]) { const fx = x + s * 14 + (o.step || 0) * s; paint(ctx, (c) => c.rect(fx - 12, y - 8, 24, 6), '#8a5a30', 1.8); ctx.fillStyle = OL; ctx.fillRect(fx - 9, y - 2, 4, 2); ctx.fillRect(fx + 5, y - 2, 4, 2); ball(ctx, fx, y - 12, 7, 5, DA.skin[0], DA.skin[1], DA.skin[2], 1.6); }
  const by = y - 14 + bob;
  // 浴衣（裾が広がる）
  paint(ctx, (c) => { c.moveTo(x - 24, by - 70); c.quadraticCurveTo(x - 34, by - 20, x - 32 - (o.flare || 0), by); c.lineTo(x + 32 + (o.flare || 0), by); c.quadraticCurveTo(x + 34, by - 20, x + 24, by - 70); c.closePath(); }, lin(ctx, x - 30, by - 70, x + 30, by, DA.indigo));
  // 流水模様
  ctx.save(); ctx.beginPath(); ctx.moveTo(x - 24, by - 70); ctx.quadraticCurveTo(x - 34, by - 20, x - 32, by); ctx.lineTo(x + 32, by); ctx.quadraticCurveTo(x + 34, by - 20, x + 24, by - 70); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) { ctx.beginPath(); const yy = by - 50 + i * 14; ctx.moveTo(x - 36, yy); ctx.bezierCurveTo(x - 16, yy - 8, x - 6, yy + 8, x + 10, yy); ctx.bezierCurveTo(x + 22, yy - 7, x + 30, yy + 4, x + 40, yy - 2); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(x - 20 + i * 11, by - 18 - (i % 2) * 22, 2.5, 0, TAU); ctx.fill(); }
  ctx.restore();
  // 襟
  paint(ctx, (c) => { c.moveTo(x - 12, by - 72); c.lineTo(x, by - 52); c.lineTo(x + 12, by - 72); }, 'rgba(0,0,0,0)', 3, '#fff');
  // 帯
  paint(ctx, (c) => c.rect(x - 27, by - 50, 54, 14), lin(ctx, 0, by - 50, 0, by - 36, DA.obi), 2);
  paint(ctx, (c) => { c.moveTo(x + 22, by - 46); c.quadraticCurveTo(x + 40, by - 58 + bob, x + 44, by - 40); c.quadraticCurveTo(x + 36, by - 34, x + 22, by - 40); c.closePath(); }, DA.obi[1], 2);
  // 腕（袖）と手、扇子
  const arm = (side, ang, fan) => {
    const sx = x + side * 22, sy = by - 64;
    const ex = sx + Math.sin(ang) * 30 * side, ey = sy + Math.cos(ang) * 30;
    paint(ctx, (c) => { c.moveTo(sx - 8, sy - 6); c.lineTo(ex - 10 * side, ey + 4); c.lineTo(ex + 10 * side, ey + 10); c.lineTo(sx + 8 * side, sy + 10); c.closePath(); }, lin(ctx, sx, sy, ex, ey, DA.indigo), 2.2);
    ball(ctx, ex, ey + 4, 6, 6, DA.skin[0], DA.skin[1], DA.skin[2], 1.6);
    if (fan) daFan(ctx, ex, ey + 2, 24, (Math.PI - ang) * side * 0.9 + (o.fanRot || 0), 1);
  };
  arm(-1, o.armL ?? 0.4, false);
  arm(1, o.armR ?? 0.4, o.fan !== false);
  // 頭
  const hy = by - 92;
  ball(ctx, x, hy, 20, 20, DA.skin[0], DA.skin[1], DA.skin[2], 2.4);
  // 顔（おかめ風：細い笑い目、まろ眉、赤いほお）
  ctx.fillStyle = OL; ctx.beginPath(); ctx.ellipse(x - 8, hy - 12, 3.5, 2, 0, 0, TAU); ctx.ellipse(x + 8, hy - 12, 3.5, 2, 0, 0, TAU); ctx.fill();
  const em = o.eyes || 'smile';
  if (em === 'smile') { ctx.strokeStyle = OL; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x - 8, hy - 1, 4.5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.beginPath(); ctx.arc(x + 8, hy - 1, 4.5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
  else { eye(ctx, x - 8, hy - 2, 5.5, em, 0); eye(ctx, x + 8, hy - 2, 5.5, em, 0); }
  blush(ctx, x - 13, hy + 6, 7); blush(ctx, x + 13, hy + 6, 7);
  ctx.fillStyle = '#d0302a'; ctx.beginPath(); ctx.ellipse(x, hy + 10, em === 'angry' || o.mouth ? 4 : 2.5, em === 'angry' || o.mouth ? 4 : 2, 0, 0, TAU); ctx.fill();
  // 編み笠（半月形）
  paint(ctx, (c) => { c.ellipse(x, hy - 10, 40, 22, 0, Math.PI, TAU); c.closePath(); }, lin(ctx, 0, hy - 32, 0, hy - 10, DA.hat), 2.6);
  ctx.strokeStyle = 'rgba(110,70,20,0.55)'; ctx.lineWidth = 1.3;
  for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(x + i * 11, hy - 10); ctx.quadraticCurveTo(x + i * 6, hy - 22, x + i * 2, hy - 31); ctx.stroke(); }
  paint(ctx, (c) => c.rect(x - 40, hy - 12, 80, 4), '#b8302a', 1.6);
  ctx.restore();
}
function defineDancer() {
  const N = 'boss_dancer_';
  const W = 150, H = 170, X = 75, Y = 164;
  def(N + 'dance', W, H, 4, (ctx, f) => {
    const ph = f * TAU / 4;
    daBody(ctx, X, Y, { bob: Math.abs(Math.sin(ph)) * -4, armL: 1.4 + Math.sin(ph) * 0.8, armR: 1.8 - Math.sin(ph) * 0.9, lean: Math.sin(ph) * 0.06, step: Math.sin(ph) * 3, flare: Math.abs(Math.sin(ph)) * 4 });
  });
  def(N + 'tell', W, H, 2, (ctx, f) => { daBody(ctx, X, Y, { bob: 3, armL: 0.6, armR: 2.9 + f * 0.1, eyes: 'glow', lean: -0.05, fanRot: f * 0.2 }); });
  def(N + 'throw', W, H, 1, (ctx) => { daBody(ctx, X, Y, { armL: 0.3, armR: 1.7, eyes: 'angry', lean: 0.1, fan: false, mouth: true }); });
  def(N + 'rest', W, H, 2, (ctx, f) => { daBody(ctx, X, Y, { bob: 4 + f * 2, armL: 0.2, armR: 0.25, eyes: 'closed', lean: 0.04, fan: false }); sweat(ctx, X + 30, Y - 120, 7); if (f) sweat(ctx, X - 32, Y - 112, 5); });
  def(N + 'hurt', W, H, 1, (ctx) => { daBody(ctx, X, Y, { bob: 6, armL: 2.4, armR: 2.4, eyes: 'hurt', lean: -0.18, mouth: true }); });
  def(N + 'angry', W, H + 20, 2, (ctx, f) => { ctx.translate(0, 20); daBody(ctx, X, Y, { bob: -f * 4, armL: 2.8, armR: 2.8, eyes: 'angry', mouth: true, flare: 6 }); daFan(ctx, X - 46, Y - 150 - f * 4, 24, -0.6, 1); angerMark(ctx, X + 34, Y - 140, 14); });
  // 太鼓をたたく
  def(N + 'drum', 190, H, 2, (ctx, f) => {
    daBody(ctx, 95, Y, { armL: f ? 2.6 : 1.2, armR: f ? 1.2 : 2.6, eyes: 'glow', fan: false, mouth: true });
    // 太鼓
    ctx.save(); ctx.translate(95, Y - 30);
    paint(ctx, (c) => { c.ellipse(0, 0, 46, 30, 0, 0, TAU); }, lin(ctx, -46, 0, 46, 0, ['#7a3018', '#c05a2a', '#5a200c']), 2.6);
    paint(ctx, ell(0, -14, 40, 14), rad(ctx, 0, -14, 2, 40, ['#fff8e8', '#f0dcb8', '#c8a878']), 2.2);
    ctx.fillStyle = OL; for (let i = 0; i < 12; i++) { const a = i * TAU / 12; ctx.beginPath(); ctx.arc(Math.cos(a) * 44, Math.sin(a) * 6 - 2, 2, 0, TAU); ctx.fill(); }
    // 巴紋
    ctx.fillStyle = '#d0302a'; ctx.beginPath(); ctx.arc(0, -14, 8, 0, TAU); ctx.fill();
    ctx.restore();
    // ばち
    ctx.strokeStyle = '#8a5a30'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(95 - 22, Y - 100 + (f ? -20 : 40)); ctx.lineTo(95 - 6, Y - (f ? 120 : 50)); ctx.stroke();
    if (f) { ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 3; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(95 + 30 + i * 12, Y - 60 - i * 8); ctx.lineTo(95 + 44 + i * 12, Y - 70 - i * 8); ctx.stroke(); } }
  });
  // 投げた扇子（回る）
  def(N + 'fan', 56, 56, 4, (ctx, f) => { daFan(ctx, 28, 30, 25, f * TAU / 4, 1); }, 28, 28);
}

export function defineBossArt() {
  defineMusasabi();
  defineSalamander();
  defineDancer();
}
