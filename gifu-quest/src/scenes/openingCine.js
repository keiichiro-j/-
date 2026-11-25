import { game } from '../game.js';
import { input } from '../core/input.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { touch } from '../ui/touch.js';
import { makeCanvas } from '../gfx/renderer.js';
import { drawSprite } from '../gfx/atlas.js';
import { drawText, drawOrb, ORB_COLORS, drawMomiji, FONT_SERIF, COL } from '../ui/text.js';
import { drawCastleHill } from './title.js';
import CHARS from '../data/characters.json';
import { RUNTIME } from '../core/config.js';

// ============================================================================
// オープニング（映画風・約76秒）。墨絵 → 宝珠の城 → 火竜の目覚め → 嵐と散る宝珠 → 乱れる里 → 四人 → 旅立ちと題字
// いつでも飛ばせる（Esc／とばす）。Z・タップで次の場面へ。2回目以降は自動で飛ばす（params.force で見られる）
// 開発用：?scene=opening&ot=秒 でその時刻から再生
// ============================================================================

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, v) => clamp((v - a) / (b - a));           // a..b を 0..1 に
const eOut = (t) => 1 - (1 - t) ** 3;
const eIn = (t) => t * t * t;
const eIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const sine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t));
const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const HEROES = ['leaf', 'minamo', 'gen', 'haku'];

// ---------------------------------------------------------------- 焼き付ける素材
const BAKE = {};
function bakeAll(vw, vh) {
  if (BAKE.w === vw && BAKE.h === vh) return;
  BAKE.w = vw; BAKE.h = vh;
  // 和紙（繊維と斑）
  const wa = makeCanvas(vw, vh), wc = wa.getContext('2d');
  wc.fillStyle = '#efe5cf'; wc.fillRect(0, 0, vw, vh);
  for (let i = 0; i < 900; i++) {
    const x = hash(i) * vw, y = hash(i + 7) * vh, l = 6 + hash(i + 3) * 26, a = hash(i + 5) * TAU;
    wc.strokeStyle = `rgba(150,120,80,${0.05 + hash(i + 9) * 0.08})`; wc.lineWidth = 0.6 + hash(i + 11);
    wc.beginPath(); wc.moveTo(x, y); wc.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 3, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); wc.stroke();
  }
  for (let i = 0; i < 40; i++) { const g = wc.createRadialGradient(hash(i + 50) * vw, hash(i + 60) * vh, 0, hash(i + 50) * vw, hash(i + 60) * vh, 40 + hash(i + 70) * 120); g.addColorStop(0, 'rgba(180,150,100,0.07)'); g.addColorStop(1, 'rgba(180,150,100,0)'); wc.fillStyle = g; wc.fillRect(0, 0, vw, vh); }
  BAKE.washi = wa;
  // フィルムの粒（256四方を敷き詰める）
  const gr = makeCanvas(256, 256), gc = gr.getContext('2d'), im = gc.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) { const v = (hash(i * 0.37) * 255) | 0; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 22; }
  gc.putImageData(im, 0, 0); BAKE.grain = gr;
  // ビネット
  const vg = makeCanvas(vw, vh), vc = vg.getContext('2d');
  const g = vc.createRadialGradient(vw / 2, vh / 2, vh * 0.35, vw / 2, vh / 2, vw * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)'); vc.fillStyle = g; vc.fillRect(0, 0, vw, vh);
  BAKE.vignette = vg;
  // 山並み（3層。横に繰り返せる幅2倍）
  BAKE.ridges = [0, 1, 2].map((k) => {
    const W = vw * 2, H = vh, c = makeCanvas(W, H), x = c.getContext('2d');
    const base = [0.52, 0.62, 0.74][k], amp = [0.2, 0.15, 0.1][k];
    x.beginPath(); x.moveTo(0, H);
    for (let i = 0; i <= 160; i++) {
      const u = i / 160, px = u * W;
      const n = Math.sin(u * TAU * (3 + k)) * 0.5 + Math.sin(u * TAU * (7 + k * 2) + k) * 0.3 + Math.sin(u * TAU * (17 + k * 3) + 2 * k) * 0.15 + (k === 0 ? Math.max(0, Math.sin(u * TAU * 2 + 1)) ** 6 * 0.9 : 0);
      x.lineTo(px, H * base - H * amp * n);
    }
    x.lineTo(W, H); x.closePath();
    const lg = x.createLinearGradient(0, H * (base - amp), 0, H);
    const cols = [['#8a8fb0', '#c8b8c8'], ['#5a5f80', '#8a7f98'], ['#2e3048', '#4a4058']][k];
    lg.addColorStop(0, cols[0]); lg.addColorStop(1, cols[1]); x.fillStyle = lg; x.fill();
    if (k === 0) { // 北アルプスの雪：高い所だけ、尾根の線を白でなぞる（形の内側に切り抜く）
      x.save(); x.clip(); x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineJoin = 'round'; x.lineCap = 'round';
      let prev = null;
      for (let i = 0; i <= 160; i++) {
        const u = i / 160, px = u * W, n = Math.sin(u * TAU * 3) * 0.5 + Math.sin(u * TAU * 7) * 0.3 + Math.sin(u * TAU * 17) * 0.15 + Math.max(0, Math.sin(u * TAU * 2 + 1)) ** 6 * 0.9;
        const py = H * base - H * amp * n;
        if (prev && n > 0.42) { x.lineWidth = 6 + (n - 0.42) * 26; x.beginPath(); x.moveTo(prev[0], prev[1]); x.lineTo(px, py); x.stroke(); }
        prev = [px, py];
      }
      x.restore();
    }
    return c;
  });
  // 岐阜の地図（架空の形、墨の線）
  BAKE.map = bakeMap(vw, vh);
  // 題字「ぎふクエスト」
  BAKE.logo = bakeLogo();
  BAKE.logoShine = makeCanvas(BAKE.logo.width, BAKE.logo.height);
  BAKE.sil = makeCanvas(640, 240);
}

// 地図の上の地名（地図の中の割合）。順番は宝珠の色 ORB_COLORS と同じ
const PLACES = [
  { name: '金華山', x: 0.56, y: 0.76 }, { name: '長良川', x: 0.42, y: 0.66 }, { name: '郡上', x: 0.4, y: 0.44 },
  { name: '高山', x: 0.62, y: 0.3 }, { name: '白川郷', x: 0.42, y: 0.16 }, { name: '乗鞍', x: 0.8, y: 0.28 },
];
function mapShape(x, y, w, h) {
  // 岐阜県らしい、北に広く南へすぼむ架空の輪郭
  const pts = [[0.3, 0.04], [0.52, 0.02], [0.7, 0.08], [0.86, 0.14], [0.9, 0.3], [0.82, 0.42], [0.78, 0.56], [0.7, 0.66], [0.7, 0.8], [0.62, 0.92], [0.5, 0.96], [0.38, 0.9], [0.3, 0.78], [0.22, 0.62], [0.24, 0.46], [0.18, 0.32], [0.22, 0.16]];
  return pts.map(([u, v], i) => [x + u * w + (hash(i) - 0.5) * 10, y + v * h + (hash(i + 30) - 0.5) * 10]);
}
function bakeMap(vw, vh) {
  const c = makeCanvas(vw, vh), x = c.getContext('2d');
  x.drawImage(BAKE.washi, 0, 0);
  const mh = vh * 0.72, mw = mh * 1.15, mx = vw / 2 - mw / 2, my = vh * 0.13;   // 上下の黒帯（各10%）の内側
  const pts = mapShape(mx, my, mw, mh);
  // 墨のにじみの影 → 薄墨の塗り → 輪郭
  x.save(); x.translate(4, 6); x.beginPath(); pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath(); x.fillStyle = 'rgba(80,60,40,0.12)'; x.fill(); x.restore();
  x.beginPath(); pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath();
  x.fillStyle = 'rgba(120,140,110,0.18)'; x.fill();
  x.lineWidth = 3.2; x.strokeStyle = 'rgba(40,28,20,0.85)'; x.lineJoin = 'round'; x.stroke();
  x.lineWidth = 1; x.strokeStyle = 'rgba(40,28,20,0.35)'; x.stroke();
  // 山（北に多い）
  for (let i = 0; i < 46; i++) {
    const u = 0.25 + hash(i + 200) * 0.6, v = 0.06 + hash(i + 300) ** 1.6 * 0.6, px = mx + u * mw, py = my + v * mh, s = 7 + hash(i + 400) * 9;
    x.strokeStyle = 'rgba(40,28,20,0.6)'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(px - s, py + s * 0.6); x.lineTo(px, py - s * 0.5); x.lineTo(px + s, py + s * 0.6); x.stroke();
  }
  // 川（長良川・飛騨川）
  const river = (a) => { x.strokeStyle = 'rgba(60,110,170,0.7)'; x.lineWidth = 2.4; x.beginPath(); a.forEach(([u, v], i) => { const px = mx + u * mw, py = my + v * mh; i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke(); };
  river([[0.4, 0.32], [0.41, 0.45], [0.39, 0.56], [0.43, 0.67], [0.48, 0.8], [0.52, 0.95]]);
  river([[0.64, 0.24], [0.62, 0.42], [0.66, 0.58], [0.64, 0.72], [0.6, 0.9]]);
  // 方位と題
  x.fillStyle = 'rgba(40,28,20,0.8)'; x.font = `bold 22px ${FONT_SERIF}`; x.textAlign = 'center'; x.save(); x.translate(mx - 40, my + 20); x.font = `bold 22px ${FONT_SERIF}`; ['美', '濃', '・', '飛', '騨', '之', '図'].forEach((c, i) => x.fillText(c, 0, i * 26)); x.restore();   // 縦書きの題
  x.font = `bold 16px ${FONT_SERIF}`; x.fillText('北', mx + mw + 30, my + 30); x.beginPath(); x.moveTo(mx + mw + 30, my + 36); x.lineTo(mx + mw + 30, my + 70); x.lineWidth = 2; x.stroke();
  BAKE.mapRect = { x: mx, y: my, w: mw, h: mh };
  return c;
}
function bakeLogo() {
  const W = 760, H = 220, c = makeCanvas(W, H), x = c.getContext('2d');
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `900 118px ${FONT_SERIF}`;
  x.lineJoin = 'round';
  x.lineWidth = 22; x.strokeStyle = '#1a0c08'; x.strokeText('ぎふクエスト', W / 2, 92);
  x.lineWidth = 8; x.strokeStyle = '#6a3a14'; x.strokeText('ぎふクエスト', W / 2, 92);
  const g = x.createLinearGradient(0, 40, 0, 150); g.addColorStop(0, '#fff6c8'); g.addColorStop(0.45, '#f0c040'); g.addColorStop(0.55, '#c88a20'); g.addColorStop(1, '#ffe08a');
  x.fillStyle = g; x.fillText('ぎふクエスト', W / 2, 92);
  x.font = `bold 36px ${FONT_SERIF}`;
  x.lineWidth = 8; x.strokeStyle = '#1a0c08'; x.strokeText('〜 六つの宝珠 〜', W / 2, 184);
  x.fillStyle = '#f6ead0'; x.fillText('〜 六つの宝珠 〜', W / 2, 184);
  return c;
}

// ---------------------------------------------------------------- 描く部品
function sky(ctx, vw, vh, stops) { const g = ctx.createLinearGradient(0, 0, 0, vh); for (const [o, c] of stops) g.addColorStop(o, c); ctx.fillStyle = g; ctx.fillRect(-vw, -vh, vw * 3, vh * 3); }
function glow(ctx, x, y, r, color, a = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.globalAlpha *= a; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
}
function rays(ctx, x, y, r, n, rot, color, a) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= a; ctx.translate(x, y); ctx.rotate(rot);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g;
  for (let i = 0; i < n; i++) { const a0 = i / n * TAU, w = 0.06 + hash(i) * 0.08; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r * (0.7 + hash(i + 4) * 0.3), a0 - w, a0 + w); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}
function ridgeLayer(ctx, img, scroll, y, vw) {
  const W = img.width, ox = -((scroll % W) + W) % W;
  ctx.drawImage(img, ox, y); ctx.drawImage(img, ox + W, y);
}
function mistBand(ctx, vw, y, h, t, a, color = '255,255,255') {
  for (let i = 0; i < 5; i++) {
    const x = ((i * 0.27 + t * 0.012 * (1 + i * 0.3)) % 1.4 - 0.2) * vw, w = vw * (0.35 + hash(i) * 0.3);
    const g = ctx.createRadialGradient(x, y, 0, x, y, w * 0.5); g.addColorStop(0, `rgba(${color},${a})`); g.addColorStop(1, `rgba(${color},0)`);
    ctx.save(); ctx.translate(x, y); ctx.scale(1, h / w); ctx.translate(-x, -y); ctx.fillStyle = g; ctx.fillRect(x - w / 2, y - w / 2, w, w); ctx.restore();
  }
}
// 城（天守。窓に灯）
function castle(ctx, cx, by, s, lit, dark = '#24182a') {
  ctx.fillStyle = dark;
  ctx.fillRect(cx - 34 * s, by - 18 * s, 68 * s, 18 * s);             // 石垣
  const tiers = [[52, 16], [40, 15], [30, 14]];
  let y = by - 18 * s;
  tiers.forEach(([w, h], i) => {
    ctx.fillStyle = dark; ctx.fillRect(cx - w / 2 * s, y - h * s, w * s, h * s);
    ctx.beginPath(); ctx.moveTo(cx - (w / 2 + 10) * s, y - h * s + 3 * s); ctx.quadraticCurveTo(cx, y - h * s - 10 * s, cx + (w / 2 + 10) * s, y - h * s + 3 * s); ctx.lineTo(cx + (w / 2 - 2) * s, y - h * s - 4 * s); ctx.lineTo(cx - (w / 2 - 2) * s, y - h * s - 4 * s); ctx.closePath(); ctx.fill();
    if (lit > 0) { ctx.fillStyle = `rgba(255,200,110,${lit})`; for (let k = -1; k <= 1; k++) ctx.fillRect(cx + k * w * 0.28 * s - 2.5 * s, y - h * s * 0.65, 5 * s, 5 * s); }
    y -= (h + 4) * s;
  });
  ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(cx - 6 * s, y + 4 * s); ctx.lineTo(cx, y - 8 * s); ctx.lineTo(cx + 6 * s, y + 4 * s); ctx.fill();
  return y;
}
// 竜：頭の位置と向きから、くねる長い体を描く。rim は縁の光の色
const DRAGON_PTS = Array.from({ length: 48 }, () => ({ x: 0, y: 0 }));
function dragon(ctx, hx, hy, s, t, dir = 1, body = '#1a0a0e', rim = 'rgba(255,90,40,0.9)', eyeA = 1) {
  const P = DRAGON_PTS, n = P.length;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    P[i].x = hx - dir * u * 520 * s;
    P[i].y = hy + Math.sin(u * 9 - t * 3.2) * 46 * s * (0.3 + u) + u * 60 * s;
  }
  // たてがみの炎（体の上側）
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 2; i < n - 6; i += 2) { const p = P[i], f = 0.6 + 0.4 * Math.sin(t * 9 + i); glow(ctx, p.x, p.y - 20 * s, 26 * s * f * (1 - i / n), 'rgba(255,110,40,0.5)', 0.7); }
  ctx.restore();
  // 体（太さが細くなる円の連なり）＋縁の光
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const u = i / (n - 1), r = (30 - 24 * u) * s, p = P[i];
      ctx.beginPath(); ctx.arc(p.x, p.y + (pass ? 0 : -2.5 * s), r + (pass ? 0 : 2.5 * s), 0, TAU);
      ctx.fillStyle = pass ? body : rim; ctx.fill();
    }
  }
  // 鱗と背びれ
  ctx.strokeStyle = 'rgba(255,120,60,0.22)'; ctx.lineWidth = 1.2 * s;
  for (let i = 1; i < n - 2; i++) {
    const u = i / (n - 1), r = (30 - 24 * u) * s, p = P[i];
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.7, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    if (i % 2 === 0) { const q = P[i + 1]; ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(p.x, p.y - r * 0.8); ctx.lineTo((p.x + q.x) / 2, p.y - r * 1.9); ctx.lineTo(q.x, q.y - r * 0.7); ctx.fill(); }
  }
  // 頭
  ctx.save(); ctx.translate(hx, hy); ctx.scale(dir * s, s);
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.moveTo(-30, -18); ctx.quadraticCurveTo(20, -34, 64, -10); ctx.lineTo(70, 2); ctx.quadraticCurveTo(40, 6, 52, 14); ctx.quadraticCurveTo(20, 26, -26, 20); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = rim; ctx.lineWidth = 2.4; ctx.stroke();
  // 角
  ctx.beginPath(); ctx.moveTo(-6, -24); ctx.quadraticCurveTo(-30, -60, -56, -66); ctx.quadraticCurveTo(-30, -48, -18, -20); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(10, -26); ctx.quadraticCurveTo(-4, -56, -24, -70); ctx.quadraticCurveTo(-4, -50, 2, -22); ctx.closePath(); ctx.fill(); ctx.stroke();
  // ひげ
  ctx.strokeStyle = 'rgba(255,140,70,0.8)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(56, 6); ctx.bezierCurveTo(70, 30 + Math.sin(t * 3) * 8, 40, 50, 70 + Math.sin(t * 2) * 10, 76); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(50, -8); ctx.bezierCurveTo(80, -20, 90, 10 + Math.sin(t * 2.6) * 10, 120, -4); ctx.stroke();
  // 目
  glow(ctx, 30, -10, 26, 'rgba(255,200,60,0.9)', eyeA);
  ctx.fillStyle = `rgba(255,220,80,${eyeA})`; ctx.beginPath(); ctx.ellipse(30, -10, 8, 4, -0.2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#100404'; ctx.beginPath(); ctx.ellipse(31, -10, 1.6, 3.6, -0.2, 0, TAU); ctx.fill();
  ctx.restore();
}
// 稲妻（ギザギザを分かれながら下へ）
function bolt(ctx, x, y, len, seed, a) {
  const pts = []; let px = x, py = y;
  for (let i = 0; i < 14; i++) { px += (hash(seed + i) - 0.5) * 60; py += len / 14; pts.push([px, py]); }
  const path = () => { ctx.beginPath(); ctx.moveTo(x, y); for (const [qx, qy] of pts) ctx.lineTo(qx, qy); };
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round';
  path(); ctx.strokeStyle = `rgba(150,170,255,${0.35 * a})`; ctx.lineWidth = 14; ctx.stroke();
  path(); ctx.strokeStyle = `rgba(210,220,255,${0.7 * a})`; ctx.lineWidth = 5; ctx.stroke();
  path(); ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 1.8; ctx.stroke();
  // 枝
  const [bx, by] = pts[5]; ctx.beginPath(); ctx.moveTo(bx, by); let cx = bx, cy = by;
  for (let i = 0; i < 6; i++) { cx += 10 + hash(seed + 40 + i) * 30; cy += 20; ctx.lineTo(cx, cy); }
  ctx.strokeStyle = `rgba(230,235,255,${0.6 * a})`; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.restore();
}
// 墨のしぶき（中心から広がるにじみ）
function inkBloom(ctx, x, y, R, k, seed = 1, color = '18,12,10') {
  if (k <= 0) return;
  // にじみの塊：中心は薄く、縁に墨がたまる（和紙に落ちた墨らしさ）
  const blot = (bx, by, r, a) => {
    if (r < 1) return;
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    g.addColorStop(0, `rgba(${color},${0.55 * a})`); g.addColorStop(0.78, `rgba(${color},${0.8 * a})`); g.addColorStop(0.93, `rgba(${color},${0.95 * a})`); g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.fill();
  };
  blot(x, y, R * 0.5 * eOut(k), 1);
  for (let i = 0; i < 22; i++) {
    const a = hash(seed + i) * TAU, d = R * (0.22 + hash(seed + i + 50) * 0.5) * eOut(k), r = R * (0.08 + hash(seed + i + 90) * 0.2) * eOut(clamp(k * 1.3));
    blot(x + Math.cos(a) * d, y + Math.sin(a) * d, r, 0.85);
  }
  // 墨が紙の繊維を伝う細い筋
  ctx.strokeStyle = `rgba(${color},0.55)`; ctx.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const a = hash(seed + i + 500) * TAU, d0 = R * 0.35 * eOut(k), d1 = d0 + R * (0.2 + hash(seed + i + 600) * 0.5) * eOut(clamp(k * 1.2 - 0.1));
    ctx.lineWidth = 1 + hash(seed + i + 700) * 2.5; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * d0, y + Math.sin(a) * d0);
    ctx.quadraticCurveTo(x + Math.cos(a + 0.15) * (d0 + d1) / 2, y + Math.sin(a + 0.15) * (d0 + d1) / 2, x + Math.cos(a) * d1, y + Math.sin(a) * d1); ctx.stroke();
  }
  ctx.fillStyle = `rgba(${color},0.9)`;
  for (let i = 0; i < 60; i++) { // 飛び散った細かい点
    const a = hash(seed + i + 200) * TAU, d = R * (0.7 + hash(seed + i + 300) * 0.9) * eOut(clamp(k * 1.6)), r = 1 + hash(seed + i + 400) * 4;
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r, 0, TAU); ctx.fill();
  }
}
// 和紙の上の判子（朱）
function seal(ctx, x, y, s, str, a) {
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.rotate(-0.06);
  ctx.fillStyle = 'rgba(196,48,32,0.92)'; ctx.fillRect(-s / 2, -s / 2, s, s);
  ctx.strokeStyle = 'rgba(255,230,210,0.5)'; ctx.lineWidth = 1.5; ctx.strokeRect(-s / 2 + 4, -s / 2 + 4, s - 8, s - 8);
  ctx.fillStyle = '#fff2e0'; ctx.font = `900 ${s * 0.58}px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(str, 0, 2);
  ctx.restore();
}
// 筆の太い一刷け：先へ行くほど細くなり、終わりに数本のかすれ
function brushStroke(ctx, x, y, w, h, k, color, seed) {
  const L = w * eOut(k);
  if (L < 2) return;
  const half = (u) => h * 0.5 * (1 - 0.45 * u * u) * (0.94 + 0.06 * Math.sin(u * 11 + seed));
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - half(0));
  for (let i = 1; i <= 24; i++) { const u = i / 24; ctx.lineTo(x + L * u, y - half(u) + Math.sin(u * 5 + seed) * 2); }
  ctx.quadraticCurveTo(x + L + h * 0.22, y, x + L, y + half(1));
  for (let i = 24; i >= 0; i--) { const u = i / 24; ctx.lineTo(x + L * u, y + half(u) + Math.sin(u * 7 + seed * 2) * 2); }
  ctx.closePath(); ctx.fill();
  // 入りの墨だまり
  ctx.beginPath(); ctx.ellipse(x, y, h * 0.16, h * 0.52, 0, 0, TAU); ctx.fill();
  // 終わりのかすれ
  ctx.save(); ctx.globalAlpha *= 0.55;
  for (let i = 0; i < 9; i++) {
    const u0 = 0.62 + hash(seed + i) * 0.22, yy = y + (hash(seed + i + 9) - 0.5) * h * 0.7, len = L * (0.18 + hash(seed + i + 18) * 0.3);
    ctx.fillRect(x + L * u0, yy, Math.min(len, L * (1.04 - u0)), 1.5 + hash(seed + i + 27) * 2.5);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- 季節の粒
function seasonParticles(ctx, vw, vh, t, season, a) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  for (let i = 0; i < 46; i++) {
    const sp = 0.6 + hash(i + 3) * 0.8;
    const x = ((hash(i) * vw + t * 40 * sp + Math.sin(t * 1.3 + i) * 30) % (vw + 40)) - 20;
    const y = ((hash(i + 9) * vh + t * (season === 1 ? -12 : 36) * sp) % (vh + 40) + vh + 40) % (vh + 40) - 20;
    const r = t * 2 + i;
    if (season === 0) { ctx.fillStyle = 'rgba(255,190,210,0.9)'; ctx.save(); ctx.translate(x, y); ctx.rotate(r); ctx.scale(1, Math.cos(r * 1.7)); ctx.beginPath(); ctx.ellipse(0, 0, 4, 2.4, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    else if (season === 1) { const f = 0.5 + 0.5 * Math.sin(t * 4 + i * 1.7); glow(ctx, x, y, 10, 'rgba(220,255,120,0.9)', f); }
    else if (season === 2) { ctx.save(); ctx.translate(x, y); ctx.rotate(r * 0.6); drawMomiji(ctx, 5, i % 3 ? '#d84a24' : '#e8a020'); ctx.restore(); }
    else { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(x, y, 1.2 + hash(i) * 2.4, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
}

// ============================================================================
// 場面（d：長さ秒）。draw(ctx, t, vw, vh, S) は場面の中の時刻 t で描く。subs：[開始, 終了, 字幕]、cues：[時刻, 効果音]
// ============================================================================
const SHOTS = [
  // ---- 一、墨 ----
  { id: 'ink', d: 8, cues: [[0.9, 'splash'], [2.4, 'select'], [3.0, 'select'], [3.6, 'select'], [4.2, 'select'], [4.8, 'select']],
    subs: [[5.2, 8, 'これは、美濃と飛騨の山あいに伝わる、六つの光の物語。']],
    draw(ctx, t, vw, vh) {
      ctx.drawImage(BAKE.washi, 0, 0);
      // 落ちる一滴 → にじみ
      const cx = vw / 2, cy = vh * 0.46;
      if (t < 0.9) { const y = lerp(-20, cy, eIn(t / 0.9)); ctx.fillStyle = '#120c0a'; ctx.beginPath(); ctx.ellipse(cx, y, 5, 8, 0, 0, TAU); ctx.fill(); }
      const k = inv(0.9, 2.6, t);
      ctx.save(); ctx.globalAlpha = 1 - inv(5.5, 7.6, t) * 0.85; inkBloom(ctx, cx, cy, vh * 0.42, k, 7); ctx.restore();
      // 縦書きの題「六つの宝珠」：一字ずつ金で浮かぶ
      const chars = ['六', 'つ', 'の', '宝', '珠'];
      ctx.font = `900 ${vh * 0.1}px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < 5; i++) {
        const a = inv(2.3 + i * 0.6, 3.0 + i * 0.6, t);
        if (a <= 0) continue;
        const y = cy - vh * 0.26 + i * vh * 0.115, sc = lerp(1.35, 1, eOut(a));
        ctx.save(); ctx.translate(cx, y); ctx.scale(sc, sc); ctx.globalAlpha = a;
        glow(ctx, 0, 0, vh * 0.09, 'rgba(255,200,90,0.5)', 1 - a * 0.6);
        const g = ctx.createLinearGradient(0, -vh * 0.05, 0, vh * 0.05); g.addColorStop(0, '#fff3c0'); g.addColorStop(1, '#d8a030');
        ctx.fillStyle = g; ctx.fillText(chars[i], 0, 0); ctx.restore();
      }
      // 金箔
      for (let i = 0; i < 70; i++) {
        const a = inv(2.2, 3.4, t); if (a <= 0) break;
        const px = cx + (hash(i) - 0.5) * vw * 0.8 + Math.sin(t * 0.7 + i) * 20, py = (hash(i + 5) * vh - t * 10 * (0.5 + hash(i + 2))) % vh;
        const r = t * (1 + hash(i)) + i;
        ctx.save(); ctx.globalAlpha = a * (0.5 + 0.5 * Math.sin(t * 3 + i)); ctx.translate(px, (py + vh) % vh); ctx.rotate(r); ctx.scale(Math.cos(r * 1.3), 1);
        ctx.fillStyle = i % 3 ? '#f0c850' : '#fff0a0'; ctx.fillRect(-3, -2, 6 + hash(i) * 4, 4); ctx.restore();
      }
      // 終わり：紙が白く光って次へ
      const w = inv(7.2, 8, t); if (w > 0) { ctx.fillStyle = `rgba(255,248,230,${w})`; ctx.fillRect(0, 0, vw, vh); }
    } },

  // ---- 二、宝珠の城と四季 ----
  { id: 'castle', d: 13, cues: [[0.2, 'star'], [6.5, 'sarubobo']],
    subs: [[0.6, 6.2, '六つの宝珠は、金華山の城にまつられていました。'], [6.4, 12.6, '晴れも雨も雪も ── 宝珠は、季節のめぐりを ほどよく見守っていたのです。']],
    draw(ctx, t, vw, vh) {
      const k = t / 13, dawn = eOut(inv(0, 6, t));
      sky(ctx, vw, vh, [[0, `rgb(${lerp(30, 92, dawn) | 0},${lerp(40, 140, dawn) | 0},${lerp(90, 210, dawn) | 0})`], [0.6, `rgb(${lerp(120, 250, dawn) | 0},${lerp(90, 200, dawn) | 0},${lerp(130, 150, dawn) | 0})`], [1, '#ffe2b0']]);
      // 朝日と光の筋
      const sx = vw * 0.72, sy = lerp(vh * 0.72, vh * 0.3, dawn);
      glow(ctx, sx, sy, vh * 0.7, 'rgba(255,220,150,0.55)', 1);
      rays(ctx, sx, sy, vh * 1.2, 14, t * 0.03, 'rgba(255,240,200,0.35)', 0.5 + 0.3 * dawn);
      ctx.fillStyle = '#fff6dc'; ctx.beginPath(); ctx.arc(sx, sy, 34, 0, TAU); ctx.fill();
      // カメラ：ゆっくり城へ寄る
      const z = lerp(1, 1.16, sine(k));
      ctx.save(); ctx.translate(vw * 0.45, vh * 0.55); ctx.scale(z, z); ctx.translate(-vw * 0.45, -vh * 0.55);
      ridgeLayer(ctx, BAKE.ridges[0], t * 6, vh * 0.02, vw);
      mistBand(ctx, vw, vh * 0.55, 50, t, 0.45);
      ridgeLayer(ctx, BAKE.ridges[1], t * 14 + 300, 0, vw);
      mistBand(ctx, vw, vh * 0.68, 40, t * 1.6, 0.35);
      // 金華山と城
      const hx = vw * 0.45, hy = vh * 0.42;
      drawCastleHill(ctx, hx, hy, vh, 1.25, '#2e2034');
      const top = castle(ctx, hx - 4, hy + 8, 1.05, 0.6 * (1 - dawn) + 0.3);
      // 六つの宝珠：城の上でめぐり、光の柱
      const oy = top - 60;
      glow(ctx, hx, oy, 150, 'rgba(255,240,200,0.5)', 0.8);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25; ctx.fillStyle = 'rgba(255,240,200,1)';
      ctx.beginPath(); ctx.moveTo(hx - 8, top); ctx.lineTo(hx - 60, oy - 40); ctx.lineTo(hx + 60, oy - 40); ctx.lineTo(hx + 8, top); ctx.fill(); ctx.restore();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU + t * 0.6, depth = Math.sin(a);
        drawOrb(ctx, hx + Math.cos(a) * 92, oy + depth * 22, 10 + depth * 2, ORB_COLORS[i], 1);
      }
      ridgeLayer(ctx, BAKE.ridges[2], t * 30 + 700, vh * 0.08, vw);
      // 鳥の群れ
      ctx.strokeStyle = 'rgba(40,30,40,0.7)'; ctx.lineWidth = 1.6;
      for (let i = 0; i < 7; i++) { const bx = ((t * 34 + i * 26) % (vw + 200)) - 100, by = vh * 0.22 + Math.sin(i * 1.7) * 30 + Math.sin(t * 2 + i) * 4, f = Math.sin(t * 10 + i) * 4; ctx.beginPath(); ctx.moveTo(bx - 7, by - f); ctx.quadraticCurveTo(bx - 3, by - 3, bx, by); ctx.quadraticCurveTo(bx + 3, by - 3, bx + 7, by - f); ctx.stroke(); }
      ctx.restore();
      // 四季がめぐる（後半）
      const sea = Math.floor(inv(6.4, 12.6, t) * 4 - 0.0001);
      if (t > 6.4) {
        const local = (inv(6.4, 12.6, t) * 4) % 1, fade = Math.min(1, local * 4, (1 - local) * 4);
        const tint = ['rgba(255,190,210,0.12)', 'rgba(120,200,120,0.1)', 'rgba(230,110,40,0.14)', 'rgba(200,220,255,0.2)'][sea];
        ctx.fillStyle = tint; ctx.globalAlpha = fade; ctx.fillRect(0, 0, vw, vh); ctx.globalAlpha = 1;
        seasonParticles(ctx, vw, vh, t, sea, fade);
        seal(ctx, vw - 70, 90, 52, '春夏秋冬'[sea], fade);
      }
    } },

  // ---- 三、火竜の目覚め ----
  { id: 'dragon', d: 14, cues: [[0.5, 'thunder'], [4.6, 'thunder'], [6.0, 'bossIntro'], [7.6, 'bossPhase'], [9.6, 'explosion'], [10.2, 'thunder']],
    subs: [[0.6, 5.8, 'ある秋の夜。乗鞍の火の山の、奥ふかくで ──'], [9.8, 13.8, '長い眠りについていた「火の竜」が、目をさましたのです。']],
    draw(ctx, t, vw, vh, S) {
      if (t < 5.8) {
        // A：月から火口へカメラが下りる。地鳴り
        const k = sine(inv(0, 5.8, t)), shake = inv(1.5, 5.8, t) * 6;
        S.shake = shake;
        sky(ctx, vw, vh, [[0, '#06040e'], [0.6, '#1a0a1e'], [1, '#4a1418']]);
        const camY = lerp(-vh * 0.6, 0, k);
        ctx.save(); ctx.translate(0, -camY);
        // 月と星
        for (let i = 0; i < 90; i++) { ctx.fillStyle = `rgba(255,255,240,${0.3 + 0.7 * hash(i + 3) * (0.6 + 0.4 * Math.sin(t * 3 + i))})`; ctx.fillRect(hash(i) * vw, hash(i + 1) * vh * 0.9 - vh * 0.6, 1.5, 1.5); }
        const mx = vw * 0.7, my = -vh * 0.35;
        glow(ctx, mx, my, 220, 'rgba(255,230,190,0.45)'); ctx.fillStyle = '#fff1d6'; ctx.beginPath(); ctx.arc(mx, my, 70, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(200,180,150,0.35)'; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(mx - 30 + hash(i) * 60, my - 30 + hash(i + 4) * 60, 6 + hash(i + 8) * 10, 0, TAU); ctx.fill(); }
        // 火の山
        const cx = vw * 0.5, by = vh + 10;
        ctx.fillStyle = '#140a0e'; ctx.beginPath(); ctx.moveTo(cx - vw * 0.7, by); ctx.lineTo(cx - 110, vh * 0.42); ctx.quadraticCurveTo(cx, vh * 0.46, cx + 120, vh * 0.42); ctx.lineTo(cx + vw * 0.7, by); ctx.closePath(); ctx.fill();
        const pulse = 0.6 + 0.4 * Math.sin(t * 4) + inv(3, 5.8, t);
        glow(ctx, cx, vh * 0.44, 260, 'rgba(255,90,30,0.6)', pulse);
        ctx.fillStyle = `rgba(255,${120 + 60 * Math.sin(t * 6) | 0},40,0.9)`; ctx.beginPath(); ctx.ellipse(cx, vh * 0.44, 108, 10, 0, 0, TAU); ctx.fill();
        // 溶岩の筋
        ctx.strokeStyle = 'rgba(255,100,30,0.7)'; ctx.lineWidth = 3;
        for (let i = 0; i < 6; i++) { const x0 = cx - 90 + i * 36; ctx.beginPath(); ctx.moveTo(x0, vh * 0.45); ctx.quadraticCurveTo(x0 + (i - 3) * 40, vh * 0.7, x0 + (i - 3) * 90, vh); ctx.stroke(); }
        ctx.restore();
        // 火の粉が上る
        for (let i = 0; i < 60; i++) { const px = vw * 0.5 + (hash(i) - 0.5) * 360 + Math.sin(t + i) * 20, py = vh - ((t * (60 + hash(i + 2) * 120) + hash(i + 4) * vh) % vh); glow(ctx, px, py, 5 + hash(i) * 6, 'rgba(255,150,60,0.9)', 0.8); }
        const blk = inv(5.2, 5.8, t); if (blk > 0) { ctx.fillStyle = `rgba(0,0,0,${blk})`; ctx.fillRect(0, 0, vw, vh); }
        return;
      }
      if (t < 9.6) {
        // B：大きな目が開く
        const lt = t - 5.8;
        S.shake = lt > 1.6 && lt < 2.2 ? 8 : 1;
        ctx.fillStyle = '#0a0406'; ctx.fillRect(0, 0, vw, vh);
        const cx = vw / 2, cy = vh / 2, W = vw * 0.42, H = vh * 0.3;
        // 鱗の地
        ctx.strokeStyle = 'rgba(160,40,30,0.35)'; ctx.lineWidth = 2;
        for (let r = 0; r < 9; r++) for (let c = 0; c < 18; c++) { const x = c * 70 - 30 + (r % 2) * 35 + Math.sin(lt) * 4, y = r * 64 - 10; ctx.beginPath(); ctx.arc(x, y, 38, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
        const open = eOut(inv(0.8, 2.2, lt)) * (1 - inv(3.4, 3.8, lt) * 0.15);
        glow(ctx, cx, cy, W * 1.3, 'rgba(255,80,20,0.4)', open);
        ctx.save();
        ctx.beginPath(); ctx.moveTo(cx - W, cy); ctx.quadraticCurveTo(cx, cy - H * 2 * open, cx + W, cy); ctx.quadraticCurveTo(cx, cy + H * 2 * open, cx - W, cy); ctx.closePath(); ctx.clip();
        // 虹彩
        const ig = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * 1.3);
        ig.addColorStop(0, '#fff6b0'); ig.addColorStop(0.35, '#ffc030'); ig.addColorStop(0.75, '#e05010'); ig.addColorStop(1, '#5a0c04');
        ctx.fillStyle = ig; ctx.fillRect(cx - W, cy - H * 1.4, W * 2, H * 2.8);
        ctx.strokeStyle = 'rgba(120,20,0,0.45)'; ctx.lineWidth = 2;
        for (let i = 0; i < 60; i++) { const a = i / 60 * TAU; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * H * 0.3, cy + Math.sin(a) * H * 0.3); ctx.lineTo(cx + Math.cos(a) * H * (1.1 + hash(i) * 0.3), cy + Math.sin(a) * H * (1.1 + hash(i) * 0.3)); ctx.stroke(); }
        // 縦長の瞳（細くなる）
        const pw = lerp(H * 0.5, H * 0.12, eOut(inv(2.2, 3.0, lt)));
        ctx.fillStyle = '#0a0202'; ctx.beginPath(); ctx.ellipse(cx, cy, pw, H * 1.15, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(cx - H * 0.45, cy - H * 0.35, 10, 6, -0.5, 0, TAU); ctx.fill();
        ctx.restore();
        // まぶた
        ctx.strokeStyle = '#2a0808'; ctx.lineWidth = 10;
        ctx.beginPath(); ctx.moveTo(cx - W, cy); ctx.quadraticCurveTo(cx, cy - H * 2 * open, cx + W, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - W, cy); ctx.quadraticCurveTo(cx, cy + H * 2 * open, cx + W, cy); ctx.stroke();
        const fl = inv(3.4, 3.8, lt); if (fl > 0) { ctx.fillStyle = `rgba(255,240,220,${Math.sin(fl * Math.PI)})`; ctx.fillRect(0, 0, vw, vh); }
        return;
      }
      // C：竜が火口から飛び出し、月を横切る
      const lt = t - 9.6;
      S.shake = lt < 1 ? 10 * (1 - lt) : 0;
      sky(ctx, vw, vh, [[0, '#08040e'], [0.7, '#2a0c18'], [1, '#5a1410']]);
      const mx = vw * 0.58, my = vh * 0.38, mr = vh * 0.34;
      glow(ctx, mx, my, mr * 2.2, 'rgba(255,200,160,0.35)');
      const mg = ctx.createRadialGradient(mx - mr * 0.2, my - mr * 0.2, 0, mx, my, mr); mg.addColorStop(0, '#fff0d8'); mg.addColorStop(1, '#f0c8a0');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(190,150,120,0.3)'; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(mx - mr * 0.6 + hash(i) * mr * 1.2, my - mr * 0.6 + hash(i + 4) * mr * 1.2, mr * (0.05 + hash(i + 8) * 0.1), 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#120608'; ctx.beginPath(); ctx.moveTo(-10, vh); ctx.lineTo(vw * 0.3, vh * 0.74); ctx.lineTo(vw * 0.46, vh * 0.78); ctx.lineTo(vw * 0.7, vh * 0.7); ctx.lineTo(vw + 10, vh); ctx.fill();
      const hx = lerp(vw * 0.1, vw * 1.25, eIO(inv(0, 4.4, lt))), hy = lerp(vh * 0.95, vh * 0.2, eOut(inv(0, 2.4, lt))) + Math.sin(lt * 2) * 10;
      dragon(ctx, hx, hy, 1.15, lt + 9, 1);
      // 火の粉と熱のゆらぎ
      for (let i = 0; i < 40; i++) { const px = hash(i) * vw, py = vh - ((lt * (80 + hash(i + 2) * 160) + hash(i + 4) * vh) % vh); glow(ctx, px, py, 4 + hash(i) * 5, 'rgba(255,140,60,0.9)', 0.7); }
    } },

  // ---- 四、嵐と散る宝珠 ----
  { id: 'storm', d: 13, cues: [[0.4, 'thunder'], [2.1, 'thunder'], [3.6, 'explosion'], [5.6, 'checkpoint'], [6.6, 'checkpoint'], [7.6, 'checkpoint'], [8.6, 'checkpoint'], [9.6, 'checkpoint'], [10.6, 'checkpoint']],
    subs: [[0.3, 4.6, '竜のはいた嵐が城をおそい、宝珠は夜空へ ちりぢりに ──'], [5.2, 12.8, '光は、岐阜の各地へと落ちていきました。']],
    draw(ctx, t, vw, vh, S) {
      if (t < 4.6) {
        const strike = [0.4, 2.1, 3.6].some((s) => t > s && t < s + 0.18);
        S.shake = strike ? 7 : 2;
        sky(ctx, vw, vh, [[0, '#0a0c18'], [1, '#2a2a3a']]);
        // うねる黒雲
        for (let i = 0; i < 14; i++) { const x = ((hash(i) * vw * 1.4 - t * 40 * (0.5 + hash(i + 1))) % (vw * 1.4) + vw * 1.4) % (vw * 1.4) - vw * 0.2, y = vh * (0.05 + hash(i + 3) * 0.35), r = 80 + hash(i + 5) * 120; ctx.fillStyle = `rgba(${20 + i * 2},${22 + i * 2},${36 + i * 2},0.85)`; ctx.beginPath(); ctx.ellipse(x, y, r * 1.6, r * 0.6, 0, 0, TAU); ctx.fill(); }
        // 雲の中の竜の影
        dragon(ctx, vw * 0.5 + Math.cos(t * 0.9) * vw * 0.35, vh * 0.18 + Math.sin(t * 1.3) * 20, 0.55, t, Math.cos(t * 0.9 + Math.PI / 2) > 0 ? -1 : 1, '#06060c', 'rgba(120,140,255,0.6)', 0.9);
        // 稲光
        if (strike) { ctx.fillStyle = 'rgba(220,230,255,0.35)'; ctx.fillRect(0, 0, vw, vh); bolt(ctx, vw * (0.3 + hash(Math.floor(t * 3)) * 0.4), 0, vh * 0.6, Math.floor(t * 10), 1); }
        // 城
        drawCastleHill(ctx, vw * 0.5, vh * 0.5, vh, 1.3, strike ? '#3a3a58' : '#0c0a14');
        const top = castle(ctx, vw * 0.5 - 4, vh * 0.5 + 8, 1.1, 0.8, strike ? '#3a3a58' : '#0c0a14');
        // 宝珠：震えて → はじけ飛ぶ
        const burst = eOut(inv(3.6, 4.6, t));
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * TAU + t * 0.6, jitter = inv(1.5, 3.6, t) * 4;
          const ox = vw * 0.5 + Math.cos(a) * (70 + burst * vw * 0.7) + (hash(i + Math.floor(t * 30)) - 0.5) * jitter;
          const oy = top - 50 + Math.sin(a) * (18 + burst * vh * 0.5) + (hash(i + 9 + Math.floor(t * 30)) - 0.5) * jitter;
          drawOrb(ctx, ox, oy, 10, ORB_COLORS[i], 1 + burst);
        }
        if (burst > 0) { ctx.fillStyle = `rgba(255,250,230,${(1 - burst) * 0.8})`; ctx.fillRect(0, 0, vw, vh); }
        // 横なぐりの雨
        ctx.strokeStyle = 'rgba(190,210,255,0.4)'; ctx.lineWidth = 1.3; ctx.beginPath();
        for (let i = 0; i < 160; i++) { const x = (hash(i) * vw * 1.3 + t * 300) % (vw * 1.3) - vw * 0.15, y = (hash(i + 2) * vh + t * 900) % vh; ctx.moveTo(x, y); ctx.lineTo(x - 9, y + 22); }
        ctx.stroke();
        return;
      }
      // B：地図の上を、宝珠が彗星のように飛んで落ちる
      const lt = t - 4.6;
      S.shake = 0;
      ctx.drawImage(BAKE.map, 0, 0);
      const M = BAKE.mapRect, src = { x: M.x + M.w * 0.56, y: M.y + M.h * 0.72 };
      for (let i = 0; i < 6; i++) {
        const P = PLACES[i], tx = M.x + M.w * P.x, ty = M.y + M.h * P.y;
        const s0 = 0.4 + i * 1.0, k = inv(s0, s0 + 1.1, lt);
        if (k <= 0) continue;
        const cx2 = (src.x + tx) / 2 + (i % 2 ? 1 : -1) * 120, cy2 = Math.min(src.y, ty) - 160;
        const at = (u) => ({ x: (1 - u) ** 2 * src.x + 2 * (1 - u) * u * cx2 + u * u * tx, y: (1 - u) ** 2 * src.y + 2 * (1 - u) * u * cy2 + u * u * ty });
        const e = eIO(k);
        // 尾
        for (let j = 0; j < 22; j++) { const u = e - j * 0.018; if (u < 0) break; const p = at(u); ctx.fillStyle = ORB_COLORS[i]; ctx.globalAlpha = (1 - j / 22) * 0.55; ctx.beginPath(); ctx.arc(p.x, p.y, 7 * (1 - j / 22) + 1, 0, TAU); ctx.fill(); }
        ctx.globalAlpha = 1;
        const p = at(e);
        drawOrb(ctx, p.x, p.y, 9, ORB_COLORS[i], 1.2);
        if (k >= 1) {
          const lk = inv(s0 + 1.1, s0 + 1.9, lt);
          ctx.strokeStyle = ORB_COLORS[i]; ctx.globalAlpha = 1 - lk; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(tx, ty, 10 + lk * 46, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
          // 地名の判子と墨書き
          const sk = eOut(inv(s0 + 1.1, s0 + 1.5, lt));
          seal(ctx, tx + 34, ty - 4, 26 * lerp(1.6, 1, sk), '宝', sk);
          drawText(ctx, P.name, tx + 54, ty, { size: 22, color: '#1d1410', align: 'left', baseline: 'middle', serif: true, alpha: sk });
        }
      }
      const fo = inv(12.2, 13, t); if (fo > 0) { ctx.fillStyle = `rgba(0,0,0,${fo})`; ctx.fillRect(0, 0, vw, vh); }
    } },

  // ---- 五、乱れる里（斜めのコマ割り） ----
  { id: 'chaos', d: 9, cues: [[0.2, 'slash'], [1.6, 'slash'], [3.0, 'slash'], [5.0, 'hurt']],
    subs: [[0.6, 8.6, '宝珠の力にのまれた山の生き物たちは暴れだし、空はくるい、里の人びとは困りはてていました。']],
    draw(ctx, t, vw, vh) {
      ctx.fillStyle = '#0c0808'; ctx.fillRect(0, 0, vw, vh);
      const panels = 3, sk = vw * 0.06;
      for (let p = 0; p < panels; p++) {
        const k = eOut(inv(p * 1.4, p * 1.4 + 0.6, t)); if (k <= 0) continue;
        const x0 = p * vw / panels, x1 = (p + 1) * vw / panels, off = (1 - k) * vh * (p % 2 ? -1 : 1);
        ctx.save(); ctx.translate(0, off);
        ctx.beginPath(); ctx.moveTo(x0 + sk + 4, 0); ctx.lineTo(x1 + sk - 4, 0); ctx.lineTo(x1 - sk - 4, vh); ctx.lineTo(x0 - sk + 4, vh); ctx.closePath(); ctx.clip();
        const cx = (x0 + x1) / 2, lt = t - p * 1.4;
        if (p === 0) { // 長良川：荒れる川と光る目の魚、揺れる鵜飼舟
          sky(ctx, vw, vh, [[0, '#0e1a34'], [1, '#24406a']]);
          for (let w = 0; w < 6; w++) { ctx.fillStyle = `rgba(${40 + w * 10},${80 + w * 14},${140 + w * 12},0.9)`; ctx.beginPath(); ctx.moveTo(x0 - sk, vh); for (let i = 0; i <= 20; i++) { const xx = x0 - sk + (x1 - x0 + sk * 2) * i / 20; ctx.lineTo(xx, vh * (0.45 + w * 0.09) + Math.sin(i * 0.9 + lt * (2 + w * 0.4) + w) * 12); } ctx.lineTo(x1 + sk, vh); ctx.fill(); }
          ctx.save(); ctx.translate(cx, vh * 0.48 + Math.sin(lt * 2.5) * 10); ctx.rotate(Math.sin(lt * 1.8) * 0.25);
          ctx.fillStyle = '#140c08'; ctx.beginPath(); ctx.moveTo(-60, 0); ctx.lineTo(60, 0); ctx.lineTo(46, 14); ctx.lineTo(-48, 14); ctx.fill(); ctx.fillRect(40, -44, 3, 44); glow(ctx, 42, -50, 34, 'rgba(255,170,60,0.9)', 0.8 + 0.2 * Math.sin(lt * 12)); ctx.restore();
          for (let i = 0; i < 5; i++) { const ex = x0 + (i + 0.5) * (x1 - x0) / 5, ey = vh * (0.66 + hash(i) * 0.2) + Math.sin(lt * 3 + i) * 6; ctx.fillStyle = '#ff5a3a'; ctx.beginPath(); ctx.arc(ex - 5, ey, 2.6, 0, TAU); ctx.arc(ex + 5, ey, 2.6, 0, TAU); ctx.fill(); }
        } else if (p === 1) { // 高山：祭りの提灯がおばけに
          sky(ctx, vw, vh, [[0, '#1a0a26'], [1, '#4a1a3a']]);
          ctx.fillStyle = '#100810'; for (let i = 0; i < 4; i++) { const hx = x0 - sk + i * (x1 - x0 + sk * 2) / 4; ctx.fillRect(hx, vh * 0.5, (x1 - x0) / 4 + 8, vh * 0.5); ctx.beginPath(); ctx.moveTo(hx - 8, vh * 0.5); ctx.lineTo(hx + (x1 - x0) / 8 + 4, vh * 0.4); ctx.lineTo(hx + (x1 - x0) / 4 + 16, vh * 0.5); ctx.fill(); }
          for (let i = 0; i < 6; i++) { const lx = x0 + (i + 0.5) * (x1 - x0) / 6 + Math.sin(lt * 2 + i) * 14, ly = vh * (0.22 + (i % 2) * 0.12) + Math.sin(lt * 3 + i * 2) * 10; glow(ctx, lx, ly, 34, 'rgba(255,120,200,0.6)', 0.9); ctx.fillStyle = i % 2 ? '#e8503a' : '#b040e0'; ctx.beginPath(); ctx.ellipse(lx, ly, 13, 18, Math.sin(lt * 4 + i) * 0.3, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(lx - 4, ly - 2, 2.4, 0, TAU); ctx.arc(lx + 4, ly - 2, 2.4, 0, TAU); ctx.fill(); ctx.fillStyle = '#1a0a10'; ctx.beginPath(); ctx.ellipse(lx, ly + 7, 5, 3 + Math.sin(lt * 6 + i) * 2, 0, 0, TAU); ctx.fill(); }
        } else { // 白川郷：吹雪と赤い目
          sky(ctx, vw, vh, [[0, '#4a5a70'], [1, '#c8d4e4']]);
          for (let i = 0; i < 3; i++) { const gx = x0 + (i + 0.5) * (x1 - x0) / 3, gy = vh * 0.78; ctx.fillStyle = '#2a2a34'; ctx.beginPath(); ctx.moveTo(gx - 46, gy); ctx.lineTo(gx, gy - 74); ctx.lineTo(gx + 46, gy); ctx.fill(); ctx.fillRect(gx - 34, gy, 68, 30); ctx.fillStyle = '#f2f6ff'; ctx.beginPath(); ctx.moveTo(gx - 48, gy + 2); ctx.lineTo(gx, gy - 76); ctx.lineTo(gx + 48, gy + 2); ctx.lineTo(gx + 34, gy - 6); ctx.lineTo(gx, gy - 58); ctx.lineTo(gx - 34, gy - 6); ctx.fill(); }
          ctx.fillStyle = '#ff3a2a'; for (let i = 0; i < 4; i++) { const ex = x0 + hash(i + 3) * (x1 - x0), ey = vh * (0.5 + hash(i) * 0.2); if (Math.sin(lt * 2 + i * 2) > -0.3) { ctx.beginPath(); ctx.arc(ex - 6, ey, 3, 0, TAU); ctx.arc(ex + 6, ey, 3, 0, TAU); ctx.fill(); } }
          ctx.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = 0; i < 90; i++) { const sx = x1 + sk - ((hash(i) * (x1 - x0 + sk * 2) + lt * 380 * (0.6 + hash(i + 1))) % (x1 - x0 + sk * 2)), sy = (hash(i + 2) * vh + lt * 120) % vh; ctx.fillRect(sx, sy, 3, 2); }
        }
        ctx.restore();
        // コマの枠
        ctx.save(); ctx.translate(0, off); ctx.strokeStyle = '#f3ead7'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x0 + sk + 4, 0); ctx.lineTo(x1 + sk - 4, 0); ctx.lineTo(x1 - sk - 4, vh); ctx.lineTo(x0 - sk + 4, vh); ctx.closePath(); ctx.stroke(); ctx.restore();
      }
      // 墨の集中線と大きな擬音
      const big = inv(4.6, 5.4, t);
      if (big > 0) {
        ctx.save(); ctx.globalAlpha = Math.min(1, big * 2) * (1 - inv(8.3, 9, t));
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
        for (let i = 0; i < 80; i++) { const a = hash(i) * TAU, r0 = vh * (0.3 + hash(i + 1) * 0.1); ctx.beginPath(); ctx.moveTo(vw / 2 + Math.cos(a) * r0, vh / 2 + Math.sin(a) * r0); ctx.lineTo(vw / 2 + Math.cos(a) * vw, vh / 2 + Math.sin(a) * vw); ctx.stroke(); }
        const sc = lerp(2.2, 1, eOut(big));
        ctx.translate(vw / 2, vh / 2); ctx.rotate(-0.08); ctx.scale(sc, sc);
        drawText(ctx, 'ゴゴゴ…！', 0, 0, { size: 64, color: '#f3ead7', stroke: '#140808', strokeW: 12, align: 'center', baseline: 'middle', serif: true });
        ctx.restore();
      }
    } },

  // ---- 六、四人（一人ずつの見せ場） ----
  { id: 'heroes', d: 12.4, cues: [[0.15, 'slash'], [3.25, 'slash'], [6.35, 'slash'], [9.45, 'slash'], [12.0, 'confirm']],
    subs: [],
    draw(ctx, t, vw, vh) {
      const i = Math.min(3, Math.floor(t / 3.1)), lt = t - i * 3.1, id = HEROES[i], C = CHARS[id];
      const col = C.color, side = i % 2 ? -1 : 1;
      // 背景：斜めに割った2色と、流れる集中線
      ctx.fillStyle = '#120c10'; ctx.fillRect(0, 0, vw, vh);
      const k = eOut(inv(0, 0.35, lt));
      ctx.save(); ctx.fillStyle = col; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(vw * (side > 0 ? 0 : 1), 0); ctx.lineTo(lerp(vw * 0.5, vw * (side > 0 ? 0.62 : 0.38), k), 0); ctx.lineTo(lerp(vw * 0.5, vw * (side > 0 ? 0.48 : 0.52), k), vh); ctx.lineTo(vw * (side > 0 ? 0 : 1), vh); ctx.fill(); ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let j = 0; j < 40; j++) { const y = hash(j + i * 50) * vh, x = ((hash(j + 3) * vw - lt * 1400 * side * (0.6 + hash(j + 5))) % vw + vw) % vw, l = 60 + hash(j + 7) * 200; ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(side > 0 ? x : x - l, y, l, 2); }
      ctx.restore();
      // 墨の大きな一刷け（名前の下地）
      const bx = side > 0 ? vw * 0.46 : vw * 0.06, by = vh * 0.5;
      ctx.save(); ctx.globalAlpha = 0.88; brushStroke(ctx, bx, by, vw * 0.48, vh * 0.3, inv(0.15, 0.6, lt), col, i * 31); ctx.restore();   // キャラの色の一刷け
      // 主人公：走りこんで構える
      const hk = eOut(inv(0.1, 0.55, lt)), hxp = side > 0 ? lerp(-vw * 0.1, vw * 0.25, hk) : lerp(vw * 1.1, vw * 0.75, hk);
      glow(ctx, hxp, vh * 0.62, vh * 0.45, 'rgba(255,255,230,0.25)', 1);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(hxp, vh * 0.86, 90, 14, 0, 0, TAU); ctx.fill();
      const anim = lt < 0.55 ? 'run' : lt < 1.3 ? 'attack' : 'win';
      drawSprite(ctx, `hero_${id}_${anim}`, (lt * 10) | 0, hxp, vh * 0.86, { sx: 5.2, sy: 5.2, flip: side < 0 });
      // 名前・肩書き・技
      const tk = eOut(inv(0.4, 0.8, lt)), nx = side > 0 ? vw * 0.5 : vw * 0.1;
      ctx.save(); ctx.globalAlpha = tk; ctx.translate((1 - tk) * 60 * side, 0);
      drawText(ctx, C.title, nx, vh * 0.36, { size: 22, color: '#f3ead7', align: 'left', baseline: 'middle', serif: true });
      drawText(ctx, C.name, nx, vh * 0.5, { size: 86, color: '#fff8e6', stroke: '#140a08', strokeW: 10, align: 'left', baseline: 'middle', serif: true, shadow: true });
      drawText(ctx, `技：${C.tech}　／　${C.skill}`, nx, vh * 0.64, { size: 18, color: COL.kinLight, align: 'left', baseline: 'middle' });
      ctx.restore();
      seal(ctx, side > 0 ? vw * 0.9 : vw * 0.43, vh * 0.2, 58, C.name[0], tk);
      // 切りかえの一閃
      const sl = inv(2.85, 3.1, lt); if (sl > 0 && i < 3) { ctx.save(); ctx.translate(vw / 2, vh / 2); ctx.rotate(-0.4); ctx.fillStyle = '#fff'; ctx.fillRect(-vw, -6 * Math.sin(sl * Math.PI) * 6, vw * 2, 12 * Math.sin(sl * Math.PI) * 6); ctx.restore(); }
      // 最後：四人並び
      if (i === 3 && lt > 2.7) {
        const a = inv(2.7, 3.1, lt);
        ctx.fillStyle = `rgba(255,250,235,${a})`; ctx.fillRect(0, 0, vw, vh);
      }
    } },

  // ---- 七、旅立ちと題字 ----
  { id: 'title', d: 12, cues: [[5.2, 'bossDefeat'], [5.4, 'clear']],
    subs: [[0.4, 4.8, '「六つの宝珠を とりもどして、岐阜の空に晴れを！」'], [8.4, 12, '── 四人の旅が、いま始まる。']],
    draw(ctx, t, vw, vh) {
      const k = t / 12;
      sky(ctx, vw, vh, [[0, '#3a4a8a'], [0.45, '#ff9a6a'], [0.75, '#ffd89a'], [1, '#fff0c8']]);
      const sx = vw * 0.5, sy = vh * 0.66;
      glow(ctx, sx, sy, vh * 1.1, 'rgba(255,230,170,0.75)', 1);
      rays(ctx, sx, sy, vh * 1.4, 18, t * 0.05, 'rgba(255,250,220,0.5)', 0.75);
      ctx.fillStyle = '#fffbe8'; ctx.beginPath(); ctx.arc(sx, sy, vh * 0.16, 0, TAU); ctx.fill();
      // カメラ：寄りから引きへ
      const z = lerp(1.25, 1, eIO(inv(0, 6, t)));
      ctx.save(); ctx.translate(vw / 2, vh * 0.8); ctx.scale(z, z); ctx.translate(-vw / 2, -vh * 0.8);
      ridgeLayer(ctx, BAKE.ridges[1], 200 + t * 4, vh * 0.12, vw);
      mistBand(ctx, vw, vh * 0.74, 40, t, 0.5, '255,236,210');
      // 尾根（逆光の影）
      ctx.fillStyle = '#20141a'; ctx.beginPath(); ctx.moveTo(-50, vh); ctx.lineTo(-50, vh * 0.86); ctx.quadraticCurveTo(vw * 0.25, vh * 0.78, vw * 0.5, vh * 0.8); ctx.quadraticCurveTo(vw * 0.75, vh * 0.82, vw + 50, vh * 0.9); ctx.lineTo(vw + 50, vh); ctx.fill();
      // 四人の影絵（縁が光る）
      const S = BAKE.sil, sc = S.getContext('2d');
      sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, S.width, S.height);
      const walk = t < 3.5;
      for (let i = 0; i < 4; i++) { const px = lerp(-80, 170 + i * 100, eOut(inv(0, 3.4, t - i * 0.15))); drawSprite(sc, `hero_${HEROES[i]}_${walk ? 'walk' : i === 2 ? 'win' : 'idle'}`, (t * 9) | 0, px, 206, { sx: 2.4, sy: 2.4 }); }
      sc.globalCompositeOperation = 'source-atop'; sc.fillStyle = '#1a0e14'; sc.fillRect(0, 0, S.width, S.height); sc.globalCompositeOperation = 'source-over';
      const ox = vw / 2 - S.width / 2, oy = vh * 0.8 - 206;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; ctx.filter = 'blur(3px)'; ctx.drawImage(S, ox, oy - 2); ctx.restore();
      ctx.drawImage(S, ox, oy);
      // 草（手前でそよぐ）
      ctx.strokeStyle = '#140c10'; ctx.lineWidth = 2;
      for (let i = 0; i < 70; i++) { const gx = (i / 70) * vw + hash(i) * 12, gy = vh + 2, h = 24 + hash(i + 3) * 40, bend = Math.sin(t * 2 + i * 0.4) * 10 + 6; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.quadraticCurveTo(gx + bend * 0.4, gy - h * 0.6, gx + bend, gy - h); ctx.stroke(); }
      ctx.restore();
      // 紅葉が舞う
      for (let i = 0; i < 24; i++) { const x = ((hash(i) * vw + t * 70 * (0.6 + hash(i + 1))) % (vw + 60)) - 30, y = ((hash(i + 4) * vh + t * 40) % vh); ctx.save(); ctx.translate(x, y); ctx.rotate(t * 2 + i); ctx.globalAlpha = 0.9; drawMomiji(ctx, 6 + hash(i) * 4, i % 3 ? '#d84a24' : '#e8a020'); ctx.restore(); }
      // 題字が落ちてくる → 金の光が走る
      const lk = inv(5.0, 5.5, t);
      if (lk > 0) {
        const L = BAKE.logo, sh = BAKE.logoShine, shc = sh.getContext('2d');
        const sc2 = lerp(2.4, 1, eOut(lk)) * Math.min(1, vw / 900);
        if (lk < 1) { ctx.fillStyle = `rgba(255,250,230,${(1 - lk) * 0.6})`; ctx.fillRect(0, 0, vw, vh); }
        shc.globalCompositeOperation = 'source-over'; shc.clearRect(0, 0, sh.width, sh.height); shc.drawImage(L, 0, 0);
        const sw = inv(5.6, 6.8, t) * (sh.width + 300) - 150;
        shc.globalCompositeOperation = 'source-atop';
        const g = shc.createLinearGradient(sw - 60, 0, sw + 60, sh.height); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        shc.fillStyle = g; shc.fillRect(0, 0, sh.width, sh.height);
        ctx.save(); ctx.translate(vw / 2, vh * 0.3); ctx.scale(sc2, sc2); ctx.globalAlpha = lk;
        ctx.drawImage(sh, -sh.width / 2, -sh.height / 2); ctx.restore();
        // 題字のまわりを宝珠がめぐる
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + t * 0.8, ok = eOut(inv(5.4 + i * 0.1, 6.2 + i * 0.1, t)); drawOrb(ctx, vw / 2 + Math.cos(a) * 340 * Math.min(1, vw / 900) * ok, vh * 0.3 + Math.sin(a) * 70 * ok, 9, ORB_COLORS[i], 1); }
      }
    } },
];
const TOTAL = SHOTS.reduce((s, x) => s + x.d, 0);
const STARTS = []; { let a = 0; for (const s of SHOTS) { STARTS.push(a); a += s.d; } }

const SUB_ST = { size: 22, color: '#f6ecd8', stroke: '#000', strokeW: 4, align: 'center', baseline: 'middle', serif: true };
const SKIP_ST = { size: 14, color: 'rgba(243,234,215,0.85)', align: 'right', baseline: 'middle' };

export const openingScene = {
  T: 0, shake: 0, skipRect: { x: 0, y: 0, w: 0, h: 0 },
  enter(params = {}) {
    this.params = params; this.leaving = false; this.shake = 0;
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    this.T = q && q.get('ot') ? +q.get('ot') : 0;
    this.lastShot = -1; this.firedCues = new Set();
    touch.show('menu');
    audio.bgm('opening');
    this._auto = save.data.seenOpening && !params.force && !(q && q.get('scene') === 'opening');   // 2回目以降は自動で飛ばす
  },
  exit() { touch.hide(); },
  shotAt(T) { let i = 0; while (i < SHOTS.length - 1 && T >= STARTS[i + 1]) i++; return i; },
  update(dt) {
    if (this._auto) { this._auto = false; this.leaving = true; game.go('select', { from: 'opening' }, 'none'); return; }
    if (this.leaving) return;
    const prev = this.T;
    this.T += dt;
    // 効果音の合図
    const i = this.shotAt(this.T), s = SHOTS[i], lt = this.T - STARTS[i], plt = prev - STARTS[i];
    if (s.cues) for (const [ct, name] of s.cues) if (plt < ct && lt >= ct) audio.sfx(name);
    // 操作
    const tp = touch.tap(), S = this.skipRect;
    if (input.pressed.back || input.pressed.pause || (tp && tp.x >= S.x && tp.x <= S.x + S.w && tp.y >= S.y && tp.y <= S.y + S.h)) { audio.sfx('cancel'); return this.finish('fade'); }
    if (this.T > 0.4 && (tp || input.pressed.confirm || input.pressed.jump)) {
      if (this.T >= TOTAL - 0.2) return this.finish('iris');
      this.T = STARTS[i + 1] ?? TOTAL - 0.01;   // 次の場面へ
      audio.sfx('select');
    }
    if (this.T >= TOTAL + 3) this.finish('iris');
  },
  finish(kind) {
    if (this.leaving) return;
    this.leaving = true;
    save.data.seenOpening = true; save.write();
    game.go('select', { from: 'opening' }, kind, { dur: 0.8 });
  },
  draw(ctx, a, vw, vh) {
    bakeAll(vw, vh);
    const T = Math.min(this.T, TOTAL - 0.001), i = this.shotAt(T), s = SHOTS[i], lt = T - STARTS[i];
    const S = { shake: 0 };
    ctx.save();
    // 地鳴り・稲光の揺れ（前のフレームで場面が決めた大きさ。設定で揺れを弱くしていれば1/4）
    const sh = this.shake * (RUNTIME.shake ? 1 : 0.25);
    if (sh > 0.1) { const f = Math.floor(this.T * 60); ctx.translate((hash(f) - 0.5) * sh * 2, (hash(f + 13) - 0.5) * sh * 2); ctx.scale(1.02, 1.02); }
    s.draw(ctx, lt, vw, vh, S);
    ctx.restore();
    this.shake = S.shake;
    // 場面のつなぎ：頭と終わりを黒で溶かす（墨の場面の終わりは白）
    const fin = 1 - inv(0, 0.45, lt), fout = inv(s.d - 0.4, s.d, lt);
    const fadeA = Math.max(i === 0 ? 0 : fin, s.id === 'ink' ? 0 : fout);
    if (fadeA > 0) { ctx.fillStyle = SHOTS[i - 1] && SHOTS[i - 1].id === 'ink' && lt < 0.45 ? `rgba(255,248,230,${fin})` : `rgba(0,0,0,${fadeA})`; ctx.fillRect(0, 0, vw, vh); }
    // フィルムの粒とビネット
    ctx.save(); ctx.globalAlpha = 0.5; const gx = -(hash(Math.floor(this.T * 24)) * 256) | 0, gy = -(hash(Math.floor(this.T * 24) + 7) * 256) | 0;
    for (let y = gy; y < vh; y += 256) for (let x = gx; x < vw; x += 256) ctx.drawImage(BAKE.grain, x, y);
    ctx.restore();
    ctx.drawImage(BAKE.vignette, 0, 0);
    // 映画の黒帯と字幕
    const bar = Math.round(vh * 0.1);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, vw, bar); ctx.fillRect(0, vh - bar, vw, bar);
    if (s.subs) for (const [a0, a1, str] of s.subs) {
      if (lt < a0 || lt > a1) continue;
      const al = Math.min(1, (lt - a0) * 3, (a1 - lt) * 3);
      const n = Math.min(str.length, Math.floor((lt - a0) * 26));
      drawText(ctx, str.slice(0, n), vw / 2, vh - bar / 2, { ...SUB_ST, alpha: al, size: Math.min(22, (vw - 60) / Math.max(10, str.length) * 1.05) });
    }
    // 場面の番号（漢数字）と「とばす」
    drawText(ctx, `${'一二三四五六七'[i]}　${['墨', '宝珠の城', '目覚め', '嵐', '乱れ', '四人', '旅立ち'][i]}`, 18, bar / 2, { size: 14, color: 'rgba(243,234,215,0.55)', align: 'left', baseline: 'middle', serif: true });
    const R = this.skipRect; R.w = 150; R.h = bar; R.x = vw - R.w; R.y = 0;
    drawText(ctx, touch.enabled ? 'とばす ▶▶' : 'Esc：とばす　Z：次へ', vw - 16, bar / 2, SKIP_ST);
    if (this.T >= TOTAL - 0.5) {
      const p = 0.5 + 0.5 * Math.sin(this.T * 4);
      drawText(ctx, touch.enabled ? 'タップで はじめる' : 'Z で はじめる', vw / 2, vh * 0.56, { size: 20, color: '#fff8e6', stroke: '#2a1408', strokeW: 5, align: 'center', baseline: 'middle', alpha: 0.5 + 0.5 * p });
    }
  },
};
