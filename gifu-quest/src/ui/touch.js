import { input } from '../core/input.js';
import { renderer } from '../gfx/renderer.js';
import { save, DEFAULT_TOUCH_LAYOUT } from '../core/save.js';
import { font, COL } from './text.js';
// スマホのタッチ操作（設計書 5章・9章）。担当：UI
// 左下：左右パッド（指を置いたままスライドで向きを切替、下にスライドでしゃがむ）
// 右下：ジャンプ（大）・技（小。押しっぱなしでダッシュ）、右上：一時停止
// メニュー画面ではタップ位置を各画面へ渡す：touch.tap() → {x,y}（論理座標）または null。マウスのクリックも同じ扱い
// 位置と大きさは save.data.settings.touchLayout（{pad|jump|attack|pause: {x,y,s}}、x,y は画面に対する割合の中心位置、s は倍率）

export { DEFAULT_TOUCH_LAYOUT };
const BASE = { padW: 250, padH: 132, jump: 62, attack: 44, pause: 26 };
const ROLE_KEYS = ['pad', 'jump', 'attack', 'pause'];
const VIRT = ['left', 'right', 'up', 'down', 'jump', 'attack', 'pause'];

export const touch = {
  mode: null, enabled: false, active: false,
  roles: new Map(),          // touch.identifier → 'pad'|'jump'|'attack'|'pause'
  state: { left: false, right: false, up: false, down: false, jump: false, attack: false, pause: false },
  pointer: { down: false, x: 0, y: 0, sx: 0, sy: 0, moved: false, mouse: false, id: null },
  _tap: { x: 0, y: 0, t: -1 },
  _B: { pad: { x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0, s: 1 }, jump: { x: 0, y: 0, r: 0 }, attack: { x: 0, y: 0, r: 0 }, pause: { x: 0, y: 0, r: 0 } },
  init(canvas) {
    this.enabled = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    const opt = { passive: false };
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault(); this.active = true; this.enabled = true;
      for (const t of e.changedTouches) {
        const p = renderer.toLogical(t.clientX, t.clientY);
        this._setTap(p.x, p.y);
        if (this.pointer.id == null) { const P = this.pointer; P.id = t.identifier; P.down = true; P.x = P.sx = p.x; P.y = P.sy = p.y; P.moved = false; P.mouse = false; }
        if (this.mode === 'play') this.roles.set(t.identifier, this.roleAt(p.x, p.y));
      }
      this.sync(e.touches);
    }, opt);
    const move = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === this.pointer.id) {
        const p = renderer.toLogical(t.clientX, t.clientY);
        const P = this.pointer; P.x = p.x; P.y = p.y; if (Math.hypot(P.x - P.sx, P.y - P.sy) > 8) P.moved = true;
      }
      this.sync(e.touches);
    };
    const end = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) { this.roles.delete(t.identifier); if (t.identifier === this.pointer.id) { this.pointer.down = false; this.pointer.id = null; } }
      this.sync(e.touches);
    };
    canvas.addEventListener('touchmove', move, opt);
    canvas.addEventListener('touchend', end, opt);
    canvas.addEventListener('touchcancel', end, opt);
    // マウス（PCでもメニューをクリックで選べる）
    canvas.addEventListener('mousedown', (e) => {
      const p = renderer.toLogical(e.clientX, e.clientY);
      this._setTap(p.x, p.y);
      const P = this.pointer; P.down = true; P.mouse = true; P.x = P.sx = p.x; P.y = P.sy = p.y; P.moved = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!renderer.canvas) return;
      const p = renderer.toLogical(e.clientX, e.clientY);
      const P = this.pointer; P.x = p.x; P.y = p.y; P.mouse = true; P.hover = true;
      if (P.down && Math.hypot(P.x - P.sx, P.y - P.sy) > 6) P.moved = true;
    });
    window.addEventListener('mouseup', () => { if (this.pointer.mouse) this.pointer.down = false; });
  },
  _setTap(x, y) { this._tap.x = x; this._tap.y = y; this._tap.t = performance.now(); },
  // 0.3秒以内のタップを1回だけ返す（返した後は消える）
  tap() {
    const T = this._tap;
    if (T.t < 0) return null;
    if (performance.now() - T.t > 300) { T.t = -1; return null; }
    T.t = -1;
    return T;
  },
  peekTap() { const T = this._tap; return T.t >= 0 && performance.now() - T.t <= 300 ? T : null; },
  clearTap() { this._tap.t = -1; },

  layoutData() {
    const L = save.data.settings.touchLayout;
    return L || DEFAULT_TOUCH_LAYOUT;
  },
  // 現在の配置（論理座標）。戻り値は使い回しのオブジェクト
  buttons(vw = renderer.viewW, vh = renderer.viewH, L = this.layoutData()) {
    const B = this._B;
    for (const k of ROLE_KEYS) {
      const d = L[k] || DEFAULT_TOUCH_LAYOUT[k];
      if (k === 'pad') {
        const s = d.s; B.pad.s = s;
        B.pad.w = BASE.padW * s; B.pad.h = BASE.padH * s;
        B.pad.cx = d.x * vw; B.pad.cy = d.y * vh;
        B.pad.x = B.pad.cx - B.pad.w / 2; B.pad.y = B.pad.cy - B.pad.h / 2;
      } else { B[k].x = d.x * vw; B[k].y = d.y * vh; B[k].r = BASE[k] * d.s; }
    }
    return B;
  },
  roleAt(x, y) {
    const vw = renderer.viewW, vh = renderer.viewH, B = this.buttons(vw, vh);
    if (Math.hypot(x - B.pause.x, y - B.pause.y) < B.pause.r * 1.5) return 'pause';
    if (Math.hypot(x - B.attack.x, y - B.attack.y) < B.attack.r * 1.35) return 'attack';
    if (Math.hypot(x - B.jump.x, y - B.jump.y) < B.jump.r * 1.5) return 'jump';
    const P = B.pad;
    if (x > P.x - 40 && x < P.x + P.w + 40 && y > P.y - 60) return 'pad';
    if (x < vw * 0.45 && y > vh * 0.3) return 'pad';
    if (x > vw * 0.5 && y > vh * 0.25) return 'jump';
    return null;
  },
  sync(list) {
    const st = this.state;
    for (const k of VIRT) st[k] = false;
    if (this.mode === 'play') {
      const B = this.buttons();
      for (const t of list) {
        const role = this.roles.get(t.identifier);
        if (!role) continue;
        if (role === 'pad') {
          const p = renderer.toLogical(t.clientX, t.clientY);
          const P = B.pad, dz = 14 * P.s;
          if (p.x < P.cx - dz) st.left = true; else if (p.x > P.cx + dz) st.right = true;
          if (p.y > P.cy + 26 * P.s) st.down = true;
          else if (p.y < P.cy - 34 * P.s) st.up = true;   // 上にスライド：看板を読む
        } else st[role] = true;
      }
    }
    for (const k of VIRT) input.setVirtual(k, st[k]);
  },
  // mode: 'play'（ボタンで操作）| 'menu'（タップで項目を選ぶ）
  show(mode) {
    if (this.mode !== mode) { this.roles.clear(); this.sync([]); }
    this.mode = mode;
    if (mode === 'play') this.clearTap();
  },
  hide() { this.roles.clear(); this.mode = null; this.sync([]); },

  draw(ctx, vw, vh) {
    if (!this.enabled || this.mode !== 'play') return;
    this.drawButtons(ctx, vw, vh, null, this.state);
  },
  // 設定画面の配置編集からも使う。sel: 強調する部品の名前
  drawButtons(ctx, vw, vh, sel, st, L) {
    const B = this.buttons(vw, vh, L || this.layoutData());
    st = st || this.state;
    ctx.save();
    ctx.lineWidth = 3;
    // パッド
    const P = B.pad;
    const padOn = st.left || st.right || st.down || st.up;
    ctx.globalAlpha = padOn ? 0.62 : 0.34;
    ctx.fillStyle = COL.sumi; ctx.strokeStyle = sel === 'pad' ? COL.kin : COL.kinari;
    ctx.beginPath(); ctx.roundRect(P.x, P.y, P.w, P.h, P.h * 0.45); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 0.85;
    const ar = 22 * P.s;
    this._arrow(ctx, P.x + P.w * 0.2, P.cy - 6 * P.s, ar, -1, st.left);
    this._arrow(ctx, P.x + P.w * 0.8, P.cy - 6 * P.s, ar, 1, st.right);
    // しゃがむ（下）の目印
    ctx.fillStyle = st.down ? COL.kin : 'rgba(243,234,215,0.75)';
    ctx.beginPath(); ctx.moveTo(P.cx - 12 * P.s, P.cy + 24 * P.s); ctx.lineTo(P.cx + 12 * P.s, P.cy + 24 * P.s); ctx.lineTo(P.cx, P.cy + 38 * P.s); ctx.closePath(); ctx.fill();
    // 上（看板を読む）の目印：小さめ
    ctx.fillStyle = st.up ? COL.kin : 'rgba(243,234,215,0.7)';
    ctx.beginPath(); ctx.moveTo(P.cx - 9 * P.s, P.cy - 36 * P.s); ctx.lineTo(P.cx + 9 * P.s, P.cy - 36 * P.s); ctx.lineTo(P.cx, P.cy - 47 * P.s); ctx.closePath(); ctx.fill();
    // 丸ボタン
    this._round(ctx, B.jump, st.jump, sel === 'jump', 'ジャンプ');
    this._round(ctx, B.attack, st.attack, sel === 'attack', '技');
    // 一時停止
    const Q = B.pause;
    ctx.globalAlpha = st.pause ? 0.8 : 0.45;
    ctx.fillStyle = COL.sumi; ctx.strokeStyle = sel === 'pause' ? COL.kin : COL.kinari;
    ctx.beginPath(); ctx.arc(Q.x, Q.y, Q.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 0.95; ctx.fillStyle = COL.kinari;
    ctx.fillRect(Q.x - Q.r * 0.32, Q.y - Q.r * 0.4, Q.r * 0.22, Q.r * 0.8);
    ctx.fillRect(Q.x + Q.r * 0.1, Q.y - Q.r * 0.4, Q.r * 0.22, Q.r * 0.8);
    ctx.restore();
  },
  _arrow(ctx, x, y, r, dir, on) {
    ctx.fillStyle = on ? COL.kin : 'rgba(243,234,215,0.85)';
    ctx.beginPath(); ctx.moveTo(x + dir * r, y); ctx.lineTo(x - dir * r * 0.6, y - r * 0.8); ctx.lineTo(x - dir * r * 0.6, y + r * 0.8); ctx.closePath(); ctx.fill();
  },
  _round(ctx, b, on, sel, label) {
    ctx.globalAlpha = on ? 0.7 : 0.34;
    ctx.fillStyle = on ? COL.shu : COL.sumi; ctx.strokeStyle = sel ? COL.kin : COL.kinari;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 0.9; ctx.fillStyle = COL.kinari;
    ctx.font = font(Math.max(12, Math.round(b.r * (label.length > 1 ? 0.36 : 0.62)))); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, b.x, b.y + 1);
  },
};
