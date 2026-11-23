// 車両の管理と交通AI（車線グラフ＋信号＋IDM追従）。左側通行
/* global THREE */
import { TRAFFIC, WORLD_W, WORLD_H } from '../core/config.js';
import { signalState, solidAt } from '../world/mapgen.js';
import { sampleH, surfaceGrip, isWater } from '../world/terrain.js';
import { VEHICLES, pickModel } from './vehicle.js';
import { makeVehicle, stepVehicle, collideVehicles } from './physics.js';
import { vehicleGeometry, vehicleMaterial } from './models.js';
import { emit } from '../core/events.js';
import { smoke, explosionFx } from '../fx/particles.js';

let nextId = 1;

export function idmAccel(v, v0, gap, vLead, p = TRAFFIC.idm) {
  const sStar = p.s0 + Math.max(0, v * p.T + v * (v - vLead) / (2 * Math.sqrt(p.a * p.b)));
  const g = Math.max(0.1, gap);
  return p.a * (1 - Math.pow(v / Math.max(0.1, v0), 4) - (sStar / g) ** 2);
}

// 2次ベジェ
function bez(p0, p1, p2, u) { const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u; return [a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]]; }
function bezLen(p0, p1, p2) { let l = 0, prev = p0; for (let k = 1; k <= 8; k++) { const q = bez(p0, p1, p2, k / 8); l += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; } return l; }

export function createVehicles(ctx) {
  const { world, scene } = ctx;
  const { nodes, edges } = world.graph;
  const cars = [];
  const env = {
    height: (x, z) => sampleH(world, x, z),
    solid: (x, z, y) => solidAt(world, x, z, y),
    grip: (x, z) => surfaceGrip(world, x, z, ctx.sky && ctx.sky.state.wet),
    water: (x, z) => isWater(world, x, z),
  };
  const MAXL = 80;
  const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXL * 7);
  lights.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  lights.frustumCulled = false;
  const _c = new THREE.Color();
  for (let i = 0; i < MAXL * 7; i++) lights.setColorAt(i, _c.set(0xffffff));
  scene.add(lights);

  function endNodeOf(ai) { const e = edges[ai.e]; return ai.dir > 0 ? e.b : e.a; }
  function startNodeOf(ai) { const e = edges[ai.e]; return ai.dir > 0 ? e.a : e.b; }
  function half(nodeIdx, axis) { const n = nodes[nodeIdx]; if (!n.inter) return 1.5; return (axis === 'h' ? n.hw : n.hh) + 0.6; }
  function dirVec(ai) { const e = edges[ai.e]; return [e.dx * ai.dir, e.dz * ai.dir]; }
  function lanePos(eIdx, dir, s, lane) {
    const e = edges[eIdx]; const st = nodes[dir > 0 ? e.a : e.b];
    const dx = e.dx * dir, dz = e.dz * dir;
    const o = 2 + TRAFFIC.laneWidth * lane;
    return [st.x + dx * s + dz * o, st.z + dz * s - dx * o];
  }
  function speedLimit(e) { return e.lanes >= 2 ? 15 : 11.5; }

  function addVehicle(modelId, x, z, heading, mode = 'parked', opts = {}) {
    const spec = VEHICLES[modelId];
    const color = opts.color ?? spec.colors[Math.floor(Math.random() * spec.colors.length)];
    const phys = makeVehicle(spec, x, z, heading);
    phys.y = env.height(x, z);
    const info = vehicleGeometry(spec, color);
    const mesh = new THREE.Mesh(info.geo, vehicleMaterial());
    mesh.rotation.order = 'YXZ';
    mesh.castShadow = !!ctx.quality.shadow;
    scene.add(mesh);
    const ent = { id: nextId++, modelId, spec, color, phys, mesh, info, mode, driver: mode === 'lane' ? 'npc' : null, ai: null, control: { throttle: 0, brake: 0, steer: 0, handbrake: false },
      siren: false, explodeT: -1, wreck: false, honk: 0, stuck: 0, owned: !!opts.owned, mission: !!opts.mission, persona: 0.85 + Math.random() * 0.3, alarm: 0, freeT: 0, braking: false };
    cars.push(ent);
    return ent;
  }
  function removeVehicle(ent) {
    const i = cars.indexOf(ent); if (i >= 0) cars.splice(i, 1);
    scene.remove(ent.mesh);
  }

  function spawnOnEdge(px, pz) {
    for (let tries = 0; tries < 12; tries++) {
      const ei = Math.floor(Math.random() * edges.length); const e = edges[ei];
      const dir = Math.random() < 0.5 ? 1 : -1;
      const lane = Math.floor(Math.random() * e.lanes);
      const s0 = half(dir > 0 ? e.a : e.b, e.axis), s1 = e.len - half(dir > 0 ? e.b : e.a, e.axis);
      if (s1 - s0 < 6) continue;
      const s = s0 + Math.random() * (s1 - s0 - 4);
      const [x, z] = lanePos(ei, dir, s, lane);
      const d = Math.hypot(x - px, z - pz);
      if (d < TRAFFIC.spawnMin || d > TRAFFIC.spawnMax) continue;
      if (cars.some(c => Math.hypot(c.phys.x - x, c.phys.z - z) < 14)) continue;
      const ent = addVehicle(pickModel(), x, z, Math.atan2(e.dx * dir, e.dz * dir), 'lane');
      ent.ai = { e: ei, dir, s, lane, turn: null, v: 6 };
      return ent;
    }
    return null;
  }

  function beginTurn(ent) {
    const ai = ent.ai; const e = edges[ai.e]; const ni = endNodeOf(ai); const n = nodes[ni];
    const opts = n.edges.filter(k => k !== ai.e);
    let nextE, nextDir;
    const [dx, dz] = dirVec(ai);
    if (!opts.length) { nextE = ai.e; nextDir = -ai.dir; }
    else {
      const weights = opts.map(k => { const f = edges[k]; const nd = f.a === ni ? 1 : -1; const straight = (f.dx * nd * dx + f.dz * nd * dz) > 0.9; return straight ? 2.2 : 1; });
      let r = Math.random() * weights.reduce((a, b) => a + b, 0), k = 0;
      for (; k < opts.length - 1; k++) { r -= weights[k]; if (r <= 0) break; }
      nextE = opts[k]; nextDir = edges[nextE].a === ni ? 1 : -1;
    }
    const f = edges[nextE];
    const lane2 = Math.min(ai.lane, f.lanes - 1);
    const s2 = half(ni, f.axis);
    const p0 = [ent.phys.x, ent.phys.z];
    const p2 = lanePos(nextE, nextDir, s2, lane2);
    const d2 = [f.dx * nextDir, f.dz * nextDir];
    const cr = dx * d2[1] - dz * d2[0];
    let p1;
    if (Math.abs(cr) < 0.1) {
      p1 = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
      if (dx * d2[0] + dz * d2[1] < 0) p1 = [p1[0] + dx * 7, p1[1] + dz * 7]; // Uターン
    } else {
      const w0 = p2[0] - p0[0], w1 = p2[1] - p0[1];
      const t1 = (w0 * d2[1] - w1 * d2[0]) / cr;
      p1 = [p0[0] + dx * t1, p0[1] + dz * t1];
    }
    ai.turn = { p0, p1, p2, len: Math.max(1, bezLen(p0, p1, p2)), u: 0, nextE, nextDir, s2, lane2, straight: Math.abs(cr) < 0.1 && dx * d2[0] + dz * d2[1] > 0 };
  }

  // 前方の障害物（車・人・信号）までの距離と相手の速度
  function leaderGap(ent, fx, fz) {
    const p = ent.phys; let gap = 60, vLead = 0;
    const lx = fz, lz = -fx;
    for (const o of cars) {
      if (o === ent) continue;
      const rx = o.phys.x - p.x, rz = o.phys.z - p.z;
      if (Math.abs(rx) > 45 || Math.abs(rz) > 45) continue;
      const ahead = rx * fx + rz * fz; if (ahead <= 0 || ahead > 45) continue;
      const lat = Math.abs(rx * lx + rz * lz);
      if (lat > (o.spec.wid + ent.spec.wid) * 0.5 + 0.2) continue;
      const g = ahead - (o.spec.len + ent.spec.len) / 2;
      if (g < gap) { gap = g; const ov = o.mode === 'lane' ? o.ai.v : o.phys.vf; const oh = o.phys.heading; vLead = Math.max(0, ov * (Math.sin(oh) * fx + Math.cos(oh) * fz)); }
    }
    if (ctx.pedsAhead) {
      const g = ctx.pedsAhead(p.x, p.z, fx, fz, 18, 1.7) - ent.spec.len / 2;
      if (g < gap) { gap = g; vLead = 0; }
    }
    return [gap, vLead];
  }

  function updateLane(ent, dt, t) {
    const ai = ent.ai, p = ent.phys, e = edges[ai.e];
    let fx, fz;
    if (ai.turn) { const tr = ai.turn; const q0 = bez(tr.p0, tr.p1, tr.p2, tr.u), q1 = bez(tr.p0, tr.p1, tr.p2, Math.min(1, tr.u + 0.02)); const l = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) || 1; fx = (q1[0] - q0[0]) / l; fz = (q1[1] - q0[1]) / l; }
    else [fx, fz] = dirVec(ai);
    let v0 = Math.min(ent.spec.vmax, speedLimit(e) * ent.persona);
    if (ai.turn && !ai.turn.straight) v0 = Math.min(v0, 6);
    let [gap, vLead] = leaderGap(ent, fx, fz);
    // 信号
    if (!ai.turn) {
      const ni = endNodeOf(ai), n = nodes[ni];
      const sEnd = e.len - half(ni, e.axis);
      if (sEnd - ai.s < 30) {
        const st = signalState(n, e.axis, t, TRAFFIC);
        const dStop = sEnd - 0.8 - ai.s - ent.spec.len / 2;
        if (st === 'red' || (st === 'yellow' && dStop > ai.v * ai.v / 6 + 1)) { if (dStop > -1 && dStop < gap) { gap = Math.max(0.1, dStop); vLead = 0; } }
        // 遅い・止まりかけのカーブ前減速
        if (sEnd - ai.s < 12 && n.inter) v0 = Math.min(v0, 9);
      }
    }
    // 緊急車両に道を譲る
    if (ctx.sirenNear && ctx.sirenNear(p.x, p.z, 40)) v0 = Math.min(v0, 3);
    const acc = Math.max(-9, idmAccel(ai.v, v0, gap, vLead));
    ai.v = Math.max(0, ai.v + acc * dt);
    ent.braking = acc < -1.5;
    // クラクション
    if (ai.v < 0.3 && gap < 6) { ent.stuck += dt; if (ent.stuck > 5 && ent.honk <= 0 && ctx.onHonk) { ctx.onHonk(ent); ent.honk = 4; } } else ent.stuck = 0;
    ent.honk -= dt;
    // 進む
    let x, z, h;
    if (ai.turn) {
      const tr = ai.turn; tr.u += ai.v * dt / tr.len;
      if (tr.u >= 1) { ai.e = tr.nextE; ai.dir = tr.nextDir; ai.s = tr.s2 + (tr.u - 1) * tr.len; ai.lane = tr.lane2; ai.turn = null; }
    } else {
      ai.s += ai.v * dt;
      const sEnd = e.len - half(endNodeOf(ai), e.axis);
      if (ai.s >= sEnd) { const pp = lanePos(ai.e, ai.dir, sEnd, ai.lane); p.x = pp[0]; p.z = pp[1]; beginTurn(ent); }
    }
    if (ai.turn) {
      const tr = ai.turn; const q = bez(tr.p0, tr.p1, tr.p2, tr.u), q1 = bez(tr.p0, tr.p1, tr.p2, Math.min(1, tr.u + 0.03));
      x = q[0]; z = q[1]; h = Math.atan2(q1[0] - q[0], q1[1] - q[1]);
      if (Math.hypot(q1[0] - q[0], q1[1] - q[1]) < 1e-4) h = p.heading;
    } else {
      const q = lanePos(ai.e, ai.dir, ai.s, ai.lane); x = q[0]; z = q[1];
      const [dx, dz] = dirVec(ai); h = Math.atan2(dx, dz);
    }
    let dh = h - p.heading; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
    p.heading += dh * Math.min(1, dt * 12);
    p.x = x; p.z = z; p.vf = ai.v; p.vl = 0; p.yawRate = dh / Math.max(dt, 1e-3) * 0.1;
    const L = ent.spec.len * 0.6, sn = Math.sin(p.heading), cs = Math.cos(p.heading);
    const hf = env.height(x + sn * L / 2, z + cs * L / 2), hb = env.height(x - sn * L / 2, z - cs * L / 2);
    p.y = (hf + hb) / 2; p.pitch = Math.atan2(hf - hb, L); p.roll *= 0.9;
  }

  // 自由（物理）モードの車が止まったら車線に戻る
  function tryRejoin(ent) {
    const p = ent.phys; let best = null, bd = 3.5;
    edges.forEach((e, ei) => {
      for (const dir of [1, -1]) for (let lane = 0; lane < e.lanes; lane++) {
        const st = nodes[dir > 0 ? e.a : e.b]; const dx = e.dx * dir, dz = e.dz * dir;
        const o = 2 + TRAFFIC.laneWidth * lane;
        const rx = p.x - (st.x + dz * o), rz = p.z - (st.z - dx * o);
        const s = rx * dx + rz * dz; if (s < 4 || s > e.len - 4) continue;
        const lat = Math.abs(rx * dz - rz * dx);
        const hd = Math.abs(Math.atan2(Math.sin(p.heading - Math.atan2(dx, dz)), Math.cos(p.heading - Math.atan2(dx, dz))));
        if (lat < bd && hd < 0.6) { bd = lat; best = { e: ei, dir, s, lane }; }
      }
    });
    if (best) { ent.mode = 'lane'; ent.ai = { ...best, turn: null, v: 0 }; return true; }
    return false;
  }

  function damage(ent, amount, source) {
    if (ent.wreck) return;
    amount *= ent.spec.armorK ?? 1;
    ent.phys.hp = Math.max(0, ent.phys.hp - amount);
    if (ent.phys.hp <= 0 && ent.explodeT < 0 && !ent.phys.inWater) ent.explodeT = 5;
    if (ent.mode === 'lane') { ent.mode = 'free'; ent.freeT = 0; }
    if (source === 'player' && ctx.onPlayerDamagedCar) ctx.onPlayerDamagedCar(ent, amount);
  }
  function explode(ent) {
    ent.wreck = true; ent.explodeT = -1; ent.phys.hp = 0;
    const p = ent.phys;
    explosionFx(p.x, p.y + 0.8, p.z, 1.2, ctx.settings && ctx.settings.mild);
    ent.mesh.material = wreckMat();
    emit('explosion', { x: p.x, y: p.y + 0.5, z: p.z, r: 6, dmg: 150, source: ent.lastAttacker || null, car: ent });
    p.vy = 4; p.y += 0.3; p.yawRate += (Math.random() - 0.5) * 2;
    ent.mode = 'free'; ent.driver = null;
  }
  let _wm; function wreckMat() { if (!_wm) _wm = new THREE.MeshLambertMaterial({ color: 0x2a2826 }); return _wm; }

  function update(dt, t, player) {
    const px = player.x, pz = player.z;
    // 生成と消去
    const want = Math.round(ctx.quality.cars * (ctx.settings ? ctx.settings.density : 1) * (ctx.trafficFactor ? ctx.trafficFactor() : 1));
    const laneCount = cars.filter(c => c.mode === 'lane').length;
    if (laneCount < want) spawnOnEdge(px, pz);
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i];
      if (c.owned || c.mission || c.mode === 'player' || c.mode === 'police') continue;
      const d = Math.hypot(c.phys.x - px, c.phys.z - pz);
      if (d > TRAFFIC.despawn || (c.wreck && d > 120) || (c.phys.inWater && d > 60)) removeVehicle(c);
    }
    for (const c of cars) {
      if (c.mode === 'lane') updateLane(c, dt, t);
      else if (c.mode === 'player' || c.mode === 'police') stepVehicle(c.phys, c.control, dt, env);
      else {
        // 自由・駐車：ブレーキをかけて物理
        stepVehicle(c.phys, { throttle: 0, brake: c.mode === 'parked' ? 1 : 0.6, steer: 0, handbrake: c.mode === 'parked' }, dt, env);
        if (c.mode === 'free' && !c.wreck && c.driver === 'npc') {
          if (c.phys.speed < 0.5) { c.freeT += dt; if (c.freeT > 3) { if (!tryRejoin(c)) { c.mode = 'parked'; if (ctx.onDriverExit) ctx.onDriverExit(c, 'calm'); c.driver = null; } } } else c.freeT = 0;
        }
      }
      // 壁への衝突ダメージ
      if (c.phys.crashImpulse > 4) { damage(c, (c.phys.crashImpulse - 3) * 2.5 * (c.spec.mass > 5000 ? 0.4 : 1), c.mode === 'player' ? 'self' : null); if (ctx.onCrash) ctx.onCrash(c, null, c.phys.crashImpulse); }
      // 煙と爆発
      const p = c.phys;
      if (!c.wreck && p.hp < 50 && Math.random() < dt * 8) smoke(p.x + Math.sin(p.heading) * c.spec.len * 0.4, p.y + 1.1, p.z + Math.cos(p.heading) * c.spec.len * 0.4, p.hp < 25);
      if (c.wreck && Math.random() < dt * 5) smoke(p.x, p.y + 1.2, p.z, true);
      if (c.explodeT >= 0) { c.explodeT -= dt; if (Math.random() < dt * 20) smoke(p.x, p.y + 1.3, p.z, true); if (c.explodeT <= 0) explode(c); }
      if (c.alarm > 0) c.alarm -= dt;
    }
    // 車同士の衝突
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (a.mode === 'lane' && b.mode === 'lane') continue;
      const dx = a.phys.x - b.phys.x, dz = a.phys.z - b.phys.z;
      if (dx * dx + dz * dz > 150) continue;
      const imp = collideVehicles(a.phys, b.phys);
      if (imp > 0) {
        if (imp > 2.5) {
          const ra = b.spec.mass / (a.spec.mass + b.spec.mass);
          const src = a.mode === 'player' || b.mode === 'player' ? 'player' : null;
          if (imp > 3.5) { damage(a, imp * 4 * ra, b.mode === 'player' ? 'player' : null); damage(b, imp * 4 * (1 - ra), a.mode === 'player' ? 'player' : null); }
          else { if (a.mode === 'lane') a.mode = 'free'; if (b.mode === 'lane') b.mode = 'free'; }
          if (ctx.onCrash) ctx.onCrash(a, b, imp, src);
        } else {
          if (a.mode === 'lane' && b.mode !== 'lane') { a.mode = 'free'; a.freeT = 0; }
          if (b.mode === 'lane' && a.mode !== 'lane') { b.mode = 'free'; b.freeT = 0; }
        }
      }
    }
    for (const c of cars) { const p = c.phys; p.x = Math.max(2, Math.min(WORLD_W - 2, p.x)); p.z = Math.max(2, Math.min(WORLD_H - 2, p.z)); }
  }

  const _m = new THREE.Matrix4(), _l = new THREE.Matrix4(), _cs = new THREE.Color();
  function render(cam, night, t) {
    let li = 0;
    for (const c of cars) {
      const p = c.phys, m = c.mesh;
      const d = Math.hypot(p.x - cam.position.x, p.z - cam.position.z);
      m.visible = d < 280;
      m.position.set(p.x, p.y, p.z);
      m.rotation.set(-p.pitch, p.heading, -p.roll);
      if (!m.visible || li > MAXL * 7 - 7) continue;
      m.updateMatrix();
      const { lightY, lightX } = c.info, L = c.spec.len / 2;
      const put = (x, y, z, sx, sy, sz, col) => { _l.makeScale(sx, sy, sz); _l.setPosition(x, y, z); _m.multiplyMatrices(m.matrix, _l); lights.setMatrixAt(li, _m); lights.setColorAt(li, col); li++; };
      if (night > 0.3 && !c.wreck && (c.driver || c.mode === 'player')) {
        _cs.setRGB(1, 0.95, 0.75);
        put(lightX, lightY, L + 0.04, 0.42, 0.18, 0.06, _cs); put(-lightX, lightY, L + 0.04, 0.42, 0.18, 0.06, _cs);
      }
      const brk = c.braking || (c.mode === 'player' && c.control.brake > 0 && p.vf > 0.5);
      if (!c.wreck && (night > 0.3 || brk)) {
        _cs.setRGB(brk ? 1 : 0.7, 0.05, 0.03);
        put(lightX * 1.1, lightY + 0.03, -L - 0.04, 0.34, 0.16, 0.06, _cs); put(-lightX * 1.1, lightY + 0.03, -L - 0.04, 0.34, 0.16, 0.06, _cs);
      }
      if (c.mods && c.mods.neon && !c.wreck && night > 0.15) {
        _cs.set(c.mods.neonColor || 0x3ad0ff);
        put(0, 0.1, 0, c.spec.wid * 0.92, 0.03, c.spec.len * 0.86, _cs);
      }
      if (c.spec.police && !c.wreck) {
        const on = c.siren; const ph = Math.floor(t * 6) % 2;
        put(0.35, c.info.roofY + 0.12, -0.2, 0.55, 0.16, 0.28, _cs.set(on ? (ph ? 0xff2020 : 0x550000) : 0x661111));
        put(-0.35, c.info.roofY + 0.12, -0.2, 0.55, 0.16, 0.28, _cs.set(on ? (ph ? 0x110022 : 0x2a4bff) : 0x111a55));
      }
    }
    lights.count = li;
    lights.instanceMatrix.needsUpdate = true;
    if (lights.instanceColor) lights.instanceColor.needsUpdate = true;
  }

  function nearest(x, z, r, filter) {
    let best = null, bd = r;
    for (const c of cars) { if (filter && !filter(c)) continue; const d = Math.hypot(c.phys.x - x, c.phys.z - z); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  // 駐車車両
  function spawnParked(list) { for (const [id, x, z, h, opts] of list) addVehicle(id, x, z, h, 'parked', opts || {}); }

  return { cars, addVehicle, removeVehicle, update, render, nearest, damage, explode, spawnParked, env, lanePos, tryRejoin };
}
