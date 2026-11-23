import { input } from '../core/input.js';
// 看板の説明文（設計書 6章）。担当：UI。updateDialogue が true を返すと閉じる
export function updateDialogue(W, dt) {
  W.dialogue.t += dt;
  return W.dialogue.t > 0.3 && (input.pressed.confirm || input.pressed.jump || input.pressed.attack || input.pressed.up || input.pressed.back);
}
export function drawDialogue(ctx, W, vw, vh) {
  const d = W.dialogue;
  ctx.fillStyle = 'rgba(20,14,10,0.85)'; ctx.fillRect(vw / 2 - 360, vh - 200, 720, 160);
  ctx.fillStyle = '#ffd76a'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(d.title || '', vw / 2 - 340, vh - 186);
  ctx.fillStyle = '#fff'; ctx.font = '18px sans-serif';
  ctx.fillText(d.text || '', vw / 2 - 340, vh - 150);
}
