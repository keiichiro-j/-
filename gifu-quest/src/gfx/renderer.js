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
    // GAS の HtmlService では iframe の中で動くので、キーボードを受けられるようキャンバスにフォーカスを置く
    // （読み込み時に試し、触った・クリックしたときにも置き直す）
    const focus = () => { try { if (document.activeElement !== canvas) canvas.focus({ preventScroll: true }); } catch { /* 無視 */ } };
    focus();
    canvas.addEventListener('pointerdown', focus);
  },
  resize() {
    const ww = window.innerWidth, wh = window.innerHeight;
    const aspect = ww / wh;
    this.viewH = VIEW_H;
    this.viewW = Math.round(Math.min(VIEW_W_MAX, Math.max(VIEW_W_MIN, VIEW_H * aspect)));
    this.scale = Math.min(ww / this.viewW, wh / this.viewH);
    this.dpr = Math.min(window.devicePixelRatio || 1, RUNTIME.quality === 'low' ? 1 : 2);
    // 実ピクセルの大きさを整数にし、CSSの大きさはそれを dpr で割った値にする（1.25倍などの画面で全体がぼやけないように）。
    // 論理1ドットあたりの実ピクセル（pixel）は、キャンバスの横幅にぴったり合わせる
    const c = this.canvas;
    const bw = Math.max(1, Math.floor(this.viewW * this.scale * this.dpr));
    this.pixel = bw / this.viewW;
    const bh = Math.max(1, Math.round(this.viewH * this.pixel));
    if (c.width !== bw) c.width = bw;
    if (c.height !== bh) c.height = bh;
    const cssW = bw / this.dpr, cssH = bh / this.dpr;
    // 左上も実ピクセルの格子にそろえる
    const left = Math.round((ww - cssW) / 2 * this.dpr) / this.dpr, top = Math.round((wh - cssH) / 2 * this.dpr) / this.dpr;
    c.style.width = cssW + 'px';
    c.style.height = cssH + 'px';
    c.style.left = left + 'px';
    c.style.top = top + 'px';
    this.offX = left; this.offY = top;
    // 'high' は縮小・拡大のたびに重いフィルタがかかり、絵の多い場面で1フレーム数〜十数ms 遅くなる（計測）。
    // アトラスは2倍で焼いてあるので、通常の補間で十分きれい
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'low';
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
