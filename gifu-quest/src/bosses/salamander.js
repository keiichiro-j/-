import { TILE } from '../core/config.js';
import { T } from '../world/tiles.js';
import { Boss, BossShot, BossLayer, BossPlatform, registerBoss, setRect, hideRect, clamp, lerp, ease } from './bossBase.js';
import { drawSprite } from '../gfx/atlas.js';

// 2. 大山椒魚（長良川）HP10
//  アリーナの床の中央に川（幅8タイル・深さ1タイル）を作り、そこに潜む
//  段階1 水中から顔を出して噛みつく（跳びかかって岸に上がる）→ 岸で休む（隙：背中を踏む）
//  段階2 水しぶきの弾を扇状に3発 ＋ 噛みつき
//  段階3 水位が上がり（world.liquids）、浮き足場（いかだ）の上で戦う。真下からの噛みつき → 水面に浮いて休む
const DEF = {
  id: 'salamander', name: '大山椒魚', title: '長良川のぬし', hp: 10,
  moves: {
    bite: { tell: 0.75, rest: 1.6 },
    splash: { tell: 0.6, rest: 0 },
    bite3: { tell: 0.75, rest: 1.6 },
    splash3: { tell: 0.55, rest: 0 },
  },
  phases: [
    { moves: ['bite'], speed: 1.0, wait: 1.0 },
    { moves: ['splash', 'bite'], speed: 1.12, wait: 0.85 },
    { moves: ['bite3', 'splash3', 'bite3'], speed: 1.2, wait: 0.8 },
  ],
};
const CH_W = 8;                 // 川の幅（タイル）
const RISE = TILE * 3.3;        // 段階3で上がる水位
const RISE_TIME = 2.4;
const SPLASH_N = 3;

class Salamander extends Boss {
  constructor(world, arena) { super(world, arena, DEF); }
  setup() {
    const A = this.arena, L = this.world.level;
    const mid = Math.round((A.L + A.R) / 2 / TILE);
    this.chTx0 = mid - CH_W / 2; this.chTx1 = mid + CH_W / 2 - 1;
    for (let tx = this.chTx0; tx <= this.chTx1; tx++) L.set(tx, A.floorTy, T.WATER_TOP);
    this.chL = this.chTx0 * TILE; this.chR = (this.chTx1 + 1) * TILE;
    this.surfY = A.floorY + 8;    // 川の水面
    this.q = { kind: 'water', x0: A.L, x1: A.R, y: A.floorY + 40 };   // 段階3の水（最初は川の下）
    this.world.liquids.push(this.q);
    this.rafts = [];
    this.world.spawn(new BossLayer(this.world, this, 9, 'drawWater'));
    this.w = 160; this.h = 60;
  }
  resetPose() {
    const A = this.arena;
    this.fx = (this.chL + this.chR) / 2; this.fy = this.surfY; this.face = -1;
    this.pose = 'hidden'; this.touchDamage = 1;
    this.q.y = A.floorY + 40; this.waterT = -1;
    for (const r of this.rafts) r.alive = false;
    this.rafts.length = 0;
    this.ripX = this.fx; this.ripA = 0;
    this.sync();
  }
  sync() { this.x = this.fx - this.w / 2; this.y = this.fy - this.h; }
  get waterY() { return this.phase >= 3 && this.waterT >= 0 ? this.q.y : this.surfY; }
  get flooded() { return this.phase >= 3 && this.waterT >= 0; }
  onPhase(n) {
    if (n === 3) {
      this.waterT = 0;
      const A = this.arena, w = this.world;
      const xs = [A.L + TILE * 2.5, (A.L + A.R) / 2 - TILE * 1.5, A.R - TILE * 5.5];
      for (const x of xs) {
        const r = new BossPlatform(w, x, A.floorY - 10, TILE * 3, 14);
        r.baseX = x; this.rafts.push(r); this.own(r);
      }
    }
  }
  cancelMove() { this.ripA = 0; }
  onEnter(s, m) {
    const A = this.arena, p = this.world.player;
    this.touchDamage = 1;
    switch (s) {
      case 'intro': this.pose = 'hidden'; this.fx = (this.chL + this.chR) / 2; this.fy = this.surfY; break;
      case 'idle': if (this.pose !== 'hidden') this.submerge(); break;
      case 'tell': {
        this.ripA = 1;
        if (this.moveName === 'bite') {
          const inCh = p.cx > this.chL && p.cx < this.chR;
          this.ex = inCh ? clamp(p.cx, this.chL + 40, this.chR - 40) : (p.cx < this.chL ? this.chL + 40 : this.chR - 40);
          this.ripX = this.ex; this.pose = 'hidden';
        } else if (this.moveName === 'bite3') { this.ripX = clamp(p.cx, A.L + 60, A.R - 60); this.pose = 'hidden'; }
        else {   // 水しぶき：主人公から離れた所に顔を出す
          const x = this.flooded ? (p.cx < A.cx ? A.R - TILE * 4 : A.L + TILE * 4) : (this.chL + this.chR) / 2;
          this.fx = x; this.fy = this.waterY; this.face = p.cx < x ? -1 : 1; this.pose = 'puff'; this.ripX = x;
          this.splashUp(x);
        }
        break;
      }
      case 'attack':
        this.ripA = 0;
        if (this.moveName === 'bite' || this.moveName === 'bite3') this.startBite();
        else { this.pose = 'spit'; this.shots = 0; }
        break;
      case 'rest': this.pose = 'rest'; this.touchDamage = 0; break;
      case 'recover': this.ox = this.fx; this.oy = this.fy; this.tx = this.flooded ? this.fx : clamp(this.fx, this.chL + 50, this.chR - 50); this.pose = this.pose === 'spit' || this.pose === 'puff' ? this.pose : 'bite'; break;
      case 'hurt': this.pose = 'hurt'; break;
      case 'phase': this.pose = 'angry'; break;
    }
  }
  splashUp(x) { const w = this.world; w.particles.splash(x, this.waterY); w.particles.splash(x + 30, this.waterY); w.sfx('splash'); }
  submerge() { this.splashUp(this.fx); this.pose = 'hidden'; this.fy = this.waterY; }
  startBite() {
    const A = this.arena, p = this.world.player;
    this.pose = 'bite';
    if (this.moveName === 'bite3') {
      this.ox = this.ripX; this.oy = this.waterY + 40; this.tx = this.ripX; this.ty = this.waterY; this.peak = 210; this.dur = 0.85 / this.spd;
    } else {
      this.ox = this.ex; this.oy = this.surfY + 50;
      const onLeft = p.cx < (this.chL + this.chR) / 2;
      const inCh = p.cx > this.chL && p.cx < this.chR;
      const lo = onLeft ? A.L + 90 : this.chR + 90, hi = onLeft ? this.chL - 90 : A.R - 90;
      this.tx = inCh ? (onLeft ? this.chL - 110 : this.chR + 110) : clamp(p.cx, lo, hi);
      this.ty = A.floorY; this.peak = 150; this.dur = clamp(Math.abs(this.tx - this.ox) / 520, 0.6, 1.0) / this.spd;
    }
    this.face = this.tx > this.ox + 2 ? 1 : this.tx < this.ox - 2 ? -1 : (p.cx < this.ox ? -1 : 1);
    this.fx = this.ox; this.fy = this.oy;
    this.splashUp(this.ox);
    this.world.sfx('bossPhase');
  }
  tick(dt, s, m) {
    const A = this.arena, w = this.world, p = w.player;
    // 段階3：水位を上げ、いかだを浮かべる
    if (this.waterT >= 0) {
      this.waterT += dt;
      const k = ease(Math.min(1, this.waterT / RISE_TIME));
      this.q.y = lerp(A.floorY + 40, A.floorY - RISE, k);
      for (let i = 0; i < this.rafts.length; i++) {
        const r = this.rafts[i];
        r.moveTo(r.baseX + Math.sin(this.t * 0.8 + i * 2) * 14, Math.min(A.floorY - 10, this.q.y - 8) + Math.sin(this.t * 2.2 + i) * 3);
      }
    }
    if (s === 'intro') {
      if (this.st > 0.35 && this.pose === 'hidden') { this.pose = 'angry'; this.fy = this.surfY; this.splashUp(this.fx); w.camera.shake(6, 0.4); }
    } else if (s === 'tell') {
      if ((w.tick & 7) === 0) w.particles.spawn({ x: this.ripX + (Math.random() - 0.5) * 60, y: this.waterY - 4, vy: -50, life: 0.5, size: 5, size1: 2, color: 'rgba(230,248,255,0.9)', shape: 'ring' });
      if (this.pose !== 'hidden') this.fy = this.waterY;
    } else if (s === 'attack') {
      if (this.pose === 'spit') {
        this.fy = this.waterY;
        if (this.shots === 0 && this.st > 0.05) {
          this.shots = 1;
          // 扇状に3発（放物線）
          const dir = this.face, hx = this.fx + dir * 90, hy = this.fy - 30;
          const dist = clamp(Math.abs(p.cx - hx), 160, 600);
          for (let i = 0; i < SPLASH_N; i++) {
            const k = (i - (SPLASH_N - 1) / 2);
            const vx = dir * (dist * 0.9 + k * 150) * 0.85 * this.spd;
            w.spawn(new BossShot(w, hx, hy, { sprite: 'boss_salamander_drop', w: 20, h: 20, vx, vy: -520 - Math.abs(k) * 40, grav: 1300, life: 3, orient: true, cancelable: true }));
          }
          w.sfx('shootBig'); w.particles.splash(hx, hy);
        }
        return this.st > 0.55;
      }
      const k = Math.min(1, this.st / this.dur);
      this.fx = lerp(this.ox, this.tx, k);
      this.fy = lerp(this.oy, this.ty, k) - Math.sin(k * Math.PI) * this.peak;
      if (k >= 1) {
        this.fy = this.ty;
        if (this.moveName === 'bite3') { this.splashUp(this.fx); this.pose = 'rest'; }
        else { w.particles.dust(this.fx, A.floorY, 0, 12); w.camera.shake(7, 0.3); w.sfx('land'); }
        this.sync();
        return true;
      }
    } else if (s === 'rest') {
      if (this.flooded) this.fy = this.waterY + 26;
    } else if (s === 'recover') {
      if (this.pose === 'spit' || this.pose === 'puff' || this.flooded) { if (this.st > 0.15) { this.submerge(); this.sync(); return true; } }
      else {
        const k = Math.min(1, this.st / 0.6);
        this.fx = lerp(this.ox, this.tx, k); this.fy = lerp(this.oy, this.surfY + 30, k) - Math.sin(k * Math.PI) * 90;
        this.face = this.tx >= this.ox ? 1 : -1;
        if (k >= 1) { this.submerge(); this.sync(); return true; }
      }
    } else if (s === 'hurt' || s === 'phase') {
      if (this.flooded) this.fy = this.waterY + 26;
    }
    this.sync();
    return false;
  }
  updateRects() {
    this.nBodies = 0; hideRect(this.weak);
    const s = this.state, fx = this.fx, fy = this.fy, f = this.face;
    if (s === 'dormant' || this.pose === 'hidden') return;
    if (this.pose === 'rest' || s === 'hurt' || (s === 'phase' && this.pose === 'angry' && fy < this.surfY - 4)) {
      setRect(this.weak, fx - 72, fy - 68, 144, 28);
      return;
    }
    if (this.pose === 'bite') { setRect(this.bodies[0], fx - 80 + f * 20, fy - 96, 160, 74); this.nBodies = 1; setRect(this.weak, fx - 50, fy - 112, 100, 16); return; }
    if (this.pose === 'puff' || this.pose === 'spit' || this.pose === 'angry') {
      const wy = this.waterY;
      setRect(this.bodies[0], f > 0 ? fx - 50 : fx - 110, wy - 36, 160, 40); this.nBodies = 1;
      setRect(this.weak, fx - 50, wy - 50, 100, 14);
    }
  }
  defeatPoint() { return { x: this.flooded ? this.arena.cx : this.fx, y: this.arena.floorY - 80 }; }
  onDefeat() { this.waterT = -1; this.drain = true; }

  // 水（段階3の水位）といかだ
  drawWater(ctx) {
    const A = this.arena, w = this.world;
    if (this.drain && this.q.y < A.floorY + 40) this.q.y = Math.min(A.floorY + 40, this.q.y + 2);
    const y = this.q.y;
    if (y > A.floorY + 30) { for (const r of this.rafts) if (r.alive) drawSprite(ctx, 'boss_salamander_raft', 0, r.x + r.w / 2, r.y + 8, { sx: r.w / 112 }); return; }
    const x0 = A.L - TILE, x1 = A.R + TILE, bot = A.floorY + TILE;
    ctx.save();
    const g = ctx.createLinearGradient(0, y, 0, bot);
    g.addColorStop(0, 'rgba(90,170,210,0.55)'); g.addColorStop(1, 'rgba(20,70,120,0.75)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x0, bot);
    for (let x = x0; x <= x1; x += 24) ctx.lineTo(x, y + Math.sin(x * 0.03 + w.time * 3) * 3);
    ctx.lineTo(x1, bot); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(235,250,255,0.8)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); for (let x = x0; x <= x1; x += 24) { const yy = y + Math.sin(x * 0.03 + w.time * 3) * 3; x === x0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); } ctx.stroke();
    ctx.restore();
    for (const r of this.rafts) if (r.alive) drawSprite(ctx, 'boss_salamander_raft', 0, r.x + r.w / 2, r.y + 8, { sx: r.w / 112 });
  }
  draw(ctx, a) {
    const A = this.arena, w = this.world;
    const wy = this.waterY;
    // 水面の波紋（予告）
    if (this.ripA > 0 && this.state === 'tell') {
      const k = this.st / this.tellT;
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const r = ((k * 2 + i / 3) % 1);
        ctx.strokeStyle = `rgba(240,252,255,${(1 - r) * 0.9})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(this.ripX, wy, 20 + r * 70, 5 + r * 14, 0, 0, Math.PI * 2); ctx.stroke();
      }
      // 水の中で光る目
      if (this.pose === 'hidden') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(150,240,255,${0.5 + 0.5 * Math.sin(this.t * 30)})`;
        ctx.beginPath(); ctx.arc(this.ripX - 10, wy + 10, 5, 0, Math.PI * 2); ctx.arc(this.ripX + 12, wy + 10, 5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      if (this.moveName === 'bite3' || k > 0.4) this.alertMark(ctx, this.ripX, wy - 40);
      w.lights.push({ x: this.ripX, y: wy, r: 80, color: '#9fe8ff', a: 0.8 });
    }
    if (this.pose === 'hidden' || this.state === 'dormant') return;
    const flip = this.face < 0;
    const N = 'boss_salamander_';
    // 水面より下は隠す（川の中・水の中）
    const clipY = this.pose === 'rest' && !this.flooded ? 1e5 : (this.flooded ? wy + 30 : A.floorY + 6);
    ctx.save();
    ctx.beginPath(); ctx.rect(A.L - 400, A.top - 600, A.R - A.L + 800, clipY - A.top + 600); ctx.clip();
    switch (this.pose) {
      case 'puff': this.sprite(ctx, N + 'puff', (this.t * 10) | 0, this.fx, wy + 44, flip); break;
      case 'spit': this.sprite(ctx, N + 'spit', 0, this.fx, wy + 44, flip); break;
      case 'angry': this.sprite(ctx, N + 'angry', (this.t * 10) | 0, this.fx, (this.state === 'intro' || this.fy >= this.surfY - 4 ? wy + 70 : this.fy), flip); break;
      case 'bite': this.sprite(ctx, N + 'bite', (this.t * 10) | 0, this.fx, this.fy, flip, 1, 1, this.state === 'recover' ? (flip ? -0.5 : 0.5) : 0); break;
      case 'rest': this.sprite(ctx, N + 'rest', (this.t * 7) | 0, this.fx, this.fy, flip); break;
      case 'hurt': this.sprite(ctx, N + 'hurt', 0, this.fx, this.fy, flip); break;
    }
    ctx.restore();
    if (this.pose === 'rest' && !this.flooded) this.shadow(ctx, this.fx, A.floorY - 2, 220, 0.25);
    if (this.pose === 'puff') w.lights.push({ x: this.fx + this.face * 100, y: wy - 20, r: 70, color: '#9fe8ff', a: 0.8 });
    this.weakGlow(ctx);
  }
}
registerBoss('salamander', Salamander);
