import { input } from './core/input.js';
import { renderer } from './gfx/renderer.js';
import { RUNTIME } from './core/config.js';
// 画面管理。各画面は scenes/ 以下の1ファイルで enter(params) update(dt) draw(ctx, alpha) exit() を持つ（設計書 3章）
export const game = {
  scenes: {}, scene: null, sceneName: null,
  trans: null,       // { phase:'out'|'in', t, dur, kind, next, params, cx, cy }
  loop: null,
  time: 0,
  register(name, scene) { this.scenes[name] = scene; },
  // kind: 'iris'（丸く絞る）| 'wipe'（横に拭う）| 'fade' | 'none'
  go(name, params = {}, kind = 'iris', opts = {}) {
    if (kind === 'none' || !this.scene) { this._switch(name, params); return; }
    if (this.trans && this.trans.phase === 'out') return;
    this.trans = { phase: 'out', t: 0, dur: (opts.dur || 0.4) / 2, kind, next: name, params, cx: opts.cx, cy: opts.cy };
  },
  _switch(name, params) {
    if (this.scene && this.scene.exit) this.scene.exit();
    const s = this.scenes[name];
    if (!s) throw new Error('scene not found: ' + name);
    this.scene = s; this.sceneName = name;
    input.consume();
    if (s.enter) s.enter(params || {});
  },
  update(dt) {
    input.sample();
    this.time += dt;
    if (input.pressed.debug) RUNTIME.debug = !RUNTIME.debug;
    const tr = this.trans;
    if (tr) {
      tr.t += dt;
      if (tr.phase === 'out' && tr.t >= tr.dur) { this._switch(tr.next, tr.params); tr.phase = 'in'; tr.t = 0; }
      else if (tr.phase === 'in' && tr.t >= tr.dur) this.trans = null;
      if (tr.phase === 'out') return;   // 閉じている間は前の画面を止める
    }
    if (this.scene && this.scene.update) this.scene.update(dt);
  },
  render(alpha) {
    const ctx = renderer.begin();
    const vw = renderer.viewW, vh = renderer.viewH;
    if (this.scene && this.scene.draw) this.scene.draw(ctx, alpha, vw, vh);
    if (this.trans) this.drawTransition(ctx, vw, vh);
    if (RUNTIME.debug && this.loop) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(vw - 150, vh - 26, 150, 26);
      ctx.fillStyle = '#0f0'; ctx.font = '14px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(`${this.loop.stats.fps.toFixed(0)}fps ${this.loop.stats.frameMs.toFixed(1)}ms`, vw - 144, vh - 8);
    }
  },
  drawTransition(ctx, vw, vh) {
    const tr = this.trans;
    let k = Math.min(1, tr.t / tr.dur);
    k = tr.phase === 'out' ? k : 1 - k;           // 1=完全に閉じた
    k = k * k * (3 - 2 * k);
    ctx.save();
    ctx.fillStyle = '#120c10';
    if (tr.kind === 'iris') {
      const cx = tr.cx ?? vw / 2, cy = tr.cy ?? vh / 2;
      const R = Math.hypot(Math.max(cx, vw - cx), Math.max(cy, vh - cy)) * (1 - k);
      ctx.beginPath(); ctx.rect(0, 0, vw, vh); ctx.arc(cx, cy, Math.max(0, R), 0, Math.PI * 2, true); ctx.fill('evenodd');
    } else if (tr.kind === 'wipe') {
      const x = tr.phase === 'out' ? -vw * 0.2 + (vw * 1.4) * k : vw * 1.2 - (vw * 1.4) * k;
      ctx.beginPath();
      if (tr.phase === 'out') { ctx.moveTo(-10, 0); ctx.lineTo(x, 0); ctx.lineTo(x - vw * 0.2, vh); ctx.lineTo(-10, vh); }
      else { ctx.moveTo(vw + 10, 0); ctx.lineTo(vw - (vw * 1.4) * k + vw * 0.2, 0); ctx.lineTo(vw - (vw * 1.4) * k, vh); ctx.lineTo(vw + 10, vh); }
      ctx.fill();
    } else { ctx.globalAlpha = k; ctx.fillRect(0, 0, vw, vh); }
    ctx.restore();
  },
};
