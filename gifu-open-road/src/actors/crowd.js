// 歩行者の生成・消滅・行動状態機械・描画（部位ごとのInstancedMesh）
/* global THREE */
import { TILE, PED } from '../core/config.js';
import { T, idx, inMap, isWalkable, signalState, solidAt } from '../world/mapgen.js';
import { sampleH, isWater } from '../world/terrain.js';
import { newPose, pose, advancePhase } from './pedAnim.js';
import { GeoBuilder, hex } from '../fx/geom.js';
import { emit, on } from '../core/events.js';
import { TRAFFIC } from '../core/config.js';

const SKIN = [0xf1c9a5, 0xe0b08a, 0xc99470, 0xa8775a, 0xf5d6bc];
const HAIR = [0x1b1a1a, 0x2a211c, 0x3b2a20, 0x6a4a30, 0x8a8a8a, 0xc9c2b8, 0x5a3020];
const OUTFITS = [
  { id: 'suit', top: [0x2a2f3a, 0x3a3d44, 0x22262e], bottom: [0x23262d, 0x2e3138], sleeve: 'long', w: 3 },
  { id: 'casual', top: [0xd94a3a, 0x3a7ad9, 0xf2d24a, 0x4ab07a, 0xf2f2f2, 0x8a5ad0, 0xf08a3a], bottom: [0x2c3e66, 0x3a3a3a, 0x9a8a6a, 0x5a6a7a], sleeve: 'short', w: 5 },
  { id: 'student', top: [0xf4f4f4, 0x1f2d4a], bottom: [0x1a1d26, 0x2a3350], sleeve: 'long', w: 2 },
  { id: 'tourist', top: [0xff7aa0, 0x7ad0ff, 0xb0e070, 0xffffff], bottom: [0xd8c8a0, 0x6a7a8a], sleeve: 'short', w: 2, bag: true },
  { id: 'kimono', top: [0x5a6aa8, 0xa05a7a, 0x3a7a6a, 0xd0a060], bottom: null, sleeve: 'long', w: 1 },
  { id: 'jogger', top: [0x30d0a0, 0xff5a5a, 0x5a8aff], bottom: [0x222222], sleeve: 'short', w: 1 },
];
export const POLICE_OUTFIT = { top: 0x1f3460, bottom: 0x1a2440, hair: 0x1b1a1a, skin: 0xe0b08a, cap: 0x1a2440 };

function partGeos() {
  const g = {};
  g.hips = new THREE.BoxGeometry(0.32, 0.2, 0.2).translate(0, -0.02, 0);
  g.torso = new THREE.BoxGeometry(0.36, 0.5, 0.21).translate(0, 0.25, 0);
  g.head = new THREE.BoxGeometry(0.19, 0.23, 0.21).translate(0, 0.14, 0);
  g.hair = new THREE.BoxGeometry(0.21, 0.08, 0.23).translate(0, 0.27, -0.01);
  g.uarm = new THREE.BoxGeometry(0.09, 0.3, 0.1).translate(0, -0.15, 0);
  g.farm = new THREE.BoxGeometry(0.08, 0.28, 0.09).translate(0, -0.14, 0);
  g.thigh = new THREE.BoxGeometry(0.13, 0.45, 0.14).translate(0, -0.225, 0);
  const sb = new GeoBuilder();
  sb.box(0, -0.23, 0, 0.11, 0.46, 0.12, [1, 1, 1]);
  sb.box(0, -0.43, 0.06, 0.11, 0.06, 0.24, [0.25, 0.25, 0.25]);
  g.shin = sb.build();
  g.prop = new THREE.BoxGeometry(1, 1, 1);
  g.umb = new THREE.ConeGeometry(0.55, 0.3, 8).translate(0, 0, 0);
  return g;
}

export function createCrowd(ctx) {
  const { world, scene } = ctx;
  const CAP = ctx.quality.peds + 30;
  const G = partGeos();
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const shinMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
  const mk = (geo, n, m = mat) => { const im = new THREE.InstancedMesh(geo, m, n); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; scene.add(im); im.castShadow = false; return im; };
  const M = { hips: mk(G.hips, CAP), torso: mk(G.torso, CAP), head: mk(G.head, CAP), hair: mk(G.hair, CAP), uarm: mk(G.uarm, CAP * 2), farm: mk(G.farm, CAP * 2), thigh: mk(G.thigh, CAP * 2), shin: mk(G.shin, CAP * 2, shinMat), prop: mk(G.prop, CAP), umb: mk(G.umb, CAP) };
  const col = new THREE.Color();
  for (const k in M) for (let i = 0; i < M[k].count; i++) M[k].setColorAt(i, col.set(0xffffff));

  const agents = [];
  const slots = []; for (let i = CAP - 1; i >= 0; i--) slots.push(i);
  const walkTiles = [];
  for (let r = 0; r < world.h; r++) for (let c = 0; c < world.w; c++) {
    const t = world.tiles[idx(c, r)];
    if (t === T.WALK || t === T.PLAZA || t === T.ARCADE || t === T.BRIDGEWALK || t === T.PARK) walkTiles.push([c, r, t]);
  }

  function setColors(a) {
    const i = a.slot;
    M.hips.setColorAt(i, col.set(a.cBottom)); M.torso.setColorAt(i, col.set(a.cTop));
    M.head.setColorAt(i, col.set(a.cSkin)); M.hair.setColorAt(i, col.set(a.cHair));
    for (let k = 0; k < 2; k++) {
      M.uarm.setColorAt(i * 2 + k, col.set(a.cTop)); M.farm.setColorAt(i * 2 + k, col.set(a.sleeve === 'long' ? a.cTop : a.cSkin));
      M.thigh.setColorAt(i * 2 + k, col.set(a.cBottom)); M.shin.setColorAt(i * 2 + k, col.set(a.cBottom));
    }
    M.umb.setColorAt(i, col.set(a.cUmb));
    for (const k in M) if (M[k].instanceColor) M[k].instanceColor.needsUpdate = true;
  }

  function makeAgent(x, z, opts = {}) {
    if (!slots.length) return null;
    const slot = slots.pop();
    const outfit = opts.outfit || pickOutfit(x, z);
    const pickc = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const top = pickc(outfit.top);
    const a = {
      slot, x, z, y: sampleH(world, x, z), heading: Math.random() * 6.28, speed: 0, vx: 0, vz: 0, phase: Math.random() * 6, look: 0,
      role: opts.role || 'civ', ctrl: opts.ctrl || 'ai', state: 'walk', stateT: 0, actT: 0, hp: opts.hp || 100, alive: true, hidden: false,
      scale: opts.scale || (0.89 + Math.random() * 0.19), wide: opts.wide || (0.9 + Math.random() * 0.25),
      cTop: opts.cTop ?? top, cBottom: opts.cBottom ?? (outfit.bottom ? pickc(outfit.bottom) : top), cSkin: opts.cSkin ?? pickc(SKIN), cHair: opts.cHair ?? pickc(HAIR),
      cUmb: pickc([0x2a2a2a, 0x3a5aa0, 0xd04a4a, 0xf2f2f2, 0x6ab06a]), sleeve: outfit.sleeve, outfit: outfit.id, bag: !!outfit.bag,
      tc: -1, tr: -1, prevC: -1, prevR: -1, lane: (Math.random() - 0.5) * 1.4,
      brave: Math.random(), curious: Math.random(), civic: Math.random(), baseSpeed: outfit.id === 'jogger' ? 3.2 : PED.walkSpeed * (0.85 + Math.random() * 0.3),
      threat: null, fleeX: 0, fleeZ: 0, callCrime: null, kn: null, fadeT: 0, lod: 0, p: newPose(), leader: null, propKind: 0, weaponProp: 0,
    };
    a.speedTarget = a.baseSpeed;
    agents.push(a); setColors(a);
    return a;
  }
  function pickOutfit(x, z) {
    const d = world.dist[idx(Math.floor(x / TILE), Math.floor(z / TILE))] ?? 0;
    const h = ctx.hour ? ctx.hour() : 12;
    const w = OUTFITS.map(o => {
      let k = o.w;
      if (o.id === 'suit') k *= (h > 7 && h < 10) || (h > 17 && h < 20) ? 2.5 : d === 0 ? 1.2 : 0.4;
      if (o.id === 'student') k *= h > 7 && h < 17 ? 1.5 : 0.3;
      if (o.id === 'tourist') k *= d === 1 || d === 7 || d === 4 ? 3 : 0.6;
      if (o.id === 'kimono') k *= d === 5 || d === 4 || d === 2 ? 2.5 : 0.3;
      if (o.id === 'jogger') k *= d === 7 || d === 4 ? 3 : 0.3;
      return k;
    });
    let r = Math.random() * w.reduce((s, v) => s + v, 0);
    for (let k = 0; k < OUTFITS.length; k++) { r -= w[k]; if (r <= 0) return OUTFITS[k]; }
    return OUTFITS[1];
  }
  function remove(a) {
    const i = agents.indexOf(a); if (i < 0) return;
    agents.splice(i, 1); slots.push(a.slot); hideSlot(a.slot);
    for (const o of agents) if (o.leader === a) o.leader = null;
  }
  const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
  function hideSlot(i) {
    for (const k of ['hips', 'torso', 'head', 'hair', 'prop', 'umb']) M[k].setMatrixAt(i, _zero);
    for (const k of ['uarm', 'farm', 'thigh', 'shin']) { M[k].setMatrixAt(i * 2, _zero); M[k].setMatrixAt(i * 2 + 1, _zero); }
  }
  for (let i = 0; i < CAP; i++) hideSlot(i);

  // 空間ハッシュ
  const CELL = 6, grid = new Map();
  function rebuildGrid() {
    grid.clear();
    for (const a of agents) { if (a.hidden) continue; const k = Math.floor(a.x / CELL) * 1000 + Math.floor(a.z / CELL); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(a); }
  }
  function query(x, z, r, out = []) {
    out.length = 0;
    const c0 = Math.floor((x - r) / CELL), c1 = Math.floor((x + r) / CELL), r0 = Math.floor((z - r) / CELL), r1 = Math.floor((z + r) / CELL);
    for (let c = c0; c <= c1; c++) for (let rr = r0; rr <= r1; rr++) { const l = grid.get(c * 1000 + rr); if (l) for (const a of l) if ((a.x - x) ** 2 + (a.z - z) ** 2 < r * r) out.push(a); }
    return out;
  }
  const _q = [];
  // 交通AI用：前方の歩行者までの距離
  function pedsAhead(x, z, fx, fz, range, lat) {
    let best = 99;
    for (const a of query(x + fx * range / 2, z + fz * range / 2, range / 2 + 2, _q)) {
      if (!a.alive && a.state !== 'down') continue;
      if (a.hidden) continue;
      const rx = a.x - x, rz = a.z - z; const ahead = rx * fx + rz * fz;
      if (ahead <= 0 || ahead > range) continue;
      if (Math.abs(rx * fz - rz * fx) < lat) best = Math.min(best, ahead);
    }
    return best;
  }

  function spawnCiv(px, pz, camDir) {
    const n = walkTiles.length;
    for (let k = 0; k < 10; k++) {
      const [c, r, t] = walkTiles[Math.floor(Math.random() * n)];
      const x = c * TILE + 1 + Math.random() * 2, z = r * TILE + 1 + Math.random() * 2;
      const d = Math.hypot(x - px, z - pz);
      if (d < PED.spawnMin || d > PED.spawnMax) continue;
      // 画面内の近くには出さない
      if (camDir && d < 70 && ((x - px) * camDir[0] + (z - pz) * camDir[1]) / d > 0.3) continue;
      // 夜は柳ケ瀬に人が集まる
      const night = ctx.night ? ctx.night() : 0;
      if (night > 0.5 && world.dist[idx(c, r)] !== 2 && Math.random() < 0.4) continue;
      const a = makeAgent(x, z);
      if (!a) return;
      a.tc = c; a.tr = r;
      // 2〜4人のグループ
      if (Math.random() < 0.22 && slots.length > 3) {
        const m = 1 + Math.floor(Math.random() * 2);
        for (let j = 0; j < m; j++) { const f = makeAgent(x + (j + 1) * 0.7, z + 0.4); if (f) { f.leader = a; f.lane = a.lane + (j + 1) * 0.65; f.baseSpeed = a.baseSpeed; f.outfit = a.outfit; } }
      }
      return a;
    }
  }

  function walkStep(a) {
    // 次のタイル（直進を優先、戻らない）
    const c = a.tc, r = a.tr;
    const opts = [];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (!isWalkable(world, nc, nr)) continue;
      if (nc === a.prevC && nr === a.prevR) continue;
      const straight = a.prevC >= 0 && (c - a.prevC) === dc && (r - a.prevR) === dr;
      opts.push([nc, nr, straight ? 4 : 1]);
    }
    if (!opts.length) { const t = [a.prevC, a.prevR]; a.prevC = c; a.prevR = r; a.tc = t[0] >= 0 ? t[0] : c; a.tr = t[1] >= 0 ? t[1] : r; return; }
    let rr = Math.random() * opts.reduce((s, o) => s + o[2], 0), pick = opts[0];
    for (const o of opts) { rr -= o[2]; if (rr <= 0) { pick = o; break; } }
    a.prevC = c; a.prevR = r; a.tc = pick[0]; a.tr = pick[1];
  }

  function setState(a, s, dur = 0) { a.state = s; a.stateT = dur; a.actT = 0; }

  function react(a, ev) {
    if (a.ctrl !== 'ai' || !a.alive || a.state === 'knocked' || a.state === 'down') return;
    const d = Math.hypot(a.x - ev.x, a.z - ev.z);
    a.fleeX = ev.x; a.fleeZ = ev.z;
    if (ev.kind === 'gun' || ev.kind === 'explosion') {
      a.leader = null;
      // 犯人が見えた人だけが通報・撮影する（音だけの人は逃げる）
      if (ev.crime && ev.seen && a.civic > 0.45 && a.state !== 'call' && Math.random() < 0.6) { setState(a, 'call', PED.reportDelay); a.callCrime = ev.crime; return; }
      if (ev.crime && ev.seen && a.curious > 0.85) { setState(a, 'film', 5); a.callCrime = ev.crime; return; }
      if (d < 18 && Math.random() < 0.5) { setState(a, 'cower', 2 + Math.random() * 2); return; }
      setState(a, 'flee', 8 + Math.random() * 6); return;
    }
    if (ev.kind === 'crime') {
      a.leader = null;
      if (a.brave > 0.92 && ev.melee && d < 12) { setState(a, 'fight', 10); a.threat = ev.attacker; return; }
      if (a.civic > 0.45 && a.state !== 'call') { setState(a, 'call', PED.reportDelay); a.callCrime = ev.crime; return; }
      if (a.curious > 0.75) { setState(a, 'film', 5); a.callCrime = ev.crime; return; }
      setState(a, 'flee', 6 + Math.random() * 6); return;
    }
    if (ev.kind === 'aim') {
      if (d < 9 && ev.direct) { setState(a, 'handsup', 3); return; }
      if (a.state !== 'call' && a.state !== 'flee') { if (a.civic > 0.6) { setState(a, 'call', PED.reportDelay); a.callCrime = ev.crime; } else setState(a, 'flee', 6); }
      return;
    }
    if (ev.kind === 'siren') { if (a.state === 'walk' && a.curious > 0.7) { setState(a, 'idle', 3); a.lookAt = [ev.x, ev.z]; } return; }
    if (ev.kind === 'car') { if (a.state !== 'dodge') { setState(a, 'dodge', 0.6); a.dodgeX = ev.dx; a.dodgeZ = ev.dz; } }
  }

  // 視線が通るか（建物で遮られない）
  function lineOfSight(x0, z0, x1, z1, y = 1.6) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 2);
    for (let k = 1; k < n; k++) { const t = k / n; if (solidAt(world, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, y)) return false; }
    return true;
  }

  // 犯罪を目撃させる（クライム：wanted.js の犯行種別）
  function witness(crime, x, z, opts = {}) {
    const r = opts.radius || PED.seeCrime;
    for (const a of query(x, z, r)) {
      if (a.role !== 'civ' || a.ctrl !== 'ai' || !a.alive || a === opts.victim) continue;
      const d = Math.hypot(a.x - x, a.z - z);
      const seen = d < 60 && lineOfSight(a.x, a.z, x, z);
      if (opts.sound || seen) react(a, { kind: opts.kind || 'crime', x, z, crime, seen, melee: opts.melee, attacker: opts.attacker, direct: opts.direct || opts.directTarget === a });
    }
  }

  function knock(a, vx, vy, vz, dmg, cause) {
    if (a.hidden) return;
    a.hp -= dmg;
    if (a.hp <= 0) a.alive = false;
    a.kn = { vx, vy, vz, spin: (Math.random() - 0.5) * 8, pitch: 0, face: Math.random() < 0.5 ? 1 : -1, t: 0, grounded: false };
    a.leader = null;
    setState(a, 'knocked', 0);
    emit('pedDown', { agent: a, cause });
  }

  function damage(a, dmg, dx, dz, kind, attacker) {
    if (!a.alive && a.state === 'down') return;
    if (kind === 'stun') { a.kn = null; setState(a, 'down', 4); a.stun = true; return; }
    if (kind === 'melee' && a.hp - dmg > 0 && dmg < 35) {
      a.hp -= dmg; setState(a, a.role === 'civ' ? 'flee' : a.state, a.role === 'civ' ? 8 : 0); a.vx += dx * 3; a.vz += dz * 3; a.stagger = 0.4; return;
    }
    const k = kind === 'explosion' ? 8 : kind === 'melee' ? 3.5 : 1.2;
    knock(a, dx * k, kind === 'explosion' ? 6 : 1.5, dz * k, dmg, kind);
  }

  // 車にはねられる判定
  function vehicleHits(cars) {
    for (const c of cars) {
      const p = c.phys; if (c.mode === 'lane' || c.mode === 'parked') continue;
      const sp = Math.hypot(p.vf, p.vl); if (sp < 2.2) continue;
      const sn = Math.sin(p.heading), cs = Math.cos(p.heading);
      const hl = c.spec.len / 2 + 0.3, hw = c.spec.wid / 2 + 0.3;
      for (const a of query(p.x, p.z, hl + 2)) {
        if (a.hidden || a.state === 'knocked' || a.role === 'player' && a.inCar) continue;
        if (a.y > p.y + 2.5) continue;
        const rx = a.x - p.x, rz = a.z - p.z; const f = rx * sn + rz * cs, l = rx * cs - rz * sn;
        if (Math.abs(f) < hl && Math.abs(l) < hw) {
          const vx = p.vf * sn + p.vl * cs, vz = p.vf * cs - p.vl * sn;
          if (a.role === 'player') { if (ctx.onPlayerHitByCar) ctx.onPlayerHitByCar(c, sp); a.x += l >= 0 ? cs * 0.6 : -cs * 0.6; a.z -= l >= 0 ? sn * 0.6 : -sn * 0.6; continue; }
          knock(a, vx * 0.9, 2 + sp * 0.18, vz * 0.9, sp * 7, 'car');
          p.vf *= 0.92;
          emit('pedHitByCar', { agent: a, car: c, speed: sp });
        }
      }
    }
  }

  const tmpThreat = [];
  function updateAI(a, dt, t, ctx2) {
    a.stateT -= dt;
    const px = ctx2.player.x, pz = ctx2.player.z;
    let tx = a.x, tz = a.z, want = 0;
    switch (a.state) {
      case 'walk': {
        if (a.leader && a.leader.alive && a.leader.state === 'walk') {
          const L = a.leader; const lx = Math.cos(L.heading), lz = -Math.sin(L.heading);
          tx = L.x + lx * (a.lane - L.lane) - Math.sin(L.heading) * 0.2; tz = L.z + lz * (a.lane - L.lane) - Math.cos(L.heading) * 0.2;
          want = Math.min(L.speed * 1.2 + Math.hypot(tx - a.x, tz - a.z) * 0.8, 2.6);
          break;
        } else if (a.leader) a.leader = null;
        if (a.tc < 0) { a.tc = Math.floor(a.x / TILE); a.tr = Math.floor(a.z / TILE); }
        // 横断歩道で信号待ち
        const i = idx(a.tc, a.tr);
        if (world.cw[i] >= 0 && !(world.cw[idx(Math.floor(a.x / TILE), Math.floor(a.z / TILE))] >= 0)) {
          const n = world.graph.nodes[world.cw[i]];
          const axis = world.cwAxis[i] === 1 ? 'h' : 'v';
          const st = signalState(n, axis, t, TRAFFIC);
          if (st !== 'red') { a.waiting = true; want = 0; tx = a.x; tz = a.z; break; }
        }
        a.waiting = false;
        const lx = Math.cos(a.heading) * a.lane * 0.6, lz = -Math.sin(a.heading) * a.lane * 0.6;
        tx = a.tc * TILE + 2 + lx; tz = a.tr * TILE + 2 + lz;
        if (Math.hypot(tx - a.x, tz - a.z) < 0.9) walkStep(a);
        want = ctx2.raining && a.outfit !== 'jogger' ? a.baseSpeed * 1.15 : a.baseSpeed;
        // ときどき立ち止まって仕草
        if (Math.random() < dt * 0.012) { setState(a, Math.random() < 0.5 ? 'text' : 'idle', 3 + Math.random() * 5); }
        break;
      }
      case 'idle': case 'text': case 'phone':
        if (a.stateT <= 0) setState(a, 'walk');
        if (a.lookAt) { a.look = Math.atan2(a.lookAt[0] - a.x, a.lookAt[1] - a.z) - a.heading; }
        break;
      case 'flee': case 'dodge': {
        if (a.state === 'dodge') { tx = a.x + a.dodgeX * 3; tz = a.z + a.dodgeZ * 3; want = 4.5; if (a.stateT <= 0) setState(a, 'flee', 4); break; }
        const dx = a.x - a.fleeX, dz = a.z - a.fleeZ, d = Math.hypot(dx, dz) || 1;
        tx = a.x + dx / d * 5; tz = a.z + dz / d * 5; want = PED.sprintSpeed * (0.75 + a.brave * 0.2);
        if (a.stateT <= 0 || d > 70) { setState(a, 'walk'); a.tc = Math.floor(a.x / TILE); a.tr = Math.floor(a.z / TILE); a.prevC = -1; }
        break;
      }
      case 'cower': if (a.stateT <= 0) setState(a, 'flee', 8); break;
      case 'handsup': a.look = Math.atan2(px - a.x, pz - a.z) - a.heading; if (a.stateT <= 0) setState(a, 'flee', 8); break;
      case 'call': {
        a.look = Math.atan2(a.fleeX - a.x, a.fleeZ - a.z) - a.heading;
        if (a.stateT <= 0) {
          if (a.callCrime) emit('report', { crime: a.callCrime, x: a.fleeX, z: a.fleeZ, by: 'civ', agent: a });
          a.callCrime = null; setState(a, 'flee', 6);
        }
        break;
      }
      case 'film': {
        const ang = Math.atan2(a.fleeX - a.x, a.fleeZ - a.z); a.heading += Math.atan2(Math.sin(ang - a.heading), Math.cos(ang - a.heading)) * Math.min(1, dt * 4);
        if (a.stateT <= 0) { if (a.callCrime) emit('filmed', { crime: a.callCrime, x: a.fleeX, z: a.fleeZ, agent: a }); a.callCrime = null; setState(a, 'flee', 5); }
        break;
      }
      case 'fight': {
        const d = Math.hypot(px - a.x, pz - a.z);
        if (a.stateT <= 0 || d > 25 || ctx2.player.inCar) { setState(a, 'flee', 5); break; }
        tx = px; tz = pz; want = d > 1.2 ? 4 : 0;
        if (d < 1.3) { a.punchCd = (a.punchCd || 0) - dt; if (a.punchCd <= 0) { a.punchCd = 1.2; a.actT = 0; a.punching = 0.35; if (ctx.onPedPunchPlayer) ctx.onPedPunchPlayer(a); } }
        break;
      }
    }
    // 近づく速い車をよける
    if (a.state === 'walk' || a.state === 'idle' || a.state === 'text' || a.waiting) {
      for (const c of ctx2.fastCars) {
        const p = c.phys; const sp = p.vf; if (Math.abs(sp) < 6) continue;
        const sn = Math.sin(p.heading), cs = Math.cos(p.heading);
        const rx = a.x - p.x, rz = a.z - p.z; const f = (rx * sn + rz * cs) * Math.sign(sp), l = rx * cs - rz * sn;
        if (f > 0 && f < 10 + Math.abs(sp) * 0.6 && Math.abs(l) < 2.2) { const s = l >= 0 ? 1 : -1; react(a, { kind: 'car', x: p.x, z: p.z, dx: cs * s, dz: -sn * s }); break; }
      }
    }
    return [tx, tz, want];
  }

  const sep = [];
  function move(a, tx, tz, want, dt, near) {
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    let dvx = 0, dvz = 0;
    if (d > 0.05 && want > 0) { dvx = dx / d * want; dvz = dz / d * want; }
    // 分離（近い人をよける、1.5秒先の位置を予測）
    if (near) {
      for (const o of query(a.x, a.z, 2.2, sep)) {
        if (o === a || o.hidden) continue;
        const ox = o.x + o.vx * 0.6 - a.x - a.vx * 0.6, oz = o.z + o.vz * 0.6 - a.z - a.vz * 0.6;
        const od = Math.hypot(ox, oz);
        if (od < 1.1 && od > 0.001) { const k = (1.1 - od) * 1.8; dvx -= ox / od * k; dvz -= oz / od * k; }
      }
    }
    const resp = Math.min(1, dt * 6);
    a.vx += (dvx - a.vx) * resp; a.vz += (dvz - a.vz) * resp;
    const nx = a.x + a.vx * dt, nz = a.z + a.vz * dt;
    const blocked = (x, z) => solidAt(world, x, z, a.y + 0.5) || (isWater(world, x, z) && a.role === 'civ');
    if (!blocked(nx, nz)) { a.x = nx; a.z = nz; }
    else if (!blocked(nx, a.z)) { a.x = nx; a.vz *= 0.3; }
    else if (!blocked(a.x, nz)) { a.z = nz; a.vx *= 0.3; }
    else { a.vx *= -0.3; a.vz *= -0.3; if (a.state === 'walk') { a.tc = Math.floor(a.x / TILE); a.tr = Math.floor(a.z / TILE); a.prevC = -1; } }
    a.speed = Math.hypot(a.vx, a.vz);
    if (a.speed > 0.15) {
      const h = Math.atan2(a.vx, a.vz);
      const dh = Math.atan2(Math.sin(h - a.heading), Math.cos(h - a.heading));
      const maxTurn = (a.speed > 3 ? 4 : 7) * dt; // 曲がる速度に上限
      a.bank = -Math.max(-0.2, Math.min(0.2, dh * a.speed * 0.08));
      a.heading += Math.max(-maxTurn, Math.min(maxTurn, dh));
    } else a.bank = 0;
    a.y = sampleH(world, a.x, a.z);
  }

  function updateKnock(a, dt) {
    const k = a.kn; k.t += dt;
    if (!k.grounded) {
      k.vy -= 9.8 * dt; a.x += k.vx * dt; a.z += k.vz * dt; a.y += k.vy * dt;
      if (solidAt(world, a.x, a.z, a.y + 0.5)) { a.x -= k.vx * dt * 1.5; a.z -= k.vz * dt * 1.5; k.vx *= -0.3; k.vz *= -0.3; }
      k.pitch += k.spin * dt;
      a.heading += k.spin * 0.3 * dt;
      const g = sampleH(world, a.x, a.z);
      if (a.y <= g && k.vy < 0) {
        if (Math.hypot(k.vx, k.vz) > 4 && k.vy < -3) { k.vy = -k.vy * 0.3; k.vx *= 0.6; k.vz *= 0.6; a.y = g; }
        else { a.y = g; k.grounded = true; k.vx = k.vz = 0; setState(a, 'down', a.alive ? 3 + Math.random() * 3 : 6); }
      }
    }
  }

  let frame = 0;
  function update(dt, t, ctx2) {
    frame++;
    const { player } = ctx2;
    const want = Math.round(ctx.quality.peds * (ctx.settings ? ctx.settings.density : 1) * (ctx.pedFactor ? ctx.pedFactor() : 1));
    const civs = agents.reduce((n, a) => n + (a.role === 'civ' ? 1 : 0), 0);
    if (civs < want) for (let k = 0; k < 3; k++) spawnCiv(player.x, player.z, ctx2.camDir);
    for (let i = agents.length - 1; i >= 0; i--) {
      const a = agents[i];
      if (a.role !== 'civ') continue;
      const d = Math.hypot(a.x - player.x, a.z - player.z);
      if (d > PED.despawnDist || (!a.alive && a.state === 'down' && a.stateT <= 0)) remove(a);
    }
    rebuildGrid();
    ctx2.fastCars = ctx2.cars.filter(c => c.mode !== 'lane' && c.mode !== 'parked' && Math.abs(c.phys.vf) > 6);
    vehicleHits(ctx2.cars);
    for (const a of agents) {
      const d = Math.hypot(a.x - player.x, a.z - player.z);
      a.lod = d < PED.lodNear ? 0 : d < PED.lodFar ? 1 : 2;
      if (a.hidden) continue;
      if (a.state === 'knocked' && a.kn) { updateKnock(a, dt); continue; }
      if (a.state === 'down') {
        a.stateT -= dt; a.speed = 0; a.vx = a.vz = 0;
        if (a.stateT <= 0 && a.alive && !a.noGetup) { a.stun = false; setState(a, 'getup', 0); }
        continue;
      }
      if (a.state === 'getup') { a.actT += dt; if (a.actT >= 1) { if (a.kn) a.kn = null; setState(a, a.role === 'civ' ? 'flee' : 'idle', 6); } continue; }
      if (a.ctrl !== 'ai') continue;
      if (a.stagger > 0) { a.stagger -= dt; }
      const [tx, tz, w] = updateAI(a, dt, t, ctx2);
      move(a, tx, tz, w, dt, a.lod === 0);
      if (a.punching > 0) { a.punching -= dt; a.actT = 1 - a.punching / 0.35; }
      if (a.state !== 'call' && a.state !== 'handsup' && a.state !== 'idle') a.look *= 0.9;
    }
  }

  // 描画用の行列
  const R = new THREE.Matrix4(), Hm = new THREE.Matrix4(), To = new THREE.Matrix4(), Hd = new THREE.Matrix4(), Tm = new THREE.Matrix4(), tmp = new THREE.Matrix4(), out = new THREE.Matrix4();
  const e = new THREE.Euler(), v3 = new THREE.Vector3(), q = new THREE.Quaternion(), s3 = new THREE.Vector3();
  const local = (parent, tx, ty, tz, rx, ry, rz, dst) => { e.set(rx, ry, rz, 'YXZ'); tmp.makeRotationFromEuler(e); tmp.setPosition(tx, ty, tz); dst.multiplyMatrices(parent, tmp); return dst; };
  const PROP_SCALE = [null, [0.07, 0.14, 0.02], [0.06, 0.12, 0.42], [0.05, 0.05, 0.9], [0.3, 0.32, 0.12]];

  function render(t, dt, camPos) {
    for (const a of agents) {
      const i = a.slot;
      if (a.hidden) { hideSlot(i); continue; }
      if (a.lod === 2 && (frame + i) % 4) continue;
      if (a.lod === 1 && (frame + i) % 2) continue;
      a.phase = advancePhase(a.phase, a.speed, dt * (a.lod === 2 ? 4 : a.lod === 1 ? 2 : 1));
      let st = a.state;
      if (st === 'walk' || st === 'flee' || st === 'dodge' || st === 'fight' || st === 'idle') st = a.poseState || (st === 'fight' ? (a.punching > 0 ? 'punch' : 'fight') : 'walk');
      if (st === 'walk' && ctx.raining && ctx.raining() && a.role === 'civ' && a.outfit !== 'jogger') st = 'umbrella';
      if (st === 'call') st = 'phone';
      if ((a.role === 'player' || a.role === 'cop') && st !== 'knocked' && st !== 'down' && st !== 'getup') st = a.poseState || 'walk';
      const p = pose(a.p, { speed: a.lod === 2 ? Math.min(a.speed, 1.2) : a.speed, phase: a.phase, t: t + i, state: st, look: a.look, bank: a.bank, actT: a.actT, aimPitch: a.aimPitch, lean: a.lean });
      if (a.lod === 1) { p.shL = p.shR = 0.1; p.faL = p.faR = -0.2; }
      // ルート（倒れているときは寝かせる）
      let pitch = 0, roll = 0, yOff = 0;
      if (a.state === 'knocked' && a.kn) { pitch = a.kn.pitch; yOff = 0.3; }
      if (a.state === 'down' && a.kn) { pitch = a.kn.face * Math.PI / 2; yOff = 0.14; }
      if (a.state === 'down' && !a.kn) { pitch = -Math.PI / 2; yOff = 0.14; }
      if (a.state === 'getup' && a.kn) { pitch = a.kn.face * Math.PI / 2 * (1 - a.actT); yOff = 0.14 * (1 - a.actT); }
      e.set(pitch, a.heading, roll, 'YXZ'); q.setFromEuler(e);
      s3.set(a.scale * a.wide, a.scale, a.scale * a.wide);
      v3.set(a.x, a.y + yOff, a.z);
      R.compose(v3, q, s3);
      const hipY = 0.93 + p.bob + p.hipDrop;
      local(R, 0, hipY, 0, 0, p.hipTwist, 0, Hm);
      M.hips.setMatrixAt(i, Hm);
      local(Hm, 0, 0.06, 0, p.torsoPitch, p.torsoTwist, p.torsoRoll, To);
      M.torso.setMatrixAt(i, To);
      local(To, 0, 0.52, 0, p.headPitch, p.headYaw, 0, Hd);
      M.head.setMatrixAt(i, Hd);
      if (a.role === 'cop') { tmp.makeScale(1.12, 1.6, 1.12); out.multiplyMatrices(Hd, tmp); M.hair.setMatrixAt(i, out); }
      else M.hair.setMatrixAt(i, Hd);
      const arm = (side, ua, uz, fa, k) => {
        local(To, side * 0.225, 0.47, 0, ua, 0, uz, Tm); M.uarm.setMatrixAt(i * 2 + k, Tm);
        local(Tm, 0, -0.29, 0, fa, 0, 0, out); M.farm.setMatrixAt(i * 2 + k, out);
        return out;
      };
      arm(1, p.uaL, p.uaLz, p.faL, 0);
      const hand = arm(-1, p.uaR, p.uaRz, p.faR, 1);
      const leg = (side, th, sh, k) => { local(Hm, side * 0.09, -0.04, 0, th, 0, 0, Tm); M.thigh.setMatrixAt(i * 2 + k, Tm); local(Tm, 0, -0.44, 0, sh, 0, 0, out); M.shin.setMatrixAt(i * 2 + k, out); };
      // 手の小物（leg の前に計算：out を再利用するため）
      let propKind = p.prop === 1 ? 1 : p.prop === 2 ? (a.weaponProp || 0) : a.bag ? 4 : 0;
      if (a.role === 'player' && p.prop !== 1) propKind = a.weaponProp || 0;
      if (propKind) {
        const sc = PROP_SCALE[propKind];
        if (propKind === 4) { tmp.makeTranslation(-0.05, -0.32, 0.02); }
        else tmp.makeTranslation(0, -0.29, propKind === 1 ? 0.03 : sc[2] * 0.35);
        out.multiplyMatrices(hand, tmp); tmp.makeScale(sc[0], sc[1], sc[2]); out.multiply(tmp);
        M.prop.setMatrixAt(i, out);
        if (a.propColorSet !== propKind) { M.prop.setColorAt(i, col.set(propKind === 1 ? 0x222222 : propKind === 4 ? 0x7a4a2a : 0x1d1d1d)); a.propColorSet = propKind; M.prop.instanceColor.needsUpdate = true; }
      } else M.prop.setMatrixAt(i, _zero);
      if (st === 'umbrella') { tmp.makeTranslation(0, 0.55, 0.05); out.multiplyMatrices(Hd, tmp); M.umb.setMatrixAt(i, out); }
      else M.umb.setMatrixAt(i, _zero);
      leg(1, p.thL, p.shL, 0); leg(-1, p.thR, p.shR, 1);
    }
    for (const k in M) M[k].instanceMatrix.needsUpdate = true;
  }

  function setAgentColors(a, c) { Object.assign(a, c); setColors(a); }

  return { setHooks(o) { Object.assign(ctx, o); }, agents, makeAgent, remove, query, update, render, damage, knock, witness, react, pedsAhead, lineOfSight, setAgentColors, setState, rebuildGrid };
}
