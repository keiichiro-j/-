import { game } from '../game.js';
import { input } from '../core/input.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { touch } from '../ui/touch.js';
import { drawSprite } from '../gfx/atlas.js';
import { drawHeroDressed } from '../art/heroGear.js';
import { drawText, drawWashi, drawTag, drawPatternBg, drawOrb, roundRect, fmtTime, font, COL } from '../ui/text.js';
import { toast } from '../ui/toast.js';
import { ACHIEVEMENTS, progressOf, gotCount, progress } from '../systems/achievements.js';
import { missionDef, missionText, secondsToReset, doneCount } from '../systems/missions.js';
import META from '../data/stages.json';
import { cloud } from '../core/cloud.js';
import RUSH from '../data/bossrush.json';
import CHARS from '../data/characters.json';
// 記録（称号・毎日のお題・腕試し）。仕様は docs/content.md。見た目は図鑑（zukan.js）に合わせる
// params: { back?: 'worldmap'|'title', tab?: 0|1|2 }
const TABS = [['titles', '称号'], ['missions', '毎日のお題'], ['rush', '腕試し'], ['rank', '番付']];
const ST = {
  title: { size: 30, color: COL.kinLight, stroke: COL.sumi, strokeW: 6, align: 'center', baseline: 'middle', serif: true, shadow: true },
  tab: { size: 18, color: COL.kinari, stroke: COL.woodDark, strokeW: 3, align: 'center', baseline: 'middle' },
  tabA: { size: 18, color: '#fff8e6', stroke: COL.shuDark, strokeW: 3, align: 'center', baseline: 'middle' },
  coin: { size: 18, color: COL.kinLight, stroke: COL.sumi, strokeW: 4, align: 'right', baseline: 'middle' },
  count: { size: 16, color: COL.shuDark, align: 'right', baseline: 'middle' },
  countL: { size: 16, color: COL.shuDark, align: 'left', baseline: 'middle' },
  name: { size: 17, color: COL.sumi, align: 'left', baseline: 'middle' },
  nameOff: { size: 17, color: '#7a6a5a', align: 'left', baseline: 'middle' },
  desc: { size: 13, color: '#5a3a2a', align: 'left', baseline: 'middle', weight: 'normal' },
  descS: { size: 12, color: '#5a3a2a', align: 'left', baseline: 'middle', weight: 'normal' },
  reward: { size: 14, color: COL.kinDark, align: 'right', baseline: 'middle' },
  prog: { size: 13, color: '#7a5a3a', align: 'right', baseline: 'middle' },
  seal: { size: 16, color: '#fff4e0', align: 'center', baseline: 'middle', serif: true },
  sealL: { size: 22, color: '#fff4e0', align: 'center', baseline: 'middle', serif: true },
  mText: { size: 20, color: COL.sumi, align: 'left', baseline: 'middle' },
  mTextS: { size: 17, color: COL.sumi, align: 'left', baseline: 'middle' },
  mProg: { size: 15, color: '#5a3a2a', align: 'right', baseline: 'middle' },
  mReward: { size: 18, color: COL.kinDark, align: 'right', baseline: 'middle' },
  label: { size: 16, color: '#5a3a2a', align: 'left', baseline: 'middle' },
  val: { size: 20, color: COL.sumi, align: 'right', baseline: 'middle' },
  note: { size: 13, color: '#5a3a2a', align: 'left', baseline: 'middle', weight: 'normal' },
  head: { size: 20, color: COL.shuDark, align: 'left', baseline: 'middle', serif: true },
  bossName: { size: 12, color: COL.sumi, align: 'center', baseline: 'middle' },
  big: { size: 22, color: '#fff8e6', stroke: COL.shuDark, strokeW: 4, align: 'center', baseline: 'middle' },
  lock: { size: 18, color: '#7a6a5a', align: 'center', baseline: 'middle' },
  lockS: { size: 14, color: '#7a6a5a', align: 'center', baseline: 'middle' },
  hint: { size: 14, color: COL.kinari, stroke: COL.sumi, strokeW: 3, align: 'center', baseline: 'middle', alpha: 0.9 },
  back: { size: 16, color: COL.kinari, stroke: COL.woodDark, strokeW: 3, align: 'center', baseline: 'middle' },
};
const rect = () => ({ x: 0, y: 0, w: 0, h: 0 });
const inR = (r, p) => r.w > 0 && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const COLS = 2, ROW_H = 52;
const KANJI = '一二三四五六';

export const recordsScene = {
  tab: 0, sel: 0, scroll: 0, t: 0, vis: 12,
  tabRects: TABS.map(rect), cells: ACHIEVEMENTS.map(rect), backRect: rect(), upRect: rect(), downRect: rect(), goRect: rect(),
  enter(params) {
    this.params = params || {}; this.t = 0; this.sel = 0; this.scroll = 0;
    this.tab = Math.max(0, Math.min(TABS.length - 1, this.params.tab | 0));
    progress.check();   // 日付が変わっていればお題を入れ替え、得られる称号を調べる
    touch.show('menu');
    audio.bgm('map');
  },
  exit() { touch.hide(); },
  setTab(i) { if (i === this.tab) return; this.tab = i; this.sel = 0; this.scroll = 0; audio.sfx('select'); if (i === 3) this.loadRank(); },
  // ---- 番付（ランキング）：Google でつながっている時だけ。ステージごとの上位10人（ニックネームとタイム）----
  rankStages() { const d = save.data, all6 = [1, 2, 3, 4, 5, 6].every((n) => d.cleared.includes(n)); return [1, 2, 3, 4, 5, 6, 7, 8].filter((n) => n <= 6 || (n === 7 && save.saruboboCount() >= 18) || (n === 8 && all6)); },
  loadRank() {
    this.rankCache = this.rankCache || {};
    const list = this.rankStages(); if (this.rankSel == null || !list.includes(this.rankSel)) this.rankSel = list[0];
    const st = this.rankSel;
    if (!cloud.recorder || (this.rankCache[st] && this.rankCache[st].state !== 'error')) return;
    this.rankCache[st] = { state: 'loading' };
    cloud.ranking(st).then((r) => { this.rankCache[st] = r && r.ok ? { state: 'ok', ...r } : { state: 'error' }; });
  },
  get rushOpen() { return save.data.seenEnding; },
  update(dt) {
    this.t += dt;
    if (this.t < 0.2) { touch.clearTap(); return; }
    const n = ACHIEVEMENTS.length;
    if (input.pressed.left) this.setTab((this.tab + TABS.length - 1) % TABS.length);
    if (input.pressed.right) this.setTab((this.tab + 1) % TABS.length);
    if (this.tab === 0) {
      if (input.pressed.down) { this.sel = Math.min(n - 1, this.sel + COLS); audio.sfx('select'); }
      if (input.pressed.up) { this.sel = Math.max(0, this.sel - COLS); audio.sfx('select'); }
    }
    if (this.tab === 2 && (input.pressed.confirm || input.pressed.jump)) return this.startRush();
    if (this.tab === 3) {
      const L = this.rankStages(), i = L.indexOf(this.rankSel);
      if (input.pressed.down && i < L.length - 1) { this.rankSel = L[i + 1]; audio.sfx('select'); this.loadRank(); }
      if (input.pressed.up && i > 0) { this.rankSel = L[i - 1]; audio.sfx('select'); this.loadRank(); }
    }
    const tp = touch.tap();
    if (tp) {
      if (inR(this.backRect, tp)) return this.back();
      for (let i = 0; i < TABS.length; i++) if (inR(this.tabRects[i], tp)) return this.setTab(i);
      if (this.tab === 0) {
        if (inR(this.upRect, tp)) { this.scrollBy(-1); return; }
        if (inR(this.downRect, tp)) { this.scrollBy(1); return; }
        for (let i = 0; i < n; i++) if (inR(this.cells[i], tp)) { this.sel = i; audio.sfx('select'); }
      }
      if (this.tab === 2 && inR(this.goRect, tp)) return this.startRush();
      if (this.tab === 3 && this.rankRects) for (const [st, R] of this.rankRects) if (inR(R, tp)) { this.rankSel = st; audio.sfx('select'); this.loadRank(); }
    }
    if (input.pressed.back || input.pressed.pause) this.back();
  },
  // 1ページ分（見えている行）ずつ動かす
  scrollBy(dir) {
    const rows = Math.ceil(ACHIEVEMENTS.length / COLS), visRows = Math.max(1, this.vis / COLS);
    const top = Math.max(0, Math.min(rows - visRows, this.scroll / COLS + dir * visRows));
    this.scroll = top * COLS; this.sel = Math.min(ACHIEVEMENTS.length - 1, this.scroll);
    audio.sfx('select');
  },
  startRush() {
    if (!this.rushOpen) { audio.sfx('cancel'); return; }
    audio.sfx('confirm');
    game.go('bossrush', { char: save.data.lastChar || 'leaf' }, 'iris');
  },
  back() { audio.sfx('cancel'); game.go(this.params.back === 'title' ? 'title' : 'worldmap', {}, 'wipe'); },

  draw(ctx, a, vw, vh) {
    const t = this.t, d = save.data;
    drawPatternBg(ctx, vw, vh, '#2a1e1a', '#4a2e24', t);
    drawText(ctx, '記録', vw / 2, 32, ST.title);
    // 持ちコイン
    drawSprite(ctx, 'item_coin', (t * 8) | 0, vw - 130, 44, { sx: 0.9, sy: 0.9 });
    drawText(ctx, String(d.coins), vw - 30, 33, ST.coin);
    for (let i = 0; i < TABS.length; i++) {
      const r = this.tabRects[i]; r.w = 140; r.h = 40; r.x = vw / 2 - (TABS.length * 152 - 12) / 2 + i * 152; r.y = 58;
      drawTag(ctx, r.x, r.y, r.w, r.h, i === this.tab, i === 2 && !this.rushOpen);
      drawText(ctx, TABS[i][1], r.x + r.w / 2, r.y + r.h / 2 + 1, i === this.tab ? ST.tabA : ST.tab);
    }
    // 今日のお題が残っていれば、タブに赤い点
    if (d.missions.list.length && doneCount(d) < d.missions.list.length) { const r = this.tabRects[1]; ctx.fillStyle = COL.shu; ctx.beginPath(); ctx.arc(r.x + r.w - 8, r.y + 7, 6, 0, 7); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    const px = 30, py = 110, pw = vw - 60, ph = vh - py - 56;
    drawWashi(ctx, px, py, pw, ph);
    for (const c of this.cells) c.w = 0;
    this.upRect.w = this.downRect.w = this.goRect.w = 0;
    if (this.tab === 0) this.drawTitles(ctx, px, py, pw, ph, d, t);
    else if (this.tab === 1) this.drawMissions(ctx, px, py, pw, ph, d, t);
    else if (this.tab === 2) this.drawRush(ctx, px, py, pw, ph, d, t);
    else this.drawRank(ctx, px, py, pw, ph, d, t);
    const bk = this.backRect; bk.w = 110; bk.h = 38; bk.x = 24; bk.y = vh - 46;
    drawTag(ctx, bk.x, bk.y, bk.w, bk.h, false, false);
    drawText(ctx, 'もどる', bk.x + bk.w / 2, bk.y + bk.h / 2 + 1, ST.back);
    if (this.tab === 0) {
      const u = this.upRect, dn = this.downRect;
      dn.w = u.w = 64; dn.h = u.h = 38; dn.x = vw - 24 - dn.w; u.x = dn.x - 10 - u.w; u.y = dn.y = vh - 46;
      const rows = Math.ceil(ACHIEVEMENTS.length / COLS), canUp = this.scroll > 0, canDn = this.scroll / COLS + this.vis / COLS < rows;
      drawTag(ctx, u.x, u.y, u.w, u.h, false, !canUp); drawText(ctx, '▲', u.x + u.w / 2, u.y + u.h / 2 + 1, ST.back);
      drawTag(ctx, dn.x, dn.y, dn.w, dn.h, false, !canDn); drawText(ctx, '▼', dn.x + dn.w / 2, dn.y + dn.h / 2 + 1, ST.back);
    }
    const hint = touch.enabled ? 'タブ・項目をタップ' : this.tab === 0 ? '←→ タブ　↑↓ 選ぶ　X もどる' : this.tab === 2 ? '←→ タブ　Z 挑む　X もどる' : this.tab === 3 ? '←→ タブ　↑↓ ステージ　X もどる' : '←→ タブ　X もどる';
    drawText(ctx, hint, vw / 2, vh - 26, ST.hint);
    toast.draw(ctx, vw, vh, 8, true);
  },

  drawRank(ctx, px, py, pw, ph, d, t) {
    const RS = { size: 16, color: COL.sumi, align: 'left', baseline: 'middle' };
    if (!cloud.available || !cloud.signedIn || !cloud.recorder) {
      const msg = !cloud.available ? '番付は、Google Apps Script で公開したゲームを Google アカウントで遊ぶと参加できます。'
        : !cloud.signedIn ? 'Google にログインしていないため、番付に参加できません。' : '作った人の記録係（スプレッドシート）がまだつながっていません。';
      drawText(ctx, msg, px + pw / 2, py + ph / 2, { ...RS, align: 'center', color: '#5a3a2a' });
      return;
    }
    if (this.rankSel == null) this.loadRank();
    // 左：ステージの一覧
    const L = this.rankStages(); this.rankRects = [];
    L.forEach((st, i) => {
      const R = { x: px + 18, y: py + 18 + i * 36, w: 200, h: 30 }; this.rankRects.push([st, R]);
      const on = st === this.rankSel;
      roundRect(ctx, R.x, R.y, R.w, R.h, 8); ctx.fillStyle = on ? 'rgba(208,69,47,0.18)' : 'rgba(90,60,40,0.07)'; ctx.fill();
      if (on) { ctx.strokeStyle = COL.shu; ctx.lineWidth = 2; ctx.stroke(); }
      drawText(ctx, (META.stages[st] && META.stages[st].short) || String(st), R.x + 12, R.y + R.h / 2 + 1, on ? { ...RS, color: COL.shuDark } : RS);
    });
    // 右：上位10人
    const x = px + 250, w = pw - 270, c = (this.rankCache || {})[this.rankSel];
    drawText(ctx, `${(META.stages[this.rankSel] && META.stages[this.rankSel].name) || ''}　番付`, x, py + 32, { size: 20, color: COL.shuDark, align: 'left', baseline: 'middle', serif: true });
    if (!c || c.state === 'loading') { drawText(ctx, '読みこみ中…', x, py + 80, RS); return; }
    if (c.state === 'error') { drawText(ctx, '読みこめませんでした', x, py + 80, RS); return; }
    if (!c.list.length) { drawText(ctx, 'まだ誰もクリアしていません。一番乗りをめざそう！', x, py + 80, RS); return; }
    c.list.forEach((r, i) => {
      const y = py + 70 + i * 26;
      if (r.me) { ctx.fillStyle = 'rgba(224,180,72,0.28)'; ctx.fillRect(x - 6, y - 12, w, 24); }
      const medal = ['#e0b448', '#b8c0c8', '#c88a4a'][i];
      if (medal) { ctx.fillStyle = medal; ctx.beginPath(); ctx.arc(x + 10, y, 9, 0, Math.PI * 2); ctx.fill(); }
      drawText(ctx, String(r.rank), x + 10, y + 1, { ...RS, align: 'center', size: 14 });
      drawText(ctx, r.nickname + (r.me ? '（あなた）' : ''), x + 34, y + 1, RS);
      drawText(ctx, fmtTime(r.time), x + w - 16, y + 1, { ...RS, align: 'right' });
    });
    const me = c.me;
    drawText(ctx, me ? `あなたは ${me.rank} 位（${c.total}人中）　ベスト ${fmtTime(me.time)}` : `まだ記録がありません（${c.total}人が参加中）`, x, py + ph - 24, { ...RS, color: COL.shuDark });
  },

  // ---- 称号 ----
  drawTitles(ctx, px, py, pw, ph, d, t) {
    const list = ACHIEVEMENTS, got = gotCount(d);
    let earned = 0; for (const a of list) if (d.achievements[a.id]) earned += a.reward;
    drawText(ctx, `得た称号　${got} / ${list.length}`, px + 30, py + 26, ST.countL);
    drawText(ctx, `もらったコイン ${earned}枚`, px + pw - 30, py + 26, ST.count);
    const top = py + 46, visRows = Math.max(1, Math.floor((ph - 58) / ROW_H));
    this.vis = visRows * COLS;
    const selRow = (this.sel / COLS) | 0, scRow = this.scroll / COLS;
    if (selRow < scRow) this.scroll = selRow * COLS;
    if (selRow >= scRow + visRows) this.scroll = (selRow - visRows + 1) * COLS;
    const colW = (pw - 40) / COLS;
    const ctxA = progress.ctx();
    for (let k = 0; k < this.vis; k++) {
      const i = this.scroll + k; if (i >= list.length) break;
      const A = list[i], c = this.cells[i], col = k % COLS, row = (k / COLS) | 0;
      c.x = px + 20 + col * colW + 4; c.y = top + row * ROW_H; c.w = colW - 8; c.h = ROW_H - 6;
      const on = i === this.sel, has = !!d.achievements[A.id];
      roundRect(ctx, c.x, c.y, c.w, c.h, 8); ctx.fillStyle = on ? 'rgba(208,69,47,0.16)' : has ? 'rgba(224,180,72,0.16)' : 'rgba(90,60,40,0.06)'; ctx.fill();
      if (on) { ctx.strokeStyle = COL.shu; ctx.lineWidth = 2; ctx.stroke(); }
      // 印：得た＝朱の判子、まだ＝薄い枠
      const sx = c.x + 24, sy = c.y + c.h / 2;
      if (has) { ctx.save(); ctx.translate(sx, sy); ctx.rotate(-0.12); ctx.fillStyle = COL.shu; ctx.fillRect(-15, -15, 30, 30); ctx.strokeStyle = '#fff4e0'; ctx.lineWidth = 1.2; ctx.strokeRect(-12, -12, 24, 24); drawText(ctx, '得', 0, 1, ST.seal); ctx.restore(); }
      else { ctx.strokeStyle = 'rgba(90,60,40,0.45)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.strokeRect(sx - 14, sy - 14, 28, 28); ctx.setLineDash([]); }
      const tx = c.x + 48, rw = 72;
      drawText(ctx, A.name, tx, c.y + 14, has ? ST.name : ST.nameOff);
      ctx.font = font(13, 'normal');
      drawText(ctx, A.desc, tx, c.y + 33, ctx.measureText(A.desc).width > c.w - 48 - rw ? ST.descS : ST.desc);
      // 報酬と進み具合
      drawSprite(ctx, 'item_coin', 0, c.x + c.w - 60, c.y + 20, { sx: 0.55, sy: 0.55 });
      drawText(ctx, `${A.reward}`, c.x + c.w - 10, c.y + 13, ST.reward);
      if (has) drawText(ctx, d.achievements[A.id] !== '?' ? d.achievements[A.id].slice(5).replace('-', '/') : '済', c.x + c.w - 10, c.y + 33, ST.prog);
      else { const p = progressOf(A, d, ctxA); if (p.max > 1) drawText(ctx, `${Math.min(p.cur, p.max)} / ${p.max}`, c.x + c.w - 10, c.y + 33, ST.prog); }
    }
  },

  // ---- 毎日のお題 ----
  drawMissions(ctx, px, py, pw, ph, d, t) {
    const list = d.missions.list;
    drawText(ctx, `今日のお題　${d.missions.date.replace(/-/g, '/')}`, px + 30, py + 28, ST.head);
    const s = secondsToReset(), hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60);
    drawText(ctx, `入れ替わりまで ${hh}時間${mm}分`, px + pw - 30, py + 28, ST.count);
    const rh = 74, x0 = px + 24, w = pw - 48;
    for (let i = 0; i < list.length; i++) {
      const m = list[i], def = missionDef(m.id); if (!def) continue;
      const y = py + 52 + i * (rh + 8);
      roundRect(ctx, x0, y, w, rh, 10); ctx.fillStyle = m.done ? 'rgba(224,180,72,0.18)' : 'rgba(90,60,40,0.06)'; ctx.fill();
      // 番号・済の印
      const sx = x0 + 36, sy = y + rh / 2;
      if (m.done) { ctx.save(); ctx.translate(sx, sy); ctx.rotate(-0.15); ctx.fillStyle = COL.shu; ctx.fillRect(-20, -20, 40, 40); ctx.strokeStyle = '#fff4e0'; ctx.lineWidth = 1.5; ctx.strokeRect(-16, -16, 32, 32); drawText(ctx, '済', 0, 1, ST.sealL); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(sx, sy, 19, 0, Math.PI * 2); ctx.fillStyle = COL.ai; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = COL.kin; ctx.stroke(); drawText(ctx, KANJI[i] || String(i + 1), sx, sy + 1, ST.seal); }
      if (m.char && CHARS[m.char]) drawHeroDressed(ctx, m.char, 'idle', (t * 6) | 0, x0 + w - 150, y + rh - 4, { sx: 0.95, sy: 0.95, time: t });
      const tx = x0 + 72, txt = missionText(m);
      ctx.font = font(20);
      drawText(ctx, txt, tx, y + 24, ctx.measureText(txt).width > w - 72 - 200 ? ST.mTextS : ST.mText);
      // 進み具合の帯
      const bw = Math.min(360, w - 72 - 200), by = y + 46, k = Math.min(1, m.p / def.n);
      roundRect(ctx, tx, by, bw, 12, 6); ctx.fillStyle = 'rgba(90,60,40,0.18)'; ctx.fill();
      if (k > 0) { roundRect(ctx, tx, by, Math.max(12, bw * k), 12, 6); ctx.fillStyle = m.done ? COL.kin : COL.shu; ctx.fill(); }
      drawText(ctx, `${Math.min(m.p, def.n)} / ${def.n}`, tx + bw + 70, by + 6, ST.mProg);
      drawSprite(ctx, 'item_coin', 0, x0 + w - 74, y + rh / 2 + 10, { sx: 0.8, sy: 0.8 });
      drawText(ctx, `${def.reward}`, x0 + w - 18, y + rh / 2, ST.mReward);
    }
    const ny = py + 52 + 3 * (rh + 8) + 8;
    drawText(ctx, `これまでに達成したお題　${d.records.missionsDone}個`, px + 30, ny, ST.note);
    drawText(ctx, '毎日0時（この端末の日付）に入れ替わります。福引きの「今日の無料」と同じ日付です。', px + 30, ny + 22, ST.note);
  },

  // ---- 腕試し ----
  drawRush(ctx, px, py, pw, ph, d, t) {
    if (!this.rushOpen) {
      drawText(ctx, '腕試しは、エンディングを見ると挑めます', px + pw / 2, py + ph / 2 - 14, ST.lock);
      drawText(ctx, '6体のボスと続けて戦う、勝ちぬき戦です', px + pw / 2, py + ph / 2 + 18, ST.lockS);
      return;
    }
    const R = d.bossRush, lx = px + 30, lw = Math.min(360, pw * 0.42);
    drawText(ctx, '六番勝負', lx, py + 30, ST.head);
    const rules = ['6体のボスと続けて戦う', 'ハートは引き継ぎ。ボスの間に1つ回復', 'キャラと装備した武器で挑む', `勝ちぬき ${RUSH.reward.clear}枚・ノーミス +${RUSH.reward.noMiss}枚・ベスト更新 +${RUSH.reward.newBest}枚`];
    for (let i = 0; i < rules.length; i++) {
      ctx.fillStyle = COL.shu; ctx.beginPath(); ctx.arc(lx + 6, py + 62 + i * 24, 3.5, 0, 7); ctx.fill();
      drawText(ctx, rules[i], lx + 18, py + 62 + i * 24, i === 3 ? ST.descS : ST.desc);
    }
    // 6体（宝珠の色と名前）
    const by = py + 186, step = Math.min(64, (lw - 10) / 6);
    for (let i = 0; i < 6; i++) {
      const m = META.stages[i + 1], cx = lx + step / 2 + i * step, beaten = i < R.most;
      drawOrb(ctx, cx, by, 13, m.orb, beaten ? 0.8 : 0);
      if (!beaten) { ctx.fillStyle = 'rgba(40,30,30,0.45)'; ctx.beginPath(); ctx.arc(cx, by, 13, 0, 7); ctx.fill(); }
      drawText(ctx, KANJI[i], cx, by + 26, ST.bossName);
    }
    drawText(ctx, '色のついた玉：いちばん先まで倒したボス', lx, by + 50, ST.descS);
    // 記録
    const rx = px + pw * 0.5, rw = pw * 0.5 - 40;
    const rows = [['ベストタイム', R.best > 0 ? fmtTime(R.best) : '--:--.-'], ['ノーミス', R.noMiss ? '達成' : '―'], ['勝ちぬいた回数', `${R.clears}回`], ['挑んだ回数', `${R.tries}回`], ['いちばん先まで', `${R.most} / 6体`]];
    for (let i = 0; i < rows.length; i++) {
      const y = py + 34 + i * 36;
      drawText(ctx, rows[i][0], rx, y, ST.label);
      drawText(ctx, rows[i][1], rx + rw, y, ST.val);
      ctx.fillStyle = 'rgba(142,42,28,0.22)'; ctx.fillRect(rx, y + 16, rw, 1.2);
    }
    // 挑むボタン（キャラと武器）
    const cid = d.lastChar || 'leaf', eq = d.equipped && d.weapons[d.equipped] ? d.equipped : null;
    const G = this.goRect; G.w = Math.min(220, rw - 90); G.h = 50; G.x = rx + rw - G.w; G.y = py + ph - 74;
    drawHeroDressed(ctx, cid, 'idle', (t * 6) | 0, G.x - 46, G.y + G.h, { sx: 1.1, sy: 1.1, weaponId: eq, time: t });
    drawTag(ctx, G.x, G.y, G.w, G.h, true, false, 0.5 + 0.5 * Math.sin(t * 4));
    drawText(ctx, '挑む！', G.x + G.w / 2, G.y + G.h / 2 + 1, ST.big);
  },
};
