import { drawTag, drawText, font, COL } from './text.js';
import { drawSprite } from '../gfx/atlas.js';
// 「称号を得た」「お題達成」の小さな通知（木札が右から滑り込む）。担当：やり込み（docs/content.md）
// toast.push(kind, name, reward) で積み、各画面の draw の最後に toast.draw(ctx, vw, vh) を呼ぶ。
// 時間は実時間（画面の切り替え中も進む）。1枚ずつ順に出す。たまりすぎたら1枚にまとめる
const LIFE = 3.0, IN = 0.25, OUT = 0.3, MAX_Q = 4;
const KIND = {
  title: { head: '称号を得た', seal: '称' },
  mission: { head: 'お題達成', seal: '題' },
  rush: { head: '腕試し', seal: '試' },
};
const ST = {
  head: { size: 12, color: COL.kinLight, stroke: COL.woodDark, strokeW: 3, align: 'left', baseline: 'middle' },
  name: { size: 17, color: '#fff8e6', stroke: COL.woodDark, strokeW: 3.5, align: 'left', baseline: 'middle' },
  nameS: { size: 14, color: '#fff8e6', stroke: COL.woodDark, strokeW: 3, align: 'left', baseline: 'middle' },
  seal: { size: 18, color: '#fff4e0', align: 'center', baseline: 'middle', serif: true },
  reward: { size: 15, color: COL.kinLight, stroke: COL.sumi, strokeW: 3, align: 'right', baseline: 'middle' },
};
const queue = [];
let cur = null, t0 = 0;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

export const toast = {
  shown: 0,                   // 出した数（テスト用）
  last: null,                 // 最後に出した通知（テスト用）
  push(kind, name, reward = 0) {
    queue.push({ kind, name, reward });
    // たまりすぎたら、残りを1枚にまとめる
    if (queue.length > MAX_Q) {
      const rest = queue.splice(MAX_Q - 1);
      const k = rest.every((q) => q.kind === rest[0].kind) ? rest[0].kind : 'title';
      queue.push({ kind: k, name: `ほか${rest.length}つ`, reward: rest.reduce((s, q) => s + q.reward, 0) });
    }
  },
  get busy() { return !!cur || queue.length > 0; },
  clear() { queue.length = 0; cur = null; },
  // y：上端（既定は HUD の下）。left：左から出す（結果画面など右に表がある画面）
  draw(ctx, vw, vh, y = 122, left = false) {
    const tn = now();
    if (cur && tn - t0 > LIFE) cur = null;
    if (!cur && queue.length) { cur = queue.shift(); t0 = tn; this.shown++; this.last = cur; }
    if (!cur) return;
    const e = tn - t0;
    const kIn = Math.min(1, e / IN), kOut = Math.min(1, Math.max(0, (LIFE - e) / OUT));
    const ease = 1 - (1 - kIn) * (1 - kIn);
    const w = 300, h = 54, x = left ? 14 - (1 - ease) * (w + 30) : vw - w - 14 + (1 - ease) * (w + 30);
    const K = KIND[cur.kind] || KIND.title;
    ctx.save();
    ctx.globalAlpha = kOut;
    // 吊り紐
    ctx.strokeStyle = 'rgba(40,24,14,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 40, y - 14); ctx.lineTo(x + 40, y + 2); ctx.moveTo(x + w - 40, y - 14); ctx.lineTo(x + w - 40, y + 2); ctx.stroke();
    drawTag(ctx, x, y, w, h, false, false);
    // 朱の印
    const sx = x + 30, sy = y + h / 2, pulse = e < 0.6 ? 1 + Math.sin(e / 0.6 * Math.PI) * 0.15 : 1;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(-0.12); ctx.scale(pulse, pulse);
    ctx.fillStyle = COL.shu; ctx.fillRect(-17, -17, 34, 34);
    ctx.strokeStyle = '#fff4e0'; ctx.lineWidth = 1.5; ctx.strokeRect(-14, -14, 28, 28);
    drawText(ctx, K.seal, 0, 1, ST.seal);
    ctx.restore();
    drawText(ctx, K.head, x + 56, y + 16, ST.head);
    const nm = `『${cur.name}』`;
    ctx.font = font(17);
    drawText(ctx, nm, x + 54, y + 36, ctx.measureText(nm).width > w - 64 ? ST.nameS : ST.name);
    if (cur.reward) {
      drawSprite(ctx, 'item_coin', 0, x + w - 66, y + 27, { sx: 0.6, sy: 0.6 });
      drawText(ctx, `+${cur.reward}`, x + w - 14, y + 20, ST.reward);
    }
    ctx.restore();
  },
};
