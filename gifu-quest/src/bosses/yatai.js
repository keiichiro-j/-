import { TILE } from '../core/config.js';
import { Entity } from '../actors/entity.js';
import { moveBody } from '../world/collision.js';
import { Boss, BossShot, BossPlatform, registerBoss, setRect, hideRect, clamp, lerp, ease } from './bossBase.js';
import { drawSprite } from '../gfx/atlas.js';

// 4. からくり屋台（高山）HP12。弱点：上に立つからくり人形の頭。屋台の上は乗れる（運ばれる）
//  段階1 左右に走る（車輪が回り湯気の笛で予告）／人形が矢を射る（弓を引いて光る）
//  段階2 扉が開いて小さなからくり人形が飛び出し、主人公を追う
//  段階3 屋台が二段に変形。下の段の矢狭間から床すれすれの矢、上の人形は3方向の矢
const DEF = {
  id: 'yatai', name: 'からくり屋台', title: '飛騨の匠の最高傑作', hp: 12,
  moves: {
    run: { tell: 0.7, rest: 1.3 },
    arrow: { tell: 0.6, rest: 0.9 },
    minis: { tell: 0.6, rest: 0.8 },
    volley: { tell: 0.75, rest: 1.0 },
  },
  phases: [
    { moves: ['arrow', 'run'], speed: 1.0, wait: 0.9 },
    { moves: ['minis', 'run', 'arrow', 'run'], speed: 1.1, wait: 0.8 },
    { moves: ['volley', 'run', 'minis', 'run'], speed: 1.2, wait: 0.75 },
  ],
};
const RUN_SPEED = 300, RUN_ACCEL = 600;
const DECK_H = 106;      // 床からデッキまで
const UPPER_H = 98;      // デッキから上の段の屋根まで
const ARROW_SPEED = 470;
const MAX_MINIS = 3;

class Mini extends Entity {
  constructor(w, x, y, dir) {
    super(w, { type: 'karakuriMini' });
    this.enemy = true; this.stompable = true; this.bossMinion = true; this.persistent = true;
    this.w = 26; this.h = 40; this.x = this.px = x - 13; this.y = this.py = y - 40;
    this.vx = dir * 160; this.vy = -420; this.face = dir; this.hp = 1; this.z = 5; this.jumpCd = 0.5;
  }
  update(dt) {
    const w = this.world, p = w.player;
    this.t += dt; this.jumpCd -= dt;
    if (this.onGround) {
      this.face = p.cx < this.cx ? -1 : 1;
      this.vx += (this.face * 95 - this.vx) * Math.min(1, 6 * dt);
      if ((this.wallL || this.wallR || (Math.abs(p.cx - this.cx) < 90 && p.y + p.h < this.y)) && this.jumpCd <= 0) { this.vy = -460; this.jumpCd = 1.1; }
    }
    this.vy = Math.min(this.vy + 1500 * dt, 700);
    moveBody(w.level, this, dt, { platforms: w.platforms });
  }
  die(src) { super.die(src); this.world.particles.debris(this.cx, this.cy, '#c8281e'); }
  draw(ctx, a) { drawSprite(ctx, 'boss_yatai_mini', this.onGround ? (this.t * 8) | 0 : 0, this.ix(a) + this.w / 2, this.iy(a) + this.h + 3, { flip: this.face < 0 }); }
}

class Yatai extends Boss {
  constructor(world, arena) { super(world, arena, DEF); }
  setup() {
    this.w = 210; this.h = DECK_H;
    const A = this.arena;
    this.deck = new BossPlatform(this.world, 0, 0, 196, 14);
    this.upper = new BossPlatform(this.world, 0, 0, 132, 14);
    this.deck.oneWay = true; this.upper.oneWay = true;
  }
  resetPose() {
    const A = this.arena;
    this.fx = A.R - TILE * 5; this.face = -1; this.vx = 0;
    for (const pl of [this.deck, this.upper]) { if (!this.world.entities.includes(pl)) this.world.spawn(pl); pl.alive = true; this.owned.push(pl); }
    this.roll = 0; this.door = 0; this.tier = 0; this.dollMode = 'idle'; this.ports = false;
    this.place();
    this.deck.warp(this.fx - this.deck.w / 2, this.deckY);
    this.upper.warp(this.fx - this.upper.w / 2, this.arena.floorY + 400);
  }
  get deckY() { return this.arena.floorY - DECK_H; }
  get upperY() { return this.deckY - UPPER_H * this.tier; }
  get dollY() { return this.tier > 0 ? this.upperY : this.deckY; }
  place() {
    this.x = this.fx - this.w / 2; this.y = this.deckY;
    this.deck.moveTo(this.fx - this.deck.w / 2, this.deckY);
    if (this.tier > 0) this.upper.moveTo(this.fx - this.upper.w / 2, this.upperY); else this.upper.moveTo(this.fx - this.upper.w / 2, this.arena.floorY + 400);
  }
  onPhase(n) { if (n === 3) { this.tierT = 0; } }
  cancelMove() { this.vx = 0; this.door = 0; this.ports = false; }
  isVulnerable() { return true; }   // 人形の頭はいつでも踏める（乗るのが課題）
  onEnter(s, m) {
    const A = this.arena, p = this.world.player;
    this.dollMode = 'idle';
    switch (s) {
      case 'intro': this.fx = A.R + 260; this.introFrom = this.fx; break;
      case 'tell':
        if (this.moveName === 'run') { this.runDir = p.cx < this.fx ? -1 : 1; if ((this.runDir < 0 && this.fx < A.L + 200) || (this.runDir > 0 && this.fx > A.R - 200)) this.runDir = -this.runDir; this.world.sfx('bossIntro'); }
        else if (this.moveName === 'minis') this.world.sfx('bump');
        else { this.dollMode = 'aim'; if (this.moveName === 'volley') this.ports = true; }
        break;
      case 'attack':
        this.shots = 0;
        if (this.moveName === 'run') { this.face = this.runDir; this.vx = 0; }
        else if (this.moveName === 'minis') { this.door = 1; this.spawnMinis(); }
        else this.dollMode = 'shoot';
        break;
      case 'rest': this.dollMode = this.moveName === 'run' ? 'dizzy' : 'idle'; break;
      case 'recover': this.door = 0; this.ports = false; break;
      case 'hurt': this.dollMode = 'hurt'; break;
      case 'phase': this.dollMode = 'angry'; this.vx = 0; break;
    }
  }
  spawnMinis() {
    const w = this.world;
    let n = 0;
    for (const e of w.entities) if (e.alive && e.type === 'karakuriMini') n++;
    const k = Math.min(2, MAX_MINIS - n);
    for (let i = 0; i < k; i++) w.spawn(new Mini(w, this.fx + (i ? 20 : -20), this.arena.floorY - 30, i ? 1 : -1));
    w.particles.burst(this.fx, this.arena.floorY - 40, 14, { speed: 180, life: 0.5, size: 8, size1: 0, color: 'rgba(255,240,220,0.8)', drag: 3 });
    w.sfx('shoot');
  }
  shootArrow(x, y, vx, vy) {
    const w = this.world;
    w.spawn(new BossShot(w, x, y, { sprite: 'boss_yatai_arrow', w: 26, h: 10, vx, vy, life: 3, orient: true, cancelable: true }));
  }
  tick(dt, s, m) {
    const A = this.arena, w = this.world, p = w.player;
    // 変形（段階3）
    if (this.phase >= 3 && this.tier < 1) {
      this.tier = Math.min(1, this.tier + dt / 0.9);
      if (w.tick % 6 === 0) w.particles.burst(this.fx + (Math.random() - 0.5) * 140, this.deckY - 20, 2, { speed: 120, life: 0.5, size: 8, size1: 0, color: 'rgba(240,240,240,0.8)', grav: -80 });
      if (this.tier >= 1) w.camera.shake(6, 0.3);
    }
    const dollX = this.fx;
    if (s === 'intro') {
      const k = Math.min(1, this.st / 1.3);
      const nx = lerp(this.introFrom, A.R - TILE * 5, ease(k));
      this.roll += (nx - this.fx) / 28; this.fx = nx;
      if (k >= 1) this.dollMode = 'angry';
    } else if (s === 'tell') {
      if (this.moveName === 'run' && w.tick % 6 === 0) w.particles.burst(this.fx - this.runDir * 90, this.deckY - 10, 2, { angle: -Math.PI / 2, spread: 0.6, speed: 160, life: 0.6, size: 10, size1: 2, color: 'rgba(255,255,255,0.8)', grav: -60 });
      if (this.moveName === 'run') this.roll += Math.sin(this.t * 40) * 0.05;
    } else if (s === 'attack') {
      if (this.moveName === 'run') {
        const max = RUN_SPEED * this.spd;
        this.vx = clamp(this.vx + this.runDir * RUN_ACCEL * this.spd * dt, -max, max);
        this.fx += this.vx * dt; this.roll += this.vx * dt / 28;
        if (w.tick % 5 === 0) w.particles.dust(this.fx - this.runDir * 90, A.floorY, -this.runDir, 2);
        const lo = A.L + 108, hi = A.R - 108;
        if (this.fx < lo || this.fx > hi) {
          this.fx = clamp(this.fx, lo, hi); this.vx = 0;
          w.camera.shake(9, 0.35); w.sfx('break');
          w.particles.debris(this.runDir > 0 ? A.R : A.L, A.floorY - 60, '#8a6a4a');
          this.place(); return true;
        }
      } else if (this.moveName === 'arrow') {
        // 主人公をねらって2本
        if (this.shots < 2 && this.st > this.shots * 0.38) {
          this.shots++;
          const sx = dollX + 10 * (p.cx < dollX ? -1 : 1), sy = this.dollY - 44;
          const a = Math.atan2(p.cy - sy, p.cx - sx);
          this.shootArrow(sx, sy, Math.cos(a) * ARROW_SPEED * this.spd, Math.sin(a) * ARROW_SPEED * this.spd);
          w.sfx('shoot');
        }
        if (this.st > 0.85) { this.place(); return true; }
      } else if (this.moveName === 'minis') {
        if (this.st > 0.5) { this.place(); return true; }
      } else if (this.moveName === 'volley') {
        if (this.shots === 0) {
          this.shots = 1;
          // 下の段：床すれすれの矢を左右へ（跳んでかわす）
          this.shootArrow(this.fx - 110, A.floorY - 18, -ARROW_SPEED * 0.8 * this.spd, 0);
          this.shootArrow(this.fx + 110, A.floorY - 18, ARROW_SPEED * 0.8 * this.spd, 0);
          w.sfx('shootBig');
        }
        if (this.shots === 1 && this.st > 0.45) {
          this.shots = 2;
          // 上の人形：3方向（下向き）
          const sx = dollX, sy = this.dollY - 44;
          const a0 = Math.atan2(p.cy - sy, p.cx - sx);
          for (let i = -1; i <= 1; i++) this.shootArrow(sx, sy, Math.cos(a0 + i * 0.32) * ARROW_SPEED * this.spd, Math.sin(a0 + i * 0.32) * ARROW_SPEED * this.spd);
          w.sfx('shoot');
        }
        if (this.st > 0.9) { this.ports = false; this.place(); return true; }
      }
    } else if (s === 'recover') { this.place(); return true; }
    this.place();
    return false;
  }
  updateRects() {
    this.nBodies = 0; hideRect(this.weak);
    if (this.state === 'dormant') return;
    const A = this.arena, fx = this.fx, dy = this.dollY;
    setRect(this.bodies[0], fx - 104, this.deckY + 12, 208, A.floorY - this.deckY - 12);   // 台車（上は乗れる）
    setRect(this.bodies[1], fx - 12, dy - 50, 24, 46);                                   // 人形の体
    this.nBodies = 2;
    setRect(this.weak, fx - 16, dy - 80, 32, 28);                                        // 人形の頭
  }
  defeatPoint() { return { x: this.fx, y: this.arena.floorY - 80 }; }
  onDefeat() { this.tier = 0; }

  draw(ctx, a) {
    if (this.state === 'dormant') return;
    const A = this.arena, w = this.world, N = 'boss_yatai_';
    const fx = this.fx, fl = A.floorY;
    this.shadow(ctx, fx, fl - 1, 240, 0.35);
    // 上の段（変形でせり上がる）
    if (this.tier > 0) {
      const y = this.deckY - (1 - this.tier) * 40;
      ctx.save(); ctx.beginPath(); ctx.rect(fx - 120, y - 200, 240, this.deckY - (y - 200)); ctx.clip();
      this.sprite(ctx, N + 'upper', this.ports ? 1 : 0, fx, this.deckY + (1 - this.tier) * UPPER_H, false);
      ctx.restore();
    }
    // 車輪（後ろ）
    const wr = this.roll;
    drawSprite(ctx, N + 'wheel', 0, fx - 68, fl - 30, { rot: wr });
    drawSprite(ctx, N + 'wheel', 0, fx + 68, fl - 30, { rot: wr });
    const shake = this.state === 'tell' && this.moveName === 'run' ? Math.sin(this.t * 50) * 1.5 : 0;
    this.sprite(ctx, N + 'cart', this.door ? 1 : this.ports ? 2 : 0, fx + shake, fl - 26 + Math.abs(Math.sin(this.roll * 2)) * (Math.abs(this.vx) > 50 ? 2 : 0), this.face > 0);
    // 人形
    const dm = this.dollMode, fr = (this.t * 6) | 0;
    const dollFace = w.player.cx < fx ? -1 : 1;
    this.sprite(ctx, N + 'doll_' + dm, fr, fx, this.dollY + 2, dollFace < 0);
    w.lights.push({ x: fx, y: this.dollY - 50, r: 110, color: '#ffe6c0', a: 1 });
    w.lights.push({ x: fx, y: this.deckY + 40, r: 170, color: '#ffb070', a: 0.9 });
    if (dm === 'aim') w.lights.push({ x: fx, y: this.dollY - 60, r: 70, color: '#fff0a0', a: 0.9 });
    w.lights.push({ x: fx - 92, y: this.deckY + 30, r: 60, color: '#ffb060', a: 0.8 });
    w.lights.push({ x: fx + 92, y: this.deckY + 30, r: 60, color: '#ffb060', a: 0.8 });
    if (this.state === 'tell' && this.moveName === 'run') this.alertMark(ctx, fx + this.runDir * 120, this.deckY - 10);
    this.weakGlow(ctx);
  }
}
registerBoss('yatai', Yatai);
