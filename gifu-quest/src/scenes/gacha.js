import { game } from '../game.js';
import { input } from '../core/input.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { touch } from '../ui/touch.js';
import { drawSprite } from '../gfx/atlas.js';
import { drawText, drawWashi, drawTag, drawPatternBg, drawWrapped, roundRect, COL } from '../ui/text.js';
import { pull, canFree, WEAPONS, RARITIES, COST, PITY, MAX_LEVEL, weaponById, rarityInfo, weaponEffects, describeEffects } from '../systems/gacha.js';
import CHARS from '../data/characters.json';

// 福引き蔵：コインで武器を引く（ガラガラ抽選器）と、持ち物（装備）。仕様は docs/gacha.md
// params: { back?: 'worldmap' }
const TABS = [['draw', '福引き'], ['bag', '持ち物']];
const ST = {
  title: { size: 30, color: COL.kinLight, stroke: COL.sumi, strokeW: 6, align: 'center', baseline: 'middle', serif: true, shadow: true },
  tab: { size: 18, color: COL.kinari, stroke: COL.woodDark, strokeW: 3, align: 'center', baseline: 'middle' },
  tabA: { size: 18, color: '#fff8e6', stroke: COL.shuDark, strokeW: 3, align: 'center', baseline: 'middle' },
  btn: { size: 18, color: COL.kinari, stroke: COL.woodDark, strokeW: 3, align: 'center', baseline: 'middle' },
  btnA: { size: 18, color: '#fff8e6', stroke: COL.shuDark, strokeW: 3, align: 'center', baseline: 'middle' },
  sub: { size: 12, color: COL.kinari, stroke: COL.woodDark, strokeW: 2, align: 'center', baseline: 'middle' },
  coin: { size: 22, color: COL.kinLight, stroke: COL.sumi, strokeW: 4, align: 'left', baseline: 'middle' },
  info: { size: 15, color: COL.sumi, align: 'left', baseline: 'middle' },
  infoR: { size: 15, color: COL.shuDark, align: 'right', baseline: 'middle' },
  hint: { size: 14, color: COL.kinari, stroke: COL.sumi, strokeW: 3, align: 'center', baseline: 'middle', alpha: 0.9 },
  name: { size: 22, color: COL.sumi, align: 'left', baseline: 'middle', serif: true },
  nameC: { size: 26, color: '#fff8e6', stroke: COL.sumi, strokeW: 5, align: 'center', baseline: 'middle', serif: true, shadow: true },
  body: { size: 15, color: COL.sumi, align: 'left', baseline: 'top' },
  fx: { size: 15, color: COL.shuDark, align: 'left', baseline: 'top' },
  small: { size: 12, color: '#5a3a2a', align: 'center', baseline: 'middle' },
  cardName: { size: 13, color: COL.sumi, align: 'center', baseline: 'middle' },
  badge: { size: 13, color: '#fff', stroke: COL.shuDark, strokeW: 3, align: 'center', baseline: 'middle' },
  q: { size: 22, color: 'rgba(90,60,40,0.35)', align: 'center', baseline: 'middle' },
  rate: { size: 18, color: COL.sumi, align: 'left', baseline: 'middle' },
  back: { size: 16, color: COL.kinari, stroke: COL.woodDark, strokeW: 3, align: 'center', baseline: 'middle' },
};
const stars = (r) => '★'.repeat(r);
const R = () => ({ x: 0, y: 0, w: 0, h: 0 });
const inR = (r, p) => r.w > 0 && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const CHAR_NAME = (id) => (CHARS[id] ? CHARS[id].name : '');

export const gachaScene = {
  tab: 0, focus: 'body', sel: 0, bagSel: 0, t: 0,
  anim: null,           // { phase:'spin'|'drop'|'reveal', t, results, shown }
  msg: '', msgT: 0, showRates: false,
  tabRects: TABS.map(R), btnRects: [R(), R(), R(), R()], cells: WEAPONS.map(R), equipRect: R(), backRect: R(), closeRect: R(),
  enter(params) {
    this.params = params || {}; this.t = 0; this.anim = null; this.showRates = false; this.focus = 'body';
    const d = save.data;
    this.sel = canFree(d) ? 0 : 1;
    touch.show('menu');
    audio.bgm('map');
  },
  exit() { touch.hide(); },
  say(m) { this.msg = m; this.msgT = 2.2; },
  // 引く（mode: free|single|ten）
  doPull(mode) {
    const d = save.data;
    const r = pull(d, mode);
    if (!r.ok) {
      audio.sfx('cancel');
      this.say(r.reason === 'free_used' ? '今日の無料はもう引きました。また明日！' : `コインが足りません（${mode === 'ten' ? COST.ten : COST.single}枚いります）`);
      return;
    }
    save.write();
    audio.sfx('confirm');
    const top = Math.max(...r.results.map((x) => x.rarity));
    this.anim = { phase: 'spin', t: 0, results: r.results, top, shown: 0, flip: 0 };
  },
  skip() {
    const A = this.anim;
    if (!A) return;
    if (A.phase !== 'reveal') { A.phase = 'reveal'; A.t = 0; A.shown = A.results.length; A.flip = A.results.length; this.revealSfx(A); }
    else if (A.flip < A.results.length) A.flip = A.results.length;
    else { this.anim = null; this.sel = canFree(save.data) ? 0 : this.sel === 0 ? 1 : this.sel; }
  },
  revealSfx(A) { audio.sfx(A.top >= 4 ? 'clear' : A.top >= 3 ? 'sarubobo' : 'coin'); },
  setTab(i) { if (i === this.tab) return; this.tab = i; this.showRates = false; audio.sfx('select'); },

  update(dt) {
    this.t += dt;
    if (this.msgT > 0) this.msgT -= dt;
    if (this.t < 0.2) { touch.clearTap(); return; }
    const tp = touch.tap();
    const ok = input.pressed.confirm || input.pressed.jump;
    // ---- 演出中 ----
    if (this.anim) {
      const A = this.anim; A.t += dt;
      if (A.phase === 'spin') { if (((A.t * 12) | 0) !== (((A.t - dt) * 12) | 0)) audio.sfx('select'); if (A.t > 1.1) { A.phase = 'drop'; A.t = 0; } }
      else if (A.phase === 'drop') {
        const gap = A.results.length > 1 ? 0.14 : 0.1;
        const n = Math.min(A.results.length, Math.floor(A.t / gap) + 1);
        if (n > A.shown) { A.shown = n; audio.sfx('coin'); }
        if (A.t > gap * A.results.length + 0.7) { A.phase = 'reveal'; A.t = 0; this.revealSfx(A); }
      } else if (A.phase === 'reveal') {
        const k = Math.min(A.results.length, Math.floor(A.t / 0.12) + 1);
        if (k > A.flip) { A.flip = k; const r = A.results[k - 1]; if (r.rarity >= 3) audio.sfx(r.rarity >= 4 ? 'star' : 'checkpoint'); }
      }
      if (ok || tp || input.pressed.back) this.skip();
      return;
    }
    // ---- タップ ----
    if (tp) {
      if (inR(this.backRect, tp)) return this.back();
      if (this.showRates) { this.showRates = false; return; }
      for (let i = 0; i < TABS.length; i++) if (inR(this.tabRects[i], tp)) return this.setTab(i);
      if (this.tab === 0) {
        for (let i = 0; i < 4; i++) if (inR(this.btnRects[i], tp)) { this.sel = i; return this.press(i); }
      } else {
        for (let i = 0; i < WEAPONS.length; i++) if (inR(this.cells[i], tp)) { if (this.bagSel === i) return this.toggleEquip(); this.bagSel = i; audio.sfx('select'); return; }
        if (inR(this.equipRect, tp)) return this.toggleEquip();
      }
    }
    if (this.showRates) { if (ok || input.pressed.back) this.showRates = false; return; }
    if (input.pressed.back || input.pressed.pause) return this.back();
    // ---- キー ----
    if (this.focus === 'tabs') {
      if (input.pressed.left || input.pressed.right) this.setTab(1 - this.tab);
      if (input.pressed.down || ok) { this.focus = 'body'; audio.sfx('select'); }
      return;
    }
    if (this.tab === 0) {
      if (input.pressed.up) { if (this.sel === 0) this.focus = 'tabs'; else this.sel--; audio.sfx('select'); }
      if (input.pressed.down) { this.sel = Math.min(3, this.sel + 1); audio.sfx('select'); }
      if (input.pressed.right) this.setTab(1);
      if (ok) this.press(this.sel);
    } else {
      const cols = 6, n = WEAPONS.length;
      if (input.pressed.left) { if (this.bagSel % cols === 0) this.setTab(0); else { this.bagSel--; audio.sfx('select'); } }
      if (input.pressed.right && this.bagSel % cols < cols - 1) { this.bagSel = Math.min(n - 1, this.bagSel + 1); audio.sfx('select'); }
      if (input.pressed.up) { if (this.bagSel < cols) this.focus = 'tabs'; else this.bagSel -= cols; audio.sfx('select'); }
      if (input.pressed.down) { this.bagSel = Math.min(n - 1, this.bagSel + cols); audio.sfx('select'); }
      if (ok) this.toggleEquip();
    }
  },
  press(i) {
    if (i === 0) this.doPull('free');
    else if (i === 1) this.doPull('single');
    else if (i === 2) this.doPull('ten');
    else { this.showRates = true; audio.sfx('select'); }
  },
  toggleEquip() {
    const d = save.data, w = WEAPONS[this.bagSel];
    if (!d.weapons[w.id]) { audio.sfx('cancel'); this.say('まだ持っていない武器です'); return; }
    d.equipped = d.equipped === w.id ? null : w.id;
    save.write();
    audio.sfx('confirm');
    this.say(d.equipped ? `${w.name} を装備しました` : '装備を外しました');
  },
  back() { audio.sfx('cancel'); game.go(this.params.back === 'title' ? 'title' : 'worldmap', {}, 'wipe'); },

  // ---- 描画 ----
  draw(ctx, a, vw, vh) {
    const t = this.t, d = save.data;
    drawPatternBg(ctx, vw, vh, '#2a1a12', '#4a2e1c', t);
    this.drawKura(ctx, vw, vh, t);
    drawText(ctx, '福引き蔵', vw / 2, 30, ST.title);
    // コイン
    drawSprite(ctx, 'item_coin', (t * 8) | 0, 34, 44);
    drawText(ctx, `${d.coins}`, 52, 31, ST.coin);
    for (let i = 0; i < TABS.length; i++) {
      const r = this.tabRects[i]; r.w = 140; r.h = 38; r.x = vw / 2 - 150 + i * 160; r.y = 56;
      const on = i === this.tab;
      drawTag(ctx, r.x, r.y, r.w, r.h, on, false, this.focus === 'tabs' && on ? 0.5 + 0.5 * Math.sin(t * 5) : 0);
      drawText(ctx, TABS[i][1], r.x + r.w / 2, r.y + r.h / 2 + 1, on ? ST.tabA : ST.tab);
    }
    if (this.tab === 0) this.drawDraw(ctx, vw, vh, t, d); else this.drawBag(ctx, vw, vh, t, d);
    const bk = this.backRect; bk.w = 110; bk.h = 36; bk.x = 20; bk.y = vh - 46;
    drawTag(ctx, bk.x, bk.y, bk.w, bk.h, false, false);
    drawText(ctx, 'もどる', bk.x + bk.w / 2, bk.y + bk.h / 2 + 1, ST.back);
    if (!this.anim) drawText(ctx, touch.enabled ? 'ボタンをタップ' : (this.tab === 0 ? '↑↓ 選ぶ　Z 決定　X もどる' : '矢印 選ぶ　Z 装備する・外す　X もどる'), vw / 2 + 40, vh - 26, ST.hint);
    if (this.showRates) this.drawRates(ctx, vw, vh);
    if (this.anim) this.drawAnim(ctx, vw, vh, t);
    if (this.msgT > 0) {
      ctx.globalAlpha = Math.min(1, this.msgT * 2);
      roundRect(ctx, vw / 2 - 230, vh - 100, 460, 40, 20); ctx.fillStyle = 'rgba(20,14,12,0.88)'; ctx.fill();
      drawText(ctx, this.msg, vw / 2, vh - 79, ST.hint);
      ctx.globalAlpha = 1;
    }
  },
  // 蔵の梁と、のれん
  drawKura(ctx, vw, vh, t) {
    ctx.fillStyle = 'rgba(30,18,10,0.55)';
    for (let x = 60; x < vw; x += 180) ctx.fillRect(x, 0, 14, vh);
    ctx.fillStyle = '#3a2414'; ctx.fillRect(0, 100, vw, 10);
    ctx.fillStyle = 'rgba(255,200,120,0.06)';
    ctx.beginPath(); ctx.ellipse(vw * 0.3, vh * 0.55, 260, 180, 0, 0, 7); ctx.fill();
  },
  // ガラガラ抽選器（八角形の箱が回る）
  drawDrum(ctx, cx, cy, size, rot, t) {
    // 台
    ctx.fillStyle = '#4a2c18';
    ctx.beginPath(); ctx.moveTo(cx - size * 0.9, cy + size * 1.05); ctx.lineTo(cx - size * 0.35, cy); ctx.lineTo(cx - size * 0.25, cy); ctx.lineTo(cx - size * 0.6, cy + size * 1.05); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + size * 0.9, cy + size * 1.05); ctx.lineTo(cx + size * 0.35, cy); ctx.lineTo(cx + size * 0.25, cy); ctx.lineTo(cx + size * 0.6, cy + size * 1.05); ctx.fill();
    roundRect(ctx, cx - size * 1.1, cy + size * 1.0, size * 2.2, size * 0.18, 6); ctx.fillStyle = '#5a3820'; ctx.fill();
    // 受け皿
    roundRect(ctx, cx + size * 0.2, cy + size * 0.78, size * 0.9, size * 0.2, 8); ctx.fillStyle = '#7a1e14'; ctx.fill();
    // 八角形の箱
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    const r = size * 0.75;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath();
    const g = ctx.createLinearGradient(-r, -r, r, r); g.addColorStop(0, '#d8483a'); g.addColorStop(1, '#7a1a12');
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#e8c060'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(232,192,96,0.6)';
    for (let i = 0; i < 4; i++) { const a = Math.PI / 8 + i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(-Math.cos(a) * r, -Math.sin(a) * r); ctx.stroke(); }
    ctx.fillStyle = '#e8c060'; ctx.beginPath(); ctx.arc(0, 0, size * 0.16, 0, 7); ctx.fill();
    drawText(ctx, '福', 0, 1, { size: size * 0.2, color: COL.shuDark, align: 'center', baseline: 'middle', serif: true });
    ctx.restore();
    // ハンドル
    const ha = rot * 1.0;
    ctx.strokeStyle = '#3a2414'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ha) * size * 0.55, cy + Math.sin(ha) * size * 0.55); ctx.stroke();
    ctx.fillStyle = '#c89a50'; ctx.beginPath(); ctx.arc(cx + Math.cos(ha) * size * 0.55, cy + Math.sin(ha) * size * 0.55, 7, 0, 7); ctx.fill();
  },
  drawDraw(ctx, vw, vh, t, d) {
    const left = 30, panelW = 340, px = vw - panelW - 30;
    const cx = left + (px - left) / 2, cy = 270, size = Math.min(150, (px - left) * 0.3);
    this.drawDrum(ctx, cx, cy, size, Math.sin(t * 0.8) * 0.06, t);
    // 玉の色見本（並・上・特上・極）
    RARITIES.forEach((r, i) => {
      const x = cx - 105 + i * 70, y = vh - 92;
      ball(ctx, x, y, 11, r.color, r.r === 4 ? 0.6 + 0.4 * Math.sin(t * 4) : 0);
      drawText(ctx, r.name, x, y + 24, { ...ST.sub, size: 13 });
    });
    // 右のパネル
    drawWashi(ctx, px, 108, panelW, vh - 170, { r: 10 });
    const free = canFree(d);
    const labels = [
      [free ? '今日の無料で 1回' : '無料は明日また', free ? '毎日1回 無料で引けます' : '0時に戻ります'],
      [`1回引く`, `コイン ${COST.single}枚`],
      [`10回引く`, `コイン ${COST.ten}枚・特上以上1つ確定`],
      ['確率を見る', '並・上・特上・極の出る割合'],
    ];
    const dis = [!free, d.coins < COST.single, d.coins < COST.ten, false];
    for (let i = 0; i < 4; i++) {
      const r = this.btnRects[i]; r.x = px + 22; r.w = panelW - 44; r.h = i === 3 ? 40 : 54; r.y = 126 + i * 66;
      const on = this.focus === 'body' && this.sel === i;
      drawTag(ctx, r.x, r.y, r.w, r.h, on, dis[i], on ? 0.5 + 0.5 * Math.sin(t * 5) : 0);
      drawText(ctx, labels[i][0], r.x + r.w / 2, r.y + (i === 3 ? r.h / 2 + 1 : 20), on ? ST.btnA : ST.btn);
      if (i < 3) drawText(ctx, labels[i][1], r.x + r.w / 2, r.y + 40, ST.sub);
      if (i === 0 && free) { ctx.fillStyle = COL.shu; ctx.beginPath(); ctx.arc(r.x + r.w - 10, r.y + 10, 7, 0, 7); ctx.fill(); }
    }
    const iy = 126 + 4 * 66 - 6;
    drawText(ctx, `極まで あと ${PITY - d.gacha.pity}回で確定`, px + 26, iy, ST.info);
    const owned = Object.keys(d.weapons).length;
    drawText(ctx, `集めた武器 ${owned} / ${WEAPONS.length}`, px + panelW - 26, iy, ST.infoR);
    const eq = d.equipped && weaponById(d.equipped);
    drawText(ctx, eq ? `装備中：${eq.name}` : '装備中：なし', px + 26, iy + 24, ST.info);
  },
  drawRates(ctx, vw, vh) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, vw, vh);
    const w = 520, h = 340, x = vw / 2 - w / 2, y = vh / 2 - h / 2;
    drawWashi(ctx, x, y, w, h, { r: 12 });
    drawText(ctx, '出る割合', vw / 2, y + 34, { ...ST.name, align: 'center' });
    RARITIES.forEach((r, i) => {
      const yy = y + 80 + i * 40, n = WEAPONS.filter((q) => q.rarity === r.r).length;
      ball(ctx, x + 50, yy, 11, r.color, 0);
      drawText(ctx, `${r.name}　${stars(r.r)}`, x + 72, yy, ST.rate);
      drawText(ctx, `${(r.rate * 100).toFixed(0)}%　（${n}種・1種あたり ${(r.rate / n * 100).toFixed(2)}%）`, x + w - 30, yy, { ...ST.rate, align: 'right', size: 15 });
    });
    const notes = [`10回引くと、特上以上が少なくとも1つ出ます。`, `${PITY}回のうちに極が出なければ、${PITY}回目は極になります。`, `同じ武器はレベルが上がります（最大Lv${MAX_LEVEL}）。最大のあとはコインに替わります。`];
    notes.forEach((s, i) => drawText(ctx, s, x + 30, y + 248 + i * 24, { ...ST.info, size: 14 }));
  },
  drawBag(ctx, vw, vh, t, d) {
    const px = 24, py = 108, gw = Math.min(560, vw * 0.52), ph = vh - py - 60;
    drawWashi(ctx, px, py, gw, ph, { r: 10 });
    const cols = 6, cw = (gw - 30) / cols, chh = Math.min(66, (ph - 24) / 5);
    WEAPONS.forEach((w, i) => {
      const c = this.cells[i], col = i % cols, row = (i / cols) | 0;
      c.x = px + 15 + col * cw + 3; c.y = py + 12 + row * chh + 3; c.w = cw - 6; c.h = chh - 6;
      const own = d.weapons[w.id], on = i === this.bagSel, ri = rarityInfo(w.rarity);
      roundRect(ctx, c.x, c.y, c.w, c.h, 8);
      ctx.fillStyle = own ? hexA(ri.color, 0.22) : 'rgba(90,60,40,0.07)'; ctx.fill();
      ctx.lineWidth = on ? 3 : 1.5; ctx.strokeStyle = on && this.focus === 'body' ? COL.shu : own ? ri.color : 'rgba(90,60,40,0.2)'; ctx.stroke();
      if (own) {
        drawSprite(ctx, `weapon_${w.id}`, 0, c.x + c.w / 2, c.y + c.h / 2 - 4, { sx: 0.95, sy: 0.95 });
        drawText(ctx, `Lv${own.lv}`, c.x + c.w - 6, c.y + c.h - 10, { ...ST.small, align: 'right', color: COL.shuDark });
        drawText(ctx, stars(w.rarity), c.x + 6, c.y + 10, { ...ST.small, align: 'left', size: 10, color: ri.color, stroke: '#3a2216', strokeW: 2 });
        if (d.equipped === w.id) drawText(ctx, '装備', c.x + 18, c.y + c.h - 10, ST.badge);
      } else drawText(ctx, '？', c.x + c.w / 2, c.y + c.h / 2, ST.q);
    });
    // 詳しく
    const w = WEAPONS[this.bagSel], own = d.weapons[w.id], ri = rarityInfo(w.rarity);
    const x = px + gw + 16, dw = vw - x - 24;
    drawWashi(ctx, x, py, dw, ph, { r: 10 });
    if (!own) {
      drawText(ctx, '？？？', x + dw / 2, py + 60, { ...ST.name, align: 'center' });
      drawText(ctx, `${ri.name}　${stars(w.rarity)}`, x + dw / 2, py + 96, { ...ST.info, align: 'center', color: ri.color === '#d8d2c4' ? '#8a8070' : ri.color });
      drawWrapped(ctx, 'まだ持っていません。福引きで手に入ります。', x + 24, py + 130, dw - 48, ST.body, 22);
      this.equipRect.w = 0;
      return;
    }
    roundRect(ctx, x + 18, py + 18, 76, 76, 12); ctx.fillStyle = hexA(ri.color, 0.25); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = ri.color; ctx.stroke();
    drawSprite(ctx, `weapon_${w.id}`, 0, x + 56, py + 56, { sx: 1.45, sy: 1.45 });
    drawText(ctx, w.name, x + 108, py + 40, { ...ST.name, size: Math.min(22, (dw - 120) / Math.max(1, w.name.length) * 1.05) });
    drawText(ctx, `${ri.name} ${stars(w.rarity)}　Lv${own.lv}/${MAX_LEVEL}`, x + 108, py + 72, { ...ST.info, color: w.rarity === 1 ? '#7a7060' : shadeText(ri.color) });
    drawWrapped(ctx, w.desc, x + 22, py + 108, dw - 44, ST.body, 22);
    const ch = d.lastChar || 'leaf';
    const fx = describeEffects(weaponEffects(w.id, own.lv, ch));
    drawText(ctx, `${CHAR_NAME(ch)}が持つと：`, x + 22, py + 160, { ...ST.info, size: 14 });
    fx.forEach((s, i) => drawText(ctx, '・' + s, x + 22, py + 178 + i * 21, ST.fx));
    drawText(ctx, `得意なキャラ：${CHAR_NAME(w.affinity)}（効果1.25倍）`, x + 22, py + 186 + fx.length * 21, { ...ST.info, size: 13, baseline: 'top' });
    const er = this.equipRect; er.w = Math.min(200, dw - 40); er.h = 42; er.x = x + dw / 2 - er.w / 2; er.y = py + ph - 58;
    const eq = d.equipped === w.id;
    drawTag(ctx, er.x, er.y, er.w, er.h, true, false, 0.5 + 0.5 * Math.sin(t * 4));
    drawText(ctx, eq ? '外す' : '装備する', er.x + er.w / 2, er.y + er.h / 2 + 1, ST.btnA);
  },
  // 演出：回る → 玉が出る → カードがめくれる
  drawAnim(ctx, vw, vh, t) {
    const A = this.anim;
    ctx.fillStyle = 'rgba(10,6,4,0.72)'; ctx.fillRect(0, 0, vw, vh);
    const cx = vw / 2, cy = 230, size = 130;
    if (A.phase === 'spin' || A.phase === 'drop') {
      const spin = A.phase === 'spin' ? A.t * A.t * 9 : 1.21 * 9 + A.t * 2;
      this.drawDrum(ctx, cx, cy, size, spin, t);
      // 出てくる玉
      for (let i = 0; i < A.shown; i++) {
        const r = A.results[i], k = Math.min(1, (A.t - i * (A.results.length > 1 ? 0.14 : 0.1)) / 0.4);
        const bx = cx + size * 0.35 + k * (size * 0.3 + (i % 5) * 26), by = cy + size * 0.62 + Math.sin(k * Math.PI) * -30 + ((i / 5) | 0) * 26 + 20;
        ball(ctx, bx, by, 12, rarityInfo(r.rarity).color, r.rarity >= 4 ? 1 : r.rarity >= 3 ? 0.5 : 0);
      }
      if (A.phase === 'drop' && A.top >= 3) {
        const g = Math.max(0, 1 - Math.abs(A.t - 0.5) * 2) * (A.top >= 4 ? 0.7 : 0.35);
        ctx.fillStyle = A.top >= 4 ? `rgba(255,230,140,${g})` : `rgba(255,160,130,${g})`; ctx.fillRect(0, 0, vw, vh);
      }
      drawText(ctx, 'ガラガラ…', cx, vh - 60, ST.hint);
      return;
    }
    // 結果
    const n = A.results.length;
    if (A.top >= 4) { // 極：金の光の筋
      ctx.save(); ctx.translate(cx, vh / 2); ctx.rotate(t * 0.3); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.fillStyle = 'rgba(255,210,90,0.08)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(vw, -60); ctx.lineTo(vw, 60); ctx.fill(); }
      ctx.restore();
    }
    if (n === 1) {
      this.card(ctx, A.results[0], cx, vh / 2 - 10, 230, 300, Math.min(1, A.t / 0.35), t, true);
    } else {
      // 5×2 の並び。画面の高さに収まる大きさにする
      const cw = Math.min(150, (vw - 80) / 5 - 12, ((vh - 90) / 2 - 12) / 1.22), chh = cw * 1.22;
      const top = (vh - 40) / 2 - (chh * 2 + 12) / 2;
      for (let i = 0; i < n; i++) {
        const col = i % 5, row = (i / 5) | 0;
        const x = cx + (col - 2) * (cw + 12), y = top + row * (chh + 12) + chh / 2;
        this.card(ctx, A.results[i], x, y, cw, chh, i < A.flip ? Math.max(0, Math.min(1, (A.t - i * 0.12) / 0.3)) : 0, t, false);
      }
    }
    if (A.flip >= n) drawText(ctx, touch.enabled ? 'タップで閉じる' : 'Z で閉じる', cx, vh - 24, ST.hint);
  },
  card(ctx, r, x, y, w, h, k, t, big) {
    const wpn = weaponById(r.id), ri = rarityInfo(r.rarity);
    ctx.save(); ctx.translate(x, y);
    // めくり：前半は裏が細くなり、後半は表が広がる
    const front = k >= 0.5;
    ctx.scale(Math.max(0.02, front ? (k - 0.5) * 2 : 1 - k * 2), 1);
    if (!front) { // 裏
      roundRect(ctx, -w / 2, -h / 2, w, h, 12); ctx.fillStyle = '#5a2a1a'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = COL.kin; ctx.stroke();
      drawText(ctx, '福', 0, 0, { size: w * 0.3, color: COL.kin, align: 'center', baseline: 'middle', serif: true });
      ctx.restore(); return;
    }
    ctx.shadowColor = ri.glow; ctx.shadowBlur = r.rarity >= 3 ? 18 + 8 * Math.sin(t * 5) : 6;
    roundRect(ctx, -w / 2, -h / 2, w, h, 12);
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, '#fbf3e0'); g.addColorStop(1, hexMix(ri.color, '#efe4cc', 0.35));
    ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = r.rarity >= 4 ? 5 : 3; ctx.strokeStyle = ri.color; ctx.stroke();
    const sc = big ? 2.6 : w / 70;
    drawSprite(ctx, `weapon_${wpn.id}`, 0, 0, -h * 0.12, { sx: sc, sy: sc });
    drawText(ctx, `${ri.name} ${stars(r.rarity)}`, 0, -h / 2 + (big ? 26 : 16), { ...ST.small, size: big ? 18 : 12, color: r.rarity === 1 ? '#7a7060' : shadeText(ri.color) });
    drawText(ctx, wpn.name, 0, h * 0.25, { ...ST.cardName, size: big ? 20 : Math.min(13, w / Math.max(6, wpn.name.length) * 1.1) });
    const tag = r.refund ? `+${r.refund}コイン` : r.isNew ? 'NEW' : `Lv${r.level}`;
    drawText(ctx, tag, 0, h / 2 - (big ? 26 : 14), { ...ST.badge, size: big ? 18 : 12, stroke: r.isNew ? COL.shuDark : '#3a5a8a' });
    if (big) drawText(ctx, describeEffects(weaponEffects(wpn.id, r.level, save.data.lastChar)).join('　'), 0, h / 2 + 22, ST.hint);
    ctx.restore();
  },
};

function ball(ctx, x, y, r, color, glow) {
  if (glow > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3); g.addColorStop(0, `rgba(255,240,180,${0.6 * glow})`); g.addColorStop(1, 'rgba(255,240,180,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3, 0, 7); ctx.fill(); ctx.restore(); }
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, color); g.addColorStop(1, hexMix(color, '#000000', 0.35));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(40,20,10,0.6)'; ctx.stroke();
}
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
function hexMix(a, b, k) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const m = (s) => Math.round(((A >> s) & 255) * (1 - k) + ((B >> s) & 255) * k);
  return `rgb(${m(16)},${m(8)},${m(0)})`;
}
// 明るい色を和紙の上でも読める濃さに
function shadeText(hex) { return hexMix(hex, '#000000', 0.35); }
