import { game } from '../game.js';
import { World } from '../world/world.js';
import { renderer } from '../gfx/renderer.js';
import { input } from '../core/input.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { events } from '../core/events.js';
import { LEVELS } from '../world/levels.js';
import { drawHud } from '../ui/hud.js';
import { touch } from '../ui/touch.js';
import { pauseMenu, MenuList } from '../ui/menus.js';
import { toast } from '../ui/toast.js';
import { drawText, drawWashi, drawSumiPanel, drawOrb, roundRect, fmtTime, COL } from '../ui/text.js';
import { drawDialogue, updateDialogue } from '../systems/dialogue.js';
import { weaponById } from '../systems/gacha.js';
import { progress } from '../systems/achievements.js';
import RUSH from '../data/bossrush.json';
import META from '../data/stages.json';
// 腕試し（ボス連戦）。エンディングを見た後に記録画面・マップから。仕様は docs/content.md
// 6体のボス（levels/stage91〜96.json のアリーナ）と続けて戦う。ハートは引き継ぎ、ボスの間に1つ回復。
// world の stageClear（宝珠を取った）で次へ、playerDown で終わり。world・player の中身は書き換えない（作る時の opts.hearts だけ）
// params: { char }
const KANJI = '一二三四五六';
const ST = {
  bannerNo: { size: 22, color: COL.kinLight, stroke: COL.sumi, strokeW: 5, align: 'center', baseline: 'middle', serif: true },
  bannerName: { size: 40, color: '#fff8e6', stroke: COL.sumi, strokeW: 7, align: 'center', baseline: 'middle', serif: true, shadow: true },
  pill: { size: 15, color: COL.kinari, stroke: COL.sumi, strokeW: 3, align: 'left', baseline: 'middle' },
  head: { size: 30, color: COL.kinLight, stroke: COL.sumi, strokeW: 6, align: 'center', baseline: 'middle', serif: true, shadow: true },
  sub: { size: 18, color: COL.kinari, stroke: COL.sumi, strokeW: 4, align: 'center', baseline: 'middle' },
  hint: { size: 14, color: COL.kinari, stroke: COL.sumi, strokeW: 3, align: 'center', baseline: 'middle', alpha: 0.85 },
  label: { size: 18, color: '#5a3a2a', align: 'left', baseline: 'middle' },
  val: { size: 24, color: COL.sumi, align: 'right', baseline: 'middle' },
  small: { size: 14, color: '#7a5a3a', align: 'right', baseline: 'middle' },
  stamp: { size: 20, color: '#fff4e0', align: 'center', baseline: 'middle', serif: true },
  msg: { size: 15, color: COL.kinari, stroke: COL.sumi, strokeW: 3, align: 'center', baseline: 'middle' },
};
const bossName = (i) => (META.stages[i + 1] && META.stages[i + 1].boss) || 'ボス';

export const bossrushScene = {
  world: null, params: null, paused: false, intro: 0,
  phase: 'fight',   // fight | break | done | fail
  idx: 0, run: null, banner: 0, phaseT: 0, msg: '', msgT: 0,
  doneList: new MenuList([{ key: 'again', label: 'もう一度' }, { key: 'records', label: '記録を見る' }, { key: 'map', label: 'マップへ' }], { horizontal: true, size: 20 }),
  failList: new MenuList([{ key: 'again', label: 'もう一度' }, { key: 'map', label: 'マップへ' }], { horizontal: true, size: 20 }),
  enter(params) {
    this.params = { char: (params && params.char) || save.data.lastChar || 'leaf' };
    const d = save.data;
    this.run = { time: 0, hits: 0, misses: 0, coins: 0, hearts: 0, reward: 0, newBest: false, noMiss: false, prevBest: d.bossRush.best };
    d.bossRush.tries++; save.write();
    this.unsub = [events.on('stageClear', () => { this.clearSeen = true; }), events.on('playerDown', () => { this.downSeen = true; })];
    this.startBoss(0);
  },
  exit() { touch.hide(); if (this.unsub) for (const u of this.unsub) u(); this.unsub = null; this.world = null; },
  startBoss(i) {
    this.idx = i; this.phase = 'fight'; this.phaseT = 0; this.paused = false;
    this.clearSeen = false; this.downSeen = false;
    const stageNo = RUSH.stages[i], data = LEVELS[stageNo];
    if (!data) throw new Error('boss rush level not found ' + stageNo);
    const d = save.data, eq = d.equipped, own = eq && d.weapons[eq];
    const weapon = own && weaponById(eq) ? { id: eq, lv: own.lv } : null;
    this.world = new World(data, this.params.char, { viewW: renderer.viewW, viewH: renderer.viewH, weapon, hearts: i > 0 ? this.run.hearts : undefined });
    this.intro = 0;          // HUD のステージ名の帯は出さない（代わりに「第◯番」の帯）
    this.banner = 2.2;
    touch.show('play');
    audio.bgm('boss');
    events.emit('stageEnter', { stage: stageNo, rush: true });
  },
  update(dt) {
    this.msgT = Math.max(0, this.msgT - dt);
    this.phaseT += dt;
    if (this.phase === 'break') {
      // ボスの間：少し待つ（決定・タップで飛ばせる）
      const skip = this.phaseT > 0.6 && (input.pressed.confirm || input.pressed.jump || touch.tap());
      if (this.phaseT >= RUSH.breakTime || skip) this.startBoss(this.idx + 1);
      return;
    }
    if (this.phase === 'done' || this.phase === 'fail') {
      if (this.phaseT < 0.6) { touch.clearTap(); return; }
      const r = (this.phase === 'done' ? this.doneList : this.failList).update(dt, { noBack: true });
      if (r === 'again') game.go('bossrush', this.params, 'iris');
      else if (r === 'records') game.go('records', { back: 'worldmap', tab: 2 }, 'wipe');
      else if (r === 'map') game.go('worldmap', {}, 'iris');
      return;
    }
    const W = this.world;
    if (!W) return;
    if (this.paused) { const r = pauseMenu.update(dt); if (r) this.onPause(r); return; }
    if (input.pressed.pause && W.state === 'play') { this.paused = true; pauseMenu.open(); audio.sfx('pause'); return; }
    if (this.banner > 0) this.banner -= dt;
    if (W.dialogue) { if (updateDialogue(W, dt)) W.dialogue = null; return; }
    W.update(dt);
    if (W.result === 'clear') this.bossCleared();
    else if (W.result === 'gameover') this.failed();
  },
  onPause(r) {
    this.paused = false;
    if (r === 'retry') game.go('bossrush', this.params, 'iris');
    else if (r === 'map') game.go('worldmap', {}, 'iris');
    else if (r === 'settings') { this.msg = '腕試しの間は設定を開けません（マップから開けます）'; this.msgT = 2.5; }
  },
  addStats(W) { const R = this.run, s = W.stats; R.time += s.time; R.hits += s.hits; R.misses += s.misses; R.coins += s.coins; },
  bossCleared() {
    const W = this.world, R = this.run, d = save.data;
    if (W._finished) return;
    W._finished = true;
    this.addStats(W);
    const p = W.player;
    R.hearts = Math.min(p.maxHearts, p.hearts + RUSH.heal);
    d.bossRush.most = Math.max(d.bossRush.most, this.idx + 1);
    if (this.idx + 1 >= RUSH.stages.length) return this.finish();
    save.write();
    this.phase = 'break'; this.phaseT = 0;
    touch.show('menu');
  },
  finish() {
    const R = this.run, d = save.data, B = d.bossRush;
    R.noMiss = R.hits + R.misses === 0;
    R.newBest = !(B.best > 0) || R.time < B.best;
    R.reward = RUSH.reward.clear + (R.noMiss ? RUSH.reward.noMiss : 0) + (R.newBest && B.best > 0 ? RUSH.reward.newBest : 0);
    if (R.newBest) B.best = R.time;
    if (R.noMiss) B.noMiss = true;
    B.clears++;
    d.coins += R.reward + R.coins;
    d.lastChar = this.params.char;
    progress.check();   // 「六番勝負」「天下無双」などの称号（保存もする）
    save.write();
    this.phase = 'done'; this.phaseT = 0; this.doneList.sel = 0;
    touch.show('menu');
    audio.bgm('clear');
  },
  failed() {
    const W = this.world, d = save.data;
    if (W._finished) return;
    W._finished = true;
    this.addStats(W);
    d.coins += this.run.coins;
    save.write();
    this.phase = 'fail'; this.phaseT = 0; this.failList.sel = 0;
    touch.show('menu');
    audio.bgm('gameover');
  },

  // ---- 描画 ----
  draw(ctx, alpha, vw, vh) {
    const W = this.world;
    if (W) {
      W.draw(ctx, this.paused || W.dialogue || this.phase !== 'fight' ? 1 : alpha, vw, vh);
      drawHud(ctx, W, vw, vh, this);
      if (this.phase === 'fight') touch.draw(ctx, vw, vh);
      if (W.dialogue) drawDialogue(ctx, W, vw, vh);
    }
    if (this.phase === 'fight') {
      this.drawPill(ctx, W, vw, vh);
      if (this.banner > 0 && !this.paused) this.drawBanner(ctx, vw, vh);
    } else if (this.phase === 'break') this.drawBreak(ctx, vw, vh);
    else if (this.phase === 'done') this.drawDone(ctx, vw, vh);
    else if (this.phase === 'fail') this.drawFail(ctx, vw, vh);
    if (this.msgT > 0) {
      ctx.globalAlpha = Math.min(1, this.msgT * 2);
      roundRect(ctx, vw / 2 - 250, vh - 120, 500, 38, 19); ctx.fillStyle = 'rgba(20,14,12,0.85)'; ctx.fill();
      drawText(ctx, this.msg, vw / 2, vh - 100, ST.msg);
      ctx.globalAlpha = 1;
    }
    if (this.paused) pauseMenu.draw(ctx, vw, vh);
    else toast.draw(ctx, vw, vh, this.phase === 'fight' ? 122 : 8, this.phase !== 'fight');
  },
  // 左上（顔とハートの下）：何体目・合計時間
  drawPill(ctx, W, vw, vh) {
    const x = 14, y = 100, w = 196, h = 28;
    roundRect(ctx, x, y, w, h, 14); ctx.fillStyle = 'rgba(26,18,14,0.72)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(224,180,72,0.7)'; ctx.stroke();
    drawText(ctx, `腕試し ${this.idx + 1}/6`, x + 12, y + h / 2 + 1, ST.pill);
    drawText(ctx, fmtTime(this.run.time + (W ? W.stats.time : 0)), x + 104, y + h / 2 + 1, ST.pill);
  },
  drawBanner(ctx, vw, vh) {
    const T = 2.2, e = T - this.banner, k = Math.min(1, e / 0.35) * Math.min(1, this.banner / 0.45);
    ctx.save(); ctx.globalAlpha = k;
    const bh = 120, by = vh * 0.36 - bh / 2;
    const g = ctx.createLinearGradient(0, 0, vw, 0);
    g.addColorStop(0, 'rgba(59,18,18,0)'); g.addColorStop(0.2, 'rgba(59,18,18,0.85)'); g.addColorStop(0.8, 'rgba(59,18,18,0.85)'); g.addColorStop(1, 'rgba(59,18,18,0)');
    ctx.fillStyle = g; ctx.fillRect(0, by, vw, bh);
    ctx.fillStyle = COL.kin; ctx.fillRect(vw * 0.15, by + 4, vw * 0.7, 2); ctx.fillRect(vw * 0.15, by + bh - 6, vw * 0.7, 2);
    const slide = (1 - Math.min(1, e / 0.35)) * 40;
    drawText(ctx, `腕試し　第${KANJI[this.idx]}番`, vw / 2 - slide, by + 32, ST.bannerNo);
    drawText(ctx, bossName(this.idx), vw / 2 + slide, by + 76, ST.bannerName);
    ctx.restore();
  },
  drawBreak(ctx, vw, vh) {
    ctx.fillStyle = 'rgba(12,8,10,0.5)'; ctx.fillRect(0, 0, vw, vh);
    const w = Math.min(560, vw - 40), h = 230, x = vw / 2 - w / 2, y = vh / 2 - h / 2 - 10;
    drawSumiPanel(ctx, x, y, w, h);
    drawText(ctx, `第${KANJI[this.idx]}番　勝ち！`, vw / 2, y + 44, ST.head);
    this.drawOrbs(ctx, vw / 2, y + 96, this.idx + 1);
    drawText(ctx, `ハートが${RUSH.heal}つ回復　（いま ${this.run.hearts}）`, vw / 2, y + 140, ST.sub);
    drawText(ctx, `つぎは　${bossName(this.idx + 1)}`, vw / 2, y + 176, ST.sub);
    drawText(ctx, touch.enabled ? 'タップで すぐに次へ' : 'Z で すぐに次へ', vw / 2, y + h - 18, ST.hint);
  },
  drawOrbs(ctx, cx, cy, n) {
    for (let i = 0; i < 6; i++) {
      const x = cx - 125 + i * 50, on = i < n;
      drawOrb(ctx, x, cy, 14, META.stages[i + 1].orb, on ? 0.9 : 0);
      if (!on) { ctx.fillStyle = 'rgba(20,14,12,0.6)'; ctx.beginPath(); ctx.arc(x, cy, 14, 0, 7); ctx.fill(); }
    }
  },
  drawDone(ctx, vw, vh) {
    const R = this.run, k = Math.min(1, this.phaseT / 0.4);
    ctx.fillStyle = `rgba(12,8,10,${0.8 * k})`; ctx.fillRect(0, 0, vw, vh);
    ctx.globalAlpha = k;
    drawText(ctx, '六番勝負　勝ちぬき！', vw / 2, 52, ST.head);
    this.drawOrbs(ctx, vw / 2, 104, 6);
    const w = Math.min(520, vw - 40), x = vw / 2 - w / 2, y = 136, h = 270;
    drawWashi(ctx, x, y, w, h);
    const rx = x + 34, vx = x + w - 34;
    const row = this.row;
    row(ctx, rx, vx, y, 0, 'クリア時間', fmtTime(R.time), R.prevBest > 0 ? `これまでのベスト ${fmtTime(R.prevBest)}` : '');
    row(ctx, rx, vx, y, 1, 'ミス', String(R.hits + R.misses), `（落下 ${R.misses}・被弾 ${R.hits}）`);
    row(ctx, rx, vx, y, 2, 'もらったコイン', `${R.reward + R.coins}枚`, `勝ちぬき ${RUSH.reward.clear}${R.noMiss ? `＋ノーミス ${RUSH.reward.noMiss}` : ''}${R.newBest && R.prevBest > 0 ? `＋ベスト ${RUSH.reward.newBest}` : ''}`);
    if (R.newBest) this.stamp(ctx, rx + 190, y + 38, 'NEW');
    if (R.noMiss) this.stamp(ctx, rx + 190, y + 94, '無傷');
    drawText(ctx, `ベスト ${fmtTime(save.data.bossRush.best)}`, vx, y + h - 24, ST.small);
    ctx.globalAlpha = 1;
    if (this.phaseT > 0.6) this.doneList.layout(vw / 2, vh - 76, Math.min(170, (vw - 80) / 3 - 16), 46, 16).draw(ctx);
  },
  drawFail(ctx, vw, vh) {
    const k = Math.min(1, this.phaseT / 0.4);
    ctx.fillStyle = `rgba(12,8,10,${0.65 * k})`; ctx.fillRect(0, 0, vw, vh);
    ctx.globalAlpha = k;
    const w = Math.min(560, vw - 40), h = 250, x = vw / 2 - w / 2, y = vh / 2 - h / 2 - 30;
    drawSumiPanel(ctx, x, y, w, h);
    drawText(ctx, '力尽きた……', vw / 2, y + 46, ST.head);
    this.drawOrbs(ctx, vw / 2, y + 100, this.idx);
    drawText(ctx, `${this.idx}体を倒した（${bossName(this.idx)}に敗れた）`, vw / 2, y + 146, ST.sub);
    drawText(ctx, `いちばん先まで ${save.data.bossRush.most} / 6体`, vw / 2, y + 182, ST.sub);
    ctx.globalAlpha = 1;
    if (this.phaseT > 0.6) this.failList.layout(vw / 2, y + h + 16, 180, 46, 20).draw(ctx);
  },
  row(ctx, rx, vx, y, i, label, val, sub) {
    const ry = y + 40 + i * 56;
    drawText(ctx, label, rx, ry, ST.label); drawText(ctx, val, vx, ry, ST.val);
    if (sub) drawText(ctx, sub, vx, ry + 22, ST.small);
    ctx.fillStyle = 'rgba(142,42,28,0.25)'; ctx.fillRect(rx, ry + 30, vx - rx, 1.2);
  },
  stamp(ctx, x, y, txt) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.18);
    roundRect(ctx, -32, -17, 64, 34, 6); ctx.fillStyle = 'rgba(208,69,47,0.92)'; ctx.fill();
    ctx.strokeStyle = '#fff4e0'; ctx.lineWidth = 2; roundRect(ctx, -28, -13, 56, 26, 4); ctx.stroke();
    drawText(ctx, txt, 0, 1, ST.stamp);
    ctx.restore();
  },
};
