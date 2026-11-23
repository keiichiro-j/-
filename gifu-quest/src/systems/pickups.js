import { Entity, registerEntity } from '../actors/entity.js';
import { TILE } from '../core/config.js';
import { drawSprite } from '../gfx/atlas.js';
import { input } from '../core/input.js';
import { moveBody } from '../world/collision.js';

// アイテム・中間地点・看板・宝珠（設計書 6章「各ステージに必ず入れるもの」）
class Coin extends Entity {
  constructor(w, s) { super(w, s); this.pickup = true; this.placeAt(s, 20, 24); this.y -= 6; this.phase = (s.x * 0.37 + s.y * 0.11) % 1; this.z = 1; }
  onTouch(p) {
    this.alive = false;
    this.world.addCoins(1, this.cx, this.cy);
    this.world.particles.coin(this.cx, this.cy);
    this.world.sfx('coin');
  }
  draw(ctx, a) { drawSprite(ctx, 'item_coin', ((this.world.time * 10 + this.phase * 8) | 0), this.cx, this.y + this.h + Math.sin(this.world.time * 3 + this.phase * 6) * 1.5); }
}
registerEntity('coin', Coin);

// さるぼぼ（各ステージ3個。spec.index 0..2）
class Sarubobo extends Entity {
  constructor(w, s) { super(w, s); this.pickup = true; this.placeAt(s, 28, 32); this.index = s.index ?? 0; this.z = 2; this.got = !!(w.collectedSarubobo && w.collectedSarubobo[this.index]); }
  onTouch(p) {
    this.alive = false;
    this.world.collectSarubobo(this.index);
    this.world.particles.burst(this.cx, this.cy, 16, { speed: 200, life: 0.7, size: 6, size1: 0, color: '#ff5a4a', shape: 'star', front: true, drag: 3, vr: 10 });
    this.world.sfx('sarubobo');
    this.world.hitstop(0.08);
  }
  draw(ctx, a) {
    const y = this.y + this.h + Math.sin(this.world.time * 2.4) * 3;
    drawSprite(ctx, 'item_sarubobo', 0, this.cx, y, { alpha: this.got ? 0.45 : 1 });
  }
}
registerEntity('sarubobo', Sarubobo);

// 飛騨牛串：無敵アイテム
class Skewer extends Entity {
  constructor(w, s) { super(w, s); this.pickup = true; this.placeAt(s, 30, 30); this.z = 2; }
  onTouch(p) { this.alive = false; p.star = 8; this.world.sfx('star'); this.world.events.emit('star', { t: 8 }); this.world.particles.burst(this.cx, this.cy, 20, { speed: 260, life: 0.6, size: 5, size1: 0, color: '#ffd76a', shape: 'star', front: true, add: true }); }
  draw(ctx, a) { drawSprite(ctx, 'item_skewer', (this.world.time * 6) | 0, this.cx, this.y + this.h + Math.sin(this.world.time * 4) * 3); }
}
registerEntity('skewer', Skewer);

class Heart extends Entity {
  constructor(w, s) { super(w, s); this.pickup = true; this.placeAt(s, 24, 24); this.z = 2; }
  onTouch(p) { this.alive = false; p.heal(1); this.world.sfx('heart'); this.world.particles.burst(this.cx, this.cy, 10, { speed: 140, life: 0.5, size: 5, size1: 0, color: '#ff7fa0', front: true }); }
  draw(ctx, a) { drawSprite(ctx, 'item_heart', 0, this.cx, this.y + this.h + Math.sin(this.world.time * 4) * 2, { sx: 1 + Math.sin(this.world.time * 8) * 0.06 }); }
}
registerEntity('heart', Heart);

// 中間地点（spec.index 0,1）
class Checkpoint extends Entity {
  constructor(w, s) { super(w, s); this.pickup = true; this.placeAt(s, 30, 72); this.on = false; this.raise = 0; this.z = -1; }
  activate(silent) { this.on = true; this.raise = silent ? 1 : 0; if (silent) this.world.checkpoint = this; }
  onTouch(p) {
    if (this.on) return;
    this.on = true;
    this.world.setCheckpoint(this);
    this.world.sfx('checkpoint');
    this.world.particles.burst(this.cx, this.y + 10, 14, { speed: 160, life: 0.8, size: 5, size1: 0, color: '#ffe9a0', shape: 'star', front: true, grav: 120 });
  }
  update(dt) { if (this.on && this.raise < 1) this.raise = Math.min(1, this.raise + dt * 2.5); }
  draw(ctx, a) {
    drawSprite(ctx, 'prop_checkpoint', this.on ? 1 : 0, this.cx, this.y + this.h, { sy: 1 });
    if (this.on) this.world.lights.push({ x: this.cx, y: this.y + 8, r: 90, color: '#ffcf7a', a: 0.9 });
  }
}
registerEntity('checkpoint', Checkpoint);

// 名物・名所の看板（spec.title, spec.text）。↑で読む
class Sign extends Entity {
  constructor(w, s) { super(w, s); this.pickup = true; this.placeAt(s, 40, 44); this.z = -1; this.near = 0; }
  onTouch(p) { this.near = 0.1; if (input.pressed.up && p.onGround) { this.world.showDialogue(this.spec.title, this.spec.text); if (!this.world.stats.signs.includes(this.spec.id || this.spec.title)) this.world.stats.signs.push(this.spec.id || this.spec.title); } }
  update(dt) { if (this.near > 0) this.near -= dt; }
  draw(ctx, a) {
    drawSprite(ctx, 'prop_sign', 0, this.cx, this.y + this.h);
    if (this.near > 0) drawSprite(ctx, 'ui_up_hint', (this.world.time * 3) | 0, this.cx, this.y - 6 + Math.sin(this.world.time * 6) * 2);
  }
}
registerEntity('sign', Sign);

// 宝珠（ボスを倒すと出る。取るとクリア）
class Orb extends Entity {
  constructor(w, s) { super(w, s); this.pickup = true; this.placeAt(s, 36, 36); this.vy = s.drop ? -520 : 0; this.persistent = true; this.z = 6; this.onGround = false; }
  update(dt) {
    if (this.spec.drop && !this.onGround) { this.vy = Math.min(this.vy + 1400 * dt, 700); moveBody(this.world.level, this, dt, { platforms: this.world.platforms }); }
    this.world.lights.push({ x: this.cx, y: this.cy, r: 140, color: '#bfe8ff', a: 1 });
    if (this.world.tick % 5 === 0) this.world.particles.spawn({ x: this.cx + (Math.random() - 0.5) * 30, y: this.cy + (Math.random() - 0.5) * 30, vy: -40, life: 0.8, size: 3, size1: 0, color: '#e6f7ff', shape: 'star', add: true, front: true });
  }
  onTouch(p) { this.alive = false; this.world.stageClear(); this.world.particles.explosion(this.cx, this.cy, 0.6); }
  draw(ctx, a) { drawSprite(ctx, `item_orb_${this.world.data.id || 1}`, (this.world.time * 8) | 0, this.cx, this.iy(a) + this.h + Math.sin(this.world.time * 3) * 4); }
}
registerEntity('orb', Orb);

// カメラ固定ゾーン（隠し部屋など）。spec: x,y,w,h（タイル）
class CameraZone extends Entity {
  constructor(w, s) { super(w, s); this.x = s.x * TILE; this.y = s.y * TILE; this.w = s.w * TILE; this.h = s.h * TILE; this.persistent = true; this.inside = false; }
  update(dt) {
    const p = this.world.player;
    const inside = p.cx > this.x && p.cx < this.x + this.w && p.cy > this.y && p.cy < this.y + this.h;
    if (inside && !this.inside) this.world.lockCamera({ x: this.x, y: this.y, w: this.w, h: this.h });
    if (!inside && this.inside && this.world.camera.lock && this.world.camera.lock.x === this.x) this.world.unlockCamera();
    this.inside = inside;
  }
}
registerEntity('cameraZone', CameraZone);

// ゴール（ボスのいない練習ステージ用）：触れるとクリア
class Goal extends Entity {
  constructor(w, s) { super(w, s); this.pickup = true; this.placeAt(s, 36, 72); }
  onTouch(p) { this.alive = false; this.world.stageClear(); }
  draw(ctx) { drawSprite(ctx, 'item_orb_1', 0, this.cx, this.y + this.h); }
}
registerEntity('goal', Goal);
