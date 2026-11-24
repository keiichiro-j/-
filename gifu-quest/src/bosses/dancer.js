import { TILE } from '../core/config.js';
import { Entity } from '../actors/entity.js';
import { Boss, BossShot, BossLayer, registerBoss, setRect, hideRect, clamp, lerp, ease, overlap } from './bossBase.js';
import { drawSprite } from '../gfx/atlas.js';

// 3. 踊り神（郡上）HP10。弱点は頭（編み笠）
//  段階1 輪になって踊りながら移動（跳ね）、扇子を投げる（ブーメラン）→ 踊りの一拍休み（隙）
//  段階2 分身2体（本体だけ足元に影がある）。3体で並び替わって一斉に扇子 → 本体だけ一拍休み
//  段階3 太鼓の拍に合わせて床が光り（予告）、次の拍で光った床から光の柱（攻撃）
const DEF = {
  id: 'dancer', name: '踊り神', title: '郡上の夜を舞う', hp: 10,
  moves: {
    hop: { tell: 0.45, rest: 0 },
    fan: { tell: 0.6, rest: 1.3 },
    clones: { tell: 0.7, rest: 1.4 },
    taiko: { tell: 0.6, rest: 1.5 },
  },
  phases: [
    { moves: ['hop', 'fan'], speed: 1.0, wait: 0.7 },
    { moves: ['clones', 'hop', 'fan'], speed: 1.1, wait: 0.6 },
    { moves: ['taiko', 'hop', 'fan', 'clones'], speed: 1.15, wait: 0.55 },
  ],
};
const SEG_TILES = 4;               // 光る床の1区画（タイル）
const BEAT_WARN = 0.7, BEAT_FIRE = 0.35, BEAT_GAP = 0.15;   // 太鼓：光る（予告）→ 柱 → 間
const TAIKO_PATTERNS = [0b0101010, 0b1010101, 0b1100011, 0b0011100, 0b0101010, 0b1010101];
const FAN_DIST = 430, FAN_SPEED = 520;

// 扇子：まっすぐ飛んで戻ってくる
class FanShot extends BossShot {
  constructor(w, owner, x, y, dir, spd) {
    super(w, x, y, { sprite: 'boss_dancer_fan', w: 34, h: 26, vx: dir * FAN_SPEED * spd, life: 4, solid: false, cancelable: true });
    this.owner = owner; this.dir = dir; this.ox = x; this.back = false; this.spd = spd; this.oy = y;
  }
  update(dt) {
    this.t += dt; this.life -= dt;
    const w = this.world;
    if (!this.back) {
      this.vx = this.dir * FAN_SPEED * this.spd * Math.max(0.25, 1 - Math.abs(this.cx - this.ox) / FAN_DIST);
      const A = this.owner.arena;
      if (Math.abs(this.cx - this.ox) >= FAN_DIST || this.cx < A.L + 10 || this.cx > A.R - 10) this.back = true;
    } else {
      const tx = this.owner.handX ?? this.ox;
      this.vx = Math.sign(tx - this.cx) * FAN_SPEED * this.spd * 0.9;
      if (Math.abs(tx - this.cx) < 14 || this.life <= 0) { this.remove(); return; }
    }
    this.x += this.vx * dt;
    this.y = this.oy - this.h / 2 + Math.sin(this.t * 6) * 6;
    if (w.tick % 4 === 0) w.particles.spawn({ x: this.cx, y: this.cy, life: 0.3, size: 4, size1: 0, color: '#ffd84a', add: true });
  }
  draw(ctx, a) { drawSprite(ctx, this.sprite, (this.t * 16) | 0, this.ix(a) + this.w / 2, this.iy(a) + this.h / 2); }
}

// 分身（影がない）。踏むと煙になって消える
class Clone extends Entity {
  constructor(w, owner) {
    super(w, { type: 'dancerClone' });
    this.owner = owner; this.enemy = true; this.stompable = true; this.bossMinion = true; this.persistent = true;
    this.w = 56; this.h = 130; this.z = 4; this.fx = 0; this.fy = 0; this.face = -1;
    this._hr = { x: 0, y: 0, w: 0, h: 0 };
  }
  hurtRect() { const r = this._hr; r.x = this.fx - 30; r.y = this.fy - 140; r.w = 60; r.h = 136; return r; }
  place(x, y) { this.fx = x; this.fy = y; this.x = x - this.w / 2; this.y = y - this.h; }
  // 消えるのは次の更新で（当たった瞬間に alive=false にすると World が「倒した敵」に数えてしまう。分身は敵の数に入れない）
  poof() {
    if (!this.alive || this.poofed) return;
    this.poofed = true; this.enemy = false;
    const w = this.world;
    w.particles.burst(this.fx, this.fy - 70, 18, { speed: 160, life: 0.6, size: 14, size1: 2, color: 'rgba(220,220,255,0.8)', drag: 3 });
    w.sfx('defeat');
  }
  onStomp() { this.poof(); }
  damage() { this.poof(); return true; }
  update(dt) { this.t += dt; if (this.poofed) this.alive = false; }
  draw(ctx) { if (this.poofed) return; this.owner.drawDancer(ctx, this.fx, this.fy, this.face, this.owner.cloneAnim(), 0.82, this.t); }
}

class Dancer extends Boss {
  constructor(world, arena) { super(world, arena, DEF); }
  setup() {
    const A = this.arena;
    this.w = 56; this.h = 130;
    this.segN = Math.floor((A.R - A.L) / (SEG_TILES * TILE));
    this.segX0 = A.cx - this.segN * SEG_TILES * TILE / 2;
    this.segW = SEG_TILES * TILE;
    this.segState = new Uint8Array(this.segN);   // 0 なし 1 予告 2 柱
    this.clones = [new Clone(this.world, this), new Clone(this.world, this)];
    this.world.spawn(new BossLayer(this.world, this, -1, 'drawFloor'));
    this.world.spawn(new BossLayer(this.world, this, 8, 'drawPillars'));
    this._pillar = { x: 0, y: 0, w: 0, h: 0 };
  }
  resetPose() {
    const A = this.arena;
    this.fx = A.R - TILE * 6; this.fy = A.floorY; this.face = -1;
    this.pose = 'dance'; this.segState.fill(0); this.beat = -1;
    this.handX = null;
    for (const c of this.clones) c.alive = false;
    this.sync();
  }
  sync() { this.x = this.fx - this.w / 2; this.y = this.fy - this.h; this.handX = this.fx + this.face * 30; }
  cloneAnim() { return this.pose; }
  cancelMove() { this.segState.fill(0); this.beat = -1; this.killClones(); }
  killClones() { for (const c of this.clones) c.poof(); }
  facePlayer() { this.face = this.world.player.cx < this.fx ? -1 : 1; }
  onEnter(s, m) {
    const A = this.arena;
    switch (s) {
      case 'intro': this.pose = 'dance'; this.fy = A.top - 160; break;
      case 'idle': this.pose = 'dance'; if (this.clonesOut()) this.killClones(); break;
      case 'tell':
        this.facePlayer();
        this.pose = this.moveName === 'hop' ? 'dance' : this.moveName === 'taiko' ? 'drum' : 'tell';
        if (this.moveName === 'clones') this.spawnClones();
        if (this.moveName === 'taiko') { this.ox = this.fx; }
        break;
      case 'attack':
        if (this.moveName === 'hop' || this.moveName === 'clones') this.startHop();
        else if (this.moveName === 'fan') { this.pose = 'throw'; this.throwFans(); }
        else if (this.moveName === 'taiko') { this.pose = 'drum'; this.beat = 0; this.beatT = 0; this.beatStage = 0; this.lightPattern(0); }
        break;
      case 'rest': this.pose = 'rest'; this.segState.fill(0); this.beat = -1; break;
      case 'recover': this.pose = 'dance'; this.killClones(); this.segState.fill(0); this.beat = -1; break;
      case 'hurt': this.pose = 'hurt'; this.killClones(); break;
      case 'phase': this.pose = 'angry'; this.killClones(); break;
    }
  }
  clonesOut() { return this.clones.some((c) => c.alive && !c.poofed); }
  spawnClones() {
    const w = this.world;
    for (const c of this.clones) {
      c.alive = true; c.poofed = false; c.enemy = true; c.place(this.fx, this.fy); c.face = this.face;
      if (!w.entities.includes(c)) w.spawn(c);
    }
    w.particles.burst(this.fx, this.fy - 70, 24, { speed: 220, life: 0.7, size: 16, size1: 2, color: 'rgba(230,220,255,0.85)', drag: 3 });
    w.sfx('bossIntro');
  }
  // 跳ねて移動（分身のときは3体が入れ替わる）
  startHop() {
    const A = this.arena, p = this.world.player;
    this.pose = 'dance';
    this.ox = this.fx; this.oy = this.fy;
    const lo = A.L + TILE * 2.5, hi = A.R - TILE * 2.5;
    if (this.moveName === 'clones') {
      // 3つの位置（主人公から離れた所）に入れ替わって着地
      const spots = this._spots || (this._spots = [0, 0, 0]);
      const far = p.cx < A.cx ? 1 : -1;
      const base = clamp(p.cx + far * TILE * 7, lo + TILE * 4, hi - TILE * 4);
      spots[0] = base - TILE * 4; spots[1] = base; spots[2] = base + TILE * 4;
      const real = (this.world.tick % 3);
      this.tx = spots[real];
      let j = 0;
      for (const c of this.clones) { if (j === real) j++; c.ox = c.fx; c.tx = spots[j++]; }
      this.dur = 0.9;
    } else {
      const d = p.cx - this.fx;
      let tx;
      if (Math.abs(d) < TILE * 5) tx = this.fx - Math.sign(d || 1) * TILE * 6;   // 近いと離れる
      else tx = this.fx + Math.sign(d) * Math.min(Math.abs(d) - TILE * 4, TILE * 6);
      if (tx < lo || tx > hi) tx = clamp(this.fx + Math.sign(d || 1) * TILE * 6, lo, hi);
      if (Math.abs(tx - p.cx) < TILE * 2.5) tx = clamp(p.cx + (tx < p.cx ? -1 : 1) * TILE * 4, lo, hi);
      this.tx = tx;
      this.dur = 0.75 / this.spd;
    }
    this.face = this.tx >= this.ox ? 1 : -1;
    this.world.sfx('jump');
  }
  throwFans() {
    const w = this.world, p = w.player, A = this.arena;
    // 低い扇子（跳んでかわす）と高い扇子（立ったままでかわす）を交互に
    this.lowFan = !this.lowFan;
    const y = this.lowFan ? A.floorY - 24 : A.floorY - 96;
    this.facePlayer();
    w.spawn(new FanShot(w, this, this.fx + this.face * 30, y, this.face, this.spd));
    for (const c of this.clones) if (c.alive && !c.poofed) { c.face = p.cx < c.fx ? -1 : 1; w.spawn(new FanShot(w, { arena: A, handX: c.fx }, c.fx + c.face * 30, y, c.face, this.spd)); }
    w.sfx('slash');
  }
  lightPattern(i) {
    const bits = TAIKO_PATTERNS[i % TAIKO_PATTERNS.length];
    for (let s = 0; s < this.segN; s++) this.segState[s] = (bits >> (s % 7)) & 1 ? 1 : 0;
    // 主人公のいる区画のどちらか隣は必ず安全に
  }
  tick(dt, s, m) {
    const A = this.arena, w = this.world, p = w.player;
    if (s === 'intro') {
      const k = Math.min(1, this.st / 0.6);
      this.fy = lerp(A.top - 160, A.floorY, ease(k));
      if (k >= 1 && this.pose !== 'angry') { this.pose = 'angry'; w.camera.shake(6, 0.3); w.particles.dust(this.fx, A.floorY, 0, 12); w.sfx('land'); }
    } else if (s === 'attack') {
      if (this.moveName === 'hop' || this.moveName === 'clones') {
        const k = Math.min(1, this.st / this.dur);
        this.fx = lerp(this.ox, this.tx, ease(k)); this.fy = A.floorY - Math.sin(k * Math.PI) * 150;
        for (const c of this.clones) if (c.alive && !c.poofed) c.place(lerp(c.ox, c.tx, ease(k)), this.fy);
        if (k >= 1) {
          this.fy = A.floorY; w.particles.dust(this.fx, A.floorY, 0, 6); w.sfx('land');
          if (this.moveName === 'clones') { this.throwFans(); this.pose = 'throw'; }
          this.facePlayer();
          this.sync(); return true;
        }
      } else if (this.moveName === 'fan') {
        if (this.st > 0.35) { this.pose = 'rest'; this.sync(); return true; }
      } else if (this.moveName === 'taiko') {
        this.beatT += dt;
        const lim = this.beatStage === 0 ? BEAT_WARN : this.beatStage === 1 ? BEAT_FIRE : BEAT_GAP;
        if (this.beatT >= lim) {
          this.beatT = 0;
          if (this.beatStage === 0) {   // ドン！ 光った床から柱
            this.beatStage = 1;
            for (let i = 0; i < this.segN; i++) if (this.segState[i] === 1) this.segState[i] = 2;
            w.camera.shake(5, 0.15); w.sfx('thunder');
          } else if (this.beatStage === 1) { this.beatStage = 2; this.segState.fill(0); }
          else {
            this.beat++;
            if (this.beat >= 4) { this.sync(); return true; }
            this.beatStage = 0; this.lightPattern(this.beat + (this.phaseSeed = (this.phaseSeed || 0) + 1));
            w.sfx('bump');
          }
        }
        // 柱に触れると被弾
        if (this.beatStage === 1) {
          const pr = this.playerRect(), r = this._pillar;
          for (let i = 0; i < this.segN; i++) if (this.segState[i] === 2) {
            setRect(r, this.segX0 + i * this.segW + 6, A.floorY - 150, this.segW - 12, 150);
            if (overlap(pr, r)) { this.hurtPlayer(this); break; }
          }
        }
      }
    } else if (s === 'recover') { this.sync(); return true;
    } else if (s === 'idle' || s === 'tell') {
      if (this.moveName !== 'taiko' || s === 'idle') this.facePlayer();
    }
    this.sync();
    return false;
  }
  updateRects() {
    this.nBodies = 0; hideRect(this.weak);
    if (this.state === 'dormant') return;
    setRect(this.weak, this.fx - 34, this.fy - 146, 68, 34);
    setRect(this.bodies[0], this.fx - 28, this.fy - 110, 56, 104); this.nBodies = 1;
    if (this.state === 'rest' || this.state === 'hurt') this.nBodies = 0;   // 一拍休みは触れても痛くない
  }
  isVulnerable() { return this.state === 'rest'; }
  defeatPoint() { return { x: this.fx, y: this.arena.floorY - 80 }; }

  drawDancer(ctx, x, y, face, pose, alpha, t) {
    const N = 'boss_dancer_';
    let fr = 0;
    if (pose === 'dance') fr = (t * 8) | 0; else if (pose === 'tell' || pose === 'angry' || pose === 'rest') fr = (t * 8) | 0; else if (pose === 'drum') fr = this.beatStage === 1 ? 1 : 0;
    if (alpha < 1) drawSprite(ctx, N + pose, fr, x, y + 6, { flip: face < 0, alpha });
    else this.sprite(ctx, N + pose, fr, x, y + 6, face < 0);
  }
  drawFloor(ctx) {
    if (this.beat < 0 && this.state !== 'tell') return;
    const A = this.arena, w = this.world;
    for (let i = 0; i < this.segN; i++) {
      const st = this.segState[i];
      if (!st) continue;
      const x = this.segX0 + i * this.segW;
      const k = st === 1 ? Math.min(1, this.beatT / BEAT_WARN) : 1;
      const blink = st === 1 && ((this.t * 12) | 0) % 2;
      ctx.fillStyle = st === 2 ? 'rgba(255,240,160,0.9)' : `rgba(255,170,60,${0.25 + k * 0.45 + (blink ? 0.15 : 0)})`;
      ctx.fillRect(x + 3, A.floorY - 6, this.segW - 6, 10);
      if (st === 1) { // 床の模様（巴）
        ctx.strokeStyle = `rgba(255,220,120,${0.5 + k * 0.5})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x + this.segW / 2, A.floorY - 1, this.segW * 0.35 * (0.6 + k * 0.4), 5, 0, 0, Math.PI * 2); ctx.stroke();
      }
      w.lights.push({ x: x + this.segW / 2, y: A.floorY - 20, r: 70, color: '#ffbe5a', a: 0.6 + k * 0.4 });
    }
  }
  drawPillars(ctx) {
    const A = this.arena;
    for (let i = 0; i < this.segN; i++) {
      const st = this.segState[i];
      if (!st) continue;
      const x = this.segX0 + i * this.segW, cx = x + this.segW / 2;
      if (st === 1) {   // 予告：薄い柱の枠と、床から上る光の粒
        const k = Math.min(1, this.beatT / BEAT_WARN);
        ctx.save();
        ctx.setLineDash([8, 6]); ctx.lineDashOffset = -this.t * 40;
        ctx.strokeStyle = `rgba(255,120,40,${0.35 + k * 0.5})`; ctx.lineWidth = 3;
        ctx.strokeRect(x + 8, A.floorY - 150, this.segW - 16, 150);
        ctx.restore();
        if ((this.world.tick & 3) === 0) this.world.particles.spawn({ x: x + 10 + Math.random() * (this.segW - 20), y: A.floorY - 4, vy: -160 - k * 120, life: 0.5, size: 4, size1: 0, color: '#ffb040', add: true });
        continue;
      }
      const k = 1 - this.beatT / BEAT_FIRE;
      const ww = (this.segW - 12) * (0.75 + 0.25 * k);
      const g = ctx.createLinearGradient(0, A.floorY - 165, 0, A.floorY);
      g.addColorStop(0, 'rgba(255,80,40,0)'); g.addColorStop(0.35, `rgba(255,110,40,${0.75 * k})`); g.addColorStop(1, `rgba(255,220,90,${0.95 * k})`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - ww / 2, A.floorY - 165, ww, 165);
      ctx.fillStyle = `rgba(255,255,230,${0.8 * k})`;
      ctx.fillRect(cx - ww * 0.18, A.floorY - 140, ww * 0.36, 140);
      this.world.lights.push({ x: cx, y: A.floorY - 70, r: 130, color: '#ffcf6a', a: 1 });
    }
  }
  draw(ctx, a) {
    if (this.state === 'dormant') return;
    const A = this.arena;
    // 本体だけ影がある
    const hgt = A.floorY - this.fy;
    this.shadow(ctx, this.fx, A.floorY - 1, clamp(90 - hgt * 0.3, 40, 90), 0.45);
    this.drawDancer(ctx, this.fx, this.fy, this.face, this.pose, 1, this.t);
    if (this.state === 'tell' && this.moveName !== 'hop') this.world.lights.push({ x: this.fx, y: this.fy - 110, r: 80, color: '#ffd84a', a: 0.9 });
    this.weakGlow(ctx);
  }
}
registerBoss('dancer', Dancer);
