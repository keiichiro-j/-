// 警察車・警官・ヘリ・検問（★の数ごとの出動と行動）
/* global THREE */
import { POLICE_BY_STAR, WANTED, TRAFFIC, TILE } from '../core/config.js';
import { nearestNode, findPath, T, idx } from '../world/mapgen.js';
import { sampleH } from '../world/terrain.js';
import { POLICE_OUTFIT } from '../actors/crowd.js';
import { reportCrime } from './wanted.js';
import { angDiff } from '../core/rng.js';

export function createPolice(ctx) {
  const { world, scene } = ctx;
  const units = [];      // パトカー {ent, path, pi, repath, stuck, reverseT, officers, deployed}
  const officers = [];   // 徒歩の警官 agent
  const helis = [];
  const blocks = [];     // 検問 {cars, spike}
  let blockCd = 20, sightCd = 0;
  const spikeMat = new THREE.MeshLambertMaterial({ color: 0x333333 });

  function patrolCount() { return 2; }

  function spawnCar(px, pz, mode = 'police', minD = 90, maxD = 170) {
    const { edges } = world.graph;
    for (let k = 0; k < 20; k++) {
      const ei = Math.floor(Math.random() * edges.length), e = edges[ei];
      const dir = Math.random() < 0.5 ? 1 : -1;
      const s = 8 + Math.random() * Math.max(1, e.len - 16);
      const [x, z] = ctx.vehicles.lanePos(ei, dir, s, 0);
      const d = Math.hypot(x - px, z - pz);
      if (d < minD || d > maxD) continue;
      if (ctx.vehicles.cars.some(c => Math.hypot(c.phys.x - x, c.phys.z - z) < 10)) continue;
      const stars = ctx.wanted.stars;
      const model = stars >= 5 && units.length % 3 === 2 ? 'armored' : 'police';
      const ent = ctx.vehicles.addVehicle(model, x, z, Math.atan2(e.dx * dir, e.dz * dir), mode);
      ent.driver = 'cop';
      if (mode === 'lane') { ent.ai = { e: ei, dir, s, lane: 0, turn: null, v: 5 }; ent.driver = 'npc'; ent.patrol = true; }
      else { ent.siren = true; units.push({ ent, path: null, pi: 0, repath: 0, stuck: 0, reverseT: 0, deployed: false, officers: [] }); }
      return ent;
    }
    return null;
  }

  function makeOfficer(x, z) {
    const a = ctx.crowd.makeAgent(x, z, { role: 'cop', ctrl: 'ext', hp: 100, cTop: POLICE_OUTFIT.top, cBottom: POLICE_OUTFIT.bottom, cHair: POLICE_OUTFIT.cap, cSkin: POLICE_OUTFIT.skin, outfit: { id: 'cop', top: [POLICE_OUTFIT.top], bottom: [POLICE_OUTFIT.bottom], sleeve: 'long' } });
    if (!a) return null;
    a.state = 'cop'; a.weaponProp = 2; a.shootCd = 1 + Math.random(); a.copSpeed = 4.6 + Math.random() * 0.8;
    officers.push(a); return a;
  }

  function heliMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2, 4.4), new THREE.MeshLambertMaterial({ color: 0x1f3460 }));
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 4.5), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    tail.position.set(0, 0.4, -4.2);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.35), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    rotor.position.y = 1.3;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2, 1.1, 1.4), new THREE.MeshLambertMaterial({ color: 0x223344 }));
    glass.position.set(0, 0.3, 1.9);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(4, 40, 12, 1, true).translate(0, -20, 0), new THREE.MeshBasicMaterial({ color: 0xfff6cc, transparent: true, opacity: 0.12, depthWrite: false }));
    g.add(body, tail, rotor, glass, beam);
    g.userData = { rotor, beam };
    scene.add(g);
    return g;
  }

  function placeRoadblock(px, pz, hx, hz) {
    // 進行方向の 90〜140m 先の道路区間に、2台の横向きパトカー＋スパイク
    const { edges, nodes } = world.graph;
    let best = null, bs = -1;
    edges.forEach((e, ei) => {
      const a = nodes[e.a], b = nodes[e.b];
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      const dx = mx - px, dz = mz - pz, d = Math.hypot(dx, dz);
      if (d < 80 || d > 150 || e.len < 24) return;
      const score = (dx * hx + dz * hz) / d;
      if (score > bs) { bs = score; best = { ei, mx, mz, e }; }
    });
    if (!best || bs < 0.6) return;
    const { e, mx, mz } = best;
    const nx = e.dz, nz = -e.dx; // 道路に直交
    const h = Math.atan2(nx, nz);
    const c1 = ctx.vehicles.addVehicle('police', mx + nx * 2.2, mz + nz * 2.2, h, 'parked');
    const c2 = ctx.vehicles.addVehicle('police', mx - nx * 2.6, mz - nz * 2.6, h + Math.PI, 'parked');
    for (const c of [c1, c2]) { c.siren = true; c.driver = null; c.mission = true; }
    const sx = mx + e.dx * 9, sz = mz + e.dz * 9;
    const spike = new THREE.Mesh(new THREE.BoxGeometry(e.lanes * 8, 0.08, 0.6), spikeMat);
    spike.position.set(sx, sampleH(world, sx, sz) + 0.04, sz); spike.rotation.y = Math.atan2(e.dx, e.dz);
    scene.add(spike);
    const offs = [makeOfficer(mx + e.dx * 4 + nx * 5, mz + e.dz * 4 + nz * 5), makeOfficer(mx + e.dx * 4 - nx * 5, mz + e.dz * 4 - nz * 5)].filter(Boolean);
    blocks.push({ cars: [c1, c2], spike, sx, sz, w: e.lanes * 4, dx: e.dx, dz: e.dz, t: 60, officers: offs });
  }

  function clearAll(keepNear = false) {
    for (const u of units) { u.ent.siren = false; u.ent.mode = 'free'; u.ent.driver = 'npc'; u.ent.freeT = 0; }
    units.length = 0;
    for (const a of officers) { a.ctrl = 'ai'; a.role = 'civ'; a.state = 'walk'; a.exCop = true; a.poseState = null; a.weaponProp = 0; }
    officers.length = 0;
    for (const h of helis) scene.remove(h.mesh);
    helis.length = 0;
    for (const b of blocks) { scene.remove(b.spike); for (const c of b.cars) c.mission = false; }
    blocks.length = 0;
  }

  // 警察が見えているか（建物とアーケードで遮られる）
  function canSee(fromX, fromZ, fromY, range, P) {
    const d = Math.hypot(P.x - fromX, P.z - fromZ);
    if (d > range) return false;
    return ctx.crowd.lineOfSight(fromX, fromZ, P.x, P.z, Math.max(1.4, Math.min(fromY, P.y + 1.4)));
  }

  function underCover(P) {
    const c = Math.floor(P.x / TILE), r = Math.floor(P.z / TILE);
    const t = world.tiles[idx(c, r)];
    return t === T.ARCADE || t === T.BRIDGE && P.y < 0 || false;
  }

  function driveUnit(u, dt, P, stars, cfg) {
    const e = u.ent, p = e.phys;
    if (u.deployed) { const c = e.control; c.throttle = 0; c.brake = 1; c.steer = 0; c.handbrake = true; return; }
    // 動けなくなった車：見えない距離なら最寄りの道路に戻す
    u.chkT = (u.chkT || 0) + dt;
    if (u.chkT > 4) {
      u.chkT = 0;
      const moved = u.lastPos ? Math.hypot(p.x - u.lastPos[0], p.z - u.lastPos[1]) : 99;
      u.lastPos = [p.x, p.z];
      u.stuckChecks = moved < 4 ? (u.stuckChecks || 0) + 1 : 0;
      if (u.stuckChecks >= 2 && Math.hypot(P.x - p.x, P.z - p.z) > 45) {
        const { edges, nodes } = world.graph;
        let best = null, bd = 1e9;
        edges.forEach((ed, ei) => { const a = nodes[ed.a], b = nodes[ed.b]; const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2; const d = Math.hypot(mx - p.x, mz - p.z); if (d < bd && ed.len > 16) { bd = d; best = ei; } });
        if (best != null) {
          const ed = edges[best];
          const dir = ((P.x - nodes[ed.a].x) * ed.dx + (P.z - nodes[ed.a].z) * ed.dz) > 0 ? 1 : -1;
          const [x, z] = ctx.vehicles.lanePos(best, dir, 8, 0);
          p.x = x; p.z = z; p.heading = Math.atan2(ed.dx * dir, ed.dz * dir); p.vf = p.vl = 0; p.yawRate = 0;
          u.path = null; u.reverseT = 0; u.stuck = 0; u.stuckChecks = 0;
        }
      }
    }
    const tgt = P;
    const knows = ctx.wanted.status === 'seen' || ctx.wanted.status === 'lost';
    let goal;
    if (knows) goal = { x: tgt.x, z: tgt.z };
    else {
      const s = ctx.wanted.search;
      // まずは通報のあった場所（捜索エリアの中心）へ。着いたらエリアの中を探す
      if (s && !u.reachedScene && Math.hypot(s.x - p.x, s.z - p.z) < 30) u.reachedScene = true;
      if (s && !u.reachedScene) { u.wander = { x: s.x, z: s.z }; u.wanderT = 99; }
      else if (!u.wander || Math.hypot(u.wander.x - p.x, u.wander.z - p.z) < 15 || u.wanderT <= 0) {
        const a = Math.random() * 6.28, r = Math.random() * (s ? s.r * 0.6 : 60);
        u.wander = { x: (s ? s.x : tgt.x) + Math.cos(a) * r, z: (s ? s.z : tgt.z) + Math.sin(a) * r }; u.wanderT = 25;
      }
      u.wanderT -= dt;
      goal = u.wander;
    }
    const dGoal = Math.hypot(goal.x - p.x, goal.z - p.z);
    let aimX, aimZ;
    const los = dGoal < 40 && ctx.crowd.lineOfSight(p.x, p.z, goal.x, goal.z, 1.2);
    if (los) { aimX = goal.x; aimZ = goal.z; u.path = null; }
    else {
      u.repath -= dt;
      if (!u.path || u.repath <= 0) {
        const a = nearestNode(world.graph, p.x, p.z), b = nearestNode(world.graph, goal.x, goal.z);
        u.path = findPath(world.graph, a, b) || [b]; u.pi = 0; u.repath = 4;
        // 最初の交差点が後ろにあるなら飛ばす（引き返さない）
        if (u.path.length >= 2) {
          const n0 = world.graph.nodes[u.path[0]], n1 = world.graph.nodes[u.path[1]];
          const seg = Math.hypot(n1.x - n0.x, n1.z - n0.z);
          if (Math.hypot(n1.x - p.x, n1.z - p.z) < seg + 2) u.pi = 1;
        }
      }
      let n = world.graph.nodes[u.path[Math.min(u.pi, u.path.length - 1)]];
      if (Math.hypot(n.x - p.x, n.z - p.z) < 9 && u.pi < u.path.length - 1) { u.pi++; n = world.graph.nodes[u.path[u.pi]]; }
      aimX = n.x; aimZ = n.z;
      if (u.pi >= u.path.length - 1 && Math.hypot(n.x - p.x, n.z - p.z) < 9) { aimX = goal.x; aimZ = goal.z; }
    }
    const want = Math.atan2(aimX - p.x, aimZ - p.z);
    const da = angDiff(p.heading, want);
    const c = e.control;
    if (u.reverseT > 0) {
      u.reverseT -= dt; c.throttle = 0; c.brake = 1; c.steer = -Math.sign(da); c.handbrake = false;
    } else {
      c.steer = Math.max(-1, Math.min(1, da * 2));
      const sp = p.vf;
      const close = Math.hypot(P.x - p.x, P.z - p.z);
      let targetSpeed = Math.abs(da) > 1.2 ? 7 : Math.abs(da) > 0.5 ? 14 : 30;
      // 交差点で曲がる前に減速（曲がりきれずに建物へ突っ込まない）
      if (u.path && u.pi < u.path.length - 1) {
        const n0 = world.graph.nodes[u.path[u.pi]], n1 = world.graph.nodes[u.path[u.pi + 1]];
        const dn = Math.hypot(n0.x - p.x, n0.z - p.z);
        const turn = Math.abs(angDiff(Math.atan2(n0.x - p.x, n0.z - p.z), Math.atan2(n1.x - n0.x, n1.z - n0.z)));
        if (turn > 0.5 && dn < 10 + sp * sp / 12) targetSpeed = Math.min(targetSpeed, 9);
      }
      if (knows && close < 14 && !P.inCar) targetSpeed = Math.min(targetSpeed, close > 7 ? 5 : 0);
      if (knows && close < 22 && P.inCar && !cfg.ram) targetSpeed = Math.min(targetSpeed, Math.max(6, P.speed));
      if (knows && P.inCar && cfg.ram && close < 30) targetSpeed = Math.max(targetSpeed, P.speed + 4);
      c.throttle = sp < targetSpeed ? 1 : 0;
      c.brake = sp > targetSpeed + 3 ? 1 : 0;
      c.handbrake = Math.abs(da) > 1.4 && sp > 10;
      if (Math.abs(da) > 2.4 && sp < 4) { c.brake = 1; c.throttle = 0; c.steer = -Math.sign(da); }
      if (c.throttle > 0.5 && Math.abs(sp) < 0.8) { u.stuck += dt; if (u.stuck > 1.4) { u.reverseT = 1.3; u.stuck = 0; } } else u.stuck = 0;
    }
    // ★3以上：走りながら窓から撃つ
    if (stars >= 3 && knows && !u.deployed) {
      const dd = Math.hypot(P.x - p.x, P.z - p.z);
      u.shootCd = (u.shootCd ?? 1.5) - dt;
      if (dd < 28 && u.shootCd <= 0 && ctx.crowd.lineOfSight(p.x, p.z, P.x, P.z, 1.4)) {
        u.shootCd = 0.8 + Math.random() * 0.9;
        ctx.copShoot({ x: p.x, y: p.y, z: p.z, heading: Math.atan2(P.x - p.x, P.z - p.z) }, P, dd + 6);
      }
    }
    // 主人公の近くで止まったら警官が降りる（徒歩でも車でも。★2以上は降りて撃つ）
    const close2 = Math.hypot(P.x - p.x, P.z - p.z);
    const pSlow = !P.inCar || P.speed < 7;
    if (knows && !u.deployed && close2 < (P.inCar ? 22 : 26) && pSlow && Math.abs(p.vf) < 4 && (stars >= 2 || !P.inCar)) {
      u.deployed = true; u.deployT = 0;
      const n = Math.min(2, Math.max(0, 8 - officers.length));
      for (let k = 0; k < n; k++) {
        const side = k ? 1 : -1;
        const o = makeOfficer(p.x + Math.cos(p.heading) * 1.7 * side, p.z - Math.sin(p.heading) * 1.7 * side);
        if (o) { o.homeCar = e; o.unit = u; u.officers.push(o); o.coverT = 0.6 + Math.random() * 0.6; }
      }
    }
    if (u.deployed) { c.throttle = 0; c.brake = 1; c.steer = 0; c.handbrake = true; e.driver = u.officers.some(o => !o.hidden && o.alive) ? null : 'cop'; }
  }

  function officerAI(a, dt, P, stars, cfg) {
    if (!a.alive) return;
    if (a.state === 'knocked' || a.state === 'down' || a.state === 'getup') return;
    const dx = P.x - a.x, dz = P.z - a.z, d = Math.hypot(dx, dz);
    const knows = ctx.wanted.status === 'seen' || ctx.wanted.status === 'lost' || d < 30;
    const shoot = stars >= 2 || ctx.playerHostile();
    const car = a.homeCar && !a.homeCar.wreck && ctx.vehicles.cars.includes(a.homeCar) ? a.homeCar : null;
    let want = 0, tx = a.x, tz = a.z;
    a.poseState = 'walk';
    a.coverT = (a.coverT || 0) - dt;
    // 主人公が車で走り去ったら、乗ってきたパトカーに戻って追跡を続ける
    const fleeing = P.inCar && P.speed > 9 && d > 18;
    if ((fleeing || (!knows && d > 60)) && car) {
      tx = car.phys.x; tz = car.phys.z; want = a.copSpeed;
      if (Math.hypot(tx - a.x, tz - a.z) < 2.6) { a.hidden = true; }
    } else if (knows) {
      const los = d < 45 && ctx.crowd.lineOfSight(a.x, a.z, P.x, P.z, 1.5);
      if (shoot && los && a.coverT <= 0) {
        // 構えて撃つ。距離を詰めすぎず、近ければ横に回り込む
        a.poseState = 'aim'; a.heading = Math.atan2(dx, dz); a.aimPitch = 0;
        if (d > 24) { want = a.copSpeed * 0.7; tx = P.x; tz = P.z; a.poseState = 'walk'; }
        else if (d < 6) { want = 1.6; tx = a.x - dz / d * 3; tz = a.z + dx / d * 3; }
        a.shootCd -= dt;
        if (a.shootCd <= 0 && d < 40 && a.poseState === 'aim') { a.shootCd = 0.55 + Math.random() * 0.7; ctx.copShoot(a, P, d); }
      } else if (!shoot && !P.inCar) {
        // ★1：追いかけて拘束
        tx = P.x; tz = P.z; want = d > 1.2 ? a.copSpeed : 0;
        if (d < 1.4 && !P.arrest) ctx.tryArrest(a);
      } else if (!los) { tx = P.x; tz = P.z; want = a.copSpeed * 0.85; }
      else if (P.inCar && !shoot) {
        // ★1で車内：近づいて降りるよう警告
        tx = P.x; tz = P.z; want = d > 4 ? a.copSpeed * 0.6 : 0;
      }
    } else {
      const s = ctx.wanted.search;
      if (!a.wander || Math.hypot(a.wander[0] - a.x, a.wander[1] - a.z) < 3) a.wander = s ? [s.x + (Math.random() - 0.5) * 40, s.z + (Math.random() - 0.5) * 40] : [a.x, a.z];
      tx = a.wander[0]; tz = a.wander[1]; want = 2;
    }
    const mdx = tx - a.x, mdz = tz - a.z, md = Math.hypot(mdx, mdz) || 1;
    const vx = want ? mdx / md * want : 0, vz = want ? mdz / md * want : 0;
    a.vx += (vx - a.vx) * Math.min(1, dt * 6); a.vz += (vz - a.vz) * Math.min(1, dt * 6);
    const nx = a.x + a.vx * dt, nz = a.z + a.vz * dt;
    const { solidAt } = ctx.mapfns;
    if (!solidAt(world, nx, nz, a.y + 0.5)) { a.x = nx; a.z = nz; } else if (!solidAt(world, nx, a.z, a.y + 0.5)) a.x = nx; else if (!solidAt(world, a.x, nz, a.y + 0.5)) a.z = nz;
    a.speed = Math.hypot(a.vx, a.vz);
    if (a.speed > 0.2 && a.poseState !== 'aim') a.heading = Math.atan2(a.vx, a.vz);
    a.y = sampleH(world, a.x, a.z);
  }

  function update(dt, t, P) {
    const stars = ctx.wanted.stars;
    const cfg = POLICE_BY_STAR[stars];
    const maxUnits = ctx.quality.police;
    // パトロール（手配なしでも少数が巡回）
    const patrols = ctx.vehicles.cars.filter(c => c.patrol && c.mode === 'lane');
    if (patrols.length < patrolCount() && Math.random() < dt) spawnCar(P.x, P.z, 'lane', 80, 170);
    // 手配中：巡回中のパトカーも追跡に加わる
    if (stars > 0) {
      for (const c of patrols) if (units.length < cfg.cars && Math.hypot(c.phys.x - P.x, c.phys.z - P.z) < 160) {
        c.mode = 'police'; c.patrol = false; c.driver = 'cop'; c.siren = true; units.push({ ent: c, path: null, pi: 0, repath: 0, stuck: 0, reverseT: 0, deployed: false, officers: [] });
      }
      if (units.length < Math.min(cfg.cars, maxUnits) && Math.random() < dt * 0.8) spawnCar(P.x, P.z);
      while (helis.length < cfg.heli) helis.push({ mesh: heliMesh(), x: P.x - 120, z: P.z - 120, y: 55 });
    }
    if (stars === 0 && (units.length || officers.length || helis.length)) clearAll();
    // パトカーの運転
    for (let i = units.length - 1; i >= 0; i--) {
      const u = units[i];
      if (u.ent.wreck || !ctx.vehicles.cars.includes(u.ent)) { units.splice(i, 1); continue; }
      if (u.ent.mode !== 'police') { units.splice(i, 1); continue; }
      driveUnit(u, dt, P, stars, cfg);
      if (Math.hypot(u.ent.phys.x - P.x, u.ent.phys.z - P.z) > 320) { ctx.vehicles.removeVehicle(u.ent); units.splice(i, 1); }
    }
    // 降りた警官が全員車に戻ったら（または倒れたら）再出発
    for (const u of units) {
      if (!u.deployed) continue;
      u.deployT = (u.deployT || 0) + dt;
      const out = u.officers.filter(o => o.alive && !o.hidden && ctx.crowd.agents.includes(o));
      if (u.deployT > 1.5 && out.length === 0) {
        for (const o of u.officers) if (o.hidden && ctx.crowd.agents.includes(o)) { ctx.crowd.remove(o); const i = officers.indexOf(o); if (i >= 0) officers.splice(i, 1); }
        u.officers = []; u.deployed = false; u.ent.driver = 'cop'; u.path = null;
        if (!u.officers.length && u.deployT > 1.5 && out.length === 0 && u.ent.phys.hp <= 0) u.ent.driver = null;
      }
    }
    for (let i = officers.length - 1; i >= 0; i--) {
      const a = officers[i];
      if (!ctx.crowd.agents.includes(a)) { officers.splice(i, 1); continue; }
      if (!a.alive && a.state === 'down' && a.stateT <= 0) { ctx.crowd.remove(a); officers.splice(i, 1); continue; }
      if (a.hidden) continue;
      officerAI(a, dt, P, stars, cfg);
    }
    // ヘリ
    for (let i = 0; i < helis.length; i++) {
      const h = helis[i];
      const ox = Math.cos(t * 0.3 + i * 3) * 20, oz = Math.sin(t * 0.3 + i * 3) * 20;
      const tx = (ctx.wanted.status === 'seen' || ctx.wanted.status === 'lost') ? P.x : (ctx.wanted.search ? ctx.wanted.search.x : P.x);
      const tz = (ctx.wanted.status === 'seen' || ctx.wanted.status === 'lost') ? P.z : (ctx.wanted.search ? ctx.wanted.search.z : P.z);
      h.x += (tx + ox - h.x) * Math.min(1, dt * 0.6); h.z += (tz + oz - h.z) * Math.min(1, dt * 0.6);
      h.y = sampleH(world, h.x, h.z) + 50;
      h.mesh.position.set(h.x, h.y, h.z);
      h.mesh.rotation.y = Math.atan2(tx - h.x, tz - h.z);
      h.mesh.rotation.x = 0.12;
      h.mesh.userData.rotor.rotation.y += dt * 25;
      const beam = h.mesh.userData.beam;
      beam.visible = ctx.night() > 0.35;
      beam.lookAt(P.x, P.y, P.z); beam.rotateX(-Math.PI / 2);
    }
    // 検問
    if (cfg.block && P.inCar) {
      blockCd -= dt;
      if (blockCd <= 0 && blocks.length < 2) { blockCd = 35; placeRoadblock(P.x, P.z, Math.sin(P.heading), Math.cos(P.heading)); }
    }
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i]; b.t -= dt;
      if (P.inCar && P.car) {
        const rx = P.x - b.sx, rz = P.z - b.sz;
        if (Math.abs(rx * b.dx + rz * b.dz) < 1.2 && Math.abs(rx * b.dz - rz * b.dx) < b.w) P.car.phys.flatTires = 4;
      }
      if (b.t <= 0 && Math.hypot(P.x - b.sx, P.z - b.sz) > 120) { scene.remove(b.spike); for (const c of b.cars) { c.mission = false; } blocks.splice(i, 1); }
    }
    // 視認
    let sees = false, seeRate = 1;
    if (stars > 0 || true) {
      const cover = underCover(P);
      for (const c of ctx.vehicles.cars) {
        if (!c.spec.police || c.wreck || !(c.driver)) continue;
        if (canSee(c.phys.x, c.phys.z, 1.4, WANTED.sightCar, P)) { sees = true; break; }
      }
      if (!sees) for (const a of officers) if (a.alive && !a.hidden && canSee(a.x, a.z, 1.6, WANTED.sightFoot, P)) { sees = true; break; }
      if (!sees && !cover) for (const h of helis) if (Math.hypot(h.x - P.x, h.z - P.z) < WANTED.sightHeli) { sees = true; seeRate = 0.7; break; }
      // 手配なしでの交通違反
      sightCd -= dt;
      if (sees && stars === 0 && P.inCar && P.speed > 24 && sightCd <= 0) { sightCd = 5; if (reportCrime(ctx.wanted, 'speeding', P.x, P.z, 'police')) ctx.onReported && ctx.onReported('speeding', 'police'); }
    }
    return { sees, seeRate };
  }

  // 犯行の瞬間を警察が見たか
  function witnessCrime(x, z) {
    for (const c of ctx.vehicles.cars) if (c.spec.police && c.driver && !c.wreck && Math.hypot(c.phys.x - x, c.phys.z - z) < WANTED.sightCar && ctx.crowd.lineOfSight(c.phys.x, c.phys.z, x, z, 1.4)) return true;
    for (const a of officers) if (a.alive && !a.hidden && Math.hypot(a.x - x, a.z - z) < WANTED.sightFoot) return true;
    return false;
  }

  function sirenNear(x, z, r) {
    for (const u of units) if (u.ent.siren && Math.hypot(u.ent.phys.x - x, u.ent.phys.z - z) < r) return true;
    return false;
  }

  return { units, officers, helis, blocks, update, witnessCrime, sirenNear, clearAll, isOfficer: (a) => officers.includes(a) };
}
