import { defineSprite } from '../gfx/atlas.js';
// アイテム・小物・技のエフェクトの絵（担当：アート）
export function defineProps() {
  const circle = (color) => (ctx, f, d) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(d.w / 2, d.h / 2, Math.min(d.w, d.h) / 2 - 1, 0, 7); ctx.fill(); };
  defineSprite('item_coin', { w: 20, h: 24, frames: 1, draw: circle('#ffd23a') });
  defineSprite('item_sarubobo', { w: 28, h: 32, draw: circle('#e0352b') });
  defineSprite('item_skewer', { w: 30, h: 30, draw: circle('#a0522d') });
  defineSprite('item_heart', { w: 24, h: 24, draw: circle('#ff6b8a') });
  for (let i = 0; i <= 7; i++) defineSprite(`item_orb_${i}`, { w: 36, h: 36, draw: circle('#9fe0ff') });
  defineSprite('prop_checkpoint', { w: 30, h: 72, frames: 2, draw: (ctx, f) => { ctx.fillStyle = '#7a5230'; ctx.fillRect(13, 0, 4, 72); ctx.fillStyle = f ? '#ff5a3a' : '#888'; ctx.fillRect(17, 4, 13, 10); } });
  defineSprite('prop_sign', { w: 40, h: 44, draw: (ctx) => { ctx.fillStyle = '#8b5a2b'; ctx.fillRect(18, 20, 4, 24); ctx.fillRect(2, 2, 36, 22); } });
  defineSprite('ui_up_hint', { w: 20, h: 20, frames: 1, ox: 10, oy: 20, draw: (ctx) => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(10, 2); ctx.lineTo(18, 14); ctx.lineTo(2, 14); ctx.fill(); } });
  const fx = (name, w, h, color) => defineSprite(name, { w, h, ox: w / 2, oy: h / 2, draw: circle(color) });
  fx('fx_leaf', 20, 14, '#7ccf4f'); fx('fx_leaf_big', 34, 26, '#a8f06a'); fx('fx_ukai', 26, 18, '#222'); fx('fx_bullet', 16, 16, '#ff9a3a');
  defineSprite('fx_slash', { w: 90, h: 70, frames: 4, ox: 45, oy: 35, draw: (ctx, f) => { ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 6 - f; ctx.beginPath(); ctx.arc(20, 35, 50, -1.1 + f * 0.1, 1.1); ctx.stroke(); } });
}
