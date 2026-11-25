import { makeCanvas } from '../gfx/renderer.js';
import { rng, mix, shade, rgba, ell, poly, fs, lin, rad, glow, flame, sparkle } from './props.js';
// 背景の多重スクロール（担当：アート）。createBackdrop(theme, levelData) → { draw, drawFront }
// 設計書2章「描画の層」：空(0) → 雲3層(0.03〜0.1) → 遠景(0.12) → 中景(0.3, 0.5) …… 前景(1.3)
// 各層は createBackdrop のときに「横に繰り返せる画像」へ焼き付け、毎フレームは drawImage だけ。
// 時間帯（昼/夕/夜/夜祭り）ごとに色を変えた組を焼き、切り替わるときは混ぜる。暗さ・色調補正は FX 担当。

const W = 1600;                         // 層の画像の幅（論理ドット。横に繰り返す）
const TAU = Math.PI * 2;
const OVERCAST = new Set(['cloudy', 'rain', 'shower', 'storm', 'thunder', 'thunderstorm', 'fog', 'blizzard', 'ash', 'snow']);

const TOD = {
  day:      { tint: null,      amt: 0,    haze: '#cfe4f4', rim: 'rgba(255,255,255,0.35)', lit: 0, cloud: ['#ffffff', '#c4d4e8'], ocloud: ['#d4d8de', '#8a929e'] },
  dusk:     { tint: '#6a3a5a', amt: 0.34, haze: '#f0a478', rim: 'rgba(255,180,110,0.7)', lit: 0.6, cloud: ['#ffd8b8', '#a86a8a'], ocloud: ['#b8a0a8', '#6a5468'] },
  night:    { tint: '#0c1430', amt: 0.55, haze: '#26345a', rim: 'rgba(150,180,255,0.25)', lit: 1, cloud: ['#3a4a6e', '#1a2240'], ocloud: ['#2e3448', '#151a28'] },
  festival: { tint: '#1a0e2e', amt: 0.5,  haze: '#3a2448', rim: 'rgba(255,150,100,0.35)', lit: 1, fest: true, cloud: ['#4a3a62', '#22183a'], ocloud: ['#3a3040', '#1a1420'] },
};

// ------------------------------------------------------------------ 道具
function canvas(w, h, s) { const c = makeCanvas(w * s, h * s); const ctx = c.getContext('2d'); ctx.scale(s, s); return { c, ctx, w, h, s }; }
/** 周期 W で繰り返す起伏。comps: [[高さ, 山の数(整数), 位相], ...] */
function profile(comps, base, extra) {
  return (x) => {
    let y = base;
    for (const [a, k, ph] of comps) y -= a * (0.5 + 0.5 * Math.sin((TAU * k * x) / W + ph));
    if (extra) y -= extra(x);
    return y;
  };
}
/** とがった山並み（北アルプス） */
function jagged(comps, base) {
  return (x) => {
    let y = base;
    for (const [a, k, ph] of comps) y -= a * Math.pow(Math.abs(Math.sin((Math.PI * k * x) / W + ph)), 1.6);
    return y;
  };
}
/** 周期を考えた山（中心 cx、幅 w、高さ h）のこぶ */
function bump(cx, w, h, pow = 2) {
  return (x) => { let d = Math.abs(x - cx); d = Math.min(d, W - d); const u = d / w; return u >= 1 ? 0 : h * Math.pow(Math.cos((u * Math.PI) / 2), pow); };
}
function fillProfile(ctx, f, H, fill, step = 4) {
  ctx.beginPath(); ctx.moveTo(0, H + 2);
  for (let x = 0; x <= W; x += step) ctx.lineTo(x, f(x));
  ctx.lineTo(W, H + 2); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
}
function rimProfile(ctx, f, color, lw = 1.5, step = 4) {
  ctx.beginPath(); for (let x = 0; x <= W; x += step) x ? ctx.lineTo(x, f(x) + 0.5) : ctx.moveTo(x, f(x) + 0.5);
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
}
/** 横に繰り返すので、端にかかる物は反対側にも描く */
function wrap(x, half, fn) { fn(x); if (x - half < 0) fn(x + W); if (x + half > W) fn(x - W); }

// ------------------------------------------------------------------ 共通の絵柄
function treeBlobs(ctx, f, r, C, opt = {}) {
  // 山の稜線に沿って丸い木々を並べ、もこもこの森にする
  const R = rng(opt.seed || 1);
  const base = opt.color, step = opt.step || 9;
  for (let x = -10; x <= W + 10; x += step * (0.6 + R() * 0.8)) {
    const rr = r * (0.7 + R() * 0.6), y = f(((x % W) + W) % W) + rr * 0.35;
    wrap(x, rr, (xx) => {
      ell(ctx, xx, y, rr, rr * 0.9); ctx.fillStyle = shade(base, -0.08 + R() * 0.06); ctx.fill();
      ell(ctx, xx - rr * 0.25, y - rr * 0.3, rr * 0.6, rr * 0.45); ctx.fillStyle = shade(base, 0.1); ctx.fill();
    });
    if (opt.cedar && R() < opt.cedar) {
      const h = r * (2.4 + R() * 1.6), cw = r * 0.7;
      wrap(x, cw, (xx) => { poly(ctx, [xx - cw, y + 2, xx, y - h, xx + cw, y + 2]); ctx.fillStyle = shade(base, -0.18); ctx.fill(); poly(ctx, [xx - cw * 0.2, y - h * 0.6, xx, y - h, xx + cw * 0.15, y - h * 0.4]); ctx.fillStyle = shade(base, 0.05); ctx.fill(); });
    }
  }
}
function cedars(ctx, list, color, snow) {
  for (const [x, y, h] of list) {
    const w = h * 0.32;
    wrap(x, w, (xx) => {
      for (let k = 0; k < 4; k++) {
        const ty = y - h + k * h * 0.22, tw = w * (0.4 + k * 0.22);
        poly(ctx, [xx, ty, xx + tw, ty + h * 0.32, xx - tw, ty + h * 0.32]); ctx.fillStyle = shade(color, -k * 0.04); ctx.fill();
        if (snow) { poly(ctx, [xx, ty + 1, xx + tw * 0.7, ty + h * 0.2, xx - tw * 0.7, ty + h * 0.2]); ctx.fillStyle = snow; ctx.fill(); }
      }
      ctx.fillStyle = shade(color, -0.3); ctx.fillRect(xx - 1.5, y - 2, 3, 6);
    });
  }
}
function castle(ctx, x, y, s, C, T) {
  // 小さな天守のシルエット（3層）。y は石垣の下端
  const wall = C('#f2efe6'), roof = C('#3e4450'), stone = C('#8a8478');
  wrap(x, 30 * s, (xx) => {
    poly(ctx, [xx - 14 * s, y, xx + 14 * s, y, xx + 11 * s, y - 7 * s, xx - 11 * s, y - 7 * s]); ctx.fillStyle = stone; ctx.fill();
    const tiers = [[11, 7], [8.5, 6], [6, 5.5]];
    let ty = y - 7 * s;
    tiers.forEach(([hw, h], i) => {
      ctx.fillStyle = wall; ctx.fillRect(xx - hw * s, ty - h * s, hw * 2 * s, h * s);
      if (T.lit) { ctx.fillStyle = rgba('#ffd27a', 0.85 * T.lit); for (let k = -1; k <= 1; k++) ctx.fillRect(xx + k * hw * 0.55 * s - 0.8 * s, ty - h * 0.65 * s, 1.6 * s, 1.8 * s); }
      else { ctx.fillStyle = roof; for (let k = -1; k <= 1; k++) ctx.fillRect(xx + k * hw * 0.55 * s - 0.6 * s, ty - h * 0.65 * s, 1.2 * s, 1.6 * s); }
      ty -= h * s;
      const ew = (hw + 3) * s;
      ctx.beginPath(); ctx.moveTo(xx - ew, ty + 1.5 * s); ctx.quadraticCurveTo(xx - ew + 2 * s, ty, xx - hw * 0.6 * s, ty - 2.6 * s);
      ctx.lineTo(xx + hw * 0.6 * s, ty - 2.6 * s); ctx.quadraticCurveTo(xx + ew - 2 * s, ty, xx + ew, ty + 1.5 * s); ctx.closePath();
      ctx.fillStyle = roof; ctx.fill();
      ty -= 2.2 * s;
      if (i === 2) { ctx.fillStyle = C('#e8c050'); ctx.fillRect(xx - 3.5 * s, ty - 1.4 * s, 1.4 * s, 1.6 * s); ctx.fillRect(xx + 2.1 * s, ty - 1.4 * s, 1.4 * s, 1.6 * s); }
    });
  });
}
function house(ctx, x, yb, w, h, C, T, kind, R) {
  // kind: 'machiya'（飛騨の町家：焦げ茶の格子） | 'shirokabe'（白壁と瓦） | 'gassho'（合掌造り）
  wrap(x + w / 2, w, (xx0) => {
    const xx = xx0 - w / 2;
    if (kind === 'gassho') {
      const rh = h * 1.15;
      ctx.fillStyle = C('#6a4a30'); ctx.fillRect(xx + w * 0.12, yb - h * 0.42, w * 0.76, h * 0.42);
      poly(ctx, [xx - w * 0.05, yb - h * 0.36, xx + w / 2, yb - h * 0.36 - rh, xx + w * 1.05, yb - h * 0.36]); ctx.fillStyle = C('#8a6a42'); ctx.fill();
      poly(ctx, [xx - w * 0.02, yb - h * 0.38, xx + w / 2, yb - h * 0.34 - rh, xx + w * 1.02, yb - h * 0.38, xx + w * 0.85, yb - h * 0.5, xx + w / 2, yb - h * 0.34 - rh * 0.8, xx + w * 0.15, yb - h * 0.5]);
      ctx.fillStyle = C('#f4f8fc'); ctx.fill();
      const win = T.lit ? rgba('#ffcf7a', 0.95) : C('#3a2a1c');
      ctx.fillStyle = win; ctx.fillRect(xx + w * 0.44, yb - h * 0.36 - rh * 0.45, w * 0.12, rh * 0.14);
      ctx.fillRect(xx + w * 0.25, yb - h * 0.32, w * 0.14, h * 0.14); ctx.fillRect(xx + w * 0.6, yb - h * 0.32, w * 0.14, h * 0.14);
      if (T.lit) { glow(ctx, xx + w * 0.5, yb - h * 0.3, w * 0.5, '#ffb060', 0.25 * T.lit); }
      return;
    }
    const wallC = kind === 'machiya' ? C('#5a3a26') : C('#ece6d8');
    const roofC = C(kind === 'machiya' ? '#3a3a40' : '#4a505a');
    ctx.fillStyle = wallC; ctx.fillRect(xx, yb - h, w, h);
    if (kind === 'shirokabe') { ctx.fillStyle = C('#3a2a20'); ctx.fillRect(xx, yb - h * 0.35, w, h * 0.35); }
    // 窓・格子
    const lit = T.lit && R() < 0.75;
    ctx.fillStyle = lit ? rgba('#ffcf7a', 0.95) : C(kind === 'machiya' ? '#2a1a10' : '#5a4a40');
    const nw = Math.max(1, Math.floor(w / 16));
    for (let i = 0; i < nw; i++) ctx.fillRect(xx + 4 + i * (w - 8) / nw, yb - h * 0.75, (w - 8) / nw - 3, h * 0.3);
    if (kind === 'machiya') { ctx.fillStyle = C('#2a1a10'); for (let gx = xx + 2; gx < xx + w - 2; gx += 3) ctx.fillRect(gx, yb - h * 0.3, 1, h * 0.3); }
    if (lit) glow(ctx, xx + w / 2, yb - h * 0.6, w * 0.6, '#ffb060', 0.18);
    // 瓦屋根
    const rh = h * 0.42;
    poly(ctx, [xx - 5, yb - h + 1, xx + 4, yb - h - rh, xx + w - 4, yb - h - rh, xx + w + 5, yb - h + 1]); ctx.fillStyle = roofC; ctx.fill();
    ctx.fillStyle = rgba('#ffffff', 0.12); ctx.fillRect(xx + 4, yb - h - rh, w - 8, 1.5);
    if (T.fest && R() < 0.6) lanterns(ctx, xx - 4, xx + w + 4, yb - h + 3, R);
  });
}
function lanterns(ctx, x0, x1, y, R) {
  ctx.strokeStyle = 'rgba(30,20,20,0.6)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo((x0 + x1) / 2, y + 6, x1, y); ctx.stroke();
  for (let x = x0 + 5; x < x1 - 2; x += 9) {
    const u = (x - x0) / (x1 - x0), yy = y + 6 * 4 * u * (1 - u) * 0.5 + 3;
    glow(ctx, x, yy, 9, '#ff8a3a', 0.35);
    ell(ctx, x, yy, 2.4, 3); ctx.fillStyle = R() < 0.5 ? '#ff5a3a' : '#ffb04a'; ctx.fill();
  }
}
function water(ctx, y0, y1, C, T, R) {
  ctx.fillStyle = lin(ctx, 0, y0, 0, y1, [0, C('#8ac8e0'), 1, C('#2e6a90')]); ctx.fillRect(0, y0, W, y1 - y0);
  for (let i = 0; i < 160; i++) {
    const y = y0 + 3 + R() * (y1 - y0 - 4), x = R() * W, l = 6 + R() * 22;
    ctx.fillStyle = T.lit ? rgba('#ffd090', 0.15 + R() * 0.2) : rgba('#ffffff', 0.2 + R() * 0.35);
    ctx.fillRect(x, y, l, 1);
  }
}
function steam(ctx, x, y, h, a, R) {
  for (let i = 0; i < 9; i++) {
    const u = i / 8, r = 10 + u * 26;
    const cx = x + Math.sin(u * 4 + x) * 10 * u, cy = y - u * h;
    ctx.fillStyle = rad(ctx, cx, cy, 0, r, [0, rgba('#ffffff', a * (1 - u * 0.75)), 1, rgba('#ffffff', 0)]);
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
}

// ------------------------------------------------------------------ 沖縄（ステージ8）の絵柄
/** 入道雲：下の平らな底から、もくもくと高く積み上がる雲の柱（影 → 明るい面 → ふちの光） */
function cumulonimbus(ctx, cx, base, w, h, cols, rimC, seed) {
  const R = rng(seed), puffs = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16, y = base - t * h;
    const width = w * (0.55 + 0.25 * Math.sin(t * 2.4) + (t > 0.82 ? (t - 0.82) * 2.2 : 0));
    const n = 2 + ((width / 26) | 0);
    for (let j = 0; j < n; j++) {
      const px = cx + (R() - 0.5) * width + Math.sin(t * 3) * w * 0.08, pr = (16 + R() * 18) * (w / 150) * (1 - t * 0.25);
      puffs.push([px, y, pr]);
    }
  }
  const [lit, sh] = cols, deep = shade(sh, -0.18);
  const tOf = (y) => Math.min(1, Math.max(0, (base - y) / h));
  for (const [x, y, r] of puffs) wrap(x, r, (xx) => { ell(ctx, xx + r * 0.18, y + r * 0.2, r, r * 0.92); ctx.fillStyle = mix(deep, sh, tOf(y)); ctx.fill(); });
  for (const [x, y, r] of puffs) wrap(x, r, (xx) => { ell(ctx, xx - r * 0.16, y - r * 0.14, r * 0.78, r * 0.72); ctx.fillStyle = mix(mix(sh, lit, 0.55), lit, tOf(y)); ctx.fill(); });
  for (const [x, y, r] of puffs) wrap(x, r, (xx) => { ell(ctx, xx - r * 0.3, y - r * 0.32, r * 0.42, r * 0.32); ctx.fillStyle = rimC; ctx.fill(); });
  // 平らな底の影
  wrap(cx, w, (xx) => { ctx.fillStyle = lin(ctx, 0, base - 26, 0, base + 10, [0, rgba(sh, 0), 1, rgba(sh, 0.95)]); ell(ctx, xx, base + 2, w * 0.62, 16); ctx.fill(); });
}
/** 赤瓦の家（遠景・中景）。寄棟の赤い屋根に白い漆喰の筋、棟の真ん中にシーサーの点 */
function ryukyuHouse(ctx, x, yb, w, h, C, T, R, wall) {
  const lit = T.lit && R() < 0.75;
  wrap(x + w / 2, w + 10, (xx0) => {
    const xx = xx0 - w / 2;
    ctx.fillStyle = C('#5a3e2a'); ctx.fillRect(xx + w * 0.07, yb - h * 0.5, w * 0.86, h * 0.5);
    ctx.fillStyle = lit ? rgba('#ffcf7a', 0.95) : C('#b0946a');
    const nd = Math.max(2, Math.round(w / 14));
    for (let i = 0; i < nd; i++) ctx.fillRect(xx + w * 0.1 + i * (w * 0.8 / nd) + 0.8, yb - h * 0.42, w * 0.8 / nd - 1.6, h * 0.36);
    if (lit) glow(ctx, xx + w / 2, yb - h * 0.25, w * 0.6, '#ffb060', 0.2 * T.lit);
    // 寄棟の屋根
    const rt = yb - h * 0.5 - h * 0.62, re = yb - h * 0.46;
    poly(ctx, [xx - w * 0.05, re, xx + w * 0.3, rt, xx + w * 0.7, rt, xx + w * 1.05, re]);
    ctx.fillStyle = lin(ctx, 0, rt, 0, re, [0, C('#d8693e'), 1, C('#a83c24')]); ctx.fill();
    ctx.strokeStyle = C('#f4eee2'); ctx.lineWidth = Math.max(0.5, w / 90);
    ctx.beginPath();
    for (let u = 0.08; u < 0.95; u += 0.11) { ctx.moveTo(xx + w * (0.3 + 0.4 * u), rt + 0.5); ctx.lineTo(xx + w * (-0.05 + 1.1 * u), re - 0.5); }
    ctx.stroke();
    ctx.lineWidth = Math.max(0.8, w / 50);
    ctx.beginPath(); ctx.moveTo(xx + w * 0.3, rt); ctx.lineTo(xx + w * 0.7, rt); ctx.moveTo(xx + w * 0.3, rt); ctx.lineTo(xx - w * 0.05, re); ctx.moveTo(xx + w * 0.7, rt); ctx.lineTo(xx + w * 1.05, re); ctx.stroke();
    ell(ctx, xx + w / 2, rt - h * 0.06, Math.max(1, w * 0.035), Math.max(1, h * 0.07)); ctx.fillStyle = C('#c87040'); ctx.fill();
    // 石垣の塀（低い）
    if (wall) {
      ctx.fillStyle = C('#d8d0b6'); ctx.fillRect(xx - w * 0.2, yb - h * 0.28, w * 1.4, h * 0.28);
      ctx.strokeStyle = C('#a09878'); ctx.lineWidth = 0.6;
      for (let gx = xx - w * 0.2; gx < xx + w * 1.2; gx += 5 + R() * 4) { ctx.beginPath(); ctx.moveTo(gx, yb - h * 0.28); ctx.lineTo(gx + 1, yb); ctx.stroke(); }
      ctx.fillStyle = rgba('#ffffff', 0.25); ctx.fillRect(xx - w * 0.2, yb - h * 0.28, w * 1.4, 1);
    }
  });
}
/** フクギ：まっすぐで背の高い、濃い緑の防風林の木 */
function fukugi(ctx, x, yb, h, C, R, hz = 0) {
  const w = h * 0.26;
  wrap(x, w * 2, (xx) => {
    ctx.fillStyle = C('#3a2a1c', hz); ctx.fillRect(xx - 1, yb - h * 0.25, 2, h * 0.25);
    for (let k = 0; k < 5; k++) {
      const y = yb - h * 0.25 - k * h * 0.16, rw = w * (1 - k * 0.12);
      ell(ctx, xx + (R() - 0.5) * 2, y - h * 0.08, rw, h * 0.13); ctx.fillStyle = C(k % 2 ? '#2e6a38' : '#25583a', hz); ctx.fill();
      ell(ctx, xx - rw * 0.3, y - h * 0.12, rw * 0.45, h * 0.06); ctx.fillStyle = C('#4a8a4e', hz); ctx.fill();
    }
  });
}
/** 首里の王城を思わせる高台の城：曲線の石垣と、朱塗りの正殿（二重の赤瓦屋根・唐破風） */
function seiden(ctx, x, y, s, C, T) {
  wrap(x, 110 * s, (xx) => {
    // 石垣（曲線を描く2段）
    for (const [hw, hh, dy] of [[100, 18, 0], [70, 16, -16]]) {
      ctx.beginPath(); ctx.moveTo(xx - hw * s, y + dy * s);
      ctx.bezierCurveTo(xx - hw * 0.8 * s, y + (dy - hh * 1.2) * s, xx - hw * 0.45 * s, y + (dy - hh) * s, xx - hw * 0.2 * s, y + (dy - hh * 1.15) * s);
      ctx.lineTo(xx + hw * 0.2 * s, y + (dy - hh * 1.15) * s);
      ctx.bezierCurveTo(xx + hw * 0.45 * s, y + (dy - hh) * s, xx + hw * 0.8 * s, y + (dy - hh * 1.2) * s, xx + hw * s, y + dy * s);
      ctx.closePath(); ctx.fillStyle = lin(ctx, 0, y + (dy - hh) * s, 0, y + dy * s, [0, C('#ece4cc'), 1, C('#b0a68a')]); ctx.fill();
      ctx.strokeStyle = C('#8a8068'); ctx.lineWidth = 0.6;
      for (let gy = 1; gy < 3; gy++) { ctx.beginPath(); ctx.moveTo(xx - hw * 0.9 * s, y + (dy - gy * 5) * s); ctx.lineTo(xx + hw * 0.9 * s, y + (dy - gy * 5) * s); ctx.stroke(); }
    }
    // 門（アーチ）
    ctx.fillStyle = C('#3a2a22'); ctx.beginPath(); ctx.moveTo(xx - 48 * s, y); ctx.lineTo(xx - 48 * s, y - 8 * s); ctx.arc(xx - 44 * s, y - 8 * s, 4 * s, Math.PI, 0); ctx.lineTo(xx - 40 * s, y); ctx.closePath(); ctx.fill();
    poly(ctx, [xx - 52 * s, y - 14 * s, xx - 44 * s, y - 19 * s, xx - 36 * s, y - 14 * s]); ctx.fillStyle = C('#c8503a'); ctx.fill();
    // 正殿
    const by = y - 34 * s, hw = 34 * s;
    ctx.fillStyle = C('#c8302a'); ctx.fillRect(xx - hw, by - 16 * s, hw * 2, 16 * s);
    ctx.fillStyle = T.lit ? rgba('#ffd080', 0.9) : C('#7a1a16');
    for (let i = -3; i <= 3; i++) ctx.fillRect(xx + i * 9 * s - 3 * s, by - 12 * s, 6 * s, 8 * s);
    ctx.fillStyle = C('#e8b840'); ctx.fillRect(xx - hw, by - 16 * s, hw * 2, 1.2 * s); ctx.fillRect(xx - hw, by - 2 * s, hw * 2, 1.2 * s);
    if (T.lit) glow(ctx, xx, by - 8 * s, 50 * s, '#ffb060', 0.25 * T.lit);
    // 屋根（下の屋根 → 中の壁 → 上の屋根）
    const roofC = C('#d0603a'), plaster = C('#f2ece0');
    const roof = (yy, w2, h2) => {
      ctx.beginPath(); ctx.moveTo(xx - w2 - 6 * s, yy); ctx.quadraticCurveTo(xx - w2 * 0.6, yy - h2 * 0.35, xx - w2 * 0.55, yy - h2); ctx.lineTo(xx + w2 * 0.55, yy - h2); ctx.quadraticCurveTo(xx + w2 * 0.6, yy - h2 * 0.35, xx + w2 + 6 * s, yy); ctx.closePath();
      ctx.fillStyle = roofC; ctx.fill();
      ctx.strokeStyle = plaster; ctx.lineWidth = 0.7 * s; ctx.beginPath();
      for (let u = -0.85; u <= 0.86; u += 0.17) { ctx.moveTo(xx + u * w2 * 0.55, yy - h2 + 0.5); ctx.lineTo(xx + u * (w2 + 4 * s), yy - 0.5); }
      ctx.stroke();
      ctx.lineWidth = 1.4 * s; ctx.beginPath(); ctx.moveTo(xx - w2 * 0.55, yy - h2); ctx.lineTo(xx + w2 * 0.55, yy - h2); ctx.stroke();
      // 棟の両端の飾り（金の竜頭を思わせる）
      ctx.fillStyle = C('#f0c040'); ell(ctx, xx - w2 * 0.55, yy - h2 - 1.5 * s, 1.6 * s, 2.4 * s); ctx.fill(); ell(ctx, xx + w2 * 0.55, yy - h2 - 1.5 * s, 1.6 * s, 2.4 * s); ctx.fill();
    };
    roof(by - 15 * s, hw + 4 * s, 9 * s);
    ctx.fillStyle = C('#b8282a'); ctx.fillRect(xx - hw * 0.7, by - 30 * s, hw * 1.4, 7 * s);
    ctx.fillStyle = T.lit ? rgba('#ffd080', 0.85) : C('#6a1612');
    for (let i = -2; i <= 2; i++) ctx.fillRect(xx + i * 8 * s - 2 * s, by - 28.5 * s, 4 * s, 4 * s);
    roof(by - 29 * s, hw * 0.78, 10 * s);
    // 唐破風（正面の曲がった破風）
    ctx.beginPath(); ctx.moveTo(xx - 12 * s, by - 14 * s); ctx.bezierCurveTo(xx - 8 * s, by - 16 * s, xx - 5 * s, by - 24 * s, xx, by - 24 * s); ctx.bezierCurveTo(xx + 5 * s, by - 24 * s, xx + 8 * s, by - 16 * s, xx + 12 * s, by - 14 * s); ctx.closePath();
    ctx.fillStyle = roofC; ctx.fill(); ctx.strokeStyle = C('#f0c040'); ctx.lineWidth = 0.9 * s; ctx.stroke();
  });
}
/** さとうきび畑の帯（細い葉の茂みと、銀色の穂） */
function caneField(ctx, x0, x1, yb, h, C, R, hz) {
  ctx.fillStyle = C('#3e6a2a', hz); ctx.fillRect(x0, yb - h * 0.45, x1 - x0, h * 0.45 + 2);
  for (let x = x0; x < x1; x += 2.2) {
    const hh = h * (0.7 + R() * 0.45), lean = (R() - 0.5) * 10;
    ctx.strokeStyle = C(R() < 0.5 ? '#5a9a3a' : '#7ab04a', hz); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(x, yb); ctx.quadraticCurveTo(x + lean * 0.3, yb - hh * 0.7, x + lean, yb - hh); ctx.stroke();
    if (R() < 0.12) { ctx.strokeStyle = C('#ece6e0', hz); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x + lean, yb - hh); ctx.lineTo(x + lean + 1, yb - hh - 6); ctx.stroke(); }
  }
}
/** ヤシ（背景用のシルエットに近い形） */
function bgPalm(ctx, x, yb, h, C, R, hz) {
  wrap(x, h, (xx) => {
    const tx = xx + h * 0.18, ty = yb - h;
    ctx.strokeStyle = C('#6a5038', hz); ctx.lineWidth = Math.max(1.5, h * 0.05);
    ctx.beginPath(); ctx.moveTo(xx, yb); ctx.quadraticCurveTo(xx + h * 0.02, yb - h * 0.6, tx, ty); ctx.stroke();
    for (let k = 0; k < 8; k++) {
      const a = Math.PI + (k / 7) * Math.PI, L = h * (0.38 + R() * 0.12);
      const ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L * 0.35 + L * 0.35;
      ctx.strokeStyle = C(k % 2 ? '#3e7a32' : '#2e6a2a', hz); ctx.lineWidth = Math.max(1.4, h * 0.045);
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx + Math.cos(a) * L * 0.6, ty - L * 0.3, ex, ey); ctx.stroke();
    }
  });
}
/** 空の色を濃くする重ね絵（環境の空のグラデーションの上に重ねる） */
function skyOverlay(stops) {
  const L = canvas(4, 256, 1);
  L.ctx.fillStyle = lin(L.ctx, 0, 0, 0, 256, stops); L.ctx.fillRect(0, 0, 4, 256);
  return L.c;
}
/** 海のきらめき（太陽・月の下にだけ光の道ができる） */
function glitterArt(col) {
  const L = canvas(280, 140, 1), ctx = L.ctx, R = rng(9);
  for (let i = 0; i < 520; i++) {
    const v = R(), y = v * v * 136 + 2, spread = 10 + y * 0.95;
    const x = 140 + (R() + R() + R() - 1.5) * spread * 0.9, l = 2 + y * 0.12 + R() * 6;
    ctx.fillStyle = rgba(col, (0.35 + R() * 0.6) * (1 - y / 150));
    ctx.fillRect(x - l / 2, y, l, y < 30 ? 0.8 : 1.3);
  }
  for (let i = 0; i < 14; i++) { const y = R() * 70 + 4; sparkle(ctx, 140 + (R() - 0.5) * (14 + y), y, 2 + R() * 2.5, '#ffffff', 0.9); }
  return L.c;
}

// ------------------------------------------------------------------ テーマごとの層
// 各関数は (ctx, H, C, T, R) で描く。C(color, haze) は時間帯の色に直す。
const THEMES = {
  kinka: {
    far(ctx, H, C, T) {
      const back = profile([[50, 3, 0.4], [26, 7, 1.3], [12, 13, 2]], H - 120);
      fillProfile(ctx, back, H, C('#7a96b8', 0.55)); rimProfile(ctx, back, T.rim, 1);
      // 金華山（けわしい山）と岐阜城
      const kinka = profile([[18, 5, 2.2], [8, 17, 0.3]], H - 60, bump(720, 230, 150, 1.6));
      fillProfile(ctx, kinka, H, lin(ctx, 0, H - 230, 0, H, [0, C('#5a7a6a', 0.35), 1, C('#3e5a4a', 0.3)]));
      rimProfile(ctx, kinka, T.rim, 1.2);
      castle(ctx, 720, kinka(720) + 3, 1.7, (c) => C(c, 0.3), T);
    },
    mid1(ctx, H, C, T) {
      const f = profile([[40, 2, 0.8], [22, 5, 2.1], [10, 11, 0.2]], H - 90);
      fillProfile(ctx, f, H, C('#3e6a4a', 0.2));
      treeBlobs(ctx, f, 13, C, { color: C('#4a7a50', 0.2), seed: 11, cedar: 0.12 });
    },
    mid2(ctx, H, C, T, R) {
      const f = profile([[26, 3, 2.5], [14, 8, 0.7]], H - 55);
      fillProfile(ctx, f, H, C('#2e5a36', 0.06));
      treeBlobs(ctx, f, 20, C, { color: C('#3a6e40', 0.06), seed: 12, step: 14, cedar: 0.18 });
      const ce = []; for (let i = 0; i < 9; i++) { const x = R() * W; ce.push([x, f(x) + 10, 70 + R() * 50]); }
      cedars(ctx, ce, C('#24482e', 0.05));
    },
    front: { col: '#1e3a1e', kind: 'grass' },
  },
  nagara: {
    far(ctx, H, C, T) {
      const back = profile([[46, 2, 1.4], [24, 6, 0.4], [10, 15, 1]], H - 110);
      fillProfile(ctx, back, H, C('#86a0c0', 0.55)); rimProfile(ctx, back, T.rim, 1);
      const kinka = profile([[10, 7, 0.9]], H - 50, bump(420, 170, 110, 1.6));
      fillProfile(ctx, kinka, H, C('#5e7c76', 0.4)); rimProfile(ctx, kinka, T.rim, 1);
      castle(ctx, 420, kinka(420) + 3, 1.2, (c) => C(c, 0.4), T);
    },
    mid1(ctx, H, C, T, R) {
      const f = profile([[22, 3, 0.2], [10, 9, 1.7]], H - 80);
      fillProfile(ctx, f, H, C('#4e7458', 0.25));
      treeBlobs(ctx, f, 10, C, { color: C('#5a845e', 0.25), seed: 21 });
      // 対岸の町並み
      for (let x = 0; x < W; x += 22 + R() * 30) house(ctx, x, H - 42, 18 + R() * 16, 10 + R() * 8, (c) => C(c, 0.22), T, 'shirokabe', R);
      ctx.fillStyle = C('#4a5a50', 0.2); ctx.fillRect(0, H - 44, W, 4);
      // 長良橋（アーチの連なり）
      const bx0 = 880, bx1 = 1480, by = H - 52;
      ctx.fillStyle = C('#6a7078', 0.2); ctx.fillRect(bx0, by, bx1 - bx0, 4);
      ctx.strokeStyle = C('#5a6068', 0.2); ctx.lineWidth = 2;
      for (let x = bx0; x < bx1; x += 60) { ctx.beginPath(); ctx.arc(x + 30, by + 30, 30, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); ctx.fillStyle = C('#5a6068', 0.2); ctx.fillRect(x - 2, by, 4, 34); }
      if (T.lit) for (let x = bx0; x < bx1; x += 30) glow(ctx, x, by - 2, 8, '#ffd080', 0.5 * T.lit);
      water(ctx, H - 38, H, (c) => C(c, 0.2), T, R);
    },
    mid2(ctx, H, C, T, R) {
      water(ctx, H - 60, H, (c) => C(c, 0.04), T, R);
      // 鵜飼い舟（篝火）
      for (const bx of [260, 980]) {
        const y = H - 34;
        wrap(bx, 70, (x) => {
          ctx.beginPath(); ctx.moveTo(x - 60, y - 6); ctx.quadraticCurveTo(x - 50, y + 6, x - 30, y + 6); ctx.lineTo(x + 44, y + 6); ctx.quadraticCurveTo(x + 60, y + 2, x + 66, y - 8); ctx.lineTo(x + 50, y - 2); ctx.lineTo(x - 50, y - 2); ctx.closePath();
          ctx.fillStyle = C('#3a2a1c', 0.04); ctx.fill();
          ctx.fillStyle = C('#2a2a3a', 0.04); ctx.fillRect(x - 10, y - 20, 5, 18); ell(ctx, x - 7.5, y - 23, 4, 3.5); ctx.fill();
          ctx.fillStyle = C('#3a2a1c', 0.04); ctx.fillRect(x + 48, y - 26, 2, 24);
          flame(ctx, x + 50, y - 26, 12, 16, 0.3, ['#e8401a', '#ffa030', '#fff4b0']);
          glow(ctx, x + 50, y - 30, 60, '#ff9a40', 0.25 + 0.35 * T.lit);
          ctx.fillStyle = rgba('#ffb060', 0.35 + 0.3 * T.lit); ctx.fillRect(x + 30, y + 9, 40, 2); ctx.fillRect(x + 36, y + 14, 26, 1.5);
        });
      }
      // 手前の葦と柳
      const reeds = C('#4a6a3a', 0.04);
      for (let i = 0; i < 140; i++) {
        const x = R() * W, h = 20 + R() * 34, y = H - 4 - R() * 10;
        if ((x > 180 && x < 360) || (x > 900 && x < 1080)) continue;
        ctx.strokeStyle = reeds; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 2, y - h * 0.6, x + 4 * (R() - 0.3), y - h); ctx.stroke();
        if (R() < 0.3) { ell(ctx, x + 2, y - h - 2, 1.6, 4, 0.2); ctx.fillStyle = C('#8a7a4a', 0.04); ctx.fill(); }
      }
      for (const wx of [620, 1380]) {
        wrap(wx, 60, (x) => {
          ctx.fillStyle = C('#3a2e22', 0.04); ctx.fillRect(x - 3, H - 110, 6, 80);
          for (let k = 0; k < 26; k++) { const a = -Math.PI / 2 + (R() - 0.5) * 2.4, l = 30 + R() * 40; const sx = x + Math.cos(a) * 18, sy = H - 110 + Math.sin(a) * 14; ctx.strokeStyle = C(R() < 0.5 ? '#5a8a4a' : '#6a9a52', 0.04); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + (sx - x) * 0.6, sy, sx + (sx - x) * 0.4, sy + l); ctx.stroke(); }
        });
      }
    },
    front: { col: '#2a4228', kind: 'reed' },
  },
  gujo: {
    far(ctx, H, C, T) {
      const back = profile([[60, 3, 2.2], [28, 7, 0.4], [12, 16, 1.2]], H - 110);
      fillProfile(ctx, back, H, C('#7a94b0', 0.55)); rimProfile(ctx, back, T.rim, 1);
      const hill = profile([[14, 6, 1]], H - 60, bump(980, 190, 120, 1.8));
      fillProfile(ctx, hill, H, C('#4e6e58', 0.35));
      treeBlobs(ctx, hill, 7, C, { color: C('#56785e', 0.35), seed: 31, step: 8 });
      castle(ctx, 980, hill(980) + 4, 1.3, (c) => C(c, 0.32), T);
    },
    mid1(ctx, H, C, T, R) {
      const f = profile([[18, 4, 0.5], [8, 11, 2]], H - 100);
      fillProfile(ctx, f, H, C('#46684e', 0.2));
      treeBlobs(ctx, f, 11, C, { color: C('#507452', 0.2), seed: 32, cedar: 0.1 });
      for (let x = 0; x < W; x += 30 + R() * 26) house(ctx, x, H - 30, 26 + R() * 20, 18 + R() * 14, (c) => C(c, 0.18), T, 'shirokabe', R);
      ctx.fillStyle = C('#4a4a46', 0.18); ctx.fillRect(0, H - 32, W, 32);
    },
    mid2(ctx, H, C, T, R) {
      // 水路と石垣、町家
      ctx.fillStyle = lin(ctx, 0, H - 60, 0, H, [0, C('#7a7e80', 0.04), 1, C('#4a4e52', 0.04)]); ctx.fillRect(0, H - 60, W, 60);
      for (let y = H - 58; y < H - 22; y += 9) for (let x = (y % 2) * 8; x < W; x += 16 + R() * 6) { ctx.strokeStyle = C('#3a3c40', 0.04); ctx.lineWidth = 1; ctx.strokeRect(x, y, 14, 8); }
      ctx.fillStyle = lin(ctx, 0, H - 22, 0, H, [0, C('#6ac8c8', 0.04), 1, C('#2a7a8a', 0.04)]); ctx.fillRect(0, H - 22, W, 22);
      ctx.fillStyle = rgba('#ffffff', 0.35); for (let i = 0; i < 60; i++) ctx.fillRect(R() * W, H - 20 + R() * 18, 6 + R() * 14, 1);
      for (let x = 0; x < W; x += 60 + R() * 50) house(ctx, x, H - 60, 50 + R() * 26, 34 + R() * 16, (c) => C(c, 0.04), T, R() < 0.5 ? 'shirokabe' : 'machiya', R);
      for (const wx of [300, 1100]) wrap(wx, 50, (x) => {
        ctx.fillStyle = C('#3a2e22', 0.04); ctx.fillRect(x - 3, H - 130, 6, 74);
        for (let k = 0; k < 22; k++) { const sx = x + (R() - 0.5) * 40, sy = H - 130 + (R() - 0.5) * 20; ctx.strokeStyle = C('#5e8e4a', 0.04); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + (sx - x) * 0.4, sy + 10, sx + (sx - x) * 0.3, sy + 40 + R() * 20); ctx.stroke(); }
      });
    },
    front: { col: '#24402a', kind: 'grass' },
  },
  takayama: {
    far(ctx, H, C, T) {
      // 北アルプスの雪山
      const alps = jagged([[110, 5, 0.3], [50, 11, 1.1], [22, 23, 0.6]], H - 70);
      fillProfile(ctx, alps, H, lin(ctx, 0, H - 260, 0, H, [0, C('#7a8aa8', 0.45), 1, C('#5a6a88', 0.5)]), 3);
      snowcap(ctx, alps, H - 170, C('#f4f8ff', 0.3), C('#b8c8e0', 0.35));
      rimProfile(ctx, alps, T.rim, 1, 3);
      const fore = profile([[24, 4, 2.4], [10, 12, 0.8]], H - 40);
      fillProfile(ctx, fore, H, C('#506a72', 0.4));
    },
    mid1(ctx, H, C, T, R) {
      const f = profile([[30, 3, 1.1], [12, 9, 0.2]], H - 90);
      fillProfile(ctx, f, H, C('#3a5a46', 0.2));
      treeBlobs(ctx, f, 9, C, { color: C('#3e6248', 0.2), seed: 41, cedar: 0.35, step: 8 });
      for (let x = 0; x < W; x += 34 + R() * 20) house(ctx, x, H - 26, 30 + R() * 24, 16 + R() * 10, (c) => C(c, 0.15), T, 'machiya', R);
      ctx.fillStyle = C('#3a3430', 0.15); ctx.fillRect(0, H - 28, W, 28);
    },
    mid2(ctx, H, C, T, R) {
      ctx.fillStyle = C('#3a3430', 0.03); ctx.fillRect(0, H - 40, W, 40);
      for (let x = 0; x < W; x += 70 + R() * 30) {
        house(ctx, x, H - 36, 62 + R() * 24, 46 + R() * 18, (c) => C(c, 0.03), T, 'machiya', R);
        if (R() < 0.35) wrap(x + 20, 10, (xx) => { ell(ctx, xx, H - 70, 7, 7); ctx.fillStyle = C('#5a7a3a', 0.03); ctx.fill(); });
      }
      // 宮川の赤い橋の欄干
      ctx.fillStyle = C('#b8402e', 0.03); ctx.fillRect(560, H - 46, 260, 4); ctx.fillRect(560, H - 30, 260, 3);
      for (let x = 560; x <= 820; x += 26) ctx.fillRect(x, H - 50, 4, 24);
    },
    front: { col: '#26381e', kind: 'grass' },
  },
  shirakawa: {
    far(ctx, H, C, T) {
      const back = jagged([[80, 4, 1.4], [36, 9, 0.2], [16, 19, 1.3]], H - 90);
      fillProfile(ctx, back, H, C('#a8b8d4', 0.45), 3);
      snowcap(ctx, back, H - 150, C('#ffffff', 0.25), C('#c8d6ea', 0.3));
      rimProfile(ctx, back, T.rim, 1, 3);
      const fore = profile([[30, 3, 0.6], [12, 8, 2]], H - 50);
      fillProfile(ctx, fore, H, C('#c8d4e6', 0.35));
      treeBlobs(ctx, fore, 6, C, { color: C('#6a7e8a', 0.35), seed: 51, step: 10 });
    },
    mid1(ctx, H, C, T, R) {
      const f = profile([[26, 2, 2.2], [12, 7, 0.4]], H - 80);
      fillProfile(ctx, f, H, C('#e8eef6', 0.2));
      const ce = []; for (let i = 0; i < 60; i++) { const x = R() * W; ce.push([x, f(x) + 6, 26 + R() * 20]); }
      cedars(ctx, ce, C('#3e5250', 0.2), C('#f4f8fc', 0.2));
      for (let x = 40; x < W; x += 110 + R() * 120) house(ctx, x, H - 22 - R() * 8, 30 + R() * 10, 20, (c) => C(c, 0.15), T, 'gassho', R);
      ctx.fillStyle = C('#eef3f9', 0.15); ctx.fillRect(0, H - 20, W, 20);
    },
    mid2(ctx, H, C, T, R) {
      // 雪の田んぼと合掌造り
      ctx.fillStyle = lin(ctx, 0, H - 50, 0, H, [0, C('#f4f8fc', 0.03), 1, C('#c8d8ea', 0.03)]); ctx.fillRect(0, H - 50, W, 50);
      ctx.strokeStyle = C('#b0c4dc', 0.03); ctx.lineWidth = 1.5; for (let y = H - 40; y < H; y += 12) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + 2); ctx.stroke(); }
      for (let x = 80; x < W; x += 240 + R() * 140) house(ctx, x, H - 40, 70 + R() * 20, 44, (c) => C(c, 0.03), T, 'gassho', R);
      const ce = []; for (let i = 0; i < 14; i++) ce.push([R() * W, H - 40, 60 + R() * 50]);
      cedars(ctx, ce, C('#2e423e', 0.03), C('#ffffff', 0.03));
    },
    front: { col: '#e8f0fa', kind: 'snow' },
  },
  okuhida: {
    far(ctx, H, C, T, R) {
      // 乗鞍の火山と噴煙
      const vol = profile([[16, 9, 0.4], [8, 21, 1.2]], H - 70, (x) => bump(560, 420, 170, 1.2)(x) + bump(1260, 300, 110, 1.4)(x));
      fillProfile(ctx, vol, H, lin(ctx, 0, H - 250, 0, H, [0, C('#7a6a72', 0.45), 1, C('#4a3e4a', 0.4)]), 3);
      snowcap(ctx, vol, H - 200, C('#e8e8f0', 0.35), C('#a8a0b0', 0.4));
      rimProfile(ctx, vol, T.rim, 1, 3);
      for (let i = 0; i < 14; i++) { const u = i / 13; ctx.fillStyle = rgba(C('#d8d0d0', 0.3), 0.5 * (1 - u * 0.7)); ell(ctx, 560 + u * 120 + Math.sin(u * 6) * 10, vol(560) - 10 - u * 120, 14 + u * 40, 10 + u * 22); ctx.fill(); }
      glow(ctx, 560, vol(560) + 4, 40, '#ff6a2a', 0.25 + 0.25 * T.lit);
    },
    mid1(ctx, H, C, T, R) {
      const f = profile([[46, 3, 0.9], [20, 8, 2.2], [8, 19, 0.5]], H - 70);
      fillProfile(ctx, f, H, C('#3e3640', 0.22));
      const ce = []; for (let i = 0; i < 40; i++) { const x = R() * W; ce.push([x, f(x) + 8, 22 + R() * 22]); }
      cedars(ctx, ce, C('#26302c', 0.22));
      for (const x of [240, 830, 1290]) steam(ctx, x, f(x) + 10, 90, 0.35, R);
    },
    mid2(ctx, H, C, T, R) {
      const f = profile([[30, 4, 2.6], [16, 11, 0.3]], H - 46);
      fillProfile(ctx, f, H, C('#2a2428', 0.04));
      // 岩のごつごつと溶岩の光る割れ目
      for (let i = 0; i < 30; i++) {
        const x = R() * W, y = f(x) + 4 + R() * 30, w = 16 + R() * 30;
        wrap(x, w, (xx) => { poly(ctx, [xx - w, y + 12, xx - w * 0.6, y - w * 0.4, xx + w * 0.2, y - w * 0.55, xx + w, y + 12]); ctx.fillStyle = C(R() < 0.5 ? '#3a3238' : '#2e282e', 0.04); ctx.fill(); });
      }
      for (let i = 0; i < 12; i++) {
        const x = R() * W, y = H - 10 - R() * 24;
        ctx.strokeStyle = 'rgba(255,100,30,0.85)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 8, y - 4); ctx.lineTo(x + 16, y + 1); ctx.lineTo(x + 26, y - 3); ctx.stroke();
        glow(ctx, x + 13, y, 18, '#ff5a1a', 0.3);
      }
      for (const x of [420, 1180]) steam(ctx, x, f(x) + 6, 110, 0.4, R);
    },
    front: { col: '#1a1418', kind: 'rock' },
  },
  okinawa: {
    // 沖縄・ニライカナイの島：濃い青空と入道雲、水平線とエメラルドの海、赤瓦の集落・フクギ・さとうきび畑・高台の城
    farH: 400, horizon: 270, farBase: '#58d4c4',
    sky: {
      day: [0, rgba('#0230a0', 0.9), 0.3, rgba('#0c58c8', 0.6), 0.5, rgba('#2a80e0', 0.25), 0.6, rgba('#58a8f0', 0.05), 0.7, rgba('#58a8f0', 0)],
      dusk: [0, rgba('#180f48', 0.55), 0.3, rgba('#3e2470', 0.24), 0.46, rgba('#ff7a48', 0), 0.56, rgba('#ff8a4a', 0.32), 0.66, rgba('#ffb070', 0)],
    },
    glitter: { day: '#ffffff', dusk: '#ffc070', night: '#c8d8ff' },
    tower(ctx, H, C, T) {
      const lit = T.cloud[0], sh = mix(T.cloud[1], T.haze, 0.25), rim = mix(T.cloud[0], '#ffffff', T.lit ? 0.2 : 0.7);
      cumulonimbus(ctx, 330, H - 4, 170, 236, [lit, sh], rim, 201);
      cumulonimbus(ctx, 1070, H - 4, 120, 160, [lit, sh], rim, 202);
      cumulonimbus(ctx, 1440, H - 4, 76, 100, [mix(lit, T.haze, 0.2), mix(sh, T.haze, 0.2)], rim, 203);
    },
    far(ctx, H, C, T, R) {
      const HZ = H - 130, dusk = T === TOD.dusk;
      // 遠くの島影
      for (const [cx, w, h, k] of [[170, 120, 14, 0.6], [610, 70, 9, 1.3], [900, 210, 24, 0.7], [1370, 90, 12, 1.2]]) {
        wrap(cx, w, (xx) => {
          ctx.beginPath(); ctx.moveTo(xx - w, HZ + 1);
          for (let u = -1; u <= 1.001; u += 0.05) ctx.lineTo(xx + u * w, HZ - h * Math.pow(Math.cos((u * Math.PI) / 2), k) * (1 + 0.12 * Math.sin(u * 11 + cx)));
          ctx.lineTo(xx + w, HZ + 1); ctx.closePath();
          ctx.fillStyle = C('#6f94b4', 0.5); ctx.fill();
        });
      }
      // 海：水平線の濃い青 → 手前のエメラルド
      ctx.fillStyle = lin(ctx, 0, HZ, 0, H, [0, C('#164c98', 0.18), 0.28, C('#1a70b6', 0.08), 0.55, C('#1ea2c6', 0.04), 0.78, C('#36c6c0', 0.02), 1, C('#58d4c4', 0.02)]);
      ctx.fillRect(0, HZ, W, H - HZ);
      if (dusk) { ctx.fillStyle = lin(ctx, 0, HZ, 0, HZ + 80, [0, rgba('#ff9050', 0.5), 1, rgba('#ff9050', 0)]); ctx.fillRect(0, HZ, W, 80); }
      // うねりの光（遠いほど細く短い）
      for (let i = 0; i < 320; i++) {
        const v = R(), y = HZ + 2 + v * v * (H - HZ - 4), x = R() * W, l = 3 + (y - HZ) * 0.22 + R() * 7;
        ctx.fillStyle = rgba(dusk ? '#ffd0a0' : '#ffffff', 0.1 + R() * 0.32);
        ctx.fillRect(x, y, l, y - HZ < 30 ? 0.7 : 1.1);
      }
      // サンゴ礁の縁の白波と、その内側の明るいエメラルド
      const reefY = HZ + 60;
      ctx.fillStyle = lin(ctx, 0, reefY, 0, H, [0, rgba(C('#7ae8d4', 0.02), 0.15), 0.4, rgba(C('#7ae8d4', 0.02), 0.45), 1, rgba(C('#a8f2dc', 0.02), 0.6)]);
      ctx.fillRect(0, reefY, W, H - reefY);
      for (let x = 0; x < W; x += 2.5) {
        if (Math.sin(x * 0.0117) + Math.sin(x * 0.0377) < -0.7) continue;
        const y = reefY + Math.sin(x * 0.02) * 2.5 + Math.sin(x * 0.0057) * 3;
        ctx.fillStyle = rgba('#ffffff', 0.45 + R() * 0.45); ctx.fillRect(x, y - R(), 3, 1.2 + R() * 1.4);
      }
      ctx.fillStyle = rgba('#ffffff', dusk ? 0.35 : 0.55); ctx.fillRect(0, HZ, W, 1);
    },
    mid1(ctx, H, C, T, R) {
      const B = (x) => bump(980, 300, 120, 1.5)(x) + bump(310, 190, 38, 2)(x) + bump(1420, 160, 26, 2)(x);
      const f = profile([[8, 3, 0.4], [5, 9, 1.8]], H - 62, B);
      // 低いところは白い浜が見える
      fillProfile(ctx, (x) => f(x) - 3.5 * (1 - Math.min(1, B(x) / 14)), H, C('#f6eed6', 0.25));
      fillProfile(ctx, f, H, lin(ctx, 0, H - 170, 0, H, [0, C('#5a9a56', 0.28), 1, C('#3e7a46', 0.24)]));
      treeBlobs(ctx, f, 8, C, { color: C('#3e7e48', 0.27), seed: 81, step: 7 });
      // 斜面の森のかたまりと畑
      for (let i = 0; i < 70; i++) {
        const x = R() * W, y = f(x) + 12 + R() * (H - f(x) - 12), rr = 5 + R() * 7;
        if (R() < 0.3) { ctx.fillStyle = C(R() < 0.5 ? '#7aa858' : '#8ab860', 0.27); ell(ctx, x, y, rr * 2.4, rr * 0.7); ctx.fill(); continue; }
        wrap(x, rr, (xx) => { ell(ctx, xx, y, rr, rr * 0.8); ctx.fillStyle = C('#3a7444', 0.27); ctx.fill(); ell(ctx, xx - rr * 0.3, y - rr * 0.3, rr * 0.5, rr * 0.35); ctx.fillStyle = C('#5a9a5a', 0.27); ctx.fill(); });
      }
      for (let x = 20; x < W; x += 24 + R() * 30) {
        if (Math.abs(x - 980) < 170) continue;
        if (R() < 0.3) fukugi(ctx, x - 6, f(x) + 10, 24 + R() * 8, (c, h) => C(c, 0.26), R);
        ryukyuHouse(ctx, x, f(x) + 10, 15 + R() * 8, 9 + R() * 3, (c) => C(c, 0.26), T, R, false);
      }
      seiden(ctx, 980, f(980) + 18, 0.82, (c) => C(c, 0.2), T);
    },
    mid2(ctx, H, C, T, R) {
      const f = profile([[8, 4, 1.2], [5, 11, 0.3]], H - 58);
      fillProfile(ctx, f, H, lin(ctx, 0, H - 70, 0, H, [0, C('#6a9a44', 0.05), 1, C('#4a7a34', 0.04)]));
      let x = 0, k = 0;
      while (x < W - 40) {
        const x1 = Math.min(W, x + 150 + R() * 150);
        if (k++ % 2 === 0) caneField(ctx, x + 6, x1 - 6, f(x) + 18, 38 + R() * 12, C, R, 0.05);
        else {
          for (let hx = x + 16; hx < x1 - 50; hx += 70 + R() * 30) {
            fukugi(ctx, hx - 10, f(hx) + 16, 64 + R() * 22, (c) => C(c, 0.05), R);
            fukugi(ctx, hx + 58, f(hx) + 16, 56 + R() * 20, (c) => C(c, 0.05), R);
            ryukyuHouse(ctx, hx, f(hx) + 22, 46 + R() * 14, 26 + R() * 6, (c) => C(c, 0.05), T, R, true);
          }
        }
        x = x1;
      }
      for (let i = 0; i < 6; i++) { const px = R() * W; bgPalm(ctx, px, f(px) + 22, 56 + R() * 34, C, R, 0.05); }
      // 赤土の道
      ctx.fillStyle = C('#b86440', 0.05); ctx.fillRect(0, H - 12, W, 12);
      ctx.fillStyle = C('#d8885a', 0.05); ctx.fillRect(0, H - 12, W, 1.5);
    },
    front: { col: '#1c3a26', kind: 'adan' },
  },
};
function snowcap(ctx, f, snowY, col, colD) {
  ctx.beginPath();
  for (let x = 0; x <= W; x += 3) x ? ctx.lineTo(x, f(x)) : ctx.moveTo(x, f(x));
  for (let x = W; x >= 0; x -= 3) {
    const y = f(x), d = Math.max(0, snowY - y);
    ctx.lineTo(x, y + d * (0.55 + 0.25 * Math.sin(x * 0.21) * Math.sin(x * 0.047)));
  }
  ctx.closePath();
  ctx.fillStyle = lin(ctx, 0, snowY - 150, 0, snowY, [0, col, 1, colD]); ctx.fill();
}

// ------------------------------------------------------------------ 雲・前景
function clouds(L, cols, n, size, seed, over) {
  const { ctx, h } = L; const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = R() * W, y = h * (0.35 + R() * 0.4), s = size * (0.7 + R() * 0.6);
    const puffs = 5 + ((R() * 4) | 0);
    wrap(x, s * 3, (xx) => {
      // 下側の影 → 上の明るい部分
      for (let pass = 0; pass < 2; pass++) {
        const r2 = rng(seed * 31 + i);
        for (let k = 0; k < puffs; k++) {
          const px = xx + (k - puffs / 2) * s * 0.55 + (r2() - 0.5) * s * 0.3;
          const pr = s * (0.45 + r2() * 0.4) * (1 - Math.abs(k - puffs / 2) / puffs * 0.8);
          const py = y - pr * 0.5 + r2() * s * 0.15;
          ell(ctx, px, py - (pass ? s * 0.12 : 0), pr * (pass ? 0.85 : 1), pr * (pass ? 0.75 : 0.9));
          ctx.fillStyle = pass ? cols[0] : cols[1]; ctx.fill();
        }
      }
    });
  }
  if (over) { ctx.fillStyle = rgba(cols[1], 0.35); ctx.fillRect(0, 0, W, h * 0.4); }
}
function front(L, spec, C) {
  const { ctx, h } = L; const R = rng(77);
  const col = C(spec.col, 0);
  for (let g = 0; g < 7; g++) {
    const cx = (g + 0.2 + R() * 0.6) * (W / 7);
    const n = 18 + (R() * 14) | 0, spread = 40 + R() * 60;
    wrap(cx, spread + 30, (x0) => {
      if (spec.kind === 'snow') {
        for (let k = 0; k < 4; k++) { ell(ctx, x0 + (R() - 0.5) * spread * 1.4, h - 6, 30 + R() * 30, 14 + R() * 12); ctx.fillStyle = mix(col, '#a8bcd8', R() * 0.4); ctx.fill(); }
        for (let k = 0; k < 8; k++) { const x = x0 + (R() - 0.5) * spread * 2; ctx.strokeStyle = C('#6a5a40', 0); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, h - 10); ctx.lineTo(x + (R() - 0.5) * 8, h - 30 - R() * 26); ctx.stroke(); }
        return;
      }
      if (spec.kind === 'adan') {
        // アダンの葉のかたまりと浜の草
        for (let k = 0; k < n; k++) {
          const x = x0 + (R() - 0.5) * spread * 2, hh = 20 + R() * 34, lean = (R() - 0.5) * 26;
          ctx.beginPath(); ctx.moveTo(x - 3, h); ctx.quadraticCurveTo(x + lean * 0.3, h - hh * 0.6, x + lean, h - hh); ctx.quadraticCurveTo(x + lean * 0.3 + 2, h - hh * 0.5, x + 3, h); ctx.closePath();
          ctx.fillStyle = mix(col, '#000000', R() * 0.3); ctx.fill();
        }
        if (R() < 0.8) {
          const ax = x0 + (R() - 0.5) * spread, ay = h - 40 - R() * 22;
          for (const [rx, sx] of [[-14, -1], [-6, -0.3], [6, 0.3], [14, 1]]) { ctx.strokeStyle = mix(col, '#000000', 0.2); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(ax + rx, h); ctx.quadraticCurveTo(ax + rx * 0.5, h - 14, ax + sx * 2, ay + 18); ctx.stroke(); }
          ctx.fillStyle = mix(col, '#000000', 0.15); ctx.fillRect(ax - 2, ay, 4, 20);
          for (let k = 0; k < 14; k++) {
            const a = -Math.PI / 2 + (k / 13 - 0.5) * 3.4, L = 28 + R() * 18;
            const ex = ax + Math.cos(a) * L, ey = ay + Math.sin(a) * L * 0.6 + Math.abs(Math.cos(a)) * L * 0.45;
            ctx.beginPath(); ctx.moveTo(ax - 2, ay); ctx.quadraticCurveTo(ax + Math.cos(a) * L * 0.55, ay + Math.sin(a) * L * 0.55 - 6, ex, ey); ctx.quadraticCurveTo(ax + Math.cos(a) * L * 0.5, ay + Math.sin(a) * L * 0.5 - 2, ax + 2, ay);
            ctx.fillStyle = mix(col, '#000000', R() * 0.35); ctx.fill();
          }
        }
        ell(ctx, x0, h + 4, spread * 1.1, 16); ctx.fillStyle = col; ctx.fill();
        return;
      }
      if (spec.kind === 'rock') {
        for (let k = 0; k < 3; k++) { const x = x0 + (R() - 0.5) * spread * 1.5, w = 20 + R() * 30; poly(ctx, [x - w, h, x - w * 0.5, h - w * 1.1, x + w * 0.3, h - w * 0.9, x + w, h]); ctx.fillStyle = mix(col, '#3a2e34', R() * 0.5); ctx.fill(); }
        ctx.strokeStyle = 'rgba(255,110,40,0.6)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x0 - 10, h - 12); ctx.lineTo(x0, h - 20); ctx.lineTo(x0 + 12, h - 14); ctx.stroke();
        return;
      }
      for (let k = 0; k < n; k++) {
        const x = x0 + (R() - 0.5) * spread * 2, hh = (spec.kind === 'reed' ? 50 : 26) + R() * (spec.kind === 'reed' ? 50 : 40), lean = (R() - 0.5) * 30;
        ctx.beginPath(); ctx.moveTo(x - 4, h); ctx.quadraticCurveTo(x + lean * 0.3, h - hh * 0.6, x + lean, h - hh); ctx.quadraticCurveTo(x + lean * 0.3 + 2, h - hh * 0.5, x + 4, h); ctx.closePath();
        ctx.fillStyle = mix(col, '#000000', R() * 0.3); ctx.fill();
        if (spec.kind === 'reed' && R() < 0.4) { ell(ctx, x + lean, h - hh - 5, 2.5, 7, lean * 0.02); ctx.fillStyle = mix(col, '#6a5a3a', 0.5); ctx.fill(); }
      }
      ell(ctx, x0, h + 4, spread * 1.1, 16); ctx.fillStyle = col; ctx.fill();
    });
  }
}

// ------------------------------------------------------------------ 焼き付け
function bakeSet(theme, tod) {
  const T = TOD[tod] || TOD.day;
  const TH = THEMES[theme] || THEMES.kinka;
  const C = (c, hz = 0) => { let v = T.tint ? mix(c, T.tint, T.amt) : c; if (hz) v = mix(v, T.haze, hz * (T.tint ? 0.6 : 1)); return v; };
  const R = rng(theme.length * 977 + 13);
  const set = { tod, layers: [] };
  const mk = (name, h, s, speed, anchor, yPar, draw, base) => {
    const L = canvas(W, h, s);
    draw(L.ctx, h, C, T, R, L);
    set.layers.push({ name, c: L.c, w: W, h, speed, anchor, yPar, base, drift: 0 });
  };
  // 雲（普通と曇り空の2組）
  const cl = [[0.03, 0.36, 5, 20, 5], [0.06, 0.44, 4, 27, 4], [0.1, 0.54, 3, 36, 3]];
  set.clouds = [[], []];
  for (let o = 0; o < 2; o++) {
    cl.forEach(([sp, an, drift, size, n], i) => {
      const L = canvas(W, 170, 1);
      const cols = o ? T.ocloud : T.cloud;
      clouds(L, i === 0 ? [mix(cols[0], T.haze, 0.3), mix(cols[1], T.haze, 0.3)] : cols, o ? n * 2 : n, size * (o ? 1.4 : 1), 100 + i * 7 + o, o);
      set.clouds[o].push({ c: L.c, w: W, h: 170, speed: sp, anchor: an, yPar: 0.02, drift });
    });
  }
  if (TH.tower) {
    // 入道雲（遠景の後ろ。曇り・雨では薄れる）
    const L = canvas(W, 300, 1);
    TH.tower(L.ctx, 300, C, T, R);
    set.tower = { c: L.c, w: W, h: 300, speed: 0.07, anchor: 0.6, yPar: 0.06, drift: 0 };
  }
  mk('far', TH.farH || 320, 1, 0.12, 0.8, 0.06, TH.far, TH.farBase ? C(TH.farBase, 0.02) : C('#3e4a5a', 0.45));
  if (TH.sky && TH.sky[tod]) set.skyTint = skyOverlay(TH.sky[tod]);
  if (TH.glitter && TH.glitter[tod]) { set.glitter = glitterArt(TH.glitter[tod]); set.horizon = TH.horizon; }
  mk('mid1', 280, 1.25, 0.3, 0.9, 0.15, TH.mid1, null);
  mk('mid2', 260, 1.5, 0.5, 1.02, 0.25, TH.mid2, null);
  // 前景
  const F = canvas(W, 110, 1.5);
  front(F, TH.front, C);
  set.front = { c: F.c, w: W, h: 110, speed: 1.3, anchor: 1.04, yPar: 0.5 };
  set.T = T;
  return set;
}

function skyArt() {
  const st = canvas(1200, 380, 1), r = rng(5);
  for (let i = 0; i < 170; i++) { const s = r() < 0.1 ? 1.6 : 0.9; st.ctx.fillStyle = rgba('#ffffff', 0.4 + r() * 0.6); st.ctx.fillRect(r() * 1200, r() * 380, s, s); }
  for (let i = 0; i < 7; i++) glow(st.ctx, r() * 1200, r() * 300, 4, '#ffffff', 0.8);
  const sun = canvas(240, 240, 1);
  glow(sun.ctx, 120, 120, 120, '#fff6d0', 0.55); ell(sun.ctx, 120, 120, 20, 20); sun.ctx.fillStyle = '#fffbea'; sun.ctx.fill();
  const dusk = canvas(440, 440, 1);
  glow(dusk.ctx, 220, 220, 220, '#ffb070', 0.6); ell(dusk.ctx, 220, 220, 34, 34); dusk.ctx.fillStyle = '#ffe2a0'; dusk.ctx.fill();
  const moon = canvas(180, 180, 1), m = moon.ctx;
  glow(m, 90, 90, 90, '#c8d8ff', 0.35); ell(m, 90, 90, 17, 17); m.fillStyle = '#fffbe8'; m.fill();
  m.fillStyle = 'rgba(200,200,180,0.35)'; ell(m, 85, 87, 4, 3); m.fill(); ell(m, 94, 95, 3, 2.4); m.fill();
  const plume = canvas(320, 340, 1), p = plume.ctx;
  for (let i = 0; i < 16; i++) { const u = i / 15; p.fillStyle = rgba(mix('#6a5a5a', '#9a8a88', u), 0.55 * (1 - u * 0.6)); ell(p, 150 + u * 110 + Math.sin(u * 7) * 12, 330 - u * 270, 16 + u * 50, 12 + u * 30); p.fill(); }
  glow(p, 150, 335, 40, '#ff5a1a', 0.45);
  return { stars: st.c, sun: sun.c, dusk: dusk.c, moon: moon.c, plume: plume.c };
}

export function createBackdrop(theme, levelData = {}) {
  const tods = [...new Set([levelData.timeOfDay || 'day', ...(levelData.timeFlow || [])])].filter((t) => TOD[t]);
  const sets = {};
  for (const t of tods) sets[t] = bakeSet(theme, t);
  const levelH = (levelData.tiles ? levelData.tiles.length : 15) * 36;
  let cur = sets[tods[0] || 'day'] || (sets.day = bakeSet(theme, 'day')), prev = null, fadeT = 1, lastTime = null, over = -1;
  let gradTop = '', gradBot = '', gradH = 0, grad = null, ashT = levelData.weathers && levelData.weathers[0] === 'ash' ? 1 : 0;
  const SKY = skyArt();

  function layer(ctx, L, camX, camY, vw, vh, time, alpha) {
    const off = (((camX * L.speed + time * L.drift) % L.w) + L.w) % L.w;
    const dy = Math.max(-80, levelH - vh - camY);
    const by = vh * L.anchor + dy * L.yPar;
    const top = by - L.h;
    if (top > vh || alpha < 0.004) return;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    for (let x = -off; x < vw; x += L.w) ctx.drawImage(L.c, x, top, L.w, L.h);
    if (L.base && by < vh) { ctx.fillStyle = L.base; ctx.fillRect(0, by - 1, vw, vh - by + 1); }
    if (alpha !== 1) ctx.globalAlpha = 1;
  }
  function drawSet(ctx, S, camX, camY, vw, vh, env, time, a) {
    const o = over;
    if (S.tower && o < 1) layer(ctx, S.tower, camX, camY, vw, vh, time, a * (1 - o));
    for (let i = 0; i < 3; i++) {
      if (o < 1) layer(ctx, S.clouds[0][i], camX, camY, vw, vh, time, a * (1 - o));
      if (o > 0) layer(ctx, S.clouds[1][i], camX, camY, vw, vh, time, a * o);
    }
    const fog = env.fog || 0;
    for (let i = 0; i < S.layers.length; i++) {   // forEach や配列リテラルは毎フレームの生成になるので使わない
      layer(ctx, S.layers[i], camX, camY, vw, vh, time, a);
      if (i === 0 && ashT > 0.01) {
        // 遠くの噴煙（火山灰の天気）
        const px = ((((900 - camX * 0.12) % W) + W) % W) - 150;
        const py = vh * 0.8 - 360 + Math.max(-80, levelH - vh - camY) * 0.06;
        ctx.globalAlpha = a * ashT;
        if (px > -320 && px < vw) ctx.drawImage(SKY.plume, px, py, 320, 340);
        if (px - W > -320 && px - W < vw) ctx.drawImage(SKY.plume, px - W, py, 320, 340);
        ctx.globalAlpha = 1;
      }
      if (i === 0 && S.glitter && o < 1) {
        // 海のきらめき：太陽（夕方は沈む太陽、夜は月）の真下の水平線から手前へ。画面に固定（空の太陽と同じ位置）
        const L = S.layers[0];
        const hy = vh * L.anchor + Math.max(-80, levelH - vh - camY) * L.yPar - L.h + S.horizon;
        const gx = S.tod === 'dusk' ? vw * 0.3 : S.tod === 'day' ? vw * 0.8 : vw * 0.82;
        ctx.globalAlpha = a * (1 - o) * (S.tod === 'day' ? 0.8 : 1);
        ctx.drawImage(S.glitter, gx - 140, hy, 280, 140);
        ctx.globalAlpha = 1;
      }
      // 霧：遠い層ほどかすむ
      if (fog > 0.004 && i < 2) { ctx.globalAlpha = a * fog * (i === 0 ? 0.6 : 0.32); ctx.fillStyle = env.sky.bottom; ctx.fillRect(0, 0, vw, vh); ctx.globalAlpha = 1; }
    }
  }
  function drawSky(ctx, vw, vh, env, tod) {
    const o = over;
    const night = env.nightness !== undefined ? env.nightness : (tod === 'night' || tod === 'festival' ? 1 : 0);
    const clear = 1 - o;
    if (night > 0.01 && clear > 0.01) {
      ctx.globalAlpha = night * clear; ctx.drawImage(SKY.stars, 0, 0, vw, vh * 0.7);
      ctx.drawImage(SKY.moon, vw * 0.82 - 90, vh * 0.15 - 90, 180, 180); ctx.globalAlpha = 1;
    }
    const sunA = (1 - night) * clear;
    if (sunA > 0.01) {
      ctx.globalAlpha = sunA;
      if (tod === 'dusk') ctx.drawImage(SKY.dusk, vw * 0.3 - 220, vh * 0.56 - 220, 440, 440);
      else ctx.drawImage(SKY.sun, vw * 0.8 - 120, vh * 0.16 - 120, 240, 240);
      ctx.globalAlpha = 1;
    }
  }

  return {
    draw(ctx, camX, camY, vw, vh, env, time) {
      const dt = lastTime === null ? 0 : Math.max(0, Math.min(0.25, time - lastTime));
      lastTime = time;
      // 時間帯の切り替え（混ぜる）
      const want = TOD[env.timeOfDay] ? env.timeOfDay : 'day';
      if (want !== cur.tod) { if (!sets[want]) sets[want] = bakeSet(theme, want); prev = cur; cur = sets[want]; fadeT = 0; }
      if (fadeT < 1) { fadeT = Math.min(1, fadeT + dt / 3); if (fadeT >= 1) prev = null; }
      const ot = OVERCAST.has(env.weather) ? 1 : 0;
      if (over < 0) over = ot; else over += (ot - over) * Math.min(1, dt * 0.4);
      // 指数で近づくだけだと 0/1 に届かず、晴れと曇りの雲を両方ずっと描き続けてしまう（重い）。近づいたら合わせる
      if (Math.abs(ot - over) < 0.004) over = ot;
      // 空
      // 色の文字列は env が値の変わったときだけ作るので、同じ文字列かどうかで比べる（毎フレームの文字列連結をしない）
      if (env.sky.top !== gradTop || env.sky.bottom !== gradBot || vh !== gradH || !grad) { gradTop = env.sky.top; gradBot = env.sky.bottom; gradH = vh; grad = ctx.createLinearGradient(0, 0, 0, vh); grad.addColorStop(0, env.sky.top); grad.addColorStop(1, env.sky.bottom); }
      ctx.fillStyle = grad; ctx.fillRect(0, 0, vw, vh);
      // テーマの空の色（沖縄の濃い青空など）。曇り・雨では消える
      if (over < 1 && (cur.skyTint || (prev && prev.skyTint))) {
        const ca = (1 - over) * (prev ? fadeT : 1);
        if (cur.skyTint && ca > 0.004) { ctx.globalAlpha = ca; ctx.drawImage(cur.skyTint, 0, 0, vw, vh); }
        if (prev && prev.skyTint) { ctx.globalAlpha = (1 - over) * (1 - fadeT); ctx.drawImage(prev.skyTint, 0, 0, vw, vh); }
        ctx.globalAlpha = 1;
      }
      const ashW = env.weather === 'ash' ? 1 : 0;
      ashT += (ashW - ashT) * Math.min(1, dt * 0.4);
      drawSky(ctx, vw, vh, env, cur.tod);
      if (prev) { drawSet(ctx, prev, camX, camY, vw, vh, env, time, 1); drawSet(ctx, cur, camX, camY, vw, vh, env, time, fadeT); }
      else drawSet(ctx, cur, camX, camY, vw, vh, env, time, 1);
    },
    drawFront(ctx, camX, camY, vw, vh, env, time) {
      const a = 0.62;
      if (prev) { layer(ctx, prev.front, camX, camY, vw, vh, 0, a * (1 - fadeT)); layer(ctx, cur.front, camX, camY, vw, vh, 0, a * fadeT); }
      else layer(ctx, cur.front, camX, camY, vw, vh, 0, a);
    },
  };
}
