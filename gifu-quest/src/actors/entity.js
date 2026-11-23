import { TILE } from '../core/config.js';
// すべての動くもの（敵・アイテム・仕掛け・弾・ボス）の基底。詳細は docs/ARCHITECTURE.md
const registry = new Map();
export function registerEntity(type, cls) { registry.set(type, cls); }
export function entityClass(type) { return registry.get(type); }
export function entityTypes() { return [...registry.keys()]; }

export class Entity {
  constructor(world, spec = {}) {
    this.world = world;
    this.spec = spec;
    this.type = spec.type;
    this.x = 0; this.y = 0; this.w = 32; this.h = 32;
    this.vx = 0; this.vy = 0;
    this.px = 0; this.py = 0;       // 前のステップの位置（描画の補間用）
    this.face = spec.face ?? -1;
    this.alive = true;
    this.t = 0;
    // 役割フラグ
    this.enemy = false;         // 主人公に触れると被弾、技で倒せる
    this.stompable = false;     // 踏める
    this.stompFromTopOnly = false;
    this.hazard = false;        // 敵の弾など（触れると被弾。enemyとは別。ゲンの一閃で消せる: cancelable）
    this.cancelable = false;
    this.friendly = false;      // 主人公の弾
    this.pickup = false;        // 触れると onTouch
    this.platform = false;      // 動く床（x,y,w,h,dx,dy を持つ。上から乗れる）
    this.boss = false;
    this.hp = 1; this.maxHp = 1;
    this.touchDamage = 1;
    this.invuln = 0;
    this.persistent = false;    // 画面外でも更新する
    this.z = 0;                 // 描画順（大きいほど手前）
    this.flash = 0;             // 被弾時の白フラッシュ
    this.dx = 0; this.dy = 0;
  }
  // 足元中央をタイル (tx,ty) の底辺中央に合わせて置く
  placeAt(spec, w, h) {
    this.w = w; this.h = h;
    this.x = spec.x * TILE + TILE / 2 - w / 2;
    this.y = (spec.y + 1) * TILE - h;
    this.px = this.x; this.py = this.y;
    this.home = { x: this.x, y: this.y };
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get bottom() { return this.y + this.h; }
  hurtRect() { return this; }
  // 補間した描画位置
  ix(a) { return this.px + (this.x - this.px) * a; }
  iy(a) { return this.py + (this.y - this.py) * a; }

  preUpdate() { this.px = this.x; this.py = this.y; if (this.invuln > 0) this.invuln -= 1 / 120; if (this.flash > 0) this.flash -= 1 / 120; }
  update(dt) {}
  draw(ctx, a) {}

  onTouch(player) {}
  onStomp(player, dmg) { this.damage(dmg, player); }
  // 戻り値: 当たったら true
  damage(dmg, source) {
    if (this.invuln > 0 || !this.alive) return false;
    this.hp -= dmg;
    this.flash = 0.12;
    if (this.hp <= 0) this.die(source);
    else this.invuln = 0.15;
    return true;
  }
  die(source) {
    this.alive = false;
    const w = this.world;
    w.particles.hit(this.cx, this.cy);
    w.particles.burst(this.cx, this.cy, 8, { speed: 180, life: 0.5, size: 6, size1: 0, color: '#fff', drag: 3 });
    w.events.emit('enemyDefeated', { type: this.type, x: this.cx, y: this.cy });
  }
  remove() { this.alive = false; }
}
