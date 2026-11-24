// 画面の後処理（設計書 8章）。担当：FX・サウンド
// 昼の暗さ（くもり・雨）→ 天気と時間帯の色味（雨は青み、夕暮れは橙）→ 霧の帯 → ビネット（画面端を少し暗く）→ 稲光の白。
// グラデーションは起動時に一度だけ画像へ焼き付けて使い回す。RUNTIME.quality==='low' では霧の帯とビネットを省く。
import { makeCanvas } from './renderer.js';
import { RUNTIME } from '../core/config.js';

let IMG = null;
function images() {
  if (IMG) return IMG;
  IMG = {};
  // ビネット
  const v = makeCanvas(320, 180); const g = v.getContext('2d');
  const vg = g.createRadialGradient(160, 90, 60, 160, 90, 190);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(0.6, 'rgba(0,0,0,0.18)'); vg.addColorStop(1, 'rgba(0,0,0,0.75)');
  g.fillStyle = vg; g.fillRect(0, 0, 320, 180);
  IMG.vignette = v;
  // 霧の帯：横につながる（左右の端が同じ）柔らかい雲のかたまり
  const W = 512, H = 128;
  const b = makeCanvas(W, H); const c = b.getContext('2d');
  let s = 12345;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W, y = H * (0.35 + rnd() * 0.3), r = 30 + rnd() * 46;
    for (const ox of [-W, 0, W]) {
      const gr = c.createRadialGradient(x + ox, y, 0, x + ox, y, r);
      gr.addColorStop(0, 'rgba(228,232,236,0.42)'); gr.addColorStop(1, 'rgba(228,232,236,0)');
      c.fillStyle = gr; c.beginPath(); c.ellipse(x + ox, y, r * 1.8, r * 0.7, 0, 0, 6.2832); c.fill();
    }
  }
  IMG.fog = b; IMG.fogW = W; IMG.fogH = H;
  return IMG;
}

export function drawPostFx(ctx, env, vw, vh) {
  if (!env) return;
  const low = RUNTIME.quality === 'low';
  ctx.globalCompositeOperation = 'source-over';
  // 昼の暗さ（くもり・雨・雷雨）
  if (env.dim > 0.005) { ctx.globalAlpha = env.dim; ctx.fillStyle = '#10141e'; ctx.fillRect(0, 0, vw, vh); }
  // 色味
  if (env.tint) { ctx.globalAlpha = 1; ctx.fillStyle = env.tint; ctx.fillRect(0, 0, vw, vh); }
  // 霧
  const fog = env.fog || 0;
  if (fog > 0.01) {
    const night = env.nightness || 0;
    const haze = fog * (low ? 0.3 : 0.16) * (1 - night * 0.6);
    ctx.globalAlpha = haze; ctx.fillStyle = night > 0.5 ? '#5a6478' : '#dfe4ea'; ctx.fillRect(0, 0, vw, vh);
    if (!low) {
      const img = images();
      const t = env.time || 0, cx = env.camX || 0;
      // 3本の帯：奥ほど遅く、手前ほど速く・大きく
      for (let k = 0; k < 3; k++) {
        const sc = 1.6 + k * 0.7;
        const w = img.fogW * sc, h = img.fogH * sc;
        const y = vh * (0.28 + k * 0.22) - h * 0.5 + Math.sin(t * 0.2 + k * 2) * 10;
        let x = -((cx * (0.4 + k * 0.45) + t * (12 + k * 14) + k * 300) % w);
        if (x > 0) x -= w;
        ctx.globalAlpha = fog * (0.55 + k * 0.15) * (1 - night * 0.55);
        for (; x < vw; x += w) ctx.drawImage(img.fog, x, y, w, h);
      }
    }
  }
  // ビネット
  if (!low) {
    ctx.globalAlpha = Math.min(1, 0.5 + (env.darkness || 0) * 0.35 + (env.dim || 0));
    ctx.drawImage(images().vignette, 0, 0, vw, vh);
  }
  // 稲光
  if (env.flash > 0.01) {
    ctx.globalAlpha = env.flash * 0.5; ctx.fillStyle = '#eef2ff'; ctx.fillRect(0, 0, vw, vh);
  }
  ctx.globalAlpha = 1;
}
