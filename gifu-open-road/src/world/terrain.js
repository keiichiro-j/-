// 高さマップと地面メッシュ。sampleH/groundH は純粋関数（テスト対象）
/* global THREE */
import { TILE, MAP_W, MAP_H, WORLD_W, WORLD_H, HEIGHTS } from '../core/config.js';
import { T, MOUNTAIN, RIVER, idx, inMap } from './mapgen.js';

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 値ノイズ（シード固定）と fBm
function hash(ix, iz) { let h = (ix * 374761393 + iz * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
export function fbm(x, z, oct = 4) { let v = 0, amp = 0.5, f = 1; for (let k = 0; k < oct; k++) { v += amp * vnoise(x * f, z * f); f *= 2.03; amp *= 0.5; } return v / (1 - Math.pow(0.5, oct)); }

// 金華山の高さ（山頂は城のため平ら）。尾根と谷のある起伏つき
export function mtnH(x, z) {
  const d = Math.hypot(x / TILE - (MOUNTAIN.c + 0.5), z / TILE - (MOUNTAIN.r + 0.5));
  if (d >= MOUNTAIN.radius) return 0;
  const t = smooth(MOUNTAIN.radius, MOUNTAIN.flat, d);
  const bump = Math.sin(x * 0.09) * Math.cos(z * 0.11) * 1.6 * t * (1 - t) * 4;
  return HEIGHTS.mountainPeak * t + bump;
}
// 尾根・谷の細かい起伏（道路の上では使わない）
function mtnRugged(x, z) {
  const d = Math.hypot(x / TILE - (MOUNTAIN.c + 0.5), z / TILE - (MOUNTAIN.r + 0.5));
  if (d >= MOUNTAIN.radius) return 0;
  const t = smooth(MOUNTAIN.radius, MOUNTAIN.flat, d);
  const ridge = 1 - Math.abs(fbm(x / 38, z / 38, 3) * 2 - 1);
  return (ridge - 0.5) * 9 * t * (1 - t) * 4;
}

export function riverH(z) {
  const zr = z / TILE;
  if (zr < RIVER.r0 || zr > RIVER.r1 + 1) return 0;
  const e = Math.min(zr - RIVER.r0, RIVER.r1 + 1 - zr);
  return HEIGHTS.riverBed * smooth(0, 1.4, e);
}

// 丘陵（里山）。外周ほど高くなる
export function hillH(x, z) {
  return 4 + fbm(x / 60 + 11, z / 60 + 7, 4) * 22;
}

// 起動時に高さグリッド（タイルの角ごと）を作る。以降は双一次補間で引く
let HG = null;
export function initTerrain(world) {
  const W = MAP_W + 1, H = MAP_H + 1;
  // 平地（道路・建物・田んぼなど）からの距離（タイル）
  const N = MAP_W * MAP_H, distT = new Float32Array(N).fill(99);
  const hilly = (i) => { const t = world.tiles[i], d = world.dist[i], c = i % MAP_W; return (t === T.FOREST || t === T.GRASS || (t === T.FARMROAD && c < 10)) && (d === 6 || (d === 5 && (c < 40 || c > 92))); };
  const q = [];
  for (let i = 0; i < N; i++) { if (!hilly(i)) { distT[i] = 0; q.push(i); } }
  for (let c = 0; c < MAP_W; c++) for (const r of [0, MAP_H - 1]) { if (distT[idx(c, r)] > 0) { distT[idx(c, r)] = 1; q.push(idx(c, r)); } }
  for (let r = 0; r < MAP_H; r++) for (const c of [0, MAP_W - 1]) { if (distT[idx(c, r)] > 0) { distT[idx(c, r)] = 1; q.push(idx(c, r)); } }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], c = i % MAP_W, r = (i / MAP_W) | 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const cc = c + dc, rr = r + dr; if (!inMap(cc, rr)) continue; const j = idx(cc, rr); if (distT[j] > distT[i] + 1) { distT[j] = distT[i] + 1; q.push(j); } }
  }
  const tileAt = (c, r) => (inMap(c, r) ? world.tiles[idx(c, r)] : -1);
  HG = new Float32Array(W * H);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const x = c * TILE, z = r * TILE;
    let m = 0, road = false, n = 0;
    for (const [dc, dr] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const cc = c + dc, rr = r + dr; if (!inMap(cc, rr)) continue; n++; m += smooth(0.5, 3.5, distT[idx(cc, rr)]); const t = tileAt(cc, rr); if (t === T.ROAD || t === T.LOT) road = true; }
    m = n ? m / n : 0;
    HG[r * W + c] = mtnH(x, z) + (road ? 0 : mtnRugged(x, z)) + riverH(z) + m * hillH(x, z);
  }
}

export function groundH(x, z) {
  if (!HG) return mtnH(x, z) + riverH(z);
  const W = MAP_W + 1;
  let fx = x / TILE, fz = z / TILE;
  if (fx < 0 || fz < 0 || fx > MAP_W || fz > MAP_H) return 0;
  const c = Math.min(MAP_W - 1, Math.floor(fx)), r = Math.min(MAP_H - 1, Math.floor(fz));
  const u = fx - c, v = fz - r;
  const a = HG[r * W + c], b = HG[r * W + c + 1], d = HG[(r + 1) * W + c], e = HG[(r + 1) * W + c + 1];
  return a + (b - a) * u + (d - a) * v + (a - b - d + e) * u * v;
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


// 地面テクスチャ（1タイル=8px）
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
  // 色むら（低周波ノイズ）と、急斜面の岩肌
  const img = g.getImageData(0, 0, cv.width, cv.height), px = img.data;
  const natural = new Set([T.GRASS, T.PARK, T.FOREST, T.FIELD, T.FARMROAD]);
  const slope = new Float32Array(MAP_W * MAP_H);
  for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) { const wx = c * TILE + 2, wz = r * TILE + 2; slope[idx(c, r)] = (Math.abs(groundH(wx + 2, wz) - groundH(wx - 2, wz)) + Math.abs(groundH(wx, wz + 2) - groundH(wx, wz - 2))) / 4; }
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
    const c = (x / ppt) | 0, r = (y / ppt) | 0, t = world.tiles[idx(c, r)];
    if (!natural.has(t)) continue;
    const wx = (x + 0.5) / ppt * TILE, wz = (y + 0.5) / ppt * TILE;
    const k = 0.84 + fbm(wx / 22, wz / 22, 3) * 0.3 + (hash(x, y) - 0.5) * 0.08;
    const o = (y * cv.width + x) * 4;
    let R = px[o] * k, G = px[o + 1] * k, B = px[o + 2] * k;
    if (t === T.FOREST || t === T.GRASS) {
      const rock = smooth(0.55, 1.0, slope[idx(c, r)] + (vnoise(wx / 5, wz / 5) - 0.5) * 0.3);
      R = R + (122 - R) * rock; G = G + (114 - G) * rock; B = B + (98 - B) * rock;
    }
    px[o] = R; px[o + 1] = G; px[o + 2] = B;
  }
  g.putImageData(img, 0, 0);
  // 河原（川の両岸の砂利）
  for (let c = 0; c < MAP_W; c++) for (const r of [RIVER.r0, RIVER.r1]) {
    if (world.tiles[idx(c, r)] !== T.WATER) continue;
    g.fillStyle = 'rgba(190,180,150,0.55)'; g.fillRect(c * ppt, r * ppt + (r === RIVER.r0 ? 0 : ppt / 2), ppt, ppt / 2);
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
  // 斜面の陰影（谷は少し暗く、尾根は明るく）
  const n = geo.attributes.normal, cols = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    const cav = (groundH(x + 6, z) + groundH(x - 6, z) + groundH(x, z + 6) + groundH(x, z - 6)) / 4 - y;
    const k = Math.max(0.72, Math.min(1.08, 1 - cav * 0.05 - (1 - n.getY(i)) * 0.25));
    cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const cv = buildGroundCanvas(world, 8);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const mat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  const group = new THREE.Group(); group.add(mesh);
  group.add(buildOuterLand());
  const ranges = buildRanges();
  group.add(ranges);
  return { group, canvas: cv, ranges };
}

// 地図の外：地図の縁から丘が立ち上がり、遠くは山並みへ
function outerH(x, z) {
  const dx = Math.max(0, -x, x - WORLD_W), dz = Math.max(0, -z, z - WORLD_H);
  const d = Math.hypot(dx, dz);
  if (d <= 0) return 0;
  return smooth(0, 260, d) * (6 + fbm(x / 160, z / 160, 4) * 40) + smooth(250, 1400, d) * (40 + fbm(x / 420 + 3, z / 420, 4) * 200);
}
function buildOuterLand() {
  const E = 2200, step = 60;
  const xs = [], zs = [];
  for (let v = -E; v < 0; v += step) xs.push(v); xs.push(0, WORLD_W / 2, WORLD_W); for (let v = WORLD_W + step; v <= WORLD_W + E; v += step) xs.push(v);
  for (let v = -E; v < 0; v += step) zs.push(v); zs.push(0, WORLD_H / 2, WORLD_H); for (let v = WORLD_H + step; v <= WORLD_H + E; v += step) zs.push(v);
  const pos = [], col = [], ind = [];
  const W = xs.length;
  const green = new THREE.Color(0x5c8a43), far = new THREE.Color(0x4a6a4a), rock = new THREE.Color(0x7a7a70);
  const cc = new THREE.Color();
  for (let j = 0; j < zs.length; j++) for (let i = 0; i < W; i++) {
    const x = xs[i], z = zs[j];
    const inside = x > 0 && x < WORLD_W && z > 0 && z < WORLD_H;
    const onEdge = !inside && x >= 0 && x <= WORLD_W && z >= 0 && z <= WORLD_H;
    const y = inside ? -3 : onEdge ? groundH(Math.min(WORLD_W - 0.01, x), Math.min(WORLD_H - 0.01, z)) - 0.05 : outerH(x, z);
    pos.push(x, y, z);
    cc.copy(green).lerp(far, Math.min(1, y / 120)).lerp(rock, Math.max(0, (y - 150) / 120));
    col.push(cc.r, cc.g, cc.b);
  }
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < W - 1; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    ind.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(ind); g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
}
// 霧の向こうの山並み（伊吹・恵那の山々をイメージした遠景）。色は空に合わせて毎フレーム変える
function buildRanges() {
  const N = 180, R = 2600, cx = WORLD_W / 2, cz = WORLD_H / 2;
  const pos = [], ind = [];
  for (let layer = 0; layer < 2; layer++) {
    const base = pos.length / 3, rr = R + layer * 500;
    for (let k = 0; k <= N; k++) {
      const a = k / N * Math.PI * 2;
      const north = Math.max(0, -Math.sin(a)); // 北側ほど高い山
      const h = (90 + fbm(k / 9 + layer * 20, layer * 3, 4) * 240) * (0.55 + north * 0.8) * (layer ? 1.25 : 1);
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      pos.push(x, -20, z, x, h, z);
    }
    for (let k = 0; k < N; k++) { const a = base + k * 2; ind.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(ind);
  // 手前の山並み（layer0）と奥（layer1）を別の色で描く
  const grp = new THREE.Group();
  const half = ind.length / 2;
  for (let L = 0; L < 2; L++) {
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', g.attributes.position); gg.setIndex(ind.slice(L * half, (L + 1) * half));
    const m = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ color: L ? 0x9fb4c4 : 0x7f9bb0, fog: false, side: THREE.DoubleSide }));
    m.renderOrder = -2 + (1 - L);
    grp.add(m);
  }
  return grp;
}
