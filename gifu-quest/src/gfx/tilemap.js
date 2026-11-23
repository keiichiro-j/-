import { TILE } from '../core/config.js';
import { makeCanvas } from './renderer.js';
import { drawTile } from '../art/tiles.js';
// タイルを16×16のチャンク単位で画像に焼き付け、変化したチャンクだけ描き直す（設計書 2章「性能の予算」）
const CH = 16;
export class TileMap {
  constructor(level, theme) {
    this.level = level; this.theme = theme;
    this.chunks = new Map();
    this.scale = 1;
  }
  key(cx, cy) { return (cx << 16) | cy; }
  bake(cx, cy) {
    const k = this.key(cx, cy);
    let c = this.chunks.get(k);
    const px = CH * TILE * this.scale;
    if (!c) { c = makeCanvas(px, px); this.chunks.set(k, c); }
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    ctx.scale(this.scale, this.scale);
    const L = this.level;
    for (let ty = cy * CH; ty < (cy + 1) * CH && ty < L.h; ty++) {
      for (let tx = cx * CH; tx < (cx + 1) * CH && tx < L.w; tx++) {
        const t = L.get(tx, ty);
        if (!t) continue;
        ctx.save();
        ctx.translate((tx - cx * CH) * TILE, (ty - cy * CH) * TILE);
        drawTile(ctx, t, tx, ty, L, this.theme);
        ctx.restore();
      }
    }
    return c;
  }
  setScale(s) { if (s !== this.scale) { this.scale = s; this.chunks.clear(); } }
  draw(ctx, camX, camY, vw, vh) {
    const L = this.level;
    if (L.dirty.size) { for (const k of L.dirty) if (this.chunks.has(k)) this.bake(k >> 16, k & 0xffff); L.dirty.clear(); }
    const size = CH * TILE;
    const cx0 = Math.max(0, Math.floor(camX / size)), cx1 = Math.floor((camX + vw) / size);
    const cy0 = Math.max(0, Math.floor(camY / size)), cy1 = Math.floor((camY + vh) / size);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (cx * CH >= L.w || cy * CH >= L.h) continue;
      let c = this.chunks.get(this.key(cx, cy));
      if (!c) c = this.bake(cx, cy);
      ctx.drawImage(c, cx * size, cy * size, size, size);
    }
  }
  // 先読み（読み込み中に呼ぶ）
  prebake(budgetMs = 8) {
    const L = this.level;
    const list = [];
    for (let cy = 0; cy * CH < L.h; cy++) for (let cx = 0; cx * CH < L.w; cx++) if (!this.chunks.has(this.key(cx, cy))) list.push([cx, cy]);
    const t0 = performance.now();
    for (const [cx, cy] of list) { this.bake(cx, cy); if (performance.now() - t0 > budgetMs) return false; }
    return true;
  }
}
