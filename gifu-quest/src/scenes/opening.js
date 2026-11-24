import { game } from '../game.js';
import { input } from '../core/input.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { touch } from '../ui/touch.js';
import { drawSprite } from '../gfx/atlas.js';
import { drawText, drawWrapped, textLength, drawOrb, ORB_COLORS, roundRect, drawMomiji, COL } from '../ui/text.js';
import { drawCastleHill } from './title.js';
// オープニング（設計書 3章・9章）：紙芝居風（絵＋文字）。いつでも飛ばせる。2回目以降は自動で飛ばす。担当：UI

// ---- 絵の部品 ----
export const P = {
  sky(ctx, x, y, w, h, top, bottom) { const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, top); g.addColorStop(1, bottom); ctx.fillStyle = g; ctx.fillRect(x, y, w, h); },
  hills(ctx, x, y, w, h, base, amp, color, seed = 1) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y + h);
    for (let i = 0; i <= 24; i++) { const px = x + w * i / 24; ctx.lineTo(px, y + h * base - h * amp * (0.5 + 0.5 * Math.sin(i * 0.7 + seed) * Math.cos(i * 0.31 + seed * 2))); }
    ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
  },
  volcano(ctx, cx, by, s, color, glow) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(cx - 200 * s, by); ctx.lineTo(cx - 40 * s, by - 150 * s); ctx.lineTo(cx + 30 * s, by - 150 * s); ctx.lineTo(cx + 220 * s, by); ctx.closePath(); ctx.fill();
    if (glow) { const g = ctx.createRadialGradient(cx - 5 * s, by - 150 * s, 2, cx - 5 * s, by - 150 * s, 90 * s); g.addColorStop(0, `rgba(255,140,60,${glow})`); g.addColorStop(1, 'rgba(255,80,40,0)'); ctx.fillStyle = g; ctx.fillRect(cx - 120 * s, by - 260 * s, 240 * s, 200 * s); }
  },
  moon(ctx, x, y, r) { ctx.fillStyle = '#fff4d0'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,244,208,0.15)'; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill(); },
  // 竜の影（くねる体）
  dragon(ctx, x, y, s, t, color) {
    ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineWidth = 18 * s;
    ctx.beginPath();
    for (let i = 0; i <= 30; i++) { const u = i / 30; const px = x - 220 * s * u, py = y + Math.sin(u * 7 + t * 2) * 26 * s + u * 40 * s; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x + 14 * s, y - 4 * s, 26 * s, 15 * s, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 2 * s, y - 14 * s); ctx.lineTo(x - 14 * s, y - 42 * s); ctx.lineTo(x + 12 * s, y - 18 * s); ctx.fill();
    ctx.fillStyle = '#ffd040'; ctx.beginPath(); ctx.arc(x + 22 * s, y - 8 * s, 3.5 * s, 0, Math.PI * 2); ctx.fill();
  },
  hero(ctx, id, x, y, s, t, anim = 'idle', flip = false) { drawSprite(ctx, `hero_${id}_${anim}`, (t * 8) | 0, x, y, { sx: s, sy: s, flip }); },
  gassho(ctx, x, y, s, color, snow) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x - 40 * s, y); ctx.lineTo(x, y - 62 * s); ctx.lineTo(x + 40 * s, y); ctx.closePath(); ctx.fill();
    ctx.fillRect(x - 30 * s, y, 60 * s, 22 * s);
    if (snow) { ctx.fillStyle = '#f4f8ff'; ctx.beginPath(); ctx.moveTo(x - 42 * s, y + 1); ctx.lineTo(x, y - 64 * s); ctx.lineTo(x + 42 * s, y + 1); ctx.lineTo(x + 30 * s, y - 4 * s); ctx.lineTo(x, y - 50 * s); ctx.lineTo(x - 30 * s, y - 4 * s); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,200,110,0.9)'; ctx.fillRect(x - 6 * s, y + 6 * s, 12 * s, 8 * s);
  },
  boat(ctx, x, y, s, t) {
    ctx.fillStyle = '#2a1a14'; ctx.beginPath(); ctx.moveTo(x - 60 * s, y); ctx.lineTo(x + 60 * s, y); ctx.lineTo(x + 46 * s, y + 12 * s); ctx.lineTo(x - 50 * s, y + 12 * s); ctx.closePath(); ctx.fill();
    ctx.fillRect(x + 40 * s, y - 40 * s, 3 * s, 40 * s);
    const f = 0.8 + 0.2 * Math.sin(t * 13);
    const g = ctx.createRadialGradient(x + 42 * s, y - 46 * s, 1, x + 42 * s, y - 46 * s, 40 * s * f); g.addColorStop(0, 'rgba(255,200,80,0.95)'); g.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + 42 * s, y - 46 * s, 40 * s * f, 0, Math.PI * 2); ctx.fill();
  },
  lanterns(ctx, x0, x1, y, t) {
    ctx.strokeStyle = 'rgba(40,20,10,0.8)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo((x0 + x1) / 2, y + 26, x1, y); ctx.stroke();
    for (let i = 0; i < 8; i++) { const u = (i + 0.5) / 8, lx = x0 + (x1 - x0) * u, ly = y + 26 * 4 * u * (1 - u) * 0.5 + 10 + Math.sin(t * 2 + i) * 1.5; ctx.fillStyle = 'rgba(255,170,70,0.25)'; ctx.beginPath(); ctx.arc(lx, ly, 14, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = i % 2 ? '#e8503a' : '#ffb04a'; ctx.beginPath(); ctx.ellipse(lx, ly, 6, 9, 0, 0, Math.PI * 2); ctx.fill(); }
  },
  rain(ctx, x, y, w, h, t, n = 50) { ctx.strokeStyle = 'rgba(200,220,255,0.45)'; ctx.lineWidth = 1.3; ctx.beginPath(); for (let i = 0; i < n; i++) { const rx = x + ((i * 97.3 + t * 60) % w), ry = y + ((i * 41.7 + t * 520) % h); ctx.moveTo(rx, ry); ctx.lineTo(rx - 5, ry + 14); } ctx.stroke(); },
  snow(ctx, x, y, w, h, t, n = 40) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = 0; i < n; i++) { const sx = x + ((i * 83.1 + Math.sin(t + i) * 12 + t * 10) % w), sy = y + ((i * 37.9 + t * 40) % h); ctx.beginPath(); ctx.arc(sx, sy, 1.5 + (i % 3), 0, Math.PI * 2); ctx.fill(); } },
  sixOrbs(ctx, cx, cy, r, t, spread = 1, glow = 1) {
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + t * 0.5; drawOrb(ctx, cx + Math.cos(a) * r * spread, cy + Math.sin(a) * r * 0.45 * spread, 9, ORB_COLORS[i], glow); }
  },
};

// ---- オープニングの各場面（オリジナルの話） ----
export const OPENING = [
  {
    text: 'むかし、美濃と飛騨の山あいには「六つの宝珠」がありました。宝珠は金華山の城にまつられ、晴れも雨も雪も、季節のめぐりを ほどよく見守っていました。',
    draw(ctx, x, y, w, h, t) {
      P.sky(ctx, x, y, w, h, '#2a4a8a', '#f4c890');
      P.hills(ctx, x, y, w, h, 0.78, 0.12, '#6a5a7a', 2);
      drawCastleHill(ctx, x + w * 0.5, y + h * 0.42, y + h, 1.1, '#3a2a40');
      P.sixOrbs(ctx, x + w * 0.5, y + h * 0.2, 90, t);
      P.hills(ctx, x, y, w, h, 0.95, 0.06, '#2a1e2e', 5);
    },
  },
  {
    text: 'ある秋の夜。乗鞍の火の山の奥ふかくで、長い眠りについていた「火の竜」が、ふいに目をさましました。',
    draw(ctx, x, y, w, h, t) {
      P.sky(ctx, x, y, w, h, '#0e0a1e', '#4a1a2a');
      P.moon(ctx, x + w * 0.8, y + h * 0.2, 22);
      P.volcano(ctx, x + w * 0.45, y + h, 1.3, '#1a0e14', 0.6 + 0.3 * Math.sin(t * 3));
      P.dragon(ctx, x + w * 0.55 + Math.sin(t) * 10, y + h * 0.3 + Math.sin(t * 1.3) * 6, 1, t, '#120810');
    },
  },
  {
    text: '竜のはいた嵐が城をおそい、六つの宝珠は夜空へ ちりぢりに。光は岐阜の各地 ── 金華山、長良川、郡上、高山、白川郷、そして乗鞍へと落ちていきました。',
    draw(ctx, x, y, w, h, t) {
      P.sky(ctx, x, y, w, h, '#101a36', '#3a3a5a');
      P.rain(ctx, x, y, w, h, t, 40);
      P.hills(ctx, x, y, w, h, 0.85, 0.15, '#1a1a2a', 3);
      for (let i = 0; i < 6; i++) {
        const u = ((t * 0.35 + i * 0.13) % 1);
        const ox = x + w * (0.12 + i * 0.15) + Math.sin(i * 2) * 20, oy = y + h * (0.1 + u * 0.65);
        ctx.strokeStyle = 'rgba(255,240,200,0.25)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox - 10, oy - 60); ctx.stroke();
        drawOrb(ctx, ox, oy, 8, ORB_COLORS[i], 1);
      }
    },
  },
  {
    text: '宝珠をひろった山の生き物たちは、その力にのまれて暴れだしました。空はくるい、町の人びとは困りはてています。',
    draw(ctx, x, y, w, h, t) {
      P.sky(ctx, x, y, w, h, '#3a3a4a', '#6a6a7a');
      P.hills(ctx, x, y, w, h, 0.7, 0.1, '#4a4a5a', 4);
      for (let i = 0; i < 4; i++) P.gassho(ctx, x + w * (0.15 + i * 0.22), y + h * 0.78, 0.8, '#2a2a30', i % 2 === 0);
      P.snow(ctx, x, y, w, h, t, 20); P.rain(ctx, x, y, w * 0.5, h, t, 20);
      // 暴れる影（目が光る）
      for (let i = 0; i < 3; i++) {
        const ex = x + w * (0.25 + i * 0.25), ey = y + h * 0.62 + Math.abs(Math.sin(t * 3 + i)) * -14;
        ctx.fillStyle = '#16121a'; ctx.beginPath(); ctx.ellipse(ex, ey, 28, 22, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff4a3a'; ctx.beginPath(); ctx.arc(ex - 8, ey - 4, 3, 0, Math.PI * 2); ctx.arc(ex + 8, ey - 4, 3, 0, Math.PI * 2); ctx.fill();
      }
      P.hills(ctx, x, y, w, h, 0.98, 0.04, '#1a1a20', 9);
    },
  },
  {
    text: 'そこへ立ちあがった四人の仲間。森のからくりロボ「リーフ」、鵜匠の娘「ミナモ」、刃物職人「ゲン」、白川郷の雪っ子「ハク」。',
    draw(ctx, x, y, w, h, t) {
      P.sky(ctx, x, y, w, h, '#5a9ad8', '#f4e4c0');
      P.hills(ctx, x, y, w, h, 0.72, 0.1, '#7aa86a', 1);
      ctx.fillStyle = '#4a7a3a'; ctx.fillRect(x, y + h * 0.82, w, h * 0.18);
      const ids = ['leaf', 'minamo', 'gen', 'haku'];
      for (let i = 0; i < 4; i++) {
        const hx = x + w * (0.2 + i * 0.2), hy = y + h * 0.88;
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(hx, hy, 34, 7, 0, 0, Math.PI * 2); ctx.fill();
        P.hero(ctx, ids[i], hx, hy, 2.1, t + i * 0.3, 'idle');
      }
    },
  },
  {
    text: '「六つの宝珠を とりもどして、岐阜の空に晴れを！」 ── 四人の旅が、いま始まります。',
    draw(ctx, x, y, w, h, t) {
      P.sky(ctx, x, y, w, h, '#ffb070', '#fff0c8');
      const g = ctx.createRadialGradient(x + w * 0.5, y + h * 0.75, 10, x + w * 0.5, y + h * 0.75, w * 0.5);
      g.addColorStop(0, 'rgba(255,255,220,0.95)'); g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      P.hills(ctx, x, y, w, h, 0.78, 0.18, '#c87a5a', 6);
      P.hills(ctx, x, y, w, h, 0.9, 0.08, '#5a3a3a', 2);
      const ids = ['leaf', 'minamo', 'gen', 'haku'];
      for (let i = 0; i < 4; i++) P.hero(ctx, ids[i], x + w * (0.3 + i * 0.12), y + h * 0.86, 1.4, t + i * 0.2, 'walk', false);
      ctx.save(); ctx.translate(x + w * 0.85, y + h * 0.2); ctx.rotate(t); drawMomiji(ctx, 12, '#e05a2a'); ctx.restore();
    },
  },
];

const TEXT_ST = { size: 21, color: COL.sumi, align: 'left', baseline: 'top', weight: 'bold' };
const PAGE_ST = { size: 15, color: COL.kinari, stroke: COL.sumi, strokeW: 3, align: 'center', baseline: 'middle' };
const SKIP_ST = { size: 15, color: COL.kinari, stroke: COL.sumi, strokeW: 3, align: 'center', baseline: 'middle' };
const NEXT_ST = { size: 14, color: COL.woodDark, align: 'right', baseline: 'middle', weight: 'bold' };

// 紙芝居の進行（オープニングとエンディングで共通）
export class Kamishibai {
  constructor(pages) { this.pages = pages; this.i = 0; this.t = 0; this.slide = 0; this.done = false; this.skipRect = { x: 0, y: 0, w: 120, h: 40 }; this.len = 0; }
  reset() { this.i = 0; this.t = 0; this.slide = 0; this.done = false; this.len = 0; }
  // 戻り値：'skip' | 'end' | null
  update(dt) {
    this.t += dt; this.slide = Math.max(0, this.slide - dt * 3);
    const tp = touch.tap();
    const S = this.skipRect;
    if (input.pressed.back || input.pressed.pause || (tp && tp.x >= S.x && tp.x <= S.x + S.w && tp.y >= S.y && tp.y <= S.y + S.h)) { audio.sfx('cancel'); return 'skip'; }
    if (this.t < 0.3) return null;
    if (tp || input.pressed.confirm || input.pressed.jump) {
      if (this.chars() < this.len) { this.t = this.len / 30 + 0.5; return null; }
      audio.sfx('select');
      if (this.i >= this.pages.length - 1) return 'end';
      this.i++; this.t = 0; this.slide = 1; this.len = 0;
    }
    // 自動送り：全部出てから5秒
    if (this.len && this.chars() >= this.len && this.t > this.len / 30 + 5) {
      if (this.i >= this.pages.length - 1) return 'end';
      this.i++; this.t = 0; this.slide = 1; this.len = 0;
    }
    return null;
  }
  chars() { return Math.floor(Math.max(0, this.t - 0.4) * 30); }
  draw(ctx, vw, vh, bgTop = '#1a1018') {
    // 背景：墨＋木の舞台
    const g = ctx.createLinearGradient(0, 0, 0, vh); g.addColorStop(0, bgTop); g.addColorStop(1, '#0c0808');
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    const fw = 700, fh = 330, fx = vw / 2 - fw / 2, fy = 26;
    // 木の枠（紙芝居の舞台）
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
    roundRect(ctx, fx - 18, fy - 14, fw + 36, fh + 28, 10);
    const wg = ctx.createLinearGradient(0, fy - 14, 0, fy + fh + 14); wg.addColorStop(0, COL.woodLight); wg.addColorStop(1, COL.woodDark);
    ctx.fillStyle = wg; ctx.fill(); ctx.restore();
    ctx.strokeStyle = COL.kin; ctx.lineWidth = 2; roundRect(ctx, fx - 12, fy - 8, fw + 24, fh + 16, 6); ctx.stroke();
    // 絵（引き抜く動き）
    const page = this.pages[this.i];
    ctx.save();
    ctx.beginPath(); ctx.rect(fx, fy, fw, fh); ctx.clip();
    page.draw(ctx, fx, fy, fw, fh, this.t);
    if (this.slide > 0 && this.i > 0) {
      const s = this.slide * this.slide;
      ctx.save(); ctx.beginPath(); ctx.rect(fx - fw * (1 - s), fy, fw, fh); ctx.clip();
      ctx.translate(-fw * (1 - s), 0);
      this.pages[this.i - 1].draw(ctx, fx, fy, fw, fh, this.t);
      ctx.restore();
    }
    // 和紙の質感
    ctx.fillStyle = 'rgba(243,234,215,0.06)'; ctx.fillRect(fx, fy, fw, fh);
    ctx.restore();
    // 文（和紙の帯）
    const tx = vw / 2 - 380, ty = fy + fh + 26, tw = 760, th = 120;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 10;
    roundRect(ctx, tx, ty, tw, th, 10); ctx.fillStyle = COL.washi; ctx.fill(); ctx.restore();
    ctx.strokeStyle = COL.kin; ctx.lineWidth = 2; roundRect(ctx, tx + 4, ty + 4, tw - 8, th - 8, 8); ctx.stroke();
    if (!this.len) this.len = textLength(ctx, page.text, tw - 56, TEXT_ST.size);
    drawWrapped(ctx, page.text, tx + 28, ty + 18, tw - 56, TEXT_ST, 31, this.chars());
    if (this.chars() >= this.len) drawText(ctx, (touch.enabled ? 'タップで次へ ▶' : 'Z で次へ ▶'), tx + tw - 18, ty + th - 16 + Math.sin(this.t * 5) * 2, NEXT_ST);
    // ページ数と「とばす」
    drawText(ctx, `${this.i + 1} / ${this.pages.length}`, 60, vh - 22, PAGE_ST);
    const S = this.skipRect; S.x = vw - 160; S.y = vh - 44; S.w = 146; S.h = 36;
    roundRect(ctx, S.x, S.y, S.w, S.h, 18); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill(); ctx.strokeStyle = 'rgba(243,234,215,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    drawText(ctx, touch.enabled ? 'とばす ▶▶' : 'Esc：とばす', S.x + S.w / 2, S.y + S.h / 2 + 1, SKIP_ST);
  }
}

export const openingScene = {
  show: new Kamishibai(OPENING),
  enter(params) {
    this.params = params; this.show.reset(); this.leaving = false;
    touch.show('menu');
    audio.bgm('title');
    this._auto = save.data.seenOpening && !params.force;   // 2回目以降は自動で飛ばす
  },
  exit() { touch.hide(); },
  update(dt) {
    if (this._auto) { this._auto = false; this.leaving = true; game.go('select', { from: 'opening' }, 'none'); return; }
    if (this.leaving) return;
    const r = this.show.update(dt);
    if (r) { this.leaving = true; this.finish('wipe'); }
  },
  finish(kind) {
    save.data.seenOpening = true; save.write();
    game.go('select', { from: 'opening' }, kind);
  },
  draw(ctx, a, vw, vh) {
    this.show.draw(ctx, vw, vh);
  },
};
