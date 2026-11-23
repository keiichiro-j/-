import { TILE } from '../core/config.js';
import { T, slopeHeight, isSlope } from '../world/tiles.js';
// タイルの絵（担当：アート）。drawTile(ctx, t, tx, ty, level, theme) は (0,0)-(36,36) に描く。
// 隣のタイルを level.get で見て、端・角・内角を描き分ける。
const C = {
  [T.GROUND]: '#6b4a2e', [T.BRICK]: '#b0603e', [T.CRACK]: '#8a8378', [T.ONEWAY]: '#a77b4f', [T.ICE]: '#bfe6ff',
  [T.SPIKE]: '#ccc', [T.WATER_TOP]: 'rgba(60,140,220,0.55)', [T.WATER]: 'rgba(40,110,200,0.55)', [T.LAVA_TOP]: '#ff6a1a', [T.LAVA]: '#d8400f',
  [T.FAKE]: '#6b4a2e', [T.STONE]: '#8d8a80', [T.ROOF]: '#4a4f5a', [T.WOOD]: '#9a6b3c', [T.SNOW]: '#eef4fa',
};
export function drawTile(ctx, t, tx, ty, level, theme) {
  if (isSlope(t)) {
    ctx.fillStyle = C[T.GROUND];
    ctx.beginPath(); ctx.moveTo(0, TILE);
    for (let x = 0; x <= TILE; x += 6) ctx.lineTo(x, TILE - slopeHeight(t, x));
    ctx.lineTo(TILE, TILE); ctx.closePath(); ctx.fill();
    return;
  }
  ctx.fillStyle = C[t] || '#f0f';
  if (t === T.ONEWAY) { ctx.fillRect(0, 0, TILE, 10); return; }
  if (t === T.SPIKE) { ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(i * 12, TILE); ctx.lineTo(i * 12 + 6, 8); ctx.lineTo(i * 12 + 12, TILE); } ctx.fill(); return; }
  ctx.fillRect(0, 0, TILE, TILE);
  if (t === T.GROUND && level.get(tx, ty - 1) === T.EMPTY) { ctx.fillStyle = '#5fae4a'; ctx.fillRect(0, 0, TILE, 8); }
}
