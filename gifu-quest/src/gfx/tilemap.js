import { TILE } from '../core/config.js';
import { makeCanvas } from './renderer.js';
import { drawTile } from '../art/tiles.js';
import { T } from '../world/tiles.js';
// タイルを16×16のチャンク単位で画像に焼き付け、変化したチャンクだけ描き直す（設計書 2章「性能の予算」）
// - チャンクは画面の実ピクセルと同じ解像度（論理1ドット＝ctx の拡大率）で焼き、実ピクセルの格子にそろえて
//   拡大縮小なしで貼る（拡大して貼ると、ぼやける上にスマホ・高DPIで1フレーム十数ms かかっていた）
// - 焼き付けは1フレームに数個まで。画面のすぐ外のチャンクを少しずつ先に焼き、遠いチャンクは捨てる（メモリの上限）
const CH = 16;
const MAX_SCALE = 3;           // これより細かい画面では、チャンクを拡大して貼る
const MEM_BUDGET = 96e6;       // チャンク画像に使うメモリの目安（バイト）
const AHEAD_MS = 3;            // 先読みの焼き付けに1フレームで使う時間
export class TileMap {
  constructor(level, theme) {
    this.level = level; this.theme = theme;
    this.chunks = new Map();   // key -> { c, used }
    this.scale = 1;
    this.frame = 0;
    this.bakes = 0;            // 焼いた回数（計測用）
  }
  key(cx, cy) { return (cx << 16) | cy; }
  bake(cx, cy) {
    const k = this.key(cx, cy);
    let e = this.chunks.get(k);
    const px = CH * TILE * this.scale;
    if (!e) { e = { c: makeCanvas(px, px), used: this.frame }; this.chunks.set(k, e); }
    const c = e.c;
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.scale(this.scale, this.scale);
    const L = this.level;
    for (let ty = cy * CH; ty < (cy + 1) * CH && ty < L.h; ty++) {
      for (let tx = cx * CH; tx < (cx + 1) * CH && tx < L.w; tx++) {
        const t = L.get(tx, ty);
        if (!t || t === T.FAKE) continue;   // 隠し部屋の偽の壁は World が別に描く（中に入ると透ける）
        ctx.save();
        ctx.translate((tx - cx * CH) * TILE, (ty - cy * CH) * TILE);
        drawTile(ctx, t, tx, ty, L, this.theme);
        ctx.restore();
      }
    }
    this.bakes++;
    return e;
  }
  setScale(s) { if (s !== this.scale) { this.scale = s; this.chunks.clear(); } }
  maxChunks() {
    const px = CH * TILE * this.scale;
    return Math.max(12, Math.floor(MEM_BUDGET / (px * px * 4)));
  }
  draw(ctx, camX, camY, vw, vh) {
    const L = this.level;
    this.frame++;
    if (L.dirty.size) { for (const k of L.dirty) if (this.chunks.has(k)) this.bake(k >> 16, k & 0xffff); L.dirty.clear(); }
    // 今の拡大率（論理→実ピクセル）。回転・縦横別の拡大がなければ実ピクセルにそろえて貼る
    const m = ctx.getTransform();
    const aligned = m.b === 0 && m.c === 0 && m.a > 0 && Math.abs(m.a - m.d) < 1e-9;
    if (aligned) this.setScale(Math.min(MAX_SCALE, m.a));
    const size = CH * TILE;
    const cx0 = Math.max(0, Math.floor(camX / size)), cx1 = Math.floor((camX + vw) / size);
    const cy0 = Math.max(0, Math.floor(camY / size)), cy1 = Math.floor((camY + vh) / size);
    if (aligned) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); }
    const exact = aligned && this.scale === m.a;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (cx * CH >= L.w || cy * CH >= L.h) continue;
      let e = this.chunks.get(this.key(cx, cy));
      if (!e) e = this.bake(cx, cy);
      e.used = this.frame;
      if (!aligned) { ctx.drawImage(e.c, cx * size, cy * size, size, size); continue; }
      const dx = Math.round(m.a * cx * size + m.e), dy = Math.round(m.d * cy * size + m.f);
      if (exact) ctx.drawImage(e.c, dx, dy);
      else ctx.drawImage(e.c, dx, dy, Math.round(m.a * (cx + 1) * size + m.e) - dx, Math.round(m.d * (cy + 1) * size + m.f) - dy);
    }
    if (aligned) ctx.restore();
    // 画面のすぐ外（左右1チャンク・上下1チャンク）を少しずつ先に焼いておく（スクロールで入った瞬間に焼くと引っかかる）
    const t0 = performance.now();
    if (this.chunks.size < this.maxChunks()) outer: for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
      if (cx < 0 || cy < 0 || cx * CH >= L.w || cy * CH >= L.h) continue;
      const k = this.key(cx, cy);
      const e = this.chunks.get(k);
      if (e) { e.used = this.frame; continue; }
      this.bake(cx, cy);
      if (performance.now() - t0 > AHEAD_MS) break outer;
    }
    // 遠いチャンクを捨てる（長く使っていない順）
    const max = this.maxChunks();
    if (this.chunks.size > max) {
      let n = this.chunks.size - max;
      for (const [k, e] of this.chunks) { if (this.frame - e.used > 30) { this.chunks.delete(k); if (--n <= 0) break; } }
    }
  }
  // 先読み（読み込み中に呼ぶ）。いまの拡大率で焼く
  prebake(budgetMs = 8) {
    const L = this.level;
    const t0 = performance.now();
    for (let cy = 0; cy * CH < L.h; cy++) for (let cx = 0; cx * CH < L.w; cx++) {
      if (this.chunks.has(this.key(cx, cy))) continue;
      if (this.chunks.size >= this.maxChunks()) return true;
      this.bake(cx, cy);
      if (performance.now() - t0 > budgetMs) return false;
    }
    return true;
  }
}
