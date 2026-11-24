import { LIMITS, RUNTIME } from '../core/config.js';
import { rng } from '../core/rng.js';
// パーティクル（最大800個、低画質は半分）。配列は使い回し、毎フレームの生成をしない。
const LAND_O = { size: 7, size1: 2, color: 'rgba(214,196,164,0.75)', drag: 4.5, grav: -30 };
const SHAPES = { circle: 0, square: 1, star: 2, leaf: 3, spark: 4, ring: 5 };

export class Particles {
  constructor(max = LIMITS.particles) {
    this.max = max;
    this.p = [];
    for (let i = 0; i < max; i++) this.p.push({ alive: false });
    this.cursor = 0;
    this.count = 0;
  }
  cap() { return RUNTIME.quality === 'low' ? this.max >> 1 : this.max; }
  spawn(o) { return this.emit(o, o.x, o.y, o.vx || 0, o.vy || 0, o.life || 0.5, o.rot || 0, o.vr || 0); }
  // spawn の中身。位置・速さ・寿命・回転を引数で上書きできる（burst が粒ごとに {...o} を作らないように）
  emit(o, x, y, vx, vy, life, rot, vr) {
    if (this.count >= this.cap()) return null;
    for (let n = 0; n < this.max; n++) {
      const i = (this.cursor + n) % this.max;
      const q = this.p[i];
      if (!q.alive) {
        this.cursor = (i + 1) % this.max;
        q.alive = true; this.count++;
        q.x = x; q.y = y; q.vx = vx; q.vy = vy;
        q.life = q.max = life; q.size = o.size || 3; q.size1 = o.size1 ?? q.size;
        q.color = o.color || '#fff'; q.grav = o.grav || 0; q.drag = o.drag || 0;
        q.shape = SHAPES[o.shape || 'circle']; q.rot = rot; q.vr = vr;
        q.front = !!o.front; q.add = !!o.add; q.alpha = o.alpha ?? 1;
        return q;
      }
    }
    return null;
  }
  // よく使う演出
  burst(x, y, n, o) {
    for (let i = 0; i < n; i++) {
      const a = (o.angle ?? -Math.PI / 2) + (rng.next() - 0.5) * (o.spread ?? Math.PI * 2);
      const sp = (o.speed ?? 120) * (0.4 + rng.next() * 0.8);
      const jx = (rng.next() - 0.5) * (o.jitter || 0), jy = (rng.next() - 0.5) * (o.jitter || 0);
      const life = (o.life || 0.5) * (0.6 + rng.next() * 0.6), rot = rng.next() * 6, vr = (rng.next() - 0.5) * (o.vr || 0);
      if (!this.emit(o, x + jx, y + jy, Math.cos(a) * sp, Math.sin(a) * sp, life, rot, vr)) return;   // 上限に達したら残りは出さない
    }
  }
  dust(x, y, dir = 0, n = 6) { this.burst(x, y, n, { angle: dir ? (dir > 0 ? -Math.PI * 0.85 : -Math.PI * 0.15) : -Math.PI / 2, spread: dir ? 0.9 : 2.6, speed: 90, life: 0.45, size: 5, size1: 1, color: 'rgba(210,190,160,0.8)', drag: 3, grav: -40 }); }
  // 着地の土ぼこり：地面に沿って左右へ広がる低い煙（強く落ちるほど大きく遠くへ）
  landDust(x, y, k = 1) {
    const n = Math.round(3 + k * 5);
    LAND_O.size = 4 + k * 4;
    for (let i = 0; i < n; i++) {
      const side = i & 1 ? 1 : -1, sp = (60 + rng.next() * 140) * (0.5 + k * 0.7);
      if (!this.emit(LAND_O, x + side * (4 + rng.next() * 8), y - 2, side * sp, -10 - rng.next() * 30 * k, 0.35 + rng.next() * 0.25, 0, 0)) return;
    }
  }
  stomp(x, y) {
    this.burst(x, y, 8, { speed: 260, life: 0.4, size: 7, size1: 0, color: '#ffe56b', shape: 'star', drag: 4, vr: 12, front: true });
    this.spawn({ x, y, life: 0.25, size: 6, size1: 40, color: 'rgba(255,255,255,0.9)', shape: 'ring', front: true });
  }
  hit(x, y, color = '#fff') {
    this.burst(x, y, 10, { speed: 320, life: 0.3, size: 3, size1: 0, color, shape: 'spark', drag: 5, front: true, add: true });
  }
  coin(x, y) { this.burst(x, y, 6, { speed: 110, life: 0.4, size: 3, size1: 0, color: '#fff3a0', shape: 'star', front: true, add: true, drag: 3 }); }
  explosion(x, y, scale = 1) {
    this.burst(x, y, Math.round(24 * scale), { speed: 380 * scale, life: 0.7, size: 10 * scale, size1: 0, color: '#ffb347', drag: 3, front: true, add: true });
    this.burst(x, y, Math.round(14 * scale), { speed: 160 * scale, life: 1.0, size: 14 * scale, size1: 4, color: 'rgba(90,80,80,0.6)', drag: 2, grav: -60 });
    this.spawn({ x, y, life: 0.35, size: 10, size1: 120 * scale, color: 'rgba(255,240,200,0.9)', shape: 'ring', front: true });
  }
  splash(x, y, color = 'rgba(190,225,255,0.85)') { this.burst(x, y, 12, { angle: -Math.PI / 2, spread: 1.4, speed: 260, life: 0.6, size: 4, size1: 1, color, grav: 900 }); }
  leaves(x, y, n = 6) { this.burst(x, y, n, { speed: 140, life: 0.9, size: 5, size1: 3, color: '#6db54a', shape: 'leaf', grav: 160, drag: 2, vr: 8 }); }
  debris(x, y, color = '#a0583c') { this.burst(x, y, 10, { speed: 300, life: 0.8, size: 7, size1: 5, color, shape: 'square', grav: 1400, vr: 14, angle: -Math.PI / 2, spread: 2.2 }); }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const q = this.p[i];
      if (!q.alive) continue;
      q.life -= dt;
      if (q.life <= 0) { q.alive = false; this.count--; continue; }
      q.vy += q.grav * dt;
      if (q.drag) { const d = Math.exp(-q.drag * dt); q.vx *= d; q.vy *= d; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
    }
  }
  draw(ctx, front) {
    for (let i = 0; i < this.max; i++) {
      const q = this.p[i];
      if (!q.alive || q.front !== front) continue;
      const t = q.life / q.max;
      const s = q.size1 + (q.size - q.size1) * t;
      ctx.globalAlpha = q.alpha * Math.min(1, t * 2.5);
      ctx.globalCompositeOperation = q.add ? 'lighter' : 'source-over';
      ctx.fillStyle = q.color; ctx.strokeStyle = q.color;
      switch (q.shape) {
        case 0: ctx.beginPath(); ctx.arc(q.x, q.y, s, 0, 6.2832); ctx.fill(); break;
        case 1: ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillRect(-s / 2, -s / 2, s, s); ctx.restore(); break;
        case 2: star(ctx, q.x, q.y, s, q.rot); break;
        case 3: ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.45, 0, 0, 6.2832); ctx.fill(); ctx.restore(); break;
        case 4: { const sp = Math.hypot(q.vx, q.vy) || 1; ctx.lineWidth = s; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx / sp * s * 4, q.y - q.vy / sp * s * 4); ctx.stroke(); break; }
        case 5: ctx.lineWidth = 3 * t + 0.5; ctx.beginPath(); ctx.arc(q.x, q.y, s, 0, 6.2832); ctx.stroke(); break;
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  clear() { for (const q of this.p) q.alive = false; this.count = 0; }
}

function star(ctx, x, y, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + i * Math.PI / 5, rr = i & 1 ? r * 0.45 : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill();
}
