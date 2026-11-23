// 高さマップと地面メッシュ。sampleH/groundH は純粋関数（テスト対象）
/* global THREE */
import { TILE, MAP_W, MAP_H, WORLD_W, WORLD_H, HEIGHTS } from '../core/config.js';
import { T, MOUNTAIN, RIVER, idx, inMap } from './mapgen.js';

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 金華山の高さ（山頂は城のため平ら）
export function mtnH(x, z) {
  const d = Math.hypot(x / TILE - (MOUNTAIN.c + 0.5), z / TILE - (MOUNTAIN.r + 0.5));
  if (d >= MOUNTAIN.radius) return 0;
  const t = smooth(MOUNTAIN.radius, MOUNTAIN.flat, d);
  const bump = Math.sin(x * 0.09) * Math.cos(z * 0.11) * 1.6 * t * (1 - t) * 4;
  return HEIGHTS.mountainPeak * t + bump;
}

export function riverH(z) {
  const zr = z / TILE;
  if (zr < RIVER.r0 || zr > RIVER.r1 + 1) return 0;
  const e = Math.min(zr - RIVER.r0, RIVER.r1 + 1 - zr);
  return HEIGHTS.riverBed * smooth(0, 1.4, e);
}

export function groundH(x, z) {
  return mtnH(x, z) + riverH(z);
}

// 車や人が立つ高さ（橋の上を含む）
export function sampleH(world, x, z) {
  const c = Math.floor(x / TILE), r = Math.floor(z / TILE);
  if (inMap(c, r)) {
    const t = world.tiles[idx(c, r)];
    if (t === T.BRIDGE || t === T.BRIDGEWALK) return HEIGHTS.bridge;
  }
  return groundH(x, z);
}

export function isWater(world, x, z) {
  const c = Math.floor(x / TILE), r = Math.floor(z / TILE);
  if (!inMap(c, r)) return false;
  const t = world.tiles[idx(c, r)];
  return t === T.WATER;
}

export function surfaceGrip(world, x, z, wet) {
  const c = Math.floor(x / TILE), r = Math.floor(z / TILE);
  if (!inMap(c, r)) return 0.6;
  const t = world.tiles[idx(c, r)];
  let g;
  if (t === T.ROAD || t === T.BRIDGE || t === T.PLAZA || t === T.WALK || t === T.BRIDGEWALK) g = 1.0;
  else if (t === T.FIELD) g = 0.45;
  else if (t === T.FARMROAD) g = 0.75;
  else g = 0.6;
  return wet ? g * 0.85 : g;
}

const COLORS = {
  [T.GRASS]: '#6c9a4b', [T.ROAD]: '#3b3e44', [T.WALK]: '#b8b3a6', [T.BLDG]: '#55575c', [T.WATER]: '#6b6a52',
  [T.PARK]: '#79ab55', [T.FIELD]: '#8cae4e', [T.FOREST]: '#3f6b35', [T.PLAZA]: '#c9c0ad', [T.BRIDGE]: '#4a4d52',
  [T.FARMROAD]: '#a48c63', [T.BRIDGEWALK]: '#a9a59a', [T.RAIL]: '#6d6257', [T.ARCADE]: '#b0695a', [T.LOT]: '#77787c',
};

// 地面テクスチャ（1タイル=8px）
export function buildGroundCanvas(world, ppt = 8) {
  const cv = document.createElement('canvas');
  cv.width = MAP_W * ppt; cv.height = MAP_H * ppt;
  const g = cv.getContext('2d');
  for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
    const t = world.tiles[idx(c, r)];
    g.fillStyle = COLORS[t] || '#777';
    g.fillRect(c * ppt, r * ppt, ppt, ppt);
    const x = c * ppt, y = r * ppt;
    if (t === T.GRASS || t === T.PARK || t === T.FOREST) {
      for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(${k % 2 ? 40 : 140},${k % 2 ? 70 : 170},30,0.18)`; g.fillRect(x + ((c * 7 + k * 13 + r * 3) % ppt), y + ((r * 5 + k * 11) % ppt), 2, 2); }
    } else if (t === T.FIELD) {
      g.fillStyle = (r % 2) ? 'rgba(80,120,40,0.45)' : 'rgba(120,170,200,0.25)';
      for (let k = 1; k < ppt; k += 2) g.fillRect(x, y + k, ppt, 1);
    } else if (t === T.WALK || t === T.BRIDGEWALK) {
      g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x, y, ppt, 1); g.fillRect(x, y, 1, ppt);
    } else if (t === T.PLAZA || t === T.ARCADE) {
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, y, ppt / 2, ppt / 2); g.fillRect(x + ppt / 2, y + ppt / 2, ppt / 2, ppt / 2);
    } else if (t === T.RAIL) {
      g.fillStyle = '#8a8580'; g.fillRect(x, y + 2, ppt, 1); g.fillRect(x, y + 5, ppt, 1);
      g.fillStyle = '#4b3b2e'; for (let k = 0; k < ppt; k += 3) g.fillRect(x + k, y + 1, 1, 6);
    }
  }
  // 道路の白線
  g.lineWidth = Math.max(1, ppt / 8);
  const ax = world.roadAxis;
  const isRoad = (c, r) => inMap(c, r) && (world.tiles[idx(c, r)] === T.ROAD || world.tiles[idx(c, r)] === T.BRIDGE);
  for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
    const i = idx(c, r);
    if (!isRoad(c, r) || ax[i] === 3 || ax[i] === 0) continue;
    const x = c * ppt, y = r * ppt;
    if (world.cw[i] >= 0) {
      g.fillStyle = 'rgba(240,240,235,0.85)';
      if (world.cwAxis[i] === 2) for (let k = 1; k < ppt; k += 3) g.fillRect(x + 1, y + k, ppt - 2, 1.5);
      else for (let k = 1; k < ppt; k += 3) g.fillRect(x + k, y + 1, 1.5, ppt - 2);
      continue;
    }
    if (ax[i] === 1) {
      // 上下の端：上に道路があり、下に道路がない側に中央線は無い。中央線は道路帯の中央
      if (isRoad(c, r - 1) && (ax[idx(c, r - 1)] & 1) && !(isRoad(c, r + 1) && (ax[idx(c, r + 1)] & 1))) continue;
      // この行の下境界が中央か判定（帯の上端から数える）
      let top = r; while (isRoad(c, top - 1) && (ax[idx(c, top - 1)] & 1) && ax[idx(c, top - 1)] !== 3) top--;
      let bot = r; while (isRoad(c, bot + 1) && (ax[idx(c, bot + 1)] & 1) && ax[idx(c, bot + 1)] !== 3) bot++;
      const w = bot - top + 1, mid = top + w / 2;
      if (r + 1 === mid) { g.fillStyle = '#f2e7c4'; g.fillRect(x, y + ppt - 1, ppt, 2); }
      else if (r + 1 < bot + 1) { g.fillStyle = 'rgba(255,255,255,0.7)'; if (c % 2 === 0) g.fillRect(x, y + ppt - 0.5, ppt * 0.6, 1); }
    } else if (ax[i] === 2) {
      let lf = c; while (isRoad(lf - 1, r) && (ax[idx(lf - 1, r)] & 2) && ax[idx(lf - 1, r)] !== 3) lf--;
      let rt = c; while (isRoad(rt + 1, r) && (ax[idx(rt + 1, r)] & 2) && ax[idx(rt + 1, r)] !== 3) rt++;
      const w = rt - lf + 1, mid = lf + w / 2;
      if (c + 1 === mid) { g.fillStyle = '#f2e7c4'; g.fillRect(x + ppt - 1, y, 2, ppt); }
      else if (c + 1 < rt + 1) { g.fillStyle = 'rgba(255,255,255,0.7)'; if (r % 2 === 0) g.fillRect(x + ppt - 0.5, y, 1, ppt * 0.6); }
    }
  }
  return cv;
}

export function buildGround(world, renderer) {
  const geo = new THREE.PlaneGeometry(WORLD_W, WORLD_H, MAP_W, MAP_H);
  geo.rotateX(-Math.PI / 2);
  geo.translate(WORLD_W / 2, 0, WORLD_H / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, groundH(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  const cv = buildGroundCanvas(world, 8);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  // 周囲の遠景（地図外を4枚の板で囲む）
  const group = new THREE.Group(); group.add(mesh);
  const om = new THREE.MeshLambertMaterial({ color: 0x5f8a45 });
  const B = 900;
  for (const [w, d, x, z] of [[WORLD_W + B * 2, B, WORLD_W / 2, -B / 2], [WORLD_W + B * 2, B, WORLD_W / 2, WORLD_H + B / 2], [B, WORLD_H, -B / 2, WORLD_H / 2], [B, WORLD_H, WORLD_W + B / 2, WORLD_H / 2]]) {
    const o = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), om);
    o.position.set(x, -0.02, z); group.add(o);
  }
  return { group, canvas: cv };
}
