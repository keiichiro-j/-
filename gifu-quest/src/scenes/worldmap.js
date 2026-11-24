import { game } from '../game.js';
import { canFree } from '../systems/gacha.js';
import { input } from '../core/input.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { touch } from '../ui/touch.js';
import { drawSprite } from '../gfx/atlas.js';
import { LEVELS } from '../world/levels.js';
import { drawText, drawWashi, drawTag, drawOrb, roundRect, fmtTime, COL } from '../ui/text.js';
import META from '../data/stages.json';
// ワールドマップ（設計書 3章・9章）。架空の岐阜の地図。担当：UI
// params: { stage?: 最後に遊んだステージ（そこにカーソルを置く）}

const ORDER = [0, 1, 2, 3, 4, 5, 6, 7];
const BTNS = [{ key: 'gacha', label: '福引き' }, { key: 'char', label: 'キャラ変更' }, { key: 'zukan', label: '図鑑' }, { key: 'settings', label: '設定' }, { key: 'title', label: 'タイトル' }];
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
  btnRects: BTNS.map(() => ({ x: 0, y: 0, w: 0, h: 0 })),
  goRect: { x: 0, y: 0, w: 0, h: 0 },
  msg: '', msgT: 0,
  enter(params) {
    this.params = params || {};
    this.t = 0; this.focus = 'map'; this.walk = 1; this.msgT = 0;
    const d = save.data;
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
  say(m) { this.msg = m; this.msgT = 2; },
  button(k) {
    audio.sfx('confirm');
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
    const panelW = 300;
    const mx = 16, my = 58, mw = vw - panelW - 44, mh = vh - my - 30;
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
    drawSprite(ctx, `hero_${this.params.char || d.lastChar || 'leaf'}_${k < 1 ? 'walk' : 'idle'}`, (t * 8) | 0, hx, hy - 10, { sx: 0.9, sy: 0.9, flip: B.x < A.x && k < 1 });
    // 見出し
    drawText(ctx, '岐阜の地図', 26, 30, { size: 26, color: COL.kinLight, stroke: COL.sumi, strokeW: 5, align: 'left', baseline: 'middle', serif: true });
    const cnt = save.saruboboCount();
    // さるぼぼ・宝珠の数（地図の左上に重ねる。上の段はボタンに使う）
    roundRect(ctx, mx + 12, my + 12, 196, 32, 16); ctx.fillStyle = 'rgba(26,18,14,0.72)'; ctx.fill();
    drawSprite(ctx, 'item_sarubobo', 0, mx + 32, my + 42, { sx: 0.6, sy: 0.6 });
    drawText(ctx, `${cnt} / 18`, mx + 46, my + 29, ST.hint_l || (ST.hint_l = { size: 16, color: COL.kinari, stroke: COL.sumi, strokeW: 3, align: 'left', baseline: 'middle' }));
    drawOrb(ctx, mx + 118, my + 28, 7, COL.kin, 0.4);
    drawText(ctx, `宝珠 ${d.cleared.filter((n) => n >= 1 && n <= 6).length} / 6`, mx + 130, my + 29, ST.hint_l);
    // ボタン（上）
    // ボタン：見出しの右から地図の右端までに収める
    const bh = 34, bx0 = 160, bx1 = vw - panelW - 28, bw = Math.min(104, (bx1 - bx0) / BTNS.length - 6);
    for (let i = 0; i < BTNS.length; i++) {
      const r = this.btnRects[i]; r.w = bw; r.h = bh; r.x = bx1 - (BTNS.length - i) * (bw + 6) + 6; r.y = 12;
      const on = this.focus === 'btn' && this.btnSel === i;
      drawTag(ctx, r.x, r.y, r.w, r.h, on, false, on ? 0.5 + 0.5 * Math.sin(t * 5) : 0);
      drawText(ctx, BTNS[i].label, r.x + r.w / 2, r.y + r.h / 2 + 1, on ? ST.btnA : ST.btn);
      // 今日の無料の福引きが残っていれば赤い点
      if (BTNS[i].key === 'gacha' && canFree(d)) { ctx.fillStyle = COL.shu; ctx.beginPath(); ctx.arc(r.x + r.w - 6, r.y + 6, 6, 0, 7); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    }
    // ---- 右：ステージの情報 ----
    this.drawInfo(ctx, vw - panelW - 16, 12, panelW, vh - 24, t);
    if (this.msgT > 0) {
      ctx.globalAlpha = Math.min(1, this.msgT * 2);
      roundRect(ctx, mx + mw / 2 - 200, vh - 80, 400, 40, 20); ctx.fillStyle = 'rgba(20,14,12,0.85)'; ctx.fill();
      drawText(ctx, this.msg, mx + mw / 2, vh - 59, ST.hint);
      ctx.globalAlpha = 1;
    }
  },
  star(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  },
  drawInfo(ctx, x, y, w, h, t) {
    const d = save.data, n = this.sel, m = META.stages[n], st = stageState(n), key = String(n);
    drawWashi(ctx, x, y, w, h);
    drawText(ctx, n === 0 ? 'れんしゅう' : n === 7 ? 'うらステージ' : `第${'一二三四五六'[n - 1]}の地　${m.area}`, x + 24, y + 34, ST.area);
    drawText(ctx, (LEVELS[n] && LEVELS[n].name) || m.name, x + 24, y + 64, n === 7 || ((LEVELS[n] && LEVELS[n].name) || m.name).length > 9 ? ST.nameS || (ST.nameS = { ...ST.name, size: 19 }) : ST.name);
    ctx.fillStyle = 'rgba(142,42,28,0.4)'; ctx.fillRect(x + 22, y + 86, w - 44, 1.5);
    // さるぼぼ（3つの枠）
    drawText(ctx, 'さるぼぼ', x + 24, y + 116, ST.label);
    const sb = d.sarubobo[key] || [false, false, false];
    for (let i = 0; i < 3; i++) {
      const sx = x + w - 130 + i * 38, sy = y + 116;
      roundRect(ctx, sx - 15, sy - 17, 30, 34, 7); ctx.fillStyle = 'rgba(90,60,40,0.15)'; ctx.fill(); ctx.strokeStyle = 'rgba(90,60,40,0.4)'; ctx.lineWidth = 1; ctx.stroke();
      if (sb[i]) drawSprite(ctx, 'item_sarubobo', 0, sx, sy + 14, { sx: 0.8, sy: 0.8 });
    }
    // タイム
    const bt = d.bestTime[key];
    drawText(ctx, 'ベストタイム', x + 24, y + 160, ST.label);
    drawText(ctx, fmtTime(bt), x + w - 24, y + 160, ST.val);
    drawText(ctx, '目標タイム', x + 24, y + 192, ST.label);
    drawText(ctx, fmtTime(m.target), x + w - 24, y + 192, ST.val);
    if (bt != null && bt <= m.target) { ctx.fillStyle = COL.kin; this.star(ctx, x + w - 112, y + 192, 9); drawText(ctx, '達成', x + w - 130, y + 214, ST.label); }
    drawText(ctx, 'クリア', x + 24, y + 234, ST.label);
    drawText(ctx, d.cleared.includes(n) ? '済' : '―', x + w - 24, y + 234, ST.val);
    // 遊ぶキャラ
    const cid = this.params.char || d.lastChar || 'leaf';
    drawSprite(ctx, `hero_${cid}_idle`, (t * 6) | 0, x + 60, y + 340, { sx: 1.3, sy: 1.3 });
    drawText(ctx, 'この仲間で出発', x + 110, y + 312, ST.area);
    // 出発ボタン
    const G = this.goRect; G.x = x + 100; G.y = y + h - 76; G.w = w - 124; G.h = 50;
    if (st.open && st.has) {
      drawTag(ctx, G.x, G.y, G.w, G.h, this.focus === 'map', false, 0.5 + 0.5 * Math.sin(t * 4));
      drawText(ctx, '出発！', G.x + G.w / 2, G.y + G.h / 2 + 1, ST.go);
    } else drawText(ctx, st.open ? '準備中' : 'まだ進めない', G.x + G.w / 2, G.y + G.h / 2, ST.wait);
    drawText(ctx, touch.enabled ? '場所をタップ・もう一度で出発' : '←→ 移動　Z 出発　↑ メニュー', x + w / 2, y + h - 12, ST.hintD || (ST.hintD = { size: 12, color: '#5a3a2a', align: 'center', baseline: 'middle' }));
  },
};
