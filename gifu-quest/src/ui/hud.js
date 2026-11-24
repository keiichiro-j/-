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
  pop: { size: 22, color: COL.kinLight, stroke: COL.shuDark, strokeW: 5, align: 'center', baseline: 'middle', alpha: 1 },
  toast: { size: 26, color: '#fff8e8', stroke: COL.shuDark, strokeW: 6, align: 'center', baseline: 'middle', shadow: true, alpha: 1 },
  key: { size: 12, color: COL.kinari, stroke: COL.sumi, strokeW: 3, align: 'center', baseline: 'middle' },
};

// ---- 一時表示（NEW・さるぼぼ取得など）と得点ポップ（使い回しの配列） ----
const POPS = []; for (let i = 0; i < 16; i++) POPS.push({ on: false, x: 0, y: 0, t: 0, text: '' });
const TOASTS = []; for (let i = 0; i < 4; i++) TOASTS.push({ on: false, t: 0, text: '', life: 1.8 });
const POP_TEXT = ['', '+1', '+2', '+4', '+8'];
let lastNow = 0;
export function hudToast(text, life = 1.8) {
  let tt = TOASTS.find((q) => !q.on) || TOASTS[0];
  tt.on = true; tt.t = 0; tt.text = text; tt.life = life;
}
function pop(x, y, text) {
  const p = POPS.find((q) => !q.on) || POPS[0];
  p.on = true; p.x = x; p.y = y; p.t = 0; p.text = text;
}
events.on('stomp', (e) => {
  const lvl = Math.min(4, Math.round(Math.log2(e.points || 1)) + 1);
  pop(e.x, e.y - 10, e.chain >= 2 ? `${e.chain}連続 ${POP_TEXT[lvl]}` : POP_TEXT[lvl]);
});
events.on('sarubobo', (e) => hudToast(`さるぼぼ ${(e.index ?? 0) + 1}つ目！`));
events.on('checkpoint', () => hudToast('中間地点　ハート全回復'));
events.on('stageEnter', () => { for (const p of POPS) p.on = false; for (const t of TOASTS) t.on = false; bossShown = 0; trail = 1; });
// 図鑑：倒した敵の種類を記録（保存はステージ終了時）
events.on('enemyDefeated', (e) => {
  // 図鑑に載るのは kind を持つ敵だけ（ボスの手下や分身は数えない）
  const k = e.kind;
  if (!k) return;
  const d = save.data.defeated;
  if (!d.includes(k)) d.push(k);
});

let bossShown = 0, trail = 1;

// 顔アイコン（hero_<id>_idle の頭を丸く切り抜く）
function drawFace(ctx, id, cx, cy, r, t) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(cx, cy - r * 0.4, 2, cx, cy, r);
  g.addColorStop(0, '#f8efd8'); g.addColorStop(1, '#c9b48a');
  ctx.fillStyle = g; ctx.fill();
  ctx.clip();
  drawSprite(ctx, `hero_${id}_idle`, (t * 6) | 0, cx, cy + r * 2.35, { sx: 2.0, sy: 2.0 });
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
export function drawHeart(ctx, x, y, s, full, beat = 0) {
  const k = 1 + beat;
  ctx.save(); ctx.translate(x, y + s * 0.4); ctx.scale(k, k); ctx.translate(-x, -y - s * 0.4);
  heartPath(ctx, x, y, s);
  ctx.lineWidth = 3; ctx.strokeStyle = COL.sumi; ctx.stroke();
  if (full) {
    const g = ctx.createLinearGradient(0, y, 0, y + s);
    g.addColorStop(0, '#ff6b5a'); g.addColorStop(1, '#b8241a');
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(x - s * 0.25, y + s * 0.2, s * 0.1, s * 0.07, -0.6, 0, Math.PI * 2); ctx.fill();
  } else { ctx.fillStyle = 'rgba(40,30,30,0.6)'; ctx.fill(); }
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
    drawSprite(ctx, `weapon_${p.weaponId}`, 0, wx, wy, { sx: 0.55, sy: 0.55 });
    if (p.guardLeft > 0) { ctx.fillStyle = 'rgba(160,220,255,0.95)'; for (let i = 0; i < p.guardLeft; i++) { ctx.beginPath(); ctx.arc(wx + 18 + i * 9, wy + 8, 3.5, 0, Math.PI * 2); ctx.fill(); } }
  }
  // ハート
  const hs = 26;
  for (let i = 0; i < p.maxHearts; i++) {
    const full = i < p.hearts;
    const beat = full && i === p.hearts - 1 && p.hearts <= 1 ? 0.12 * Math.max(0, Math.sin(now * 8)) : 0;
    drawHeart(ctx, 104 + i * (hs + 6), 20, hs, full, beat);
  }
  if (p.star > 0) { ctx.fillStyle = COL.kin; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(now * 12); ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('無敵', 104, 66); ctx.globalAlpha = 1; }

  // ---- 上中央：コイン・さるぼぼ・時間 ----
  const pw = 400, px = vw / 2 - pw / 2, py = 12, ph = 44;
  woodPanel(ctx, px, py, pw, ph);
  drawSprite(ctx, 'item_coin', 0, px + 30, py + ph / 2 + 12, { sx: 0.9, sy: 0.9 });
  drawText(ctx, '×' + W.stats.coins, px + 46, py + ph / 2 + 1, S.coin);
  const prev = W.collectedSarubobo;
  for (let i = 0; i < 3; i++) {
    const sx = px + 168 + i * 38, sy = py + ph / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.strokeStyle = 'rgba(243,234,215,0.6)'; ctx.lineWidth = 1.5;
    roundRect(ctx, sx - 15, sy - 17, 30, 34, 8); ctx.fill(); ctx.stroke();
    if (W.stats.sarubobo[i]) drawSprite(ctx, 'item_sarubobo', 0, sx, sy + 14, { sx: 0.82, sy: 0.82 });
    else if (prev && prev[i]) drawSprite(ctx, 'item_sarubobo', 0, sx, sy + 14, { sx: 0.82, sy: 0.82, alpha: 0.3 });
  }
  // 時計
  const tx = px + 284;
  ctx.strokeStyle = COL.kinari; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(tx, py + ph / 2, 9, 0, Math.PI * 2); ctx.stroke();
  const a = W.stats.time * Math.PI / 30;
  ctx.beginPath(); ctx.moveTo(tx, py + ph / 2); ctx.lineTo(tx + Math.sin(a) * 6, py + ph / 2 - Math.cos(a) * 6); ctx.stroke();
  drawText(ctx, fmtTime(W.stats.time), tx + 16, py + ph / 2 + 1, S.time);

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
    if (trail < frac) trail = frac; else trail = Math.max(frac, trail - dt * 0.4);
    const bw = Math.min(520, vw - 360), bx = vw / 2 - bw / 2, by = 74 - (1 - bossShown) * 40;
    ctx.globalAlpha = bossShown;
    drawText(ctx, b.name || 'ボス', vw / 2, by + 6, S.boss);
    roundRect(ctx, bx - 4, by + 20, bw + 8, 20, 10); ctx.fillStyle = 'rgba(20,12,10,0.8)'; ctx.fill();
    ctx.strokeStyle = COL.kin; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#f3ead7'; ctx.fillRect(bx, by + 24, bw * trail, 12);
    const g = ctx.createLinearGradient(0, by + 24, 0, by + 36); g.addColorStop(0, '#ff7a5a'); g.addColorStop(1, COL.shuDark);
    ctx.fillStyle = g; ctx.fillRect(bx, by + 24, bw * frac, 12);
    // 段階の区切り（目盛り）
    const marks = b.phaseMarks || b.phases || [2 / 3, 1 / 3];
    ctx.fillStyle = COL.kinLight;
    for (const m of marks) { const mx = bx + bw * (typeof m === 'number' && m <= 1 ? m : (m / b.maxHp)); ctx.fillRect(mx - 1, by + 20, 2, 20); }
    ctx.globalAlpha = 1;
  } else { bossShown = 0; trail = 1; }

  // ---- 得点ポップ（ワールド座標→画面） ----
  const cam = W.camera;
  for (const q of POPS) {
    if (!q.on) continue;
    q.t += dt;
    if (q.t > 0.9) { q.on = false; continue; }
    S.pop.alpha = q.t < 0.6 ? 1 : 1 - (q.t - 0.6) / 0.3;
    drawText(ctx, q.text, q.x - cam.x, q.y - cam.y - q.t * 50, S.pop);
  }
  S.pop.alpha = 1;
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
  const g = ctx.createLinearGradient(0, 0, vw, 0);
  g.addColorStop(0, 'rgba(18,35,59,0)'); g.addColorStop(0.2, 'rgba(18,35,59,0.82)'); g.addColorStop(0.8, 'rgba(18,35,59,0.82)'); g.addColorStop(1, 'rgba(18,35,59,0)');
  ctx.fillStyle = g; ctx.fillRect(0, by, vw, bh);
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
const INTRO_W = { size: 22, color: COL.kinLight, stroke: COL.sumi, strokeW: 5, align: 'left', baseline: 'middle' };
