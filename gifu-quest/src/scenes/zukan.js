import { game } from '../game.js';
import { input } from '../core/input.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { touch } from '../ui/touch.js';
import { drawSprite, hasSprite, spriteInfo } from '../gfx/atlas.js';
import { LEVELS } from '../world/levels.js';
import { drawText, drawWashi, drawTag, drawPatternBg, drawWrapped, roundRect, COL } from '../ui/text.js';
import META from '../data/stages.json';
// 図鑑（設計書 9章）：集めたさるぼぼ・倒した敵・読んだ名物看板。担当：UI。params: { back?: 'worldmap'|'title' }
const TABS = [['sarubobo', 'さるぼぼ'], ['enemy', '敵'], ['sign', '名物看板']];
const ST = {
  title: { size: 30, color: COL.kinLight, stroke: COL.sumi, strokeW: 6, align: 'center', baseline: 'middle', serif: true, shadow: true },
  tab: { size: 18, color: COL.kinari, stroke: COL.woodDark, strokeW: 3, align: 'center', baseline: 'middle' },
  tabA: { size: 18, color: '#fff8e6', stroke: COL.shuDark, strokeW: 3, align: 'center', baseline: 'middle' },
  label: { size: 18, color: COL.sumi, align: 'left', baseline: 'middle' },
  labelA: { size: 18, color: COL.shuDark, align: 'left', baseline: 'middle' },
  small: { size: 13, color: '#5a3a2a', align: 'center', baseline: 'middle' },
  count: { size: 16, color: COL.shuDark, align: 'right', baseline: 'middle' },
  q: { size: 26, color: 'rgba(90,60,40,0.4)', align: 'center', baseline: 'middle' },
  stitle: { size: 22, color: COL.shuDark, align: 'left', baseline: 'middle', serif: true },
  body: { size: 16, color: COL.sumi, align: 'left', baseline: 'top' },
  labelC: { size: 18, color: COL.sumi, align: 'center', baseline: 'middle' },
  smallL: { size: 13, color: '#5a3a2a', align: 'left', baseline: 'middle' },
  hint: { size: 14, color: COL.kinari, stroke: COL.sumi, strokeW: 3, align: 'center', baseline: 'middle', alpha: 0.9 },
  back: { size: 16, color: COL.kinari, stroke: COL.woodDark, strokeW: 3, align: 'center', baseline: 'middle' },
};
const rect = () => ({ x: 0, y: 0, w: 0, h: 0 });
const inR = (r, p) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const ENEMY_ANIMS = ['walk', 'idle', 'fly', 'jump'];

function allSigns() {
  const out = [];
  for (let n = 1; n <= 7; n++) {
    const L = LEVELS[n]; if (!L) continue;
    for (const e of L.entities || []) if (e.type === 'sign') out.push({ id: e.id || e.title, title: e.title || '', text: e.text || '', stage: n });
  }
  return out;
}
function enemySprite(kind) { for (const a of ENEMY_ANIMS) if (hasSprite(`enemy_${kind}_${a}`)) return `enemy_${kind}_${a}`; return null; }

export const zukanScene = {
  tab: 0, sel: 0, t: 0, scroll: 0,
  tabRects: TABS.map(rect), cells: [], backRect: rect(),
  enter(params) {
    this.params = params || {}; this.t = 0; this.sel = 0; this.scroll = 0;
    this.signs = allSigns();
    this.cells = Array.from({ length: Math.max(META.enemies.length, this.signs.length, 6) }, rect);
    touch.show('menu');
  },
  exit() { touch.hide(); },
  count() { return this.tab === 0 ? 6 : this.tab === 1 ? META.enemies.length : this.signs.length; },
  setTab(i) { if (i === this.tab) return; this.tab = i; this.sel = 0; this.scroll = 0; audio.sfx('select'); },
  update(dt) {
    this.t += dt;
    if (this.t < 0.2) { touch.clearTap(); return; }
    const n = this.count(), cols = this.tab === 1 ? 7 : 1;
    if (input.pressed.left) { if (cols > 1 && this.sel % cols > 0) this.sel--; else this.setTab((this.tab + TABS.length - 1) % TABS.length); }
    if (input.pressed.right) { if (cols > 1 && this.sel % cols < cols - 1 && this.sel < n - 1) this.sel++; else this.setTab((this.tab + 1) % TABS.length); }
    if (input.pressed.down && n) { this.sel = Math.min(n - 1, this.sel + cols); audio.sfx('select'); }
    if (input.pressed.up && n) { this.sel = Math.max(0, this.sel - cols); audio.sfx('select'); }
    const tp = touch.tap();
    if (tp) {
      if (inR(this.backRect, tp)) return this.back();
      for (let i = 0; i < TABS.length; i++) if (inR(this.tabRects[i], tp)) return this.setTab(i);
      for (let i = 0; i < n; i++) if (inR(this.cells[i], tp)) { this.sel = i; audio.sfx('select'); }
    }
    if (input.pressed.back || input.pressed.pause) this.back();
  },
  back() { audio.sfx('cancel'); game.go(this.params.back === 'title' ? 'title' : 'worldmap', {}, 'wipe'); },
  draw(ctx, a, vw, vh) {
    const t = this.t, d = save.data;
    drawPatternBg(ctx, vw, vh, '#2a1e30', '#4a3450', t);
    drawText(ctx, '図鑑', vw / 2, 32, ST.title);
    for (let i = 0; i < TABS.length; i++) {
      const r = this.tabRects[i]; r.w = 150; r.h = 40; r.x = vw / 2 - 240 + i * 165; r.y = 58;
      drawTag(ctx, r.x, r.y, r.w, r.h, i === this.tab, false);
      drawText(ctx, TABS[i][1], r.x + r.w / 2, r.y + r.h / 2 + 1, i === this.tab ? ST.tabA : ST.tab);
    }
    const px = 30, py = 110, pw = vw - 60, ph = vh - py - 56;
    drawWashi(ctx, px, py, pw, ph);
    for (const c of this.cells) c.w = 0;
    if (this.tab === 0) this.drawSarubobo(ctx, px, py, pw, ph, d, t);
    else if (this.tab === 1) this.drawEnemies(ctx, px, py, pw, ph, d, t);
    else this.drawSigns(ctx, px, py, pw, ph, d, t);
    const bk = this.backRect; bk.w = 110; bk.h = 38; bk.x = 24; bk.y = vh - 46;
    drawTag(ctx, bk.x, bk.y, bk.w, bk.h, false, false);
    drawText(ctx, 'もどる', bk.x + bk.w / 2, bk.y + bk.h / 2 + 1, ST.back);
    drawText(ctx, touch.enabled ? 'タブ・項目をタップ' : '←→ タブ・選ぶ　↑↓ 選ぶ　X もどる', vw / 2, vh - 26, ST.hint);
  },
  drawSarubobo(ctx, px, py, pw, ph, d, t) {
    drawText(ctx, `あつめた数　${save.saruboboCount()} / 18`, px + pw - 30, py + 28, ST.count);
    const colW = (pw - 60) / 2;
    for (let i = 0; i < 6; i++) {
      const n = i + 1, c = this.cells[i], col = i % 2, row = (i / 2) | 0;
      c.x = px + 30 + col * colW; c.y = py + 50 + row * 92; c.w = colW - 16; c.h = 80;
      roundRect(ctx, c.x, c.y, c.w, c.h, 10); ctx.fillStyle = i === this.sel ? 'rgba(208,69,47,0.12)' : 'rgba(90,60,40,0.06)'; ctx.fill();
      drawText(ctx, (LEVELS[n] && LEVELS[n].name) || META.stages[n].name, c.x + 16, c.y + 24, i === this.sel ? ST.labelA : ST.label);
      const sb = d.sarubobo[String(n)] || [false, false, false];
      for (let j = 0; j < 3; j++) {
        const sx = c.x + 40 + j * 52, sy = c.y + 56;
        if (sb[j]) drawSprite(ctx, 'item_sarubobo', 0, sx, sy + 16, { sx: 0.9, sy: 0.9 });
        else { roundRect(ctx, sx - 15, sy - 16, 30, 32, 8); ctx.fillStyle = 'rgba(90,60,40,0.14)'; ctx.fill(); drawText(ctx, '？', sx, sy + 1, ST.small); }
      }
    }
  },
  drawEnemies(ctx, px, py, pw, ph, d, t) {
    const list = META.enemies, cols = 7;
    const got = list.filter((e) => d.defeated.includes(e.kind)).length;
    drawText(ctx, `倒した種類　${got} / ${list.length}`, px + pw - 30, py + 26, ST.count);
    const cw = (pw - 40) / cols, chh = 70;
    for (let i = 0; i < list.length; i++) {
      const e = list[i], c = this.cells[i], col = i % cols, row = (i / cols) | 0;
      c.x = px + 20 + col * cw + 4; c.y = py + 44 + row * (chh + 6); c.w = cw - 8; c.h = chh;
      const on = i === this.sel, seen = d.defeated.includes(e.kind);
      roundRect(ctx, c.x, c.y, c.w, c.h, 8); ctx.fillStyle = on ? 'rgba(208,69,47,0.16)' : 'rgba(90,60,40,0.07)'; ctx.fill();
      if (on) { ctx.strokeStyle = COL.shu; ctx.lineWidth = 2; ctx.stroke(); }
      const spr = enemySprite(e.kind);
      if (seen && spr) {
        const info = spriteInfo(spr), sc = Math.min(1, 40 / Math.max(info.w, info.h));
        drawSprite(ctx, spr, (t * 6) | 0, c.x + c.w / 2, c.y + 46, { sx: sc, sy: sc });
      } else drawText(ctx, '？', c.x + c.w / 2, c.y + 28, ST.q);
      drawText(ctx, seen ? e.name : '？？？', c.x + c.w / 2, c.y + c.h - 11, ST.small);
    }
  },
  drawSigns(ctx, px, py, pw, ph, d, t) {
    const list = this.signs;
    const got = list.filter((s) => d.seenSigns.includes(s.id)).length;
    drawText(ctx, `読んだ看板　${got} / ${list.length}`, px + pw - 30, py + 26, ST.count);
    if (!list.length) { drawText(ctx, 'まだ看板はありません', px + pw / 2, py + ph / 2, ST.labelC); return; }
    const lw = 280, rh = 34, vis = Math.floor((ph - 60) / rh);
    if (this.sel < this.scroll) this.scroll = this.sel;
    if (this.sel >= this.scroll + vis) this.scroll = this.sel - vis + 1;
    for (let k = 0; k < vis && this.scroll + k < list.length; k++) {
      const i = this.scroll + k, s = list[i], c = this.cells[i], on = i === this.sel, seen = d.seenSigns.includes(s.id);
      c.x = px + 20; c.y = py + 44 + k * rh; c.w = lw; c.h = rh - 4;
      roundRect(ctx, c.x, c.y, c.w, c.h, 6); ctx.fillStyle = on ? 'rgba(208,69,47,0.16)' : 'rgba(90,60,40,0.06)'; ctx.fill();
      drawText(ctx, seen ? s.title : '？？？', c.x + 12, c.y + c.h / 2 + 1, on ? ST.labelA : ST.label);
    }
    const s = list[this.sel], seen = d.seenSigns.includes(s.id);
    const x = px + lw + 50, w = pw - lw - 80;
    drawText(ctx, seen ? s.title : '？？？', x, py + 60, ST.stitle);
    drawText(ctx, (META.stages[s.stage] && META.stages[s.stage].name) || '', x, py + 88, ST.smallL);
    drawWrapped(ctx, seen ? s.text : 'ステージの中の看板の前で ↑ を押すと読めます。', x, py + 110, w, ST.body, 26);
  },
};
