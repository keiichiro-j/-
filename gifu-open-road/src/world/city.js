// 建物・窓・屋根・城・駅・橋の結合メッシュ
/* global THREE */
import { TILE, MAP_W, MAP_H, HEIGHTS } from '../core/config.js';
import { T, idx, inMap, MOUNTAIN } from './mapgen.js';
import { groundH } from './terrain.js';
import { GeoBuilder, hex, shade, hsl } from '../fx/geom.js';

const CELL = 8; // テクスチャ内の窓の数（縦横）

function windowTextures() {
  const S = 256, cs = S / CELL;
  const base = document.createElement('canvas'); base.width = base.height = S;
  const lit = document.createElement('canvas'); lit.width = lit.height = S;
  const g = base.getContext('2d'), e = lit.getContext('2d');
  g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, S, S);
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  let seed = 7;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    const px = x * cs, py = y * cs;
    g.fillStyle = '#cfccc6'; g.fillRect(px, py + cs - 3, cs, 3);
    const glass = 78 + Math.floor(r() * 40);
    g.fillStyle = `rgb(${glass},${glass + 18},${glass + 40})`;
    g.fillRect(px + 9, py + 9, cs - 18, cs - 19);
    g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(px + 9, py + 9, cs - 18, 3);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px + 9, py + cs - 11, cs - 18, 1);
    if (r() < 0.38) {
      const warm = r() < 0.7;
      e.fillStyle = warm ? `rgb(255,${200 + Math.floor(r() * 40)},${120 + Math.floor(r() * 50)})` : 'rgb(190,220,255)';
      e.fillRect(px + 9, py + 9, cs - 18, cs - 19);
    }
  }
  const t1 = new THREE.CanvasTexture(base), t2 = new THREE.CanvasTexture(lit);
  for (const t of [t1, t2]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  return { map: t1, emissive: t2 };
}

const STYLE_COLORS = {
  office: (h) => hsl(0.58 + h * 0.08, 0.06 + h * 0.08, 0.62 + h * 0.18),
  tower: (h) => hsl(0.55 + h * 0.05, 0.25, 0.55 + h * 0.15),
  shop: (h) => hsl(0.02 + h * 0.12, 0.35, 0.62 + h * 0.12),
  house: (h) => hsl(0.1 + h * 0.05, 0.25, 0.78 + h * 0.12),
  station: () => hsl(0.58, 0.15, 0.82),
};

export function buildCity(world, scene) {
  const walls = new GeoBuilder(true);
  const roofs = new GeoBuilder(false);
  const wallsAt = (x0, z0, x1, z1, y0, y1, color, storey = 3.5) => {
    const faces = [[x1, z0, x0, z0], [x0, z1, x1, z1], [x1, z1, x1, z0], [x0, z0, x0, z1]];
    for (const [ax, az, bx, bz] of faces) {
      const len = Math.hypot(bx - ax, bz - az);
      const u1 = len / 4 / CELL, v1 = (y1 - y0) / storey / CELL;
      walls.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], color, [[0, 0], [u1, 0], [u1, v1], [0, v1]]);
    }
  };
  const top = (x0, z0, x1, z1, y, color, b = roofs) => b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], color);

  for (const b of world.buildings) {
    // アーケードで分断された建物の部分を除外するため、タイルの実際の状態を見て矩形を確認
    const x0 = b.c0 * TILE + 0.35, x1 = (b.c1 + 1) * TILE - 0.35, z0 = b.r0 * TILE + 0.35, z1 = (b.r1 + 1) * TILE - 0.35;
    let arcade = false;
    for (let r = b.r0; r <= b.r1 && !arcade; r++) for (let c = b.c0; c <= b.c1; c++) if (world.tiles[idx(c, r)] === T.ARCADE) { arcade = true; break; }
    if (arcade) continue;
    const gy = Math.min(groundH(x0, z0), groundH(x1, z0), groundH(x0, z1), groundH(x1, z1)) - 0.3;
    const y1 = gy + 0.3 + b.h;
    const col = STYLE_COLORS[b.style](b.hue);
    wallsAt(x0, z0, x1, z1, gy, y1, col, b.style === 'house' ? 2.9 : 3.5);
    if (b.style === 'house') {
      // 切妻屋根
      const rc = b.hue < 0.5 ? hex(0x4a4f5a) : hex(0x7a4a3a);
      const along = (x1 - x0) >= (z1 - z0);
      const rh = 1.8, ov = 0.4;
      if (along) {
        const zm = (z0 + z1) / 2;
        roofs.quad([x0 - ov, y1, z1 + ov], [x1 + ov, y1, z1 + ov], [x1 + ov, y1 + rh, zm], [x0 - ov, y1 + rh, zm], rc);
        roofs.quad([x1 + ov, y1, z0 - ov], [x0 - ov, y1, z0 - ov], [x0 - ov, y1 + rh, zm], [x1 + ov, y1 + rh, zm], shade(rc, 0.85));
        roofs.tri([x0, y1, z0], [x0, y1, z1], [x0, y1 + rh, zm], col);
        roofs.tri([x1, y1, z1], [x1, y1, z0], [x1, y1 + rh, zm], col);
      } else {
        const xm = (x0 + x1) / 2;
        roofs.quad([x0 - ov, y1, z0 - ov], [x0 - ov, y1, z1 + ov], [xm, y1 + rh, z1 + ov], [xm, y1 + rh, z0 - ov], rc);
        roofs.quad([x1 + ov, y1, z1 + ov], [x1 + ov, y1, z0 - ov], [xm, y1 + rh, z0 - ov], [xm, y1 + rh, z1 + ov], shade(rc, 0.85));
        roofs.tri([x0, y1, z1], [x1, y1, z1], [xm, y1 + rh, z1], col);
        roofs.tri([x1, y1, z0], [x0, y1, z0], [xm, y1 + rh, z0], col);
      }
    } else {
      const rc = shade(col, 0.55);
      top(x0, z0, x1, z1, y1, rc);
      // パラペット
      roofs.box((x0 + x1) / 2, y1 + 0.4, z0 + 0.15, x1 - x0, 0.8, 0.3, shade(col, 0.8));
      roofs.box((x0 + x1) / 2, y1 + 0.4, z1 - 0.15, x1 - x0, 0.8, 0.3, shade(col, 0.8));
      if (b.h > 12 && (x1 - x0) > 5) {
        roofs.box(x0 + (x1 - x0) * 0.3, y1 + 1.2, z0 + (z1 - z0) * 0.4, 2.2, 2.4, 2.2, hex(0x9a9a9a));
        if (b.hue > 0.5) roofs.box(x0 + (x1 - x0) * 0.7, y1 + 0.6, z0 + (z1 - z0) * 0.65, 1.4, 1.2, 1.4, hex(0xb0b4b8));
      }
      if (b.style === 'shop') {
        // 看板と日除け
        const sc = hsl(b.hue, 0.75, 0.55);
        roofs.box((x0 + x1) / 2, gy + 3.4, z1 + 0.25, (x1 - x0) * 0.8, 0.9, 0.2, sc);
        roofs.box((x0 + x1) / 2, gy + 2.7, z1 + 0.6, (x1 - x0) * 0.9, 0.12, 1.0, shade(sc, 0.7));
      }
    }
  }

  // 駅舎
  const st = world.lm.station;
  {
    const x0 = st.c0 * TILE + 0.3, x1 = (st.c1 + 1) * TILE - 0.3, z0 = st.r0 * TILE + 0.3, z1 = (st.r1 + 1) * TILE - 0.3;
    wallsAt(x0, z0, x1, z1, 0, 14, STYLE_COLORS.station(), 4.5);
    top(x0, z0, x1, z1, 14, hex(0x8b9096));
    roofs.box((x0 + x1) / 2, 8.5, z0 - 3, x1 - x0 + 4, 0.5, 6, hex(0xd8dde2)); // 大屋根
    for (let x = x0; x <= x1; x += 8) roofs.box(x, 4.2, z0 - 5.6, 0.4, 8.5, 0.4, hex(0x9aa3ad));
    // 線路の高架の代わりにホーム屋根
    roofs.box((x0 + x1) / 2, 5.5, 97.5 * TILE, 120, 0.3, 6, hex(0xa0a6ac));
  }

  // アーケードの屋根
  for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
    if (world.tiles[idx(c, r)] !== T.ARCADE) continue;
    roofs.box(c * TILE + 2, 7.2, r * TILE + 2, 4.05, 0.25, 4.05, hex(0xd6e4ea));
    if (r % 2 === 0) roofs.box(c * TILE + 2, 7.6, r * TILE + 2, 4.05, 0.5, 0.3, hex(0xc04a3a));
  }

  // 橋
  for (let r = 0; r < MAP_H; r++) for (let c = 0; c < MAP_W; c++) {
    const t = world.tiles[idx(c, r)];
    if (t !== T.BRIDGE && t !== T.BRIDGEWALK) continue;
    const x = c * TILE + 2, z = r * TILE + 2;
    roofs.box(x, HEIGHTS.bridge - 0.4, z, 4.02, 0.8, 4.02, t === T.BRIDGE ? hex(0x45484d) : hex(0x9a978f));
    if (t === T.BRIDGEWALK) {
      const outerW = inMap(c - 1, r) && world.tiles[idx(c - 1, r)] === T.WATER;
      const outerE = inMap(c + 1, r) && world.tiles[idx(c + 1, r)] === T.WATER;
      if (outerW) roofs.box(c * TILE + 0.15, HEIGHTS.bridge + 0.55, z, 0.2, 1.1, 4, hex(0xc9472f));
      if (outerE) roofs.box(c * TILE + 3.85, HEIGHTS.bridge + 0.55, z, 0.2, 1.1, 4, hex(0xc9472f));
    }
    if (r % 3 === 0 && t === T.BRIDGE && c % 2 === 0) roofs.box(x, -1.5, z, 1.6, 3.2, 1.6, hex(0x8a8a86));
  }

  // 金華山の城
  {
    const { x, z } = world.lm.castle; const y = groundH(x, z);
    const white = hex(0xf1efe8), roof = hex(0x3d4b4a), stone = hex(0x8d877c);
    roofs.addGeometry(new THREE.CylinderGeometry(5.2, 6.4, 4, 4, 1).rotateY(Math.PI / 4), new THREE.Matrix4().makeTranslation(x, y + 2, z), stone);
    const tiers = [[7, 3.6], [5.4, 3.2], [3.8, 3.0]];
    let yy = y + 4;
    for (const [w, h] of tiers) {
      roofs.box(x, yy + h / 2, z, w, h, w, white);
      for (let k = -1; k <= 1; k += 2) { roofs.box(x + k * w * 0.25, yy + h * 0.55, z + w / 2 + 0.01, w * 0.18, h * 0.3, 0.05, hex(0x2c2c2c)); }
      roofs.addGeometry(new THREE.ConeGeometry(w * 0.82, 1.8, 4, 1).rotateY(Math.PI / 4), new THREE.Matrix4().makeTranslation(x, yy + h + 0.6, z), roof);
      yy += h + 0.9;
    }
    roofs.box(x - 0.9, yy + 0.7, z, 0.35, 0.6, 0.25, hex(0xe8c35a));
    roofs.box(x + 0.9, yy + 0.7, z, 0.35, 0.6, 0.25, hex(0xe8c35a));
  }

  // 公園の博物館
  if (world.lm.museum) {
    const { x, z } = world.lm.museum;
    roofs.box(x + 6, 3, z, 9, 6, 7, hex(0xd9cfbf));
    roofs.addGeometry(new THREE.ConeGeometry(7.2, 2, 4, 1).rotateY(Math.PI / 4), new THREE.Matrix4().makeTranslation(x + 6, 7, z), hex(0x5a4b3f));
  }

  const tex = windowTextures();
  const wallMat = new THREE.MeshLambertMaterial({ map: tex.map, vertexColors: true, emissive: 0xffffff, emissiveMap: tex.emissive, emissiveIntensity: 0 });
  const roofMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const wm = new THREE.Mesh(walls.build(), wallMat); wm.castShadow = false; wm.receiveShadow = true;
  const rm = new THREE.Mesh(roofs.build(), roofMat); rm.receiveShadow = true;
  scene.add(wm); scene.add(rm);

  // 黄金の像（駅前）
  {
    const g = new GeoBuilder();
    const { x, z } = world.lm.statue;
    g.box(x, 1.5, z, 2.4, 3, 2.4, hex(0x8f8a80));
    const gold = hex(0xe0b040);
    g.box(x, 3.9, z, 0.9, 1.8, 0.6, gold); g.box(x, 5.15, z, 0.5, 0.6, 0.5, gold);
    g.box(x - 0.55, 4.1, z, 0.25, 1.4, 0.25, gold); g.box(x + 0.6, 4.6, z + 0.4, 0.25, 0.25, 1.1, gold);
    g.box(x, 3.6, z - 0.35, 1.2, 2, 0.15, hex(0xc8962c));
    const m = new THREE.Mesh(g.build(), new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 90, specular: 0x886622 }));
    scene.add(m);
  }

  return { wallMat, roofMat, tris: (walls.count + roofs.count) / 3 };
}

// 施設の看板（文字のスプライト）
export function buildSigns(world, scene) {
  const draw = (sp, text, color) => {
    const cv = sp.userData.cv, g = cv.getContext('2d');
    g.clearRect(0, 0, 256, 64);
    g.fillStyle = color; g.beginPath(); g.roundRect ? g.roundRect(2, 2, 252, 60, 12) : g.rect(2, 2, 252, 60); g.fill();
    g.fillStyle = '#fff'; g.font = `bold ${text.length > 9 ? 22 : 30}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, 34);
    sp.material.map.needsUpdate = true;
  };
  const make = (text, color) => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthWrite: false }));
    sp.userData.cv = cv; draw(sp, text, color);
    sp.scale.set(4.4, 1.1, 1);
    return sp;
  };
  const list = [
    ['gunshop', '#b83a2e'], ['police', '#2f5fae'], ['hospital', '#3c9c6a'], ['clothes', '#b0569a'], ['conbini', '#e08a1e'],
    ['conbini2', '#e08a1e'], ['bank', '#24715e'], ['paint', '#6b4bb0'], ['gas', '#d0402a'], ['gas2', '#d0402a'],
    ['ryokan', '#8a5a3a'], ['florist', '#d06a8a'], ['farm', '#7a8a2a'], ['museum', '#6a5a4a'],
    ['jewelry', '#a0802a'], ['dealer', '#2a6ab0'], ['tuner', '#c0402a'], ['realty', '#3a8a6a'],
  ];
  const sprites = {};
  for (const [k, col] of list) {
    const p = world.lm[k]; if (!p) continue;
    const sp = make(p.label, col);
    sp.position.set(p.x, groundH(p.x, p.z) + 7.5, p.z);
    scene.add(sp); sprites[k] = sp;
  }
  const st = make('岐阜駅', '#1f4e8c'); st.scale.set(10, 2.5, 1); st.position.set(world.lm.station.x, 17, world.lm.station.z + 2); scene.add(st);
  // 物件の看板（売物件／自宅）
  const props = {};
  for (const k in world.lm) if (k.startsWith('prop_')) {
    const p = world.lm[k]; const sp = make(p.label, '#556');
    sp.position.set(p.x, groundH(p.x, p.z) + 6.2, p.z); scene.add(sp); props[k.slice(5)] = sp;
  }
  return { sprites, setProp(id, text, color) { if (props[id]) draw(props[id], text, color); } };
}
