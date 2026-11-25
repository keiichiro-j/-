import { game } from '../game.js';
import { drawHeroDressed } from '../art/heroGear.js';
import { canFree } from '../systems/gacha.js';
import { progress } from '../systems/achievements.js';
import { doneCount } from '../systems/missions.js';
import { toast } from '../ui/toast.js';
import { input } from '../core/input.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { touch } from '../ui/touch.js';
import { drawSprite } from '../gfx/atlas.js';
import { LEVELS } from '../world/levels.js';
import { drawText, drawWashi, drawTag, drawOrb, roundRect, fmtTime, font, COL } from '../ui/text.js';
import META from '../data/stages.json';
import CHARS from '../data/characters.json';
import { weaponById, rarityInfo } from '../systems/gacha.js';
// ワールドマップ（設計書 3章・9章）。架空の岐阜の地図。担当：UI
// params: { stage?: 最後に遊んだステージ（そこにカーソルを置く）}

const ORDER = [0, 1, 2, 3, 4, 5, 6, 7];
// short：幅が足りない時の短い名前。rush（腕試し）はエンディングを見た後だけ出る
const ALL_BTNS = [{ key: 'gacha', label: '福引き' }, { key: 'char', label: 'キャラ変更', short: 'キャラ' }, { key: 'zukan', label: '図鑑' }, { key: 'records', label: '記録' }, { key: 'rush', label: '腕試し' }, { key: 'settings', label: '設定' }, { key: 'title', label: 'タイトル' }];
let BTNS = ALL_BTNS.filter((b) => b.key !== 'rush');
const ST = {
  name: { size: 24, color: COL.sumi, align: 'left', baseline: 'middle', serif: true },
  area: { size: 14, color: COL.shuDark, align: 'left', baseline: 'middle' },
  label: { size: 15, color: '#5a3a2a', align: 'left', baseline: 'middle' },
  val: { size: 18, color: COL.sumi, align: 'right', baseline: 'middle' },
  node: { size: 13, color: '#fff8e6', stroke: COL.sumi, strokeW: 3, align: 'center', baseline: 'middle' },
  nodeNo: { size: 16, color: '#fff8e6', stroke: COL.sumi, strokeW: 3, align: 'center', baseline: 'middle' },
  btn: { size: 15, color: COL.kinari, stroke: COL.woodDark, strokeW: 3, align: 'center', baseline: 'middle' },
  btnA: { size: 15, color: '#fff8e6', stroke: COL.shuDark, strokeW: 3, align: 'center', baseline: 'middle' },
  go: { size: 22, color: '#fff8e6', stroke: COL.shuDark, strokeW: 4, align: 'center', baseline: 'middle' },
  wait: { size: 18, color: COL.gray, align: 'center', baseline: 'middle' },
  hint: { size: 13, color: COL.kinari, stroke: COL.sumi, strokeW: 3, align: 'center', baseline: 'middle', alpha: 0.85 },
  mapTitle: { size: 22, color: COL.sumi, align: 'left', baseline: 'middle', serif: true },
  region: { size: 18, color: 'rgba(90,60,40,0.45)', align: 'center', baseline: 'middle', serif: true },
  new: { size: 13, color: COL.kinLight, stroke: COL.shuDark, strokeW: 3, align: 'center', baseline: 'middle' },
};

// 情報パネルの景色の帯（ステージの空と山の色）
const BANNERS = {
  0: { sky: ['#bfe0ff', '#eaf6ff'], hills: ['#9ac08a', '#6a9a5a'] },
  1: { sky: ['#7ab8f0', '#e8f4ff'], hills: ['#8a9ab0', '#4a7a3a'], peak: 0.5 },
  2: { sky: ['#5a4a8a', '#ff9a6a'], hills: ['#4a3a5a', '#2a3a5a'], lights: true },
  3: { sky: ['#8ac8e8', '#e0f2ff'], hills: ['#7a9a8a', '#3a6a4a'] },
  4: { sky: ['#2a1a4a', '#8a3a5a'], hills: ['#3a2a40', '#1e1428'], stars: true, lights: true },
  5: { sky: ['#a8b8cc', '#eef2f8'], hills: ['#e8eef6', '#c4d0de'], snow: true },
  6: { sky: ['#1a0a14', '#6a1a10'], hills: ['#3a1a1a', '#1a0a0a'], peak: 0.62, stars: true },
  7: { sky: ['#2a2a6a', '#8a7ac8'], hills: ['#4a3a7a', '#2a1a4a'], stars: true },
};

function stageState(n) {
  const d = save.data;
  const has = !!LEVELS[n];
  if (n === 0) return { visible: has, open: has, has };
  if (n === 7) { const v = save.saruboboCount() >= 18; return { visible: v, open: v, has }; }   // レベルが無ければ「準備中」
  const open = n === 1 || d.cleared.includes(n - 1);
  return { visible: true, open, has };
}

export const worldmapScene = {
  t: 0, sel: 1, focus: 'map', btnSel: 0, walk: 1, from: 1,
  nodes: ORDER.map(() => ({ x: 0, y: 0, r: 0 })),
  btnRects: ALL_BTNS.map(() => ({ x: 0, y: 0, w: 0, h: 0 })),
  missionRect: { x: 0, y: 0, w: 0, h: 0 },
  goRect: { x: 0, y: 0, w: 0, h: 0 },
  msg: '', msgT: 0,
  enter(params) {
    this.params = params || {};
    this.t = 0; this.focus = 'map'; this.walk = 1; this.msgT = 0;
    const d = save.data;
    BTNS = ALL_BTNS.filter((b) => b.key !== 'rush' || d.seenEnding);
    if (this.btnSel >= BTNS.length) this.btnSel = 0;
    // 称号・お題：日付の入れ替え、福引きのお題、保存された状態から得られる称号（福引き・エンディングの後など）
    progress.check();
    save.write();
    let s = this.params.stage ?? d.lastStage ?? 1;
    if (typeof s !== 'number' || !stageState(s).visible) s = 1;
    // まだ遊んでいない次のステージがあれば、そこへ
    if (this.params.stage != null) { const nx = s + 1; if (nx <= 6 && stageState(nx).open && !d.cleared.includes(nx) && d.cleared.includes(s)) s = nx; }
    this.sel = this.from = s;
    touch.show('menu');
    audio.bgm('map');
  },
  exit() { touch.hide(); },
  visibleList() { return ORDER.filter((n) => stageState(n).visible); },
  moveSel(dir) {
    const list = this.visibleList();
    let i = list.indexOf(this.sel);
    for (let k = 0; k < list.length; k++) {
      i += dir;
      if (i < 0 || i >= list.length) return;
      if (stageState(list[i]).open || !stageState(list[i]).has) break;
      // 未解放の先へは進めない
      if (!stageState(list[i]).open) return;
    }
    if (list[i] === this.sel) return;
    if (!stageState(list[i]).open) return;
    this.from = this.sel; this.sel = list[i]; this.walk = 0;
    audio.sfx('select');
  },
  update(dt) {
    this.t += dt; this.walk = Math.min(1, this.walk + dt * 3.2); this.msgT = Math.max(0, this.msgT - dt);
    if (this.t < 0.25) { touch.clearTap(); return; }
    const tp = touch.tap();
    if (tp) {
      const inR = (r) => tp.x >= r.x && tp.x <= r.x + r.w && tp.y >= r.y && tp.y <= r.y + r.h;
      for (let i = 0; i < BTNS.length; i++) if (inR(this.btnRects[i])) { this.btnSel = i; return this.button(BTNS[i].key); }
      if (inR(this.goRect)) return this.enterStage();
      if (inR(this.missionRect)) { this.btnSel = BTNS.findIndex((b) => b.key === 'records'); return this.button('records', 1); }
      for (let i = 0; i < ORDER.length; i++) {
        const n = ORDER[i], N = this.nodes[i], st = stageState(n);
        if (!st.visible || Math.hypot(tp.x - N.x, tp.y - N.y) > N.r + 14) continue;
        if (!st.open) { this.say('前のステージをクリアすると進めます'); audio.sfx('cancel'); return; }
        if (n === this.sel) return this.enterStage();
        this.from = this.sel; this.sel = n; this.walk = 0; audio.sfx('select');
        return;
      }
    }
    if (this.focus === 'map') {
      if (input.pressed.right || input.pressed.down) this.moveSel(1);
      if (input.pressed.left) this.moveSel(-1);
      if (input.pressed.up) { this.focus = 'btn'; audio.sfx('select'); }
      if (input.pressed.confirm || input.pressed.jump) this.enterStage();
      else if (input.pressed.back) { audio.sfx('cancel'); game.go('title', {}, 'wipe'); }
    } else {
      if (input.pressed.right) { this.btnSel = (this.btnSel + 1) % BTNS.length; audio.sfx('select'); }
      if (input.pressed.left) { this.btnSel = (this.btnSel + BTNS.length - 1) % BTNS.length; audio.sfx('select'); }
      if (input.pressed.down || input.pressed.back) { this.focus = 'map'; audio.sfx('select'); }
      else if (input.pressed.confirm || input.pressed.jump) this.button(BTNS[this.btnSel].key);
    }
  },
  btnLabels() { return BTNS.map((b) => b.label); },   // テスト用
  say(m) { this.msg = m; this.msgT = 2; },
  button(k, tab) {
    audio.sfx('confirm');
    if (k === 'records') return game.go('records', { back: 'worldmap', tab: tab ?? 0 }, 'wipe');
    if (k === 'rush') return game.go('records', { back: 'worldmap', tab: 2 }, 'wipe');
    if (k === 'gacha') game.go('gacha', { back: 'worldmap' }, 'wipe');
    else if (k === 'char') game.go('select', { back: 'worldmap' }, 'wipe');
    else if (k === 'zukan') { if (game.scenes.zukan) game.go('zukan', { back: 'worldmap' }, 'wipe'); else this.say('図鑑は準備中です'); }
    else if (k === 'settings') game.go('settings', { back: 'worldmap' }, 'wipe');
    else if (k === 'title') game.go('title', {}, 'wipe');
  },
  enterStage() {
    const n = this.sel, st = stageState(n);
    if (!st.open) { audio.sfx('cancel'); return; }
    if (!st.has) { this.say('このステージは準備中です'); audio.sfx('cancel'); return; }
    const d = save.data;
    d.lastStage = n; save.write();
    audio.sfx('confirm');
    const N = this.nodes[ORDER.indexOf(n)];
    game.go('stage', { stage: n, char: this.params.char || d.lastChar || 'leaf' }, 'iris', { cx: N.x, cy: N.y });
  },

  // ---- 描画 ----
  drawMap(ctx, x, y, w, h, t) {
    // 地図の土台（和紙）
    drawWashi(ctx, x, y, w, h, { r: 10 });
    ctx.save();
    roundRect(ctx, x + 8, y + 8, w - 16, h - 16, 6); ctx.clip();
    // 外は海でなく山の霞（藍のぼかし）
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#dfe7ea'); g.addColorStop(1, '#efe4cc');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    // 架空の国のかたち
    ctx.beginPath();
    const cx = x + w * 0.5, cy = y + h * 0.5;
    for (let i = 0; i <= 36; i++) {
      const a = i / 36 * Math.PI * 2;
      const r = 1 + 0.08 * Math.sin(a * 3 + 1) + 0.05 * Math.sin(a * 7 + 2);
      const px = cx + Math.cos(a) * w * 0.47 * r, py = cy + Math.sin(a) * h * 0.47 * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const lg = ctx.createLinearGradient(0, y, 0, y + h); lg.addColorStop(0, '#b8c4a8'); lg.addColorStop(0.5, '#c8d4a0'); lg.addColorStop(1, '#d8d8a0');
    ctx.fillStyle = lg; ctx.fill();
    ctx.strokeStyle = 'rgba(90,60,40,0.45)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
    // 北の山々（雪をかぶる）
    for (let i = 0; i < 14; i++) {
      const mx = x + w * (0.12 + (i * 0.061) % 0.8), my = y + h * (0.1 + ((i * 37) % 23) / 100), s = 0.8 + (i % 3) * 0.25;
      ctx.fillStyle = '#7a8a7a'; ctx.beginPath(); ctx.moveTo(mx - 18 * s, my + 16 * s); ctx.lineTo(mx, my - 10 * s); ctx.lineTo(mx + 18 * s, my + 16 * s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f4f6f8'; ctx.beginPath(); ctx.moveTo(mx - 6 * s, my - 2 * s); ctx.lineTo(mx, my - 10 * s); ctx.lineTo(mx + 6 * s, my - 2 * s); ctx.closePath(); ctx.fill();
    }
    // 火の山（乗鞍）
    const vx = x + w * 0.86, vy = y + h * 0.14;
    ctx.fillStyle = '#6a4a4a'; ctx.beginPath(); ctx.moveTo(vx - 34, vy + 30); ctx.lineTo(vx - 8, vy - 8); ctx.lineTo(vx + 8, vy - 8); ctx.lineTo(vx + 34, vy + 30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(160,150,150,0.55)'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(vx + Math.sin(t + i) * 4, vy - 16 - i * 10 - ((t * 6) % 10), 6 + i * 3, 0, Math.PI * 2); ctx.fill(); }
    // 南の森
    ctx.fillStyle = '#6a8a5a';
    for (let i = 0; i < 18; i++) { const fx = x + w * (0.1 + (i * 0.137) % 0.8), fy = y + h * (0.55 + ((i * 29) % 30) / 100); ctx.beginPath(); ctx.arc(fx, fy, 6, 0, Math.PI * 2); ctx.fill(); }
    // 川（北から南へ）
    ctx.strokeStyle = '#6aa0c8'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + w * 0.55, y + h * 0.05);
    ctx.bezierCurveTo(x + w * 0.45, y + h * 0.35, x + w * 0.6, y + h * 0.55, x + w * 0.44, y + h * 0.72);
    ctx.bezierCurveTo(x + w * 0.36, y + h * 0.82, x + w * 0.3, y + h * 0.9, x + w * 0.22, y + h);
    ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + w * 0.3, y + h * 0.3); ctx.bezierCurveTo(x + w * 0.38, y + h * 0.45, x + w * 0.44, y + h * 0.55, x + w * 0.5, y + h * 0.6); ctx.stroke();
    ctx.lineCap = 'butt';
    drawText(ctx, '飛　騨', x + w * 0.28, y + h * 0.36, ST.region);
    drawText(ctx, '美　濃', x + w * 0.72, y + h * 0.82, ST.region);
    ctx.restore();
    // 方位
    const ox = x + w - 40, oy = y + h - 44;
    ctx.strokeStyle = 'rgba(90,60,40,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ox, oy, 16, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = COL.shu; ctx.beginPath(); ctx.moveTo(ox, oy - 15); ctx.lineTo(ox - 5, oy); ctx.lineTo(ox + 5, oy); ctx.closePath(); ctx.fill();
    drawText(ctx, '北', ox, oy - 26, ST.area_c || (ST.area_c = { ...ST.area, align: 'center' }));
  },
  draw(ctx, a, vw, vh) {
    const t = this.t, d = save.data;
    ctx.fillStyle = '#2a1e1a'; ctx.fillRect(0, 0, vw, vh);
    const PAD = 14, TOP = 58;
    const panelW = Math.round(Math.min(320, Math.max(280, vw * 0.27)));
    const mx = PAD, my = TOP, mw = vw - panelW - PAD * 3, mh = vh - TOP - PAD;
    this.drawMap(ctx, mx, my, mw, mh, t);
    // 位置
    for (let i = 0; i < ORDER.length; i++) { const m = META.stages[ORDER[i]], N = this.nodes[i]; N.x = mx + 20 + (mw - 40) * m.map[0]; N.y = my + 20 + (mh - 40) * m.map[1]; N.r = ORDER[i] === 0 ? 16 : 22; }
    // 道（点線）
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 1; i < ORDER.length; i++) {
      const n = ORDER[i], A = this.nodes[i - 1], B = this.nodes[i];
      const sa = stageState(ORDER[i - 1]), sb = stageState(n);
      if (!sa.visible || !sb.visible) continue;
      const open = sb.open;
      ctx.strokeStyle = open ? 'rgba(160,50,30,0.85)' : 'rgba(90,60,40,0.35)';
      ctx.lineWidth = open ? 5 : 4; ctx.setLineDash(open ? [2, 10] : [2, 12]);
      ctx.lineDashOffset = open ? -t * 12 : 0;
      ctx.beginPath(); ctx.moveTo(A.x, A.y);
      const mxp = (A.x + B.x) / 2 + (B.y - A.y) * 0.15, myp = (A.y + B.y) / 2 - (B.x - A.x) * 0.15;
      ctx.quadraticCurveTo(mxp, myp, B.x, B.y); ctx.stroke();
    }
    ctx.restore();
    // ノード
    for (let i = 0; i < ORDER.length; i++) {
      const n = ORDER[i], N = this.nodes[i], st = stageState(n);
      if (!st.visible) continue;
      const m = META.stages[n], cleared = d.cleared.includes(n), on = n === this.sel;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(N.x, N.y + N.r * 0.8, N.r * 1.1, N.r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      if (on) { ctx.strokeStyle = `rgba(246,220,138,${0.6 + 0.4 * Math.sin(t * 5)})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(N.x, N.y, N.r + 7, 0, Math.PI * 2); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(N.x, N.y, N.r, 0, Math.PI * 2);
      ctx.fillStyle = !st.open ? '#8a8378' : cleared ? COL.shu : n === 7 ? '#5a3a8a' : COL.ai; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = cleared ? COL.kin : COL.kinari; ctx.stroke();
      if (cleared && m.orb) drawOrb(ctx, N.x, N.y, N.r * 0.45, m.orb, 0.6);
      else drawText(ctx, n === 0 ? '練' : n === 7 ? '裏' : !st.open ? '・' : String(n), N.x, N.y + 1, ST.nodeNo);
      drawText(ctx, m.short, N.x, N.y + N.r + 14, ST.node);
      // 目標タイム達成の金の印
      const bt = d.bestTime[String(n)];
      if (bt != null && bt <= m.target) { ctx.fillStyle = COL.kin; this.star(ctx, N.x + N.r * 0.8, N.y - N.r * 0.8, 8); ctx.strokeStyle = COL.kinDark; ctx.lineWidth = 1; ctx.stroke(); }
      if (!st.has && st.open) drawText(ctx, '準備中', N.x, N.y - N.r - 10, ST.new);
    }
    // 主人公のコマ
    const iA = ORDER.indexOf(this.from), iB = ORDER.indexOf(this.sel);
    const A = this.nodes[iA], B = this.nodes[iB], k = this.walk, e = k * k * (3 - 2 * k);
    const hx = A.x + (B.x - A.x) * e, hy = A.y + (B.y - A.y) * e - Math.sin(e * Math.PI) * 16;
    drawHeroDressed(ctx, this.params.char || d.lastChar || 'leaf', k < 1 ? 'walk' : 'idle', (t * 8) | 0, hx, hy - 10, { sx: 0.9, sy: 0.9, flip: B.x < A.x && k < 1, weaponId: save.data.equipped && save.data.weapons[save.data.equipped] ? save.data.equipped : null, time: t });
    // 見出し
    drawText(ctx, '岐阜の地図', PAD + 6, 30, { size: 26, color: COL.kinLight, stroke: COL.sumi, strokeW: 5, align: 'left', baseline: 'middle', serif: true });
    const cnt = save.saruboboCount();
    // さるぼぼ・宝珠の数（地図の左上に重ねる。上の段はボタンに使う）
    roundRect(ctx, mx + 12, my + 12, 196, 32, 16); ctx.fillStyle = 'rgba(26,18,14,0.72)'; ctx.fill();
    drawSprite(ctx, 'item_sarubobo', 0, mx + 32, my + 42, { sx: 0.6, sy: 0.6 });
    drawText(ctx, `${cnt} / 18`, mx + 46, my + 29, ST.hint_l || (ST.hint_l = { size: 16, color: COL.kinari, stroke: COL.sumi, strokeW: 3, align: 'left', baseline: 'middle' }));
    drawOrb(ctx, mx + 118, my + 28, 7, COL.kin, 0.4);
    drawText(ctx, `宝珠 ${d.cleared.filter((n) => n >= 1 && n <= 6).length} / 6`, mx + 130, my + 29, ST.hint_l);
    // ボタン（上）
    // ボタン：見出しの右から地図の右端までに収める
    // ボタン：見出しの右から画面の右端まで、同じ幅で等間隔に（右端はパネルの右端にそろえる）
    const bh = 36, gap = 8, bx0 = 178, bx1 = vw - PAD, bw = Math.min(118, (bx1 - bx0 - gap * (BTNS.length - 1)) / BTNS.length);
    for (let i = 0; i < BTNS.length; i++) {
      const r = this.btnRects[i]; r.w = bw; r.h = bh; r.x = bx1 - (BTNS.length - i) * bw - (BTNS.length - 1 - i) * gap; r.y = 11;
      const on = this.focus === 'btn' && this.btnSel === i;
      drawTag(ctx, r.x, r.y, r.w, r.h, on, false, on ? 0.5 + 0.5 * Math.sin(t * 5) : 0);
      const lb = this.fitLabel(ctx, BTNS[i], r.w - 10);
      drawText(ctx, lb.text, r.x + r.w / 2, r.y + r.h / 2 + 1, on ? lb.stA : lb.st);
      // 今日の無料の福引きが残っていれば赤い点
      if (BTNS[i].key === 'gacha' && canFree(d)) { ctx.fillStyle = COL.shu; ctx.beginPath(); ctx.arc(r.x + r.w - 6, r.y + 6, 6, 0, 7); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    }
    // 今日のお題（小さな表示。タップで記録画面のお題へ）
    this.drawMissions(ctx, mx + 216, my + 12, d, t);
    // ---- 右：ステージの情報 ----
    this.drawInfo(ctx, vw - panelW - PAD, TOP, panelW, vh - TOP - PAD, t);
    if (this.msgT > 0) {
      ctx.globalAlpha = Math.min(1, this.msgT * 2);
      roundRect(ctx, mx + mw / 2 - 200, vh - 80, 400, 40, 20); ctx.fillStyle = 'rgba(20,14,12,0.85)'; ctx.fill();
      drawText(ctx, this.msg, mx + mw / 2, vh - 59, ST.hint);
      ctx.globalAlpha = 1;
    }
    toast.draw(ctx, vw, vh, my + 52, true);   // 称号・お題の通知（地図の左上。右のパネルと重ならない）
  },
  // ボタンの文字を幅に合わせる（15→12px。入らなければ短い名前）。結果はボタンごとに覚える
  fitLabel(ctx, b, maxW) {
    if (b._fit && b._fitW === maxW) return b._fit;
    let text = b.label, size = 15;
    const wOf = (str, sz) => { ctx.font = font(sz); return ctx.measureText(str).width; };
    while (size > 12 && wOf(text, size) > maxW) size--;
    if (wOf(text, size) > maxW && b.short) { text = b.short; size = 15; while (size > 12 && wOf(text, size) > maxW) size--; }
    b._fitW = maxW;
    b._fit = { text, st: { ...ST.btn, size }, stA: { ...ST.btnA, size } };
    return b._fit;
  },
  drawMissions(ctx, x, y, d, t) {
    const list = d.missions.list, n = list.length, done = doneCount(d);
    const R = this.missionRect; R.x = x; R.y = y; R.w = 70 + n * 22 + 8; R.h = 32;
    if (!n) { R.w = 0; return; }
    roundRect(ctx, R.x, R.y, R.w, R.h, 16); ctx.fillStyle = 'rgba(26,18,14,0.72)'; ctx.fill();
    drawText(ctx, 'お題', x + 14, y + 17, ST.hint_l);
    for (let i = 0; i < n; i++) {
      const cx = x + 64 + i * 22 + 8, cy = y + 16, ok = list[i].done;
      ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fillStyle = ok ? COL.shu : 'rgba(243,234,215,0.18)'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = ok ? COL.kinLight : 'rgba(243,234,215,0.6)'; ctx.stroke();
      if (ok) { ctx.strokeStyle = '#fff8e6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 4, cy); ctx.lineTo(cx - 1, cy + 3); ctx.lineTo(cx + 4, cy - 3); ctx.stroke(); }
    }
    if (done === n && n) { ctx.fillStyle = COL.kin; this.star(ctx, R.x + R.w - 4, R.y + 4, 6); }
  },
  star(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  },
  drawInfo(ctx, x, y, w, h, t) {
    const d = save.data, n = this.sel, m = META.stages[n], st = stageState(n), key = String(n);
    const L = 20, R = x + w - L;          // 内側の左右の余白
    drawWashi(ctx, x, y, w, h);
    // 見出し
    drawText(ctx, n === 0 ? 'れんしゅう' : n === 7 ? 'うらステージ' : `第${'一二三四五六'[n - 1]}の地　${m.area}`, x + L, y + 26, ST.area);
    const nm = (LEVELS[n] && LEVELS[n].name) || m.name;
    drawText(ctx, nm, x + L, y + 52, nm.length > 9 ? ST.nameS || (ST.nameS = { ...ST.name, size: 19 }) : ST.name);
    // 景色の帯（ステージの雰囲気。クリアすると宝珠が光る）
    const by = y + 72, bh = 78;
    this.drawBanner(ctx, x + L, by, w - L * 2, bh, n, t, d.cleared.includes(n));
    // 記録の行（等間隔・区切り線）
    const rows = [['さるぼぼ', null], ['ベストタイム', fmtTime(d.bestTime[key])], ['目標タイム', fmtTime(m.target)], ['クリア', d.cleared.includes(n) ? '済' : '―']];
    const ry0 = by + bh + 26, rstep = 30;
    rows.forEach(([lab, val], i) => {
      const ry = ry0 + i * rstep;
      drawText(ctx, lab, x + L, ry, ST.label);
      if (val != null) drawText(ctx, val, R, ry, ST.val);
      if (i < rows.length - 1) { ctx.fillStyle = 'rgba(90,60,40,0.14)'; ctx.fillRect(x + L, ry + rstep / 2, w - L * 2, 1); }
    });
    const sb = d.sarubobo[key] || [false, false, false];
    for (let i = 0; i < 3; i++) {
      const sx = R - 12 - (2 - i) * 32, sy = ry0;
      roundRect(ctx, sx - 13, sy - 14, 26, 28, 6); ctx.fillStyle = 'rgba(90,60,40,0.13)'; ctx.fill(); ctx.strokeStyle = 'rgba(90,60,40,0.35)'; ctx.lineWidth = 1; ctx.stroke();
      if (sb[i]) drawSprite(ctx, 'item_sarubobo', 0, sx, sy + 12, { sx: 0.7, sy: 0.7 });
    }
    const bt = d.bestTime[key];
    if (bt != null && bt <= m.target) { ctx.fillStyle = COL.kin; this.star(ctx, R - 92, ry0 + rstep * 2, 8); }
    // 仲間の札（キャラと装備）
    const cy = ry0 + rstep * 3 + 22, ch = 84, cid = this.params.char || d.lastChar || 'leaf', C = CHARS[cid] || CHARS.leaf;
    const wid = d.equipped && d.weapons[d.equipped] && weaponById(d.equipped) ? d.equipped : null;
    roundRect(ctx, x + L, cy, w - L * 2, ch, 10); ctx.fillStyle = 'rgba(90,60,40,0.1)'; ctx.fill(); ctx.strokeStyle = 'rgba(142,42,28,0.35)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.save(); roundRect(ctx, x + L, cy, w - L * 2, ch, 10); ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(x + L + 46, cy + ch - 12, 26, 5, 0, 0, Math.PI * 2); ctx.fill();
    drawHeroDressed(ctx, cid, 'idle', (t * 6) | 0, x + L + 46, cy + ch - 12, { sx: 1.2, sy: 1.2, weaponId: wid, time: t });
    ctx.restore();
    const tx = x + L + 92;
    drawText(ctx, 'この仲間で出発', tx, cy + 16, ST.areaS || (ST.areaS = { ...ST.area, size: 12 }));
    drawText(ctx, C.name, tx, cy + 38, ST.cname || (ST.cname = { size: 20, color: COL.sumi, align: 'left', baseline: 'middle', serif: true }));
    if (wid) {
      const W = weaponById(wid);
      drawSprite(ctx, `weapon_${wid}`, 0, tx + 10, cy + 64, { sx: 0.45, sy: 0.45 });
      drawText(ctx, W.name, tx + 24, cy + 64, ST.wname || (ST.wname = { size: 13, color: '#5a3a2a', align: 'left', baseline: 'middle' }));
      ctx.fillStyle = rarityInfo(W.rarity).color; ctx.beginPath(); ctx.arc(R - 14, cy + 64, 4, 0, Math.PI * 2); ctx.fill();
    } else drawText(ctx, '武器なし（福引き蔵で手に入る）', tx, cy + 64, ST.wname || (ST.wname = { size: 13, color: '#5a3a2a', align: 'left', baseline: 'middle' }));
    // 出発ボタン（横いっぱい）
    const G = this.goRect; G.x = x + L; G.w = w - L * 2; G.h = 50; G.y = y + h - 74;
    if (st.open && st.has) {
      drawTag(ctx, G.x, G.y, G.w, G.h, this.focus === 'map', false, 0.5 + 0.5 * Math.sin(t * 4));
      drawText(ctx, '出発！', G.x + G.w / 2, G.y + G.h / 2 + 1, ST.go);
    } else { roundRect(ctx, G.x, G.y, G.w, G.h, 12); ctx.fillStyle = 'rgba(90,60,40,0.1)'; ctx.fill(); drawText(ctx, st.open ? '準備中' : 'まだ進めない', G.x + G.w / 2, G.y + G.h / 2, ST.wait); }
    drawText(ctx, touch.enabled ? '場所をタップ・もう一度で出発' : '←→ 移動　Z 出発　↑ メニュー', x + w / 2, y + h - 12, ST.hintD || (ST.hintD = { size: 12, color: '#5a3a2a', align: 'center', baseline: 'middle' }));
  },
  // 景色の帯：ステージごとの空と山の色、宝珠
  drawBanner(ctx, x, y, w, h, n, t, cleared) {
    const P = BANNERS[n] || BANNERS[1], m = META.stages[n];
    ctx.save(); roundRect(ctx, x, y, w, h, 10); ctx.clip();
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, P.sky[0]); g.addColorStop(1, P.sky[1]); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    if (P.stars) { ctx.fillStyle = 'rgba(255,255,240,0.8)'; for (let i = 0; i < 18; i++) ctx.fillRect(x + ((i * 53.7) % w), y + ((i * 31.3) % (h * 0.5)), 1.5, 1.5); }
    P.hills.forEach((c, k) => {
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y + h);
      for (let i = 0; i <= 24; i++) { const u = i / 24; ctx.lineTo(x + u * w, y + h * (0.55 + k * 0.17) - Math.sin(u * (5 + k * 3) + n * 1.7 + k) * h * (0.14 - k * 0.04) - (k === 0 && P.peak ? Math.max(0, 1 - Math.abs(u - P.peak) * 6) * h * 0.25 : 0)); }
      ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
    });
    if (P.snow) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = 0; i < 26; i++) { ctx.beginPath(); ctx.arc(x + ((i * 47.1 + t * 8) % w), y + ((i * 23.7 + t * 14) % h), 1.4, 0, Math.PI * 2); ctx.fill(); } }
    if (P.lights) for (let i = 0; i < 6; i++) { const lx = x + w * (0.15 + i * 0.14), ly = y + h * 0.74; ctx.fillStyle = 'rgba(255,190,90,0.9)'; ctx.beginPath(); ctx.arc(lx, ly, 2.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(90,60,40,0.45)'; ctx.lineWidth = 1.5; roundRect(ctx, x, y, w, h, 10); ctx.stroke();
    if (m.orb) drawOrb(ctx, x + w - 24, y + 22, 10, cleared ? m.orb : '#8a8378', cleared ? 1 : 0);
    if (m.boss) drawText(ctx, `ボス：${m.boss}`, x + 10, y + h - 12, ST.boss || (ST.boss = { size: 12, color: '#fff8e6', stroke: 'rgba(20,12,8,0.8)', strokeW: 3, align: 'left', baseline: 'middle' }));
  },
};
