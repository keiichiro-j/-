import { game } from '../game.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { touch } from '../ui/touch.js';
import { drawSprite } from '../gfx/atlas.js';
import { LEVELS } from '../world/levels.js';
import { MenuList } from '../ui/menus.js';
import { drawText, COL } from '../ui/text.js';
import { drawLeaves } from './title.js';
// ゲームオーバー（設計書 3章）：「つづきはマップから」。担当：UI。params: { stage, char }
const ST = {
  head: { size: 52, color: '#e8dccb', stroke: COL.sumi, strokeW: 8, align: 'center', baseline: 'middle', serif: true, shadow: true, alpha: 1 },
  sub: { size: 20, color: COL.kinari, stroke: COL.sumi, strokeW: 4, align: 'center', baseline: 'middle', alpha: 1 },
};
export const gameoverScene = {
  t: 0,
  list: new MenuList([{ key: 'map', label: 'マップへ' }, { key: 'retry', label: 'もう一度' }], { horizontal: true, size: 22 }),
  enter(params) {
    this.p = params || {}; this.t = 0; this.list.sel = 0;
    this.char = this.p.char || save.data.lastChar || 'leaf';
    this.list.items[1].disabled = !LEVELS[this.p.stage];
    touch.show('menu');
    audio.bgm('gameover');
  },
  exit() { touch.hide(); },
  update(dt) {
    this.t += dt;
    if (this.t < 1.0) { touch.clearTap(); return; }
    const r = this.list.update(dt, { noBack: true });
    if (r === 'map') game.go('worldmap', { stage: this.p.stage, char: this.char }, 'iris');
    else if (r === 'retry') game.go('stage', { stage: this.p.stage, char: this.char }, 'iris');
  },
  draw(ctx, a, vw, vh) {
    const t = this.t;
    const g = ctx.createLinearGradient(0, 0, 0, vh); g.addColorStop(0, '#0e0a10'); g.addColorStop(1, '#2a1418');
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    drawLeaves(ctx, vw, vh, t * 0.5, 0.35);
    // 月
    ctx.fillStyle = 'rgba(255,240,210,0.12)'; ctx.beginPath(); ctx.arc(vw * 0.78, 110, 70, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8dcc0'; ctx.beginPath(); ctx.arc(vw * 0.78, 110, 34, 0, Math.PI * 2); ctx.fill();
    const k = Math.min(1, t / 0.8);
    ST.head.alpha = k; ST.sub.alpha = Math.min(1, Math.max(0, (t - 0.5) / 0.6));
    drawText(ctx, 'ざんねん…', vw / 2, 130 + (1 - k) * 20, ST.head);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(vw / 2, 330, 70, 12, 0, 0, Math.PI * 2); ctx.fill();
    drawSprite(ctx, `hero_${this.char}_hurt`, 0, vw / 2, 330, { sx: 2.6, sy: 2.6 });
    drawText(ctx, 'ハートがなくなりました。つづきはマップから。', vw / 2, 378, ST.sub);
    if (t > 1.0) { ctx.globalAlpha = Math.min(1, (t - 1) / 0.3); this.list.layout(vw / 2, 420, 180, 50, 26).draw(ctx); ctx.globalAlpha = 1; }
  },
};
