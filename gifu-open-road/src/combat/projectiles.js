// 投擲物・ロケット・爆発と火（爆発は半径内の人と車に距離減衰のダメージと吹き飛ばし）
/* global THREE */
import { solidAt } from '../world/mapgen.js';
import { sampleH } from '../world/terrain.js';
import { explosionFx, smoke, spawn } from '../fx/particles.js';
import { emit, on } from '../core/events.js';

const list = [];
let geo, mats;

export function throwProjectile(G, o) {
  if (!geo) { geo = new THREE.SphereGeometry(0.12, 6, 4); mats = { grenade: new THREE.MeshLambertMaterial({ color: 0x3a4a2a }), sticky: new THREE.MeshLambertMaterial({ color: 0xc0a020 }), smoke: new THREE.MeshLambertMaterial({ color: 0x8a8a8a }), rpg: new THREE.MeshLambertMaterial({ color: 0x5a6a3a }), gl: new THREE.MeshLambertMaterial({ color: 0x4a4a4a }) }; }
  const mesh = new THREE.Mesh(geo, mats[o.type] || mats.grenade);
  if (o.rocket) mesh.scale.set(1.2, 1.2, 4);
  G.scene.add(mesh);
  const p = { ...o, mesh, t: 0, fuse: o.w.fuse || (o.type === 'gl' ? 6 : 99), stuck: null, done: false, smokeT: 0 };
  list.push(p);
  return p;
}

export function detonateSticky(G) {
  let n = 0;
  for (const p of list) if (p.type === 'sticky' && !p.done) { explode(G, p); n++; }
  return n;
}

function explode(G, p) {
  p.done = true; G.scene.remove(p.mesh);
  if (p.w.smoke) { p.smokeT = 10; p.smoking = true; list.push(p); return; }
  emit('explosion', { x: p.x, y: p.y, z: p.z, r: p.w.radius || 5, dmg: p.w.dmg, source: 'player' });
}

export function updateProjectiles(G, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    if (p.smoking) {
      p.smokeT -= dt; if (Math.random() < dt * 25) spawn(p.x, p.y + 0.3, p.z, { vy: 1.2, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2, life: 4, size: 0.8, grow: 1.4, color: 0xcfcfcf, color2: 0x9a9a9a, drag: 0.8 });
      if (p.smokeT <= 0) list.splice(i, 1);
      continue;
    }
    if (p.done) { list.splice(i, 1); continue; }
    p.t += dt;
    if (p.stuck) { p.x = p.stuck.phys.x + p.sx; p.z = p.stuck.phys.z + p.sz; p.y = p.stuck.phys.y + 1.2; }
    else {
      if (!p.rocket) p.vy -= 9.8 * dt;
      else if (Math.random() < 0.8) smoke(p.x, p.y, p.z, false);
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      const gh = sampleH(G.world, nx, nz);
      let hit = solidAt(G.world, nx, nz, ny) || ny < gh;
      // 車・人への直撃
      let hitCar = null;
      for (const c of G.vehicles.cars) { if (c === G.player.car) continue; if (Math.hypot(c.phys.x - nx, c.phys.z - nz) < c.spec.len / 2 && ny < c.phys.y + c.spec.hgt) { hitCar = c; break; } }
      if (hitCar && p.type === 'sticky') { p.stuck = hitCar; p.sx = p.x - hitCar.phys.x; p.sz = p.z - hitCar.phys.z; p.vx = p.vy = p.vz = 0; }
      else if (hit || hitCar || (p.rocket && G.crowd.query(nx, nz, 1).some(a => a.role !== 'player' && !a.hidden))) {
        if (p.rocket || p.type === 'gl') { p.x = nx; p.y = Math.max(ny, gh + 0.2); p.z = nz; explode(G, p); list.splice(i, 1); continue; }
        if (p.type === 'sticky') { p.vx = p.vy = p.vz = 0; p.y = Math.max(gh + 0.1, p.y); p.fixed = true; }
        else {
          // 跳ねる
          if (solidAt(G.world, nx, p.z, p.y)) p.vx *= -0.4; else if (solidAt(G.world, p.x, nz, p.y)) p.vz *= -0.4;
          if (ny < gh) { p.vy = Math.abs(p.vy) * 0.35; p.vx *= 0.6; p.vz *= 0.6; p.y = gh + 0.12; }
        }
      } else if (!p.fixed) { p.x = nx; p.y = ny; p.z = nz; }
    }
    p.mesh.position.set(p.x, p.y, p.z);
    if (p.rocket) p.mesh.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz);
    if (p.t > (p.rocket ? 5 : p.fuse)) { explode(G, p); if (!p.smoking) list.splice(i, 1); }
  }
}

// 爆発のダメージ処理（イベントで受ける）
export function initExplosions(G) {
  on('explosion', (e) => {
    explosionFx(e.x, e.y, e.z, e.r / 5, G.settings.mild);
    G.audio && G.audio.boom(Math.hypot(e.x - G.cam.x, e.z - G.cam.z), G.settings.mild);
    const dc = Math.hypot(e.x - G.cam.x, e.z - G.cam.z);
    G.cam.shake = Math.max(G.cam.shake, Math.max(0, 1.2 - dc / 60));
    for (const a of G.crowd.query(e.x, e.z, e.r * 1.6)) {
      if (a.hidden) continue;
      const dx = a.x - e.x, dz = a.z - e.z, d = Math.hypot(dx, dz) || 0.1;
      const k = Math.max(0, 1 - d / (e.r * 1.6));
      if (a.role === 'player') { G.damagePlayer(e.dmg * k * 0.7, e.x, e.z, 'explosion'); if (k > 0.3 && !G.player.inCar) G.crowd.knock(a, dx / d * 6 * k, 5 * k, dz / d * 6 * k, 0, 'explosion'); continue; }
      G.crowd.damage(a, e.dmg * k, dx / d * k * 1.5, dz / d * k * 1.5, 'explosion');
      if (a.role === 'cop' && e.source === 'player') G.crime('copAttack', G.player.x, G.player.z, {});
    }
    for (const c of G.vehicles.cars) {
      if (c === e.car) continue;
      const dx = c.phys.x - e.x, dz = c.phys.z - e.z, d = Math.hypot(dx, dz) || 0.1;
      if (d > e.r * 1.8) continue;
      const k = Math.max(0, 1 - d / (e.r * 1.8));
      G.vehicles.damage(c, e.dmg * k * 0.8, e.source === 'player' ? 'player' : null);
      const sn = Math.sin(c.phys.heading), cs = Math.cos(c.phys.heading);
      const ix = dx / d * 9 * k * 1500 / c.spec.mass, iz = dz / d * 9 * k * 1500 / c.spec.mass;
      c.phys.vf += ix * sn + iz * cs; c.phys.vl += ix * cs - iz * sn; c.phys.vy += 4 * k * 1500 / c.spec.mass; c.phys.y += 0.1;
      c.phys.yawRate += (Math.random() - 0.5) * 3 * k;
    }
    // 人を巻き込む可能性がある爆発は重罪
    if (e.source === 'player') G.crime('explosion', e.x, e.z, { kind: 'explosion', sound: true, radius: 120 });
    G.crowd.witness(null, e.x, e.z, { kind: 'explosion', radius: 120, sound: true });
  });
}
