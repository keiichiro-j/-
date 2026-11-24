import { TILE } from '../core/config.js';
import { Boss, BossShot, BossLayer, registerBoss, setRect, hideRect, clamp, lerp, ease } from './bossBase.js';
import { drawSprite } from '../gfx/atlas.js';

// 1. 大ムササビ（金華山）HP8
//  段階1 木から木へ滑空し体当たり → 着地して休む（隙1.5秒：踏む）
//  段階2 滑空中にどんぐりを3つばらまく
//  段階3 画面の上へ消え、地面の影で予告してから急降下
const DEF = {
  id: 'musasabi', name: '大ムササビ', title: '金華山の森をすべる', hp: 8,
  moves: {
    glide: { tell: 0.7, rest: 1.5 },
    glideAcorn: { tell: 0.7, rest: 1.45 },
    dive: { tell: 0.6, rest: 1.35 },
  },
  phases: [
    { moves: ['glide'], speed: 1.0, wait: 1.1 },
    { moves: ['glideAcorn', 'glide', 'glideAcorn'], speed: 1.12, wait: 0.95 },
    { moves: ['dive', 'glideAcorn', 'dive'], speed: 1.25, wait: 0.8 },
  ],
};
const GLIDE_SPEED = 430;      // ドット/秒
const DIVE_SPEED = 1250;
const TRACK_TIME = 1.0, LOCK_TIME = 0.55;
const BRANCH_H = 232;          // 床から枝まで
const ACORNS = 3;

class Musasabi extends Boss {
  constructor(world, arena) { super(world, arena, DEF); }
  setup() {
    const A = this.arena;
    this.treeX = [A.L + TILE * 2.2, A.R - TILE * 2.2];
    this.perchX = [this.treeX[0] + 38, this.treeX[1] - 38];
    this.perchY = A.floorY - BRANCH_H;
    this.world.spawn(new BossLayer(this.world, this, -3, 'drawBack'));
    this.w = 90; this.h = 70;
  }
  resetPose() {
    this.side = 1; this.face = -1;
    this.fx = this.perchX[1]; this.fy = this.perchY;
    this.pose = 'perch'; this.airborne = true; this.touchDamage = 1;
    this.sync();
  }
  sync() { this.x = this.fx - this.w / 2; this.y = this.fy - this.h; }
  cancelMove() { this.shadowA = 0; }

  onEnter(s, m) {
    const A = this.arena, p = this.world.player;
    this.touchDamage = 1;
    switch (s) {
      case 'intro':
        this.fx = this.perchX[1]; this.fy = A.top - 200; this.pose = 'glide'; this.face = -1; break;
      case 'idle': this.pose = this.onBranch() ? 'perch' : 'tell'; break;
      case 'tell': this.pose = 'tell'; this.face = p.cx < this.fx ? -1 : 1; break;
      case 'attack':
        this.sub = 0; this.subT = 0;
        if (this.moveName === 'dive') { this.pose = 'tell'; this.ox = this.fx; this.oy = this.fy; this.shadowX = p.cx; this.shadowA = 0; }
        else this.startGlide();
        break;
      case 'rest': this.pose = 'rest'; this.airborne = false; this.touchDamage = 0; break;   // 休んでいる間は触れても痛くない
      case 'recover': this.startHop(); break;
      case 'hurt': this.pose = 'hurt'; break;
      case 'phase': this.pose = 'angry'; break;
    }
  }
  onBranch() { return Math.abs(this.fy - this.perchY) < 2; }
  startGlide() {
    const A = this.arena, p = this.world.player;
    this.pose = this.moveName === 'glideAcorn' ? 'glide2' : 'glide';
    this.ox = this.fx; this.oy = this.fy;
    this.tx = clamp(p.cx, A.L + TILE * 3, A.R - TILE * 3);
    this.ty = A.floorY;
    this.face = this.tx >= this.ox ? 1 : -1;
    const dist = Math.hypot(this.tx - this.ox, this.ty - this.oy);
    this.dur = clamp(dist / (GLIDE_SPEED * this.spd), 0.8, 1.8);
    this.dropped = 0;
    this.airborne = true;
    this.world.sfx('bird');
  }
  startHop() {
    const p = this.world.player, A = this.arena;
    // 主人公から遠い方の木へ戻る
    this.side = p.cx < A.cx ? 1 : 0;
    this.ox = this.fx; this.oy = this.fy;
    this.tx = this.perchX[this.side]; this.ty = this.perchY;
    this.face = this.tx > this.ox ? 1 : -1;
    this.dur = 0.85; this.pose = 'glide'; this.airborne = true;
  }
  tick(dt, s, m) {
    const A = this.arena, w = this.world, p = w.player;
    if (s === 'intro') {
      const k = Math.min(1, this.st / 0.7);
      this.fy = lerp(A.top - 200, this.perchY, ease(k));
      if (k >= 1 && this.pose !== 'angry') { this.pose = 'angry'; w.particles.leaves(this.treeX[1], this.perchY - 120, 14); w.camera.shake(4, 0.2); }
    } else if (s === 'idle') {
      if (this.onBranch()) { this.pose = 'perch'; this.face = this.side ? -1 : 1; }
    } else if (s === 'attack') {
      if (this.moveName === 'dive') return this.tickDive(dt);
      return this.tickGlide(dt);
    } else if (s === 'recover') {
      const k = Math.min(1, this.st / this.dur);
      this.fx = lerp(this.ox, this.tx, ease(k));
      this.fy = lerp(this.oy, this.ty, k) - Math.sin(k * Math.PI) * 120;
      if (k >= 1) { this.pose = 'perch'; this.face = this.side ? -1 : 1; w.particles.leaves(this.treeX[this.side], this.perchY - 100, 6); return true; }
    } else if (s === 'phase') {
      if (this.st > 0.2 && this.st < 1.0 && w.tick % 10 === 0) w.particles.burst(this.fx, this.fy - 100, 3, { speed: 120, life: 0.5, size: 6, size1: 0, color: 'rgba(255,255,255,0.8)', grav: -100 });
    }
    this.sync();
    return false;
  }
  tickGlide(dt) {
    const w = this.world, A = this.arena;
    const k = Math.min(1, this.st / this.dur);
    const midX = (this.ox + this.tx) / 2;
    // 2次ベジェ：前半で下り、後半は地面すれすれ
    const cx = midX, cy = this.ty - 20;
    const u = k, iu = 1 - u;
    const nx = iu * iu * this.ox + 2 * iu * u * cx + u * u * this.tx;
    const ny = iu * iu * this.oy + 2 * iu * u * cy + u * u * this.ty;
    this.gvx = (nx - this.fx) / dt; this.gvy = (ny - this.fy) / dt;
    this.fx = nx; this.fy = ny;
    this.rot = clamp(Math.atan2(this.gvy, Math.abs(this.gvx) + 1) * 0.5, -0.45, 0.45);
    if (this.moveName === 'glideAcorn' && this.dropped < ACORNS && k >= (this.dropped + 1) / (ACORNS + 1)) {
      this.dropped++;
      this.pose = this.dropped >= ACORNS ? 'glide' : 'glide2';
      w.spawn(new BossShot(w, this.fx, this.fy - 20, { sprite: 'boss_musasabi_acorn', w: 16, h: 18, vx: this.gvx * 0.3, vy: -120, grav: 1200, bounce: 0.55, life: 3.2, spin: 9, cancelable: true }));
      w.sfx('shoot');
    }
    if (w.tick % 5 === 0) w.particles.leaves(this.fx - this.face * 40, this.fy - 40, 1);
    this.sync();
    if (k >= 1) {
      this.rot = 0;
      w.particles.dust(this.fx, A.floorY, this.face, 10);
      w.camera.shake(3, 0.15); w.sfx('land');
      return true;
    }
    return false;
  }
  tickDive(dt) {
    const w = this.world, A = this.arena, p = w.player;
    this.subT += dt;
    if (this.sub === 0) {   // 画面の上へ跳び上がる
      this.pose = 'glide';
      this.fy -= 900 * dt;
      if (this.subT > 0.1 && w.tick % 3 === 0) w.particles.leaves(this.fx, this.fy, 1);
      if (this.fy < A.top - 220) { this.sub = 1; this.subT = 0; this.shadowX = p.cx; }
    } else if (this.sub === 1) {   // 影が主人公を追う
      this.shadowX += (clamp(p.cx, A.L + TILE * 2, A.R - TILE * 2) - this.shadowX) * Math.min(1, 5 * dt);
      this.shadowA = Math.min(1, this.subT / 0.3);
      if (this.subT >= TRACK_TIME / this.spd) { this.sub = 2; this.subT = 0; w.sfx('bossIntro'); }
    } else if (this.sub === 2) {   // 影が止まって大きくなる（予告）
      if (this.subT >= LOCK_TIME) { this.sub = 3; this.subT = 0; this.fx = this.shadowX; this.fy = A.top - 60; this.pose = 'dive'; this.face = 1; }
    } else if (this.sub === 3) {   // 急降下
      this.fy += DIVE_SPEED * this.spd * dt;
      if (this.fy >= A.floorY) {
        this.fy = A.floorY; this.shadowA = 0;
        w.camera.shake(10, 0.35); w.sfx('break');
        w.particles.dust(this.fx, A.floorY, -1, 10); w.particles.dust(this.fx, A.floorY, 1, 10);
        w.particles.debris(this.fx, A.floorY - 6, '#8a6a4a');
        this.face = p.cx < this.fx ? -1 : 1;
        this.sync();
        return true;
      }
    }
    this.sync();
    return false;
  }
  updateRects() {
    const s = this.state;
    this.nBodies = 0;
    hideRect(this.weak);
    if (s === 'dormant') return;
    if (this.pose === 'rest' || ((s === 'hurt' || s === 'phase') && !this.onBranch() && this.fy >= this.arena.floorY - 1)) {
      setRect(this.weak, this.fx - 48, this.fy - 70, 96, 40);
      return;
    }
    if (this.pose === 'dive') { setRect(this.bodies[0], this.fx - 26, this.fy - 120, 52, 112); this.nBodies = 1; return; }
    if (this.state === 'attack' && this.moveName === 'dive' && this.sub >= 1) return;   // 画面の外
    // 滑空・止まり木
    setRect(this.bodies[0], this.fx - 44, this.fy - 78, 88, 64); this.nBodies = 1;
    setRect(this.weak, this.fx - 30, this.fy - 92, 60, 16);
  }
  defeatPoint() { return { x: this.fx, y: this.arena.floorY - 60 }; }

  drawBack(ctx) {
    const A = this.arena;
    drawSprite(ctx, 'boss_musasabi_tree', 0, this.treeX[0], A.floorY);
    drawSprite(ctx, 'boss_musasabi_tree', 0, this.treeX[1], A.floorY, { flip: true });
  }
  draw(ctx, a) {
    const A = this.arena, w = this.world;
    const fx = this.fx, fy = this.fy;
    // 地面の影
    if (this.state === 'attack' && this.moveName === 'dive' && (this.sub === 1 || this.sub === 2 || this.sub === 3)) {
      const k = this.sub === 2 ? 1 + this.subT / LOCK_TIME * 0.6 : this.sub === 3 ? 1.6 : 1;
      const blink = this.sub === 2 && ((this.t * 14) | 0) % 2;
      this.shadow(ctx, this.shadowX, A.floorY - 2, 70 * k, (blink ? 0.6 : 0.42) * this.shadowA);
      if (this.sub === 2) this.alertMark(ctx, this.shadowX, A.floorY - 70 - Math.sin(this.t * 20) * 3);
    } else if (this.airborne && this.state !== 'dormant' && fy < A.floorY - 4) {
      const hgt = A.floorY - fy;
      this.shadow(ctx, fx, A.floorY - 2, clamp(110 - hgt * 0.25, 30, 110), clamp(0.4 - hgt / 1200, 0.1, 0.4));
    } else if (!this.airborne || fy >= A.floorY - 4) this.shadow(ctx, fx, A.floorY - 2, 120, 0.3);
    if (this.state === 'attack' && this.moveName === 'dive' && (this.sub === 1 || this.sub === 2)) return;
    const flip = this.face < 0;
    let name = 'boss_musasabi_' + this.pose, fr = 0, rot = 0;
    switch (this.pose) {
      case 'perch': fr = (this.t * 4) | 0; break;
      case 'tell': fr = (this.t * 12) | 0; break;
      case 'glide': case 'glide2': fr = (this.t * 8) | 0; rot = (this.rot || 0) * (flip ? -1 : 1); break;
      case 'rest': fr = (this.t * 8) | 0; break;
      case 'dive': fr = (this.t * 16) | 0; break;
      case 'angry': fr = (this.t * 10) | 0; break;
    }
    if (this.state === 'tell') {
      const sh = Math.sin(this.t * 60) * 1.5;
      this.sprite(ctx, name, fr, fx + sh, fy, flip);
      w.lights.push({ x: fx + this.face * 40, y: fy - 70, r: 70, color: '#ffd84a', a: 0.9 });
    } else if (this.pose === 'glide' || this.pose === 'glide2') {
      this.sprite(ctx, name, fr, fx, fy + 8, flip, 1, 1, rot);
    } else this.sprite(ctx, name, fr, fx, fy, flip);
    this.weakGlow(ctx);
  }
}
registerBoss('musasabi', Musasabi);
