// 車両物理（自車・警察・NPC共通）。three.jsに依存しない（テスト対象）
// 簡易自転車モデル＋横滑り（駆動方式でアンダー/オーバーが出る）＋サスペンション風の姿勢
import { PHYS } from '../core/config.js';

export function makeVehicle(spec, x, z, heading = 0) {
  return {
    spec, x, z, y: 0, vy: 0, heading, vf: 0, vl: 0, yawRate: 0, steer: 0,
    pitch: 0, roll: 0, gear: 1, rpm: 900, hp: 100, fuel: 1, airborne: false,
    grounded: true, inWater: false, flatTires: 0, crashImpulse: 0, lastHit: 0,
    get speed() { return Math.hypot(this.vf, this.vl); },
  };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// input: {throttle 0..1, brake 0..1, steer -1..1 (+=左), handbrake bool}
// env: {height(x,z), solid(x,z,y), grip(x,z), wet}
export function stepVehicle(v, input, dt, env) {
  const s = v.spec;
  const sin = Math.sin(v.heading), cos = Math.cos(v.heading);
  const L = s.len * 0.62;
  let throttle = v.hp <= 0 || v.fuel <= 0 || v.inWater ? 0 : input.throttle;
  let brake = input.brake;
  const gripSurf = env.grip(v.x, v.z) * (v.flatTires ? 1 - 0.15 * v.flatTires : 1);
  const grip = s.grip * gripSurf;

  // 縦方向
  if (v.grounded) {
    const frac = Math.abs(v.vf) / s.vmax;
    if (throttle > 0) {
      const f = s.accel * throttle * (1 - frac * frac) * (1 + 0.25 * (1 - frac));
      v.vf += f * dt;
    }
    if (brake > 0) {
      if (v.vf > 0.6) v.vf -= 11 * brake * Math.min(1, grip) * dt;
      else v.vf = Math.max(-s.vmax * 0.3, v.vf - s.accel * 0.7 * brake * dt); // バック
    }
    if (input.handbrake) v.vf -= Math.sign(v.vf) * Math.min(Math.abs(v.vf), 5 * dt);
    // 抵抗
    const drag = 0.0009 * v.vf * Math.abs(v.vf) * (1 + s.hgt * 0.2) + Math.sign(v.vf) * 0.25;
    if (!throttle && !brake) v.vf -= Math.sign(v.vf) * Math.min(Math.abs(v.vf), (Math.abs(drag) + 0.6) * dt);
    else v.vf -= drag * dt;
    // 坂道
    const hf = env.height(v.x + sin * L * 0.5, v.z + cos * L * 0.5), hb = env.height(v.x - sin * L * 0.5, v.z - cos * L * 0.5);
    v.vf -= PHYS.gravity * ((hf - hb) / L) * dt;
    v.pitch += (Math.atan2(hf - hb, L) - v.pitch) * Math.min(1, dt * 10);
  }

  // ハンドル（速度が上がるほど切れ角を減らす）
  const steerTarget = clamp(input.steer, -1, 1);
  v.steer += clamp(steerTarget - v.steer, -dt * 4, dt * 4);
  const maxSteer = 0.62 / (1 + Math.abs(v.vf) / 22);
  let targetYaw = v.vf * Math.tan(v.steer * maxSteer) / L;
  // グリップ限界（横加速度 = v*yaw）
  const latMax = grip * PHYS.gravity * 1.05;
  const latNeed = Math.abs(v.vf * targetYaw);
  if (latNeed > latMax && s.drive === 'FF') targetYaw *= latMax / latNeed; // アンダーステア
  // 後輪の滑り（FRのパワーオーバー、サイドブレーキ）
  let rearSlip = 0;
  if (input.handbrake && Math.abs(v.vf) > 4) rearSlip = 0.9;
  if (s.drive === 'FR' && throttle > 0.8 && Math.abs(v.vf) < s.vmax * 0.55 && Math.abs(v.steer) > 0.3) rearSlip = Math.max(rearSlip, 0.45 * (s.accel / 7));
  if (latNeed > latMax * 1.15) rearSlip = Math.max(rearSlip, 0.3);
  if (v.grounded) {
    const yawResp = Math.min(1, dt * (rearSlip ? 4 : 9) * Math.min(1.2, grip));
    v.yawRate += (targetYaw - v.yawRate) * yawResp;
    if (rearSlip) v.yawRate += v.steer * rearSlip * Math.sign(v.vf) * 1.6 * dt;
    // 横滑りの減衰
    const latDecay = grip * PHYS.gravity * dt * (1 - rearSlip * 0.8);
    v.vl -= clamp(v.vl, -latDecay, latDecay);
    // 曲がったぶんの横速度（慣性）
    v.vl += -v.yawRate * v.vf * dt * rearSlip * 0.6;
  } else {
    v.yawRate *= 0.99;
  }
  v.heading += v.yawRate * dt;

  // ワールド速度
  const ns = Math.sin(v.heading), nc = Math.cos(v.heading);
  const vx = v.vf * ns + v.vl * nc, vz = v.vf * nc - v.vl * ns;
  const ox = v.x, oz = v.z;
  let nx = ox + vx * dt, nz = oz + vz * dt;

  // 建物との衝突（車体の角と辺の中点）
  v.crashImpulse = 0;
  if (hitsWorld(v, nx, nz, env)) {
    const hitX = hitsWorld(v, nx, oz, env), hitZ = hitsWorld(v, ox, nz, env);
    const speedBefore = Math.hypot(vx, vz);
    let wx = vx, wz = vz;
    if (hitX) { wx = -vx * PHYS.wallRestitution; nx = ox; }
    if (hitZ) { wz = -vz * PHYS.wallRestitution; nz = oz; }
    if (!hitX && !hitZ) { wx = -vx * PHYS.wallRestitution; wz = -vz * PHYS.wallRestitution; nx = ox; nz = oz; }
    v.vf = wx * ns + wz * nc; v.vl = wx * nc - wz * ns;
    v.yawRate *= 0.5;
    v.crashImpulse = speedBefore;
    if (hitsWorld(v, nx, nz, env)) { nx = ox; nz = oz; }
  }
  v.x = nx; v.z = nz;

  // 高さ・ジャンプ
  const gh = env.height(v.x, v.z);
  if (v.y > gh + 0.35) {
    v.grounded = false; v.vy -= PHYS.gravity * dt; v.y += v.vy * dt;
    if (v.y <= gh) { v.crashImpulse = Math.max(v.crashImpulse, Math.max(0, -v.vy - 6)); v.y = gh; v.vy = 0; v.grounded = true; v.pitch *= 0.3; }
  } else {
    // 坂の頂上で浮く
    const prevSlope = v.pitch;
    const expected = v.y + Math.tan(prevSlope) * v.vf * dt;
    if (v.grounded && expected - gh > 0.2 && v.vf > 15) { v.grounded = false; v.vy = Math.sin(prevSlope) * v.vf * 0.9; v.y = expected; }
    else { v.vy = 0; v.y = gh; v.grounded = true; }
  }
  // 水没
  v.inWater = !!env.water && env.water(v.x, v.z) && v.y < -0.3;
  if (v.inWater) { v.vf *= 0.9; v.vl *= 0.9; }

  // 姿勢（ロール）
  const rollT = clamp(-v.yawRate * v.vf * 0.012 - v.vl * 0.02, -0.12, 0.12);
  v.roll += (rollT - v.roll) * Math.min(1, dt * 6);

  // エンジン回転と変速（5段）
  const frac = Math.abs(v.vf) / s.vmax;
  v.gear = v.vf < -0.5 ? -1 : Math.min(5, 1 + Math.floor(frac * 5.2));
  const inGear = v.gear > 0 ? (frac * 5.2) % 1 : frac * 3;
  v.rpm = 900 + (throttle ? 5200 : 3800) * inGear + throttle * 600;
  // 燃料
  v.fuel = Math.max(0, v.fuel - throttle * dt * 0.0009);
  return v;
}

export function corners(v, x = v.x, z = v.z, shrink = 0) {
  const s = v.spec, hl = s.len / 2 - shrink, hw = s.wid / 2 - shrink;
  const sn = Math.sin(v.heading), cs = Math.cos(v.heading);
  const out = [];
  for (const [a, b] of [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw], [hl, 0], [-hl, 0], [0, hw], [0, -hw]]) {
    out.push([x + sn * a + cs * b, z + cs * a - sn * b]);
  }
  return out;
}
function hitsWorld(v, x, z, env) {
  for (const [px, pz] of corners(v, x, z, 0.1)) if (env.solid(px, pz, v.y + 0.5)) return true;
  return false;
}

// 車同士の衝突（2円で近似）。質量比でインパルスを分配
export function collideVehicles(a, b) {
  const ca = circles(a), cb = circles(b);
  let hit = null;
  for (const p of ca) for (const q of cb) {
    const dx = q[0] - p[0], dz = q[1] - p[1], r = p[2] + q[2];
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) { const d = Math.sqrt(d2) || 0.01; if (!hit || r - d > hit.pen) hit = { nx: dx / d, nz: dz / d, pen: r - d }; }
  }
  if (!hit) return 0;
  const ma = a.spec.mass, mb = b.spec.mass;
  const va = worldVel(a), vb = worldVel(b);
  const rel = (vb[0] - va[0]) * hit.nx + (vb[1] - va[1]) * hit.nz;
  const tot = ma + mb;
  a.x -= hit.nx * hit.pen * mb / tot; a.z -= hit.nz * hit.pen * mb / tot;
  b.x += hit.nx * hit.pen * ma / tot; b.z += hit.nz * hit.pen * ma / tot;
  if (rel < 0) {
    const j = -(1 + 0.3) * rel / (1 / ma + 1 / mb);
    setWorldVel(a, va[0] - j * hit.nx / ma, va[1] - j * hit.nz / ma);
    setWorldVel(b, vb[0] + j * hit.nx / mb, vb[1] + j * hit.nz / mb);
    a.yawRate += (Math.random() - 0.5) * j / ma * 0.3; b.yawRate += (Math.random() - 0.5) * j / mb * 0.3;
    return -rel;
  }
  return 0.01;
}
export function circles(v) {
  const s = v.spec, r = s.wid * 0.55, off = Math.max(0, s.len / 2 - r);
  const sn = Math.sin(v.heading), cs = Math.cos(v.heading);
  const n = s.len > 6 ? 3 : 2;
  const out = [];
  for (let k = 0; k < n; k++) { const o = n === 2 ? (k ? -off : off) : (k - 1) * off; out.push([v.x + sn * o, v.z + cs * o, r]); }
  return out;
}
export function worldVel(v) {
  const sn = Math.sin(v.heading), cs = Math.cos(v.heading);
  return [v.vf * sn + v.vl * cs, v.vf * cs - v.vl * sn];
}
export function setWorldVel(v, vx, vz) {
  const sn = Math.sin(v.heading), cs = Math.cos(v.heading);
  v.vf = vx * sn + vz * cs; v.vl = vx * cs - vz * sn;
}
