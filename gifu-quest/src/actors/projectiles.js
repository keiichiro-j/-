import { Entity } from './entity.js';
import { TILE } from '../core/config.js';
import { isSolid } from '../world/tiles.js';
import { drawSprite } from '../gfx/atlas.js';
import { hitEnemies, breakTilesIn } from './abilities.js';

// ---- 主人公の技 ----
export class LeafShot extends Entity {
  constructor(w, p, big) {
    super(w, { type: 'leafShot' });
    this.friendly = true; this.big = big;
    const sz = 1 + (p.wfx ? p.wfx.big : 0);
    this.w = (big ? 34 : 20) * sz; this.h = (big ? 26 : 14) * sz; this.sz = sz;
    this.pierce = !!(p.wfx && p.wfx.pierce);
    this.face = p.face;
    this.x = p.cx + p.face * 14 - this.w / 2; this.y = p.y + 16 - this.h / 2;
    this.px = this.x; this.py = this.y;
    this.vx = p.face * (big ? 560 : 640);
    this.dmg = (big ? 2 : 1) * p.stats.power;
    this.life = big ? 0.9 : 0.6;
    this.once = new Set();
    this.persistent = true;
  }
  update(dt) {
    this.t += dt; this.life -= dt;
    this.x += this.vx * dt;
    this.y += Math.sin(this.t * 18) * (this.big ? 0.6 : 0.9);
    const w = this.world;
    if (hitEnemies(w, this, this.dmg, this, { once: this.once }) && !this.big && !this.pierce) { this.remove(); return; }
    if (isSolid(w.level.at(this.cx, this.cy)) || this.life <= 0) { w.particles.leaves(this.cx, this.cy, 4); this.remove(); }
  }
  blocked() { if (!this.big) this.remove(); }
  draw(ctx, a) { drawSprite(ctx, this.big ? 'fx_leaf_big' : 'fx_leaf', (this.t * 20) | 0, this.ix(a) + this.w / 2, this.iy(a) + this.h / 2, { flip: this.face < 0, sx: this.sz, sy: this.sz }); }
}

export class UkaiBird extends Entity {
  constructor(w, p) {
    super(w, { type: 'ukaiBird' });
    this.friendly = true; this.w = 26; this.h = 18; this.face = p.face;
    this.x = p.cx - 13; this.y = p.y + 6; this.px = this.x; this.py = this.y;
    this.vx = p.face * 380; this.vy = -60;
    this.dmg = 1 * p.stats.power; this.life = 1.6; this.persistent = true;
    this.pierce = !!(p.wfx && p.wfx.pierce); this.once = new Set();
  }
  update(dt) {
    const w = this.world;
    this.t += dt; this.life -= dt;
    // 近くの敵を追いかける
    let best = null, bd = 380 * 380;
    for (const e of w.entities) if (e.enemy && e.alive && !(this.once && this.once.has(e))) { const d = (e.cx - this.cx) ** 2 + (e.cy - this.cy) ** 2; if (d < bd && (e.cx - this.cx) * this.face > -40) { bd = d; best = e; } }
    if (best && this.t > 0.08) {
      const a = Math.atan2(best.cy - this.cy, best.cx - this.cx);
      this.vx += Math.cos(a) * 2600 * dt; this.vy += Math.sin(a) * 2600 * dt;
      const sp = Math.hypot(this.vx, this.vy), max = 520;
      if (sp > max) { this.vx *= max / sp; this.vy *= max / sp; }
    } else { this.vy += Math.sin(this.t * 9) * 20; }
    this.face = this.vx >= 0 ? 1 : -1;
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.pierce) { hitEnemies(w, this, this.dmg, this, { once: this.once }); }
    else if (hitEnemies(w, this, this.dmg, this)) { w.particles.burst(this.cx, this.cy, 6, { speed: 120, life: 0.5, size: 4, size1: 0, color: '#222', shape: 'leaf', grav: 200 }); this.remove(); return; }
    if (this.life <= 0 || isSolid(w.level.at(this.cx, this.cy))) { w.particles.burst(this.cx, this.cy, 5, { speed: 90, life: 0.5, size: 4, size1: 0, color: '#333', shape: 'leaf', grav: 200 }); this.remove(); }
  }
  blocked() { this.remove(); }
  draw(ctx, a) { drawSprite(ctx, 'fx_ukai', (this.t * 14) | 0, this.ix(a) + this.w / 2, this.iy(a) + this.h / 2, { flip: this.face < 0 }); }
}

export class Slash extends Entity {
  constructor(w, p) {
    super(w, { type: 'slash' });
    this.friendly = true; this.p = p; this.face = p.face;
    this.sz = 1 + (p.wfx ? p.wfx.big : 0);
    this.w = 76 * this.sz; this.h = 60 * this.sz; this.life = 0.16; this.persistent = true;
    this.dmg = 2 * p.stats.power; this.once = new Set();
    this.place();
  }
  place() { const p = this.p; this.x = this.face > 0 ? p.cx - 6 : p.cx - this.w + 6; this.y = p.y - 10; this.px = this.x; this.py = this.y; }
  update(dt) {
    this.t += dt; this.life -= dt; this.place();
    const w = this.world;
    hitEnemies(w, this, this.dmg, this, { once: this.once, cancelHazards: true });
    if (this.t < 0.02 + 1 / 120 && breakTilesIn(w, this) > 0) w.camera.shake(4, 0.15);
    if (this.life <= 0) this.remove();
  }
  draw(ctx, a) { drawSprite(ctx, 'fx_slash', Math.min(3, (this.t / 0.16 * 4) | 0), this.p.cx + this.face * 26 * this.sz, this.p.y + this.p.h / 2 - 4, { flip: this.face < 0, sx: this.sz, sy: this.sz }); }
}

// 刃の波（武器の効果 wave）：技と一緒に前へ飛ぶ三日月。敵を貫く
export class WaveShot extends Entity {
  constructor(w, p) {
    super(w, { type: 'waveShot' });
    this.friendly = true; this.face = p.face; this.persistent = true;
    this.w = 30; this.h = 46; this.color = p.weaponColor || '#ffe08a';
    this.x = p.cx + p.face * 10 - this.w / 2; this.y = p.y - 2; this.px = this.x; this.py = this.y;
    this.vx = p.face * 560; this.dmg = 1 * p.stats.power; this.life = 0.5; this.once = new Set();
  }
  update(dt) {
    this.t += dt; this.life -= dt; this.x += this.vx * dt;
    hitEnemies(this.world, this, this.dmg, this, { once: this.once });
    if (this.life <= 0 || isSolid(this.world.level.at(this.cx, this.cy))) this.remove();
  }
  draw(ctx, a) {
    const x = this.ix(a) + this.w / 2, y = this.iy(a) + this.h / 2, f = this.face, k = Math.min(1, this.life * 4);
    ctx.save(); ctx.globalAlpha = k; ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = this.color; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x - f * 10, y, 22, f > 0 ? -1.1 : Math.PI - 1.1 + 2.2 - 2.2, f > 0 ? 1.1 : Math.PI + 1.1); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x - f * 10, y, 22, f > 0 ? -0.9 : Math.PI - 0.9, f > 0 ? 0.9 : Math.PI + 0.9); ctx.stroke();
    ctx.restore();
  }
}

// ---- 敵・ボスの弾（敵担当・ボス担当が使う汎用クラス） ----
// opts: { sprite, w, h, vx, vy, grav, life, damage, cancelable, bounce, spin, solid(=壁で消える) }
export class Bullet extends Entity {
  constructor(w, x, y, opts) {
    super(w, { type: 'bullet' });
    this.hazard = true; this.cancelable = opts.cancelable ?? true;
    this.w = opts.w || 16; this.h = opts.h || 16;
    this.x = x - this.w / 2; this.y = y - this.h / 2; this.px = this.x; this.py = this.y;
    this.vx = opts.vx || 0; this.vy = opts.vy || 0;
    this.grav = opts.grav || 0; this.life = opts.life ?? 4; this.touchDamage = opts.damage ?? 1;
    this.sprite = opts.sprite || 'fx_bullet'; this.spin = opts.spin || 0; this.solid = opts.solid ?? true;
    this.bounce = opts.bounce || 0; this.persistent = true; this.color = opts.color;
    this.z = 5;
  }
  update(dt) {
    this.t += dt; this.life -= dt;
    this.vy += this.grav * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    const w = this.world;
    if (this.solid && isSolid(w.level.at(this.cx, this.cy))) {
      if (this.bounce > 0 && this.vy > 0) { this.y = Math.floor(this.cy / TILE) * TILE - this.h; this.vy = -this.vy * this.bounce; this.bounce *= 0.7; if (Math.abs(this.vy) < 60) this.bounce = 0; }
      else { w.particles.hit(this.cx, this.cy, '#ffd9a0'); this.remove(); return; }
    }
    if (this.life <= 0 || this.y > w.level.pxH + 100) this.remove();
  }
  cancel() { this.remove(); }
  draw(ctx, a) { drawSprite(ctx, this.sprite, (this.t * 12) | 0, this.ix(a) + this.w / 2, this.iy(a) + this.h / 2, { rot: this.spin * this.t }); }
}
