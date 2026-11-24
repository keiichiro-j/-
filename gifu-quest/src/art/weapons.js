import { defineSprite } from '../gfx/atlas.js';
import W from '../data/weapons.json';
// 福引きの武器30種のアイコン。名前 weapon_<id>、48×48、基準点は中心。形は kind、色は武器ごとの color
const S = 48;

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function outline(ctx, path, fill, line = '#2a1a14', lw = 2.2) {
  ctx.beginPath(); path(ctx);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = line; ctx.lineJoin = 'round'; ctx.stroke();
}
function grad(ctx, x0, y0, x1, y1, a, b) { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
// 柄（つか）：巻きひも模様
function grip(ctx, len, w, col) {
  outline(ctx, (c) => c.roundRect(-len, -w / 2, len, w, 2), col);
  ctx.strokeStyle = 'rgba(255,240,210,0.55)'; ctx.lineWidth = 1.2;
  for (let x = -len + 3; x < -2; x += 4) { ctx.beginPath(); ctx.moveTo(x, -w / 2 + 1); ctx.lineTo(x + 3, w / 2 - 1); ctx.stroke(); }
}
function blade(ctx, len, w, col, curve = 3) {
  const hi = shade(col, 0.55), lo = shade(col, -0.25);
  outline(ctx, (c) => { c.moveTo(0, -w / 2); c.quadraticCurveTo(len * 0.6, -w / 2 - curve, len, -curve - 1); c.quadraticCurveTo(len * 0.6, w / 2 - curve * 0.4, 0, w / 2); c.closePath(); }, grad(ctx, 0, -w, 0, w, hi, lo));
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(2, -w / 2 + 1.2); ctx.quadraticCurveTo(len * 0.6, -w / 2 - curve + 1, len - 2, -curve - 0.5); ctx.stroke();
}
function tsuba(ctx, col) { outline(ctx, (c) => c.ellipse(0, 0, 2.6, 6, 0, 0, 7), col); }

const DRAW = {
  katana(ctx, col) { grip(ctx, 12, 5, '#3a2a40'); tsuba(ctx, '#c8a040'); ctx.translate(2, 0); blade(ctx, 26, 5, col, 3); },
  tanto(ctx, col) { grip(ctx, 10, 6, '#5a2a20'); tsuba(ctx, '#d0b060'); ctx.translate(2, 0); blade(ctx, 15, 6.5, col, 1.5); },
  naginata(ctx, col) {
    outline(ctx, (c) => c.roundRect(-22, -2, 26, 4, 2), '#6a4428');
    ctx.translate(4, 0); tsuba(ctx, '#b89040'); ctx.translate(2, 0); blade(ctx, 15, 7, col, 5);
  },
  spear(ctx, col) {
    outline(ctx, (c) => c.roundRect(-22, -1.8, 30, 3.6, 2), '#7a5a34');
    outline(ctx, (c) => { c.moveTo(8, -4); c.lineTo(20, 0); c.lineTo(8, 4); c.closePath(); }, grad(ctx, 8, -4, 8, 4, shade(col, 0.5), shade(col, -0.2)));
    outline(ctx, (c) => c.roundRect(5, -2.6, 4, 5.2, 1), '#3a2a20', '#2a1a14', 1.4);
  },
  hammer(ctx, col) {
    outline(ctx, (c) => c.roundRect(-20, -2, 24, 4, 2), '#6a4a2a');
    outline(ctx, (c) => c.roundRect(3, -9, 13, 18, 3), grad(ctx, 3, -9, 16, 9, shade(col, 0.4), shade(col, -0.3)));
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(5, -7, 3, 14);
  },
  axe(ctx, col) {
    outline(ctx, (c) => c.roundRect(-20, -2, 30, 4, 2), '#6a4a2a');
    outline(ctx, (c) => { c.moveTo(2, -3); c.quadraticCurveTo(10, -14, 16, -12); c.quadraticCurveTo(13, 0, 16, 12); c.quadraticCurveTo(10, 14, 2, 3); c.closePath(); }, grad(ctx, 2, -12, 16, 12, shade(col, 0.45), shade(col, -0.25)));
  },
  sickle(ctx, col) {
    grip(ctx, 14, 5, '#7a5230');
    outline(ctx, (c) => { c.moveTo(0, -3); c.quadraticCurveTo(14, -18, 22, -6); c.quadraticCurveTo(14, -11, 3, 2); c.closePath(); }, grad(ctx, 0, -14, 20, 0, shade(col, 0.5), shade(col, -0.2)));
  },
  fan(ctx, col) {
    ctx.translate(-8, 0);
    const n = 9;
    outline(ctx, (c) => { c.moveTo(0, 0); c.arc(0, 0, 24, -0.95, 0.95); c.closePath(); }, grad(ctx, 0, -20, 24, 20, shade(col, 0.35), shade(col, -0.15)));
    ctx.strokeStyle = 'rgba(60,30,20,0.55)'; ctx.lineWidth = 1;
    for (let i = 0; i <= n; i++) { const a = -0.95 + 1.9 * i / n; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 7, Math.sin(a) * 7); ctx.lineTo(Math.cos(a) * 24, Math.sin(a) * 24); ctx.stroke(); }
    ctx.fillStyle = '#3a2216'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(14, -3, 3, 0, 7); ctx.fill();
  },
  umbrella(ctx, col) {
    outline(ctx, (c) => c.roundRect(-20, -1.5, 36, 3, 1.5), '#5a3a22');
    outline(ctx, (c) => { c.moveTo(16, 0); c.quadraticCurveTo(4, -12, -6, -9); c.lineTo(-6, 9); c.quadraticCurveTo(4, 12, 16, 0); c.closePath(); }, grad(ctx, -6, -9, 16, 9, shade(col, 0.3), shade(col, -0.25)));
    ctx.strokeStyle = 'rgba(255,240,220,0.6)'; ctx.lineWidth = 1;
    for (const y of [-5, 0, 5]) { ctx.beginPath(); ctx.moveTo(-6, y * 1.6); ctx.lineTo(16, 0); ctx.stroke(); }
  },
  torch(ctx, col) {
    outline(ctx, (c) => c.roundRect(-20, -2, 26, 4, 2), '#5a3a22');
    outline(ctx, (c) => c.roundRect(4, -5, 6, 10, 2), '#3a2a20');
    const g = ctx.createRadialGradient(15, 0, 1, 15, 0, 12); g.addColorStop(0, '#fff4c0'); g.addColorStop(0.45, col); g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(15, 0, 12, 0, 7); ctx.fill();
    outline(ctx, (c) => { c.moveTo(9, -4); c.quadraticCurveTo(16, -10, 22, 0); c.quadraticCurveTo(16, 8, 9, 4); c.closePath(); }, '#ffcf60', '#c0501a', 1.2);
  },
  staff(ctx, col) {
    outline(ctx, (c) => c.roundRect(-21, -2, 36, 4, 2), grad(ctx, 0, -2, 0, 2, '#9a7a4a', '#5a3a1a'));
    outline(ctx, (c) => c.arc(16, 0, 6, 0, 7), grad(ctx, 10, -6, 22, 6, shade(col, 0.6), shade(col, -0.1)));
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(14, -2, 2, 0, 7); ctx.fill();
    ctx.strokeStyle = shade(col, -0.3); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(6, -2); ctx.quadraticCurveTo(10, -8, 12, -4); ctx.stroke();
  },
  baton(ctx, col) {
    outline(ctx, (c) => c.roundRect(-18, -2, 22, 4, 2), '#2a1a14');
    for (let i = 0; i < 6; i++) {
      ctx.save(); ctx.translate(4, 0); ctx.rotate(-0.6 + i * 0.24);
      outline(ctx, (c) => c.rect(0, -2.5, 17, 5), i % 2 ? '#fff6e0' : col, '#3a2216', 1.1);
      ctx.restore();
    }
  },
  spade(ctx, col) {
    outline(ctx, (c) => c.roundRect(-20, -2, 26, 4, 2), '#7a5a34');
    outline(ctx, (c) => { c.moveTo(5, -8); c.lineTo(20, -9); c.quadraticCurveTo(24, 0, 20, 9); c.lineTo(5, 8); c.closePath(); }, grad(ctx, 5, -9, 22, 9, shade(col, 0.4), shade(col, -0.3)));
  },
};

export function drawWeaponIcon(ctx, w) {
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.rotate(-Math.PI / 4);
  // ほんのり影
  ctx.save(); ctx.translate(1.5, 2.5); ctx.globalAlpha = 0.25; ctx.filter = 'blur(1px)'; (DRAW[w.kind] || DRAW.katana)(ctx, '#000'); ctx.restore();
  (DRAW[w.kind] || DRAW.katana)(ctx, w.color);
  ctx.restore();
}

export function defineWeaponArt() {
  for (const w of W.weapons) defineSprite(`weapon_${w.id}`, { w: S, h: S, ox: S / 2, oy: S / 2, draw: (ctx) => drawWeaponIcon(ctx, w) });
}
