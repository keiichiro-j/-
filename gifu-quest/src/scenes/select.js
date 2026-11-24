import { game } from '../game.js';
import { drawHeroDressed } from '../art/heroGear.js';
import { input } from '../core/input.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { touch } from '../ui/touch.js';
import { drawSprite } from '../gfx/atlas.js';
import { drawFace } from '../ui/hud.js';
import { drawText, drawWashi, drawWrapped, drawTag, drawPatternBg, roundRect, COL } from '../ui/text.js';
import CHARS from '../data/characters.json';
// キャラ選択（設計書 4章）。担当：UI。params: { back?: 'worldmap'|'title' }
const STATS = [['speed', '速さ'], ['jump', 'ジャンプ'], ['power', 'パワー'], ['hp', '体力']];
const ST = {
  name: { size: 40, color: COL.sumi, align: 'left', baseline: 'middle', serif: true },
  sub: { size: 17, color: COL.shuDark, align: 'left', baseline: 'middle' },
  label: { size: 17, color: COL.sumi, align: 'left', baseline: 'middle' },
  head: { size: 17, color: '#fff8e6', stroke: COL.shuDark, strokeW: 3, align: 'left', baseline: 'middle' },
  body: { size: 15, color: '#3a2a22', align: 'left', baseline: 'top', weight: 'bold' },
  title: { size: 30, color: COL.kinLight, stroke: COL.sumi, strokeW: 6, align: 'center', baseline: 'middle', serif: true, shadow: true },
  hint: { size: 14, color: COL.kinari, stroke: COL.sumi, strokeW: 3, align: 'center', baseline: 'middle', alpha: 0.85 },
  btn: { size: 22, color: '#fff8e6', stroke: COL.shuDark, strokeW: 4, align: 'center', baseline: 'middle' },
  back: { size: 16, color: COL.kinari, stroke: COL.woodDark, strokeW: 3, align: 'center', baseline: 'middle' },
  headC: { size: 15, color: '#fff8e6', align: 'center', baseline: 'middle' },
  hearts: { size: 13, color: '#5a3a2a', align: 'left', baseline: 'middle' },
};

export const selectScene = {
  ids: [], sel: 0, t: 0, swap: 0,
  cards: [], okRect: { x: 0, y: 0, w: 0, h: 0 }, backRect: { x: 0, y: 0, w: 0, h: 0 },
  enter(params) {
    this.params = params || {};
    const d = save.data;
    // さるぼぼ全18個で隠しキャラ解放（結果画面でも解放するが、念のため）
    if (save.saruboboCount() >= 18 && !d.unlocked.includes('sarubobo') && CHARS.sarubobo) { d.unlocked.push('sarubobo'); save.write(); }
    this.ids = Object.keys(CHARS).filter((id) => !CHARS[id].hidden || d.unlocked.includes(id));
    this.sel = Math.max(0, this.ids.indexOf(d.lastChar));
    this.cards = this.ids.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
    this.t = 0; this.swap = 1;
    touch.show('menu');
    audio.bgm('map');
  },
  exit() { touch.hide(); },
  move(d) { this.sel = (this.sel + d + this.ids.length) % this.ids.length; this.swap = 0; audio.sfx('select'); },
  update(dt) {
    this.t += dt; this.swap = Math.min(1, this.swap + dt * 5);
    if (this.t < 0.25) { touch.clearTap(); return; }
    if (input.pressed.left || input.pressed.up) this.move(-1);
    if (input.pressed.right || input.pressed.down) this.move(1);
    const tp = touch.tap();
    if (tp) {
      const inR = (r) => tp.x >= r.x && tp.x <= r.x + r.w && tp.y >= r.y && tp.y <= r.y + r.h;
      if (inR(this.okRect)) return this.choose();
      if (inR(this.backRect)) return this.back();
      for (let i = 0; i < this.cards.length; i++) if (inR(this.cards[i])) { if (i === this.sel) return this.choose(); this.sel = i; this.swap = 0; audio.sfx('select'); }
    }
    if (input.pressed.confirm || input.pressed.jump) this.choose();
    else if (input.pressed.back) this.back();
  },
  choose() {
    const id = this.ids[this.sel];
    save.data.lastChar = id; save.write();
    audio.sfx('confirm');
    game.go('worldmap', { char: id }, 'iris');
  },
  back() {
    audio.sfx('cancel');
    if (this.params.back === 'worldmap') game.go('worldmap', {}, 'wipe');
    else game.go('title', {}, 'wipe');
  },
  draw(ctx, a, vw, vh) {
    const t = this.t;
    drawPatternBg(ctx, vw, vh, '#1a2a48', '#3a4f70', t);
    drawText(ctx, '仲間をえらぶ', vw / 2, 34, ST.title);
    const id = this.ids[this.sel], c = CHARS[id];
    // ---- 左：大きな立ち絵 ----
    const lx = vw * 0.27, ly = 370;
    const halo = ctx.createRadialGradient(lx, ly - 90, 10, lx, ly - 90, 190);
    halo.addColorStop(0, c.color + 'aa'); halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo; ctx.fillRect(lx - 200, ly - 290, 400, 360);
    // 台座（朱の円盤）
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(lx, ly + 6, 120, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COL.shuDark; ctx.beginPath(); ctx.ellipse(lx, ly, 110, 18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = COL.kin; ctx.lineWidth = 2; ctx.stroke();
    const k = this.swap, s = 3.6 * (0.85 + 0.15 * k);
    drawHeroDressed(ctx, id, 'idle', (t * 6) | 0, lx, ly + 2, { sx: s, sy: s, alpha: k, weaponId: save.data.equipped && save.data.weapons[save.data.equipped] ? save.data.equipped : null, time: t });
    // ---- 右：能力（和紙） ----
    const px = vw * 0.5, py = 64, pw = Math.min(520, vw - px - 30), ph = 336;
    drawWashi(ctx, px, py, pw, ph);
    drawText(ctx, c.name, px + 28, py + 40, ST.name);
    drawText(ctx, c.title, px + 30 + Math.max(110, c.name.length * 40), py + 44, ST.sub);
    // 能力ゲージ（5段階）
    for (let i = 0; i < 4; i++) {
      const [key, label] = STATS[i];
      const v = c[key], gy = py + 86 + i * 32;
      drawText(ctx, label, px + 30, gy, ST.label);
      for (let j = 0; j < 5; j++) {
        const bx = px + 130 + j * 40;
        roundRect(ctx, bx, gy - 9, 34, 18, 5);
        if (j < v) { const gg = ctx.createLinearGradient(0, gy - 9, 0, gy + 9); gg.addColorStop(0, COL.kinLight); gg.addColorStop(1, '#c08a2a'); ctx.fillStyle = gg; }
        else ctx.fillStyle = 'rgba(90,60,40,0.2)';
        ctx.fill(); ctx.strokeStyle = 'rgba(90,60,40,0.55)'; ctx.lineWidth = 1; ctx.stroke();
      }
      if (key === 'hp') drawText(ctx, `ハート${v + 1}`, px + 340, gy, ST.hearts);
    }
    // 技と固有能力
    const bw = pw - 56;
    let yy = py + 218;
    this.skillBox(ctx, px + 28, yy, bw, '技', c.tech, c.techDesc);
    yy += 56;
    this.skillBox(ctx, px + 28, yy, bw, '固有', c.skill, c.skillDesc);
    // ---- 下：キャラの札 ----
    const n = this.ids.length, cw = 84, gap = 14, tot = n * cw + (n - 1) * gap, cy = 418;
    for (let i = 0; i < n; i++) {
      const r = this.cards[i]; r.x = vw / 2 - tot / 2 + i * (cw + gap) + vw * 0.0; r.y = cy; r.w = cw; r.h = 76;
      const on = i === this.sel;
      drawTag(ctx, r.x, r.y - (on ? 4 : 0), r.w, r.h, on, false, on ? 0.5 + 0.5 * Math.sin(t * 5) : 0);
      drawFace(ctx, this.ids[i], r.x + r.w / 2, r.y + 34 - (on ? 4 : 0), 26, on ? t : 0);
      drawText(ctx, CHARS[this.ids[i]].name, r.x + r.w / 2, r.y + r.h - 10 - (on ? 4 : 0), ST.back);
    }
    // 決定・戻る
    const ok = this.okRect; ok.w = 150; ok.h = 46; ok.x = vw - ok.w - 26; ok.y = vh - ok.h - 14;
    drawTag(ctx, ok.x, ok.y, ok.w, ok.h, true, false, 0.5 + 0.5 * Math.sin(t * 4));
    drawText(ctx, 'けってい', ok.x + ok.w / 2, ok.y + ok.h / 2 + 1, ST.btn);
    const bk = this.backRect; bk.w = 110; bk.h = 40; bk.x = 24; bk.y = vh - bk.h - 16;
    drawTag(ctx, bk.x, bk.y, bk.w, bk.h, false, false);
    drawText(ctx, 'もどる', bk.x + bk.w / 2, bk.y + bk.h / 2 + 1, ST.back);
    drawText(ctx, touch.enabled ? '札をタップで選ぶ・もう一度タップで決定' : '←→ で選ぶ　Z で決定　X でもどる', vw / 2, vh - 18, ST.hint);
  },
  skillBox(ctx, x, y, w, tag, name, desc) {
    roundRect(ctx, x, y - 2, 52, 24, 6); ctx.fillStyle = tag === '技' ? COL.shu : COL.ai; ctx.fill();
    drawText(ctx, tag, x + 26, y + 10, ST.headC);
    drawText(ctx, name, x + 62, y + 10, ST.label);
    drawWrapped(ctx, desc, x + 4, y + 26, w - 4, ST.body, 20);
  },
};
