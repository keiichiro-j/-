// タイル地図の生成。three.jsに依存しない純粋なロジック（単体テスト対象）。
import { TILE, MAP_W, MAP_H, HEIGHTS } from '../core/config.js';
import { mulberry32 } from '../core/rng.js';

export const T = {
  GRASS: 0, ROAD: 1, WALK: 2, BLDG: 3, WATER: 4, PARK: 5, FIELD: 6, FOREST: 7,
  PLAZA: 8, BRIDGE: 9, FARMROAD: 10, BRIDGEWALK: 11, RAIL: 12, ARCADE: 13, LOT: 14,
};

export const DISTRICTS = [
  { id: 0, name: '岐阜市街地' },
  { id: 1, name: '岐阜駅前' },
  { id: 2, name: '柳ケ瀬' },
  { id: 3, name: '金華山' },
  { id: 4, name: '長良川' },
  { id: 5, name: '長良' },
  { id: 6, name: '西岐阜の田園' },
  { id: 7, name: '岐阜公園' },
  { id: 8, name: '東部' },
];

export const MOUNTAIN = { c: 120, r: 33, radius: 17, flat: 2.6 };
export const RIVER = { r0: 10, r1: 16 };

// 道路の定義（タイル単位）。w=幅（2=片側1車線、4=片側2車線）
export const H_ROADS = [
  { r: 3, w: 2, c0: 50, c1: 81 },
  { r: 18, w: 2, c0: 38, c1: 99 },
  { r: 24, w: 2, c0: 38, c1: 99 },
  { r: 32, w: 4, c0: 18, c1: 99 },
  { r: 40, w: 2, c0: 38, c1: 99 },
  { r: 48, w: 2, c0: 38, c1: 99 },
  { r: 60, w: 4, c0: 18, c1: 135 },
  { r: 68, w: 2, c0: 38, c1: 135 },
  { r: 74, w: 4, c0: 18, c1: 135 },
];
export const V_ROADS = [
  { c: 18, w: 2, r0: 32, r1: 77 },
  { c: 38, w: 2, r0: 18, r1: 77 },
  { c: 50, w: 4, r0: 3, r1: 77 },
  { c: 58, w: 2, r0: 18, r1: 77 },
  { c: 66, w: 2, r0: 3, r1: 77 },
  { c: 78, w: 4, r0: 3, r1: 77 },
  { c: 88, w: 2, r0: 18, r1: 77 },
  { c: 98, w: 2, r0: 18, r1: 77 },
  { c: 134, w: 2, r0: 60, r1: 77 },
];
// 金華山ドライブウェイ（交通AIは走らない）
// 山を1.5周しながら登るらせん道路（勾配約15〜20%）
export const DRIVEWAY = (() => {
  const pts = [[100, 49], [105, 49]];
  const a0 = Math.atan2(49 - MOUNTAIN.r, 105 - MOUNTAIN.c);
  const turns = Math.PI * 3, n = 60;
  for (let k = 0; k <= n; k++) {
    const t = k / n, a = a0 - turns * t;
    const rad = 16.5 - (16.5 - (MOUNTAIN.flat + 0.6)) * t;
    pts.push([MOUNTAIN.c + 0.5 + Math.cos(a) * rad, MOUNTAIN.r + 0.5 + Math.sin(a) * rad]);
  }
  return pts;
})();

export function districtOf(c, r) {
  if (r >= RIVER.r0 && r <= RIVER.r1) return 4;
  if (r < RIVER.r0) return 5;
  const dm = Math.hypot(c - MOUNTAIN.c, r - MOUNTAIN.r);
  if (dm < MOUNTAIN.radius) return 3;
  if (c >= 100 && c <= 107 && r >= 40 && r <= 58) return 7;
  if (c < 36) return 6;
  if (r >= 78) return 1;
  if (c >= 58 && c <= 77 && r >= 40 && r <= 59) return 2;
  if (c >= 100) return 8;
  return 0;
}

export function idx(c, r) { return r * MAP_W + c; }
export function inMap(c, r) { return c >= 0 && r >= 0 && c < MAP_W && r < MAP_H; }

export function genWorld(seed = 1) {
  const rng = mulberry32(seed);
  const N = MAP_W * MAP_H;
  const tiles = new Uint8Array(N);
  const dist = new Uint8Array(N);
  const bh = new Float32Array(N);        // 建物の高さ（0=なし）
  const cw = new Int16Array(N).fill(-1); // 横断歩道 → 交差点番号
  const cwAxis = new Uint8Array(N);      // 横断歩道が横切る道路の向き 1=h 2=v
  const roadAxis = new Uint8Array(N);    // 1=h, 2=v, 3=交差点

  for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
    const d = districtOf(c, r);
    dist[idx(c, r)] = d;
    let t = T.GRASS;
    if (d === 4) t = T.WATER;
    else if (d === 3) t = T.FOREST;
    else if (d === 7) t = T.PARK;
    else if (d === 6) t = T.FIELD;
    tiles[idx(c, r)] = t;
  }
  // 河畔の土手は公園
  for (let c = 0; c < MAP_W; c++) { tiles[idx(c, RIVER.r0 - 1)] = T.PARK; tiles[idx(c, RIVER.r1 + 1)] = T.PARK; }

  // 鉄道（駅の南）
  for (let c = 0; c < MAP_W; c++) for (let r = 96; r <= 98; r++) tiles[idx(c, r)] = T.RAIL;

  // 田園の農道
  for (let r = 20; r < 96; r += 9) for (let c = 0; c < 36; c++) tiles[idx(c, r)] = T.FARMROAD;
  for (let c = 4; c < 36; c += 11) for (let r = 18; r < 96; r++) tiles[idx(c, r)] = T.FARMROAD;

  // 道路
  const paintRoad = (c, r, axis) => {
    if (!inMap(c, r)) return;
    const i = idx(c, r);
    const wasWater = tiles[i] === T.WATER || (r >= RIVER.r0 - 1 && r <= RIVER.r1 + 1 && dist[i] === 4);
    tiles[i] = (r >= RIVER.r0 && r <= RIVER.r1) || wasWater ? T.BRIDGE : T.ROAD;
    roadAxis[i] |= axis;
  };
  for (const h of H_ROADS) for (let r = h.r; r < h.r + h.w; r++) for (let c = h.c0; c <= h.c1; c++) paintRoad(c, r, 1);
  for (const v of V_ROADS) for (let c = v.c; c < v.c + v.w; c++) for (let r = v.r0; r <= v.r1; r++) paintRoad(c, r, 2);

  // ドライブウェイ
  for (let k = 0; k < DRIVEWAY.length - 1; k++) {
    const [c0, r0] = DRIVEWAY[k], [c1, r1] = DRIVEWAY[k + 1];
    const n = Math.ceil(Math.hypot(c1 - c0, r1 - r0) * 3);
    for (let s = 0; s <= n; s++) {
      const c = c0 + (c1 - c0) * s / n, r = r0 + (r1 - r0) * s / n;
      for (let dc = -0.9; dc <= 0.9; dc += 0.9) for (let dr = -0.9; dr <= 0.9; dr += 0.9) {
        const cc = Math.round(c + dc), rr = Math.round(r + dr);
        if (inMap(cc, rr) && tiles[idx(cc, rr)] !== T.ROAD) { tiles[idx(cc, rr)] = T.ROAD; roadAxis[idx(cc, rr)] = 0; }
      }
    }
  }

  // 歩道（田園・山以外で道路に接するタイル）
  const isRoadT = (t) => t === T.ROAD || t === T.BRIDGE;
  for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
    const i = idx(c, r), t = tiles[i], d = dist[i];
    if (isRoadT(t) || t === T.RAIL || d === 6 || d === 3) continue;
    let near = false;
    for (let dr = -1; dr <= 1 && !near; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (inMap(c + dc, r + dr) && isRoadT(tiles[idx(c + dc, r + dr)]) && roadAxis[idx(c + dc, r + dr)]) { near = true; break; }
    }
    if (near) tiles[i] = t === T.WATER ? T.BRIDGEWALK : T.WALK;
  }

  // 交通グラフ
  const graph = buildGraph();
  // 横断歩道：交差点の各腕の1タイル外側
  graph.nodes.forEach((n, ni) => {
    if (!n.inter) return;
    const { hc0, hc1, vr0, vr1 } = n.box; // 交差点の四角（タイル）
    // 北と南の腕（縦の道路を東西に横切る）
    for (const rr of [vr0 - 1, vr1 + 1]) for (let c = hc0; c <= hc1; c++) {
      if (inMap(c, rr) && isRoadT(tiles[idx(c, rr)]) && (roadAxis[idx(c, rr)] & 2)) { cw[idx(c, rr)] = ni; cwAxis[idx(c, rr)] = 2; }
    }
    for (const cc of [hc0 - 1, hc1 + 1]) for (let r = vr0; r <= vr1; r++) {
      if (inMap(cc, r) && isRoadT(tiles[idx(cc, r)]) && (roadAxis[idx(cc, r)] & 1)) { cw[idx(cc, r)] = ni; cwAxis[idx(cc, r)] = 1; }
    }
  });

  // 駅前広場・駅・城などのランドマーク
  const lm = {};
  const fillRect = (c0, r0, c1, r1, t) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (inMap(c, r)) tiles[idx(c, r)] = t; };
  fillRect(56, 79, 77, 86, T.PLAZA);
  lm.statue = { x: 66.5 * TILE, z: 82.5 * TILE };
  lm.taxi = { x: 74 * TILE, z: 80 * TILE };
  fillRect(56, 88, 77, 94, T.LOT); // 駅舎
  lm.station = { c0: 56, r0: 88, c1: 77, r1: 94, x: 67 * TILE, z: 87.5 * TILE };
  for (let r = 88; r <= 94; r++) for (let c = 56; c <= 77; c++) bh[idx(c, r)] = 14;
  // 山頂の城
  lm.castle = { x: (MOUNTAIN.c + 0.5) * TILE, z: (MOUNTAIN.r + 0.5) * TILE };
  for (let r = MOUNTAIN.r - 1; r <= MOUNTAIN.r + 1; r++) for (let c = MOUNTAIN.c - 1; c <= MOUNTAIN.c + 1; c++) { bh[idx(c, r)] = HEIGHTS.mountainPeak + 14; tiles[idx(c, r)] = T.LOT; }
  // 公園の博物館とロープウェイ駅
  lm.ropewayBase = { x: 103.5 * TILE, z: 47.5 * TILE };
  lm.ropewayTop = { x: (MOUNTAIN.c - 1.5) * TILE, z: (MOUNTAIN.r + 2.5) * TILE };
  lm.park = { x: 103 * TILE, z: 52 * TILE };

  // 区画（建物ブロック）
  const buildings = [];
  const used = new Uint8Array(N);
  const buildable = (c, r) => {
    if (!inMap(c, r)) return false;
    const i = idx(c, r), t = tiles[i], d = dist[i];
    if (used[i]) return false;
    if (t === T.LOT) return false;
    return t === T.GRASS && (d === 0 || d === 1 || d === 2 || d === 5 || d === 8);
  };
  const styleFor = (d) => d === 0 ? 'office' : d === 1 ? 'tower' : d === 2 ? 'shop' : d === 5 ? 'house' : 'house';
  for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
    if (!buildable(c, r)) continue;
    const d = dist[idx(c, r)];
    const maxW = d === 5 || d === 8 ? 3 : d === 2 ? 3 : 5;
    let w = 1 + Math.floor(rng() * maxW), hgt = 1 + Math.floor(rng() * maxW);
    // 伸ばせる範囲まで縮める
    let ww = 0; while (ww < w && buildable(c + ww, r)) ww++;
    let hh = 0;
    outer: while (hh < hgt) { for (let k = 0; k < ww; k++) if (!buildable(c + k, r + hh)) break outer; hh++; }
    if (ww === 0 || hh === 0) continue;
    // 住宅地は庭を残す
    if ((d === 5 || d === 8) && rng() < 0.35) { for (let k = 0; k < ww; k++) for (let j = 0; j < hh; j++) used[idx(c + k, r + j)] = 1; continue; }
    const style = styleFor(d);
    let height;
    if (style === 'office') height = 10 + rng() * rng() * 46;
    else if (style === 'tower') height = 14 + rng() * 44;
    else if (style === 'shop') height = 7 + rng() * 7;
    else height = 5.5 + rng() * 2.5;
    // 金華山の麓は低め
    const dm = Math.hypot(c - MOUNTAIN.c, r - MOUNTAIN.r);
    if (dm < MOUNTAIN.radius + 6) height = Math.min(height, 9);
    for (let k = 0; k < ww; k++) for (let j = 0; j < hh; j++) { used[idx(c + k, r + j)] = 1; tiles[idx(c + k, r + j)] = T.BLDG; bh[idx(c + k, r + j)] = height; }
    buildings.push({ c0: c, r0: r, c1: c + ww - 1, r1: r + hh - 1, h: height, style, d, hue: rng() });
  }
  // 柳ケ瀬のアーケード（縦道路58と66の間の東西の歩道を屋根付きに）
  for (let c = 60; c <= 65; c++) for (let r = 50; r <= 57; r++) if (tiles[idx(c, r)] === T.BLDG && (c === 62 || c === 63)) {
    tiles[idx(c, r)] = T.ARCADE; bh[idx(c, r)] = 0;
  }

  // 施設（建物の前の歩道に入口）
  const placeShop = (name, label, c, r) => {
    // (c,r) 付近の歩道タイルを探す
    for (let rad = 0; rad < 8; rad++) for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
      const cc = c + dc, rr = r + dr;
      if (inMap(cc, rr) && tiles[idx(cc, rr)] === T.WALK) {
        lm[name] = { x: (cc + 0.5) * TILE, z: (rr + 0.5) * TILE, label };
        return;
      }
    }
  };
  placeShop('gunshop', 'ガンショップ', 72, 30);
  placeShop('police', '警察署', 45, 58);
  placeShop('hospital', '病院', 92, 66);
  placeShop('clothes', '服屋', 62, 46);
  placeShop('conbini', 'コンビニ', 84, 44);
  placeShop('conbini2', 'コンビニ', 44, 71);
  placeShop('bank', '銀行', 56, 27);
  placeShop('paint', '塗装工房', 94, 71);
  placeShop('gas', 'ガソリンスタンド', 30, 64);
  placeShop('gas2', 'ガソリンスタンド', 112, 70);
  placeShop('home', '自宅（セーフハウス）', 70, 6);
  placeShop('garage', 'ガレージ', 60, 6);
  placeShop('ryokan', '旅館', 82, 7);
  placeShop('florist', '花屋', 70, 54);
  placeShop('farm', '農家', 24, 58);
  placeShop('museum', '博物館', 100, 56);
  if (!lm.farm) lm.farm = { x: 24 * TILE, z: 58 * TILE, label: '農家' };
  lm.gasStations = [lm.gas, lm.gas2].filter(Boolean);
  lm.conbinis = [lm.conbini, lm.conbini2].filter(Boolean);

  return { tiles, dist, bh, cw, cwAxis, roadAxis, buildings, graph, lm, w: MAP_W, h: MAP_H };
}

// 交差点と道路区間からなる交通グラフ
export function buildGraph() {
  const nodes = []; const edges = [];
  const key = new Map();
  const addNode = (x, z, info) => {
    const k = Math.round(x) + ',' + Math.round(z);
    if (key.has(k)) { const n = nodes[key.get(k)]; Object.assign(n, info, { inter: n.inter || info.inter }); return key.get(k); }
    nodes.push({ x, z, edges: [], ...info });
    key.set(k, nodes.length - 1);
    return nodes.length - 1;
  };
  const crosses = (h, v) => v.r0 <= h.r && v.r1 >= h.r + h.w - 1 && h.c0 <= v.c && h.c1 >= v.c + v.w - 1;
  const hNodes = H_ROADS.map(() => []), vNodes = V_ROADS.map(() => []);
  H_ROADS.forEach((h, hi) => V_ROADS.forEach((v, vi) => {
    if (!crosses(h, v)) return;
    const x = (v.c + v.w / 2) * TILE, z = (h.r + h.w / 2) * TILE;
    const n = addNode(x, z, { inter: true, hw: v.w * TILE / 2, hh: h.w * TILE / 2, box: { hc0: v.c, hc1: v.c + v.w - 1, vr0: h.r, vr1: h.r + h.w - 1 } });
    hNodes[hi].push(n); vNodes[vi].push(n);
  }));
  H_ROADS.forEach((h, hi) => {
    const z = (h.r + h.w / 2) * TILE;
    const list = hNodes[hi].slice().sort((a, b) => nodes[a].x - nodes[b].x);
    const xs0 = h.c0 * TILE + 2, xs1 = (h.c1 + 1) * TILE - 2;
    if (!list.length || nodes[list[0]].x - xs0 > 10) list.unshift(addNode(xs0, z, { inter: false, hw: 2, hh: h.w * TILE / 2 }));
    if (nodes[list[list.length - 1]].x < xs1 - 10) list.push(addNode(xs1, z, { inter: false, hw: 2, hh: h.w * TILE / 2 }));
    for (let k = 0; k < list.length - 1; k++) addEdge(list[k], list[k + 1], 'h', h.w / 2);
  });
  V_ROADS.forEach((v, vi) => {
    const x = (v.c + v.w / 2) * TILE;
    const list = vNodes[vi].slice().sort((a, b) => nodes[a].z - nodes[b].z);
    const zs0 = v.r0 * TILE + 2, zs1 = (v.r1 + 1) * TILE - 2;
    if (!list.length || nodes[list[0]].z - zs0 > 10) list.unshift(addNode(x, zs0, { inter: false, hw: v.w * TILE / 2, hh: 2 }));
    if (nodes[list[list.length - 1]].z < zs1 - 10) list.push(addNode(x, zs1, { inter: false, hw: v.w * TILE / 2, hh: 2 }));
    for (let k = 0; k < list.length - 1; k++) addEdge(list[k], list[k + 1], 'v', v.w / 2);
  });
  function addEdge(a, b, axis, lanes) {
    const A = nodes[a], B = nodes[b];
    const len = Math.hypot(B.x - A.x, B.z - A.z);
    const e = { a, b, axis, lanes, len, dx: (B.x - A.x) / len, dz: (B.z - A.z) / len };
    edges.push(e);
    A.edges.push(edges.length - 1); B.edges.push(edges.length - 1);
  }
  nodes.forEach((n, i) => { n.signal = n.inter && n.edges.length >= 3; n.offset = (i * 7) % 30; });
  return { nodes, edges };
}

// 信号：axis('h'|'v') の車が進めるか。t=秒
export function signalState(node, axis, t, cfg = { cycle: 30, green: 12, yellow: 3 }) {
  if (!node.signal) return 'green';
  const p = ((t + node.offset) % cfg.cycle + cfg.cycle) % cfg.cycle;
  const half = cfg.cycle / 2;
  const local = axis === 'h' ? p : (p + half) % cfg.cycle;
  if (local < cfg.green) return 'green';
  if (local < cfg.green + cfg.yellow) return 'yellow';
  return 'red';
}

export function tileAt(world, x, z) {
  const c = Math.floor(x / TILE), r = Math.floor(z / TILE);
  if (!inMap(c, r)) return -1;
  return world.tiles[idx(c, r)];
}
export function districtAt(world, x, z) {
  const c = Math.floor(x / TILE), r = Math.floor(z / TILE);
  if (!inMap(c, r)) return DISTRICTS[6];
  return DISTRICTS[world.dist[idx(c, r)]];
}
// 建物などの固体判定。y を渡すと高さも考慮
export function solidAt(world, x, z, y = 0) {
  const c = Math.floor(x / TILE), r = Math.floor(z / TILE);
  if (!inMap(c, r)) return true;
  const i = idx(c, r);
  const h = world.bh[i];
  return h > 0 && y < h;
}
export function isWalkable(world, c, r) {
  if (!inMap(c, r)) return false;
  const t = world.tiles[idx(c, r)];
  return t === T.WALK || t === T.PLAZA || t === T.PARK || t === T.BRIDGEWALK || t === T.ARCADE || world.cw[idx(c, r)] >= 0;
}
export function nearestNode(graph, x, z) {
  let best = -1, bd = 1e18;
  graph.nodes.forEach((n, i) => { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = i; } });
  return best;
}
// A*（交差点グラフ）
export function findPath(graph, from, to) {
  if (from === to) return [from];
  const N = graph.nodes.length;
  const g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const open = [from]; g[from] = 0;
  const h = (i) => Math.hypot(graph.nodes[i].x - graph.nodes[to].x, graph.nodes[i].z - graph.nodes[to].z);
  while (open.length) {
    let bi = 0; for (let k = 1; k < open.length; k++) if (g[open[k]] + h(open[k]) < g[open[bi]] + h(open[bi])) bi = k;
    const cur = open.splice(bi, 1)[0];
    if (cur === to) break;
    closed[cur] = 1;
    for (const ei of graph.nodes[cur].edges) {
      const e = graph.edges[ei]; const nb = e.a === cur ? e.b : e.a;
      if (closed[nb]) continue;
      const ng = g[cur] + e.len;
      if (ng < g[nb]) { g[nb] = ng; came[nb] = cur; if (!open.includes(nb)) open.push(nb); }
    }
  }
  if (came[to] < 0) return null;
  const path = [to]; let c = to; while (c !== from) { c = came[c]; path.push(c); }
  return path.reverse();
}
