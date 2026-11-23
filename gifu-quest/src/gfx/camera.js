import { CAMERA, RUNTIME } from '../core/config.js';
import { rng } from '../core/rng.js';
// カメラ（設計書 5章）：横は進行方向へ12%先読み、縦は着地時に合わせる。ボス部屋・隠し部屋は固定。
export class Camera {
  constructor() {
    this.x = 0; this.y = 0; this.px = 0; this.py = 0;
    this.look = 0; this.lookTarget = 0;
    this.lock = null;       // { x, y, w, h } この範囲を表示（固定）
    this.bounds = { x: 0, y: 0, w: 1e9, h: 1e9 };
    this.groundY = null;
    this.shakeAmp = 0; this.shakeTime = 0; this.shakeDur = 1;
    this.ox = 0; this.oy = 0;
    this.vw = 960; this.vh = 540;
  }
  snapTo(px, py) {
    this.x = this.px = px - this.vw * 0.4;
    this.y = this.py = py - this.vh * 0.6;
    this.groundY = py;
    this.clamp(); this.px = this.x; this.py = this.y;
  }
  shake(amp, dur = 0.3) {
    if (!RUNTIME.shake) amp *= 0.25;
    if (amp >= this.shakeAmp * (this.shakeTime / this.shakeDur)) { this.shakeAmp = amp; this.shakeTime = this.shakeDur = dur; }
  }
  update(dt, target, tallArea) {
    this.px = this.x; this.py = this.y;
    const k = 1 - Math.exp(-CAMERA.lerp * dt);
    if (this.lock) {
      const L = this.lock;
      const tx = L.x + (L.w - this.vw) / 2, ty = L.y + (L.h - this.vh) / 2;
      const kk = 1 - Math.exp(-6 * dt);
      this.x += (tx - this.x) * kk; this.y += (ty - this.y) * kk;
    } else if (target) {
      // 先読み：向きを変えたら0.4秒かけて切り替え
      this.lookTarget = target.face * CAMERA.lookAhead * this.vw;
      const step = (CAMERA.lookAhead * this.vw * 2) / CAMERA.lookSwitchTime * dt;
      this.look += Math.max(-step, Math.min(step, this.lookTarget - this.look));
      const cx = target.x + target.w / 2 + this.look - this.vw / 2;
      this.x += (cx - this.x) * k * 1.6;
      // 縦：着地した時だけ高さを合わせる。画面端に近づいたら追う。
      const feet = target.y + target.h;
      if (target.onGround || target.inWater || tallArea) this.groundY = feet;
      let ty = this.groundY - this.vh * 0.68;
      const m = CAMERA.verticalMargin * this.vh;
      const sy = feet - this.y;
      if (sy < m) ty = Math.min(ty, feet - m);
      if (sy > this.vh - m * 0.7) ty = Math.max(ty, feet - (this.vh - m * 0.7));
      this.y += (ty - this.y) * k * (tallArea ? 1.4 : 0.9);
    }
    this.clamp();
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeTime / this.shakeDur);
      this.ox = (rng.next() * 2 - 1) * a; this.oy = (rng.next() * 2 - 1) * a;
    } else { this.ox = this.oy = 0; }
  }
  clamp() {
    const B = this.bounds;
    this.x = Math.max(B.x, Math.min(this.x, B.x + B.w - this.vw));
    this.y = Math.max(B.y, Math.min(this.y, B.y + B.h - this.vh));
  }
  // 補間した描画位置
  view(alpha) {
    return { x: Math.round((this.px + (this.x - this.px) * alpha + this.ox) * 2) / 2, y: Math.round((this.py + (this.y - this.py) * alpha + this.oy) * 2) / 2 };
  }
}
