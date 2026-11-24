// プレイ中の表示（設計書 9章）。担当：UI
// 左上：顔アイコン・ハート・技ゲージ／上中央：コイン・さるぼぼ3枠・時間／右上：一時停止・天気
// ボス戦：上部にボス名とHPバー（段階の目盛り）／開始時：ステージ名と天気を大きく／踏みつけ連続の得点ポップ・一時表示
import { drawSprite } from '../gfx/atlas.js';
import { events } from '../core/events.js';
import { save } from '../core/save.js';
import { touch } from './touch.js';
import { drawText, roundRect, fmtTime, COL } from './text.js';
import META from '../data/stages.json';

const S = {
  coin: { size: 22, color: '#fff6d8', stroke: COL.sumi, strokeW: 4, align: 'left', baseline: 'middle' },
  time: { size: 20, color: COL.kinari, stroke: COL.sumi, strokeW: 4, align: 'left', baseline: 'middle' },
  boss: { size: 20, color: COL.kinLight, stroke: COL.sumi, strokeW: 4, align: 'center', baseline: 'middle', serif: true },
  introName: { size: 46, color: '#fff8e8', stroke: COL.sumi, strokeW: 8, align: 'center', baseline: 'middle', shadow: true, serif: true },
  introSub: { size: 22, color: COL.kinLight, stroke: COL.sumi, strokeW: 5, align: 'center', baseline: 'middle' },
  introNo: { size: 20, color: COL.kinari, stroke: COL.sumi, strokeW: 4, align: 'center', baseline: 'middle' },
  coinHot: { size: 22, color: '#ffe680', stroke: COL.shuDark, strokeW: 4, align: 'left', baseline: 'middle', alpha: 1 },
  phase: { size: 20, color: '#ffd0c0', stroke: COL.shuDark, strokeW: 5, align: 'center', baseline: 'middle', serif: true, alpha: 1 },
  toast: { size: 26, color: '#fff8e8', stroke: COL.shuDark, strokeW: 6, align: 'center', baseline: 'middle', shadow: true, alpha: 1 },
  key: { size: 12, color: COL.kinari, stroke: COL.sumi, strokeW: 3, align: 'center', baseline: 'middle' },
};

// ---- 一時表示（NEW・さるぼぼ取得など）と得点ポップ（使い回しの配列） ----
const POPS = []; for (let i = 0; i < 16; i++) POPS.push({ on: false, x: 0, y: 0, t: 0, text: '', sub: '', lvl: 0 });
const TOASTS = []; for (let i = 0; i < 4; i++) TOASTS.push({ on: false, t: 0, text: '', life: 1.8 });
let lastNow = 0;
export function hudToast(text, life = 1.8) {
  let tt = TOASTS.find((q) => !q.on) || TOASTS[0];
  tt.on = true; tt.t = 0; tt.text = text; tt.life = life;
}
function pop(x, y, text, lvl = 0, sub = '') {
  const p = POPS.find((q) => !q.on) || POPS[0];
  p.on = true; p.x = x; p.y = y; p.t = 0; p.text = text; p.lvl = lvl; p.sub = sub;
}
// 得点ポップ：連続踏みつけは「×2」「×4」…を大きく、段階ごとに色を強く（金→橙→朱→虹）
const MULT_TEXT = ['', '+1', '×2', '×4', '×8'];
const CHAIN_SUB = ['', '', '2連続！', '3連続！', '4連続！'];
let defeatPop = null, defeatAt = -1;
events.on('stomp', (e) => {
  const lvl = Math.min(4, Math.round(Math.log2(e.points || 1)) + 1);
  // 踏んで倒した時は、直前の「倒した」のポップをこの表示に置き換える（重ねない）
  if (defeatPop && defeatPop.on && performance.now() - defeatAt < 30) defeatPop.on = false;
  defeatPop = null;
  pop(e.x, e.y - 14, MULT_TEXT[lvl], lvl, e.chain >= 2 ? (e.chain <= 4 ? CHAIN_SUB[e.chain] : `${e.chain}連続！`) : '');
});
// 技・体当たりで倒した時も「+1」
events.on('enemyDefeated', (e) => {
  if (e.x == null) return;
  pop(e.x, e.y - 18, '+1', 1);
  defeatPop = POPS.find((q) => q.on && q.t === 0 && q.x === e.x) || null; defeatAt = performance.now();
});
// コインの数字が跳ねる・被弾の赤いふち
let coinBump = 0, hurtFlash = 0, lastHearts = -1, heartShake = 0;
const HEART_FX = []; for (let i = 0; i < 12; i++) HEART_FX.push({ t: -1, kind: 0 });   // kind 1=減った 2=増えた
events.on('coin', () => { coinBump = 1; });
events.on('playerHurt', () => { hurtFlash = 1; });
events.on('sarubobo', (e) => hudToast(`さるぼぼ ${(e.index ?? 0) + 1}つ目！`));
events.on('checkpoint', () => hudToast('中間地点　ハート全回復'));
events.on('stageEnter', () => { for (const p of POPS) p.on = false; for (const t of TOASTS) t.on = false; bossShown = 0; trail = 1; trailWait = 0; bossHitT = 0; lastBossHp = -1; lastPhase = 0; phaseT = 0; coinBump = 0; hurtFlash = 0; lastHearts = -1; heartShake = 0; for (const h of HEART_FX) h.t = -1; });
events.on('bossDefeated', (e) => { const b = e && e.boss; hudToast(b && b.name ? `${b.name}を たおした！` : 'たおした！', 2.2); });
// 図鑑：倒した敵の種類を記録（保存はステージ終了時）
events.on('enemyDefeated', (e) => {
  // 図鑑に載るのは kind を持つ敵だけ（ボスの手下や分身は数えない）
  const k = e.kind;
  if (!k) return;
  const d = save.data.defeated;
  if (!d.includes(k)) d.push(k);
});

// 使い回しの描画オプション・グラデーション・文字列（毎フレーム作らない）
const O_WPN = { sx: 0.55, sy: 0.55 }, O_COIN = { sx: 0.9, sy: 0.9 }, O_SARU = { sx: 0.82, sy: 0.82 }, O_SARU_GHOST = { sx: 0.82, sy: 0.82, alpha: 0.3 };
const DEFAULT_MARKS = [2 / 3, 1 / 3];
const PHASE_TEXT = ['', '', '― 怒った！ ―', '― 本気だ！ ―'];
const RAINBOW = ['#ff8a8a', '#ffd36a', '#a8f07a', '#7ad8ff', '#d49aff'];
const POP_ST = [null,
  { size: 22, color: COL.kinLight, stroke: COL.sumi, strokeW: 5, align: 'center', baseline: 'middle', alpha: 1 },
  { size: 30, color: '#ffe07a', stroke: COL.shuDark, strokeW: 6, align: 'center', baseline: 'middle', alpha: 1, shadow: true },
  { size: 34, color: '#ffb04a', stroke: COL.shuDark, strokeW: 6, align: 'center', baseline: 'middle', alpha: 1, shadow: true },
  { size: 38, color: '#ff7a5a', stroke: COL.sumi, strokeW: 7, align: 'center', baseline: 'middle', alpha: 1, shadow: true }];
const POP_SUB = { size: 15, color: '#fff8e8', stroke: COL.sumi, strokeW: 4, align: 'center', baseline: 'middle', alpha: 1 };
let BOSS_G = null, VIG = null, vigW = 0, vigH = 0;
let coinShown = -1, coinStr = '×0', timeShown = -1, timeStr = '';
let bossShown = 0, trail = 1, trailWait = 0, bossHitT = 0, lastBossHp = -1, lastPhase = 0, phaseT = 0;

// 顔アイコン（hero_<id>_idle の頭を丸く切り抜く）
// グラデーションは原点・大きさ1で1回だけ作り、平行移動と拡大で使い回す（毎フレーム作らない）
let FACE_G = null;
const FACE_O = { sx: 2.0, sy: 2.0 };
function drawFace(ctx, id, cx, cy, r, t) {
  if (!FACE_G) { FACE_G = ctx.createRadialGradient(0, -0.4, 0.07, 0, 0, 1); FACE_G.addColorStop(0, '#f8efd8'); FACE_G.addColorStop(1, '#c9b48a'); }
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(r, r);
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fillStyle = FACE_G; ctx.fill();
  ctx.clip();
  ctx.scale(1 / r, 1 / r); ctx.translate(-cx, -cy);   // 切り抜きはそのまま、座標だけ元に戻す
  drawSprite(ctx, `hero_${id}_idle`, (t * 6) | 0, cx, cy + r * 2.35, FACE_O);
  ctx.restore();
}
export { drawFace };

// ハート（絵）
function heartPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x, y - s * 0.1, x - s * 0.55, y - s * 0.15, x - s * 0.55, y + s * 0.2);
  ctx.bezierCurveTo(x - s * 0.55, y + s * 0.5, x - s * 0.15, y + s * 0.7, x, y + s * 0.88);
  ctx.bezierCurveTo(x + s * 0.15, y + s * 0.7, x + s * 0.55, y + s * 0.5, x + s * 0.55, y + s * 0.2);
  ctx.bezierCurveTo(x + s * 0.55, y - s * 0.15, x, y - s * 0.1, x, y + s * 0.35);
  ctx.closePath();
}
// 塗りのグラデーションは大きさごとに1回だけ作る（ハートの左上を原点にした座標）
const HEART_G = new Map();
function heartGrad(ctx, s) {
  let g = HEART_G.get(s);
  if (!g) { g = ctx.createLinearGradient(0, 0, 0, s); g.addColorStop(0, '#ff6b5a'); g.addColorStop(1, '#b8241a'); HEART_G.set(s, g); }
  return g;
}
// beat: 拡大の量、flash: 白く光らせる量（0..1）、alpha: 薄さ
export function drawHeart(ctx, x, y, s, full, beat = 0, flash = 0, alpha = 1) {
  const k = 1 + beat;
  ctx.save(); ctx.translate(x, y + s * 0.4); ctx.scale(k, k); ctx.translate(0, -s * 0.4);
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  heartPath(ctx, 0, 0, s);
  ctx.lineWidth = 3; ctx.strokeStyle = COL.sumi; ctx.stroke();
  if (full) {
    ctx.fillStyle = heartGrad(ctx, s); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(-s * 0.25, s * 0.2, s * 0.1, s * 0.07, -0.6, 0, Math.PI * 2); ctx.fill();
  } else { ctx.fillStyle = 'rgba(40,30,30,0.6)'; ctx.fill(); }
  if (flash > 0) { ctx.globalAlpha *= flash; ctx.fillStyle = '#ffffff'; heartPath(ctx, 0, 0, s); ctx.fill(); }
  ctx.restore();
}

// 天気アイコン
export function drawWeatherIcon(ctx, w, x, y, s, t) {
  ctx.save(); ctx.translate(x, y);
  const cloud = (cx, cy, c) => {
    ctx.fillStyle = c; ctx.beginPath();
    ctx.arc(cx - s * 0.28, cy + s * 0.05, s * 0.22, 0, Math.PI * 2); ctx.arc(cx, cy - s * 0.08, s * 0.3, 0, Math.PI * 2); ctx.arc(cx + s * 0.3, cy + s * 0.06, s * 0.2, 0, Math.PI * 2);
    ctx.rect(cx - s * 0.28, cy, s * 0.58, s * 0.27); ctx.fill();
  };
  ctx.lineCap = 'round';
  if (w === 'sunny' || w === 'clear') {
    ctx.strokeStyle = '#ffbf3a'; ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + t * 0.6; ctx.beginPath(); ctx.moveTo(Math.cos(a) * s * 0.38, Math.sin(a) * s * 0.38); ctx.lineTo(Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5); ctx.stroke(); }
    ctx.fillStyle = '#ffcf4a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COL.shu; ctx.beginPath(); ctx.arc(0, 0, s * 0.17, 0, Math.PI * 2); ctx.fill();
  } else if (w === 'snow' || w === 'blizzard') {
    cloud(0, -s * 0.12, '#dfe6f0');
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) { const yy = s * 0.25 + ((t * (w === 'blizzard' ? 0.9 : 0.4) + i * 0.33) % 1) * s * 0.3; ctx.beginPath(); ctx.arc(-s * 0.25 + i * s * 0.25 + (w === 'blizzard' ? (yy - s * 0.25) * 0.8 : 0), yy, s * 0.06, 0, Math.PI * 2); ctx.fill(); }
  } else if (w === 'rain' || w === 'shower' || w === 'thunder' || w === 'storm') {
    cloud(0, -s * 0.12, w === 'shower' ? '#b8c4d0' : '#8a96a8');
    ctx.strokeStyle = '#6ab0ff'; ctx.lineWidth = 2.2;
    for (let i = 0; i < 3; i++) { const yy = s * 0.22 + ((t * 1.4 + i * 0.37) % 1) * s * 0.25; ctx.beginPath(); ctx.moveTo(-s * 0.22 + i * s * 0.22, yy); ctx.lineTo(-s * 0.26 + i * s * 0.22, yy + s * 0.1); ctx.stroke(); }
    if (w === 'thunder' || w === 'storm') { ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.moveTo(s * 0.05, s * 0.05); ctx.lineTo(-s * 0.1, s * 0.3); ctx.lineTo(s * 0.02, s * 0.28); ctx.lineTo(-s * 0.06, s * 0.5); ctx.lineTo(s * 0.15, s * 0.2); ctx.lineTo(s * 0.03, s * 0.22); ctx.closePath(); ctx.fill(); }
  } else if (w === 'fog') {
    ctx.strokeStyle = '#d8dde4'; ctx.lineWidth = 4;
    for (let i = 0; i < 3; i++) { const o = Math.sin(t * 1.5 + i) * s * 0.06; ctx.beginPath(); ctx.moveTo(-s * 0.4 + o, -s * 0.2 + i * s * 0.2); ctx.lineTo(s * 0.4 + o, -s * 0.2 + i * s * 0.2); ctx.stroke(); }
  } else if (w === 'ash') {
    ctx.fillStyle = '#6b4a44'; ctx.beginPath(); ctx.moveTo(-s * 0.45, s * 0.35); ctx.lineTo(-s * 0.1, -s * 0.15); ctx.lineTo(s * 0.1, -s * 0.15); ctx.lineTo(s * 0.45, s * 0.35); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#a0a0a0'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(Math.sin(t + i) * s * 0.1, -s * 0.25 - i * s * 0.1 - ((t * 0.3) % 0.1) * s, s * (0.1 + i * 0.04), 0, Math.PI * 2); ctx.fill(); }
  } else { // cloudy ほか
    cloud(s * 0.06, 0, '#c4ccd6'); cloud(-s * 0.1, s * 0.1, '#e6eaf0');
  }
  ctx.restore();
}

function woodPanel(ctx, x, y, w, h) {
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = 'rgba(26,18,14,0.62)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(224,180,72,0.85)'; ctx.stroke();
}

export function drawHud(ctx, W, vw, vh, scene) {
  const p = W.player;
  const now = performance.now() / 1000;
  // 一時停止中・看板を読んでいる間は、得点ポップ・一時表示・ボスのHPバーの動きも止める
  const frozen = !!(scene && (scene.paused || W.dialogue));
  const dt = lastNow && !frozen ? Math.min(0.1, now - lastNow) : 0; lastNow = now;
  const t = W.time;
  ctx.save();
  // ---- 左上：顔・技ゲージ・ハート ----
  const fx = 50, fy = 48, fr = 30;
  ctx.fillStyle = 'rgba(26,18,14,0.6)'; ctx.beginPath(); ctx.arc(fx, fy, fr + 9, 0, Math.PI * 2); ctx.fill();
  drawFace(ctx, W.charId, fx, fy, fr, t);
  const prog = p.techMax > 0 ? Math.max(0, Math.min(1, 1 - (p.techCd || 0) / p.techMax)) : 1;
  ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(fx, fy, fr + 5, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = prog >= 1 ? COL.kin : '#7ab8e8';
  ctx.beginPath(); ctx.arc(fx, fy, fr + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog); ctx.stroke();
  if (prog >= 1) { ctx.globalAlpha = 0.35 + 0.25 * Math.sin(now * 5); ctx.lineWidth = 2; ctx.strokeStyle = COL.kinLight; ctx.beginPath(); ctx.arc(fx, fy, fr + 10, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.lineCap = 'butt';
  // 溜め（リーフの溜め押しなど）
  if (p.charge > 0) { ctx.strokeStyle = COL.shu; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(fx, fy, fr + 1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p.charge)); ctx.stroke(); }
  // 装備中の武器（福引き）と、守りの残り
  if (p.weaponId) {
    const wx = fx + fr - 2, wy = fy + fr - 4;
    ctx.fillStyle = 'rgba(26,18,14,0.75)'; ctx.beginPath(); ctx.arc(wx, wy, 15, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = p.weaponColor || COL.kin; ctx.stroke();
    drawSprite(ctx, `weapon_${p.weaponId}`, 0, wx, wy, O_WPN);
    if (p.guardLeft > 0) { ctx.fillStyle = 'rgba(160,220,255,0.95)'; for (let i = 0; i < p.guardLeft; i++) { ctx.beginPath(); ctx.arc(wx + 18 + i * 9, wy + 8, 3.5, 0, Math.PI * 2); ctx.fill(); } }
  }
  // ハート：減った時は白く光って震え、ふくらんで消える。増えた時はぽんと弾む
  const hs = 26;
  if (lastHearts >= 0 && p.hearts !== lastHearts) {
    const lo = Math.min(p.hearts, lastHearts), hi = Math.max(p.hearts, lastHearts);
    for (let i = lo; i < hi && i < HEART_FX.length; i++) { HEART_FX[i].t = 0; HEART_FX[i].kind = p.hearts < lastHearts ? 1 : 2; }
    if (p.hearts < lastHearts) heartShake = 0.3;
  }
  lastHearts = p.hearts;
  if (heartShake > 0) heartShake = Math.max(0, heartShake - dt);
  const shx = heartShake > 0 ? Math.sin(now * 70) * 4 * (heartShake / 0.3) : 0;
  for (let i = 0; i < p.maxHearts; i++) {
    const full = i < p.hearts;
    const hx = 104 + i * (hs + 6) + shx;
    let beat = full && i === p.hearts - 1 && p.hearts <= 1 ? 0.12 * Math.max(0, Math.sin(now * 8)) : 0;
    const F = i < HEART_FX.length ? HEART_FX[i] : null;
    if (F && F.t >= 0) {
      F.t += dt;
      if (F.kind === 2) {   // 増えた：弾む（0.4秒）
        const k = Math.min(1, F.t / 0.4);
        beat += Math.sin(k * Math.PI) * 0.45 * (1 - k * 0.5);
        drawHeart(ctx, hx, 20, hs, full, beat, (1 - k) * 0.8);
        if (k >= 1) F.t = -1;
        continue;
      }
      // 減った：空のハートの上に、白く光った満タンのハートがふくらみながら消える（0.5秒）
      const k = Math.min(1, F.t / 0.5);
      drawHeart(ctx, hx, 20, hs, false, 0);
      drawHeart(ctx, hx, 20 - k * 6, hs, true, k * 0.6, k < 0.25 ? 1 : 1 - k, 1 - k);
      if (k >= 1) F.t = -1;
      continue;
    }
    drawHeart(ctx, hx, 20, hs, full, beat);
  }
  if (p.star > 0) { ctx.fillStyle = COL.kin; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(now * 12); ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('無敵', 104, 66); ctx.globalAlpha = 1; }

  // ---- 上中央：コイン・さるぼぼ・時間 ----
  const pw = 400, px = vw / 2 - pw / 2, py = 12, ph = 44;
  woodPanel(ctx, px, py, pw, ph);
  // コイン：取るたびに数字が跳ねて金色に光る
  coinBump = Math.max(0, coinBump - dt * 4);
  const cb = coinBump * coinBump;
  O_COIN.sx = O_COIN.sy = 0.9 * (1 + cb * 0.25);
  drawSprite(ctx, 'item_coin', coinBump > 0 ? ((1 - coinBump) * 7.99) | 0 : 0, px + 30, py + ph / 2 + 12 + cb * 2, O_COIN);
  if (W.stats.coins !== coinShown) { coinShown = W.stats.coins; coinStr = '×' + coinShown; }
  if (cb > 0.01) {
    ctx.save(); ctx.translate(px + 46, py + ph / 2 + 1 - cb * 5); ctx.scale(1 + cb * 0.3, 1 + cb * 0.3);
    S.coinHot.alpha = 1; drawText(ctx, coinStr, 0, 0, S.coin);
    S.coinHot.alpha = cb; drawText(ctx, coinStr, 0, 0, S.coinHot);
    ctx.restore();
  } else drawText(ctx, coinStr, px + 46, py + ph / 2 + 1, S.coin);
  const prev = W.collectedSarubobo;
  for (let i = 0; i < 3; i++) {
    const sx = px + 168 + i * 38, sy = py + ph / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.strokeStyle = 'rgba(243,234,215,0.6)'; ctx.lineWidth = 1.5;
    roundRect(ctx, sx - 15, sy - 17, 30, 34, 8); ctx.fill(); ctx.stroke();
    if (W.stats.sarubobo[i]) drawSprite(ctx, 'item_sarubobo', 0, sx, sy + 14, O_SARU);
    else if (prev && prev[i]) drawSprite(ctx, 'item_sarubobo', 0, sx, sy + 14, O_SARU_GHOST);
  }
  // 時計
  const tx = px + 284;
  ctx.strokeStyle = COL.kinari; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(tx, py + ph / 2, 9, 0, Math.PI * 2); ctx.stroke();
  const a = W.stats.time * Math.PI / 30;
  ctx.beginPath(); ctx.moveTo(tx, py + ph / 2); ctx.lineTo(tx + Math.sin(a) * 6, py + ph / 2 - Math.cos(a) * 6); ctx.stroke();
  const tt = (W.stats.time * 10) | 0;
  if (tt !== timeShown) { timeShown = tt; timeStr = fmtTime(W.stats.time); }
  drawText(ctx, timeStr, tx + 16, py + ph / 2 + 1, S.time);

  // ---- 右上：一時停止・天気 ----
  const wx = vw - (touch.enabled ? 110 : 116), wy = 42;
  ctx.fillStyle = 'rgba(26,18,14,0.5)'; ctx.beginPath(); ctx.arc(wx, wy, 24, 0, Math.PI * 2); ctx.fill();
  drawWeatherIcon(ctx, W.env.weather, wx, wy, 38, now);
  if (!touch.enabled) {
    const bx = vw - 50;
    ctx.fillStyle = 'rgba(26,18,14,0.5)'; ctx.beginPath(); ctx.arc(bx, wy, 22, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(243,234,215,0.7)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = COL.kinari; ctx.fillRect(bx - 7, wy - 9, 5, 16); ctx.fillRect(bx + 2, wy - 9, 5, 16);
    drawText(ctx, 'Esc', bx, wy + 32, S.key);
  }

  // ---- ボス ----
  const b = W.boss;
  if (b && b.maxHp > 0) {
    bossShown = Math.min(1, bossShown + dt * 3);
    const frac = Math.max(0, b.hp / b.maxHp);
    // 当たった瞬間：バーが白く光って揺れる。減った分（白い帯）は少し待ってから素早く追いつく
    if (lastBossHp >= 0 && b.hp < lastBossHp) { bossHitT = 0.35; trailWait = 0.45; }
    lastBossHp = b.hp;
    if (b.phase && lastPhase && b.phase > lastPhase) phaseT = 1.2;   // 段階が変わった
    lastPhase = b.phase || 0;
    bossHitT = Math.max(0, bossHitT - dt); phaseT = Math.max(0, phaseT - dt);
    if (trail < frac) trail = frac;
    else if (trailWait > 0) trailWait -= dt;
    else trail = Math.max(frac, trail - dt * (0.15 + (trail - frac) * 3));
    const bw = Math.min(520, vw - 360), shk = bossHitT > 0 ? Math.sin(now * 80) * 3 * (bossHitT / 0.35) : 0;
    const bx = vw / 2 - bw / 2 + shk, by = 74 - (1 - bossShown) * 40;
    ctx.globalAlpha = bossShown;
    drawText(ctx, b.name || 'ボス', vw / 2, by + 6, S.boss);
    roundRect(ctx, bx - 4, by + 20, bw + 8, 20, 10); ctx.fillStyle = 'rgba(20,12,10,0.8)'; ctx.fill();
    ctx.strokeStyle = phaseT > 0 && ((phaseT * 8) | 0) % 2 === 0 ? '#ffffff' : COL.kin; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#f3ead7'; ctx.fillRect(bx, by + 24, bw * trail, 12);
    if (!BOSS_G) { BOSS_G = ctx.createLinearGradient(0, 0, 0, 12); BOSS_G.addColorStop(0, '#ff7a5a'); BOSS_G.addColorStop(1, COL.shuDark); }
    ctx.save(); ctx.translate(bx, by + 24); ctx.fillStyle = BOSS_G; ctx.fillRect(0, 0, bw * frac, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(0, 1, bw * frac, 3);   // つや
    if (bossHitT > 0) { ctx.globalAlpha = bossShown * (bossHitT / 0.35) * 0.85; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, bw * frac, 12); }
    ctx.restore();
    ctx.globalAlpha = bossShown;
    // 段階の区切り（目盛り）
    const marks = b.phaseMarks || b.phases || DEFAULT_MARKS;
    ctx.fillStyle = COL.kinLight;
    for (const m of marks) { const mx = bx + bw * (typeof m === 'number' && m <= 1 ? m : (m / b.maxHp)); ctx.fillRect(mx - 1, by + 20, 2, 20); }
    // 段階が変わった：バーの下に「怒った！」の札
    if (phaseT > 0 && !b.dying) {
      const k = Math.min(1, (1.2 - phaseT) / 0.15) * Math.min(1, phaseT / 0.3);
      S.phase.alpha = k * bossShown;
      drawText(ctx, PHASE_TEXT[Math.min(PHASE_TEXT.length - 1, b.phase)] || '', vw / 2, by + 56 + (1 - k) * 8, S.phase);
      S.phase.alpha = 1;
    }
    ctx.globalAlpha = 1;
  } else { bossShown = 0; trail = 1; lastBossHp = -1; lastPhase = 0; phaseT = 0; bossHitT = 0; }

  // ---- 得点ポップ（ワールド座標→画面） ----
  const cam = W.camera;
  for (const q of POPS) {
    if (!q.on) continue;
    q.t += dt;
    const life = q.lvl >= 2 ? 1.1 : 0.8;
    if (q.t > life) { q.on = false; continue; }
    // ぽんと大きく出て（0.12秒）、すっと上がって止まり、最後に薄れる
    const st = POP_ST[q.lvl] || POP_ST[1];
    const kIn = Math.min(1, q.t / 0.12), rise = 1 - Math.pow(1 - Math.min(1, q.t / 0.5), 3);
    const sc = kIn < 1 ? 0.6 + kIn * 0.9 : 1.5 - Math.min(1, (q.t - 0.12) / 0.12) * 0.5;
    st.alpha = q.t < life - 0.25 ? 1 : (life - q.t) / 0.25;
    const sx = q.x - cam.x, sy = q.y - cam.y - rise * (q.lvl >= 2 ? 46 : 34);
    ctx.save(); ctx.translate(sx, sy); ctx.scale(sc, sc);
    if (q.lvl >= 4) st.color = RAINBOW[((q.t * 14) | 0) % RAINBOW.length];
    drawText(ctx, q.text, 0, 0, st);
    if (q.sub) { POP_SUB.alpha = st.alpha; drawText(ctx, q.sub, 0, st.size * 0.82, POP_SUB); }
    ctx.restore();
  }
  // ---- 被弾の赤いふち・ハート残り1の脈打つふち ----
  hurtFlash = Math.max(0, hurtFlash - dt * 2.2);
  const low = p.hearts === 1 && p.maxHearts > 1 && W.state === 'play' ? 0.16 + 0.1 * Math.sin(now * 5) : 0;
  const va = Math.max(hurtFlash * 0.6, low);
  if (va > 0.01) {
    // 1/4 の大きさの画像に1回だけ焼いて、引き伸ばして重ねる（全画面の放射グラデーションを毎フレーム塗ると重い）
    if (!VIG || vigW !== vw || vigH !== vh) {
      vigW = vw; vigH = vh;
      const w = Math.ceil(vw / 4), h = Math.ceil(vh / 4);
      VIG = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
      // ふちからの距離で濃さを決める（帯の内側はちょうど透明になるので、帯だけ描けばよい）
      const c = VIG.getContext('2d'), img = c.createImageData(w, h), D = img.data;
      const bw = Math.ceil(w * 0.2), bh = Math.ceil(h * 0.24);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const ex = Math.max(0, 1 - Math.min(x, w - 1 - x) / bw), ey = Math.max(0, 1 - Math.min(y, h - 1 - y) / bh);
        const k = Math.min(1, Math.hypot(ex, ey)), a = k * k * (0.55 + 0.4 * k), i = (y * w + x) * 4;
        D[i] = 190 - 40 * k; D[i + 1] = 16; D[i + 2] = 8; D[i + 3] = a * 255;
      }
      c.putImageData(img, 0, 0);
    }
    // 真ん中は透明なので、ふちの4本の帯だけ描く（塗る面積を約1/3に）
    const w4 = VIG.width, h4 = VIG.height, bx = Math.ceil(w4 * 0.2), by = Math.ceil(h4 * 0.24), BX = bx * vw / w4, BY = by * vh / h4;
    ctx.globalAlpha = va;
    ctx.drawImage(VIG, 0, 0, w4, by, 0, 0, vw, BY);
    ctx.drawImage(VIG, 0, h4 - by, w4, by, 0, vh - BY, vw, BY);
    ctx.drawImage(VIG, 0, by, bx, h4 - by * 2, 0, BY, BX, vh - BY * 2);
    ctx.drawImage(VIG, w4 - bx, by, bx, h4 - by * 2, vw - BX, BY, BX, vh - BY * 2);
    ctx.globalAlpha = 1;
  }
  // ---- 一時表示 ----
  let ty = 120;
  for (const q of TOASTS) {
    if (!q.on) continue;
    q.t += dt;
    if (q.t > q.life) { q.on = false; continue; }
    const k = Math.min(1, q.t / 0.2), out = q.t > q.life - 0.3 ? (q.life - q.t) / 0.3 : 1;
    S.toast.alpha = k * out;
    drawText(ctx, q.text, vw / 2, ty - (1 - k) * 14, S.toast);
    ty += 40;
  }
  S.toast.alpha = 1;

  // ---- ステージ開始：ステージ名と天気 ----
  if (scene && scene.intro > 0 && !scene.paused) drawIntro(ctx, W, vw, vh, scene, now);   // 一時停止中はメニューと重なるので出さない
  ctx.restore();
}

const META_ST = META.stages;
function drawIntro(ctx, W, vw, vh, scene, now) {
  const T = 2.2, e = T - scene.intro;            // 経過
  const k = Math.min(1, e / 0.35) * Math.min(1, scene.intro / 0.45);
  const st = scene.params ? scene.params.stage : W.data.id;
  const m = META_ST[String(st)];
  ctx.save();
  ctx.globalAlpha = k;
  const bh = 150, by = vh * 0.36 - bh / 2;
  if (!INTRO_G || introW !== vw) {
    introW = vw; INTRO_G = ctx.createLinearGradient(0, 0, vw, 0);
    INTRO_G.addColorStop(0, 'rgba(18,35,59,0)'); INTRO_G.addColorStop(0.2, 'rgba(18,35,59,0.82)'); INTRO_G.addColorStop(0.8, 'rgba(18,35,59,0.82)'); INTRO_G.addColorStop(1, 'rgba(18,35,59,0)');
  }
  ctx.fillStyle = INTRO_G; ctx.fillRect(0, by, vw, bh);
  ctx.fillStyle = COL.kin; ctx.fillRect(vw * 0.15, by + 4, vw * 0.7, 2); ctx.fillRect(vw * 0.15, by + bh - 6, vw * 0.7, 2);
  const slide = (1 - Math.min(1, e / 0.35)) * 40;
  drawText(ctx, typeof st === 'number' && st > 0 && st <= 7 ? (st === 7 ? 'うらステージ' : `第${'一二三四五六'[st - 1]}の地`) : 'れんしゅう', vw / 2 - slide, by + 30, S.introNo);
  drawText(ctx, W.data.name || (m && m.name) || '', vw / 2 + slide, by + 74, S.introName);
  const wn = META.weather[W.env.weather] || W.env.weather || '';
  const tn = META.timeOfDay[W.env.timeOfDay] || '';
  drawWeatherIcon(ctx, W.env.weather, vw / 2 - 70, by + 120, 34, now);
  drawText(ctx, (tn ? tn + '・' : '') + wn, vw / 2 - 44, by + 121, INTRO_W);
  ctx.restore();
}
let INTRO_G = null, introW = 0;
const INTRO_W = { size: 22, color: COL.kinLight, stroke: COL.sumi, strokeW: 5, align: 'left', baseline: 'middle' };
