// キーボード・ゲームパッド・タッチを同じ「操作コマンド」に揃える（設計書 2章・5章）
const BUTTONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'pause', 'confirm', 'back', 'debug'];

export const DEFAULT_KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['KeyZ', 'Space'],
  attack: ['KeyX', 'ShiftLeft', 'ShiftRight'],
  pause: ['Escape', 'KeyP'],
  confirm: ['Enter', 'KeyZ', 'Space'],
  back: ['Escape', 'Backspace', 'KeyX'],
  debug: ['F1'],
};

class Input {
  constructor() {
    this.keymap = structuredClone(DEFAULT_KEYS);
    this.src = { key: {}, pad: {}, touch: {} };
    this.latch = {};          // 押されたがまだサンプルされていない
    this.held = {};
    this.prev = {};
    this.pressed = {};
    this.released = {};
    this.lastDevice = 'key';
    this.anyPressed = false;
    for (const b of BUTTONS) { this.held[b] = this.prev[b] = this.pressed[b] = this.released[b] = false; }
    this._codeToButtons = new Map();
    this.rebuild();
  }
  rebuild() {
    this._codeToButtons.clear();
    for (const [b, codes] of Object.entries(this.keymap)) for (const c of codes) {
      if (!this._codeToButtons.has(c)) this._codeToButtons.set(c, []);
      this._codeToButtons.get(c).push(b);
    }
  }
  attach(target = window) {
    target.addEventListener('keydown', (e) => {
      if (e.repeat) { if (this._codeToButtons.has(e.code)) e.preventDefault(); return; }
      const bs = this._codeToButtons.get(e.code);
      if (!bs) return;
      e.preventDefault();
      this.lastDevice = 'key';
      for (const b of bs) { this.src.key[b] = true; this.latch[b] = true; }
    });
    target.addEventListener('keyup', (e) => {
      const bs = this._codeToButtons.get(e.code);
      if (!bs) return;
      for (const b of bs) this.src.key[b] = false;
    });
    target.addEventListener('blur', () => { this.src.key = {}; this.src.touch = {}; });
  }
  // タッチUI（ui/touch.js）から呼ぶ
  setVirtual(button, down) {
    if (down && !this.src.touch[button]) this.latch[button] = true;
    this.src.touch[button] = down;
    if (down) this.lastDevice = 'touch';
  }
  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = this.src.pad;
    for (const b of BUTTONS) p[b] = false;
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const was = { ...p };
      p.left ||= ax < -0.4 || btn(14);
      p.right ||= ax > 0.4 || btn(15);
      p.up ||= ay < -0.5 || btn(12);
      p.down ||= ay > 0.5 || btn(13);
      p.jump ||= btn(0);
      p.attack ||= btn(1) || btn(2);
      p.pause ||= btn(9);
      p.confirm ||= btn(0) || btn(9);
      p.back ||= btn(1);
      for (const b of BUTTONS) if (p[b] && !was[b] && !this.prev[b]) { this.latch[b] = true; this.lastDevice = 'pad'; }
    }
  }
  // 固定ステップごとに1回呼ぶ
  sample() {
    this.pollPad();
    this.anyPressed = false;
    for (const b of BUTTONS) {
      const h = !!(this.src.key[b] || this.src.pad[b] || this.src.touch[b]);
      const latched = !!this.latch[b];
      this.pressed[b] = (h && !this.prev[b]) || (latched && !this.prev[b]);
      this.released[b] = !h && this.prev[b];
      this.held[b] = h || latched;   // 一瞬のタップも1ステップは押されたことにする
      this.prev[b] = h;
      this.latch[b] = false;
      if (this.pressed[b]) this.anyPressed = true;
    }
  }
  // 次のシーンへ押下が持ち越されないようにする
  consume() { for (const b of BUTTONS) { this.pressed[b] = false; this.latch[b] = false; } }
}

export const input = new Input();
