import { TILE } from '../core/config.js';
import { Entity } from '../actors/entity.js';
import { Boss, BossShot, BossLayer, BossPlatform, registerBoss, setRect, hideRect, clamp, lerp, ease, rect, MAX_HIT } from './bossBase.js';
import { drawSprite } from '../gfx/atlas.js';

// 8. 大シーサー（沖縄・ニライカナイの島）HP16。全クリア後の特別ステージのボス
//  アリーナの両端に赤瓦の屋根（主人公も乗れる通り抜け足場）。出番前は屋根の上の石のシーサーで、近づくと色がついて動き出す
//  段階1（吽：口を閉じた顔）屋根から飛び降りて地響き（着地点の影で予告）→ 着地の後に一息（隙）／突進（足かき＋たてがみ逆立ちで予告）→ 壁にぶつかって目を回す（隙）
//  段階2（阿：口を開けた顔）「シーサーの咆哮」：地をはう衝撃波（跳んでよける）→ 息切れ（隙）／尻尾で赤瓦を飛ばす（落ちる所に影）
//  段階3 阿と吽の2体に分かれ、左右の屋根から交互に攻撃（阿＝咆哮・飛び降り、吽＝突進・赤瓦）。
//        残りのHPを2体で分け、両方倒す。先に倒した方は石のシーサーに戻り、残った方がすべての技を使う
//  弱点：頭（隙の間に踏む・技を当てる）
const DEF = {
  id: 'shisa', name: '大シーサー', title: '南の島の守り獅子', hp: 16,
  moves: {
    pounce: { tell: 0.7, rest: 1.35 },
    charge: { tell: 0.75, rest: 1.6 },
    roar: { tell: 0.75, rest: 1.05 },
    tiles: { tell: 0.65, rest: 0 },
  },
  phases: [
    { moves: ['pounce', 'charge'], speed: 1.0, wait: 1.0 },
    { moves: ['roar', 'pounce', 'tiles', 'charge'], speed: 1.12, wait: 0.85 },
    { moves: ['roar', 'charge', 'pounce', 'tiles'], speed: 1.2, wait: 0.7 },
  ],
};
// 調整用の数値
const ROOF_W = 4 * TILE, ROOF_H = 3.25 * TILE;   // 屋根の幅・床からの高さ
const POUNCE_TIME = 0.8, POUNCE_ARC = 170;       // 飛び降りの時間・山の高さ
const LEAP_TIME = 0.7, LEAP_ARC = 120;           // 屋根へ戻る跳び
const CHARGE_SPEED = 470, HOP_TIME = 0.38;
const WAVE_SPEED = 360, WAVE_GAP = 0.55;         // 咆哮の波（段階3は2つ）
const TILES_N = [0, 0, 3, 4], TILE_FLIGHT = 0.95, TILE_GRAV = 1100, TILE_SPREAD = 100;
const HALF_SCALE = 0.8;                          // 段階3の阿・吽の大きさ
const MOUTH = ['un', 'a', null];                 // 段階ごとの顔（段階3は阿・吽それぞれ）
const HOME = [1, 0];                             // 段階3：阿は右の屋根、吽は左の屋根

// 咆哮の衝撃波（床をはう。跳んでよける）
class RoarWave extends Entity {
  constructor(w, x, floorY, dir, spd, arena) {
    super(w, { type: 'shisaWave' });
    this.bossHazard = true; this.hazard = true; this.cancelable = false; this.persistent = true; this.z = 5; this.touchDamage = 1;
    this.fx = x; this.floorY = floorY; this.dir = dir; this.spd = spd; this.arena = arena;
    this.w = 40; this.h = 34; this.sync(); this.px = this.x; this.py = this.y;
  }
  sync() { this.x = this.fx - this.w / 2; this.y = this.floorY - this.h; }
  update(dt) {
    this.t += dt;
    const w = this.world, A = this.arena;
    this.fx += this.dir * WAVE_SPEED * this.spd * dt;
    this.sync();
    if (w.tick % 3 === 0) w.particles.burst(this.fx - this.dir * 14, this.floorY - 4, 1, { angle: -Math.PI / 2 - this.dir * 0.5, spread: 0.7, speed: 110, life: 0.45, size: 6, size1: 0, color: '#e8c8a0', grav: 300 });
    if (this.fx < A.L + 8 || this.fx > A.R - 8) this.cancel();
  }
  cancel() {
    if (!this.alive) return;
    this.alive = false;
    this.world.particles.dust(this.fx, this.floorY, this.dir, 8);
  }
  draw(ctx) {
    const k = 0.85 + 0.15 * Math.sin(this.t * 30);
    drawSprite(ctx, 'boss_shisa_wave', (this.t * 14) | 0, this.fx, this.floorY, { flip: this.dir < 0, sx: k * 1.15, sy: 1.15 });
  }
}

// 尻尾で飛ばす赤瓦（落ちる所に影の予告）
class KawaraShot extends BossShot {
  constructor(w, x, y, tx, ty) {
    const T = TILE_FLIGHT;
    super(w, x, y, { sprite: 'boss_shisa_kawara', w: 26, h: 16, vx: (tx - x) / T, vy: (ty - y - 0.5 * TILE_GRAV * T * T) / T, grav: TILE_GRAV, life: 2.4, spin: 10, cancelable: true });
    this.bossHazard = true;
    this.tx = tx; this.ty = ty;
  }
  update(dt) {
    super.update(dt);
    if (!this.alive && this.cy > this.ty - 40) { this.world.particles.debris(this.cx, this.ty - 6, '#d0502a'); if (this.world.tick % 2 === 0) this.world.sfx('break'); }
  }
  draw(ctx, a) {
    const k = clamp(this.t / TILE_FLIGHT, 0, 1);
    ctx.fillStyle = `rgba(120,30,10,${0.15 + 0.3 * k})`;
    ctx.beginPath(); ctx.ellipse(this.tx, this.ty - 1, 8 + 12 * k, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    super.draw(ctx, a);
  }
}

// 段階3の吽の当たり（技・踏みつけを受ける窓口。絵は本体が描く）
class ShisaHalf extends Entity {
  constructor(w, owner) {
    super(w, { type: 'shisaUn' });
    this.owner = owner; this.enemy = false; this.stompable = true; this.stompFromTopOnly = true;
    this.bossMinion = true; this.persistent = true; this.touchDamage = 0; this.z = 4;
    this.w = 100; this.h = 100;
  }
  get invuln() { return this.owner.invuln; }
  set invuln(v) {}
  hurtRect() { return this.owner.halfWeak[1]; }
  shielded() { return !this.owner.canHitHalf(1); }
  damage(dmg, source) { return this.owner.hitHalf(1, dmg, source); }
  onStomp(p, dmg) { if (!this.owner.hitHalf(1, dmg, p)) this.owner.clangHalf(1); }
  update() {
    const B = this.owner.H[1];
    this.x = B.fx - 60; this.y = B.fy - 120; this.px = this.x; this.py = this.y; this.w = 120; this.h = 120;
  }
  draw() {}
}

function half(mouth) {
  return { fx: 0, fy: 0, face: -1, pose: 'idle', mouth, sc: 1, roof: -1, home: 0, hp: 0, stone: false, vis: false, ox: 0, oy: 0, tx: 0, ty: 0, dur: 1, arc: 0, k: 0, sub: 0, subT: 0, dir: 1, settle: 0, rx: null };
}

class Shisa extends Boss {
  constructor(world, arena) { super(world, arena, DEF); }
  setup() {
    const A = this.arena, w = this.world;
    this.w = 150; this.h = 124;
    this.roofTop = A.floorY - ROOF_H;
    this.roofX = [A.L + ROOF_W / 2, A.R - ROOF_W / 2];
    this.standX = [this.roofX[0] + 24, this.roofX[1] - 24];   // 屋根の上で立つ位置（しっぽが壁にかからないよう少し内側）
    this.roofs = this.roofX.map((x) => w.spawn(new BossPlatform(w, x - ROOF_W / 2, this.roofTop, ROOF_W, 14)));
    w.spawn(new BossLayer(w, this, -3, 'drawBack'));
    this.H = [half('un'), half('un')];
    this.halfWeak = [rect(), rect()];
    this.halfBody = [rect(), rect()];
    this.hitter = 0; this.act = 0;
    this.proxy = new ShisaHalf(w, this);
    this.shadowX = 0; this.shadowA = 0;
  }
  resetPose() {
    const A = this.arena;
    for (const B of this.H) { B.stone = false; B.vis = false; B.sc = 1; B.roof = -1; B.hp = 0; B.sub = 0; B.settle = 0; }
    const B = this.H[0];
    B.vis = true; B.mouth = MOUTH[0]; B.fx = this.standX[1]; B.fy = this.roofTop; B.roof = 1; B.face = -1; B.pose = 'stone';
    this.act = 0; this.hitter = 0; this.shadowA = 0; this.waves = 0; this.splitDone = false; this.splitStarted = false;
    if (this.proxy) { this.proxy.enemy = false; this.proxy.alive = false; }
    this.sync();
  }
  get B() { return this.H[this.act]; }
  sync() { const B = this.B; this.x = B.fx - this.w / 2; this.y = B.fy - this.h * B.sc; }
  facePlayer(B) { B.face = this.world.player.cx < B.fx ? -1 : 1; }
  peekNext() { const l = this.P.moves; return l[this.moveIdx % l.length]; }
  cancelMove() {
    this.shadowA = 0; this.waves = 0;
    for (const B of this.H) if (B.rx != null) { B.fx = B.rx; B.fy = this.arena.floorY; B.rx = null; }
  }
  nextMove() {
    if (this.phase >= 3) { let a = this.moveIdx % 2; if (this.H[a].stone) a = 1 - a; this.act = a; }
    else this.act = 0;
    super.nextMove();
  }
  // 跳ぶ（ox,oy → tx,ty を dur 秒・山の高さ arc で）。k=1 で着いた
  jumpTo(B, tx, ty, dur, arc) { B.ox = B.fx; B.oy = B.fy; B.tx = tx; B.ty = ty; B.dur = dur; B.arc = arc; B.k = 0; B.roof = -1; if (Math.abs(tx - B.fx) > 4) B.face = tx > B.fx ? 1 : -1; }
  stepJump(B, dt) {
    B.k = Math.min(1, B.k + dt / B.dur);
    const k = B.k;
    B.fx = lerp(B.ox, B.tx, k);
    B.fy = lerp(B.oy, B.ty, k) - Math.sin(k * Math.PI) * B.arc;
    return k >= 1;
  }

  onPhase(n) {
    const B0 = this.H[0], B1 = this.H[1];
    if (n === 2) B0.mouth = MOUTH[1];
    if (n === 3) {
      // 阿と吽に分かれる：残りのHPを2体で分ける（2以上になるように段階の割合が決まっている）
      const rem = Math.max(2, this.hp);
      B0.hp = Math.ceil(rem / 2); B1.hp = rem - B0.hp;
      B0.mouth = 'a'; B1.mouth = 'un';
      B1.fx = B0.fx; B1.fy = B0.fy; B1.face = B0.face; B1.vis = true; B1.stone = false; B1.pose = 'angry';
      B0.home = HOME[0]; B1.home = HOME[1];
      this.splitDone = false;
      const w = this.world;
      if (!w.entities.includes(this.proxy) || !this.proxy.alive) { this.proxy.alive = true; if (!w.entities.includes(this.proxy)) w.spawn(this.proxy); }
      this.proxy.enemy = true;
    }
  }
  onEnter(s, m) {
    const A = this.arena, w = this.world, p = w.player, B = this.B;
    switch (s) {
      case 'intro': B.pose = 'stone'; break;
      case 'idle': B.pose = 'idle'; this.facePlayer(B); break;
      case 'tell':
        this.facePlayer(B);
        B.pose = this.moveName === 'tiles' ? 'tail' : 'tell';
        if (this.moveName === 'pounce') { this.shadowX = this.pounceTarget(); this.shadowA = 0; }
        if (this.moveName === 'roar') w.sfx('bossIntro');
        break;
      case 'attack':
        B.sub = 0; B.subT = 0;
        if (this.moveName === 'pounce') {
          B.pose = 'jump';
          const hgt = B.roof >= 0 ? POUNCE_ARC * 0.7 : POUNCE_ARC * 1.4;
          this.jumpTo(B, this.shadowX, A.floorY, POUNCE_TIME / this.spd, hgt);
          w.sfx('jump');
        } else if (this.moveName === 'charge') {
          B.dir = B.roof === 0 ? 1 : B.roof === 1 ? -1 : (p.cx > B.fx ? 1 : -1);
          B.face = B.dir;
          if (B.roof >= 0) { B.pose = 'jump'; this.jumpTo(B, clamp(B.fx + B.dir * (ROOF_W / 2 + 60 * B.sc), A.L + 80, A.R - 80), A.floorY, HOP_TIME, 40); B.sub = 0; }
          else { B.sub = 1; B.pose = 'run'; }
          w.sfx('dash');
        } else if (this.moveName === 'roar') {
          B.pose = 'roar'; this.waves = this.phase >= 3 ? 2 : 1; this.waveT = 0;
          w.camera.shake(8, 0.5); w.sfx('thunder');
        } else if (this.moveName === 'tiles') {
          B.pose = 'tail'; B.sub = 1; this.throwTiles(B); w.sfx('shoot');
        }
        break;
      case 'rest':
        B.pose = this.moveName === 'charge' ? 'rest' : 'tired';
        this.shadowA = 0;
        break;
      case 'recover': this.planRecover(); break;
      case 'hurt': B.pose = 'hurt'; break;
      case 'phase': B.pose = 'angry'; break;
    }
  }
  // 着地点：屋根の下には降りない（隙の間に頭を踏めるように。屋根の下に隠れても、すぐ横に降りてくる）
  pounceTarget() { const A = this.arena; return clamp(this.world.player.cx, A.L + ROOF_W + 70, A.R - ROOF_W - 70); }
  // 次の技に合わせて位置を整える（屋根へ跳ぶ／そのまま）
  planRecover() {
    const B = this.B, p = this.world.player, A = this.arena;
    B.settle = 0;
    if (B.stone) { B.sub = 9; return; }
    let side = -1;
    if (this.phase >= 3) side = B.home;
    else if (B.roof < 0 && (this.peekNext() === 'pounce' || this.peekNext() === 'tiles')) side = p.cx < A.cx ? 1 : 0;
    if (side >= 0 && B.roof !== side) { B.sub = 1; B.pose = 'jump'; this.jumpTo(B, this.standX[side], this.roofTop, LEAP_TIME, LEAP_ARC + (B.roof >= 0 ? 40 : 0)); B.side = side; this.world.sfx('jump'); }
    else { B.sub = 0; B.pose = 'idle'; }
  }
  throwTiles(B) {
    const w = this.world, p = w.player, A = this.arena;
    const n = TILES_N[Math.min(3, this.phase)] || 3;
    const x0 = B.fx - B.face * 70 * B.sc, y0 = B.fy - 120 * B.sc;
    const ty = p.onGround ? Math.min(A.floorY, p.y + p.h) : A.floorY;
    for (let i = 0; i < n; i++) {
      const tx = clamp(p.cx + (i - (n - 1) / 2) * TILE_SPREAD, A.L + 20, A.R - 20);
      w.spawn(new KawaraShot(w, x0, y0, tx, ty));
    }
  }
  landFx(B, big) {
    const w = this.world, A = this.arena;
    w.camera.shake(big ? 12 : 6, big ? 0.45 : 0.2); w.sfx(big ? 'break' : 'land');
    w.particles.dust(B.fx, B.fy, -1, big ? 12 : 6); w.particles.dust(B.fx, B.fy, 1, big ? 12 : 6);
    if (big && B.fy >= A.floorY - 1) w.particles.debris(B.fx, A.floorY - 6, '#c8a878');
  }
  tick(dt, s, m) {
    const A = this.arena, w = this.world, p = w.player, B = this.B;
    // 段階3：番をしている方（屋根の上）は主人公を見る
    if (this.phase >= 3 && s !== 'phase' && s !== 'dying') {
      const G = this.H[1 - this.act];
      if (!G.stone && G.roof >= 0) { this.facePlayer(G); G.pose = 'idle'; }
    }
    if (s === 'intro') {
      if (this.st > 0.7 && B.pose === 'stone') { B.pose = 'angry'; w.camera.shake(10, 0.5); w.sfx('thunder'); w.particles.burst(B.fx, B.fy - 90, 24, { speed: 260, life: 0.7, size: 8, size1: 1, color: '#c8c6c0', grav: 600, shape: 'square', vr: 8 }); this.facePlayer(B); }
    } else if (s === 'idle') {
      if (B.roof < 0 || this.phase < 3) this.facePlayer(B);
    } else if (s === 'tell') {
      if (this.moveName === 'pounce') {
        this.shadowX += (this.pounceTarget() - this.shadowX) * Math.min(1, 6 * dt);
        this.shadowA = Math.min(1, this.st / 0.3);
      } else if (this.moveName === 'charge') {
        if (w.tick % 6 === 0) w.particles.dust(B.fx - B.face * 50 * B.sc, B.fy, -B.face, 3);
      } else if (this.moveName === 'roar') {
        if (w.tick % 3 === 0) { const a = Math.random() * Math.PI * 2, r = 90; const mx = B.fx + B.face * 70 * B.sc, my = B.fy - 100 * B.sc; w.particles.spawn({ x: mx + Math.cos(a) * r, y: my + Math.sin(a) * r, vx: -Math.cos(a) * r * 2.5, vy: -Math.sin(a) * r * 2.5, life: 0.35, size: 5, size1: 1, color: '#ffe0b0', add: true }); }
      }
    } else if (s === 'attack') {
      const r = this.tickAttack(dt, B);
      this.sync();
      return r;
    } else if (s === 'rest') {
      if (this.moveName === 'charge' && B.rx != null) { const d = B.rx - B.fx; B.fx += d * Math.min(1, dt * 9); B.fy = A.floorY - Math.min(30, Math.abs(d) * 0.25); if (Math.abs(d) < 1) { B.fx = B.rx; B.fy = A.floorY; B.rx = null; } }
    } else if (s === 'recover') {
      if (B.sub === 1) {
        if (this.stepJump(B, dt)) { B.roof = B.side; B.sub = 0; B.pose = 'idle'; this.facePlayer(B); this.landFx(B, false); }
      } else { B.settle += dt; if (B.settle >= 0.25) { this.sync(); return true; } }
    } else if (s === 'phase') {
      if (this.phase >= 3 && !this.splitDone) this.tickSplit(dt);
      else if (w.tick % 8 === 0) w.particles.burst(B.fx, B.fy - 140 * B.sc, 3, { speed: 140, life: 0.5, size: 7, size1: 0, color: '#ffb080', grav: -120 });
    }
    this.sync();
    return false;
  }
  tickAttack(dt, B) {
    const A = this.arena, w = this.world;
    B.subT += dt;
    switch (this.moveName) {
      case 'pounce': {
        if (B.k > 0.5) B.pose = 'jump';
        if (this.stepJump(B, dt)) {
          this.shadowA = 0;
          this.landFx(B, true);   // 地響き
          return true;
        }
        return false;
      }
      case 'charge': {
        if (B.sub === 0) { if (this.stepJump(B, dt)) { B.sub = 1; B.pose = 'run'; this.landFx(B, false); } return false; }
        B.fx += B.dir * CHARGE_SPEED * this.spd * dt;
        if (w.tick % 4 === 0) w.particles.dust(B.fx - B.dir * 60 * B.sc, B.fy, -B.dir, 2);
        const half = 74 * B.sc;
        if (B.dir > 0 ? B.fx + half >= A.R : B.fx - half <= A.L) {
          B.fx = B.dir > 0 ? A.R - 74 * B.sc : A.L + 74 * B.sc;
          B.rx = B.dir > 0 ? A.R - ROOF_W - 84 * B.sc : A.L + ROOF_W + 84 * B.sc;   // はね返って屋根の外まで転がる（隙の間に頭を踏める・顔が壁にめりこまない）
          w.camera.shake(14, 0.5); w.sfx('break');
          w.particles.debris(B.dir > 0 ? A.R : A.L, B.fy - 50, '#d0502a');
          w.particles.debris(B.dir > 0 ? A.R : A.L, B.fy - 90, '#f4ecdc');
          return true;
        }
        return false;
      }
      case 'roar': {
        this.waveT -= dt;
        if (this.waves > 0 && this.waveT <= 0) {
          this.waves--; this.waveT = WAVE_GAP / this.spd;
          const dir = w.player.cx > B.fx ? 1 : -1;
          const x = clamp(B.fx + dir * 60 * B.sc, A.L + 30, A.R - 30);
          w.spawn(new RoarWave(w, x, A.floorY, dir, this.spd, A));
          w.sfx('shootBig'); w.camera.shake(6, 0.3);
        }
        return this.waves <= 0 && B.subT > 0.5;
      }
      case 'tiles': return B.subT > 0.55;
    }
    return true;
  }
  // 段階3の始め：光って2体に分かれ、それぞれの屋根へ
  tickSplit(dt) {
    const w = this.world, B0 = this.H[0], B1 = this.H[1];
    if (this.st >= 0.35 && !this.splitStarted) {
      this.splitStarted = true;
      w.particles.burst(B0.fx, B0.fy - 90, 30, { speed: 300, life: 0.8, size: 10, size1: 1, color: '#ffe8a0', drag: 2.5, add: true, front: true });
      w.sfx('bossIntro');
      for (const B of this.H) { B.sc = HALF_SCALE; B.pose = 'jump'; this.jumpTo(B, this.standX[B.home], this.roofTop, 0.75, 150); B.side = B.home; }
    }
    if (this.splitStarted) {
      let done = true;
      for (const B of this.H) { if (B.roof < 0) { if (this.stepJump(B, dt)) { B.roof = B.side; B.pose = 'angry'; this.landFx(B, false); } else done = false; } }
      if (done) { this.splitDone = true; this.splitStarted = false; }
    }
  }

  // ---- 当たり ----
  // 今動いている方の当たりの窓口（段階3の吽は ShisaHalf）。テスト・デバッグ用
  activeTarget() { return this.act === 1 && this.proxy.alive ? this.proxy : this; }
  canHitHalf(i) { const sv = this.hitter; this.hitter = i; const r = this.canHit(); this.hitter = sv; return r; }
  isVulnerable() { return this.state === 'rest' && this.hitter === this.act && !this.B.stone; }
  shielded(source, r) { return !this.canHitHalf(0); }
  damage(dmg, source) { return this.hitHalf(0, dmg, source); }
  clangHalf(i) { const w0 = this.weak; this.weak = this.halfWeak[i]; this.clang(); this.weak = w0; }
  hitHalf(i, dmg, source) {
    const B = this.H[i], ph0 = this.phase, hp0 = this.hp;
    if (ph0 >= 3) dmg = Math.min(dmg, MAX_HIT, Math.max(1, B.hp));
    const w0 = this.weak; this.weak = this.halfWeak[i];
    this.hitter = i;
    const ok = super.damage(dmg, source);
    this.hitter = 0; this.weak = w0;
    if (ok && ph0 >= 3) {
      B.hp -= hp0 - this.hp;
      if (B.hp <= 0 && this.hp > 0) this.toStone(i);
    }
    return ok;
  }
  // 先に倒された方は石のシーサーに戻る
  toStone(i) {
    const B = this.H[i], w = this.world;
    B.stone = true; B.pose = 'stone'; B.hp = 0;
    if (i === 1) this.proxy.enemy = false;
    w.particles.burst(B.fx, B.fy - 70 * B.sc, 26, { speed: 240, life: 0.8, size: 9, size1: 1, color: '#d8d6ce', grav: 500, shape: 'square', vr: 8 });
    w.sfx('defeat'); w.camera.shake(8, 0.4);
  }
  onDefeat() { this.proxy.enemy = false; this.shadowA = 0; }
  defeatPoint() { const B = this.B; return { x: B.fx, y: this.arena.floorY - 80 }; }
  updateRects() {
    this.nBodies = 0; hideRect(this.weak);
    for (let i = 0; i < 2; i++) {
      const B = this.H[i], wk = this.halfWeak[i], bd = this.halfBody[i];
      hideRect(wk); hideRect(bd);
      if (!B.vis || B.stone || this.state === 'dormant') continue;
      const s = B.sc, fx = B.fx, fy = B.fy, f = B.face;
      const active = i === this.act;
      const lying = B.pose === 'rest' || B.pose === 'tired';
      if (lying) setRect(wk, fx + f * 22 * s - 60 * s, fy - 112 * s, 120 * s, 92 * s);   // 下は床近くまで（立ったままの技も当たる）
      else if (B.pose === 'run') { setRect(wk, fx - 56 * s, fy - 104 * s, 112 * s, 28 * s); setRect(bd, fx - 74 * s, fy - 74 * s, 148 * s, 70 * s); }
      else { setRect(wk, fx + f * 36 * s - 48 * s, fy - 172 * s, 96 * s, 44 * s); setRect(bd, fx - 72 * s, fy - 124 * s, 144 * s, 118 * s); }
      // 隙・ひるみ・段階変化の間は本体に触れても痛くない（弱点だけ）
      const soft = active && (this.state === 'rest' || this.state === 'hurt' || this.state === 'phase' || this.state === 'intro');
      if (!soft && !lying && this.state !== 'phase' && this.state !== 'dying') setRect(this.bodies[this.nBodies++], bd.x, bd.y, bd.w, bd.h);
    }
    setRect(this.weak, this.halfWeak[0].x, this.halfWeak[0].y, this.halfWeak[0].w, this.halfWeak[0].h);
    this.touchDamage = this.state === 'rest' ? 0 : 1;
  }

  // ---- 描画 ----
  drawBack(ctx) {
    for (const x of this.roofX) drawSprite(ctx, 'boss_shisa_roof', 0, x, this.roofTop + 4);
  }
  drawHalf(ctx, B, i) {
    const A = this.arena, w = this.world;
    const s = B.sc, flip = B.face < 0;
    // 影（屋根の上か床）
    const base = B.roof >= 0 ? this.roofTop : A.floorY;
    const hgt = Math.max(0, base - B.fy);
    if (B.fy < A.floorY + 2) this.shadow(ctx, B.fx, base - 1, clamp(170 * s - hgt * 0.3, 50, 170 * s), clamp(0.38 - hgt / 1000, 0.12, 0.38));
    if (B.stone) { drawSprite(ctx, `boss_shisa_${B.mouth}_stone`, 0, B.fx, B.fy + 4 * s, { flip, sx: s, sy: s }); return; }
    const pose = B.pose;
    const name = pose === 'roar' ? 'boss_shisa_a_roar' : pose === 'stone' ? `boss_shisa_${B.mouth}_stone` : `boss_shisa_${B.mouth}_${pose}`;
    let fr = (this.t * 4) | 0, sh = 0;
    if (pose === 'tell' || pose === 'angry' || pose === 'roar') fr = (this.t * 12) | 0;
    if (pose === 'run') fr = (this.t * 10) | 0;
    if (pose === 'tail') fr = this.state === 'attack' && i === this.act ? 1 : 0;
    const active = i === this.act;
    if (active && this.state === 'tell') sh = Math.sin(this.t * 60) * 2;
    // 出番前は石の像。登場で色がつく
    if (this.state === 'dormant' || (this.state === 'intro' && pose === 'stone')) {
      drawSprite(ctx, `boss_shisa_${B.mouth}_stone`, 0, B.fx + (this.state === 'intro' ? Math.sin(this.t * 70) * 2 : 0), B.fy + 4, { flip, sx: s, sy: s });
      if (this.state === 'intro') { const k = clamp(this.st / 0.7, 0, 1); drawSprite(ctx, `boss_shisa_${B.mouth}_idle`, 0, B.fx, B.fy + 4, { flip, sx: s, sy: s, alpha: k }); }
      return;
    }
    this.sprite(ctx, name, fr, B.fx + sh, B.fy + 4 * s, flip, s, s);
    // 予告：目が光る
    if (pose === 'tell' || pose === 'tail' && this.state === 'tell' || (active && this.state === 'tell')) {
      w.lights.push({ x: B.fx + B.face * 62 * s, y: B.fy - 128 * s, r: 80 * s, color: '#ffd84a', a: 0.9 });
    }
    // 咆哮の輪
    if (pose === 'roar' && active && this.state === 'attack') {
      const mx = B.fx + B.face * 96 * s, my = B.fy - 92 * s;
      ctx.save(); ctx.lineWidth = 4;
      for (let k = 0; k < 3; k++) {
        const u = ((this.st * 2.4 + k / 3) % 1);
        ctx.strokeStyle = `rgba(255,236,200,${0.7 * (1 - u)})`;
        ctx.beginPath(); ctx.arc(mx, my, 20 + u * 110, B.face > 0 ? -0.9 : Math.PI - 0.9, B.face > 0 ? 0.9 : Math.PI + 0.9); ctx.stroke();
      }
      ctx.restore();
    }
  }
  draw(ctx, a) {
    const A = this.arena;
    // 飛び降りの着地点（影が主人公を追い、跳んだら止まる）
    if (this.moveName === 'pounce' && this.shadowA > 0 && (this.state === 'tell' || this.state === 'attack')) {
      const B = this.B, grow = this.state === 'attack' ? 1 + B.k * 0.5 : 1;
      const blink = ((this.t * 14) | 0) % 2;
      this.shadow(ctx, this.shadowX, A.floorY - 2, 120 * B.sc * grow, (blink ? 0.55 : 0.4) * this.shadowA);
      if (this.state === 'tell') this.alertMark(ctx, this.shadowX, A.floorY - 60 - Math.sin(this.t * 20) * 3);
    }
    // 番をしている方を先に（後ろ）、動いている方を手前に
    const other = 1 - this.act;
    if (this.H[other].vis) this.drawHalf(ctx, this.H[other], other);
    if (this.H[this.act].vis) this.drawHalf(ctx, this.H[this.act], this.act);
    // 弱点が光る（隙の間）
    const sv = this.hitter, w0 = this.weak;
    this.hitter = this.act; this.weak = this.halfWeak[this.act];
    this.weakGlow(ctx);
    this.hitter = sv; this.weak = w0;
  }
}
registerBoss('shisa', Shisa);
