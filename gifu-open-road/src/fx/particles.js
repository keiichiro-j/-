// パーティクル（煙・火花・爆発・紙吹雪・水しぶき）。InstancedMesh 1つで描画
/* global THREE */
const MAX = 500;
let mesh, items = [], _m, _q, _s, _p, _c;

export function initParticles(scene) {
  const geo = new THREE.IcosahedronGeometry(0.5, 0);
  mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }), MAX);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  _m = new THREE.Matrix4(); _q = new THREE.Quaternion(); _s = new THREE.Vector3(); _p = new THREE.Vector3(); _c = new THREE.Color();
  for (let i = 0; i < MAX; i++) mesh.setColorAt(i, _c.set(0xffffff));
  mesh.count = 0;
  scene.add(mesh);
}

// opts: {vx,vy,vz,life,size,grow,color,color2,gravity,drag}
export function spawn(x, y, z, o = {}) {
  if (items.length >= MAX) items.shift();
  items.push({ x, y, z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life || 1, t: 0, size: o.size || 0.4, grow: o.grow || 0,
    c1: new THREE.Color(o.color ?? 0xffffff), c2: new THREE.Color(o.color2 ?? o.color ?? 0xffffff), g: o.gravity || 0, drag: o.drag ?? 0.5, rot: Math.random() * 6 });
}

export function burst(x, y, z, n, o) {
  for (let i = 0; i < n; i++) {
    const sp = o.speed || 4;
    spawn(x, y, z, { ...o, vx: (Math.random() - 0.5) * sp * 2, vy: Math.random() * sp * (o.up ?? 1), vz: (Math.random() - 0.5) * sp * 2, life: (o.life || 1) * (0.6 + Math.random() * 0.8), size: (o.size || 0.4) * (0.6 + Math.random() * 0.8) });
  }
}

export function updateParticles(dt) {
  if (!mesh) return;
  let n = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    const p = items[i];
    p.t += dt;
    if (p.t >= p.life) { items.splice(i, 1); continue; }
  }
  for (const p of items) {
    p.vy -= p.g * dt; const d = Math.max(0, 1 - p.drag * dt);
    p.vx *= d; p.vy *= d; p.vz *= d;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < -2) p.y = -2;
    const k = p.t / p.life;
    const s = Math.max(0.01, p.size + p.grow * p.t) * (k > 0.8 ? (1 - k) * 5 : 1);
    _q.setFromAxisAngle(_p.set(0.3, 1, 0.2).normalize(), p.rot + p.t);
    _s.setScalar(s); _p.set(p.x, p.y, p.z);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(n, _m);
    mesh.setColorAt(n, _c.copy(p.c1).lerp(p.c2, k));
    n++;
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

// 爆発の演出（白い閃光→橙の球→黒煙・破片）。血や人体の欠損は描かない
export function explosionFx(x, y, z, scale = 1, mild = false) {
  if (mild) {
    burst(x, y + 0.5, z, 60, { color: 0xff5ab4, color2: 0x5ad0ff, speed: 9 * scale, life: 1.6, size: 0.22, gravity: 6, drag: 0.8 });
    burst(x, y + 0.5, z, 40, { color: 0xffe14a, color2: 0x7aff6a, speed: 7 * scale, life: 1.8, size: 0.2, gravity: 5, drag: 0.8 });
    return;
  }
  spawn(x, y + 1, z, { color: 0xffffff, color2: 0xffd27a, life: 0.18, size: 3 * scale, grow: 20 * scale });
  burst(x, y + 1, z, 18, { color: 0xffb347, color2: 0xd2401a, speed: 5 * scale, life: 0.7, size: 1.1 * scale, grow: 1.5, drag: 2, up: 0.8 });
  burst(x, y + 1.5, z, 16, { color: 0x3a3a3a, color2: 0x777777, speed: 2.5 * scale, life: 2.6, size: 1.2 * scale, grow: 1.4, gravity: -1.5, drag: 1 });
  burst(x, y + 0.5, z, 14, { color: 0x2b2b2b, speed: 10 * scale, life: 1.2, size: 0.18, gravity: 14, drag: 0.3 });
}
export function smoke(x, y, z, dark) {
  spawn(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, { vy: 1.4, vx: (Math.random() - 0.5), vz: (Math.random() - 0.5), life: 1.8, size: 0.35, grow: 0.7, color: dark ? 0x222222 : 0xdddddd, color2: dark ? 0x555555 : 0xaaaaaa, drag: 0.6 });
}
export function sparks(x, y, z, color = 0xffe08a) { burst(x, y, z, 6, { color, color2: 0xff7a2a, speed: 3, life: 0.35, size: 0.07, gravity: 9 }); }
export function splash(x, y, z, color = 0x9ad8ff) { burst(x, y, z, 8, { color, speed: 2.5, life: 0.6, size: 0.12, gravity: 9, up: 1.5 }); }
