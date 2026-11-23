// 車のローポリモデル（結合メッシュ、車種×色でキャッシュ）
/* global THREE */
import { GeoBuilder, hex, shade } from '../fx/geom.js';

const cache = new Map();
const GLASS = hex(0x1c2733), TIRE = hex(0x1a1a1a), RIM = hex(0x9a9ea4), BLACK = hex(0x202224), LIGHT = hex(0xf6f2da), TAIL = hex(0x8a1010);

export function vehicleGeometry(spec, color) {
  const key = spec.name + '|' + color;
  if (cache.has(key)) return cache.get(key);
  const g = new GeoBuilder();
  const c = hex(color), cd = shade(c, 0.8);
  const L = spec.len, W = spec.wid, H = spec.hgt;
  const wheelR = Math.min(0.42, H * 0.24) + (spec.mass > 5000 ? 0.12 : 0);
  const clr = wheelR * 0.75;
  const st = spec.style;
  const bodyH = st === 'bus' || st === 'truck' || st === 'van' ? H - clr : st === 'super' ? H * 0.5 : st === 'coupe' ? H * 0.5 : H * 0.48;
  // 車体下部
  if (st === 'truck') {
    g.box(0, clr + 0.55, L / 2 - 1.0, W, 1.9, 2.0, c);                      // キャブ
    g.box(0, clr + 1.25, L / 2 - 0.02, W * 0.86, 0.8, 0.05, GLASS);
    g.box(0, clr + 1.0, -0.9, W, 2.6, L - 2.4, spec.police ? c : hex(0xe8e8e8)); // 荷台
    g.box(0, clr + 0.15, 0, W * 0.9, 0.3, L, BLACK);
  } else if (st === 'bus') {
    g.box(0, clr + bodyH / 2, 0, W, bodyH, L, c);
    g.box(0, clr + bodyH * 0.62, 0, W + 0.02, bodyH * 0.38, L * 0.9, GLASS);
    g.box(0, clr + 0.35, 0, W + 0.03, 0.25, L, hex(0x2a7a4a));
    g.box(0, clr + bodyH * 0.55, L / 2, W * 0.9, bodyH * 0.5, 0.05, GLASS);
  } else {
    g.box(0, clr + bodyH / 2, 0, W, bodyH, L, c);
    g.box(0, clr + 0.15, L / 2 - 0.02, W * 1.0, 0.26, 0.1, BLACK);
    g.box(0, clr + 0.15, -L / 2 + 0.02, W * 1.0, 0.26, 0.1, BLACK);
    // キャビン
    let cl = L * 0.5, cz = -L * 0.05, ch = H - clr - bodyH, cw = W * 0.86;
    if (st === 'wagon') { cl = L * 0.72; cz = -L * 0.08; }
    if (st === 'suv') { cl = L * 0.62; cz = -L * 0.1; }
    if (st === 'van') { cl = 0; }
    if (st === 'ktruck') { cl = L * 0.3; cz = L * 0.28; g.box(0, clr + bodyH + 0.2, -L * 0.2, W, 0.4, L * 0.55, shade(c, 0.9)); }
    if (st === 'coupe' || st === 'super') { cl = L * 0.38; cz = -L * 0.06; }
    if (cl > 0) {
      g.box(0, clr + bodyH + ch / 2, cz, cw, ch, cl, cd);
      g.box(0, clr + bodyH + ch * 0.5, cz, cw + 0.03, ch * 0.62, cl * 0.8, GLASS);
      g.box(0, clr + bodyH + ch * 0.5, cz + cl / 2 + 0.01, cw * 0.9, ch * 0.7, 0.04, GLASS);
      g.box(0, clr + bodyH + ch * 0.5, cz - cl / 2 - 0.01, cw * 0.9, ch * 0.6, 0.04, GLASS);
    } else {
      g.box(0, clr + bodyH * 0.72, L / 2 - 0.6, W * 0.9, bodyH * 0.3, 0.9, GLASS);
    }
    if (spec.police) {
      // 白黒ツートン
      g.box(0, clr + bodyH * 0.35, 0, W + 0.02, bodyH * 0.7, L * 0.98, hex(0x15171a));
    }
    if (spec.taxi) g.box(0, H + 0.12, cz, 0.5, 0.24, 0.25, hex(0xfafafa));
    if (st === 'super') g.box(0, clr + bodyH + 0.35, -L / 2 + 0.3, W * 0.9, 0.08, 0.4, BLACK);
  }
  // 灯火（車体に埋め込み）
  g.box(W * 0.33, clr + bodyH * 0.65, L / 2 + 0.01, W * 0.22, 0.14, 0.04, LIGHT);
  g.box(-W * 0.33, clr + bodyH * 0.65, L / 2 + 0.01, W * 0.22, 0.14, 0.04, LIGHT);
  g.box(W * 0.36, clr + bodyH * 0.68, -L / 2 - 0.01, W * 0.18, 0.14, 0.04, TAIL);
  g.box(-W * 0.36, clr + bodyH * 0.68, -L / 2 - 0.01, W * 0.18, 0.14, 0.04, TAIL);
  // タイヤ
  const wz = L / 2 - Math.max(0.75, L * 0.18), wx = W / 2 - 0.12;
  const wheel = new THREE.CylinderGeometry(wheelR, wheelR, 0.26, 8).rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, 0.28, 6).rotateZ(Math.PI / 2);
  const m = new THREE.Matrix4();
  const axles = L > 8 ? [wz, -wz, -wz + 1.4] : [wz, -wz];
  for (const z of axles) for (const x of [wx, -wx]) {
    m.makeTranslation(x, wheelR, z); g.addGeometry(wheel, m, TIRE); g.addGeometry(rim, m, RIM);
  }
  const geo = g.build();
  const info = { geo, lightY: clr + bodyH * 0.65, lightX: W * 0.33, wheelR, roofY: H };
  cache.set(key, info);
  return info;
}

let _mat;
export function vehicleMaterial() {
  if (!_mat) _mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  return _mat;
}
