// 結合メッシュ用の頂点ビルダー（建物・車・小物を1つのジオメトリにまとめる）
/* global THREE */
export class GeoBuilder {
  constructor(withUV = false) { this.pos = []; this.nor = []; this.col = []; this.uv = withUV ? [] : null; }
  _push(p, n, c, uv) {
    this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); this.col.push(c[0], c[1], c[2]);
    if (this.uv) this.uv.push(uv ? uv[0] : 0, uv ? uv[1] : 0);
  }
  // 四角形 a,b,c,d（反時計回り）
  quad(a, b, c, d, color, uvs) {
    const n = normal(a, b, c);
    const u = uvs || [[0, 0], [1, 0], [1, 1], [0, 1]];
    this._push(a, n, color, u[0]); this._push(b, n, color, u[1]); this._push(c, n, color, u[2]);
    this._push(a, n, color, u[0]); this._push(c, n, color, u[2]); this._push(d, n, color, u[3]);
  }
  tri(a, b, c, color) {
    const n = normal(a, b, c);
    this._push(a, n, color); this._push(b, n, color); this._push(c, n, color);
  }
  // 任意のジオメトリを行列で変換して追加
  addGeometry(geom, matrix, color) {
    const g = (geom.index ? geom.toNonIndexed() : geom.clone());
    if (matrix) g.applyMatrix4(matrix);
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    const cols = g.attributes.color;
    for (let i = 0; i < p.count; i++) {
      const c = cols ? [cols.getX(i), cols.getY(i), cols.getZ(i)] : color;
      this._push([p.getX(i), p.getY(i), p.getZ(i)], [n.getX(i), n.getY(i), n.getZ(i)], c, uv ? [uv.getX(i), uv.getY(i)] : null);
    }
    g.dispose();
  }
  // 箱（中心x,y,z / 幅w 高さh 奥行d / y軸回転ry）
  box(x, y, z, w, h, d, color, ry = 0, rx = 0, rz = 0) {
    _m.makeRotationFromEuler(_e.set(rx, ry, rz)); _m.setPosition(x, y, z);
    this.addGeometry(boxGeo(w, h, d), _m, color);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
  get count() { return this.pos.length / 3; }
}
let _m, _e;
const _boxCache = new Map();
function boxGeo(w, h, d) {
  if (!_m) { _m = new THREE.Matrix4(); _e = new THREE.Euler(); }
  const k = w + ',' + h + ',' + d;
  let g = _boxCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); if (_boxCache.size > 400) _boxCache.clear(); _boxCache.set(k, g); }
  return g;
}
export function initGeom() { if (!_m) { _m = new THREE.Matrix4(); _e = new THREE.Euler(); } }
function normal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1; return [nx / l, ny / l, nz / l];
}
export function hex(c) { return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]; }
export function shade(c, k) { return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]; }
export function hsl(h, s, l) { const c = new THREE.Color().setHSL(h, s, l); return [c.r, c.g, c.b]; }
