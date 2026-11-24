import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { touch } from '../ui/touch.js';
import { drawText, drawWrapped, textLength, roundRect, COL } from '../ui/text.js';
// 看板の説明文（設計書 6章）。巻物風の枠で文字送り。担当：UI。updateDialogue が true を返すと閉じる
const CPS = 38;   // 1秒あたりの文字数
const TITLE = { size: 24, color: COL.shuDark, align: 'left', baseline: 'middle', weight: 'bold', serif: true };
const BODY = { size: 19, color: COL.sumi, align: 'left', baseline: 'top', weight: 'bold' };
const NEXT = { size: 14, color: COL.woodDark, align: 'right', baseline: 'middle', weight: 'bold' };
const BOX = { w: 760, h: 176 };

export function updateDialogue(W, dt) {
  const d = W.dialogue;
  d.t += dt;
  if (d.t < 0.25) { touch.clearTap(); return false; }
  const tp = touch.tap();
  const go = tp || input.pressed.confirm || input.pressed.jump || input.pressed.attack || input.pressed.up || input.pressed.back;
  if (!go) return false;
  const n = d._len ?? Infinity;
  if (d.t * CPS < n) { d.t = n / CPS + 0.3; return false; }   // まだ途中なら全部出す
  audio.sfx('cancel');
  return true;
}

export function drawDialogue(ctx, W, vw, vh) {
  const d = W.dialogue;
  const k = Math.min(1, d.t / 0.18);
  const w = Math.min(BOX.w, vw - 60), h = BOX.h;
  const x = vw / 2 - w / 2, y = vh - h - 26 + (1 - k) * 30;
  ctx.save();
  ctx.globalAlpha = k;
  // 巻物：両端の軸
  const rodW = 16;
  ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
  ctx.fillStyle = COL.washi; ctx.fillRect(x, y, w, h);
  ctx.shadowColor = 'transparent';
  // 上下の帯（藍）
  ctx.fillStyle = COL.ai; ctx.fillRect(x, y, w, 12); ctx.fillRect(x, y + h - 12, w, 12);
  ctx.fillStyle = COL.kin; ctx.fillRect(x, y + 12, w, 2); ctx.fillRect(x, y + h - 14, w, 2);
  for (const sx of [x - rodW + 4, x + w - 4]) {
    const g = ctx.createLinearGradient(sx, 0, sx + rodW, 0);
    g.addColorStop(0, COL.woodDark); g.addColorStop(0.5, COL.woodLight); g.addColorStop(1, COL.woodDark);
    ctx.fillStyle = g; roundRect(ctx, sx, y - 8, rodW, h + 16, 6); ctx.fill();
    ctx.fillStyle = COL.kin; ctx.fillRect(sx, y - 8, rodW, 5); ctx.fillRect(sx, y + h + 3, rodW, 5);
  }
  // 題名（朱の印）
  ctx.fillStyle = COL.shu; ctx.beginPath(); ctx.arc(x + 34, y + 40, 9, 0, Math.PI * 2); ctx.fill();
  drawText(ctx, d.title || '', x + 52, y + 40, TITLE);
  ctx.strokeStyle = 'rgba(142,42,28,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 26, y + 60); ctx.lineTo(x + w - 26, y + 60); ctx.stroke();
  const text = d.text || '';
  if (d._len == null) d._len = textLength(ctx, text, w - 70, BODY.size);
  const chars = Math.floor(d.t * CPS);
  drawWrapped(ctx, text, x + 34, y + 70, w - 70, BODY, 28, chars);
  if (chars >= d._len) {
    const b = Math.sin(d.t * 6) * 3;
    drawText(ctx, touch.enabled ? 'タップで閉じる ▼' : 'Z で閉じる ▼', x + w - 28, y + h - 28 + b * 0.3, NEXT);
  }
  ctx.restore();
}
