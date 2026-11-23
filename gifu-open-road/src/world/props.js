// 木・街灯・信号機・ロープウェイ（インスタンス描画）
/* global THREE */
import { TILE, MAP_W, MAP_H, TRAFFIC } from '../core/config.js';
import { T, idx, inMap, signalState } from './mapgen.js';
import { groundH } from './terrain.js';
import { mulberry32 } from '../core/rng.js';

export function buildProps(world, scene, quality) {
  const rng = mulberry32(99);
  const trees = [];
  for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
    const t = world.tiles[idx(c, r)];
    let p = 0;
    if (t === T.FOREST) p = 0.85; else if (t === T.PARK) p = 0.22; else if (t === T.GRASS && world.dist[idx(c, r)] === 6) p = 0.05;
    else if (t === T.WALK && world.dist[idx(c, r)] === 0 && (c + r) % 5 === 0) p = 0.5;
    p *= quality.treeDensity;
    const n = t === T.FOREST ? 2 : 1;
    for (let k = 0; k < n; k++) if (rng() < p) {
      const x = c * TILE + 0.6 + rng() * 2.8, z = r * TILE + 0.6 + rng() * 2.8;
      trees.push({ x, z, y: groundH(x, z), s: 0.7 + rng() * 0.8, conifer: t === T.FOREST ? rng() < 0.55 : rng() < 0.2, hue: rng() });
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 2.2, 5).translate(0, 1.1, 0);
  const leafGeo = new THREE.IcosahedronGeometry(1.5, 0).translate(0, 3.2, 0);
  const coneGeo = new THREE.ConeGeometry(1.4, 4.2, 6).translate(0, 3.6, 0);
  const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x5a4030 }), trees.length);
  const broad = trees.filter(t => !t.conifer), con = trees.filter(t => t.conifer);
  const leaf = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, broad.length));
  const cone = new THREE.InstancedMesh(coneGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, con.length));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  trees.forEach((t, i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.hue * 6); s.setScalar(t.s); p.set(t.x, t.y, t.z); m.compose(p, q, s); trunk.setMatrixAt(i, m); });
  broad.forEach((t, i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.hue * 6); s.set(t.s, t.s * (0.9 + t.hue * 0.3), t.s); p.set(t.x, t.y, t.z); m.compose(p, q, s); leaf.setMatrixAt(i, m); leaf.setColorAt(i, col.setHSL(0.24 + t.hue * 0.08, 0.45, 0.3 + t.hue * 0.12)); });
  con.forEach((t, i) => { q.identity(); s.setScalar(t.s); p.set(t.x, t.y, t.z); m.compose(p, q, s); cone.setMatrixAt(i, m); cone.setColorAt(i, col.setHSL(0.3 + t.hue * 0.05, 0.4, 0.2 + t.hue * 0.08)); });
  leaf.count = broad.length; cone.count = con.length;
  for (const im of [trunk, leaf, cone]) { im.castShadow = !!quality.shadow; scene.add(im); }

  // 街灯
  const lamps = [];
  for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
    const t = world.tiles[idx(c, r)];
    if ((t === T.WALK || t === T.BRIDGEWALK) && (c * 3 + r * 5) % 7 === 0) {
      // 道路側に寄せる
      let ox = 0, oz = 0;
      if (inMap(c + 1, r) && world.tiles[idx(c + 1, r)] === T.ROAD) ox = 1.6; else if (inMap(c - 1, r) && world.tiles[idx(c - 1, r)] === T.ROAD) ox = -1.6;
      if (inMap(c, r + 1) && world.tiles[idx(c, r + 1)] === T.ROAD) oz = 1.6; else if (inMap(c, r - 1) && world.tiles[idx(c, r - 1)] === T.ROAD) oz = -1.6;
      if (!ox && !oz) continue;
      const x = c * TILE + 2 + ox, z = r * TILE + 2 + oz;
      lamps.push({ x, z, y: t === T.BRIDGEWALK ? 0.5 : groundH(x, z), ox, oz });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 5.5, 5).translate(0, 2.75, 0);
  const headGeo = new THREE.BoxGeometry(0.5, 0.18, 0.9).translate(0, 5.5, 0);
  const pole = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x6a6e74 }), lamps.length);
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xdddddd, emissive: 0xffe2a8, emissiveIntensity: 0 });
  const head = new THREE.InstancedMesh(headGeo, lampMat, lamps.length);
  lamps.forEach((l, i) => { m.makeTranslation(l.x, l.y, l.z); pole.setMatrixAt(i, m); m.makeRotationY(l.ox ? Math.PI / 2 : 0); m.setPosition(l.x, l.y, l.z); head.setMatrixAt(i, m); });
  scene.add(pole); scene.add(head);

  // 信号機
  const sig = [];
  world.graph.nodes.forEach((n, ni) => {
    if (!n.signal) return;
    const dx = n.hw + 1.2, dz = n.hh + 1.2;
    // 角の4本：東西に向く信号(h)と南北に向く信号(v)
    sig.push({ x: n.x - dx, z: n.z - dz, ni, axis: 'v' }, { x: n.x + dx, z: n.z + dz, ni, axis: 'v' });
    sig.push({ x: n.x + dx, z: n.z - dz, ni, axis: 'h' }, { x: n.x - dx, z: n.z + dz, ni, axis: 'h' });
  });
  const spole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.08, 4.2, 5).translate(0, 2.1, 0), new THREE.MeshLambertMaterial({ color: 0x55585c }), sig.length);
  const sbox = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.5, 0.5).translate(0, 4.3, 0), new THREE.MeshLambertMaterial({ color: 0x222222 }), sig.length);
  const slamp = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 6, 4).translate(0, 4.3, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), sig.length * 2);
  sig.forEach((s0, i) => {
    m.makeTranslation(s0.x, groundH(s0.x, s0.z), s0.z); spole.setMatrixAt(i, m); sbox.setMatrixAt(i, m);
    // ランプは道路側の2面
    const n = world.graph.nodes[s0.ni];
    const fx = Math.sign(n.x - s0.x) * 0.27, fz = Math.sign(n.z - s0.z) * 0.27;
    if (s0.axis === 'h') { m.makeTranslation(s0.x + fx, groundH(s0.x, s0.z), s0.z); slamp.setMatrixAt(i * 2, m); m.makeTranslation(s0.x - fx, groundH(s0.x, s0.z), s0.z); slamp.setMatrixAt(i * 2 + 1, m); }
    else { m.makeTranslation(s0.x, groundH(s0.x, s0.z), s0.z + fz); slamp.setMatrixAt(i * 2, m); m.makeTranslation(s0.x, groundH(s0.x, s0.z), s0.z - fz); slamp.setMatrixAt(i * 2 + 1, m); }
    slamp.setColorAt(i * 2, col.set(0x33ff66)); slamp.setColorAt(i * 2 + 1, col.set(0x33ff66));
  });
  scene.add(spole); scene.add(sbox); scene.add(slamp);
  const COLS = { green: new THREE.Color(0x2bff7a), yellow: new THREE.Color(0xffd21a), red: new THREE.Color(0xff3020) };
  // 歩行者用（車と逆）
  function updateSignals(t) {
    sig.forEach((s0, i) => {
      const n = world.graph.nodes[s0.ni];
      const st = signalState(n, s0.axis, t, TRAFFIC);
      slamp.setColorAt(i * 2, COLS[st]); slamp.setColorAt(i * 2 + 1, COLS[st]);
    });
    slamp.instanceColor.needsUpdate = true;
  }

  // ロープウェイ
  const ropeway = buildRopeway(world, scene);

  return { lampMat, updateSignals, ropeway, treeCount: trees.length };
}

function buildRopeway(world, scene) {
  const a = world.lm.ropewayBase, b = world.lm.ropewayTop;
  const ya = groundH(a.x, a.z) + 9, yb = groundH(b.x, b.z) + 7;
  const pts = [new THREE.Vector3(a.x, ya, a.z), new THREE.Vector3(b.x, yb, b.z)];
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x333333 }));
  scene.add(line);
  const towerMat = new THREE.MeshLambertMaterial({ color: 0x8a8f96 });
  for (const t of [0, 0.33, 0.66, 1]) {
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    const top = ya + (yb - ya) * t, g = groundH(x, z);
    const h = Math.max(2, top - g + 0.6);
    const tw = new THREE.Mesh(new THREE.BoxGeometry(0.8, h, 0.8), towerMat);
    tw.position.set(x, g + h / 2, z); scene.add(tw);
  }
  for (const p of [a, b]) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), new THREE.MeshLambertMaterial({ color: 0xc9c2b2 }));
    st.position.set(p.x, groundH(p.x, p.z) + 2, p.z); scene.add(st);
  }
  const gondola = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.6), new THREE.MeshLambertMaterial({ color: 0xd23a2a }));
  scene.add(gondola);
  const len = Math.hypot(b.x - a.x, yb - ya, b.z - a.z);
  const state = { t: 0, dir: 1, riding: false, duration: 60 };
  function update(dt) {
    state.t += dt / state.duration * state.dir;
    if (state.t >= 1) { state.t = 1; state.dir = -1; state.arrived = 'top'; }
    else if (state.t <= 0) { state.t = 0; state.dir = 1; state.arrived = 'base'; }
    else state.arrived = null;
    const t = state.t;
    gondola.position.set(a.x + (b.x - a.x) * t, ya + (yb - ya) * t - 2.4, a.z + (b.z - a.z) * t);
    gondola.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
  }
  update(0);
  return { state, update, gondola, a, b, len };
}
