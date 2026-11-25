import { game } from '../game.js';
import { cloud } from '../core/cloud.js';
import { nameInput } from '../ui/nameInput.js';
import { input } from '../core/input.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { touch } from '../ui/touch.js';
import { MenuList, Confirm } from '../ui/menus.js';
import { drawText, drawMomiji, drawOrb, ORB_COLORS, font, COL } from '../ui/text.js';
// タイトル画面（設計書 3章）。担当：UI
// 背景：夕暮れの岐阜の山なみと金華山の城のシルエット、舞う紅葉。メニュー：はじめから／つづき／設定

// ---- 山なみ（決まった形。乱数の種で作る） ----
function ridge(seed, n, base, amp) {
  const pts = new Float32Array(n + 1);
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  let v = 0.5;
  for (let i = 0; i <= n; i++) { v += (r() - 0.5) * 0.5; v = Math.max(0, Math.min(1, v)); pts[i] = base - amp * (0.35 + 0.65 * v) * (0.6 + 0.4 * Math.sin(i * 0.45 + seed)); }
  return pts;
}
const RIDGES = [ridge(7, 40, 0.62, 0.22), ridge(31, 32, 0.72, 0.18), ridge(97, 24, 0.84, 0.14)];
function drawRidge(ctx, pts, vw, vh, color, off) {
  const n = pts.length - 1, step = (vw + 80) / n;
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-40, vh);
  for (let i = 0; i <= n; i++) ctx.lineTo(-40 + i * step - off, pts[i] * vh);
  ctx.lineTo(vw + 40, vh); ctx.closePath(); ctx.fill();
}

// 金華山と岐阜城のシルエット（x: 山頂の位置、y: 山頂の高さ）
export function drawCastleHill(ctx, x, y, vh, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x - 260 * s, vh);
  ctx.bezierCurveTo(x - 160 * s, y + 140 * s, x - 70 * s, y + 20 * s, x - 20 * s, y + 6 * s);
  ctx.lineTo(x + 30 * s, y + 4 * s);
  ctx.bezierCurveTo(x + 90 * s, y + 40 * s, x + 170 * s, y + 160 * s, x + 300 * s, vh);
  ctx.closePath(); ctx.fill();
  // 天守（三層）
  const bx = x + 4 * s, by = y + 6 * s;
  ctx.beginPath();
  ctx.moveTo(bx - 26 * s, by); ctx.lineTo(bx - 22 * s, by - 14 * s); ctx.lineTo(bx + 22 * s, by - 14 * s); ctx.lineTo(bx + 26 * s, by); ctx.closePath(); ctx.fill(); // 石垣
  const tier = (w, yb, h) => {
    ctx.fillRect(bx - w * 0.42 * s, yb - h * s, w * 0.84 * s, h * s);
    ctx.beginPath(); ctx.moveTo(bx - w * 0.68 * s, yb - h * s + 2 * s); ctx.quadraticCurveTo(bx - w * 0.45 * s, yb - h * s - 2 * s, bx - w * 0.3 * s, yb - h * s - 7 * s);
    ctx.lineTo(bx + w * 0.3 * s, yb - h * s - 7 * s); ctx.quadraticCurveTo(bx + w * 0.45 * s, yb - h * s - 2 * s, bx + w * 0.68 * s, yb - h * s + 2 * s); ctx.closePath(); ctx.fill();
  };
  tier(44, by - 14 * s, 10); tier(34, by - 31 * s, 9); tier(24, by - 47 * s, 8);
  ctx.fillRect(bx - 1 * s, by - 68 * s, 2 * s, 6 * s);
}

// 紅葉（使い回しの粒）
const LEAVES = [];
for (let i = 0; i < 34; i++) LEAVES.push({ x: Math.random(), y: Math.random(), s: 6 + Math.random() * 9, sp: 20 + Math.random() * 40, sw: Math.random() * 6, r: Math.random() * 6, c: ['#d8452f', '#e86a2a', '#f0a030', '#b8302a', '#e85848'][i % 5] });
export function drawLeaves(ctx, vw, vh, t, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha;
  for (const L of LEAVES) {
    const y = ((L.y * (vh + 60) + t * L.sp) % (vh + 60)) - 30;
    const x = ((L.x * (vw + 80) + Math.sin(t * 0.9 + L.sw) * 30 + t * 14) % (vw + 80)) - 40;
    ctx.save(); ctx.translate(x, y); ctx.rotate(L.r + t * (0.6 + L.sw * 0.1)); ctx.scale(1, 0.6 + 0.4 * Math.sin(t * 2 + L.sw));
    drawMomiji(ctx, L.s, L.c); ctx.restore();
  }
  ctx.restore();
}

// 岐阜の山の夕景（タイトル・オープニング・エンディングで共通）
export function drawGifuDusk(ctx, vw, vh, t, opt = {}) {
  const g = ctx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, opt.top || '#16234a'); g.addColorStop(0.45, opt.mid || '#5a3a6a'); g.addColorStop(0.75, opt.low || '#e07848'); g.addColorStop(1, opt.bottom || '#f3c070');
  ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
  // 星
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 40; i++) { const sx = (i * 137.5) % vw, sy = (i * 53.3) % (vh * 0.35); ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.5 + i)); ctx.fillRect(sx, sy, 1.6, 1.6); }
  ctx.globalAlpha = 1;
  // 夕日
  const sg = ctx.createRadialGradient(vw * 0.72, vh * 0.6, 10, vw * 0.72, vh * 0.6, 220);
  sg.addColorStop(0, 'rgba(255,230,160,0.95)'); sg.addColorStop(0.15, 'rgba(255,180,90,0.6)'); sg.addColorStop(1, 'rgba(255,120,60,0)');
  ctx.fillStyle = sg; ctx.fillRect(0, 0, vw, vh);
  ctx.fillStyle = '#ffe9b0'; ctx.beginPath(); ctx.arc(vw * 0.72, vh * 0.6, 34, 0, Math.PI * 2); ctx.fill();
  // 雲の帯
  ctx.fillStyle = 'rgba(255,190,140,0.25)';
  for (let i = 0; i < 4; i++) { const cx = ((i * 330 + t * (8 + i * 3)) % (vw + 400)) - 200; ctx.beginPath(); ctx.ellipse(cx, vh * (0.3 + i * 0.07), 180, 10, 0, 0, Math.PI * 2); ctx.fill(); }
  const off = (t * 3) % 1;
  drawRidge(ctx, RIDGES[0], vw, vh, '#7a4a6a', off);
  drawRidge(ctx, RIDGES[1], vw, vh, '#4e2f50', off * 2);
  if (opt.castle !== false) drawCastleHill(ctx, vw * 0.24, vh * 0.5, vh, 1.15, '#2a1a30');
  drawRidge(ctx, RIDGES[2], vw, vh, '#1e1426', off * 3);
  // 川面のきらめき
  ctx.fillStyle = 'rgba(255,210,140,0.35)';
  for (let i = 0; i < 10; i++) { const w = 20 + (i * 13) % 40; ctx.fillRect(vw * 0.62 + Math.sin(t * 2 + i) * 10 + (i % 3) * 40 - w / 2, vh * 0.94 + (i % 4) * 6, w, 1.5); }
}

const LOGO_SUB = { size: 26, color: COL.kinLight, stroke: COL.sumi, strokeW: 5, align: 'center', baseline: 'middle', serif: true, shadow: true };
const NOTE = { size: 14, color: COL.kinari, stroke: COL.sumi, strokeW: 3, align: 'center', baseline: 'middle', alpha: 0.92 };
const HINT = { size: 14, color: COL.kinari, stroke: COL.sumi, strokeW: 3, align: 'center', baseline: 'middle', alpha: 0.8 };
const VER = { size: 11, color: COL.kinari, stroke: COL.sumi, strokeW: 2, align: 'right', baseline: 'middle', alpha: 0.6 };

export const titleScene = {
  t: 0,
  list: new MenuList([{ key: 'new', label: 'はじめから' }, { key: 'cont', label: 'つづき' }, { key: 'settings', label: '設定' }]),
  confirm: new Confirm('セーブを消して はじめから遊びますか？', '消してはじめる', 'やめる'),
  enter(params) {
    this.params = params; this.t = 0;
    const has = save.hasProgress();
    this.list.items[1].disabled = !has;
    this.list.sel = has ? 1 : 0;
    this.confirm.open = false;
    touch.show('menu');
    audio.bgm('title');
    this.cloudRect = { x: 0, y: 0, w: 0, h: 0 };
    // Google でログインしていて名前がまだなら、ランキングに出す名前を聞く（1回だけ）
    if (cloud.signedIn && !cloud.nickname && !cloud._asked) { cloud._asked = true; setTimeout(() => this.askName(), 900); }
  },
  askName() {
    nameInput.open({
      title: 'ランキングに出す名前',
      note: 'Google アカウントでつながりました。記録は作った人のスプレッドシートに保存され、ランキングには ここで決めた名前だけが出ます（本名でなくてかまいません・10文字まで）。',
      value: cloud.nickname,
      onDone: (v) => cloud.setNickname(v),
    });
  },
  exit() { touch.hide(); },
  update(dt) {
    this.t += dt;
    if (nameInput.isOpen) { touch.clearTap(); return; }
    if (this.t < 0.5) { touch.clearTap(); return; }
    // 左下の「Google：名前」を押すと名前を変えられる
    const tp0 = touch.peekTap && touch.peekTap();
    const C = this.cloudRect;
    if (tp0 && cloud.signedIn && tp0.x >= C.x && tp0.x <= C.x + C.w && tp0.y >= C.y && tp0.y <= C.y + C.h) { touch.clearTap(); this.askName(); return; }
    if (this.confirm.open) { if (this.confirm.update(dt) === 'yes') this.startNew(); return; }
    const r = this.list.update(dt, { noBack: true });
    if (r === 'new') { if (save.hasProgress()) this.confirm.show(); else this.startNew(); }
    else if (r === 'cont') game.go('worldmap', {}, 'iris');
    else if (r === 'settings') game.go('settings', { back: 'title' }, 'wipe');
  },
  startNew() {
    save.reset();
    game.go(save.data.seenOpening ? 'select' : 'opening', { from: 'new' }, 'wipe');
  },
  draw(ctx, a, vw, vh) {
    const t = this.t;
    drawGifuDusk(ctx, vw, vh, t);
    drawLeaves(ctx, vw, vh, t);
    // ロゴ
    const k = Math.min(1, t / 0.8);
    const ly = 128 - (1 - k) * 20;
    ctx.save();
    ctx.globalAlpha = k;
    // 背後の金の円光
    const halo = ctx.createRadialGradient(vw / 2, ly, 20, vw / 2, ly, 300);
    halo.addColorStop(0, 'rgba(255,220,140,0.35)'); halo.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = halo; ctx.fillRect(vw / 2 - 320, ly - 200, 640, 400);
    ctx.font = font(84, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 16; ctx.strokeStyle = COL.sumi; ctx.strokeText('ぎふクエスト', vw / 2, ly + 4);
    ctx.lineWidth = 9; ctx.strokeStyle = COL.shuDark; ctx.strokeText('ぎふクエスト', vw / 2, ly);
    const lg = ctx.createLinearGradient(0, ly - 40, 0, ly + 40);
    lg.addColorStop(0, '#fff6cc'); lg.addColorStop(0.45, COL.kinLight); lg.addColorStop(0.55, COL.kin); lg.addColorStop(1, '#b8862a');
    ctx.fillStyle = lg; ctx.fillText('ぎふクエスト', vw / 2, ly);
    // きらり
    const sx = ((t * 0.5) % 2.5) - 0.5;
    if (sx >= 0 && sx <= 1) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * Math.sin(sx * Math.PI);
      ctx.fillStyle = '#fff'; ctx.fillText('ぎふクエスト', vw / 2 + (sx - 0.5) * 6, ly - 1); ctx.restore();
    }
    // 副題と六つの宝珠
    drawText(ctx, '〜 六つの宝珠 〜', vw / 2, ly + 68, LOGO_SUB);
    for (let i = 0; i < 6; i++) {
      const ox = vw / 2 + (i - 2.5) * 34, oy = ly + 104 + Math.sin(t * 2 + i * 0.8) * 3;
      drawOrb(ctx, ox, oy, 8, ORB_COLORS[i], 0.8);
    }
    ctx.restore();
    // メニュー
    this.list.layout(vw / 2, 288, 250, 50, 14);
    ctx.globalAlpha = Math.min(1, Math.max(0, (t - 0.4) / 0.4));
    this.list.draw(ctx);
    ctx.globalAlpha = 1;
    drawText(ctx, touch.enabled ? 'タップで選ぶ' : '↑↓で選ぶ　Z / Enter で決定', vw / 2, 482, HINT);
    // 注意書き（必ず表示）
    ctx.fillStyle = 'rgba(18,10,14,0.55)'; ctx.fillRect(0, vh - 30, vw, 30);
    drawText(ctx, 'この作品はフィクションです。実在の地名・名物を題材にしていますが、地図・人物・団体は架空です。', vw / 2, vh - 15, NOTE);
    drawText(ctx, save.storageOk ? 'ver 0.1' : 'ver 0.1（この端末では保存できません）', vw - 10, vh - 40, VER);
    // Google とのつながり
    if (cloud.available) {
      const label = cloud.status === 'connecting' ? 'Google とつないでいます…'
        : cloud.signedIn ? `● Google：${cloud.nickname || '名前を決めてください'}${cloud.status === 'error' ? '（つながりにくい）' : ''}　✎`
        : 'Google にログインしていません（この端末に保存）';
      const C = this.cloudRect; C.x = 8; C.y = vh - 54; C.w = 380; C.h = 22;
      drawText(ctx, label, 12, vh - 42, { ...VER, align: 'left', color: cloud.signedIn && cloud.status !== 'error' ? '#bfe8a0' : VER.color });
    }
    this.confirm.draw(ctx, vw, vh);
  },
};
