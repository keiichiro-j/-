// 夜の「光の穴」方式（設計書 8章）。担当：FX・サウンド
// 画面の半分の解像度の暗い膜（env.darkness, 色は env.shade）に、world.lights（{x,y,r,color,a,flicker}：ワールド座標）と
// 主人公の周りの穴を開けて、拡大して重ねる。灯りの色は加算で少しにじませる。稲光（env.flash）の瞬間は暗い場所も見える。
import { makeCanvas } from './renderer.js';
import { RUNTIME } from '../core/config.js';

const HOLE = 128;     // 穴の焼き付け画像の大きさ
const GLOW = 64;
const SCALE = 0.5;    // 膜の解像度（画面の半分）

let holeImg = null;
function hole() {
  if (holeImg) return holeImg;
  holeImg = makeCanvas(HOLE, HOLE);
  const g = holeImg.getContext('2d');
  const r = HOLE / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.35, 'rgba(0,0,0,0.85)');
  gr.addColorStop(0.7, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, HOLE, HOLE);
  return holeImg;
}
const glowCache = new Map();
function glow(color) {
  let c = glowCache.get(color);
  if (c) return c;
  if (glowCache.size > 48) glowCache.clear();
  c = makeCanvas(GLOW, GLOW);
  const g = c.getContext('2d');
  const r = GLOW / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, color); gr.addColorStop(0.4, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(0, 0, GLOW, GLOW);
  glowCache.set(color, c);
  return c;
}

export class Lighting {
  constructor() { this.mask = null; this.mctx = null; this.mw = 0; this.mh = 0; this.t = 0; }
  ensure(vw, vh) {
    const mw = Math.ceil(vw * SCALE), mh = Math.ceil(vh * SCALE);
    if (this.mask && mw === this.mw && mh === this.mh) return;
    this.mw = mw; this.mh = mh;
    this.mask = makeCanvas(mw, mh);
    this.mctx = this.mask.getContext('2d');
  }
  draw(ctx, world, cam, vw, vh) {
    const env = world.env;
    if (!env) return;
    this.t = world.time;
    const dark = (env.darkness || 0) * (1 - (env.flash || 0) * 0.85);
    if (dark < 0.01) return;
    this.ensure(vw, vh);
    const m = this.mctx, img = hole();
    const t = this.t;
    // 1. 暗い膜
    m.globalCompositeOperation = 'source-over';
    m.globalAlpha = 1;
    m.clearRect(0, 0, this.mw, this.mh);
    m.fillStyle = env.shade || '#060a1e';
    m.globalAlpha = dark;
    m.fillRect(0, 0, this.mw, this.mh);
    // 2. 穴を開ける
    m.globalCompositeOperation = 'destination-out';
    const p = world.player;
    if (p && !p.dead) {
      const r = (env.playerLightR || 120) * (1 + Math.sin(t * 2.1) * 0.015);
      m.globalAlpha = 0.9;
      const x = (p.cx - cam.x) * SCALE, y = (p.cy - cam.y) * SCALE, rr = r * SCALE;
      m.drawImage(img, x - rr, y - rr, rr * 2, rr * 2);
    }
    const lights = world.lights;
    const x0 = cam.x - 400, x1 = cam.x + vw + 400, y0 = cam.y - 400, y1 = cam.y + vh + 400;
    for (let i = 0; i < lights.length; i++) {
      const L = lights[i];
      if (L.x < x0 || L.x > x1 || L.y < y0 || L.y > y1) continue;
      const r = L.r * flick(L, t) * SCALE;
      m.globalAlpha = L.a ?? 1;
      const x = (L.x - cam.x) * SCALE, y = (L.y - cam.y) * SCALE;
      m.drawImage(img, x - r, y - r, r * 2, r * 2);
    }
    m.globalCompositeOperation = 'source-over';
    m.globalAlpha = 1;
    // 3. 拡大して重ねる
    ctx.drawImage(this.mask, 0, 0, this.mw, this.mh, 0, 0, vw, vh);
    // 4. 灯りの色のにじみ（加算）
    if (RUNTIME.quality !== 'low') {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < lights.length; i++) {
        const L = lights[i];
        if (!L.color) continue;
        const r = L.r * flick(L, t) * 0.85;
        if (L.x + r < cam.x || L.x - r > cam.x + vw || L.y + r < cam.y || L.y - r > cam.y + vh) continue;
        ctx.globalAlpha = Math.min(1, (L.a ?? 1) * dark * 0.42);
        ctx.drawImage(glow(L.color), L.x - cam.x - r, L.y - cam.y - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }
}

// ゆらぎ（篝火・提灯）。flicker 0..1
function flick(L, t) {
  const f = L.flicker || 0;
  if (!f) return 1;
  const s = L.x * 0.013 + L.y * 0.007;
  return 1 + f * (Math.sin(t * 13 + s * 7) * 0.05 + Math.sin(t * 7.3 + s * 3) * 0.04 + Math.sin(t * 23 + s) * 0.02);
}
