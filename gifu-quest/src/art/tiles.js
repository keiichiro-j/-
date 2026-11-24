import { TILE } from '../core/config.js';
import { T, slopeHeight, isSlope, isSolid } from '../world/tiles.js';
import { hash, rng, mix, shade, rgba, ell, rrect, poly, fs, lin, rad, line, sparkle } from './props.js';
// タイルの絵（担当：アート）。drawTile(ctx, t, tx, ty, level, theme) は (0,0)-(36,36) に描く。
// 隣のタイルを level.get で見て、上端（草・雪）・左右の端・角を描き分ける。チャンクに焼き付けるので重めでよい。
// 同じ見た目が並ばないよう、(tx,ty) から決まる疑似乱数で小石・草・ひびを散らす。
const S = TILE;

// ---------------------------------------------------------------- テーマの色
const THEMES = {
  kinka: { // 金華山：土と苔の地面・石垣
    soilL: '#8a5e3a', soilD: '#3e2616', out: '#24140a', top: 'grass', grass: '#5fae3e', grassL: '#9ad85a', grassD: '#2e6e24',
    pebble: '#9a8a76', stone: '#9a968a', stoneD: '#5e5a50', wood: '#a8743e', brick: '#a8583a', strata: true, roots: true,
  },
  nagara: { // 長良川：河原の石と砂
    soilL: '#a8906c', soilD: '#4a3e30', out: '#2e2416', top: 'sand', grass: '#7cbc4a', grassL: '#b4e07a', grassD: '#3e7a2c',
    pebble: '#a8a6a0', stone: '#a8a69c', stoneD: '#686860', wood: '#a8784a', brick: '#a8603e', pebbles: true,
  },
  gujo: { // 郡上八幡：石畳と石垣・水路
    soilL: '#7e7468', soilD: '#3a3630', out: '#1e1c18', top: 'cobble', grass: '#5aa048', grassL: '#90d070', grassD: '#2e6a2a',
    pebble: '#8a8a84', stone: '#8e949a', stoneD: '#545a60', wood: '#8a5a34', brick: '#9a5034',
  },
  takayama: { // 飛騨高山：木の町家・屋根瓦
    soilL: '#7a6a58', soilD: '#3a3028', out: '#1e1812', top: 'curb', grass: '#6aa848', grassL: '#a0d878', grassD: '#33682a',
    pebble: '#8a8276', stone: '#9a968e', stoneD: '#5a5650', wood: '#7a4a2c', brick: '#8a4a30',
  },
  shirakawa: { // 白川郷：雪の地面・茅葺き
    soilL: '#6a5a4a', soilD: '#2e2620', out: '#1a1612', top: 'snow', grass: '#5a8a48', grassL: '#90b878', grassD: '#2e5a2a',
    pebble: '#8a8680', stone: '#8a8c90', stoneD: '#50545a', wood: '#7a5234', brick: '#8a5038',
  },
  okuhida: { // 奥飛騨：火山岩・溶岩
    soilL: '#5a5058', soilD: '#1e1a20', out: '#0c0a0e', top: 'ash', grass: '#8a8a4a', grassL: '#b8b070', grassD: '#4e4a24',
    pebble: '#6a6068', stone: '#6a6470', stoneD: '#38343c', wood: '#5a3a26', brick: '#6a3428', embers: true,
  },
};
const SNOW = '#f4f8fd', SNOWD = '#b8cce4', SNOWO = '#6a84a8';

const solidish = (t) => isSolid(t) || isSlope(t) || t === T.FAKE;
const sameMass = (t) => solidish(t);
function nb(level, tx, ty) {
  const g = (x, y) => level.get(x, y);
  return {
    u: g(tx, ty - 1), d: g(tx, ty + 1), l: g(tx - 1, ty), r: g(tx + 1, ty),
  };
}
function depth(level, tx, ty) {
  let d = 0;
  while (d < 4 && solidish(level.get(tx, ty - d - 1))) d++;
  return d;
}

// ---------------------------------------------------------------- 地面（# と FAKE と坂の中身）
/** 地表からの深さで暗くする。左右の隣と角で深さを平均し、縦の継ぎ目が出ないよう細い帯で塗る */
function depthFill(ctx, cL, cD, dl, dr) {
  const col = (d) => mix(cL, cD, Math.min(d, 4) / 4 * 0.85);
  if (dl === dr) { ctx.fillStyle = lin(ctx, 0, 0, 0, S, [0, col(dl), 1, col(dl + 1)]); ctx.fillRect(0, 0, S, S); return; }
  for (let i = 0; i < 6; i++) {
    const d = dl + (dr - dl) * (i + 0.5) / 6;
    ctx.fillStyle = lin(ctx, 0, 0, 0, S, [0, col(d), 1, col(d + 1)]);
    ctx.fillRect(i * 6, 0, 6.5, S);
  }
}
function cornerDepths(level, tx, ty, dep) {
  if (!level) return [dep, dep];
  const L = solidish(level.get(tx - 1, ty)) ? (depth(level, tx - 1, ty) + dep) / 2 : dep;
  const R = solidish(level.get(tx + 1, ty)) ? (depth(level, tx + 1, ty) + dep) / 2 : dep;
  return [L, R];
}
function groundFill(ctx, P, tx, ty, dep, level) {
  const [dl, dr] = cornerDepths(level, tx, ty, dep);
  depthFill(ctx, P.soilL, P.soilD, dl, dr);
  const r = rng(Math.floor(hash(tx, ty, 1) * 1e9));
  // 地層のすじ（行ごとに続く）
  if (P.strata || P.top === 'snow') {
    ctx.strokeStyle = rgba(P.soilD, 0.35); ctx.lineWidth = 1.2;
    const y0 = 8 + hash(0, ty, 2) * 20;
    ctx.beginPath();
    for (let x = 0; x <= S; x += 4) { const gx = tx * S + x; const y = y0 + Math.sin(gx / 11 + ty) * 2; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  }
  // 小石・砂粒
  const n = P.pebbles ? 6 : 3;
  for (let i = 0; i < n; i++) {
    const x = 4 + r() * 28, y = 5 + r() * 27, w = 1.5 + r() * (P.pebbles ? 3.2 : 2.2), h = w * (0.55 + r() * 0.25);
    ell(ctx, x, y, w, h, r() * 0.6 - 0.3);
    fs(ctx, shade(P.pebble, (r() - 0.5) * 0.3 - dep * 0.08), rgba(P.out, 0.6), 0.7);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ell(ctx, x - w * 0.3, y - h * 0.35, w * 0.4, h * 0.3); ctx.fill();
  }
  ctx.fillStyle = rgba(shade(P.soilL, 0.25), 0.5);
  for (let i = 0; i < 8; i++) ctx.fillRect(r() * 34, r() * 34, 1, 1);
  ctx.fillStyle = rgba(P.soilD, 0.5);
  for (let i = 0; i < 8; i++) ctx.fillRect(r() * 34, r() * 34, 1.2, 1.2);
  if (P.embers && r() < 0.5) {
    // 溶岩のひび（赤く光る）
    const x = 6 + r() * 20, y = 10 + r() * 18;
    ctx.strokeStyle = 'rgba(255,90,30,0.75)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 4, y + 2 - r() * 4); ctx.lineTo(x + 8, y + r() * 3); ctx.lineTo(x + 11, y - 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,200,120,0.6)'; ctx.lineWidth = 0.4; ctx.stroke();
  }
  if (P.roots && dep <= 1 && r() < 0.6) {
    ctx.strokeStyle = rgba('#2a1a0e', 0.6); ctx.lineWidth = 1;
    const x = 4 + r() * 26;
    ctx.beginPath(); ctx.moveTo(x, 6); ctx.quadraticCurveTo(x + 4 - r() * 8, 14, x + 6 - r() * 12, 22); ctx.stroke();
  }
}

/** 上端の飾り（草・雪・砂・石畳・縁石・火山灰）。y=0 が上端 */
function topCap(ctx, P, tx, ty, kind, open) {
  const r = rng(Math.floor(hash(tx, ty, 9) * 1e9));
  const gx = tx * S;
  if (kind === 'grass' || kind === 'sand' || kind === 'ash') {
    const G = kind === 'ash' ? P.grassD : P.grass;
    if (kind === 'sand') {
      // 砂の帯
      ctx.fillStyle = lin(ctx, 0, 0, 0, 9, [0, '#ece0c0', 1, '#c8b48a']); ctx.fillRect(0, 0, S, 9);
      ctx.fillStyle = '#b8a47a'; for (let i = 0; i < 14; i++) ctx.fillRect(r() * 35, 2 + r() * 6, 1, 1);
      ctx.beginPath(); ctx.moveTo(0, 9); for (let x = 0; x <= S; x += 6) ctx.lineTo(x, 9 + Math.sin((gx + x) / 5) * 1.2); ctx.lineTo(S, 7); ctx.lineTo(0, 7); ctx.fillStyle = '#c8b48a'; ctx.fill();
      // 丸い河原の石
      for (let i = 0; i < 2; i++) { const x = 5 + r() * 26, w = 3 + r() * 2.5; ell(ctx, x, 3, w, w * 0.6); fs(ctx, lin(ctx, 0, 0, 0, 5, [0, '#e0ded8', 1, '#8a8880']), '#4a4840', 0.7); }
    } else if (kind === 'ash') {
      ctx.fillStyle = lin(ctx, 0, 0, 0, 6, [0, '#8a7e86', 1, '#4a4248']); ctx.fillRect(0, 0, S, 6);
      ctx.fillStyle = '#9a8e96'; for (let i = 0; i < 10; i++) ctx.fillRect(r() * 35, r() * 4, 1.2, 1);
    } else {
      // 草の帯：波打つ下端としずく
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(S, 0);
      for (let x = S; x >= 0; x -= 3) { const g2 = gx + x; ctx.lineTo(x, 6 + Math.sin(g2 / 4.3) * 1.3 + (hash(g2 / 3 | 0, ty, 3) < 0.18 ? 3.5 : 0)); }
      ctx.closePath();
      fs(ctx, lin(ctx, 0, 0, 0, 9, [0, P.grassL, 0.4, P.grass, 1, P.grassD]), null);
      ctx.strokeStyle = rgba(P.grassD, 0.9); ctx.lineWidth = 0.8; ctx.stroke();
    }
    // 草の葉（上に飛び出す）
    const blades = kind === 'grass' ? 9 : kind === 'sand' ? 3 : 2;
    for (let i = 0; i < blades; i++) {
      const x = 1 + r() * 34, h = 2.5 + r() * (kind === 'grass' ? 4.5 : 5), lean = (r() - 0.5) * 3;
      ctx.beginPath(); ctx.moveTo(x - 1.2, 1.5); ctx.quadraticCurveTo(x + lean * 0.4, -h * 0.5, x + lean, -h); ctx.quadraticCurveTo(x + lean * 0.3 + 0.5, -h * 0.4, x + 1.2, 1.5); ctx.closePath();
      ctx.fillStyle = kind === 'ash' ? mix('#7a7a40', '#b8b070', r()) : mix(G, P.grassL, r()); ctx.fill();
    }
    if (kind === 'grass' && r() < 0.25) {
      const x = 5 + r() * 26; const c = r() < 0.5 ? '#fff4f0' : '#ffe060';
      for (let k = 0; k < 5; k++) { ell(ctx, x + Math.cos(k * 1.26) * 1.3, -3 + Math.sin(k * 1.26) * 1.3, 1, 1); ctx.fillStyle = c; ctx.fill(); }
      ctx.fillStyle = '#e8a020'; ctx.fillRect(x - 0.5, -3.5, 1, 1);
    }
    line(ctx, 0, 0.4, S, 0.4, rgba(kind === 'grass' ? P.grassL : '#ffffff', 0.6), 0.8);
  } else if (kind === 'snow') {
    snowCap(ctx, tx, ty, r, open);
  } else if (kind === 'cobble') {
    // 石畳
    ctx.fillStyle = '#4a4844'; ctx.fillRect(0, 0, S, 9);
    let x = -((gx * 0.7) % 1) - hash(tx, ty, 4) * 6;
    while (x < S) {
      const w = 7 + r() * 6;
      rrect(ctx, x + 0.5, 0.6, w - 1, 7.6, 1.8);
      fs(ctx, lin(ctx, 0, 0, 0, 8, [0, shade(P.stone, 0.2 + (r() - 0.5) * 0.15), 1, shade(P.stone, -0.2)]), '#2a2826', 0.7);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x + 1.5, 1.4, w - 4, 0.8);
      x += w;
    }
    ctx.fillStyle = rgba(P.grassD, 0.8); for (let i = 0; i < 3; i++) ctx.fillRect(r() * 34, 7.5, 2, 1.2);
  } else if (kind === 'curb') {
    // 花崗岩の縁石
    let x = -hash(tx, ty, 6) * 12;
    while (x < S) {
      const w = 12 + r() * 8;
      rrect(ctx, x + 0.4, 0.4, w - 0.8, 7, 1);
      fs(ctx, lin(ctx, 0, 0, 0, 7, [0, '#d4d0c6', 1, '#8a867c']), '#3a3832', 0.8);
      ctx.fillStyle = 'rgba(60,58,52,0.4)'; for (let k = 0; k < 5; k++) ctx.fillRect(x + r() * w, 1 + r() * 5, 0.8, 0.8);
      x += w;
    }
    ctx.fillStyle = 'rgba(80,120,50,0.8)'; for (let i = 0; i < 4; i++) { ell(ctx, r() * 36, 7.6, 1.6, 0.8); ctx.fill(); }
  }
}
function snowCap(ctx, tx, ty, r, open) {
  const gx = tx * S;
  ctx.beginPath(); ctx.moveTo(0, 2);
  for (let x = 0; x <= S; x += 4) ctx.lineTo(x, -1.6 - Math.abs(Math.sin((gx + x) / 9)) * 1.6);
  ctx.lineTo(S, 2);
  for (let x = S; x >= 0; x -= 3) { const g2 = gx + x; ctx.lineTo(x, 8 + Math.sin(g2 / 5.1) * 1.4 + (hash(g2 / 3 | 0, ty, 5) < 0.2 ? 3 : 0)); }
  ctx.closePath();
  fs(ctx, lin(ctx, 0, -3, 0, 11, [0, '#ffffff', 0.6, SNOW, 1, SNOWD]), SNOWO, 0.8);
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(0, -1, S, 1.2);
  for (let i = 0; i < 3; i++) sparkle(ctx, 3 + r() * 30, 1 + r() * 5, 1.2, '#ffffff', 0.9);
  // 端の雪だまり
  if (open.l) { ell(ctx, 0.5, 4, 3.2, 4.5); fs(ctx, SNOW, SNOWO, 0.8); }
  if (open.r) { ell(ctx, S - 0.5, 4, 3.2, 4.5); fs(ctx, SNOW, SNOWO, 0.8); }
}

function tileOutline(ctx, P, open, rr, col) {
  // 外に出ている辺だけ輪郭を引く
  ctx.strokeStyle = col || P.out; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath();
  if (open.u) { ctx.moveTo(open.l ? rr[0] : 0, 0.8); ctx.lineTo(S - (open.r ? rr[1] : 0), 0.8); }
  if (open.r) { ctx.moveTo(S - 0.8, open.u ? rr[1] : 0); ctx.lineTo(S - 0.8, S - (open.d ? rr[2] : 0)); }
  if (open.d) { ctx.moveTo(S - (open.r ? rr[2] : 0), S - 0.8); ctx.lineTo(open.l ? rr[3] : 0, S - 0.8); }
  if (open.l) { ctx.moveTo(0.8, S - (open.d ? rr[3] : 0)); ctx.lineTo(0.8, open.u ? rr[0] : 0); }
  ctx.stroke();
  // 角の丸み
  ctx.beginPath();
  if (open.u && open.l) { ctx.moveTo(0.8, rr[0]); ctx.arcTo(0.8, 0.8, rr[0], 0.8, Math.max(0, rr[0] - 0.8)); }
  if (open.u && open.r) { ctx.moveTo(S - rr[1], 0.8); ctx.arcTo(S - 0.8, 0.8, S - 0.8, rr[1], Math.max(0, rr[1] - 0.8)); }
  if (open.d && open.r) { ctx.moveTo(S - 0.8, S - rr[2]); ctx.arcTo(S - 0.8, S - 0.8, S - rr[2], S - 0.8, Math.max(0, rr[2] - 0.8)); }
  if (open.d && open.l) { ctx.moveTo(rr[3], S - 0.8); ctx.arcTo(0.8, S - 0.8, 0.8, S - rr[3], Math.max(0, rr[3] - 0.8)); }
  ctx.stroke();
}
function sideShade(ctx, open, dark = 'rgba(0,0,0,0.28)', light = 'rgba(255,255,255,0.12)') {
  if (open.l) { ctx.fillStyle = lin(ctx, 0, 0, 5, 0, [0, light, 1, 'rgba(255,255,255,0)']); ctx.fillRect(0, 0, 5, S); }
  if (open.r) { ctx.fillStyle = lin(ctx, S - 6, 0, S, 0, [0, 'rgba(0,0,0,0)', 1, dark]); ctx.fillRect(S - 6, 0, 6, S); }
  if (open.d) { ctx.fillStyle = lin(ctx, 0, S - 6, 0, S, [0, 'rgba(0,0,0,0)', 1, dark]); ctx.fillRect(0, S - 6, S, 6); }
}
function openSides(level, tx, ty, same = sameMass) {
  const n = nb(level, tx, ty);
  return { u: !same(n.u), d: !same(n.d), l: !same(n.l), r: !same(n.r), n };
}
function clipRounded(ctx, open, rr) {
  const R = [open.u && open.l ? rr[0] : 0, open.u && open.r ? rr[1] : 0, open.d && open.r ? rr[2] : 0, open.d && open.l ? rr[3] : 0];
  ctx.beginPath(); ctx.roundRect(0, 0, S, S, R); ctx.clip();
}

function drawGround(ctx, P, tx, ty, level, themeTop) {
  const open = openSides(level, tx, ty);
  const capOk = open.u && !(open.n.u === T.WATER || open.n.u === T.WATER_TOP || open.n.u === T.LAVA || open.n.u === T.LAVA_TOP);
  const rr = [7, 7, 5, 5];
  ctx.save(); clipRounded(ctx, open, rr);
  groundFill(ctx, P, tx, ty, depth(level, tx, ty), level);
  sideShade(ctx, open);
  ctx.restore();
  tileOutline(ctx, P, open, rr);
  if (capOk) { ctx.save(); if (open.l || open.r) { ctx.beginPath(); ctx.roundRect(0, -8, S, S + 8, [open.l ? 7 : 0, open.r ? 7 : 0, 0, 0]); ctx.clip(); } topCap(ctx, P, tx, ty, themeTop, open); ctx.restore(); }
  // 草が横の壁を少し垂れる
  if (capOk && (themeTop === 'grass') && (open.l || open.r)) {
    const r = rng(tx * 31 + ty);
    for (const side of [open.l ? 0 : -1, open.r ? 1 : -1]) {
      if (side < 0) continue;
      const x = side ? S - 1.5 : 1.5;
      ctx.beginPath(); ctx.moveTo(x - 2, 3); ctx.quadraticCurveTo(x + (side ? 2 : -2), 8, x, 10 + r() * 5); ctx.quadraticCurveTo(x + (side ? -1 : 1), 7, x + 2, 3); ctx.closePath();
      fs(ctx, P.grass, P.grassD, 0.7);
    }
  }
}

// ---------------------------------------------------------------- 石垣（目地は世界座標で続く）
function stonesInRow(rowY, gx0, gx1, rowIdx, cb) {
  const CW = 9;
  const c0 = Math.floor(gx0 / CW) - 6, c1 = Math.ceil(gx1 / CW) + 8;
  const joint = (c) => hash(c, rowIdx, 5) < 0.42 || ((c + rowIdx * 2) % 5 === 0);
  const jx = (c) => c * CW + (hash(c, rowIdx, 6) - 0.5) * 3.5;
  let start = null;
  for (let c = c0; c <= c1; c++) {
    if (!joint(c)) continue;
    if (start !== null) { const a = jx(start), b = jx(c); if (b > gx0 && a < gx1) cb(a, b, start); }
    start = c;
  }
}
function drawStone(ctx, P, tx, ty, level, theme) {
  const open = openSides(level, tx, ty, (t) => t === T.STONE || solidish(t));
  const base = P.stone;
  ctx.save(); clipRounded(ctx, open, [3, 3, 2, 2]);
  ctx.fillStyle = shade(P.stoneD, -0.4); ctx.fillRect(0, 0, S, S);
  const RH = 12;
  for (let k = 0; k < 3; k++) {
    const row = ty * 3 + k, y = k * RH;
    stonesInRow(y, tx * S, tx * S + S, row, (a, b, c) => {
      const x = a - tx * S, w = b - a;
      const v = (hash(c, row, 8) - 0.5) * 0.28;
      const col = shade(base, v);
      rrect(ctx, x + 0.7, y + 0.7, w - 1.4, RH - 1.4, 2.6);
      fs(ctx, lin(ctx, x, y, x + w * 0.4, y + RH, [0, shade(col, 0.22), 0.5, col, 1, shade(col, -0.25)]), shade(P.stoneD, -0.5), 0.8);
      // 面の欠けと苔
      const r = rng(c * 7 + row * 131);
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x + 2, y + 1.6, Math.max(1, w - 5), 1);
      ctx.fillStyle = rgba(P.stoneD, 0.5); for (let i = 0; i < 3; i++) ctx.fillRect(x + 2 + r() * (w - 4), y + 3 + r() * 6, 1, 1);
      if ((theme === 'kinka' || theme === 'gujo') && r() < 0.25) { ctx.fillStyle = 'rgba(90,140,60,0.75)'; ell(ctx, x + 2 + r() * (w - 4), y + RH - 2, 2.4, 1.1); ctx.fill(); }
      if (theme === 'shirakawa' && r() < 0.3) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ell(ctx, x + w / 2, y + 1.5, w * 0.3, 1); ctx.fill(); }
    });
  }
  sideShade(ctx, open);
  ctx.restore();
  tileOutline(ctx, P, open, [3, 3, 2, 2], shade(P.stoneD, -0.6));
  if (open.u) {
    if (P.top === 'snow') snowCap(ctx, tx, ty, rng(tx * 7 + ty), open);
    else if (theme === 'kinka' || theme === 'gujo') topCap(ctx, P, tx, ty, 'grass', open);
  }
}

// ---------------------------------------------------------------- 屋根瓦
function drawRoof(ctx, P, tx, ty, level, theme) {
  const open = openSides(level, tx, ty, (t) => t === T.ROOF || solidish(t));
  const C = theme === 'shirakawa' ? '#4a4e58' : '#525a68', CD = '#262a32', CO = '#121418';
  ctx.save(); clipRounded(ctx, open, [2, 2, 0, 0]);
  ctx.fillStyle = lin(ctx, 0, 0, 0, S, [0, shade(C, -0.15), 1, shade(C, -0.35)]); ctx.fillRect(0, 0, S, S);
  const RH = 9, CW = 9;
  for (let k = 0; k < 4; k++) {
    const y = k * RH;
    // 平瓦の重なりの影
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, y + RH - 2, S, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0, y, S, 1.5);
    for (let c = 0; c < 4; c++) {
      const x = c * CW + 4.5;
      // 丸瓦（縦の筋）
      rrect(ctx, x - 2.6, y - 1, 5.2, RH + 0.5, 2.4);
      fs(ctx, lin(ctx, x - 2.6, 0, x + 2.6, 0, [0, shade(C, 0.35), 0.45, shade(C, 0.1), 1, CD]), CO, 0.7);
      ell(ctx, x, y + RH - 1, 2.6, 1.6); fs(ctx, shade(C, 0.05), CO, 0.6);
      ctx.fillStyle = 'rgba(220,230,250,0.35)'; ctx.fillRect(x - 1.6, y + 0.5, 0.8, RH - 3);
    }
  }
  if (theme === 'shirakawa' || hash(tx, ty, 3) < 0.15) { ctx.fillStyle = 'rgba(120,150,90,0.6)'; ell(ctx, hash(tx, ty, 4) * 30 + 3, 30, 3, 1.2); ctx.fill(); }
  ctx.restore();
  if (open.u) {
    // 棟（てっぺんの太い瓦）
    rrect(ctx, -0.5, -2.5, S + 1, 6, 2.5);
    fs(ctx, lin(ctx, 0, -2.5, 0, 3.5, [0, shade(C, 0.3), 1, CD]), CO, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, -1.6, S, 1);
    if (P.top === 'snow') snowCap(ctx, tx, ty, rng(tx * 5 + ty * 3), open);
  }
  if (open.d) { for (let c = 0; c < 4; c++) { const x = c * 9 + 4.5; ell(ctx, x, S - 1.5, 3, 2.6); fs(ctx, rad(ctx, x - 1, S - 2.5, 0.3, 3.5, [0, shade(C, 0.3), 1, CD]), CO, 0.8); } }
  tileOutline(ctx, P, { ...open, d: false }, [2, 2, 0, 0], CO);
}

// ---------------------------------------------------------------- 木の床・板
function drawWood(ctx, P, tx, ty, level, theme) {
  const open = openSides(level, tx, ty, (t) => t === T.WOOD || solidish(t));
  const W = P.wood, WO = shade(W, -0.65);
  ctx.save(); clipRounded(ctx, open, [2, 2, 2, 2]);
  const PH = 9;
  for (let k = 0; k < 4; k++) {
    const y = k * PH, row = ty * 4 + k;
    const off = hash(0, row, 11) * 40;
    for (let x = -off - 40; x < S; x += 0) {
      const w = 26 + hash(Math.floor((x + tx * S) / 7), row, 12) * 22;
      const gx0 = x;
      const v = (hash(Math.floor(x + tx * S), row, 13) - 0.5) * 0.18;
      const col = shade(W, v);
      ctx.fillStyle = lin(ctx, 0, y, 0, y + PH, [0, shade(col, 0.12), 1, shade(col, -0.15)]);
      ctx.fillRect(gx0, y, w, PH);
      // 木目
      ctx.strokeStyle = rgba(shade(W, -0.4), 0.5); ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(gx0, y + 3 + v * 6); ctx.bezierCurveTo(gx0 + w * 0.3, y + 2, gx0 + w * 0.6, y + 5, gx0 + w, y + 3.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx0, y + 6); ctx.bezierCurveTo(gx0 + w * 0.4, y + 7, gx0 + w * 0.7, y + 5.5, gx0 + w, y + 6.5); ctx.stroke();
      line(ctx, gx0 + 0.5, y + 0.5, gx0 + 0.5, y + PH - 0.5, WO, 1);
      ctx.fillStyle = '#2a2a2a'; ctx.fillRect(gx0 + 2.5, y + 2, 1.2, 1.2); ctx.fillRect(gx0 + 2.5, y + PH - 3.2, 1.2, 1.2);
      x += w;
    }
    line(ctx, 0, y + PH - 0.5, S, y + PH - 0.5, rgba(WO, 0.9), 1);
    ctx.fillStyle = 'rgba(255,240,210,0.15)'; ctx.fillRect(0, y + 0.5, S, 1);
  }
  sideShade(ctx, open);
  ctx.restore();
  tileOutline(ctx, P, open, [2, 2, 2, 2], WO);
  if (open.u) {
    rrect(ctx, 0, 0, S, 3, 1); fs(ctx, lin(ctx, 0, 0, 0, 3, [0, shade(W, 0.35), 1, shade(W, 0.05)]), WO, 0.8);
    if (P.top === 'snow') snowCap(ctx, tx, ty, rng(tx * 3 + ty), open);
  }
}

// ---------------------------------------------------------------- 雪の地面
function drawSnow(ctx, P, tx, ty, level) {
  const open = openSides(level, tx, ty);
  const dep = depth(level, tx, ty);
  const rr = [8, 8, 6, 6];
  ctx.save(); clipRounded(ctx, open, rr);
  const [dl, dr] = cornerDepths(level, tx, ty, dep);
  depthFill(ctx, '#eaf2fb', '#8aa8cc', dl, dr);
  const r = rng(Math.floor(hash(tx, ty, 21) * 1e9));
  // 雪の層と青い影
  ctx.strokeStyle = 'rgba(140,170,210,0.45)'; ctx.lineWidth = 1;
  const y0 = 10 + hash(0, ty, 22) * 18;
  ctx.beginPath(); for (let x = 0; x <= S; x += 4) { const y = y0 + Math.sin((tx * S + x) / 8) * 1.8; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
  for (let i = 0; i < 3; i++) { ell(ctx, 4 + r() * 28, 8 + r() * 24, 3 + r() * 3, 1.5 + r()); ctx.fillStyle = 'rgba(150,180,220,0.3)'; ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; for (let i = 0; i < 6; i++) ctx.fillRect(r() * 35, r() * 35, 1, 1);
  if (r() < 0.25) { ell(ctx, 6 + r() * 24, 20 + r() * 10, 2.4, 1.6); fs(ctx, '#7a7470', '#3a3632', 0.6); }
  sideShade(ctx, open, 'rgba(60,90,140,0.3)', 'rgba(255,255,255,0.3)');
  ctx.restore();
  tileOutline(ctx, P, open, rr, SNOWO);
  if (open.u) snowCap(ctx, tx, ty, r, open);
}

// ---------------------------------------------------------------- 氷
function drawIce(ctx, P, tx, ty, level) {
  const open = openSides(level, tx, ty, (t) => t === T.ICE);
  ctx.save(); ctx.globalAlpha = 0.92;
  rrect(ctx, 0.5, 0.5, S - 1, S - 1, 3);
  fs(ctx, lin(ctx, 0, 0, S, S, [0, '#e8f8ff', 0.35, '#a8dcf8', 1, '#5a9ad0']), null);
  ctx.globalAlpha = 1;
  ctx.save(); rrect(ctx, 0.5, 0.5, S - 1, S - 1, 3); ctx.clip();
  // 斜めのつや
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; poly(ctx, [6, 0, 14, 0, 0, 14, 0, 6]); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; poly(ctx, [18, 0, 21, 0, 0, 21, 0, 18]); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; poly(ctx, [36, 20, 36, 26, 26, 36, 20, 36]); ctx.fill();
  // 中のひび
  const r = rng(Math.floor(hash(tx, ty, 31) * 1e9));
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.6;
  let x = 10 + r() * 16, y = 12 + r() * 12;
  ctx.beginPath(); ctx.moveTo(x, y); for (let i = 0; i < 4; i++) { x += (r() - 0.5) * 12; y += (r() - 0.3) * 8; ctx.lineTo(x, y); } ctx.stroke();
  ctx.fillStyle = 'rgba(200,235,255,0.4)'; for (let i = 0; i < 3; i++) { ell(ctx, 6 + r() * 24, 8 + r() * 22, 1.2, 1.2); ctx.fill(); }
  ctx.restore();
  // 面取り
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(2, S - 3); ctx.lineTo(2, 2); ctx.lineTo(S - 3, 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(40,90,150,0.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(S - 2, 3); ctx.lineTo(S - 2, S - 2); ctx.lineTo(3, S - 2); ctx.stroke();
  rrect(ctx, 0.5, 0.5, S - 1, S - 1, 3); ctx.strokeStyle = '#2a5a8a'; ctx.lineWidth = 1; ctx.stroke();
  if (open.u) sparkle(ctx, 8 + hash(tx, ty, 32) * 20, 3, 2.6, '#ffffff', 1);
  ctx.restore();
}

// ---------------------------------------------------------------- レンガ・ひび割れの壁（ゲンが壊せる）
function drawBrick(ctx, P, tx, ty, level) {
  const B = P.brick, BO = '#2a1610';
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, S, S); ctx.clip();
  ctx.fillStyle = '#5a4a40'; ctx.fillRect(0, 0, S, S);
  for (let k = 0; k < 4; k++) {
    const y = k * 9, row = ty * 4 + k, off = row % 2 ? 9 : 0;
    for (let x = -off; x < S; x += 18) {
      const v = (hash(Math.floor((x + tx * S) / 18) + 99, row, 41) - 0.5) * 0.3;
      const col = shade(B, v);
      rrect(ctx, x + 0.8, y + 0.8, 16.4, 7.4, 1.2);
      fs(ctx, lin(ctx, 0, y, 0, y + 9, [0, shade(col, 0.2), 0.5, col, 1, shade(col, -0.25)]), BO, 0.6);
      ctx.fillStyle = 'rgba(255,230,210,0.25)'; ctx.fillRect(x + 2, y + 1.6, 13, 0.9);
      ctx.fillStyle = rgba(shade(B, -0.5), 0.6); ctx.fillRect(x + 4 + hash(x | 0, row) * 8, y + 4 + hash(row, x | 0) * 2, 1.2, 1);
    }
  }
  ctx.restore();
  const open = openSides(level, tx, ty, (t) => t === T.BRICK || t === T.CRACK || solidish(t));
  tileOutline(ctx, P, open, [0, 0, 0, 0], BO);
}
function drawCrack(ctx, P, tx, ty, level) {
  const C = shade(P.stone, 0.08), CO = shade(P.stoneD, -0.6);
  rrect(ctx, 0.5, 0.5, S - 1, S - 1, 2.5);
  fs(ctx, lin(ctx, 0, 0, S, S, [0, shade(C, 0.25), 0.5, C, 1, shade(C, -0.3)]), CO, 1.2);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(2.5, S - 4); ctx.lineTo(2.5, 2.5); ctx.lineTo(S - 4, 2.5); ctx.stroke();
  // 大きなひび（太い黒＋明るい縁）
  const r = rng(Math.floor(hash(tx, ty, 51) * 1e9));
  const path = [];
  let x = 4 + r() * 8, y = 2;
  path.push([x, y]);
  while (y < S - 3) { x += (r() - 0.4) * 9; y += 4 + r() * 5; path.push([Math.max(3, Math.min(S - 3, x)), Math.min(S - 2, y)]); }
  const branch = path[(path.length / 2) | 0];
  for (const [w, c] of [[2.6, 'rgba(255,255,255,0.35)'], [1.8, '#1a1816']]) {
    ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineJoin = 'miter';
    ctx.save(); if (w > 2) ctx.translate(0.8, 0.8);
    ctx.beginPath(); path.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.moveTo(branch[0], branch[1]); ctx.lineTo(branch[0] + 8, branch[1] + 3); ctx.lineTo(branch[0] + 13, branch[1] - 2);
    ctx.moveTo(path[1][0], path[1][1]); ctx.lineTo(path[1][0] - 5, path[1][1] + 5);
    ctx.stroke(); ctx.restore();
  }
  // 欠け
  ctx.fillStyle = '#2a2826'; poly(ctx, [S - 1, S - 8, S - 1, S - 1, S - 7, S - 1]); ctx.fill();
  ctx.fillStyle = shade(C, -0.2); for (let i = 0; i < 3; i++) { ell(ctx, 6 + r() * 24, 6 + r() * 24, 1.2, 0.9); ctx.fill(); }
}

// ---------------------------------------------------------------- 通り抜け足場
function drawOneway(ctx, P, tx, ty, level, theme) {
  const n = nb(level, tx, ty);
  const W = theme === 'takayama' ? '#a84a30' : P.wood, WO = shade(W, -0.65);
  const endL = n.l !== T.ONEWAY, endR = n.r !== T.ONEWAY;
  // 下の支え（端だけ）
  for (const [on, x, s] of [[endL, 5, 1], [endR, S - 5, -1]]) {
    if (!on) continue;
    line(ctx, x, 9, x + s * 7, 20, WO, 3.2); line(ctx, x, 9, x + s * 7, 20, shade(W, -0.2), 1.8);
  }
  rrect(ctx, endL ? 1 : -1, 0, S + (endL ? -1 : 1) + (endR ? -1 : 1), 10, [endL ? 2.5 : 0, endR ? 2.5 : 0, endR ? 2.5 : 0, endL ? 2.5 : 0]);
  fs(ctx, lin(ctx, 0, 0, 0, 10, [0, shade(W, 0.3), 0.3, W, 1, shade(W, -0.35)]), WO, 1.1);
  ctx.strokeStyle = rgba(shade(W, -0.45), 0.6); ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(0, 4); ctx.bezierCurveTo(12, 3, 24, 5.5, 36, 4.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 7); ctx.bezierCurveTo(12, 8, 24, 6.5, 36, 7.5); ctx.stroke();
  ctx.fillStyle = 'rgba(255,240,210,0.35)'; ctx.fillRect(1, 1.2, S - 2, 1);
  // 板の継ぎ目と縄
  if (hash(tx, ty, 61) < 0.5) line(ctx, 18, 1, 18, 9, WO, 0.9);
  for (const [on, x] of [[endL, 4], [endR, S - 6]]) {
    if (!on) continue;
    ctx.fillStyle = '#d8c080'; ctx.fillRect(x, 0.5, 2.2, 9);
    ctx.strokeStyle = '#6a5428'; ctx.lineWidth = 0.6; for (let y = 2; y < 9; y += 2) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 2.2, y + 1); ctx.stroke(); }
  }
  if (P.top === 'snow') {
    ctx.beginPath(); ctx.moveTo(endL ? 2 : 0, 1);
    for (let x = 0; x <= S; x += 4) ctx.lineTo(x, -1.5 - Math.abs(Math.sin((tx * S + x) / 7)) * 1.2);
    ctx.lineTo(endR ? S - 2 : S, 1); ctx.lineTo(endR ? S - 2 : S, 2.6); ctx.lineTo(endL ? 2 : 0, 2.6); ctx.closePath();
    fs(ctx, SNOW, SNOWO, 0.7);
  }
}

// ---------------------------------------------------------------- トゲ（テーマで素材が変わる）
function drawSpike(ctx, P, tx, ty, level, theme) {
  if (theme === 'shirakawa') {
    // 氷のトゲ
    for (let i = 0; i < 3; i++) {
      const x = i * 12 + 6, h = 22 + hash(tx * 3 + i, ty, 71) * 6;
      poly(ctx, [x - 5.5, S, x - 1, S - h + 3, x, S - h, x + 1.2, S - h + 4, x + 5.5, S]);
      fs(ctx, lin(ctx, x - 5, 0, x + 5, 0, [0, '#ffffff', 0.4, '#b8e4ff', 1, '#5a98d0']), '#2a5a8a', 1);
      line(ctx, x - 1.5, S - 3, x - 0.4, S - h + 5, 'rgba(255,255,255,0.9)', 0.8);
    }
  } else if (theme === 'okuhida') {
    // 黒曜石の結晶
    for (let i = 0; i < 4; i++) {
      const x = i * 9 + 4.5, h = 16 + hash(tx * 4 + i, ty, 72) * 12, lean = (hash(tx * 4 + i, ty, 73) - 0.5) * 4;
      poly(ctx, [x - 4, S, x - 2 + lean, S - h + 2, x + lean, S - h, x + 2 + lean, S - h + 3, x + 4, S]);
      fs(ctx, lin(ctx, x - 4, 0, x + 4, 0, [0, '#6a5a7a', 0.4, '#2a2230', 1, '#100c14']), '#000', 1);
      line(ctx, x - 1.5, S - 2, x - 0.6 + lean, S - h + 3, 'rgba(220,180,255,0.6)', 0.7);
    }
    ctx.fillStyle = 'rgba(255,90,30,0.6)'; ctx.fillRect(0, S - 2, S, 2);
  } else {
    // 竹やり（斜めに切った竹）
    for (let i = 0; i < 4; i++) {
      const x = i * 9 + 4.5, h = 22 + hash(tx * 4 + i, ty, 74) * 8;
      ctx.beginPath(); ctx.moveTo(x - 3, S); ctx.lineTo(x - 3, S - h + 6); ctx.lineTo(x + 3, S - h); ctx.lineTo(x + 3, S); ctx.closePath();
      fs(ctx, lin(ctx, x - 3, 0, x + 3, 0, [0, '#c8e08a', 0.4, '#7ab048', 1, '#3a6a24']), '#1e3a12', 1);
      ell(ctx, x, S - h + 3, 2.4, 3, 1.1); fs(ctx, '#f0e8b0', '#6a5a28', 0.6);
      line(ctx, x - 3, S - 8, x + 3, S - 8, '#2e5a1e', 1); line(ctx, x - 2.6, S - 9, x + 2.6, S - 9, 'rgba(240,255,200,0.5)', 0.6);
    }
  }
  // 根元
  rrect(ctx, 0, S - 4, S, 4, 1); fs(ctx, lin(ctx, 0, S - 4, 0, S, [0, shade(P.soilL, -0.1), 1, P.soilD]), P.out, 0.8);
}

// ---------------------------------------------------------------- 水・溶岩（半透明・静止画）
function drawWater(ctx, P, tx, ty, level, theme, top) {
  const deep = theme === 'gujo' ? ['rgba(90,200,200,0.42)', 'rgba(30,120,150,0.58)'] : theme === 'okuhida' ? ['rgba(150,210,200,0.5)', 'rgba(70,150,150,0.62)'] : ['rgba(80,170,230,0.45)', 'rgba(30,90,170,0.62)'];
  const y0 = top ? 6 : 0;
  const dep = Math.min(4, depth2(level, tx, ty));
  ctx.fillStyle = lin(ctx, 0, y0, 0, S, [0, dep ? deep[1] : deep[0], 1, deep[1]]);
  ctx.fillRect(0, y0, S, S - y0);
  const gx = tx * S;
  // 光のゆらぎ（コースティクス）
  ctx.strokeStyle = 'rgba(200,240,255,0.18)'; ctx.lineWidth = 1;
  for (let k = 0; k < 2; k++) {
    const yy = y0 + 10 + k * 12;
    ctx.beginPath(); for (let x = 0; x <= S; x += 3) { const y = yy + Math.sin((gx + x) / 6 + ty * 2 + k) * 2; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
  }
  if (top) {
    ctx.beginPath(); ctx.moveTo(0, S);
    for (let x = 0; x <= S; x += 2) ctx.lineTo(x, y0 + Math.sin((gx + x) / 5.5) * 1.3);
    ctx.lineTo(S, S); ctx.closePath();
    ctx.save(); ctx.clip(); ctx.fillStyle = 'rgba(220,250,255,0.25)'; ctx.fillRect(0, 0, S, y0 + 4); ctx.restore();
    ctx.beginPath(); for (let x = 0; x <= S; x += 2) { const y = y0 + Math.sin((gx + x) / 5.5) * 1.3; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 3; i++) { const x = hash(tx, i, 81) * 34; ctx.fillRect(x, y0 + 3 + hash(tx, i, 82) * 4, 3 + hash(i, tx) * 4, 0.9); }
  }
}
function depth2(level, tx, ty) { let d = 0; while (d < 4) { const t = level.get(tx, ty - d - 1); if (t !== T.WATER && t !== T.WATER_TOP && t !== T.LAVA && t !== T.LAVA_TOP) break; d++; } return d; }
function drawLava(ctx, P, tx, ty, level, top) {
  const y0 = top ? 5 : 0;
  const gx = tx * S;
  ctx.globalAlpha = 0.93;
  ctx.fillStyle = lin(ctx, 0, y0, 0, S, top ? [0, '#ffb030', 0.3, '#f05a14', 1, '#a01e0a'] : [0, '#b8260c', 1, '#7a1406']);
  ctx.fillRect(0, y0, S, S - y0);
  // 冷えかけた黒い皮と光る筋
  const r = rng(Math.floor(hash(tx, ty, 91) * 1e9));
  for (let i = 0; i < 3; i++) {
    const x = r() * 30, y = y0 + 5 + r() * (S - y0 - 10), w = 4 + r() * 6;
    ell(ctx, x, y, w, w * 0.45, r()); ctx.fillStyle = 'rgba(60,10,4,0.55)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,210,90,0.7)'; ctx.lineWidth = 0.7; ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,230,140,0.7)';
  for (let i = 0; i < 3; i++) { ell(ctx, r() * 34, y0 + 4 + r() * 26, 1 + r(), 1 + r()); ctx.fill(); }
  ctx.globalAlpha = 1;
  if (top) {
    ctx.beginPath(); for (let x = 0; x <= S; x += 2) { const y = y0 + Math.sin((gx + x) / 4.5) * 1.1; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.strokeStyle = '#fff2a0'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.6; ctx.stroke();
    // 泡
    const bx = 6 + r() * 24;
    ell(ctx, bx, y0 - 1, 3, 2.4); fs(ctx, 'rgba(255,170,60,0.95)', '#ffe080', 0.7);
    ctx.fillStyle = 'rgba(255,255,220,0.8)'; ell(ctx, bx - 1, y0 - 2, 0.9, 0.7); ctx.fill();
  }
}

// ---------------------------------------------------------------- 坂・合掌造りの屋根（滑り台）
function slopePath(ctx, t) {
  ctx.beginPath(); ctx.moveTo(0, S);
  for (let x = 0; x <= S; x += 3) ctx.lineTo(x, S - slopeHeight(t, x));
  ctx.lineTo(S, S); ctx.closePath();
}
function drawSlope(ctx, P, t, tx, ty, level, theme) {
  const slide = t === T.ROOF_SLIDE_R || t === T.ROOF_SLIDE_L;
  ctx.save(); slopePath(ctx, t); ctx.clip();
  if (slide) {
    // 茅葺き：斜面に沿った藁の束
    ctx.fillStyle = lin(ctx, 0, 0, 0, S, [0, '#b8985e', 1, '#7a5c32']); ctx.fillRect(0, 0, S, S);
    const r = rng(Math.floor(hash(tx, ty, 101) * 1e9));
    const dir = t === T.ROOF_SLIDE_R ? 1 : -1;
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 46; i++) {
      const x = r() * 40 - 2, y = r() * 40 - 2;
      ctx.strokeStyle = r() < 0.5 ? 'rgba(80,56,26,0.55)' : 'rgba(240,220,160,0.45)';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dir * 4, y + 4.5); ctx.stroke();
    }
    for (let k = 0; k < 3; k++) { ctx.strokeStyle = 'rgba(70,48,20,0.6)'; ctx.lineWidth = 1.2; ctx.beginPath(); const c = 10 + k * 12; ctx.moveTo(dir > 0 ? 0 : S, c - 12 * 0 + (dir > 0 ? 0 : 0)); ctx.lineTo(dir > 0 ? c + 12 : S - c - 12, S); ctx.stroke(); }
  } else {
    const fill = (P.top === 'snow' && level) ? null : null;
    groundFill(ctx, P, tx, ty, 0, level);
  }
  ctx.restore();
  // 斜面の上端（草・雪）
  const p0 = [0, S - slopeHeight(t, 0)], p1 = [S, S - slopeHeight(t, S)];
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy), nx = dy / L, ny = -dx / L; // 上向きの法線
  const band = (w, col, off = 0) => {
    ctx.beginPath();
    ctx.moveTo(p0[0] - nx * off, p0[1] - ny * off); ctx.lineTo(p1[0] - nx * off, p1[1] - ny * off);
    ctx.lineTo(p1[0] - nx * (off + w), p1[1] - ny * (off + w)); ctx.lineTo(p0[0] - nx * (off + w), p0[1] - ny * (off + w)); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
  };
  ctx.save(); slopePath(ctx, t); ctx.rect(0, -10, S, 10); ctx.clip();
  const top = slide ? (theme === 'shirakawa' ? 'snow' : 'none') : P.top;
  if (top === 'snow') {
    band(7, SNOW); band(2, '#ffffff', -2.5); band(1.2, SNOWD, 6.2);
  } else if (top === 'grass') {
    band(6, P.grass); band(2, P.grassL, 0); band(1.4, P.grassD, 5.5);
  } else if (top === 'sand') {
    band(7, '#d8c8a0'); band(1.6, '#ece0c0', 0); band(1, '#a8946a', 6.4);
  } else if (top === 'cobble' || top === 'curb') {
    band(6, P.stone); band(1.4, shade(P.stone, 0.35), 0); band(1.2, shade(P.stoneD, -0.4), 5.4);
  } else if (top === 'ash') {
    band(5, '#6a6068'); band(1.2, '#9a8e96', 0);
  } else {
    band(2.5, '#5a4020'); band(1.2, '#d8b878', 0);
  }
  ctx.restore();
  // 輪郭（斜面の線）
  ctx.strokeStyle = top === 'snow' ? SNOWO : P.out; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
  if (top === 'grass') {
    const r = rng(tx * 17 + ty * 5);
    for (let i = 0; i < 5; i++) {
      const u = r(), x = p0[0] + dx * u, y = p0[1] + dy * u, h = 2.5 + r() * 4;
      ctx.beginPath(); ctx.moveTo(x - 1.2, y + 1); ctx.quadraticCurveTo(x, y - h * 0.5, x + (r() - 0.5) * 3, y - h); ctx.quadraticCurveTo(x + 0.4, y - h * 0.4, x + 1.2, y + 1); ctx.closePath();
      ctx.fillStyle = mix(P.grass, P.grassL, r()); ctx.fill();
    }
  }
}

// ---------------------------------------------------------------- 入口
// 隠し部屋の入口（FAKE）は、いちばん近い本物の固いタイルと同じ見た目にする（外から見分けがつかないように）
function fakeLooksLike(tx, ty, level) {
  for (let r = 1; r <= 8; r++) {
    for (const [dx, dy] of [[-r, 0], [r, 0], [0, -r], [0, r]]) {
      const n = level.get(tx + dx, ty + dy);
      if (n !== T.FAKE && isSolid(n)) return n;
    }
  }
  return T.GROUND;
}
export function drawTile(ctx, t, tx, ty, level, theme) {
  const P = THEMES[theme] || THEMES.kinka;
  if (t === T.FAKE) { const look = fakeLooksLike(tx, ty, level); if (look !== T.GROUND) t = look; }
  if (isSlope(t)) { drawSlope(ctx, P, t, tx, ty, level, theme); return; }
  switch (t) {
    case T.GROUND: case T.FAKE: drawGround(ctx, P, tx, ty, level, P.top); return;
    case T.STONE: drawStone(ctx, P, tx, ty, level, theme); return;
    case T.ROOF: drawRoof(ctx, P, tx, ty, level, theme); return;
    case T.WOOD: drawWood(ctx, P, tx, ty, level, theme); return;
    case T.SNOW: drawSnow(ctx, P, tx, ty, level); return;
    case T.ICE: drawIce(ctx, P, tx, ty, level); return;
    case T.BRICK: drawBrick(ctx, P, tx, ty, level); return;
    case T.CRACK: drawCrack(ctx, P, tx, ty, level); return;
    case T.ONEWAY: drawOneway(ctx, P, tx, ty, level, theme); return;
    case T.SPIKE: drawSpike(ctx, P, tx, ty, level, theme); return;
    case T.WATER_TOP: drawWater(ctx, P, tx, ty, level, theme, true); return;
    case T.WATER: drawWater(ctx, P, tx, ty, level, theme, false); return;
    case T.LAVA_TOP: drawLava(ctx, P, tx, ty, level, true); return;
    case T.LAVA: drawLava(ctx, P, tx, ty, level, false); return;
  }
  ctx.fillStyle = '#f0f'; ctx.fillRect(0, 0, S, S);
}
