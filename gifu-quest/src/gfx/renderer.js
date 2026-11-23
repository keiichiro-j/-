import { VIEW_H, VIEW_W_MIN, VIEW_W_MAX, RUNTIME } from '../core/config.js';
// 論理解像度：高さ540、横幅960〜1200（画面比に追従）。ピクセル比は最大2（低画質は1）
export const renderer = {
  canvas: null, ctx: null,
  viewW: VIEW_W_MIN, viewH: VIEW_H,
  scale: 1, dpr: 1, offX: 0, offY: 0,
  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
  },
  resize() {
    const ww = window.innerWidth, wh = window.innerHeight;
    const aspect = ww / wh;
    this.viewH = VIEW_H;
    this.viewW = Math.round(Math.min(VIEW_W_MAX, Math.max(VIEW_W_MIN, VIEW_H * aspect)));
    this.scale = Math.min(ww / this.viewW, wh / this.viewH);
    this.dpr = Math.min(window.devicePixelRatio || 1, RUNTIME.quality === 'low' ? 1 : 2);
    const cssW = Math.floor(this.viewW * this.scale), cssH = Math.floor(this.viewH * this.scale);
    const c = this.canvas;
    c.style.width = cssW + 'px';
    c.style.height = cssH + 'px';
    c.style.left = Math.floor((ww - cssW) / 2) + 'px';
    c.style.top = Math.floor((wh - cssH) / 2) + 'px';
    c.width = Math.floor(cssW * this.dpr);
    c.height = Math.floor(cssH * this.dpr);
    this.offX = (ww - cssW) / 2; this.offY = (wh - cssH) / 2;
    this.pixel = this.scale * this.dpr;  // 論理1ドットあたりの実ピクセル
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    for (const fn of this.onResize) fn(this);
  },
  onResize: [],
  begin() {
    const ctx = this.ctx;
    ctx.setTransform(this.pixel, 0, 0, this.pixel, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    return ctx;
  },
  // 画面座標（clientX/Y）→ 論理座標
  toLogical(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (cx - r.left) / r.width * this.viewW, y: (cy - r.top) / r.height * this.viewH };
  },
};

// 画面外キャンバス（OffscreenCanvasが無い環境でも動く）
export function makeCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  return new OffscreenCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
}
