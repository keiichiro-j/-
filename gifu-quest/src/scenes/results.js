import { game } from '../game.js';
import { drawHeroDressed } from '../art/heroGear.js';
import { input } from '../core/input.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { touch } from '../ui/touch.js';
import { drawSprite } from '../gfx/atlas.js';
import { LEVELS } from '../world/levels.js';
import { MenuList } from '../ui/menus.js';
import { drawText, drawWashi, drawPatternBg, roundRect, fmtTime, drawOrb, COL } from '../ui/text.js';
import { drawLeaves } from './title.js';
import META from '../data/stages.json';
import CHARS from '../data/characters.json';
// 結果画面（設計書 9章）：クリア時間・コイン・さるぼぼ・ミス。自己ベストで「NEW」。数字はカウントアップ。担当：UI
// params: { stage, char, stats{coins,sarubobo[3],hits,misses,time,enemies}, newBest, prevBest }
const ST = {
  head: { size: 40, color: COL.kinLight, stroke: COL.sumi, strokeW: 7, align: 'center', baseline: 'middle', serif: true, shadow: true },
  stage: { size: 20, color: COL.kinari, stroke: COL.sumi, strokeW: 4, align: 'center', baseline: 'middle' },
  label: { size: 20, color: '#5a3a2a', align: 'left', baseline: 'middle' },
  val: { size: 30, color: COL.sumi, align: 'right', baseline: 'middle' },
  sub: { size: 14, color: '#7a5a3a', align: 'right', baseline: 'middle' },
  stamp: { size: 22, color: '#fff4e0', align: 'center', baseline: 'middle', serif: true },
  toast: { size: 22, color: '#fff8e6', stroke: COL.shuDark, strokeW: 5, align: 'center', baseline: 'middle', shadow: true },
  gold: { size: 15, color: COL.kinDark, align: 'left', baseline: 'middle' },
};
const DEMO = { stage: 1, stats: { coins: 48, sarubobo: [true, false, true], hits: 2, misses: 1, time: 263.4, enemies: 12 }, newBest: true, prevBest: 280.2 };
const ROW_T = [0.5, 1.3, 2.0, 2.7];   // 各行の出る時刻

export const resultsScene = {
  t: 0,
  list: new MenuList([{ key: 'next', label: 'つぎへ' }, { key: 'retry', label: 'もう一度' }], { horizontal: true, size: 22 }),
  enter(params) {
    const p = params && params.stats ? params : { ...DEMO, char: save.data.lastChar };
    this.p = p; this.t = 0; this.lastTick = 0;
    const d = save.data;
    this.char = p.char || d.lastChar || 'leaf';
    this.meta = META.stages[String(p.stage)] || META.stages['1'];
    this.target = this.meta.target;
    // さるぼぼ全18個で隠しキャラ解放
    this.unlockMsg = '';
    if (save.saruboboCount() >= 18 && !d.unlocked.includes('sarubobo') && CHARS.sarubobo) {
      d.unlocked.push('sarubobo'); save.write();
      this.unlockMsg = 'さるぼぼ全部あつめた！ 「さるぼぼ」が仲間に／うらステージ出現';
    }
    this.list.sel = 0;
    this.list.items[0].label = p.stage === 6 ? 'エンディングへ' : 'マップへ';
    touch.show('menu');
    audio.bgm('clear');
  },
  exit() { touch.hide(); },
  get done() { return this.t >= ROW_T[3] + 0.8; },
  update(dt) {
    const before = this.t;
    this.t += dt;
    // カウントアップの音
    if (!this.done && Math.floor(this.t * 14) !== Math.floor(before * 14) && this.t > ROW_T[0]) audio.sfx('coin', { vol: 0.3 });
    if (!this.done) {
      if (this.t > 0.3 && (input.pressed.confirm || input.pressed.jump || touch.tap())) { this.t = ROW_T[3] + 0.8; touch.clearTap(); }
      return;
    }
    const r = this.list.update(dt, { noBack: true });
    if (r === 'next') {
      if (this.p.stage === 6) game.go('ending', {}, 'wipe');
      else game.go('worldmap', { stage: this.p.stage, char: this.char }, 'iris');
    } else if (r === 'retry') {
      if (LEVELS[this.p.stage]) game.go('stage', { stage: this.p.stage, char: this.char }, 'iris');
    }
  },
  count(v, i) { const k = Math.max(0, Math.min(1, (this.t - ROW_T[i]) / 0.7)); return v * (1 - (1 - k) * (1 - k)); },
  draw(ctx, a, vw, vh) {
    const t = this.t, p = this.p, s = p.stats;
    drawPatternBg(ctx, vw, vh, '#3a1a1a', '#6a2a20', t);
    // 後光
    const g = ctx.createRadialGradient(vw * 0.25, 300, 10, vw * 0.25, 300, 300);
    g.addColorStop(0, 'rgba(255,220,140,0.5)'); g.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    ctx.save(); ctx.translate(vw * 0.25, 300); ctx.rotate(t * 0.15); ctx.fillStyle = 'rgba(255,230,160,0.08)';
    for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(500, -40); ctx.lineTo(500, 40); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    drawLeaves(ctx, vw, vh, t, 0.7);
    const k0 = Math.min(1, t / 0.4);
    ctx.globalAlpha = k0;
    drawText(ctx, p.stage === 0 ? 'れんしゅう 完了！' : 'ステージ クリア！', vw / 2, 48 - (1 - k0) * 20, ST.head);
    drawText(ctx, (LEVELS[p.stage] && LEVELS[p.stage].name) || this.meta.name, vw / 2, 90, ST.stage);
    ctx.globalAlpha = 1;
    // 主人公（勝利ポーズ）と宝珠
    const hx = vw * 0.25, hy = 410;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(hx, hy, 90, 16, 0, 0, Math.PI * 2); ctx.fill();
    drawHeroDressed(ctx, this.char, 'win', (t * 6) | 0, hx, hy, { sx: 3.2, sy: 3.2, weaponId: save.data.equipped && save.data.weapons[save.data.equipped] ? save.data.equipped : null, time: t });
    if (this.meta.orb && p.stage >= 1 && p.stage <= 6) drawOrb(ctx, hx + 90, 220 + Math.sin(t * 2) * 6, 16, this.meta.orb, 1);
    // 和紙の表
    const px = vw * 0.47, py = 120, pw = Math.min(520, vw - px - 40), ph = 300;
    drawWashi(ctx, px, py, pw, ph);
    const rowY = (i) => py + 46 + i * 66;
    const rx = px + 34, vx = px + pw - 34;
    const show = (i) => t >= ROW_T[i];
    if (show(0)) {
      drawText(ctx, 'クリアタイム', rx, rowY(0), ST.label);
      drawText(ctx, fmtTime(this.count(s.time, 0)), vx, rowY(0), ST.val);
      if (t > ROW_T[0] + 0.8) {
        if (p.newBest && p.stage !== 'test') this.stamp(ctx, vx - 180, rowY(0) - 2, t - ROW_T[0] - 0.8, 'NEW');
        if (s.time <= this.target) { ctx.fillStyle = COL.kin; star(ctx, rx + 140, rowY(0), 10); drawText(ctx, '目標達成', rx + 154, rowY(0), ST.gold); }
        else drawText(ctx, '目標 ' + fmtTime(this.target), vx, rowY(0) + 24, ST.sub);
      }
      line(ctx, rx, vx, rowY(0) + 34);
    }
    if (show(1)) {
      drawSprite(ctx, 'item_coin', (t * 10) | 0, rx + 10, rowY(1) + 12, { sx: 0.9, sy: 0.9 });
      drawText(ctx, 'コイン', rx + 28, rowY(1), ST.label);
      drawText(ctx, String(Math.round(this.count(s.coins, 1))), vx, rowY(1), ST.val);
      line(ctx, rx, vx, rowY(1) + 34);
    }
    if (show(2)) {
      drawText(ctx, 'さるぼぼ', rx, rowY(2), ST.label);
      for (let i = 0; i < 3; i++) {
        const sx = vx - 100 + i * 42, sy = rowY(2);
        roundRect(ctx, sx - 17, sy - 19, 34, 38, 8); ctx.fillStyle = 'rgba(90,60,40,0.15)'; ctx.fill(); ctx.strokeStyle = 'rgba(90,60,40,0.4)'; ctx.lineWidth = 1; ctx.stroke();
        const ti = t - ROW_T[2] - i * 0.18;
        if (s.sarubobo[i] && ti > 0) { const pop = ti < 0.25 ? 1 + Math.sin(ti / 0.25 * Math.PI) * 0.4 : 1; drawSprite(ctx, 'item_sarubobo', 0, sx, sy + 16, { sx: 0.9 * pop, sy: 0.9 * pop }); }
      }
      line(ctx, rx, vx, rowY(2) + 34);
    }
    if (show(3)) {
      drawText(ctx, 'ミス', rx, rowY(3), ST.label);
      const m = (s.misses || 0) + (s.hits || 0);
      drawText(ctx, String(Math.round(this.count(m, 3))), vx, rowY(3), ST.val);
      drawText(ctx, `（落下 ${s.misses || 0}・被弾 ${s.hits || 0}）`, vx - 46, rowY(3) + 2, ST.sub);
      if (m === 0 && t > ROW_T[3] + 0.6) this.stamp(ctx, vx - 190, rowY(3), t - ROW_T[3] - 0.6, '無傷');
    }
    if (this.unlockMsg && this.done) drawText(ctx, this.unlockMsg, vw / 2, 104 + 340, ST.toast);
    if (this.done) {
      ctx.globalAlpha = Math.min(1, (t - ROW_T[3] - 0.8) / 0.3 + 0.01);
      this.list.layout(px + pw / 2, vh - 70, 180, 48, 20).draw(ctx);
      ctx.globalAlpha = 1;
    }
  },
  // 朱の判子（押される動き）
  stamp(ctx, x, y, e, txt) {
    const k = Math.min(1, e / 0.18), sc = 1 + (1 - k) * 1.4;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.18); ctx.scale(sc, sc); ctx.globalAlpha = k;
    roundRect(ctx, -34, -18, 68, 36, 6); ctx.fillStyle = 'rgba(208,69,47,0.92)'; ctx.fill();
    ctx.strokeStyle = '#fff4e0'; ctx.lineWidth = 2; roundRect(ctx, -30, -14, 60, 28, 4); ctx.stroke();
    drawText(ctx, txt, 0, 1, ST.stamp);
    ctx.restore();
  },
};
function line(ctx, x0, x1, y) { ctx.fillStyle = 'rgba(142,42,28,0.25)'; ctx.fillRect(x0, y, x1 - x0, 1.2); }
function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}
