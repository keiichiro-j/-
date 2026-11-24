import { TILE } from '../core/config.js';
import { Entity } from '../actors/entity.js';
import { Boss, BossLayer, registerBoss, setRect, hideRect, clamp, lerp, ease, pushPlayer } from './bossBase.js';
import { drawSprite } from '../gfx/atlas.js';

// 5. 雪鬼（白川郷）HP12。弱点：雪玉を投げた直後の硬直（隙）に、背中（後ろか上から）を攻撃。正面からの技ははじく
//  段階1 雪玉を転がす（転がるうちに大きくなる）／跳んで反対側へ
//  段階2 足踏みで天井からつららを落とす（揺れ＋床の影で予告）＋ 着地の雪けむり
//  段階3 吹雪：画面が白くなり（主人公のまわりだけ見える）、横風で押し戻す（雪煙の流れで予告）
const DEF = {
  id: 'yukioni', name: '雪鬼', title: '合掌の里の冬の主', hp: 12,
  moves: {
    roll: { tell: 0.75, rest: 1.7 },
    leap: { tell: 0.55, rest: 0 },
    icicles: { tell: 0.7, rest: 0 },
  },
  phases: [
    { moves: ['roll', 'roll', 'leap'], speed: 1.0, wait: 0.9 },
    { moves: ['icicles', 'roll', 'leap', 'roll'], speed: 1.1, wait: 0.8 },
    { moves: ['roll', 'icicles', 'leap', 'roll'], speed: 1.15, wait: 0.75 },
  ],
};
const BALL_SPEED = 290, BALL_R0 = 16, BALL_R1 = 44, BALL_GROW = 26;   // 半径/秒
const ICICLE_N = 5, ICICLE_SHAKE = 0.65;
const WIND = { calm: 1.4, warn: 0.8, gust: 1.6, force: 115 };

class Snowball extends Entity {
  constructor(w, x, floorY, dir, spd, arena) {
    super(w, { type: 'snowball' }); this.bossHazard = true;
    this.hazard = true; this.persistent = true; this.z = 5; this.touchDamage = 1;
    this.r = BALL_R0; this.fx = x; this.floorY = floorY; this.dir = dir; this.spd = spd; this.arena = arena; this.rot = 0;
    this.sync(); this.px = this.x; this.py = this.y;
  }
  get cancelable() { return this.r < 26; }
  set cancelable(v) {}
  sync() { const k = 0.72; this.w = this.h = this.r * 2 * k; this.x = this.fx - this.r * k; this.y = this.floorY - this.r - this.r * k; }
  update(dt) {
    const w = this.world, A = this.arena;
    this.r = Math.min(BALL_R1, this.r + BALL_GROW * dt);
    this.fx += this.dir * BALL_SPEED * this.spd * dt;
    this.rot += this.dir * BALL_SPEED * this.spd * dt / this.r;
    if (w.tick % 4 === 0) w.particles.burst(this.fx - this.dir * this.r, this.floorY - 4, 1, { angle: -Math.PI / 2 - this.dir * 0.6, spread: 0.6, speed: 90, life: 0.5, size: 5, size1: 0, color: '#fff', grav: 300 });
    this.sync();
    if (this.fx - this.r < A.L || this.fx + this.r > A.R) this.cancel();
  }
  cancel() {
    if (!this.alive) return;
    this.alive = false;
    const w = this.world;
    w.particles.burst(this.fx, this.floorY - this.r, 18, { speed: 260, life: 0.7, size: 8, size1: 2, color: '#f4faff', grav: 700, shape: 'square', vr: 8 });
    w.sfx('break'); w.camera.shake(3, 0.12);
  }
  draw(ctx, a) {
    const s = this.r / 46;
    ctx.fillStyle = 'rgba(40,60,90,0.25)'; ctx.beginPath(); ctx.ellipse(this.fx, this.floorY - 1, this.r, this.r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    drawSprite(ctx, 'boss_yukioni_ball', 0, this.fx, this.floorY - this.r, { rot: this.rot, sx: s, sy: s });
  }
}

class Icicle extends Entity {
  constructor(w, x, top, floorY, delay) {
    super(w, { type: 'icicle' }); this.bossHazard = true;
    this.hazard = true; this.cancelable = true; this.persistent = true; this.z = 5; this.touchDamage = 1;
    this.w = 20; this.h = 56; this.x = this.px = x - 10; this.y = this.py = top; this.floorY = floorY; this.delay = delay; this.vy = 0;
  }
  update(dt) {
    this.t += dt;
    if (this.t < this.delay) return;
    this.vy = Math.min(this.vy + 2000 * dt, 900);
    this.y += this.vy * dt;
    if (this.y + this.h >= this.floorY) this.cancel();
  }
  cancel() {
    if (!this.alive) return;
    this.alive = false;
    this.world.particles.burst(this.cx, this.floorY - 6, 10, { speed: 220, life: 0.5, size: 5, size1: 1, color: '#d8f0ff', grav: 900, shape: 'spark' });
    this.world.sfx('break');
  }
  draw(ctx, a) {
    const shake = this.t < this.delay ? Math.sin(this.t * 70) * 2 : 0;
    // 床の影（予告）
    const k = Math.min(1, this.t / this.delay);
    ctx.fillStyle = `rgba(40,70,120,${0.15 + 0.3 * k})`;
    ctx.beginPath(); ctx.ellipse(this.cx, this.floorY - 1, 10 + 14 * k, 4, 0, 0, Math.PI * 2); ctx.fill();
    drawSprite(ctx, 'boss_yukioni_icicle', 0, this.cx + shake, this.iy(a));
  }
}

class Yukioni extends Boss {
  constructor(world, arena) { super(world, arena, DEF); }
  setup() {
    this.w = 100; this.h = 130;
    this.world.spawn(new BossLayer(this.world, this, 30, 'drawBlizzard'));
  }
  resetPose() {
    const A = this.arena;
    this.fx = A.R - TILE * 5; this.fy = A.floorY; this.face = -1; this.pose = 'idle';
    this.blizzard = 0; this.windT = 0; this.windDir = -1; this.windStage = 0; this.windK = 0;
    this.sync();
  }
  sync() { this.x = this.fx - this.w / 2; this.y = this.fy - this.h; }
  facePlayer() { this.face = this.world.player.cx < this.fx ? -1 : 1; }
  onPhase(n) { if (n === 3) this.windT = 0; }
  onEnter(s, m) {
    const A = this.arena, w = this.world, p = w.player;
    switch (s) {
      case 'intro': this.pose = 'idle'; this.fy = A.top - 220; break;
      case 'idle': this.pose = 'idle'; this.facePlayer(); break;
      case 'tell':
        this.facePlayer();
        this.pose = this.moveName === 'roll' ? 'tell' : this.moveName === 'leap' ? 'rest' : 'stomp';
        if (this.moveName === 'icicles') this.dropIcicles();
        break;
      case 'attack':
        if (this.moveName === 'roll') { this.pose = 'throw'; w.spawn(new Snowball(w, this.fx + this.face * 70, A.floorY, this.face, this.spd, A)); w.sfx('shootBig'); }
        else if (this.moveName === 'leap') {
          this.pose = 'jump'; this.ox = this.fx;
          this.tx = this.fx > A.cx ? A.L + TILE * 4.5 : A.R - TILE * 4.5;
          if (Math.abs(p.cx - this.tx) < TILE * 2) this.tx = clamp(this.tx + (this.tx < A.cx ? 1 : -1) * TILE * 3, A.L + TILE * 3, A.R - TILE * 3);
          this.face = this.tx > this.ox ? 1 : -1; this.dur = 1.0 / this.spd; w.sfx('jump');
        } else { this.pose = 'stomp'; w.camera.shake(10, 0.4); w.sfx('thunder'); }
        break;
      case 'rest': this.pose = 'rest'; break;
      case 'recover': this.pose = 'idle'; break;
      case 'hurt': this.pose = 'hurt'; break;
      case 'phase': this.pose = 'angry'; break;
    }
  }
  dropIcicles() {
    const w = this.world, A = this.arena, p = w.player;
    const top = A.top + TILE * 1.2;
    const px = clamp(p.cx, A.L + 30, A.R - 30);
    // 主人公の真上＋左右に間をあけて。かわせる隙間（3タイル）を必ず残す
    for (let i = 0; i < ICICLE_N; i++) {
      const k = i - (ICICLE_N - 1) / 2;
      const x = px + k * TILE * 3.2;
      if (x < A.L + 20 || x > A.R - 20) continue;
      w.spawn(new Icicle(w, x, top, A.floorY, ICICLE_SHAKE + this.tellT + Math.abs(k) * 0.12));
    }
  }
  shockwave() {
    // 着地の雪けむり（床すれすれ、跳んでかわす）は段階2から
    if (this.phase < 2) return;
    const w = this.world, A = this.arena;
    for (const d of [-1, 1]) w.spawn(new Snowball(w, this.fx + d * 70, A.floorY, d, 1.15, A)).r = 12;
  }
  tick(dt, s, m) {
    const A = this.arena, w = this.world, p = w.player;
    // 吹雪（段階3）
    if (this.phase >= 3 && !this.dying) {
      this.blizzard = Math.min(1, this.blizzard + dt * 0.8);
      this.windT += dt;
      const lim = this.windStage === 0 ? WIND.calm : this.windStage === 1 ? WIND.warn : WIND.gust;
      if (this.windT >= lim) {
        this.windT = 0; this.windStage = (this.windStage + 1) % 3;
        if (this.windStage === 1) this.windDir = p.cx < this.fx ? -1 : 1;   // 鬼から主人公の向きへ吹く（押し戻す）
      }
      const target = this.windStage === 2 ? 1 : 0;
      this.windK += (target - this.windK) * Math.min(1, dt * 4);
      if (this.windK > 0.02 && this.state !== 'intro') pushPlayer(w, this.windDir * WIND.force * this.windK * dt);
      if (this.windStage >= 1 && (w.tick & 1) === 0) {
        const cam = w.camera;
        w.particles.spawn({ x: this.windDir > 0 ? cam.x - 10 : cam.x + cam.vw + 10, y: cam.y + Math.random() * cam.vh, vx: this.windDir * (this.windStage === 2 ? 700 : 260), vy: 40, life: 2, size: this.windStage === 2 ? 4 : 3, size1: 2, color: 'rgba(255,255,255,0.9)', front: true });
      }
    } else this.blizzard = Math.max(0, this.blizzard - dt);
    if (s === 'intro') {
      const k = Math.min(1, this.st / 0.6);
      this.fy = lerp(A.top - 220, A.floorY, k * k);
      if (k >= 1 && this.pose !== 'angry') { this.pose = 'angry'; w.camera.shake(10, 0.4); w.particles.dust(this.fx, A.floorY, 0, 16); w.sfx('break'); this.facePlayer(); }
    } else if (s === 'tell') {
      if (this.moveName === 'roll' && w.tick % 3 === 0) w.particles.spawn({ x: this.fx + (Math.random() - 0.5) * 140, y: this.fy - 200 - Math.random() * 40, vx: (this.fx - (this.fx + (Math.random() - 0.5) * 140)) * 1.5, vy: 60, life: 0.4, size: 4, size1: 1, color: '#fff' });
    } else if (s === 'attack') {
      if (this.moveName === 'roll') { if (this.st > 0.3) return true; }
      else if (this.moveName === 'icicles') { if (this.st > 0.8) return true; }
      else if (this.moveName === 'leap') {
        const k = Math.min(1, this.st / this.dur);
        this.fx = lerp(this.ox, this.tx, ease(k)); this.fy = A.floorY - Math.sin(k * Math.PI) * 240;
        if (k >= 1) {
          this.fy = A.floorY; w.camera.shake(12, 0.4); w.sfx('break');
          w.particles.dust(this.fx, A.floorY, -1, 12); w.particles.dust(this.fx, A.floorY, 1, 12);
          this.shockwave(); this.facePlayer(); this.sync(); return true;
        }
      }
    } else if (s === 'recover') { this.sync(); return true; }
    this.sync();
    return false;
  }
  updateRects() {
    this.nBodies = 0; hideRect(this.weak);
    if (this.state === 'dormant') return;
    const fx = this.fx, fy = this.fy, f = this.face;
    if (this.pose === 'rest' || this.state === 'hurt') {
      // 背中側の半分と肩（上から踏める）。正面は shielded ではじく
      setRect(this.weak, f > 0 ? fx - 66 : fx - 10, fy - 104, 76, 100);
      if (this.state === 'tell') { setRect(this.bodies[0], fx - 50, fy - 110, 100, 104); this.nBodies = 1; }
      return;
    }
    setRect(this.bodies[0], fx - 48, fy - 128, 96, 122); this.nBodies = 1;
    setRect(this.weak, fx - 34, fy - 176, 68, 40);
  }
  isVulnerable() { return this.state === 'rest'; }
  // 正面からの技ははじく（上から・後ろからは通る）
  shielded(source, r) {
    if (!this.canHit()) return true;
    const sx = source.cx ?? (r.x + r.w / 2), sy = (r.y + r.h);
    const fromFront = Math.sign(sx - this.fx) === this.face;
    const fromAbove = sy < this.fy - 96;
    return fromFront && !fromAbove;
  }
  defeatPoint() { return { x: this.fx, y: this.arena.floorY - 80 }; }
  onDefeat() { this.windK = 0; }

  drawBlizzard(ctx) {
    if (this.blizzard <= 0.01) return;
    const w = this.world, cam = w.camera, p = w.player;
    const x = cam.x - 40, y = cam.y - 40, vw = cam.vw + 80, vh = cam.vh + 80;
    const k = this.blizzard * (0.75 + 0.1 * Math.sin(w.time * 1.7));
    const g = ctx.createRadialGradient(p.cx, p.cy, 60, p.cx, p.cy, 320);
    g.addColorStop(0, 'rgba(240,248,255,0)');
    g.addColorStop(1, `rgba(236,244,252,${0.72 * k})`);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, vw, vh);
    // 吹雪の中でも読めるように：鬼の光る目・雪玉・つららの印を上に重ねる
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    const ex = this.fx + this.face * 24, ey = this.fy - (this.pose === 'rest' ? 110 : 136);
    ctx.fillStyle = this.state === 'tell' ? '#ff4030' : 'rgba(40,80,160,0.9)';
    ctx.beginPath(); ctx.arc(ex - 8 * this.face, ey, 4, 0, Math.PI * 2); ctx.arc(ex + 12 * this.face, ey, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(30,60,120,0.55)'; ctx.lineWidth = 3;
    for (const e of w.entities) {
      if (!e.alive) continue;
      if (e.type === 'snowball') { ctx.beginPath(); ctx.arc(e.fx, e.floorY - e.r, e.r, 0, Math.PI * 2); ctx.stroke(); }
      else if (e.type === 'icicle') { ctx.beginPath(); ctx.moveTo(e.cx - 10, e.y); ctx.lineTo(e.cx, e.y + e.h); ctx.lineTo(e.cx + 10, e.y); ctx.stroke(); }
    }
    ctx.restore();
    if (this.windStage === 1) this.alertMark(ctx, p.cx - this.windDir * 40, p.y - 30, 0.8);
  }
  draw(ctx, a) {
    if (this.state === 'dormant') return;
    const A = this.arena, w = this.world;
    const hgt = A.floorY - this.fy;
    this.shadow(ctx, this.fx, A.floorY - 1, clamp(150 - hgt * 0.3, 60, 150), 0.35);
    let fr = (this.t * 4) | 0;
    if (this.pose === 'tell' || this.pose === 'stomp' || this.pose === 'angry') fr = (this.t * 10) | 0;
    const sh = this.state === 'tell' ? Math.sin(this.t * 50) * 1.5 : 0;
    this.sprite(ctx, 'boss_yukioni_' + this.pose, fr, this.fx + sh, this.fy + 4, this.face < 0);
    if (this.state === 'tell') w.lights.push({ x: this.fx + this.face * 24, y: this.fy - 136, r: 70, color: '#9fe0ff', a: 0.9 });
    this.weakGlow(ctx);
  }
}
registerBoss('yukioni', Yukioni);
