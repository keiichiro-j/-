// 主人公（徒歩・運転・乗り降り・体力・拘束）
import { PLAYER, HEIGHTS, PED } from '../core/config.js';
import { solidAt } from '../world/mapgen.js';
import { sampleH, isWater } from '../world/terrain.js';
import { angDiff, clamp } from '../core/rng.js';
import { WEAPON_BY_ID } from '../combat/weapons.js';
import { splash } from '../fx/particles.js';

export const OUTFITS = [
  { name: 'いつものジャケット', top: 0x2f4a3a, bottom: 0x2a2e38, hair: 0x1a1a1a },
  { name: '白シャツ', top: 0xf2f2f2, bottom: 0x1d2433, hair: 0x1a1a1a },
  { name: '赤パーカー', top: 0xc03a30, bottom: 0x3a3a3a, hair: 0x1a1a1a },
  { name: '作業着', top: 0x6a7a8a, bottom: 0x5a6a7a, hair: 0x1a1a1a },
  { name: 'アロハ', top: 0x2aa0c0, bottom: 0xd8c8a0, hair: 0x3a2a1a },
  { name: 'スーツ', top: 0x22262e, bottom: 0x22262e, hair: 0x1a1a1a },
];

export function createPlayer(G, x, z) {
  const a = G.crowd.makeAgent(x, z, { role: 'player', ctrl: 'ext', hp: PLAYER.hp, scale: 1.0, wide: 1.0, outfit: { id: 'player', top: [0x2f4a3a], bottom: [0x2a2e38], sleeve: 'long' }, cSkin: 0xe8bf98 });
  a.noGetup = false;
  const P = {
    agent: a, x, z, y: sampleH(G.world, x, z), vy: 0, heading: 0, speed: 0, onGround: true, crouch: false, swim: false,
    inCar: false, car: null, hp: PLAYER.hp, armor: 0, dead: false, arrest: null, focus: PLAYER.focusMax, outfit: 0, mask: false,
    lastHurt: 99, hostileT: 0, actT: 0, act: null, interactHint: null, stuckT: 0,
  };
  setOutfit(G, P, 0);
  return P;
}

export function setOutfit(G, P, i) {
  const o = OUTFITS[i % OUTFITS.length];
  P.outfit = i % OUTFITS.length;
  G.crowd.setAgentColors(P.agent, { cTop: o.top, cBottom: o.bottom, cHair: o.hair, sleeve: 'long' });
}

export function damagePlayer(G, P, dmg, fromX, fromZ, kind) {
  if (P.dead || G.godMode) return;
  if (P.inCar && kind !== 'explosion') { G.vehicles.damage(P.car, dmg * 0.6); if (Math.random() < 0.15) P.hp -= dmg * 0.3; }
  else {
    const ab = Math.min(P.armor, dmg * 0.7); P.armor -= ab; P.hp -= dmg - ab;
  }
  P.lastHurt = 0;
  G.hud && G.hud.hurt(fromX, fromZ);
  if (P.hp <= 0) { P.hp = 0; P.dead = true; G.onPlayerDead('down'); }
}

// 車に乗る（奪う／盗む）
export function tryEnter(G, P) {
  const car = G.vehicles.nearest(P.x, P.z, 6, (c) => !c.wreck && Math.hypot(c.phys.x - P.x, c.phys.z - P.z) < c.spec.len / 2 + 1.8 && c.spec.len < 9);
  if (!car) return false;
  if (car.mode === 'police' && car.driver === 'cop') return false;
  if (car.driver === 'npc' || car.driver === 'cop') {
    // 運転手を引きずり出す
    const sn = Math.sin(car.phys.heading), cs = Math.cos(car.phys.heading);
    const d = G.crowd.makeAgent(car.phys.x - cs * 1.8, car.phys.z + sn * 1.8);
    if (d) { G.crowd.knock(d, -cs * 2, 1, sn * 2, 5, 'carjack'); d.hp = 100; d.alive = true; d.brave > 0.9 ? (d.afterDown = 'fight') : null; }
    G.crime(car.spec.police ? 'copAttack' : 'carjack', P.x, P.z, { victim: d, melee: true });
  } else if (!car.owned && car.mode === 'parked') {
    // 駐車車両の盗難：警報（防犯レベルで確率）
    if (Math.random() < car.spec.security * 0.14) { car.alarm = 12; G.audio && G.audio.alarm(car); G.crowd.witness('theft', P.x, P.z, { radius: 40, sound: true }); }
    else G.crime('theft', P.x, P.z, {});
    if (car.spec.tracker) G.report('theft', P.x, P.z, 'tracker');
    G.stolenFeature = true;
  }
  car.mode = 'player'; car.driver = 'player'; car.ai = null; car.siren = false;
  car.control = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  P.inCar = true; P.car = car; P.agent.hidden = true; P.agent.inCar = true;
  P.speed = 0;
  G.hud && G.hud.toast(`${car.spec.name}（${car.spec.cls}）`);
  return true;
}

export function exitCar(G, P, force = false) {
  const car = P.car; if (!car) return;
  if (!force && Math.abs(car.phys.vf) > 4) return;
  const p = car.phys, sn = Math.sin(p.heading), cs = Math.cos(p.heading);
  const spots = [[-cs, sn, 1.9], [cs, -sn, 1.9], [-sn, -cs, car.spec.len / 2 + 1], [sn, cs, car.spec.len / 2 + 1]];
  let ox = p.x - cs * 1.9, oz = p.z + sn * 1.9;
  for (const [dx, dz, r] of spots) { const x = p.x + dx * r, z = p.z + dz * r; if (!solidAt(G.world, x, z, p.y + 0.5)) { ox = x; oz = z; break; } }
  P.x = ox; P.z = oz; P.y = sampleH(G.world, ox, oz); P.heading = p.heading;
  car.mode = 'parked'; car.driver = null; car.control = { throttle: 0, brake: 0, steer: 0, handbrake: true };
  if (force) { car.phys.vf *= 0.5; }
  P.inCar = false; P.car = null; P.agent.hidden = false; P.agent.inCar = false;
  P.agent.x = P.x; P.agent.z = P.z;
}

export function updatePlayer(G, P, cmd, dt) {
  const a = P.agent;
  P.lastHurt += dt; P.hostileT = Math.max(0, P.hostileT - dt);
  if (P.hp < 50 && P.lastHurt > 6 && !P.dead) P.hp = Math.min(50, P.hp + dt * 2.5);
  if (P.dead) return;
  // 拘束中
  if (P.arrest) {
    const ar = P.arrest; ar.t -= dt;
    if (cmd.mash || cmd.firePressed) ar.presses++;
    a.poseState = 'handsup'; a.speed = 0;
    if (ar.presses >= ar.need) {
      const c = ar.cop; if (c) G.crowd.damage(c, 20, Math.sin(P.heading), Math.cos(P.heading), 'explosion');
      P.arrest = null; G.crime('copAttack', P.x, P.z, {});
      G.hud && G.hud.toast('振りほどいた！');
    } else if (ar.t <= 0) { P.arrest = null; G.onPlayerDead('busted'); }
    return;
  }
  if (P.inCar) { updateDriving(G, P, cmd, dt); return; }

  if (a.state === 'knocked' || a.state === 'down' || a.state === 'getup') {
    P.x = a.x; P.z = a.z; P.y = a.y; P.speed = 0; return;
  }
  // 移動（カメラ基準）
  const yaw = G.cam.yaw;
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
  let mx = fx * cmd.my + rx * cmd.mx, mz = fz * cmd.my + rz * cmd.mx;
  const mag = Math.min(1, Math.hypot(cmd.mx, cmd.my));
  const n = Math.hypot(mx, mz); if (n > 0.001) { mx /= n; mz /= n; } else { mx = mz = 0; }
  if (cmd.crouch) P.crouch = !P.crouch;
  const aiming = G.combat && G.combat.aiming;
  let speed = PLAYER.run * 0.72;
  if (cmd.run) speed = PLAYER.sprint;
  if (P.crouch) speed = PLAYER.crouch * 1.4;
  if (aiming) speed = Math.min(speed, PLAYER.walk);
  if (G.input.touch.active) speed *= mag > 0.85 ? 1.25 : 0.7;
  speed *= mag;
  // 水
  const water = isWater(G.world, P.x, P.z) && sampleH(G.world, P.x, P.z) < -1.0;
  if (water && !P.swim) splash(P.x, HEIGHTS.water, P.z);
  P.swim = water;
  if (P.swim) speed = Math.min(speed, PLAYER.swim) || 0;
  const vx = mx * speed, vz = mz * speed;
  // 慣性
  const k = Math.min(1, dt * (P.onGround ? 10 : 2));
  P.vx = (P.vx || 0) + (vx - (P.vx || 0)) * k; P.vz = (P.vz || 0) + (vz - (P.vz || 0)) * k;
  const nx = P.x + P.vx * dt, nz = P.z + P.vz * dt;
  const blocked = (x, z) => solidAt(G.world, x, z, P.y + 0.6);
  if (!blocked(nx, nz)) { P.x = nx; P.z = nz; } else if (!blocked(nx, P.z)) P.x = nx; else if (!blocked(P.x, nz)) P.z = nz;
  // 車との接触
  for (const c of G.vehicles.cars) {
    const p = c.phys; const rx2 = P.x - p.x, rz2 = P.z - p.z; if (rx2 * rx2 + rz2 * rz2 > 50) continue;
    const sn = Math.sin(p.heading), cs = Math.cos(p.heading);
    const f = rx2 * sn + rz2 * cs, l = rx2 * cs - rz2 * sn, hl = c.spec.len / 2 + 0.35, hw = c.spec.wid / 2 + 0.35;
    if (Math.abs(f) < hl && Math.abs(l) < hw && P.y < p.y + c.spec.hgt) {
      if (P.y > p.y + c.spec.hgt - 0.6) continue;
      const pf = hl - Math.abs(f), pl = hw - Math.abs(l);
      if (pf < pl) { P.x += sn * Math.sign(f) * pf; P.z += cs * Math.sign(f) * pf; } else { P.x += cs * Math.sign(l) * pl; P.z -= sn * Math.sign(l) * pl; }
    }
  }
  // 高さ・ジャンプ
  let ground = sampleH(G.world, P.x, P.z);
  // 車の屋根に乗れる
  for (const c of G.vehicles.cars) { const p = c.phys; const rx2 = P.x - p.x, rz2 = P.z - p.z; if (rx2 * rx2 + rz2 * rz2 > 30) continue; const sn = Math.sin(p.heading), cs = Math.cos(p.heading); if (Math.abs(rx2 * sn + rz2 * cs) < c.spec.len / 2 && Math.abs(rx2 * cs - rz2 * sn) < c.spec.wid / 2 && P.y >= p.y + c.spec.hgt - 0.6) ground = Math.max(ground, p.y + c.spec.hgt); }
  if (P.swim) ground = Math.max(ground, HEIGHTS.water - 1.15);
  if (cmd.jump && P.onGround && !P.swim) { P.vy = PLAYER.jump; P.onGround = false; P.crouch = false; }
  if (!P.onGround || P.y > ground + 0.05) {
    P.vy -= 9.8 * dt * 1.6; P.y += P.vy * dt; P.onGround = false;
    if (P.y <= ground) { if (P.vy < -15) damagePlayer(G, P, (-P.vy - 15) * 6, P.x, P.z, 'fall'); P.y = ground; P.vy = 0; P.onGround = true; }
  } else { P.y = ground; P.onGround = true; P.vy = 0; }
  P.speed = Math.hypot(P.vx, P.vz);
  // 向き
  if (aiming) P.heading = yaw;
  else if (P.speed > 0.3) P.heading += angDiff(P.heading, Math.atan2(P.vx, P.vz)) * Math.min(1, dt * 12);
  // ポーズ
  const w = G.combat ? G.combat.weapon() : null;
  a.poseState = P.swim ? 'swim' : P.crouch ? 'crouch' : 'walk';
  if (aiming && w && w.kind !== 'melee') a.poseState = w.slot === 'long' ? 'aimLong' : 'aim';
  if (P.act) { P.actT += dt; a.poseState = P.act; a.actT = P.actT / (P.actDur || 0.35); if (P.actT >= (P.actDur || 0.35)) P.act = null; }
  a.aimPitch = aiming ? -G.cam.pitch : 0;
  a.weaponProp = w && w.id !== 'fist' ? (w.prop || (w.slot === 'long' ? 3 : 2)) : 0;
  a.x = P.x; a.z = P.z; a.y = P.y; a.heading = P.heading; a.speed = P.speed; a.vx = P.vx; a.vz = P.vz;
  a.lean = P.crouch ? 0 : 0;
}

function updateDriving(G, P, cmd, dt) {
  const car = P.car, p = car.phys;
  const c = car.control;
  if (cmd.touchDrive && (Math.abs(G.input.touch.mx) + Math.abs(G.input.touch.my)) > 0.2) {
    // スマホ：倒した方向へ向かう
    const tx = G.input.touch.mx, ty = G.input.touch.my;
    const yaw = G.cam.yaw;
    const wx = Math.sin(yaw) * ty - Math.cos(yaw) * tx, wz = Math.cos(yaw) * ty + Math.sin(yaw) * tx;
    const want = Math.atan2(wx, wz), da = angDiff(p.heading, want), mag = Math.min(1, Math.hypot(tx, ty));
    if (Math.abs(da) < 2.3 || p.vf > 3) { c.throttle = mag; c.brake = 0; c.steer = clamp(da * 2.2, -1, 1); }
    else { c.throttle = 0; c.brake = mag; c.steer = clamp(-da * 2, -1, 1); }
    if (G.input.touch.btn.brake) { c.brake = 1; c.throttle = 0; }
  } else {
    c.throttle = cmd.accel; c.brake = cmd.brake; c.steer = cmd.steer;
  }
  c.handbrake = cmd.handbrake;
  if (car.fuelEmpty) c.throttle = 0;
  P.x = p.x; P.z = p.z; P.y = p.y; P.heading = p.heading; P.speed = Math.abs(p.vf);
  P.agent.x = p.x; P.agent.z = p.z;
  if (p.inWater && p.y < -0.6) { exitCar(G, P, true); G.hud && G.hud.toast('車が水没した'); }
  if (car.wreck) { exitCar(G, P, true); }
}
