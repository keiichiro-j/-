// 照準と射撃：即着弾（レイキャスト）、部位別判定、反動と拡散、照準アシスト、近接攻撃、ドライブバイ
/* global THREE */
import { WEAPONS, WEAPON_BY_ID, fireInterval, damageFor, weaponName, addWeapon } from './weapons.js';
import { solidAt } from '../world/mapgen.js';
import { sampleH } from '../world/terrain.js';
import { sparks, splash, burst } from '../fx/particles.js';
import { PLAYER, PED } from '../core/config.js';
import { throwProjectile } from './projectiles.js';

export function createCombat(G) {
  const inv = { weapons: [], cur: 0, stored: [] };
  const S = { aiming: false, cooldown: 0, reloadT: 0, recoil: 0, bloom: 0, combo: 0, comboT: 0, aimTarget: null, focusOn: false, brandishCd: 0, sticky: [], lastShotT: 0 };
  // 弾道（曳光）
  const tracerGeo = new THREE.BufferGeometry();
  const tracerPos = new Float32Array(6 * 40);
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  const tracers = new THREE.LineSegments(tracerGeo, new THREE.LineBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.85 }));
  tracers.frustumCulled = false; G.scene.add(tracers);
  const tracerList = [];
  const flash = new THREE.PointLight(0xffc070, 0, 8); G.scene.add(flash);

  function weapon() { const w = inv.weapons[inv.cur]; return w ? WEAPON_BY_ID[w.id] : WEAPON_BY_ID.fist; }
  function slot() { return inv.weapons[inv.cur]; }
  function select(i) { if (i >= 0 && i < inv.weapons.length) { inv.cur = i; S.reloadT = 0; G.hud && G.hud.toast(weaponName(weapon(), G.settings.mild)); } }
  function cycle(d) {
    const n = inv.weapons.length; if (!n) return;
    let i = inv.cur;
    for (let k = 0; k < n; k++) { i = (i + d + n) % n; const w = WEAPON_BY_ID[inv.weapons[i].id]; if (!G.player.inCar || w.slot === 'hand' && w.kind === 'gun') break; }
    select(i);
  }
  function load(list) { inv.weapons = list.map(w => ({ ...w })); if (!inv.weapons.find(w => w.id === 'fist')) inv.weapons.unshift({ id: 'fist', ammo: 0, clip: 0 }); inv.cur = Math.min(inv.cur, inv.weapons.length - 1); }
  function give(id, ammo) { addWeapon(inv, id, ammo); }

  // レイと人（縦のカプセル）
  function rayPed(o, d, a, maxT) {
    const top = a.state === 'down' || a.state === 'knocked' ? 0.4 : 1.75 * a.scale;
    const bx = a.x, bz = a.z, by0 = a.y + 0.05, by1 = a.y + top;
    // 水平面での最接近
    const dx = o[0] - bx, dz = o[2] - bz;
    const A = d[0] * d[0] + d[2] * d[2]; if (A < 1e-6) return null;
    const t = -(dx * d[0] + dz * d[2]) / A;
    if (t < 0 || t > maxT) return null;
    const px = o[0] + d[0] * t - bx, pz = o[2] + d[2] * t - bz;
    const r = a.state === 'down' ? 0.7 : 0.32;
    if (px * px + pz * pz > r * r) return null;
    const y = o[1] + d[1] * t;
    if (y < by0 || y > by1) return null;
    const rel = (y - a.y) / (a.scale || 1);
    const part = a.state === 'down' ? 'body' : rel > 1.5 ? 'head' : rel < 0.9 ? 'limb' : 'body';
    return { t, part };
  }
  function rayCar(o, d, c, maxT) {
    const p = c.phys, sn = Math.sin(p.heading), cs = Math.cos(p.heading);
    const rx = o[0] - p.x, rz = o[2] - p.z, ry = o[1] - p.y;
    const lo = [rx * cs - rz * sn, ry, rx * sn + rz * cs];
    const ld = [d[0] * cs - d[2] * sn, d[1], d[0] * sn + d[2] * cs];
    const half = [c.spec.wid / 2, c.spec.hgt, c.spec.len / 2], lo0 = [-half[0], 0.2, -half[2]];
    let t0 = 0, t1 = maxT;
    for (let k = 0; k < 3; k++) {
      const mn = k === 1 ? 0.2 : lo0[k], mx = k === 1 ? half[1] : half[k];
      if (Math.abs(ld[k]) < 1e-6) { if (lo[k] < mn || lo[k] > mx) return null; continue; }
      let a = (mn - lo[k]) / ld[k], b = (mx - lo[k]) / ld[k]; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return null;
    }
    // タイヤの位置に当たったらパンク
    const hit = [lo[0] + ld[0] * t0, lo[1] + ld[1] * t0, lo[2] + ld[2] * t0];
    const tire = hit[1] < 0.75 && Math.abs(Math.abs(hit[2]) - (c.spec.len / 2 - 0.8)) < 0.6;
    return { t: t0, tire };
  }
  function rayWorld(o, d, maxT) {
    for (let t = 0.5; t < maxT; t += 0.5) {
      const x = o[0] + d[0] * t, y = o[1] + d[1] * t, z = o[2] + d[2] * t;
      if (solidAt(G.world, x, z, y) || y < sampleH(G.world, x, z)) return t;
    }
    return null;
  }

  function castRay(o, d, range, skipT = 0) {
    let best = { t: rayWorld(o, d, range) ?? range, type: 'none' };
    if (best.t < range) best.type = 'world';
    for (const a of G.crowd.query(o[0] + d[0] * range / 2, o[2] + d[2] * range / 2, range / 2 + 2)) {
      if (a.hidden || a.role === 'player') continue;
      const h = rayPed(o, d, a, best.t); if (h && h.t > skipT && h.t < best.t) best = { t: h.t, type: 'ped', agent: a, part: h.part };
    }
    for (const c of G.vehicles.cars) {
      if (c === G.player.car) continue;
      if (Math.hypot(c.phys.x - o[0], c.phys.z - o[2]) > range + 6) continue;
      const h = rayCar(o, d, c, best.t); if (h && h.t > skipT && h.t < best.t) best = { t: h.t, type: 'car', car: c, tire: h.tire };
    }
    return best;
  }

  function addTracer(a, b) {
    tracerList.push({ a, b, t: 0.06 });
    if (tracerList.length > 40) tracerList.shift();
  }

  function muzzle() {
    const P = G.player;
    if (P.inCar) { const p = P.car.phys; return [p.x - Math.cos(p.heading) * 0.9, p.y + 1.3, p.z + Math.sin(p.heading) * 0.9]; }
    const h = P.heading;
    return [P.x + Math.sin(h) * 0.55 - Math.cos(h) * 0.25, P.y + 1.4, P.z + Math.cos(h) * 0.55 + Math.sin(h) * 0.25];
  }

  // 照準アシスト：コーン内の最も近い標的
  function findAssist(o, f, cone, range) {
    let best = null, bs = cone;
    for (const a of G.crowd.query(o[0], o[2], range)) {
      if (a.hidden || a.role === 'player' || !a.alive || a.state === 'down') continue;
      const tx = a.x - o[0], ty = a.y + 1.2 - o[1], tz = a.z - o[2], d = Math.hypot(tx, ty, tz);
      const ang = Math.acos(Math.max(-1, Math.min(1, (tx * f[0] + ty * f[1] + tz * f[2]) / d)));
      const score = ang - (a.role === 'cop' ? 0.05 : 0);
      if (score < bs && G.crowd.lineOfSight(o[0], o[2], a.x, a.z, 1.5)) { bs = score; best = a; }
    }
    return best;
  }

  function hitAgent(a, w, part, dist, dir, kind = 'gun') {
    const P = G.player;
    const dmg = kind === 'melee' ? w.dmg * (1 + S.combo * 0.25) : damageFor(w, part, dist);
    if (G.settings.mild) {
      burst(a.x, a.y + 1.2, a.z, 10, { color: [0xff5ab4, 0x5ad0ff, 0xffe14a][Math.floor(Math.random() * 3)], speed: 2, life: 0.6, size: 0.1, gravity: 6 });
    } else sparks(a.x, a.y + 1.2, a.z, 0xdddddd);
    if (w.stun) { G.crowd.damage(a, 0, dir[0], dir[2], 'stun'); }
    else G.crowd.damage(a, dmg, dir[0], dir[2], kind === 'melee' ? 'melee' : 'gun', P);
    if (a.role === 'cop') G.crime('copAttack', P.x, P.z, { victim: a, melee: kind === 'melee' });
    else G.crime('assault', P.x, P.z, { victim: a, melee: kind === 'melee' });
    G.hud && G.hud.hitMarker(!a.alive);
    P.focus = Math.min(PLAYER.focusMax, P.focus + 4);
  }

  function fireGun(w, sl) {
    const P = G.player, cam = G.cam;
    const f = cam.forward();
    const o = [cam.camera.position.x, cam.camera.position.y, cam.camera.position.z];
    const skip = Math.hypot(o[0] - P.x, o[2] - P.z) + 0.5;
    const pellets = w.pellets || 1;
    const spreadBase = (w.spread || 0.01) * (S.aiming ? 1 : 2.2) * (P.crouch ? 0.5 : 1) * (1 + S.bloom);
    const m = muzzle();
    for (let k = 0; k < pellets; k++) {
      const d = [f[0] + (Math.random() - 0.5) * spreadBase * 2, f[1] + (Math.random() - 0.5) * spreadBase * 2, f[2] + (Math.random() - 0.5) * spreadBase * 2];
      const l = Math.hypot(...d); d[0] /= l; d[1] /= l; d[2] /= l;
      const range = w.range * 1.6;
      const hit = castRay(o, d, range, skip);
      const hp = [o[0] + d[0] * hit.t, o[1] + d[1] * hit.t, o[2] + d[2] * hit.t];
      addTracer(m, hp);
      const dist = Math.hypot(hp[0] - P.x, hp[2] - P.z);
      if (hit.type === 'ped') hitAgent(hit.agent, w, hit.part, dist, d);
      else if (hit.type === 'car') {
        const c = hit.car;
        G.vehicles.damage(c, w.dmg * 0.35, 'player'); c.lastAttacker = 'player';
        if (hit.tire) c.phys.flatTires = Math.min(4, c.phys.flatTires + 1);
        if (c.spec.police) G.crime('copAttack', P.x, P.z, {});
        sparks(hp[0], hp[1], hp[2]);
        if (c.driver === 'npc' && c.mode !== 'player') { c.mode = 'free'; }
      } else if (hit.type === 'world') {
        if (G.settings.mild) burst(hp[0], hp[1], hp[2], 5, { color: 0x5ad0ff, speed: 1.5, life: 0.5, size: 0.08, gravity: 5 });
        else sparks(hp[0], hp[1], hp[2]);
        if (hp[1] < 0) splash(hp[0], -0.4, hp[2]);
      }
    }
    // 反動：照準が上に跳ねる
    const kick = w.recoil * (P.crouch ? 0.5 : 1) * (0.7 + Math.random() * 0.6);
    cam.pitch -= kick; S.kick = (S.kick || 0) + kick * 0.8;
    cam.yaw += (Math.random() - 0.5) * w.recoil * 0.5;
    S.bloom = Math.min(2.5, S.bloom + 0.35);
    flash.position.set(m[0], m[1], m[2]); flash.intensity = 2.2;
    G.audio && G.audio.gun(w, G.settings.mild);
    G.crime('shooting', P.x, P.z, { kind: 'gun', sound: true, radius: PED.hearGun * (sl.suppressor ? 0.25 : 1) });
    P.hostileT = 6;
    S.lastShotT = G.time;
  }

  function melee(w) {
    const P = G.player;
    S.combo = S.comboT > 0 ? (S.combo + 1) % 3 : 0; S.comboT = 0.7;
    P.act = w.id === 'fist' ? 'punch' : 'swing'; P.actT = 0; P.actDur = w.id === 'fist' ? 0.32 : 0.45;
    setTimeout(() => {
      const fx = Math.sin(P.heading), fz = Math.cos(P.heading);
      let hitAny = false;
      for (const a of G.crowd.query(P.x + fx * 0.8, P.z + fz * 0.8, w.range + 0.8)) {
        if (a.role === 'player' || a.hidden || a.state === 'knocked') continue;
        const rx = a.x - P.x, rz = a.z - P.z, d = Math.hypot(rx, rz);
        if (d > w.range + 0.6 || (rx * fx + rz * fz) / (d || 1) < 0.4) continue;
        hitAgent(a, w, 'body', d, [fx, 0, fz], 'melee'); hitAny = true;
        break;
      }
      if (!hitAny) {
        const c = G.vehicles.nearest(P.x + fx, P.z + fz, 2.2);
        if (c && c !== P.car) { G.vehicles.damage(c, w.dmg * 0.15, 'player'); sparks(P.x + fx, P.y + 1, P.z + fz); }
      }
      G.audio && G.audio.whoosh(hitAny);
    }, 130);
  }

  function throwIt(w, sl) {
    const P = G.player, f = G.cam.forward();
    P.act = 'throw'; P.actT = 0; P.actDur = 0.5;
    const m = [P.x + Math.sin(P.heading) * 0.4, P.y + 1.7, P.z + Math.cos(P.heading) * 0.4];
    const sp = 15;
    throwProjectile(G, { type: w.id, x: m[0], y: m[1], z: m[2], vx: f[0] * sp + P.vx * 0.5 || f[0] * sp, vy: (f[1] + 0.35) * sp, vz: f[2] * sp + P.vz * 0.5 || f[2] * sp, w });
    sl.clip--; if (sl.clip <= 0) { inv.weapons.splice(inv.cur, 1); inv.cur = 0; }
  }

  function update(cmd, dt) {
    const P = G.player;
    if (P.dead || P.arrest) { S.aiming = false; return; }
    const w = weapon(), sl = slot();
    S.cooldown -= dt; S.comboT -= dt; S.bloom = Math.max(0, S.bloom - dt * 2.5); S.brandishCd -= dt;
    flash.intensity = Math.max(0, flash.intensity - dt * 30);
    // 反動は少しずつ戻る
    if (S.kick > 0) { const r = Math.min(S.kick, dt * 0.5); G.cam.pitch += r; S.kick -= r; }
    if (cmd.digit) { const i = cmd.digit - 1; if (i < inv.weapons.length) select(i); }
    if (cmd.next) cycle(1); if (cmd.prev) cycle(-1);
    const canAimInCar = P.inCar && w.kind === 'gun' && w.slot === 'hand';
    S.aiming = !!cmd.aim && (!P.inCar || canAimInCar) && w.kind !== 'melee' || (!!cmd.aim && w.kind === 'melee' && !P.inCar && false);
    S.scope = S.aiming && !!w.scope;
    // 照準アシスト
    G.cam.assistK = 1;
    if (S.aiming && G.settings.aimAssist !== 'off') {
      const o = [G.cam.camera.position.x, G.cam.camera.position.y, G.cam.camera.position.z], f = G.cam.forward();
      const tgt = findAssist(o, f, G.settings.aimAssist === 'strong' ? 0.3 : 0.08, Math.min(60, w.range * 1.2));
      if (tgt) {
        if (G.settings.aimAssist === 'strong') {
          const head = S.focusOn ? 1.62 : 1.2;
          const tx = tgt.x - o[0], ty = tgt.y + head * tgt.scale - o[1], tz = tgt.z - o[2];
          const yaw = Math.atan2(tx, tz), pitch = -Math.atan2(ty, Math.hypot(tx, tz));
          let dy = yaw - G.cam.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
          G.cam.yaw += dy * Math.min(1, dt * 10); G.cam.pitch += (pitch - G.cam.pitch) * Math.min(1, dt * 10);
        } else G.cam.assistK = 0.5;
      }
      S.aimTarget = tgt;
      // 武器を向けられた人は手を挙げる／逃げる・通報
      if (S.brandishCd <= 0 && w.kind !== 'melee') { S.brandishCd = 2.5; G.crime('brandish', P.x, P.z, { kind: 'aim', radius: PED.seeWeapon, directTarget: tgt }); }
    } else S.aimTarget = null;
    // 長い銃を見せて歩くと通報されやすい
    if (!P.inCar && w.slot === 'long' && S.brandishCd <= 0 && Math.random() < dt * 0.3) { S.brandishCd = 4; G.crime('brandish', P.x, P.z, { kind: 'aim', radius: 12 }); }
    // リロード
    if (S.reloadT > 0) { S.reloadT -= dt; if (S.reloadT <= 0) finishReload(); return; }
    if (cmd.reload && w.kind === 'gun' && sl.clip < w.mag && sl.ammo > 0) { S.reloadT = 1.4; G.audio && G.audio.click(); return; }
    // 攻撃
    const trigger = w.auto ? cmd.fire : cmd.firePressed;
    if (w.kind === 'melee') { if (cmd.firePressed && S.cooldown <= 0 && !P.inCar) { melee(w); S.cooldown = 0.38; } return; }
    if (w.kind === 'throw') { if ((cmd.firePressed || cmd.throw) && S.cooldown <= 0 && !P.inCar) { throwIt(w, sl); S.cooldown = 0.8; } return; }
    if (cmd.throw && !P.inCar) { const g = inv.weapons.findIndex(x => WEAPON_BY_ID[x.id].kind === 'throw'); if (g >= 0) { const prev = inv.cur; inv.cur = g; throwIt(WEAPON_BY_ID[inv.weapons[g].id], inv.weapons[g]); inv.cur = Math.min(prev, inv.weapons.length - 1); S.cooldown = 0.8; } return; }
    if (trigger && S.cooldown <= 0 && (S.aiming || P.inCar || G.input.touch.active || cmd.fire)) {
      if (P.inCar && !canAimInCar) return;
      if (sl.clip <= 0) { if (sl.ammo > 0) S.reloadT = 1.4; else { G.hud && G.hud.toast('弾切れ'); S.cooldown = 0.5; } return; }
      sl.clip--;
      S.cooldown = fireInterval(w);
      if (w.kind === 'gun') fireGun(w, sl);
      else if (w.kind === 'proj') {
        const f = G.cam.forward(), m = muzzle();
        throwProjectile(G, { type: w.id, x: m[0] + f[0], y: m[1] + f[1], z: m[2] + f[2], vx: f[0] * w.speed, vy: f[1] * w.speed + (w.arc ? 5 : 0), vz: f[2] * w.speed, w, rocket: !w.arc });
        G.audio && G.audio.gun(w, G.settings.mild); G.cam.shake = 0.15; P.hostileT = 8;
        G.crime('shooting', P.x, P.z, { kind: 'gun', sound: true, radius: PED.hearGun });
      } else if (w.kind === 'spray') {
        sprayExtinguisher();
      }
      if (sl.clip <= 0 && sl.ammo > 0) S.reloadT = 1.4;
    }
  }
  function finishReload() { const w = weapon(), sl = slot(); const need = w.mag - sl.clip, take = Math.min(need, sl.ammo); sl.clip += take; sl.ammo -= take; }
  function sprayExtinguisher() {
    const P = G.player, f = G.cam.forward();
    for (let k = 0; k < 3; k++) G.fx.spawn(P.x + f[0], P.y + 1.3, P.z + f[2], { vx: f[0] * 9 + (Math.random() - 0.5) * 2, vy: f[1] * 9 + Math.random(), vz: f[2] * 9 + (Math.random() - 0.5) * 2, life: 0.6, size: 0.3, grow: 1.2, color: 0xffffff, color2: 0xdddddd, drag: 2 });
    const c = G.vehicles.nearest(P.x + f[0] * 4, P.z + f[2] * 4, 4);
    if (c && c.explodeT > 0) { c.explodeT = -1; c.phys.hp = Math.max(c.phys.hp, 8); G.hud && G.hud.toast('消火した'); }
    for (const a of G.crowd.query(P.x + f[0] * 3, P.z + f[2] * 3, 2.5)) if (a.role !== 'player' && a.alive) { a.vx += f[0] * 2; a.vz += f[2] * 2; }
  }

  function renderFx(dt) {
    let n = 0;
    for (let i = tracerList.length - 1; i >= 0; i--) { tracerList[i].t -= dt; if (tracerList[i].t <= 0) tracerList.splice(i, 1); }
    for (const tr of tracerList) { tracerPos.set([...tr.a, ...tr.b], n * 6); n++; }
    tracerGeo.setDrawRange(0, n * 2);
    tracerGeo.attributes.position.needsUpdate = true;
    tracers.material.color.setHex(G.settings.mild ? 0x7ad8ff : 0xfff0b0);
  }

  // 警官の射撃（命中率は距離・移動・しゃがみで変わる）
  function copShoot(a, P, d) {
    const m = [a.x + Math.sin(a.heading) * 0.5, a.y + 1.4, a.z + Math.cos(a.heading) * 0.5];
    let chance = 0.55 - d * 0.012 - Math.min(0.25, P.speed * 0.03) - (P.crouch ? 0.15 : 0) - (P.inCar ? 0.05 : 0);
    const hit = Math.random() < chance;
    const tgt = [P.x + (hit ? 0 : (Math.random() - 0.5) * 3), P.y + 1.2 + (hit ? 0 : Math.random() * 1.5), P.z + (hit ? 0 : (Math.random() - 0.5) * 3)];
    addTracer(m, tgt);
    G.audio && G.audio.gun(WEAPON_BY_ID.pistol, G.settings.mild, Math.hypot(a.x - G.cam.x, a.z - G.cam.z));
    G.crowd.witness(null, a.x, a.z, { kind: 'gun', radius: 60, sound: true });
    if (hit) G.damagePlayer(9 + Math.random() * 5, a.x, a.z, 'gun');
  }

  return { inv, S, weapon, slot, select, cycle, load, give, update, renderFx, copShoot, castRay,
    get aiming() { return S.aiming; }, get scope() { return S.scope; }, get reloading() { return S.reloadT > 0; } };
}
