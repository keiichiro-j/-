import { input } from '../core/input.js';
// 一時停止メニュー（設計書 9章）。担当：UI。update() は選ばれた項目のキー（'resume'|'retry'|'map'|'settings'）を返す
const ITEMS = [['resume', '続ける'], ['retry', 'やり直す'], ['map', 'マップへ戻る'], ['settings', '設定']];
export const pauseMenu = {
  sel: 0,
  open() { this.sel = 0; },
  update(dt) {
    if (input.pressed.down) this.sel = (this.sel + 1) % ITEMS.length;
    if (input.pressed.up) this.sel = (this.sel + ITEMS.length - 1) % ITEMS.length;
    if (input.pressed.pause || input.pressed.back) return 'resume';
    if (input.pressed.confirm || input.pressed.jump) return ITEMS[this.sel][0];
    return null;
  },
  draw(ctx, vw, vh) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, vw, vh);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 28px sans-serif';
    ITEMS.forEach(([, label], i) => { ctx.fillStyle = i === this.sel ? '#ffd76a' : '#fff'; ctx.fillText(label, vw / 2, vh / 2 - 60 + i * 44); });
  },
};
