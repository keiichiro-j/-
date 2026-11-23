import { TILE } from '../core/config.js';
import { CHAR_TO_TILE, CHAR_TO_ENTITY, T } from './tiles.js';

// レベルJSON（levels/stageN.json）→ 実行時のレベル
// 形式は docs/ARCHITECTURE.md 「レベルデータ」参照
export class Level {
  constructor(data) {
    this.data = data;
    this.id = data.id;
    this.name = data.name;
    const rows = data.tiles;
    this.h = rows.length;
    this.w = Math.max(...rows.map((r) => r.length));
    this.grid = new Uint8Array(this.w * this.h);
    this.entities = (data.entities || []).map((e) => ({ ...e }));
    for (let y = 0; y < this.h; y++) {
      const row = rows[y];
      for (let x = 0; x < this.w; x++) {
        const ch = row[x] ?? '.';
        if (CHAR_TO_ENTITY[ch]) { this.entities.push({ type: CHAR_TO_ENTITY[ch], x, y }); continue; }
        const t = CHAR_TO_TILE[ch];
        this.grid[y * this.w + x] = t === undefined ? T.EMPTY : t;
      }
    }
    this.pxW = this.w * TILE;
    this.pxH = this.h * TILE;
    this.areas = data.areas || [{ name: 'main', x0: 0, x1: this.w }];
    this.dirty = new Set();   // 描き直すチャンク
    this.version = 0;
  }
  get(tx, ty) {
    if (tx < 0 || tx >= this.w) return T.GROUND;    // 左右の外は壁
    if (ty < 0) return T.EMPTY;                       // 上は空
    if (ty >= this.h) return T.EMPTY;                 // 下は穴
    return this.grid[ty * this.w + tx];
  }
  set(tx, ty, t) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
    this.grid[ty * this.w + tx] = t;
    this.dirty.add(((tx >> 4) << 16) | (ty >> 4));
    // 継ぎ目が変わるので隣のチャンクも
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = tx + dx, ny = ty + dy;
      if (nx >= 0 && ny >= 0) this.dirty.add(((nx >> 4) << 16) | (ny >> 4));
    }
    this.version++;
  }
  at(px, py) { return this.get(Math.floor(px / TILE), Math.floor(py / TILE)); }
  areaAt(tx) { return this.areas.find((a) => tx >= a.x0 && tx < a.x1) || this.areas[0]; }
}
