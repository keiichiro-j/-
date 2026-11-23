import { input } from '../core/input.js';
import { renderer } from '../gfx/renderer.js';
// スマホのタッチ操作（設計書 5章・9章）。担当：UI
// 左下：左右パッド（指を置いたままスライドで向きを切替、下にスライドでしゃがむ）、右下：ジャンプ（大）・技（小）、右上：一時停止
export const touch = {
  mode: null, active: false, touches: new Map(), layout: null, enabled: false,
  init(canvas) {
    this.enabled = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const opt = { passive: false };
    const handle = (e) => { e.preventDefault(); this.active = true; this.sync(e.touches); };
    canvas.addEventListener('touchstart', handle, opt);
    canvas.addEventListener('touchmove', handle, opt);
    canvas.addEventListener('touchend', handle, opt);
    canvas.addEventListener('touchcancel', handle, opt);
  },
  buttons(vw, vh) {
    return {
      pad: { x: 40, y: vh - 190, w: 260, h: 170 },
      jump: { x: vw - 120, y: vh - 110, r: 58 },
      attack: { x: vw - 250, y: vh - 80, r: 44 },
      pause: { x: vw - 44, y: 40, r: 28 },
    };
  },
  sync(list) {
    const vw = renderer.viewW, vh = renderer.viewH;
    const B = this.buttons(vw, vh);
    const st = { left: false, right: false, down: false, jump: false, attack: false, pause: false, confirm: false };
    for (const t of list) {
      const p = renderer.toLogical(t.clientX, t.clientY);
      if (this.mode !== 'play') { st.confirm = true; continue; }
      if (p.x < vw * 0.4 && p.y > vh * 0.4) {
        const cx = B.pad.x + B.pad.w / 2;
        if (p.x < cx - 18) st.left = true; else if (p.x > cx + 18) st.right = true;
        if (p.y > B.pad.y + B.pad.h * 0.72) st.down = true;
      } else if (Math.hypot(p.x - B.pause.x, p.y - B.pause.y) < B.pause.r * 1.4) st.pause = true;
      else if (Math.hypot(p.x - B.attack.x, p.y - B.attack.y) < B.attack.r * 1.35) st.attack = true;
      else if (p.x > vw * 0.5) st.jump = true;
    }
    for (const [k, v] of Object.entries(st)) input.setVirtual(k, v);
    this.state = st;
  },
  show(mode) { this.mode = mode; },
  hide() { this.mode = null; },
  draw(ctx, vw, vh) {
    if (!this.enabled || this.mode !== 'play') return;
    const B = this.buttons(vw, vh), s = this.state || {};
    ctx.save();
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#000'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(B.pad.x, B.pad.y + 40, B.pad.w, B.pad.h - 40, 40); ctx.fill(); ctx.stroke();
    for (const k of ['jump', 'attack', 'pause']) {
      const b = B[k];
      ctx.globalAlpha = s[k] ? 0.7 : 0.35;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  },
};
