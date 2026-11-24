import { defineSprite } from '../gfx/atlas.js';
// 敵と仕掛けの絵（担当：敵・仕掛け）。起動時に1回だけ焼き付ける（毎フレームは呼ばれない）
// 敵：enemy_<kind>_<anim>（右向きで描く。基準点は足元中央）。弾：enemy_shot_<名前>（中心が基準）
// 仕掛け：gim_<名前>。2〜3頭身のかわいい和風、輪郭線と陰影つき

const TAU = Math.PI * 2;
const OL = '#2b1b17';

// ---- 色 ----
function rgb(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { const A = rgb(a), B = rgb(b); const h = (i) => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0'); return '#' + h(0) + h(1) + h(2); }
const lt = (c, t = 0.3) => mix(c, '#ffffff', t);
const dk = (c, t = 0.3) => mix(c, '#000000', t);

// ---- 描画の道具 ----
function shade(ctx, c, x, y, r) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.08, x, y, r * 1.15);
  g.addColorStop(0, lt(c, 0.38)); g.addColorStop(0.55, c); g.addColorStop(1, dk(c, 0.3));
  ctx.fillStyle = g;
}
function stroke(ctx, o) { if (o && o.ol === false) return; ctx.lineWidth = (o && o.lw) || 2; ctx.strokeStyle = (o && o.ol) || OL; ctx.lineJoin = 'round'; ctx.stroke(); }
// 陰影つきの楕円
function ell(ctx, x, y, rx, ry, c, o) {
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), (o && o.rot) || 0, 0, TAU);
  if (o && o.flat) ctx.fillStyle = c; else shade(ctx, c, x, y, Math.max(rx, ry));
  ctx.fill(); stroke(ctx, o);
}
// 点の列 [x,y,x,y...] の多角形（smooth で角を丸める）
function poly(ctx, pts, c, o) {
  ctx.beginPath();
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let i = 0; i < pts.length; i += 2) { minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]); minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]); }
  if (o && o.smooth) {
    const n = pts.length / 2;
    const mx = (i) => (pts[(i % n) * 2] + pts[((i + 1) % n) * 2]) / 2, my = (i) => (pts[(i % n) * 2 + 1] + pts[((i + 1) % n) * 2 + 1]) / 2;
    ctx.moveTo(mx(0), my(0));
    for (let i = 1; i <= n; i++) ctx.quadraticCurveTo(pts[(i % n) * 2], pts[(i % n) * 2 + 1], mx(i), my(i));
  } else {
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  }
  ctx.closePath();
  if (o && o.flat) ctx.fillStyle = c; else shade(ctx, c, (minX + maxX) / 2, (minY + maxY) / 2, Math.max(maxX - minX, maxY - minY) / 2);
  ctx.fill(); stroke(ctx, o);
}
// 太い線の手足（輪郭つき）
function limb(ctx, x1, y1, x2, y2, c, lw = 5) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = OL; ctx.lineWidth = lw + 3; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function line(ctx, x1, y1, x2, y2, c = OL, lw = 1.6) { ctx.lineCap = 'round'; ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function dot(ctx, x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
// かわいい目：黒い縦長＋白い光。hurt で ×、closed で弧、angry で眉
function eye(ctx, x, y, r, o = {}) {
  if (o.hurt) { line(ctx, x - r, y - r, x + r, y + r, OL, 2); line(ctx, x + r, y - r, x - r, y + r, OL, 2); return; }
  if (o.closed) { ctx.strokeStyle = OL; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y - r * 0.3, r, 0.2, Math.PI - 0.2); ctx.stroke(); return; }
  if (o.white) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, y, r * 1.25, r * 1.4, 0, 0, TAU); ctx.fill(); stroke(ctx, { lw: 1.4 }); }
  ctx.fillStyle = o.color || '#1a1012'; ctx.beginPath(); ctx.ellipse(x + (o.look || 0), y, r * 0.8, r, 0, 0, TAU); ctx.fill();
  dot(ctx, x + (o.look || 0) - r * 0.3, y - r * 0.45, r * 0.38, '#fff');
  if (o.angry) line(ctx, x - r * 1.4, y - r * 2.0, x + r * 1.2, y - r * 1.2, OL, 2.2);
}
function blush(ctx, x, y, r = 3) { ctx.fillStyle = 'rgba(255,110,120,0.5)'; ctx.beginPath(); ctx.ellipse(x, y, r * 1.3, r * 0.8, 0, 0, TAU); ctx.fill(); }
function mouth(ctx, x, y, w, type) {
  ctx.strokeStyle = OL; ctx.lineWidth = 1.6; ctx.beginPath();
  if (type === 'o') { ctx.ellipse(x, y, w * 0.5, w * 0.6, 0, 0, TAU); ctx.fillStyle = '#7a2a2a'; ctx.fill(); }
  else if (type === 'frown') ctx.arc(x, y + w * 0.6, w * 0.6, -2.5, -0.6);
  else ctx.arc(x, y - w * 0.3, w * 0.6, 0.4, Math.PI - 0.4);
  ctx.stroke();
}
function star(ctx, x, y, r, c) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i & 1 ? r * 0.45 : r; i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fillStyle = c; ctx.fill(); stroke(ctx, { lw: 1.4 });
}
function shadowBand(ctx, x, y, w, h) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x, y, w, h); }

// 姿勢：f コマ目 / n コマ
const P = (f, n) => { const ph = (f / n) * TAU; return { ph, s: Math.sin(ph), c: Math.cos(ph), bob: Math.abs(Math.sin(ph)) }; };

// ---- 登録の道具 ----
// anims: { 名前: コマ数 }。draw(ctx, anim, f, n, d)
function enemy(kind, w, h, anims, draw, extra) {
  for (const [anim, n] of Object.entries(anims)) {
    defineSprite(`enemy_${kind}_${anim}`, { w, h, frames: n, ...(extra || {}), draw: (ctx, f, d) => draw(ctx, anim, f, n, d) });
  }
}

// ========== 四つ足（ウリ坊・イノシシ・カモシカ・獅子舞）==========
function legs4(ctx, o, p, anim) {
  const run = anim === 'run', wind = anim === 'windup';
  const amp = run ? 0.9 : anim === 'walk' ? 0.45 : 0.1;
  const top = o.legTop, len = o.legLen;
  const xs = o.legX;   // [後ろ足, 前足]
  const draw = (x, off, c) => {
    let a = Math.sin(p.ph + off) * amp;
    if (wind && off === 0) a = -0.6 + Math.sin(p.ph * 2) * 0.5;   // 溜め：後ろ足で地面をかく
    const lift = Math.max(0, Math.sin(p.ph + off + 1.57)) * (run ? 4 : 2);
    limb(ctx, x, top, x + Math.sin(a) * len, top + Math.cos(a) * len - lift, c, o.legW || 4.5);
    ell(ctx, x + Math.sin(a) * len, top + Math.cos(a) * len - lift, (o.legW || 4.5) * 0.6, 2, o.hoof || dk(c, 0.4), { lw: 1 });
  };
  const back = dk(o.leg, 0.25);
  draw(xs[0] + 3, Math.PI, back); draw(xs[1] + 3, 0, back);
  draw(xs[0], 0, o.leg); draw(xs[1], Math.PI, o.leg);
}

function drawBoar(ctx, anim, f, n, big) {
  const W = big ? 62 : 46, H = big ? 46 : 36;
  const p = P(f, n);
  const hurt = anim === 'hurt';
  const run = anim === 'run', wind = anim === 'windup', dizzy = anim === 'dizzy';
  const k = big ? 1.35 : 1;
  const bob = anim === 'walk' ? p.bob * 1.5 : run ? p.bob * 3 : wind ? Math.sin(p.ph * 2) : 0;
  const lean = run ? 3 : wind ? -2 : 0;
  const col = big ? '#6b4a33' : '#a8703f';
  const legTop = H - 10 * k;
  legs4(ctx, { legTop, legLen: 8 * k, legX: [W * 0.3, W * 0.66], leg: dk(col, 0.25), legW: 4 * k }, p, anim);
  const bx = W * 0.46 + lean, by = H - 18 * k - bob;
  // 尻尾
  ctx.strokeStyle = OL; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx - 15 * k, by - 2); ctx.quadraticCurveTo(bx - 21 * k, by - 8, bx - 17 * k, by - 10); ctx.stroke();
  // 体
  ell(ctx, bx, by, 16 * k, 11 * k, col);
  if (!big) { // ウリ坊のしま模様
    ctx.save(); ctx.beginPath(); ctx.ellipse(bx, by, 16 * k, 11 * k, 0, 0, TAU); ctx.clip();
    ctx.strokeStyle = 'rgba(255,232,190,0.85)'; ctx.lineWidth = 2.2;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(bx - 16, by - 3 + i * 4.5); ctx.quadraticCurveTo(bx, by - 7 + i * 4.5, bx + 14, by - 3 + i * 4.5); ctx.stroke(); }
    ctx.restore();
  } else { // イノシシのたてがみ
    const pts = [];
    for (let i = 0; i <= 8; i++) { pts.push(bx - 16 * k + i * 3.4 * k, by - 10 * k - (i % 2 ? 6 : 1) - Math.sin(i / 8 * Math.PI) * 3); }
    pts.push(bx + 12 * k, by - 4, bx - 14 * k, by - 4);
    poly(ctx, pts, dk(col, 0.3), { lw: 1.6 });
  }
  // おなか
  ctx.fillStyle = 'rgba(255,230,200,0.35)'; ctx.beginPath(); ctx.ellipse(bx + 2, by + 6 * k, 10 * k, 4 * k, 0, 0, TAU); ctx.fill();
  // 頭
  const hx = bx + 15 * k + lean * 0.5, hy = by + (wind ? 3 : 1) * k;
  ell(ctx, hx, hy, 10 * k, 9 * k, col);
  poly(ctx, [hx - 5 * k, hy - 7 * k, hx - 1 * k, hy - 15 * k, hx + 3 * k, hy - 6 * k], dk(col, 0.15), { lw: 1.6 });   // 耳
  ell(ctx, hx + 9 * k, hy + 2 * k, 5 * k, 4.2 * k, '#e0a07c', { lw: 1.6 });   // 鼻
  dot(ctx, hx + 10 * k, hy + 1 * k, 1.1 * k, OL); dot(ctx, hx + 12 * k, hy + 2.5 * k, 1.1 * k, OL);
  if (big) { // 牙
    poly(ctx, [hx + 5 * k, hy + 5 * k, hx + 10 * k, hy + 1 * k, hx + 7 * k, hy + 7 * k], '#fffbea', { lw: 1.3, flat: true });
  }
  if (dizzy) {
    ctx.strokeStyle = OL; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let a = 0; a < 10; a += 0.5) { const r = a * 0.35 * k; const x = hx + 2 * k + Math.cos(a + f * 3) * r, y = hy - 2 * k + Math.sin(a + f * 3) * r; a ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  } else eye(ctx, hx + 2 * k, hy - 2 * k, 2.4 * k, { hurt, angry: big || wind || run, closed: false });
  if (!hurt && !big) blush(ctx, hx - 1, hy + 4, 2.2);
  if (hurt) mouth(ctx, hx + 4 * k, hy + 5 * k, 3, 'o');
}

function drawKamoshika(ctx, anim, f, n) {
  const W = 58, H = 54;
  const p = P(f, n);
  const hurt = anim === 'hurt', run = anim === 'run', wind = anim === 'windup', dizzy = anim === 'dizzy';
  const col = '#8b8478', light = '#e6e0d4';
  const bob = anim === 'walk' ? p.bob * 1.5 : run ? p.bob * 3 : 0;
  legs4(ctx, { legTop: H - 14, legLen: 12, legX: [W * 0.3, W * 0.62], leg: '#5a544c', legW: 4, hoof: '#2a2420' }, p, anim);
  const bx = W * 0.44 + (run ? 3 : 0), by = H - 24 - bob;
  // 短い尻尾
  ell(ctx, bx - 15, by - 4, 3, 2.5, col, { lw: 1.5 });
  ell(ctx, bx, by, 15, 11, col);
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(bx + 2, by + 6, 10, 4, 0, 0, TAU); ctx.fill();
  // 首と頭（溜めで頭を下げ、角を前に）
  const hd = wind ? 7 : run ? 5 : 0;
  const hx = bx + 15, hy = by - 9 + hd;
  ell(ctx, bx + 11, by - 4 + hd * 0.4, 6, 9, col, { rot: 0.5 });
  ell(ctx, hx + 2, hy, 9, 8, light);
  ell(ctx, hx + 9, hy + 3, 5, 4, '#cfc6b6', { lw: 1.5 });
  dot(ctx, hx + 12, hy + 2, 1.2, OL);
  // 角
  limb(ctx, hx - 1, hy - 6, hx - 5 - (wind ? -4 : 0), hy - 14, '#2a2420', 2.2);
  limb(ctx, hx + 3, hy - 7, hx + 1 - (wind ? -4 : 0), hy - 15, '#2a2420', 2.2);
  ell(ctx, hx - 6, hy - 4, 4, 2.2, col, { rot: -0.4, lw: 1.4 });   // 耳
  if (dizzy) { line(ctx, hx, hy - 3, hx + 5, hy - 1); line(ctx, hx, hy, hx + 5, hy - 2); }
  else eye(ctx, hx + 3, hy - 2, 2.3, { hurt, angry: wind || run });
  if (!hurt) blush(ctx, hx + 2, hy + 4, 2);
}

function drawShishi(ctx, anim, f, n) {
  const W = 66, H = 52;
  const p = P(f, n);
  const hurt = anim === 'hurt', run = anim === 'run', wind = anim === 'windup', dizzy = anim === 'dizzy';
  // 中の人の足（白い足袋）
  const amp = run ? 0.9 : anim === 'walk' ? 0.5 : 0.1;
  const leg = (x, off) => { const a = Math.sin(p.ph + off) * amp; limb(ctx, x, H - 14, x + Math.sin(a) * 10, H - 4, '#2a3a6a', 4.5); ell(ctx, x + Math.sin(a) * 10 + 2, H - 3, 4, 2.2, '#f6f2e8', { lw: 1.2 }); };
  leg(14, Math.PI); leg(22, 0); leg(36, Math.PI); leg(44, 0);
  const bob = run ? p.bob * 2 : p.bob;
  // 胴（唐草の緑の布）
  const bx = 30, by = H - 26 - bob * 0.5;
  poly(ctx, [6, by + 10, 4, by - 4, 12, by - 12, 30, by - 15, 44, by - 12, 52, by + 2, 50, by + 13, 8, by + 13], '#2f8a4a', { smooth: true });
  ctx.save(); ctx.beginPath(); ctx.rect(4, by - 16, 48, 30); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { const x = 10 + i * 11 + j * 5, y = by - 6 + j * 9; ctx.beginPath(); ctx.arc(x, y, 3, 0, 4.7); ctx.stroke(); ctx.beginPath(); ctx.arc(x + 4, y, 2, 3.1, 7); ctx.stroke(); }
  ctx.restore();
  // 頭（赤い獅子頭）
  const hx = 52 + (run ? 2 : 0), hy = H - 32 - bob + (wind ? 4 : 0);
  const open = wind ? (f % 2 ? 0.5 : 0.1) : run ? 0.45 : (anim === 'walk' ? 0.15 + 0.1 * p.s : 0.2);
  // 下あご
  poly(ctx, [hx - 9, hy + 6, hx + 12, hy + 6 + open * 10, hx + 10, hy + 13 + open * 10, hx - 8, hy + 12], '#b8231c', { lw: 1.8 });
  for (let i = 0; i < 3; i++) poly(ctx, [hx - 4 + i * 5, hy + 6 + open * 5 * (i / 2), hx - 1 + i * 5, hy + 2 + open * 5 * (i / 2), hx + 1 + i * 5, hy + 6 + open * 5 * (i / 2)], '#fffbea', { lw: 1, flat: true });
  ell(ctx, hx, hy - 2, 13, 10, '#d22e22');
  // 金の眉と目
  ell(ctx, hx + 2, hy - 9, 8, 3, '#e8b830', { lw: 1.4 });
  if (dizzy) { ctx.strokeStyle = OL; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(hx + 3, hy - 3, 3, 0, 5); ctx.stroke(); }
  else { ell(ctx, hx + 3, hy - 3, 4.5, 4, '#ffd84a', { lw: 1.5 }); eye(ctx, hx + 4, hy - 3, 2.2, { hurt }); }
  ell(ctx, hx + 11, hy + 1, 4, 3.5, '#1a1a1a', { lw: 1.2 });   // 鼻
  // 耳
  ell(ctx, hx - 9, hy - 9, 4, 6, '#d22e22', { rot: -0.6, lw: 1.5 });
}

// ========== 二本足の子（サル・下駄投げ・花火師・岩投げ・カッパ・からくり）==========
// pose: { ph, bob, armB, armF, legAmp, hurt }。arm の角度は「真下=0、前へ回すと＋」
function bipedLegs(ctx, cx, H, len, pose, c, foot) {
  const a = Math.sin(pose.ph) * pose.legAmp;
  limb(ctx, cx - 3, H - len - 2, cx - 3 - Math.sin(a) * 5, H - 2, dk(c, 0.2), 4.5);
  limb(ctx, cx + 3, H - len - 2, cx + 3 + Math.sin(a) * 5, H - 2, c, 4.5);
  if (foot) { foot(cx - 3 - Math.sin(a) * 5, H - 2, true); foot(cx + 3 + Math.sin(a) * 5, H - 2, false); }
}
function arm(ctx, x, y, ang, len, c, hand) {
  const ex = x + Math.sin(ang) * len, ey = y + Math.cos(ang) * len;
  limb(ctx, x, y, ex, ey, c, 4.2);
  ell(ctx, ex, ey, 2.8, 2.8, hand || c, { lw: 1.3 });
  return [ex, ey];
}
function throwerPose(anim, f, n) {
  const p = P(f, n);
  const pose = { ph: p.ph, bob: 0, armB: -0.3, armF: 0.35, legAmp: 0, hurt: anim === 'hurt', item: false };
  if (anim === 'walk') { pose.legAmp = 0.7; pose.bob = p.bob * 1.5; pose.armF = 0.3 + p.s * 0.5; pose.armB = -0.3 - p.s * 0.5; }
  if (anim === 'idle') { pose.bob = Math.sin(p.ph) * 0.8; pose.armF = 0.3 + Math.sin(p.ph) * 0.08; }
  if (anim === 'windup') { pose.armF = Math.PI + 0.5 + f * 0.15; pose.item = true; pose.bob = -1; pose.lean = -2; }
  if (anim === 'throw') { pose.armF = 1.9 - f * 0.4; pose.bob = 1; pose.lean = 2; }
  if (anim === 'hurt') { pose.armF = 2.6; pose.armB = -2.6; }
  if (anim === 'block') { pose.armF = 1.4; pose.lean = -1; }
  return pose;
}

// item(ctx, x, y) は手に持つ物。head(ctx, hx, hy, pose)、body(ctx, cx, top, bottom, pose)
function drawBiped(ctx, W, H, o, anim, f, n) {
  const pose = throwerPose(anim, f, n);
  if (o.shield) { pose.armF = 1.35; if (anim === 'walk') pose.armF = 1.35 + pose.ph * 0; }
  const cx = W / 2 - 3 + (pose.lean || 0) * 0.5;
  const legLen = o.legLen || 8;
  const bodyB = H - legLen - 2, bodyT = bodyB - (o.bodyH || 15);
  const sh = bodyT + 3 - pose.bob;
  if (o.back) o.back(ctx, cx, bodyT - pose.bob, bodyB, pose);
  // 奥の腕
  arm(ctx, cx - 4, sh, pose.armB, 9, dk(o.arm, 0.2), o.hand && dk(o.hand, 0.15));
  bipedLegs(ctx, cx, H, legLen, pose, o.leg, o.foot && ((x, y, back) => o.foot(ctx, x, y, back)));
  o.body(ctx, cx, bodyT - pose.bob, bodyB - pose.bob * 0.4, pose);
  const hx = cx + 1 + (pose.lean || 0), hy = bodyT - (o.headR || 13) + 5 - pose.bob;
  if (anim === 'windup' && pose.item && o.item) {   // 振り上げた手に持つ物（頭の後ろ）
    const [ex, ey] = arm(ctx, cx + 3, sh, pose.armF, 10, o.arm, o.hand);
    o.head(ctx, hx, hy, pose);
    o.item(ctx, ex - 1, ey - 4, f);
    if (f === 1) star(ctx, ex - 8, ey - 10, 3.5, '#fff6a8');
    return;
  }
  o.head(ctx, hx, hy, pose);
  const [ex, ey] = arm(ctx, cx + 3, sh, pose.armF, 10, o.arm, o.hand);
  if (o.shield) o.shield(ctx, ex + 2, ey, anim);
}

const SKIN = '#f8d6b4';
function kidFace(ctx, hx, hy, pose, o = {}) {
  eye(ctx, hx + 4, hy + 1, 2.4, { hurt: pose.hurt, angry: o.angry });
  eye(ctx, hx - 3, hy + 1, 2.1, { hurt: pose.hurt, angry: o.angry });
  if (!pose.hurt) blush(ctx, hx + 7, hy + 6, 2.2);
  mouth(ctx, hx + 2, hy + 7, 3.4, pose.hurt ? 'o' : o.mouth);
}

const BIPEDS = {
  saru: {
    W: 46, H: 48, headR: 13, arm: '#8a5a3a', hand: '#f0b49a', leg: '#7a4a2e', bodyH: 14,
    back(ctx, cx, top, bottom, pose) { ctx.strokeStyle = OL; ctx.lineWidth = 4.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx - 6, bottom - 3); ctx.bezierCurveTo(cx - 18, bottom, cx - 20, top - 4, cx - 12, top - 6 + Math.sin(pose.ph) * 2); ctx.stroke(); ctx.strokeStyle = '#8a5a3a'; ctx.lineWidth = 2.5; ctx.stroke(); },
    body(ctx, cx, top, bottom) { ell(ctx, cx, (top + bottom) / 2 + 1, 9, (bottom - top) / 2 + 2, '#8a5a3a'); ell(ctx, cx + 2, (top + bottom) / 2 + 2, 5, 5, '#e8c09a', { lw: 1.2 }); },
    head(ctx, hx, hy, pose) {
      ell(ctx, hx - 12, hy + 1, 4, 4.5, '#f0b49a'); ell(ctx, hx + 13, hy + 1, 3.6, 4.2, '#f0b49a');
      ell(ctx, hx, hy, 13, 12, '#8a5a3a');
      // 顔（ハート形）
      ctx.beginPath(); ctx.moveTo(hx + 1, hy - 4); ctx.bezierCurveTo(hx - 3, hy - 10, hx - 11, hy - 4, hx - 8, hy + 3); ctx.quadraticCurveTo(hx - 5, hy + 10, hx + 2, hy + 10); ctx.quadraticCurveTo(hx + 10, hy + 10, hx + 11, hy + 3); ctx.bezierCurveTo(hx + 13, hy - 4, hx + 5, hy - 10, hx + 1, hy - 4); ctx.closePath();
      shade(ctx, '#f0b49a', hx, hy + 2, 10); ctx.fill(); stroke(ctx, { lw: 1.4 });
      kidFace(ctx, hx, hy, pose, { mouth: 'smile' });
      // 頭の毛
      poly(ctx, [hx - 3, hy - 11, hx, hy - 17, hx + 2, hy - 11, hx + 5, hy - 15, hx + 5, hy - 10], '#7a4a2e', { lw: 1.3 });
    },
    item(ctx, x, y) { drawIga(ctx, x, y, 7); },
  },
  geta: {
    W: 44, H: 50, headR: 13, arm: SKIN, leg: SKIN, bodyH: 17,
    foot(ctx, x, y, back) { ctx.fillStyle = back ? '#7a5030' : '#a87444'; ctx.fillRect(x - 4, y - 1, 9, 3); },
    body(ctx, cx, top, bottom) {
      poly(ctx, [cx - 8, top, cx + 8, top, cx + 10, bottom, cx - 10, bottom], '#2f4a8a', { lw: 2 });
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 6; i++) dot(ctx, cx - 6 + (i % 3) * 6 + (i > 2 ? 3 : 0), top + 4 + (i > 2 ? 8 : 0), 1.2, '#fff');
      ctx.fillStyle = '#d23a2e'; ctx.fillRect(cx - 9, top + 8, 18, 4); stroke(ctx, { lw: 0 });
      line(ctx, cx - 6, top, cx + 2, top + 7, '#f4f0e8', 2);
    },
    head(ctx, hx, hy, pose) {
      ell(ctx, hx, hy, 12.5, 12, SKIN);
      // 黒髪のおかっぱ＋ちょんまげ
      ctx.beginPath(); ctx.moveTo(hx - 13, hy + 2); ctx.quadraticCurveTo(hx - 14, hy - 14, hx, hy - 13); ctx.quadraticCurveTo(hx + 13, hy - 13, hx + 12, hy - 3); ctx.lineTo(hx + 4, hy - 6); ctx.lineTo(hx - 2, hy - 3); ctx.lineTo(hx - 8, hy - 2); ctx.closePath();
      shade(ctx, '#2a2228', hx, hy - 6, 12); ctx.fill(); stroke(ctx, { lw: 1.6 });
      ell(ctx, hx - 2, hy - 15, 4, 3, '#2a2228', { lw: 1.4 });
      kidFace(ctx, hx, hy + 1, pose, { mouth: 'smile', angry: true });
    },
    item(ctx, x, y) { drawGeta(ctx, x, y, 0.8); },
  },
  hanabi: {
    W: 46, H: 50, headR: 13, arm: SKIN, leg: '#3a3a4a', bodyH: 16,
    foot(ctx, x, y) { ell(ctx, x + 1, y, 4, 2, '#f6f2e8', { lw: 1 }); },
    body(ctx, cx, top, bottom) {
      poly(ctx, [cx - 9, top, cx + 9, top, cx + 10, bottom, cx - 10, bottom], '#c8302a', { lw: 2 });
      line(ctx, cx - 7, top + 1, cx + 3, bottom - 2, '#f4f0e8', 2.2);   // 襟
      ctx.fillStyle = '#f4f0e8'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('花', cx + 4, bottom - 4);
    },
    head(ctx, hx, hy, pose) {
      // とんがった髪
      poly(ctx, [hx - 12, hy, hx - 12, hy - 10, hx - 6, hy - 17, hx - 2, hy - 12, hx + 3, hy - 18, hx + 6, hy - 12, hx + 12, hy - 14, hx + 12, hy - 2], '#2a2228', { lw: 1.6 });
      ell(ctx, hx, hy + 1, 12, 11, SKIN);
      // はちまき
      ctx.fillStyle = '#f6f2e8'; ctx.fillRect(hx - 12, hy - 7, 24, 4); ctx.strokeStyle = OL; ctx.lineWidth = 1.2; ctx.strokeRect(hx - 12, hy - 7, 24, 4);
      poly(ctx, [hx - 12, hy - 6, hx - 19, hy - 9, hx - 18, hy - 3], '#f6f2e8', { lw: 1.2, flat: true });
      kidFace(ctx, hx, hy + 2, pose, { mouth: 'smile' });
    },
    item(ctx, x, y, f) { drawHanabiBall(ctx, x, y, 7, f); },
  },
  iwanage: {
    W: 50, H: 52, headR: 14, arm: '#8a8a86', hand: '#9a9a94', leg: '#6e6e6a', bodyH: 16,
    body(ctx, cx, top, bottom) {
      poly(ctx, [cx - 11, top + 2, cx - 6, top - 1, cx + 7, top, cx + 12, top + 6, cx + 10, bottom, cx - 11, bottom], '#8a8a86', { lw: 2 });
      ell(ctx, cx - 4, top + 4, 4, 2.5, '#6aa04a', { lw: 1 });   // 苔
      line(ctx, cx + 2, top + 6, cx + 6, top + 11, dk('#8a8a86', 0.4), 1.4);
    },
    head(ctx, hx, hy, pose) {
      poly(ctx, [hx - 6, hy - 10, hx - 8, hy - 18, hx - 2, hy - 11], '#f0e6c8', { lw: 1.3 });
      poly(ctx, [hx + 5, hy - 11, hx + 7, hy - 19, hx + 10, hy - 9], '#f0e6c8', { lw: 1.3 });
      poly(ctx, [hx - 13, hy + 3, hx - 12, hy - 7, hx - 4, hy - 12, hx + 8, hy - 12, hx + 14, hy - 4, hx + 13, hy + 7, hx + 4, hy + 11, hx - 8, hy + 10], '#9a9a94', { lw: 2, smooth: true });
      ell(ctx, hx - 6, hy - 9, 5, 2.5, '#6aa04a', { lw: 1 });
      eye(ctx, hx + 5, hy, 2.4, { hurt: pose.hurt, angry: true });
      eye(ctx, hx - 2, hy, 2.1, { hurt: pose.hurt, angry: true });
      mouth(ctx, hx + 2, hy + 6, 4, pose.hurt ? 'o' : 'frown');
    },
    item(ctx, x, y) { drawRock(ctx, x, y, 10); },
  },
  kappa: {
    W: 50, H: 52, headR: 13, arm: '#5fae5a', leg: '#4f9a4a', bodyH: 15,
    back(ctx, cx, top, bottom) { ell(ctx, cx - 8, (top + bottom) / 2, 8, 10, '#8a6a3a'); line(ctx, cx - 12, top + 4, cx - 6, bottom - 4, dk('#8a6a3a', 0.4), 1.3); },
    body(ctx, cx, top, bottom) { ell(ctx, cx, (top + bottom) / 2 + 1, 9, (bottom - top) / 2 + 2, '#5fae5a'); ell(ctx, cx + 2, (top + bottom) / 2 + 2, 5, 6, '#e8e0a0', { lw: 1.2 }); },
    head(ctx, hx, hy, pose) {
      ell(ctx, hx, hy, 13, 12, '#5fae5a');
      // 髪（ふち）と皿
      for (let i = 0; i < 7; i++) poly(ctx, [hx - 12 + i * 4, hy - 7, hx - 10 + i * 4, hy - 13, hx - 8 + i * 4, hy - 7], '#2f6a34', { lw: 1, flat: true });
      ell(ctx, hx, hy - 11, 8, 3.2, '#eaf4f2', { lw: 1.5 });
      // くちばし
      poly(ctx, [hx + 7, hy + 3, hx + 16, hy + 5, hx + 7, hy + 8], '#f2c14a', { lw: 1.5 });
      eye(ctx, hx + 3, hy - 1, 2.6, { hurt: pose.hurt, white: true });
      eye(ctx, hx - 4, hy - 1, 2.3, { hurt: pose.hurt, white: true });
      if (!pose.hurt) blush(ctx, hx - 1, hy + 6, 2.2);
    },
    shield(ctx, x, y, anim) { // 蓮の葉の盾
      const b = anim === 'block';
      ell(ctx, x + 4, y - 4, 7, 15, b ? '#7ad06a' : '#4f9a40', { lw: 2 });
      ctx.strokeStyle = dk('#4f9a40', 0.35); ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + 3, y - 4); ctx.lineTo(x + 8, y - 4 + i * 6); ctx.stroke(); }
      dot(ctx, x + 3, y - 4, 1.6, '#e8f0a0');
      if (b) star(ctx, x + 9, y - 14, 3, '#ffffff');
    },
  },
  karakuri: {
    W: 48, H: 54, headR: 13, arm: '#b0302a', hand: '#fbf4ea', leg: '#3a2a4a', bodyH: 17,
    body(ctx, cx, top, bottom) {
      poly(ctx, [cx - 9, top, cx + 9, top, cx + 11, bottom, cx - 11, bottom], '#b0302a', { lw: 2 });
      ctx.fillStyle = '#e8b830'; for (let i = 0; i < 3; i++) dot(ctx, cx - 5 + i * 5, top + 8 + (i % 2) * 3, 1.4, '#e8b830');
      ctx.fillStyle = '#3a2a4a'; ctx.fillRect(cx - 11, bottom - 5, 22, 5);
      line(ctx, cx - 6, top, cx + 3, top + 7, '#fbf4ea', 2);
    },
    head(ctx, hx, hy, pose) {
      ell(ctx, hx, hy, 12.5, 12, '#fbf4ea');
      // おかっぱ（黒い漆）
      ctx.beginPath(); ctx.moveTo(hx - 13, hy + 7); ctx.quadraticCurveTo(hx - 15, hy - 15, hx, hy - 13); ctx.quadraticCurveTo(hx + 14, hy - 14, hx + 13, hy + 1); ctx.lineTo(hx + 10, hy - 4); ctx.lineTo(hx - 7, hy - 4); ctx.lineTo(hx - 9, hy + 7); ctx.closePath();
      shade(ctx, '#1e1418', hx, hy - 6, 13); ctx.fill(); stroke(ctx, { lw: 1.6 });
      // 細い目と小さな赤い口（からくり人形）
      if (pose.hurt) { eye(ctx, hx + 4, hy + 1, 2, { hurt: true }); eye(ctx, hx - 3, hy + 1, 2, { hurt: true }); }
      else { line(ctx, hx + 2, hy + 1, hx + 7, hy + 1, OL, 2); line(ctx, hx - 5, hy + 1, hx - 1, hy + 1, OL, 2); }
      dot(ctx, hx + 3, hy + 6, 1.4, '#d82a2a');
      blush(ctx, hx + 7, hy + 5, 2);
      // 頭のねじ（からくり）
      line(ctx, hx - 13, hy, hx - 17, hy, '#8a6a3a', 2); ell(ctx, hx - 18, hy, 2, 3.5, '#c8a050', { lw: 1 });
    },
    shield(ctx, x, y, anim) { // 漆塗りのお盆（横から）
      const b = anim === 'block';
      ell(ctx, x + 4, y - 4, 5, 15, '#2a1a1a', { lw: 2 });
      ell(ctx, x + 5, y - 4, 2.5, 12, b ? '#ff5a4a' : '#b0302a', { lw: 1 });
      dot(ctx, x + 5, y - 4, 2, '#e8b830');
      if (b) star(ctx, x + 9, y - 15, 3, '#ffffff');
    },
  },
};

// ---- 投げる物 ----
function drawIga(ctx, x, y, r) {
  ctx.strokeStyle = '#4a7a2a'; ctx.lineWidth = 1.6;
  for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6); ctx.lineTo(x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35); ctx.stroke(); }
  ell(ctx, x, y, r, r, '#7ab04a', { lw: 1.6 });
  ell(ctx, x + r * 0.2, y + r * 0.2, r * 0.45, r * 0.38, '#8a4a22', { lw: 1 });
}
function drawGeta(ctx, x, y, k = 1) {
  poly(ctx, [x - 10 * k, y - 3 * k, x + 10 * k, y - 3 * k, x + 10 * k, y + 1 * k, x - 10 * k, y + 1 * k], '#b88050', { lw: 1.6 });
  ctx.fillStyle = '#7a5030'; ctx.fillRect(x - 7 * k, y + 1 * k, 3 * k, 4 * k); ctx.fillRect(x + 4 * k, y + 1 * k, 3 * k, 4 * k);
  ctx.strokeStyle = '#d02a2a'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(x - 4 * k, y - 3 * k); ctx.quadraticCurveTo(x, y - 9 * k, x + 4 * k, y - 3 * k); ctx.stroke();
}
function drawHanabiBall(ctx, x, y, r, f) {
  ell(ctx, x, y, r, r, '#2a2a34', { lw: 1.6 });
  ctx.strokeStyle = '#c8a050'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.35, 0, 0, TAU); ctx.stroke();
  line(ctx, x + r * 0.5, y - r * 0.8, x + r * 1.0, y - r * 1.5, '#c8a050', 1.6);
  star(ctx, x + r * 1.1, y - r * 1.7, 3 + (f % 2), f % 2 ? '#fff6a0' : '#ffb347');
}
function drawRock(ctx, x, y, r) {
  poly(ctx, [x - r, y + r * 0.3, x - r * 0.7, y - r * 0.7, x + r * 0.2, y - r, x + r, y - r * 0.3, x + r * 0.8, y + r * 0.7, x - r * 0.3, y + r * 0.9], '#857b70', { lw: 1.8 });
  line(ctx, x - r * 0.2, y - r * 0.3, x + r * 0.3, y + r * 0.2, dk('#857b70', 0.4), 1.2);
}

// ========== 一匹ずつの絵 ==========
function drawCrab(ctx, anim, f, n) {
  const p = P(f, n), hurt = anim === 'hurt';
  const W = 46, H = 32, cx = W / 2, by = H - 11 - p.bob;
  // 足（6本）
  for (let i = 0; i < 3; i++) {
    const a = Math.sin(p.ph + i * 2) * 0.4;
    limb(ctx, cx - 6 - i * 3, by + 2, cx - 12 - i * 4 + a * 3, H - 2, '#c8402a', 2.2);
    limb(ctx, cx + 6 + i * 3, by + 2, cx + 12 + i * 4 - a * 3, H - 2, '#c8402a', 2.2);
  }
  // はさみ（かちかち）
  const clap = anim === 'walk' ? (f % 2) * 0.35 : 0.2;
  for (const s of [-1, 1]) {
    const hx = cx + s * 17, hy = by - 9 - p.s * 1.5;
    limb(ctx, cx + s * 9, by - 1, hx, hy + 3, '#d24a30', 2.6);
    ell(ctx, hx, hy, 5.5, 4.5, '#e25a3a', { lw: 1.6 });
    poly(ctx, [hx + s * 2, hy - 2, hx + s * 8, hy - 6 - clap * 6, hx + s * 4, hy - 1], '#e25a3a', { lw: 1.4 });
  }
  ell(ctx, cx, by, 13, 8.5, '#e0502e');
  dot(ctx, cx - 5, by + 1, 1, 'rgba(255,255,255,0.6)'); dot(ctx, cx + 4, by + 3, 1, 'rgba(255,255,255,0.6)');
  // 目（つの）
  for (const s of [-1, 1]) { line(ctx, cx + s * 4, by - 7, cx + s * 5, by - 12, OL, 2); ell(ctx, cx + s * 5, by - 13, 3.4, 3.4, '#fff', { lw: 1.3, flat: true }); eye(ctx, cx + s * 5 + 0.5, by - 13, 1.8, { hurt }); }
  if (!hurt) { blush(ctx, cx - 8, by + 2, 2); blush(ctx, cx + 8, by + 2, 2); }
  mouth(ctx, cx, by + 2, 3, hurt ? 'o' : 'smile');
}

function drawSnowball(ctx, anim, f, n) {
  const p = P(f, n), hurt = anim === 'hurt';
  const W = 40, H = 40, cx = W / 2;
  const by = H - 17 - p.bob * 1.5;
  // 長ぐつ
  for (const s of [-1, 1]) { const a = s * p.s * 3; ell(ctx, cx + s * 7 + a, H - 4 + (s * p.s > 0 ? -1.5 : 0), 5, 3.5, '#3a5a9a', { lw: 1.5 }); }
  ell(ctx, cx, by, 15, 14, '#f4f8ff', { lw: 2 });
  ctx.fillStyle = 'rgba(150,180,220,0.35)'; ctx.beginPath(); ctx.ellipse(cx + 5, by + 6, 9, 6, 0.4, 0, TAU); ctx.fill();
  // マフラー
  poly(ctx, [cx - 12, by + 4, cx + 12, by + 4, cx + 11, by + 8, cx - 11, by + 8], '#d8402e', { lw: 1.4 });
  poly(ctx, [cx - 8, by + 6, cx - 13, by + 14 + p.s * 2, cx - 8, by + 14], '#d8402e', { lw: 1.4 });
  eye(ctx, cx + 6, by - 4, 2.4, { hurt }); eye(ctx, cx - 1, by - 4, 2.2, { hurt });
  // 人参の鼻
  poly(ctx, [cx + 3, by - 1, cx + 11, by + 0.5, cx + 3, by + 2], '#f08a2a', { lw: 1.2 });
  if (!hurt) blush(ctx, cx + 9, by + 2, 2);
}

function spikyBall(ctx, anim, f, n, body, spike, spikes) {
  const p = P(f, n), hurt = anim === 'hurt';
  const W = 40, cx = W / 2, H = 38;
  const by = H - 16 - p.bob;
  for (const s of [-1, 1]) ell(ctx, cx + s * 7 + s * p.s * 2.5, H - 3, 4.5, 3, dk(body, 0.4), { lw: 1.4 });
  // トゲ
  const rot = p.ph * 0.15;
  for (let i = 0; i < spikes; i++) {
    const a = rot + i / spikes * TAU, a1 = a - 0.18, a2 = a + 0.18;
    poly(ctx, [cx + Math.cos(a1) * 12, by + Math.sin(a1) * 12, cx + Math.cos(a) * 20, by + Math.sin(a) * 19, cx + Math.cos(a2) * 12, by + Math.sin(a2) * 12], spike, { lw: 1.3 });
  }
  ell(ctx, cx, by, 14, 13, body);
  eye(ctx, cx + 5, by - 2, 2.6, { hurt, angry: true, white: true }); eye(ctx, cx - 3, by - 2, 2.3, { hurt, angry: true, white: true });
  mouth(ctx, cx + 1, by + 5, 4, hurt ? 'o' : 'frown');
}

function drawKarasu(ctx, anim, f, n) {
  const p = P(f, n), hurt = anim === 'hurt';
  const W = 50, H = 40, cx = 24, cy = H - 16 + p.s * 1.5;
  const flap = hurt ? 0 : Math.sin(p.ph);
  // 奥の翼
  poly(ctx, [cx - 2, cy - 4, cx - 14, cy - 6 - flap * 13, cx - 22, cy - 2 - flap * 9, cx - 8, cy + 3], '#2a2a38', { lw: 1.6 });
  ell(ctx, cx - 12, cy + 3, 6, 3, '#2a2a38', { rot: 0.3, lw: 1.4 });   // 尾
  ell(ctx, cx, cy, 13, 11, '#3a3a4c');
  ell(ctx, cx + 9, cy - 6, 9, 8, '#3a3a4c');
  poly(ctx, [cx + 15, cy - 8, cx + 25, cy - 5, cx + 15, cy - 2], '#f2c33a', { lw: 1.5 });   // くちばし
  eye(ctx, cx + 11, cy - 8, 2.4, { hurt, white: true, angry: true });
  // 手前の翼
  poly(ctx, [cx - 3, cy - 2, cx + 2, cy - 8 - flap * 16, cx - 14, cy - 6 - flap * 14, cx - 10, cy + 4], '#4a4a60', { lw: 1.6 });
  line(ctx, cx + 1, cy + 10, cx + 1, cy + 14, '#f2c33a', 1.8); line(ctx, cx + 5, cy + 10, cx + 5, cy + 14, '#f2c33a', 1.8);
}

function drawTonbo(ctx, anim, f, n) {
  const p = P(f, n), hurt = anim === 'hurt';
  const H = 30, cx = 30, cy = H - 14;
  // しっぽ（赤い節）
  for (let i = 0; i < 6; i++) ell(ctx, cx - 6 - i * 4, cy + i * 0.3, 2.6, 2.2, i % 2 ? '#d8402e' : '#e8603e', { lw: 1 });
  // 羽（すばやくはばたく）
  const fl = hurt ? 0.3 : (f % 2 ? 0.8 : -0.4);
  ctx.globalAlpha = 0.6;
  for (const [ox, sy] of [[-3, -1], [3, -1]]) {
    ell(ctx, cx + ox - 6, cy - 7 - fl * 4, 11, 3.2, '#e6f6ff', { rot: 0.35 * sy + fl * 0.3, lw: 1 });
    ell(ctx, cx + ox + 6, cy - 7 - fl * 4, 11, 3.2, '#e6f6ff', { rot: -0.35 * sy - fl * 0.3, lw: 1 });
  }
  ctx.globalAlpha = 1;
  ell(ctx, cx + 2, cy, 6, 4.5, '#c8402e');
  ell(ctx, cx + 10, cy - 1, 5.5, 5, '#4ab06a', { lw: 1.5 });
  eye(ctx, cx + 12, cy - 2, 2.2, { hurt });
  for (let i = 0; i < 3; i++) line(ctx, cx + i * 3, cy + 3, cx - 2 + i * 3, cy + 7, OL, 1);
}

function drawChochin(ctx, anim, f, n) {
  const p = P(f, n), hurt = anim === 'hurt';
  const W = 36, H = 50, cx = W / 2, cy = H - 22 + p.s * 1.5;
  // 火の玉の灯り
  ctx.fillStyle = 'rgba(255,190,90,0.35)'; ctx.beginPath(); ctx.arc(cx, cy, 18, 0, TAU); ctx.fill();
  // 本体（紙の提灯）
  ctx.beginPath(); ctx.ellipse(cx, cy, 12, 16, 0, 0, TAU);
  const g = ctx.createRadialGradient(cx - 3, cy - 4, 2, cx, cy, 17); g.addColorStop(0, '#fff2c0'); g.addColorStop(0.6, '#f07a40'); g.addColorStop(1, '#b0302a');
  ctx.fillStyle = g; ctx.fill(); stroke(ctx, { lw: 2 });
  ctx.strokeStyle = 'rgba(90,20,10,0.5)'; ctx.lineWidth = 1;
  for (let i = -3; i <= 3; i++) { const y = cy + i * 4.5, r = Math.sqrt(Math.max(0, 1 - (i * 4.5 / 16) ** 2)) * 12; ctx.beginPath(); ctx.moveTo(cx - r, y); ctx.lineTo(cx + r, y); ctx.stroke(); }
  // 上下の黒い枠
  poly(ctx, [cx - 7, cy - 15, cx + 7, cy - 15, cx + 6, cy - 19, cx - 6, cy - 19], '#2a2228', { lw: 1.4 });
  poly(ctx, [cx - 7, cy + 15, cx + 7, cy + 15, cx + 6, cy + 19, cx - 6, cy + 19], '#2a2228', { lw: 1.4 });
  // ひとつ目と舌
  if (hurt) eye(ctx, cx + 2, cy - 3, 3.5, { hurt: true });
  else { ell(ctx, cx + 2, cy - 3, 5.5, 5.5, '#fff', { lw: 1.4, flat: true }); eye(ctx, cx + 3.5, cy - 3, 3, {}); }
  const tl = 3 + Math.max(0, p.s) * 3;
  ctx.beginPath(); ctx.moveTo(cx - 1, cy + 6); ctx.quadraticCurveTo(cx + 3, cy + 8 + tl * 2, cx + 6, cy + 6); ctx.closePath(); ctx.fillStyle = '#e8506a'; ctx.fill(); stroke(ctx, { lw: 1.3 });
  mouth(ctx, cx + 2, cy + 5, 5, 'smile');
}

function drawTako(ctx, anim, f, n) {
  const p = P(f, n), hurt = anim === 'hurt';
  const W = 50, H = 56, cx = W / 2, cy = H - 30;
  const tilt = Math.sin(p.ph) * 0.06;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt);
  // しっぽのひも
  ctx.strokeStyle = '#d8402e'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 6, 14); ctx.quadraticCurveTo(s * 8 + Math.sin(p.ph + s) * 6, 22, s * 4 + Math.sin(p.ph * 2 + s) * 5, 30); ctx.stroke(); }
  // 紙
  poly(ctx, [-17, -18, 17, -18, 17, 15, -17, 15], '#f6eedc', { lw: 2 });
  // 骨（竹）
  line(ctx, -17, -18, 17, 15, '#a07a40', 1.2); line(ctx, 17, -18, -17, 15, '#a07a40', 1.2);
  // 絵の顔（武者風のまゆ）
  ctx.fillStyle = '#d8402e'; ctx.fillRect(-17, -18, 34, 6);
  ell(ctx, 0, 2, 12, 11, '#f8d6b4', { lw: 1.4 });
  if (hurt) { eye(ctx, -5, 0, 2.4, { hurt: true }); eye(ctx, 5, 0, 2.4, { hurt: true }); }
  else { eye(ctx, -5, 1, 2.6, { white: true }); eye(ctx, 5, 1, 2.6, { white: true }); }
  line(ctx, -10, -5, -2, -3, OL, 3); line(ctx, 10, -5, 2, -3, OL, 3);
  mouth(ctx, 0, 8, 4, hurt ? 'o' : 'smile');
  blush(ctx, -8, 6, 2); blush(ctx, 8, 6, 2);
  ctx.restore();
}

function drawYukigumo(ctx, anim, f, n) {
  const p = P(f, n), hurt = anim === 'hurt', warn = anim === 'warn';
  const W = 64, H = 44, cx = W / 2, cy = H - 22 + p.s;
  const col = warn ? '#b8c8e0' : '#eef4fc';
  for (const [dx, dy, r] of [[-17, 4, 10], [17, 4, 10], [-8, -6, 12], [8, -7, 13], [0, 4, 14]]) ell(ctx, cx + dx, cy + dy, r * 1.1, r, col, { lw: 2 });
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(cx, cy + 3, 22, 9, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(120,150,200,0.25)'; ctx.beginPath(); ctx.ellipse(cx, cy + 9, 22, 4, 0, 0, TAU); ctx.fill();
  eye(ctx, cx + 6, cy, 2.6, { hurt, angry: warn }); eye(ctx, cx - 4, cy, 2.4, { hurt, angry: warn });
  if (warn) mouth(ctx, cx + 1, cy + 7, 4, 'o'); else { mouth(ctx, cx + 1, cy + 6, 3, hurt ? 'o' : 'smile'); blush(ctx, cx + 11, cy + 5, 2.2); blush(ctx, cx - 9, cy + 5, 2.2); }
  // 下に雪の粒
  if (!hurt) for (let i = 0; i < 3; i++) dot(ctx, cx - 10 + i * 10 + (f % 2) * 2, cy + 14 + ((i + f) % 2) * 3, 1.5, '#ffffff');
  if (warn) for (let i = 0; i < 2; i++) poly(ctx, [cx - 3 + i * 6, cy + 11, cx - 1 + i * 6, cy + 17 + f * 2, cx + 1 + i * 6, cy + 11], '#d8f0ff', { lw: 1 });
}

function drawKomori(ctx, anim, f, n) {
  const p = P(f, n), hurt = anim === 'hurt';
  const W = 54, H = 36, cx = W / 2, cy = H - 16;
  const fl = hurt ? 0.2 : Math.sin(p.ph);
  for (const s of [-1, 1]) {
    const tip = cy - 4 - fl * 12;
    poly(ctx, [cx + s * 4, cy - 3, cx + s * 14, tip - 4, cx + s * 25, tip + 2, cx + s * 20, cy + 3 - fl * 3, cx + s * 15, cy + 1 - fl * 4, cx + s * 10, cy + 5, cx + s * 4, cy + 3], '#5a3a6a', { lw: 1.6 });
  }
  ell(ctx, cx, cy, 8, 7.5, '#6a4a7a');
  poly(ctx, [cx - 6, cy - 4, cx - 5, cy - 13, cx - 1, cy - 6], '#6a4a7a', { lw: 1.3 });
  poly(ctx, [cx + 6, cy - 4, cx + 5, cy - 13, cx + 1, cy - 6], '#6a4a7a', { lw: 1.3 });
  eye(ctx, cx + 3, cy - 1, 2, { hurt, color: '#ffd84a', white: false });
  eye(ctx, cx - 3, cy - 1, 2, { hurt, color: '#ffd84a' });
  poly(ctx, [cx - 2, cy + 3, cx - 1, cy + 6, cx, cy + 3], '#fff', { lw: 0.8, flat: true });
  poly(ctx, [cx + 1, cy + 3, cx + 2, cy + 6, cx + 3, cy + 3], '#fff', { lw: 0.8, flat: true });
}

// カエル（カジカ・溶岩ガエル）
function drawFrog(ctx, anim, f, n, col, belly, glow) {
  const W = glow ? 46 : 42, H = glow ? 36 : 34, cx = W / 2;
  const hurt = anim === 'hurt';
  const crouch = anim === 'crouch', jump = anim === 'jump', fall = anim === 'fall';
  const idle = anim === 'idle';
  let by = H - 11, ry = 9, rx = 13;
  if (crouch) { by = H - 8; ry = 7; rx = 15; }
  if (jump) { by = H - 15; ry = 10; rx = 11; }
  // 後ろ足
  if (jump) { limb(ctx, cx - 6, by + 4, cx - 15, H - 2, dk(col, 0.15), 4); ell(ctx, cx - 17, H - 2, 4, 2, dk(col, 0.2), { lw: 1.2 }); }
  else if (fall) { limb(ctx, cx - 7, by + 4, cx - 14, by + 9, dk(col, 0.15), 4); limb(ctx, cx + 7, by + 4, cx + 13, by + 9, col, 4); }
  else { ell(ctx, cx - 9, H - 6, 7, 5, dk(col, 0.1)); ell(ctx, cx - 9, H - 2, 5, 2, dk(col, 0.25), { lw: 1.2 }); }
  ell(ctx, cx, by, rx, ry, col);
  ell(ctx, cx + 3, by + 3, rx * 0.6, ry * 0.5, belly, { lw: 1.2 });
  if (!glow) { dot(ctx, cx - 6, by - 4, 1.8, dk(col, 0.35)); dot(ctx, cx - 1, by - 6, 1.5, dk(col, 0.35)); }
  else {
    ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 1.6; ctx.beginPath();
    ctx.moveTo(cx - 9, by - 2); ctx.lineTo(cx - 4, by + 1); ctx.lineTo(cx - 5, by + 5); ctx.moveTo(cx - 4, by + 1); ctx.lineTo(cx + 2, by - 1); ctx.moveTo(cx + 5, by - 5); ctx.lineTo(cx + 3, by - 1);
    ctx.stroke();
  }
  // 前足
  if (!jump) ell(ctx, cx + 9, H - 2, 3.5, 2, dk(col, 0.2), { lw: 1.2 });
  else limb(ctx, cx + 8, by + 4, cx + 14, by + 8, col, 3);
  // 目（頭の上）
  for (const [ex, er] of [[cx + 7, 4.5], [cx - 1, 4]]) {
    ell(ctx, ex, by - ry + 1, er, er, col, { lw: 1.6 });
    eye(ctx, ex + 0.5, by - ry + 1, er * 0.62, { hurt, color: glow ? '#ff8a2a' : '#1a1012', closed: idle && f === 1 && !glow });
  }
  // のど
  if (idle && f === 1) ell(ctx, cx + 9, by + 4, 4, 3.5, lt(belly, 0.2), { lw: 1.1 });
  mouth(ctx, cx + 7, by + 2, 4, hurt ? 'o' : 'smile');
}

function drawUchiwa(ctx, anim, f, n) {
  const W = 40, H = 50, cx = W / 2;
  const hurt = anim === 'hurt', crouch = anim === 'crouch', jump = anim === 'jump', fall = anim === 'fall';
  const bend = crouch ? 0.3 : jump ? -0.1 : fall ? 0.15 : (f ? 0.08 : -0.08);
  const fy = H - (crouch ? 26 : 30);
  // 柄（足）
  limb(ctx, cx, H - 2, cx, fy + 12, '#c8a060', 3.5);
  ctx.save(); ctx.translate(cx, fy); ctx.rotate(bend); ctx.scale(1, crouch ? 0.85 : jump ? 1.08 : 1);
  // うちわの紙（朝顔の柄）
  ell(ctx, 0, -2, 16, 15, '#f6f0e4', { lw: 2 });
  ctx.save(); ctx.beginPath(); ctx.ellipse(0, -2, 15, 14, 0, 0, TAU); ctx.clip();
  ctx.fillStyle = '#3a6ac8'; ctx.beginPath(); ctx.arc(-9, 6, 8, 0, TAU); ctx.fill();
  ctx.fillStyle = '#d8507a'; ctx.beginPath(); ctx.arc(10, -10, 7, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(160,120,60,0.45)'; ctx.lineWidth = 0.8;
  for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(i * 3, -17); ctx.stroke(); }
  ctx.restore();
  eye(ctx, 5, -3, 2.4, { hurt, white: true }); eye(ctx, -3, -3, 2.2, { hurt, white: true });
  mouth(ctx, 1, 4, 3.5, hurt ? 'o' : 'smile');
  if (!hurt) { blush(ctx, 9, 2, 2); blush(ctx, -7, 2, 2); }
  // はちまき
  ctx.fillStyle = '#d23a2e'; ctx.fillRect(-15, -12, 30, 3);
  ctx.restore();
  // 手（はっぴの袖）
  const wave = jump ? -1 : fall ? 0.5 : Math.sin(f * 3);
  limb(ctx, cx - 14, fy + 2, cx - 20, fy - 6 * wave, '#f8d6b4', 2.5);
  limb(ctx, cx + 14, fy + 2, cx + 20, fy - 6 * wave, '#f8d6b4', 2.5);
}

function drawUsagi(ctx, anim, f, n) {
  const W = 38, H = 38, cx = W / 2;
  const hurt = anim === 'hurt', crouch = anim === 'crouch', jump = anim === 'jump';
  const sy = crouch ? 0.82 : jump ? 1.1 : 1;
  const by = H - 12 * sy;
  // 葉っぱの耳
  const ear = jump ? -0.5 : crouch ? 0.4 : (f ? 0.15 : 0);
  for (const [dx, a] of [[-3, -0.35], [4, 0.1]]) ell(ctx, cx + dx + Math.sin(a + ear) * 8, by - 15 * sy, 3.6, 9, '#4a9a3a', { rot: a + ear, lw: 1.5 });
  ell(ctx, cx, by, 14, 11 * sy, '#ffffff', { lw: 2 });
  ctx.fillStyle = 'rgba(150,180,220,0.35)'; ctx.beginPath(); ctx.ellipse(cx - 3, by + 6 * sy, 9, 3.5, 0, 0, TAU); ctx.fill();
  // 南天の赤い目
  eye(ctx, cx + 7, by - 2, 2.4, { hurt, color: '#d8202a' }); eye(ctx, cx + 1, by - 2, 2.2, { hurt, color: '#d8202a' });
  if (!hurt) blush(ctx, cx + 9, by + 3, 2);
  mouth(ctx, cx + 5, by + 3, 2.5, hurt ? 'o' : 'smile');
}

function drawAyu(ctx, anim, f, n) {
  const W = 46, H = 26, cx = 22, cy = H / 2;
  const hurt = anim === 'hurt';
  const wag = Math.sin(f / n * TAU) * 3;
  poly(ctx, [cx - 15, cy, cx - 23, cy - 7 + wag, cx - 22, cy + 7 + wag], '#7a8a7a', { lw: 1.5 });   // 尾びれ
  poly(ctx, [cx - 3, cy - 7, cx + 3, cy - 12, cx + 6, cy - 7], '#8a9a80', { lw: 1.3 });   // 背びれ
  ctx.beginPath(); ctx.ellipse(cx, cy, 17, 7.5, 0, 0, TAU);
  const g = ctx.createLinearGradient(0, cy - 8, 0, cy + 8); g.addColorStop(0, '#6a7a68'); g.addColorStop(0.5, '#c8d4c4'); g.addColorStop(1, '#f4f8f4');
  ctx.fillStyle = g; ctx.fill(); stroke(ctx, { lw: 2 });
  ell(ctx, cx + 4, cy - 1, 2.6, 2, '#f2c33a', { lw: 0.8 });   // 黄色い斑点
  line(ctx, cx + 9, cy - 5, cx + 8, cy + 4, dk('#6a7a68', 0.2), 1.2);
  eye(ctx, cx + 12, cy - 1.5, 2, { hurt, white: true });
  mouth(ctx, cx + 15, cy + 2.5, 2, hurt ? 'o' : 'smile');
}

function flame(ctx, cx, by, w, h, f, outer, inner) {
  const wob = Math.sin(f * 1.7) * 2;
  ctx.beginPath(); ctx.moveTo(cx - w, by); ctx.quadraticCurveTo(cx - w * 1.1, by - h * 0.5, cx + wob, by - h); ctx.quadraticCurveTo(cx + w * 1.1, by - h * 0.5, cx + w, by); ctx.quadraticCurveTo(cx, by + w * 0.6, cx - w, by); ctx.closePath();
  ctx.fillStyle = outer; ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx - w * 0.55, by); ctx.quadraticCurveTo(cx - w * 0.5, by - h * 0.4, cx + wob * 0.6, by - h * 0.7); ctx.quadraticCurveTo(cx + w * 0.5, by - h * 0.4, cx + w * 0.55, by); ctx.quadraticCurveTo(cx, by + w * 0.4, cx - w * 0.55, by); ctx.closePath();
  ctx.fillStyle = inner; ctx.fill();
}
function drawHinotama(ctx, anim, f, n) {
  const W = 36, H = 42, cx = W / 2;
  const hurt = anim === 'hurt';
  ctx.fillStyle = 'rgba(255,140,40,0.3)'; ctx.beginPath(); ctx.arc(cx, H - 15, 16, 0, TAU); ctx.fill();
  flame(ctx, cx, H - 8, 13, 34 + (f % 2) * 3, f, '#e8401a', '#ffb347');
  ctx.strokeStyle = '#8a1a0a'; ctx.lineWidth = 1.5; ctx.stroke();
  ell(ctx, cx, H - 15, 9, 9, '#ffe27a', { ol: '#c8501a', lw: 1.4 });
  eye(ctx, cx + 4, H - 17, 2.2, { hurt, angry: true }); eye(ctx, cx - 3, H - 17, 2, { hurt, angry: true });
  mouth(ctx, cx + 1, H - 11, 3, hurt ? 'o' : 'frown');
}

function drawMark(name, w, h, fn) { defineSprite(name, { w, h, draw: fn }); }

// ========== 仕掛けの絵 ==========
function plank(kind) {
  return (ctx, f) => {
    const W = 36, H = 20;
    const L = f === 0, R = f === 2;
    const x0 = L ? 2 : 0, x1 = R ? W - 2 : W;
    if (kind === 'cloud') {
      for (let i = 0; i < 3; i++) ell(ctx, 6 + i * 12, 9 + (i % 2) * 2, 10, 8, '#ffffff', { lw: 0, ol: false });
      ctx.fillStyle = 'rgba(160,190,230,0.45)'; ctx.fillRect(0, 13, W, 5);
      if (L) ell(ctx, 6, 9, 7, 7, '#ffffff', { ol: '#a0b8d8', lw: 1.5 }); if (R) ell(ctx, 30, 9, 7, 7, '#ffffff', { ol: '#a0b8d8', lw: 1.5 });
      ctx.strokeStyle = '#a0b8d8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(W, 1); ctx.stroke();
      return;
    }
    const col = { wood: '#a8743e', stone: '#8d8a80', ice: '#bfe8ff', rock: '#7e6a58', rhythm: '#c8302a' }[kind];
    poly(ctx, [x0, 0, x1, 0, x1 - (R ? 3 : 0), H, x0 + (L ? 3 : 0), H], col, { lw: L || R ? 2 : 0, ol: L || R ? OL : false });
    ctx.strokeStyle = OL; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, 1); ctx.lineTo(x1, 1); ctx.moveTo(x0 + (L ? 3 : 0), H - 1); ctx.lineTo(x1 - (R ? 3 : 0), H - 1); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x0 + 1, 2, x1 - x0 - 2, 3);
    if (kind === 'wood') { line(ctx, 18, 3, 18, H - 2, dk(col, 0.35), 1.2); ctx.strokeStyle = dk(col, 0.2); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x0 + 2, 10); ctx.lineTo(x1 - 2, 11); ctx.stroke(); ctx.fillStyle = '#d8c08a'; ctx.fillRect(16, 6, 4, 9); }
    if (kind === 'stone') { line(ctx, 12, 3, 12, H - 2, dk(col, 0.35), 1.2); line(ctx, 30, 3, 30, H - 2, dk(col, 0.35), 1.2); line(ctx, x0, 10, x1, 10, dk(col, 0.25), 1); }
    if (kind === 'rock') { line(ctx, 8, 4, 14, 12, dk(col, 0.4), 1.2); line(ctx, 14, 12, 22, 10, dk(col, 0.4), 1.2); dot(ctx, 28, 8, 2, lt(col, 0.2)); }
    if (kind === 'ice') { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.moveTo(6, 4); ctx.lineTo(12, 4); ctx.lineTo(6, 14); ctx.closePath(); ctx.fill(); }
    if (kind === 'rhythm') { // 太鼓の面と金の縁
      ctx.fillStyle = '#e8b830'; ctx.fillRect(x0, 4, x1 - x0, 2); ctx.fillRect(x0, H - 6, x1 - x0, 2);
      ell(ctx, 18, 11, 6, 4, '#f6e8c8', { lw: 1.2 });
      ctx.fillStyle = '#c8302a'; ctx.beginPath(); ctx.arc(18, 11, 2.2, 0, TAU); ctx.fill();
      for (let i = 0; i < 3; i++) dot(ctx, 4 + i * 14, 8, 1.2, '#2a2228');
    }
    if (kind === 'rock' || kind === 'stone') { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x0 + 1, H - 6, x1 - x0 - 2, 4); }
  };
}

export function defineEnemies() {
  // ---- 歩く ----
  enemy('uribo', 46, 36, { walk: 6, hurt: 1 }, (ctx, a, f, n) => drawBoar(ctx, a, f, n, false));
  enemy('sawagani', 46, 32, { walk: 6, hurt: 1 }, drawCrab);
  enemy('yukidama', 40, 40, { walk: 6, hurt: 1 }, drawSnowball);
  // ---- トゲ ----
  enemy('iga', 40, 38, { walk: 4, hurt: 1 }, (ctx, a, f, n) => spikyBall(ctx, a, f, n, '#7ab04a', '#5a8a30', 12));
  enemy('koritoge', 40, 38, { walk: 4, hurt: 1 }, (ctx, a, f, n) => spikyBall(ctx, a, f, n, '#bfe8ff', '#e8f8ff', 9));
  // ---- 跳ねる ----
  const hop = { idle: 2, crouch: 1, jump: 1, fall: 1, hurt: 1 };
  enemy('kajika', 42, 34, hop, (ctx, a, f, n) => drawFrog(ctx, a, f, n, '#8a8a4a', '#e8dca0', false));
  enemy('yogangaeru', 46, 36, hop, (ctx, a, f, n) => drawFrog(ctx, a, f, n, '#3a2a2a', '#7a4a3a', true));
  enemy('uchiwa', 40, 50, hop, drawUchiwa);
  enemy('yukiusagi', 38, 38, hop, drawUsagi);
  // ---- 飛ぶ ----
  enemy('karasu', 50, 40, { fly: 4, hurt: 1 }, drawKarasu);
  enemy('tonbo', 56, 30, { fly: 2, hurt: 1 }, drawTonbo);
  enemy('chochin', 36, 50, { fly: 4, hurt: 1 }, drawChochin);
  enemy('tako', 50, 56, { fly: 4, hurt: 1 }, drawTako);
  enemy('yukigumo', 64, 44, { fly: 4, warn: 2, hurt: 1 }, drawYukigumo);
  enemy('komori', 54, 36, { fly: 4, hurt: 1 }, drawKomori);
  // ---- 投げる・盾（二本足）----
  for (const [kind, o] of Object.entries(BIPEDS)) {
    const anims = o.shield ? { walk: 6, block: 1, hurt: 1 } : { idle: 4, windup: 2, throw: 2, hurt: 1 };
    enemy(kind, o.W, o.H, anims, (ctx, a, f, n) => drawBiped(ctx, o.W, o.H, o, a, f, n));
  }
  // ---- 飛び出す ----
  enemy('ayu', 46, 26, { jump: 4, hurt: 1 }, drawAyu, { ox: 23, oy: 13 });
  enemy('hinotama', 36, 42, { jump: 4, hurt: 1 }, drawHinotama);
  defineSprite('enemy_hibashira_body', { w: 40, h: 34, frames: 4, draw(ctx, f) {
    const g = ctx.createLinearGradient(0, 0, 40, 0); g.addColorStop(0, 'rgba(232,64,26,0)'); g.addColorStop(0.2, '#e8401a'); g.addColorStop(0.5, '#ffcf6a'); g.addColorStop(0.8, '#e8401a'); g.addColorStop(1, 'rgba(232,64,26,0)');
    ctx.fillStyle = g; ctx.fillRect(4, 0, 32, 34);
    ctx.fillStyle = 'rgba(255,250,200,0.7)';
    for (let i = 0; i < 3; i++) { const y = ((i * 12 + f * 9) % 34); ctx.beginPath(); ctx.ellipse(20 + Math.sin(f + i) * 4, y, 3, 6, 0, 0, TAU); ctx.fill(); }
  } });
  defineSprite('enemy_hibashira_top', { w: 48, h: 44, frames: 4, draw(ctx, f) {
    flame(ctx, 24, 44, 16, 40 + (f % 2) * 4, f, '#e8401a', '#ffcf6a');
    flame(ctx, 14 + (f % 2) * 2, 38, 6, 16, f + 1, '#ff7a2a', '#ffe27a');
    flame(ctx, 34 - (f % 2) * 2, 40, 6, 18, f + 2, '#ff7a2a', '#ffe27a');
  } });
  // ---- 突進 ----
  const ch = { walk: 6, windup: 2, run: 4, dizzy: 2, hurt: 1 };
  enemy('inoshishi', 62, 46, ch, (ctx, a, f, n) => drawBoar(ctx, a, f, n, true));
  enemy('kamoshika', 58, 54, ch, drawKamoshika);
  enemy('shishi', 66, 52, ch, drawShishi);

  // ---- 印 ----
  drawMark('enemy_mark_alert', 16, 22, (ctx) => { poly(ctx, [4, 1, 12, 1, 10, 14, 6, 14], '#ff4a3a', { lw: 1.6 }); ell(ctx, 8, 18.5, 2.6, 2.6, '#ff4a3a', { lw: 1.4 }); });
  drawMark('enemy_mark_star', 12, 12, (ctx) => star(ctx, 6, 6, 5, '#ffe56b'));

  // ---- 弾（中心が基準）----
  const shot = (name, w, h, fn, frames = 1) => defineSprite('enemy_shot_' + name, { w, h, frames, ox: w / 2, oy: h / 2, draw: fn });
  shot('iga', 24, 24, (ctx) => drawIga(ctx, 12, 12, 7));
  shot('geta', 26, 20, (ctx) => drawGeta(ctx, 13, 11, 1));
  shot('hanabi', 26, 26, (ctx, f) => drawHanabiBall(ctx, 11, 14, 7.5, f), 2);
  shot('yukidama', 20, 20, (ctx) => { ell(ctx, 10, 10, 8, 8, '#f4f8ff'); ctx.fillStyle = 'rgba(150,180,220,0.4)'; ctx.beginPath(); ctx.arc(12, 12, 4, 0, TAU); ctx.fill(); });
  shot('iwa', 28, 26, (ctx) => drawRock(ctx, 14, 13, 11));
  shot('ougi', 30, 22, (ctx) => {
    ctx.beginPath(); ctx.moveTo(15, 19); ctx.arc(15, 19, 14, -Math.PI + 0.25, -0.25); ctx.closePath();
    shade(ctx, '#e84a5a', 15, 10, 12); ctx.fill(); stroke(ctx, { lw: 1.6 });
    ctx.strokeStyle = '#e8b830'; ctx.lineWidth = 1; for (let i = 0; i < 6; i++) { const a = -Math.PI + 0.25 + i * (Math.PI - 0.5) / 5; ctx.beginPath(); ctx.moveTo(15, 19); ctx.lineTo(15 + Math.cos(a) * 13, 19 + Math.sin(a) * 13); ctx.stroke(); }
    dot(ctx, 15, 19, 2, '#2a2228');
  });
  shot('tsurara', 14, 28, (ctx) => { poly(ctx, [2, 1, 12, 1, 7, 27], '#cfeeff', { lw: 1.5 }); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(4, 3, 2, 10); });

  // ---- 動く床（左上が基準。0=左端 1=中 2=右端）----
  for (const k of ['wood', 'stone', 'cloud', 'ice', 'rock', 'rhythm']) defineSprite('gim_plat_' + k, { w: 36, h: 22, frames: 3, ox: 0, oy: 0, draw: plank(k) });

  // ロープウェイのゴンドラ（基準：上の滑車＝ケーブルの位置。床の上面は78ドット下）
  defineSprite('gim_gondola', { w: 116, h: 96, ox: 58, oy: 0, draw(ctx) {
    ell(ctx, 58, 2, 7, 7, '#5a5a66', { lw: 1.6 }); dot(ctx, 58, 2, 2.2, '#c8c8d0');
    limb(ctx, 58, 6, 58, 22, '#4a4a55', 3.5);
    // 屋根
    poly(ctx, [8, 30, 22, 20, 94, 20, 108, 30], '#c8302a', { lw: 2 });
    ctx.fillStyle = '#f2f0e8'; ctx.fillRect(10, 30, 96, 4); ctx.strokeStyle = OL; ctx.lineWidth = 1.5; ctx.strokeRect(10, 30, 96, 4);
    // 柱と窓（うしろの壁）
    ctx.fillStyle = 'rgba(200,230,255,0.35)'; ctx.fillRect(12, 34, 92, 30);
    for (const x of [12, 56, 100]) { ctx.fillStyle = '#e8e4da'; ctx.fillRect(x, 34, 4, 44); ctx.strokeRect(x, 34, 4, 44); }
    // 腰板
    ctx.fillStyle = '#e8e4da'; ctx.fillRect(4, 62, 108, 16); ctx.strokeRect(4, 62, 108, 16);
    ctx.fillStyle = '#c8302a'; ctx.fillRect(4, 68, 108, 4);
    // 床（ここが乗る面）
    poly(ctx, [2, 78, 114, 78, 110, 90, 6, 90], '#5a5a66', { lw: 2 });
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(4, 79, 108, 2);
  } });
  defineSprite('gim_ropeway_tower', { w: 40, h: 300, draw(ctx) {
    ctx.strokeStyle = '#6a6a74'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(8, 300); ctx.lineTo(16, 6); ctx.moveTo(32, 300); ctx.lineTo(24, 6); ctx.stroke();
    ctx.lineWidth = 1.5; for (let y = 20; y < 300; y += 26) { ctx.beginPath(); ctx.moveTo(16 - y * 0.027, y); ctx.lineTo(24 + y * 0.027, y + 26); ctx.moveTo(24 + y * 0.027, y); ctx.lineTo(16 - y * 0.027, y + 26); ctx.stroke(); }
    poly(ctx, [4, 0, 36, 0, 34, 8, 6, 8], '#4a4a55', { lw: 1.6 });
  } });
  // 鵜飼船（左上＝甲板の左端。0=艫 1=中 2=舳先）
  defineSprite('gim_boat', { w: 36, h: 40, frames: 3, ox: 0, oy: 0, draw(ctx, f) {
    const col = '#5a3a24';
    if (f === 0) poly(ctx, [6, 0, 36, 0, 36, 26, 14, 26, 2, 8], col, { lw: 2 });
    else if (f === 1) poly(ctx, [0, 0, 36, 0, 36, 26, 0, 26], col, { lw: 2, ol: false });
    else poly(ctx, [0, 0, 26, 0, 36, -8, 34, 6, 22, 26, 0, 26], col, { lw: 2 });
    ctx.strokeStyle = OL; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(f === 0 ? 4 : 0, 1); ctx.lineTo(f === 2 ? 30 : 36, 1); ctx.moveTo(f === 0 ? 14 : 0, 25); ctx.lineTo(f === 2 ? 22 : 36, 25); ctx.stroke();
    ctx.fillStyle = '#8a5a34'; ctx.fillRect(f === 0 ? 6 : 0, 2, f === 2 ? 28 : 36 - (f === 0 ? 6 : 0), 4);
    line(ctx, f === 0 ? 8 : 0, 13, f === 2 ? 30 : 36, 13, dk(col, 0.35), 1.2);
    ctx.fillStyle = 'rgba(160,210,255,0.35)'; ctx.fillRect(0, 22, 36, 18);
  } });
  defineSprite('gim_kagaribi', { w: 28, h: 64, frames: 4, draw(ctx, f) {
    limb(ctx, 14, 64, 14, 30, '#3a2a22', 3);
    // 鉄の籠
    poly(ctx, [4, 18, 24, 18, 20, 32, 8, 32], '#2a2228', { lw: 1.4 });
    ctx.strokeStyle = '#6a5a4a'; ctx.lineWidth = 1; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(6 + i * 5, 18); ctx.lineTo(9 + i * 3.5, 32); ctx.stroke(); }
    flame(ctx, 14, 20, 9, 20 + (f % 2) * 4, f, '#ff7a2a', '#ffe27a');
    dot(ctx, 9 + f * 3, 4 - (f % 2) * 2, 1.4, '#ffcf6a');
  } });
  // 祭り屋台（台：左上が基準。屋根：足元＝台の上面）
  defineSprite('gim_float_base', { w: 36, h: 40, frames: 3, ox: 0, oy: 0, draw(ctx, f) {
    poly(ctx, [0, 0, 36, 0, 36, 30, 0, 30], '#7a1e1a', { lw: 2, ol: f === 1 ? false : OL });
    ctx.strokeStyle = OL; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(36, 1); ctx.moveTo(0, 29); ctx.lineTo(36, 29); ctx.stroke();
    ctx.fillStyle = '#e8b830'; ctx.fillRect(0, 3, 36, 3); ctx.fillRect(0, 24, 36, 2);
    // 金の飾り
    ctx.strokeStyle = '#e8b830'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(18, 15, 5, 0, TAU); ctx.stroke(); dot(ctx, 18, 15, 1.6, '#e8b830');
    ctx.fillStyle = '#2a1414'; ctx.fillRect(0, 30, 36, 6);
  } });
  defineSprite('gim_float_roof', { w: 150, h: 110, draw(ctx) {
    // 柱
    for (const x of [16, 134]) { ctx.fillStyle = '#2a1414'; ctx.fillRect(x - 3, 30, 6, 80); ctx.strokeStyle = OL; ctx.lineWidth = 1.4; ctx.strokeRect(x - 3, 30, 6, 80); }
    // 幕
    ctx.fillStyle = '#5a2a6a'; ctx.beginPath(); ctx.moveTo(14, 34); for (let i = 0; i <= 6; i++) ctx.quadraticCurveTo(14 + i * 20 + 10, 50, 14 + i * 20 + 20, 34); ctx.closePath(); ctx.fill();
    // 屋根
    poly(ctx, [2, 32, 20, 12, 130, 12, 148, 32, 136, 28, 14, 28], '#2a2228', { lw: 2 });
    ctx.fillStyle = '#e8b830'; ctx.fillRect(20, 10, 110, 3); dot(ctx, 75, 6, 4, '#e8b830');
    // 提灯
    for (const x of [14, 136]) { ell(ctx, x, 42, 6, 8, '#ff6a3a', { lw: 1.4 }); ctx.fillStyle = '#2a2228'; ctx.fillRect(x - 3, 33, 6, 2); }
  } });
  defineSprite('gim_wheel', { w: 30, h: 30, ox: 15, oy: 15, draw(ctx) {
    ell(ctx, 15, 15, 13, 13, '#5a3a24', { lw: 2 }); ell(ctx, 15, 15, 9, 9, '#3a2418', { lw: 1 });
    ctx.strokeStyle = '#c89a5a'; ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(15 - Math.cos(a) * 11, 15 - Math.sin(a) * 11); ctx.lineTo(15 + Math.cos(a) * 11, 15 + Math.sin(a) * 11); ctx.stroke(); }
    ell(ctx, 15, 15, 3, 3, '#e8b830', { lw: 1 });
  } });
  // 綱渡りの柱と提灯（提灯：基準は吊り下げ点）
  defineSprite('gim_post', { w: 14, h: 76, draw(ctx) { poly(ctx, [3, 6, 11, 6, 12, 76, 2, 76], '#6a4a2e', { lw: 1.8 }); ell(ctx, 7, 5, 5, 3, '#4a3020', { lw: 1.4 }); } });
  defineSprite('gim_chochin', { w: 20, h: 32, frames: 2, ox: 10, oy: 0, draw(ctx, f) {
    line(ctx, 10, 0, 10, 4, OL, 1.4);
    ctx.fillStyle = '#2a2228'; ctx.fillRect(6, 4, 8, 3);
    ctx.beginPath(); ctx.ellipse(10, 17, 8, 10, 0, 0, TAU);
    const g = ctx.createRadialGradient(9, 15, 1, 10, 17, 11); g.addColorStop(0, '#fff6c8'); g.addColorStop(0.6, f ? '#f8e8b0' : '#f06a3a'); g.addColorStop(1, f ? '#c8a060' : '#a82a1a');
    ctx.fillStyle = g; ctx.fill(); stroke(ctx, { lw: 1.5 });
    ctx.strokeStyle = 'rgba(80,20,10,0.4)'; ctx.lineWidth = 0.8; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(3, 17 + i * 3.5); ctx.lineTo(17, 17 + i * 3.5); ctx.stroke(); }
    ctx.fillStyle = '#2a2228'; ctx.fillRect(6, 26, 8, 3);
  } });
  // 跳ね台（0=ふつう 1=へこんだ）
  defineSprite('gim_bouncer_taiko', { w: 56, h: 40, frames: 2, draw(ctx, f) {
    const top = f ? 14 : 8;
    poly(ctx, [6, top + 4, 50, top + 4, 46, 38, 10, 38], '#b0302a', { lw: 2 });
    ctx.fillStyle = '#e8b830'; for (let i = 0; i < 6; i++) dot(ctx, 10 + i * 7.2, top + 8, 1.3, '#e8b830');
    ctx.fillStyle = '#2a2228'; ctx.fillRect(14, 22, 28, 3);
    ell(ctx, 28, top + 3, 23, f ? 4 : 6, '#f6e8c8', { lw: 2 });
    ctx.fillStyle = '#c8302a'; ctx.beginPath(); ctx.arc(28, top + 3, 3, 0, TAU); ctx.fill();
    // 三つ巴
    for (let i = 0; i < 3; i++) dot(ctx, 28 + Math.cos(i * 2.1) * 6, top + 3 + Math.sin(i * 2.1) * 2, 1.4, '#c8302a');
  } });
  defineSprite('gim_bouncer_kasa', { w: 60, h: 40, frames: 2, draw(ctx, f) {
    const top = f ? 16 : 8;
    limb(ctx, 30, 40, 30, top + 8, '#8a5a30', 3);
    ctx.beginPath(); ctx.moveTo(4, top + 14); ctx.quadraticCurveTo(30, top - 6 - (f ? -6 : 0), 56, top + 14); ctx.closePath();
    shade(ctx, '#d8406a', 30, top + 6, 26); ctx.fill(); stroke(ctx, { lw: 2 });
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(30, top + 3); ctx.lineTo(4 + i * 8.6, top + 14); ctx.stroke(); }
    dot(ctx, 30, top + 2, 2.2, '#2a2228');
  } });
  // 水門のスイッチ（0=下 1=上）、水門の板と枠
  defineSprite('gim_switch', { w: 40, h: 40, frames: 2, draw(ctx, f) {
    poly(ctx, [6, 26, 34, 26, 36, 40, 4, 40], '#7a6a5a', { lw: 2 });
    line(ctx, 8, 32, 32, 32, dk('#7a6a5a', 0.3), 1);
    // ハンドル（車輪）
    const a = f ? -0.6 : 0.6;
    limb(ctx, 20, 28, 20 + Math.sin(a) * 14, 28 - Math.cos(a) * 14, '#8a5a30', 3);
    ell(ctx, 20 + Math.sin(a) * 14, 28 - Math.cos(a) * 14, 5, 5, f ? '#4ab0e8' : '#e8b830', { lw: 1.6 });
    ell(ctx, 20, 28, 4, 4, '#4a4a55', { lw: 1.4 });
  } });
  defineSprite('gim_gate', { w: 36, h: 36, frames: 2, draw(ctx, f) {
    poly(ctx, [2, 0, 34, 0, 34, 36, 2, 36], '#8a6038', { lw: 2 });
    for (let i = 1; i < 4; i++) line(ctx, 2 + i * 8, 1, 2 + i * 8, 35, dk('#8a6038', 0.3), 1);
    ctx.fillStyle = '#4a4a55'; ctx.fillRect(2, 6, 32, 4); ctx.fillRect(2, 26, 32, 4);
    if (f === 0) { dot(ctx, 8, 8, 1.4, '#c8c8d0'); dot(ctx, 28, 8, 1.4, '#c8c8d0'); }
  } });
  defineSprite('gim_gate_frame', { w: 48, h: 120, draw(ctx) {
    for (const x of [2, 40]) { poly(ctx, [x, 6, x + 6, 6, x + 6, 120, x, 120], '#6a6a66', { lw: 1.6 }); }
    poly(ctx, [0, 0, 48, 0, 48, 8, 0, 8], '#5a5a55', { lw: 1.8 });
  } });
  // 湯気の噴き出し口（0=ふつう 1=予告で赤く光る）
  defineSprite('gim_vent', { w: 54, h: 18, frames: 2, draw(ctx, f) {
    poly(ctx, [2, 18, 6, 8, 16, 3, 38, 3, 48, 8, 52, 18], '#7a7068', { lw: 2, smooth: false });
    ell(ctx, 27, 7, 10, 3, f ? '#ffb070' : '#3a3028', { lw: 1.4 });
    ell(ctx, 10, 12, 4, 2, '#8a8078', { lw: 1 }); ell(ctx, 43, 12, 4, 2, '#8a8078', { lw: 1 });
  } });
  // つらら（基準は上端中央）
  defineSprite('gim_icicle', { w: 18, h: 36, ox: 9, oy: 0, draw(ctx) {
    poly(ctx, [1, 0, 17, 0, 13, 10, 9, 35, 5, 10], '#cfeeff', { lw: 1.6 });
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(5, 2, 2.5, 12);
    ctx.fillStyle = '#eef8ff'; ctx.fillRect(0, 0, 18, 3);
  } });
  // 落雷の予告の印（足元）
  defineSprite('gim_bolt_mark', { w: 30, h: 40, frames: 2, draw(ctx, f) {
    poly(ctx, [17, 1, 5, 22, 14, 22, 10, 39, 25, 15, 16, 15, 21, 1], f ? '#fff6a0' : '#ffcf3a', { lw: 1.8 });
  } });
}
