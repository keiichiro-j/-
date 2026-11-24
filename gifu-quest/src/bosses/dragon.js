import { TILE } from '../core/config.js';
import { T } from '../world/tiles.js';
import { Boss, BossShot, BossLayer, BossPlatform, registerBoss, setRect, hideRect, clamp, lerp, ease, overlap } from './bossBase.js';
import { drawSprite } from '../gfx/atlas.js';

// 6. 乗鞍の火竜（奥飛騨）HP16。床の中央に溶岩の池（幅10タイル）、岩の足場（低い4つ・高い3つ）
//  段階1 溶岩から首を出して火の玉（放物線で3つ）→ 頭を岸に下ろして休む（隙：頭を踏む）
//  段階2 炎の息を横一直線（低い帯／高い帯。帯の位置を点線で予告）→ 上か下へ逃げる
//  段階3 溶岩が上がり床が沈む（world.liquids）。岩の足場は乗ると崩れて沈み、しばらくして浮かぶ
const DEF = {
  id: 'dragon', name: '乗鞍の火竜', title: '火の山にねむる龍', hp: 16,
  moves: {
    fireball: { tell: 0.75, rest: 1.5 },
    breath: { tell: 0.8, rest: 1.6 },
  },
  phases: [
    { moves: ['fireball'], speed: 1.0, wait: 1.0 },
    { moves: ['breath', 'fireball', 'breath'], speed: 1.08, wait: 0.9 },
    { moves: ['fireball', 'breath', 'breath', 'fireball'], speed: 1.15, wait: 0.85 },
  ],
};
const PIT_W = 10;                       // 溶岩の池の幅（タイル）
const LAVA_RISE = TILE * 1.15, LAVA_TIME = 3.0;
const ROCK_W = TILE * 3;
const LOW = TILE * 2.2, HIGH = TILE * 3.8;
// 息の帯（床からの高さ [下, 上]）。段階2：床／岩の高さ、段階3：低い岩／高い岩の高さ
const BANDS = [[[0, 58], [86, 140]], [[66, 118], [128, 180]]];
const BREATH_TIME = 1.0;
const CRUMBLE_SHAKE = 0.8, CRUMBLE_FALL = 1.6, ROCK_BACK = 2.2;   // 低い岩だけ崩れる（高い岩は安全地帯。ただし高い帯の息が来る）
const FIRE_G = 900;

class Dragon extends Boss {
  constructor(world, arena) { super(world, arena, DEF); }
  setup() {
    const A = this.arena, w = this.world, L = w.level;
    this.w = 160; this.h = 100;
    const mid = Math.round((A.L + A.R) / 2 / TILE);
    this.pitTx0 = mid - PIT_W / 2; this.pitTx1 = mid + PIT_W / 2 - 1;
    this.pitL = this.pitTx0 * TILE; this.pitR = (this.pitTx1 + 1) * TILE;
    this.carvePit(T.LAVA_TOP);
    this.q = { kind: 'lava', x0: A.L, x1: A.R, y: A.floorY + 40 };
    w.liquids.push(this.q);
    const cx = (this.pitL + this.pitR) / 2;
    const spots = [[A.L + TILE * 3.5, LOW], [this.pitL + TILE * 2, LOW], [this.pitR - TILE * 2, LOW], [A.R - TILE * 3.5, LOW], [cx - TILE * 7, HIGH], [cx, HIGH], [cx + TILE * 7, HIGH]];
    this.rocks = spots.map(([x, h]) => {
      const r = new BossPlatform(w, x - ROCK_W / 2, A.floorY - h, ROCK_W, 14);
      r.homeY = A.floorY - h; r.crumble = 0; r.down = 0; r.sink = 0;
      w.spawn(r); return r;
    });
    w.spawn(new BossLayer(w, this, -1, 'drawRocks'));
    w.spawn(new BossLayer(w, this, 9, 'drawLava'));
    this._band = { x: 0, y: 0, w: 0, h: 0 };
  }
  carvePit(t) { const L = this.world.level; for (let tx = this.pitTx0; tx <= this.pitTx1; tx++) L.set(tx, this.arena.floorTy, t); }
  resetPose() {
    const A = this.arena;
    this.ex = (this.pitL + this.pitR) / 2; this.face = -1;
    this.hx = this.ex; this.hy = A.floorY + 120; this.head = 'idle'; this.hidden = true;
    this.q.y = A.floorY + 40; this.lavaT = -1; this.drain = false;
    if (this.cooled) { this.carvePit(T.LAVA_TOP); this.cooled = false; }
    for (const r of this.rocks) { r.crumble = 0; r.down = 0; r.sink = 0; r.warp(r.x, r.homeY); }
    this.breathA = 0; this.roared = false;
    this.sync();
  }
  get surf() { return this.lavaT >= 0 ? this.q.y : this.arena.floorY + 4; }
  sync() { this.x = this.hx - this.w / 2; this.y = this.hy - this.h / 2; }
  onPhase(n) { if (n === 3) this.lavaT = 0; }
  cancelMove() { this.breathA = 0; }
  // 首を出す場所
  pickEmerge(nearPlayer) {
    const A = this.arena, p = this.world.player;
    if (this.lavaT >= 0) {
      // 主人公から3〜6タイル離れた溶岩から
      const side = p.cx < A.cx ? 1 : -1;
      return clamp(p.cx + side * TILE * (nearPlayer ? 3.5 : 6), A.L + TILE * 2, A.R - TILE * 2);
    }
    if (nearPlayer) return p.cx < (this.pitL + this.pitR) / 2 ? this.pitL + 50 : this.pitR - 50;
    return p.cx < (this.pitL + this.pitR) / 2 ? this.pitR - 60 : this.pitL + 60;
  }
  onEnter(s, m) {
    const A = this.arena, w = this.world, p = w.player;
    switch (s) {
      case 'intro': this.ex = (this.pitL + this.pitR) / 2; this.hx = this.ex; this.hy = A.floorY + 120; this.hidden = false; this.head = 'angry'; break;
      case 'idle': break;
      case 'tell':
        this.hidden = false;
        this.ex = this.pickEmerge(this.moveName === 'fireball');
        this.face = p.cx < this.ex ? -1 : 1;
        this.oy = this.hy = this.surf + 100; this.hx = this.ex;
        this.head = 'tell';
        if (this.moveName === 'breath') {
          const bands = BANDS[this.lavaT >= 0 ? 1 : 0];
          this.bandI = this.lavaT >= 0 ? (this.bandI ? 0 : 1) : (p.y + p.h < A.floorY - 20 ? 1 : (this.bandI === 0 ? 1 : 0));
          const b = bands[this.bandI];
          this.bandY0 = A.floorY - b[1]; this.bandY1 = A.floorY - b[0];
          this.ty = (this.bandY0 + this.bandY1) / 2 - 10;   // 口が帯の真ん中に来る
        } else this.ty = this.surf - 170;
        w.sfx('bossIntro');
        break;
      case 'attack':
        this.head = 'open'; this.shots = 0;
        if (this.moveName === 'breath') { this.breathA = 1; w.sfx('explosion'); }
        break;
      case 'rest': {
        this.head = 'rest'; this.breathA = 0;
        this.ox = this.hx; this.oy = this.hy;
        // 頭を岸（段階3は溶岩の上）に下ろす
        this.rty = (this.lavaT >= 0 ? this.surf - 8 : A.floorY) - 44;
        break;
      }
      case 'recover': this.ox = this.hx; this.oy = this.hy; this.breathA = 0; this.head = this.head === 'rest' || this.head === 'hurt' ? 'hurt' : 'idle'; break;
      case 'hurt': this.head = 'hurt'; break;
      case 'phase': this.head = 'angry'; this.ox = this.hx; this.oy = this.hy; break;
    }
  }
  spit() {
    const w = this.world, p = w.player;
    const mx = this.hx + this.face * 150, my = this.hy + 10;
    const T1 = 1.05;
    const k = this.shots - 1;
    const dx = p.cx + k * 80 - mx, dy = p.cy - my;
    w.spawn(new BossShot(w, mx, my, { sprite: 'boss_dragon_fireball', w: 22, h: 22, vx: dx / T1, vy: (dy - 0.5 * FIRE_G * T1 * T1) / T1, grav: FIRE_G, life: 3, cancelable: true, glow: '#ff9a3a', trail: '#ff8a2a' }));
    w.sfx('shoot');
  }
  tick(dt, s, m) {
    const A = this.arena, w = this.world, p = w.player;
    // 溶岩（段階3）と崩れる岩
    if (this.lavaT >= 0) {
      this.lavaT += dt;
      this.q.y = lerp(A.floorY + 40, A.floorY - LAVA_RISE, ease(Math.min(1, this.lavaT / LAVA_TIME)));
      if (this.q.y < A.floorY && w.tick % 10 === 0) w.particles.spawn({ x: A.L + Math.random() * (A.R - A.L), y: this.q.y, vy: -120, life: 0.7, size: 5, size1: 0, color: '#ffb040', add: true, grav: 200 });
      for (const r of this.rocks) if (r.homeY > A.floorY - HIGH + 4) this.tickRock(r, dt);
    } else if (this.drain && this.q.y < A.floorY + 40) this.q.y += 60 * dt;
    switch (s) {
      case 'intro': {
        const k = Math.min(1, this.st / 0.8);
        this.hx = this.ex; this.hy = lerp(A.floorY + 120, A.floorY - 190, ease(k)); this.face = p.cx < this.ex ? -1 : 1;
        if (this.st > 0.8 && !this.roared) { this.roared = true; w.camera.shake(12, 0.6); w.sfx('thunder'); w.particles.explosion(this.ex, A.floorY, 0.8); }
        break;
      }
      case 'tell': {
        const k = Math.min(1, this.st / this.tellT);
        this.hx = this.ex; this.hy = lerp(this.oy, this.ty, ease(Math.min(1, k * 1.4)));
        if (w.tick % 3 === 0) w.particles.spawn({ x: this.ex + (Math.random() - 0.5) * 70, y: this.surf - 2, vy: -90 - Math.random() * 120, life: 0.5, size: 6, size1: 0, color: '#ff9a2a', add: true, grav: 300 });
        if (this.moveName === 'breath' && w.tick % 2 === 0) {   // 息を吸いこむ
          const a = Math.random() * Math.PI * 2, d = 90;
          const mx = this.hx + this.face * 150, my = this.hy + 10;
          w.particles.spawn({ x: mx + Math.cos(a) * d, y: my + Math.sin(a) * d, vx: -Math.cos(a) * d * 3, vy: -Math.sin(a) * d * 3, life: 0.3, size: 4, size1: 0, color: '#ffd070', add: true });
        }
        break;
      }
      case 'attack':
        if (this.moveName === 'fireball') {
          if (this.shots < 3 && this.st > 0.1 + this.shots * 0.22) { this.shots++; this.spit(); }
          if (this.st > 0.85) return true;
        } else {
          // 炎の息：口から壁までの帯
          const mx = this.hx + this.face * 140;
          const r = this._band;
          if (this.face > 0) setRect(r, mx, this.bandY0, A.R - mx, this.bandY1 - this.bandY0);
          else setRect(r, A.L, this.bandY0, mx - A.L, this.bandY1 - this.bandY0);
          if (overlap(this.playerRect(), r)) this.hurtPlayer(this);
          if (w.tick % 2 === 0) w.particles.spawn({ x: mx + this.face * Math.random() * Math.abs(r.w), y: lerp(this.bandY0, this.bandY1, Math.random()), vx: this.face * 300, vy: -60, life: 0.4, size: 10, size1: 0, color: '#ffcf4a', add: true, front: true });
          if (w.tick % 8 === 0) w.camera.shake(3, 0.1);
          if (this.st > BREATH_TIME) { this.breathA = 0; return true; }
        }
        break;
      case 'rest': {
        const k = Math.min(1, this.st / 0.35);
        this.hy = lerp(this.oy, this.rty, ease(k));
        if (this.st > 0.35 && this.st < 0.4) { w.camera.shake(5, 0.2); w.particles.dust(this.hx + this.face * 80, this.rty + 44, 0, 10); w.sfx('land'); }
        break;
      }
      case 'recover': {
        const k = Math.min(1, this.st / 0.45);
        this.hy = lerp(this.oy, this.surf + 110, k * k);
        if (k >= 1) { this.hidden = true; w.particles.splash(this.ex, this.surf, 'rgba(255,150,50,0.9)'); this.sync(); return true; }
        break;
      }
      case 'phase': this.hy = lerp(this.oy, this.surf - 190, ease(Math.min(1, this.st / 0.5))); if (this.st < 0.9 && w.tick % 6 === 0) w.particles.explosion(this.hx + this.face * 120, this.hy, 0.3); break;
    }
    this.sync();
    return false;
  }
  tickRock(r, dt) {
    const w = this.world, A = this.arena;
    if (r.down > 0) {   // 沈んでいる
      r.down -= dt; r.sink += dt;
      if (r.down <= 0) { r.crumble = 0; r.sink = 0; r.warp(r.x, r.homeY); w.particles.burst(r.x + r.w / 2, r.homeY, 8, { speed: 120, life: 0.4, size: 5, size1: 0, color: '#ffb040', add: true }); }
      return;
    }
    if (r.riding()) r.crumble += dt; else if (r.crumble > 0 && r.crumble < CRUMBLE_SHAKE) r.crumble = Math.max(0, r.crumble - dt * 0.5);
    else if (r.crumble >= CRUMBLE_SHAKE) r.crumble += dt;   // 揺れ始めたら止まらない
    if (r.crumble >= CRUMBLE_FALL) {
      r.down = ROCK_BACK; r.sink = 0; r.drawY = r.y;
      r.warp(r.x, A.floorY + 600);
      w.particles.debris(r.x + r.w / 2, r.homeY + 10, '#5a4a4a'); w.sfx('break');
    }
  }
  updateRects() {
    this.nBodies = 0; hideRect(this.weak);
    if (this.state === 'dormant' || this.hidden) return;
    const f = this.face, hx = this.hx, hy = this.hy;
    const x0 = f > 0 ? hx - 10 : hx - 150;
    if (this.head === 'rest' || this.state === 'hurt') { setRect(this.weak, x0 + 10, hy - 46, 140, 40); return; }
    // 溶岩からせり上がる途中（予告の泡が見えている間）は、岸に立つ主人公を下からはね上げない（QA：予告なしの被弾になっていた）
    if (this.state === 'tell' && this.st < this.tellT / 1.4) return;
    setRect(this.bodies[0], x0, hy - 34, 160, 66);
    setRect(this.bodies[1], hx - 26, hy + 30, 52, Math.max(0, this.surf - hy - 30));
    this.nBodies = 2;
    setRect(this.weak, x0 + 20, hy - 60, 110, 26);
  }
  isVulnerable() { return this.state === 'rest'; }
  defeatPoint() { return { x: this.arena.cx, y: this.arena.floorY - 120 }; }
  onDefeat() {
    // 溶岩が冷えて固まる（宝珠が沈まないように）
    this.lavaT = -1; this.drain = true;
    this.carvePit(T.STONE); this.cooled = true;
    for (const r of this.rocks) { r.down = 0; r.crumble = 0; r.warp(r.x, r.homeY); }
    this.world.particles.burst(this.arena.cx, this.arena.floorY, 30, { speed: 300, life: 1, size: 12, size1: 2, color: 'rgba(120,110,110,0.7)', grav: -60, drag: 2 });
  }

  drawRocks(ctx) {
    const A = this.arena;
    for (const r of this.rocks) {
      if (r.down > 0) {
        if (r.sink < 0.8) { const y = r.homeY + r.sink * 140; drawSprite(ctx, 'boss_dragon_rock', 1, r.x + r.w / 2 + Math.sin(r.sink * 40) * 2, y, { alpha: 1 - r.sink }); }
        else if (r.down < 0.5) { drawSprite(ctx, 'boss_dragon_rock', 0, r.x + r.w / 2, r.homeY + r.down * 120, { alpha: 1 - r.down * 2 }); }
        continue;
      }
      const shaking = r.crumble >= CRUMBLE_SHAKE;
      drawSprite(ctx, 'boss_dragon_rock', shaking ? 1 : 0, r.x + r.w / 2 + (shaking ? Math.sin(this.t * 60) * 2.5 : 0), r.y);
    }
  }
  drawLava(ctx) {
    const A = this.arena, w = this.world;
    // 池の光
    if (!this.cooled) w.lights.push({ x: (this.pitL + this.pitR) / 2, y: A.floorY, r: 260, color: '#ff7a2a', a: 0.9 });
    const y = this.q.y;
    if (y > A.floorY + 30) return;
    const x0 = A.L - TILE, x1 = A.R + TILE, bot = A.floorY + TILE * 1.5;
    const g = ctx.createLinearGradient(0, y, 0, bot);
    g.addColorStop(0, '#ffd060'); g.addColorStop(0.15, '#ff6a1a'); g.addColorStop(1, '#8a1a08');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x0, bot);
    for (let x = x0; x <= x1; x += 30) ctx.lineTo(x, y + Math.sin(x * 0.025 + w.time * 2) * 4);
    ctx.lineTo(x1, bot); ctx.closePath(); ctx.fill();
    for (let x = A.L + 60; x < A.R; x += 240) w.lights.push({ x, y, r: 160, color: '#ff8a2a', a: 0.9 });
  }
  draw(ctx, a) {
    if (this.state === 'dormant') return;
    const A = this.arena, w = this.world;
    // 予告：溶岩が泡立って光る
    if (this.state === 'tell') {
      const k = this.st / this.tellT;
      w.lights.push({ x: this.ex, y: this.surf, r: 90 + k * 60, color: '#ffb040', a: 1 });
      if (this.moveName === 'breath') {
        // 息の帯を点線で予告
        const mx = this.hx + this.face * 140;
        ctx.save(); ctx.setLineDash([14, 10]); ctx.lineDashOffset = this.t * 80 * this.face;
        ctx.strokeStyle = `rgba(255,${120 + 100 * Math.sin(this.t * 20)},40,${0.5 + 0.4 * k})`; ctx.lineWidth = 3;
        const xa = this.face > 0 ? mx : A.L, xb = this.face > 0 ? A.R : mx;
        ctx.strokeRect(xa, this.bandY0, xb - xa, this.bandY1 - this.bandY0);
        ctx.fillStyle = `rgba(255,140,40,${0.08 + 0.12 * k})`; ctx.fillRect(xa, this.bandY0, xb - xa, this.bandY1 - this.bandY0);
        ctx.restore();
        this.alertMark(ctx, this.face > 0 ? mx + 60 : mx - 60, this.bandY0 - 8, k);
      }
    }
    if (this.hidden) return;
    // 首（節を並べる）と頭。溶岩より下は隠す
    const surfClip = this.lavaT >= 0 ? this.q.y + 6 : A.floorY + 8;
    ctx.save();
    ctx.beginPath(); ctx.rect(A.L - 300, A.top - 400, A.R - A.L + 600, surfClip - A.top + 400); ctx.clip();
    const bx = this.ex, by = this.surf + 70, hx = this.hx, hy = this.hy + 6;
    const cx = bx - this.face * 30, cy = (by + hy) / 2 + 30;
    for (let i = 0; i <= 7; i++) {
      const u = i / 7, iu = 1 - u;
      const x = iu * iu * bx + 2 * iu * u * cx + u * u * (hx - this.face * 10), y = iu * iu * by + 2 * iu * u * cy + u * u * hy;
      const s = 1.05 - u * 0.3;
      drawSprite(ctx, 'boss_dragon_seg', 0, x, y, { sx: s, sy: s, flip: this.face < 0 });
    }
    let fr = (this.t * 6) | 0;
    const rot = this.head === 'rest' ? (this.face > 0 ? 0.12 : -0.12) : this.state === 'hurt' ? Math.sin(this.t * 40) * 0.08 : 0;
    this.sprite(ctx, 'boss_dragon_' + this.head, fr, hx, this.hy, this.face < 0, 1, 1, rot);
    ctx.restore();
    // 炎の息
    if (this.breathA > 0 && this.state === 'attack') {
      const mx = hx + this.face * 140, r = this._band;
      const g = ctx.createLinearGradient(0, this.bandY0, 0, this.bandY1);
      g.addColorStop(0, 'rgba(255,90,30,0.2)'); g.addColorStop(0.5, 'rgba(255,240,170,0.95)'); g.addColorStop(1, 'rgba(255,90,30,0.2)');
      ctx.fillStyle = g;
      const flick = Math.sin(this.t * 50) * 3;
      ctx.fillRect(r.x, this.bandY0 - flick, r.w, this.bandY1 - this.bandY0 + flick * 2);
      for (let x = r.x; x < r.x + r.w; x += 140) w.lights.push({ x: x + 70, y: (this.bandY0 + this.bandY1) / 2, r: 120, color: '#ffb040', a: 1 });
      ctx.fillStyle = 'rgba(255,255,220,0.9)';
      ctx.beginPath(); ctx.ellipse(mx, (this.bandY0 + this.bandY1) / 2, 30, (this.bandY1 - this.bandY0) / 2, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (this.head === 'tell' || this.head === 'open') w.lights.push({ x: hx + this.face * 120, y: this.hy, r: 110, color: '#ffa040', a: 1 });
    this.weakGlow(ctx);
  }
}
registerBoss('dragon', Dragon);
