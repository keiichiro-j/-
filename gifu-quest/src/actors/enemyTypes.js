// 担当：敵・仕掛け。registerEntity で登録する（設計書 6章「敵の種類」、ARCHITECTURE「敵の配置名」）
// 8種類の動き：walker / spiky / hopper / flyer / thrower / popper / charger / shielder
// kind（見た目）ごとの数値は下の KINDS にまとめる。絵は src/art/enemies.js（enemy_<kind>_<anim>）
import { Entity, registerEntity } from './entity.js';
import { Bullet } from './projectiles.js';
import { TILE } from '../core/config.js';
import { moveBody } from '../world/collision.js';
import { isSolid, isSlope, isOneWay } from '../world/tiles.js';
import { drawSprite, spriteInfo } from '../gfx/atlas.js';

const GRAV = 1800;
const MAX_FALL = 860;

// ---- 調整用の数値（kind ごと）----
// w,h: 体の当たり箱（絵より一回り小さい）。hp: 体力。speed: 歩く速さ（ドット/秒）
export const KINDS = {
  // 歩く
  uribo: { motion: 'walker', w: 32, h: 24, speed: 55 },
  sawagani: { motion: 'walker', w: 32, h: 20, speed: 45 },
  yukidama: { motion: 'walker', w: 28, h: 28, speed: 42 },
  // トゲ（踏めない。技でのみ倒せる）
  iga: { motion: 'spiky', w: 28, h: 26, speed: 34 },
  koritoge: { motion: 'spiky', w: 28, h: 26, speed: 30 },
  // 跳ねる（主人公に向かって跳ぶ）。jump: 跳ぶ初速, hop: 横の速さ, wait: 着地後の待ち（秒）, sight: 見つける距離（タイル）
  kajika: { motion: 'hopper', w: 28, h: 22, jump: 560, hop: 150, wait: 1.1, sight: 7 },
  uchiwa: { motion: 'hopper', w: 26, h: 34, jump: 520, hop: 120, wait: 1.0, sight: 7, flutter: 0.5 },
  yukiusagi: { motion: 'hopper', w: 24, h: 26, jump: 470, hop: 185, wait: 0.55, sight: 8 },
  yogangaeru: { motion: 'hopper', w: 30, h: 24, jump: 660, hop: 160, wait: 1.3, sight: 7, light: '#ff8a3a' },
  // 飛ぶ（波のように上下しながら巡回）。amp: 上下の幅（タイル）, freq: 上下の速さ
  karasu: { motion: 'flyer', w: 30, h: 22, speed: 70, amp: 0.6, freq: 2.6, range: 5 },
  tonbo: { motion: 'flyer', w: 32, h: 16, speed: 95, amp: 0.45, freq: 4.0, range: 6 },
  chochin: { motion: 'flyer', w: 24, h: 32, speed: 40, amp: 0.5, freq: 1.8, range: 3, light: '#ffb560' },
  tako: { motion: 'flyer', w: 32, h: 36, speed: 55, amp: 0.9, freq: 1.5, range: 5 },
  yukigumo: { motion: 'flyer', w: 42, h: 22, speed: 48, amp: 0.25, freq: 1.4, range: 5, icicle: true },
  komori: { motion: 'flyer', w: 30, h: 18, speed: 90, amp: 1.0, freq: 3.2, range: 6 },
  // 投げる（放物線。投げる前に腕を振り上げる予告 windup 秒）。ammo: 弾, cd: 間隔, sight: 投げ始める距離（タイル）
  saru: { motion: 'thrower', w: 26, h: 34, ammo: 'iga', cd: 2.0, windup: 0.5, sight: 9 },
  geta: { motion: 'thrower', w: 24, h: 36, ammo: 'geta', cd: 2.2, windup: 0.5, sight: 9 },
  hanabi: { motion: 'thrower', w: 26, h: 36, ammo: 'hanabi', cd: 2.6, windup: 0.6, sight: 9, light: '#ffcf7a' },
  iwanage: { motion: 'thrower', w: 32, h: 38, ammo: 'iwa', cd: 2.6, windup: 0.65, sight: 9 },
  // 飛び出す（踏めない。水や溶岩から周期的に。出る前に泡・火の粉の予告）。height: 跳ぶ高さ（タイル）
  ayu: { motion: 'popper', w: 16, h: 26, height: 3.5, period: 2.6, liquid: 'water' },
  hinotama: { motion: 'popper', w: 22, h: 24, height: 4, period: 2.8, liquid: 'lava', light: '#ff9a3a' },
  hibashira: { motion: 'popper', w: 26, h: 36, height: 4, period: 3.2, liquid: 'lava', pillar: true, light: '#ff7a2a' },
  // 突進（見つけると一瞬溜めてから突進）。walk: 普段の速さ, run: 突進の速さ, windup: 溜め
  inoshishi: { motion: 'charger', w: 42, h: 30, hp: 2, walk: 40, run: 340, windup: 0.55, sight: 7 },
  shishi: { motion: 'charger', w: 44, h: 34, hp: 2, walk: 35, run: 320, windup: 0.6, sight: 7 },
  kamoshika: { motion: 'charger', w: 38, h: 34, hp: 2, walk: 45, run: 370, windup: 0.5, sight: 8 },
  // 盾（正面からの弾を防ぐ。上からのみ踏める）
  kappa: { motion: 'shielder', w: 26, h: 36, hp: 2, speed: 38 },
  karakuri: { motion: 'shielder', w: 26, h: 38, hp: 2, speed: 32 },
};
const DEFAULT_KIND = { walker: 'uribo', spiky: 'iga', hopper: 'kajika', flyer: 'karasu', thrower: 'saru', popper: 'ayu', charger: 'inoshishi', shielder: 'kappa' };

// 弾（投げる物）。sprite は enemy_shot_<名前>
export const AMMO = {
  iga: { w: 16, h: 16, grav: 1300, spin: 9 },
  geta: { w: 20, h: 12, grav: 1300, spin: 13 },
  hanabi: { w: 18, h: 18, grav: 1250, spin: 3, bounce: 0.45, life: 2.4 },
  yukidama: { w: 16, h: 16, grav: 1300, spin: 6 },
  iwa: { w: 22, h: 20, grav: 1500, spin: 5, bounce: 0.3 },
  ougi: { w: 24, h: 16, grav: 600, spin: 14 },
  tsurara: { w: 10, h: 22, grav: 1500, spin: 0 },
};

// 画面内にいるか（m: 余白。負なら画面の内側へ m ドット入っていること）
export function onScreen(world, e, m = 0) {
  const c = world.camera;
  return e.x + e.w > c.x - m && e.x < c.x + c.vw + m && e.y + e.h > c.y - m && e.y < c.y + c.vh + m;
}
// (px,py) が立てる地面か（固い・坂・通り抜け足場・動く床）
function groundAt(world, px, py) {
  const t = world.level.at(px, py);
  if (isSolid(t) || isSlope(t) || isOneWay(t)) return true;
  for (const p of world.platforms) if (p.alive && px > p.x && px < p.x + p.w && py >= p.y - 2 && py <= p.y + 14) return true;
  return false;
}
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));

// ---- 倒された敵の演出（ひっくり返って落ちる／つぶれて消える）----
class Corpse extends Entity {
  constructor(world, e, mode, source) {
    super(world, { type: 'corpse' });
    this.x = e.x; this.y = e.y; this.w = e.w; this.h = e.h; this.px = this.x; this.py = this.y;
    this.sprite = e.spr.hurt; this.face = e.face; this.foot = e.foot || 0;
    this.mode = mode; this.persistent = true; this.z = 8;
    this.rot = 0; this.sx = 1; this.sy = 1;
    const info = spriteInfo(this.sprite);
    this.half = info ? info.oy / 2 : this.h / 2;
    if (mode === 'flip') {
      const sx = source && source.cx !== undefined ? source.cx : e.cx - e.face;
      this.dir = Math.sign(e.cx - sx) || 1;
      this.vx = this.dir * 110; this.vy = -430;
    }
  }
  update(dt) {
    this.t += dt;
    const w = this.world;
    if (this.mode === 'squash') {
      const k = Math.min(1, this.t / 0.09);
      this.sy = 1 - 0.62 * k; this.sx = 1 + 0.45 * k;
      if (this.t > 0.38) {
        w.particles.burst(this.cx, this.y + this.h - 6, 8, { speed: 120, life: 0.45, size: 7, size1: 0, color: 'rgba(255,255,255,0.85)', drag: 3, grav: -30 });
        this.remove();
      }
    } else {
      this.vy = Math.min(this.vy + GRAV * dt, MAX_FALL);
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.rot = Math.min(Math.PI, this.t * 9) * this.dir;
      if (this.t > 2.5 || this.y > w.level.pxH + 80 || this.y > w.camera.y + w.camera.vh + 120) this.remove();
    }
  }
  draw(ctx, a) {
    const x = this.ix(a) + this.w / 2, y = this.iy(a) + this.h + this.foot;
    if (this.mode === 'squash') {
      drawSprite(ctx, this.sprite, 0, x, y, { flip: this.face < 0, sx: this.sx, sy: this.sy, alpha: this.t > 0.28 ? 1 - (this.t - 0.28) * 8 : 1 });
    } else {
      // 体の中心まわりに回す
      const d = this.half, cy = y - d, r = this.rot;
      drawSprite(ctx, this.sprite, 0, x + d * Math.sin(r), cy + d * Math.cos(r), { flip: this.face < 0, rot: r });
    }
  }
}

// ---- 敵の基底 ----
const ANIMS = ['walk', 'idle', 'hurt', 'crouch', 'jump', 'fall', 'fly', 'warn', 'windup', 'throw', 'run', 'dizzy', 'block'];
export class Enemy extends Entity {
  constructor(world, spec, motion) {
    super(world, spec);
    let kind = spec.kind;
    if (!KINDS[kind] || KINDS[kind].motion !== motion) kind = DEFAULT_KIND[motion];
    this.kind = kind;
    this.K = KINDS[kind];
    this.placeAt(spec, this.K.w, this.K.h);
    this.enemy = true; this.stompable = true;
    this.hp = this.maxHp = spec.hp ?? this.K.hp ?? 1;
    this.face = spec.face ?? -1;
    this.anim = 'walk'; this.animT = 0; this.fps = 8;
    this.sx = 1; this.sy = 1; this.foot = 0; this.stun = 0;
    this.onGround = false;
    this._hr = { x: 0, y: 0, w: 0, h: 0 };
    this.spr = {};
    for (const n of ANIMS) this.spr[n] = `enemy_${kind}_${n}`;
    this.range = (spec.range ?? this.K.range ?? 0) * TILE;
    this.z = 3;
  }
  // 敵から受ける当たり箱：左右4ドット、上2ドット狭める
  hurtRect() { const r = this._hr; r.x = this.x + 4; r.y = this.y + 2; r.w = this.w - 8; r.h = this.h - 2; return r; }
  setAnim(a, fps) { if (this.anim !== a) { this.anim = a; this.animT = 0; } if (fps) this.fps = fps; }
  frame() { return (this.animT * this.fps) | 0; }
  // 地面を歩く体の移動（重力＋地形）
  walkBody(dt) {
    const w = this.world;
    if (this.platform && this.platform.alive) { this.x += this.platform.dx || 0; this.y += this.platform.dy || 0; }
    const was = this.onGround;
    this.vy = Math.min(this.vy + GRAV * dt, MAX_FALL);
    moveBody(w.level, this, dt, { platforms: w.platforms });
    if (this.onGround && !was && this.t > 0.1) { this.sx = 1.2; this.sy = 0.82; }
    if (this.y > w.level.pxH + 60) this.alive = false;   // 穴に落ちた（倒した数には数えない）
  }
  cliffAhead() { return !groundAt(this.world, this.face > 0 ? this.x + this.w + 3 : this.x - 3, this.y + this.h + 4); }
  wallAhead() { return (this.face > 0 && this.wallR) || (this.face < 0 && this.wallL); }
  outOfRange() { return this.range > 0 && (this.x - this.home.x) * this.face > this.range; }
  turn() { this.face = -this.face; }
  preUpdate() { super.preUpdate(); this.animT += 1 / 120; const k = 1 - Math.exp(-14 / 120); this.sx += (1 - this.sx) * k; this.sy += (1 - this.sy) * k; }

  onStomp(player, dmg) {
    this.byStomp = true;
    const hit = this.damage(dmg, player);
    this.byStomp = false;
    if (hit && this.alive) { this.sy = 0.55; this.sx = 1.35; this.stun = 0.45; }
  }
  damage(dmg, source) {
    const r = super.damage(dmg, source);
    if (r && this.alive) this.invuln = 0.35;
    return r;
  }
  die(source) {
    this.alive = false;
    const w = this.world;
    w.particles.burst(this.cx, this.cy, 8, { speed: 200, life: 0.45, size: 6, size1: 0, color: '#fff', drag: 3, front: true });
    w.particles.burst(this.cx, this.cy, 5, { speed: 160, life: 0.6, size: 5, size1: 0, color: '#ffe56b', shape: 'star', drag: 3, vr: 10, front: true });
    w.events.emit('enemyDefeated', { type: this.type, kind: this.kind, x: this.cx, y: this.cy });
    w.spawn(new Corpse(w, this, this.byStomp && this.K.motion !== 'flyer' ? 'squash' : 'flip', source));
  }
  // 描画：足元の影＋スプライト（右向きで描いてあるので左向きは反転）
  draw(ctx, a) { this.drawBody(ctx, a, this.anim); }
  drawBody(ctx, a, anim, opts) {
    const x = this.ix(a) + this.w / 2, y = this.iy(a) + this.h + this.foot;
    if (this.onGround) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.ellipse(x, this.iy(a) + this.h, this.w * 0.55 * this.sx, 4, 0, 0, 6.2832); ctx.fill();
    }
    const o = this._dopt || (this._dopt = { flip: false, sx: 1, sy: 1, rot: 0, alpha: 1 });
    o.flip = this.face < 0; o.sx = this.sx; o.sy = this.sy; o.rot = (opts && opts.rot) || 0; o.alpha = 1;
    const jx = (opts && opts.shake) ? (((this.world.tick >> 1) & 1) ? 1.5 : -1.5) : 0;
    drawSprite(ctx, this.spr[anim], this.frame(), x + jx, y, o);
    if (this.flash > 0) {
      ctx.globalCompositeOperation = 'lighter'; o.alpha = 0.6;
      drawSprite(ctx, this.spr[anim], this.frame(), x + jx, y, o);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.K.light) this.world.lights.push({ x, y: y - this.h * 0.6, r: 80, color: this.K.light, a: 0.8, flicker: 0.1 });
  }
}

// ---- 歩く：壁で折り返す。崖から落ちる ----
class Walker extends Enemy {
  constructor(w, s) { super(w, s, 'walker'); this.speed = s.speed ? s.speed * TILE : this.K.speed; }
  update(dt) {
    this.t += dt;
    if (this.stun > 0) { this.stun -= dt; this.vx = 0; } else if (this.onGround) this.vx = this.face * this.speed;
    this.walkBody(dt);
    if (this.wallAhead() || this.outOfRange()) this.turn();
    this.setAnim(this.onGround ? 'walk' : 'fall', 9);
  }
  draw(ctx, a) { this.drawBody(ctx, a, 'walk'); }
}
registerEntity('walker', Walker);

// ---- トゲ：崖で折り返す。踏めない。技でのみ倒せる ----
class SpikyEnemy extends Enemy {
  constructor(w, s) { super(w, s, 'spiky'); this.stompable = false; this.speed = s.speed ? s.speed * TILE : this.K.speed; }
  update(dt) {
    this.t += dt;
    if (this.onGround) this.vx = this.face * this.speed;
    this.walkBody(dt);
    if (this.wallAhead() || this.outOfRange() || (this.onGround && this.cliffAhead())) this.turn();
    this.setAnim('walk', 7);
  }
}
registerEntity('spiky', SpikyEnemy);

// ---- 跳ねる：主人公に向かって跳ぶ（着地→待ち→しゃがむ予告→跳ぶ）----
class Hopper extends Enemy {
  constructor(w, s) { super(w, s, 'hopper'); this.anim = 'idle'; this.state = 'idle'; this.timer = 0.6 + ((s.x * 7) % 5) * 0.12; this.dir = this.face; }
  update(dt) {
    this.t += dt;
    const w = this.world, p = w.player, K = this.K;
    if (this.stun > 0) this.stun -= dt;
    if (this.state === 'idle') {
      this.vx = approach(this.vx, 0, 1200 * dt);
      if (this.onGround && this.stun <= 0) this.timer -= dt;
      if (this.timer <= 0) {
        const dx = p.cx - this.cx;
        if (Math.abs(dx) < K.sight * TILE && Math.abs(p.cy - this.cy) < 5 * TILE && onScreen(w, this, -10)) this.dir = Math.sign(dx) || this.face;
        else if (this.range > 0 && Math.abs(this.x - this.home.x) > this.range) this.dir = Math.sign(this.home.x - this.x);
        else this.dir = (this.hops = (this.hops || 0) + 1) % 3 === 0 ? -this.face : this.face;
        this.face = this.dir;
        this.state = 'crouch'; this.timer = 0.24; this.sy = 0.8; this.sx = 1.15;
      }
      this.setAnim('idle', 3);
    } else if (this.state === 'crouch') {
      this.timer -= dt; this.vx = 0;
      if (this.timer <= 0) {
        this.vy = -(this.spec.jump ?? K.jump); this.vx = this.dir * K.hop; this.state = 'air'; this.sy = 1.25; this.sx = 0.85;
        this.onGround = false;
      }
      this.setAnim('crouch');
    } else {
      if (K.flutter && this.vy > 0) this.vy -= GRAV * K.flutter * dt;   // うちわ：ふわっと落ちる
      if (this.wallL || this.wallR) this.vx = 0;
      this.setAnim(this.vy < 0 ? 'jump' : 'fall', 8);
    }
    this.walkBody(dt);
    if (this.state === 'air' && this.onGround && this.vy >= 0 && this.t > 0.05) {
      this.state = 'idle'; this.timer = K.wait * (0.85 + ((this.t * 13) % 1) * 0.3);
      w.particles.dust(this.cx, this.y + this.h, 0, 3);
    }
  }
}
registerEntity('hopper', Hopper);

// ---- 飛ぶ：波のように上下しながら巡回（dir: "h" 横 / "v" 縦）。雪雲はつららを落とす ----
class Flyer extends Enemy {
  constructor(w, s) {
    super(w, s, 'flyer');
    const K = this.K;
    this.vertical = s.dir === 'v';
    this.amp = (s.amp ?? K.amp) * TILE;
    this.speed = s.speed ? s.speed * TILE : K.speed;
    if (!this.range) this.range = 4 * TILE;
    this.u = 0; this.ph = (s.x * 1.7) % 6.28;
    this.drop = 0; this.cd = 1;
    this.setAnim('fly', K.motion === 'flyer' && this.kind === 'tonbo' ? 18 : 9);
  }
  update(dt) {
    this.t += dt;
    const w = this.world, h = this.home;
    if (this.stun > 0) { this.stun -= dt; return; }
    let sp = this.speed;
    if (this.K.icicle) sp = this.icicleLogic(dt) ? 0 : sp;
    // 巡回（端でゆっくり折り返す）
    const r = this.range / 2;
    this.u += this.face * sp * dt;
    if (this.u > r) { this.u = r; this.face = -1; }
    if (this.u < -r) { this.u = -r; this.face = 1; }
    const wave = Math.sin(this.t * this.K.freq + this.ph) * this.amp;
    if (this.vertical) { this.x = h.x + wave * 0.5; this.y = h.y + this.u; }
    else { this.x = h.x + this.u; this.y = h.y + wave; }
    if (this.vertical) this.face = w.player.cx > this.cx ? 1 : -1;
  }
  // 雪雲：主人公が真下に来たら震えて（予告0.6秒）つららを落とす
  icicleLogic(dt) {
    const w = this.world, p = w.player;
    if (this.cd > 0) this.cd -= dt;
    if (this.drop > 0) {
      this.drop -= dt;
      if (this.drop <= 0) {
        const A = AMMO.tsurara;
        w.spawn(new Bullet(w, this.cx, this.y + this.h + 8, { sprite: 'enemy_shot_tsurara', w: A.w, h: A.h, vy: 40, grav: A.grav, life: 3 }));
        w.particles.burst(this.cx, this.y + this.h, 5, { speed: 60, life: 0.5, size: 3, size1: 0, color: '#eef8ff', grav: 200 });
        this.cd = 2.4;
      }
      return true;
    }
    if (this.cd <= 0 && Math.abs(p.cx - this.cx) < 40 && p.y > this.y + this.h && p.y - this.y < 9 * TILE && onScreen(w, this, -20)) { this.drop = 0.6; return true; }
    return false;
  }
  draw(ctx, a) {
    this.drawBody(ctx, a, this.drop > 0 ? 'warn' : 'fly', this.drop > 0 ? SHAKE : null);
  }
}
const SHAKE = { shake: true };
registerEntity('flyer', Flyer);

// ---- 投げる：腕を振り上げる予告（0.5秒前後）→ 放物線で投げる ----
class Thrower extends Enemy {
  constructor(w, s) {
    super(w, s, 'thrower');
    this.anim = 'idle';   // 投げるに walk の絵はない（最初の更新の前に描かれると未登録の絵になっていた）
    this.state = 'idle'; this.cd = 1.0 + ((s.x * 3) % 7) * 0.1;
    this.ammo = AMMO[s.ammo] ? s.ammo : this.K.ammo;
    this.timer = 0;
  }
  update(dt) {
    this.t += dt;
    const w = this.world, p = w.player, K = this.K;
    this.vx = approach(this.vx, 0, 900 * dt);
    if (this.stun > 0) { this.stun -= dt; this.state = 'idle'; this.cd = Math.max(this.cd, 0.6); }
    const dx = p.cx - this.cx, dy = p.cy - this.cy;
    const near = Math.abs(dx) < K.sight * TILE && Math.abs(dy) < 6 * TILE;
    if (this.state === 'idle') {
      this.cd -= dt;
      if (near && Math.abs(dx) > 8) this.face = dx > 0 ? 1 : -1;
      if (this.cd <= 0 && near && onScreen(w, this, -24) && this.stun <= 0) { this.state = 'windup'; this.timer = this.spec.windup ?? K.windup; }
      this.setAnim('idle', 5);
    } else if (this.state === 'windup') {
      this.timer -= dt;
      if (this.timer <= 0) { this.throwAt(p); this.state = 'throw'; this.timer = 0.32; }
      this.setAnim('windup', 6);
    } else {
      this.timer -= dt;
      if (this.timer <= 0) { this.state = 'idle'; this.cd = (this.spec.cd ?? K.cd) * (0.85 + ((this.t * 7) % 1) * 0.3); }
      this.setAnim('throw', 8);
    }
    this.walkBody(dt);
  }
  throwAt(p) {
    const w = this.world, A = AMMO[this.ammo];
    const hx = this.cx + this.face * 6, hy = this.y - 4;
    let dx = p.cx - hx; const dy = p.cy - hy;
    if (dx * this.face < 24) dx = this.face * 24;
    const T = Math.min(1.15, Math.max(0.55, Math.abs(dx) / 330));
    const vx = Math.max(-380, Math.min(380, dx / T));
    const vy = Math.max(-820, Math.min(-200, (dy - 0.5 * A.grav * T * T) / T));
    const Cls = this.ammo === 'hanabi' ? HanabiShell : Bullet;
    w.spawn(new Cls(w, hx, hy, { sprite: 'enemy_shot_' + this.ammo, w: A.w, h: A.h, vx, vy, grav: A.grav, spin: A.spin * this.face, bounce: A.bounce, life: A.life ?? 3 }));
    this.sx = 1.15; this.sy = 0.9;
    w.sfx('shoot', { vol: 0.4 });
  }
}
registerEntity('thrower', Thrower);

// 花火玉：消える時に色とりどりの火花（見た目のみ）
class HanabiShell extends Bullet {
  update(dt) {
    super.update(dt);
    if (this.alive && this.world.tick % 3 === 0) this.world.particles.spawn({ x: this.cx, y: this.y, vx: -this.vx * 0.1, vy: -40, life: 0.3, size: 3, size1: 0, color: '#ffd76a', add: true });
  }
  remove() {
    if (!this.alive) return;
    const w = this.world;
    const cols = HANABI_COLORS;
    for (let i = 0; i < 3; i++) w.particles.burst(this.cx, this.cy, 6, { speed: 220, life: 0.5, size: 4, size1: 0, color: cols[i], shape: 'star', add: true, front: true, drag: 3 });
    super.remove();
  }
  draw(ctx, a) { super.draw(ctx, a); this.world.lights.push({ x: this.cx, y: this.cy, r: 50, color: '#ffc46a', a: 0.7 }); }
}
const HANABI_COLORS = ['#ff6a8a', '#ffe36a', '#7ad8ff'];

// ---- 飛び出す：水・溶岩から周期的に（出る前に泡・火の粉の予告）。踏めない ----
// 置き方：x,y に水面（~）や溶岩の表面（L）のタイル。world.liquids の水面が上下する場所ではそれに合わせる
class Popper extends Enemy {
  constructor(w, s) {
    super(w, s, 'popper');
    this.stompable = false;
    this.baseSurf = s.y * TILE + 6;
    this.surf = this.baseSurf;
    this.period = s.period ?? this.K.period;
    this.state = 'hidden'; this.timer = this.period * (0.4 + ((s.x * 0.37) % 1) * 0.6);
    this.jumpV = Math.sqrt(2 * GRAV * (s.height ?? this.K.height) * TILE);
    this.enemy = false;
    this.persistent = false;
    this.ripple = 0;
    this.hideBody();
  }
  hideBody() { this.y = this.surf + 8; this.vy = 0; this.px = this.cx - this.w / 2; this.py = this.y; }
  findSurface() {
    const L = this.world.liquids;
    for (let i = 0; i < L.length; i++) { const q = L[i]; if (this.cx >= q.x0 && this.cx <= q.x1) return q.y + 4; }
    return this.baseSurf;
  }
  update(dt) {
    this.t += dt;
    const w = this.world;
    this.surf = this.findSurface();
    if (this.ripple > 0) this.ripple -= dt;
    if (this.state === 'hidden') {
      this.hideBody();
      this.timer -= dt;
      if (this.timer <= 0 && onScreen(w, this, -30)) { this.state = 'warn'; this.timer = 0.75; }
    } else if (this.state === 'warn') {
      this.hideBody();
      this.timer -= dt;
      this.warnFx();
      if (this.timer <= 0) {
        this.state = 'up'; this.vy = -this.jumpV; this.y = this.surf - this.h * 0.4;
        this.enemy = true; this.splash();
      }
    } else {
      this.vy = Math.min(this.vy + GRAV * dt, MAX_FALL);
      this.y += this.vy * dt;
      if (this.vy > 0 && this.y > this.surf) { this.splash(); this.state = 'hidden'; this.enemy = false; this.timer = this.period; this.hideBody(); }
    }
    this.setAnim('jump', 10);
  }
  warnFx() {
    const w = this.world;
    if (w.tick % 7 !== 0) return;
    const lava = this.K.liquid === 'lava';
    w.particles.spawn({ x: this.cx + (((w.tick * 37) % 21) - 10), y: this.surf + 2, vx: 0, vy: lava ? -90 : -50, life: lava ? 0.5 : 0.4, size: lava ? 3 : 4, size1: lava ? 0 : 6, color: lava ? '#ffb347' : 'rgba(225,245,255,0.9)', shape: lava ? 'circle' : 'ring', add: lava, front: true });
  }
  splash() {
    const w = this.world;
    if (this.K.liquid === 'lava') w.particles.burst(this.cx, this.surf, 10, { angle: -Math.PI / 2, spread: 1.3, speed: 240, life: 0.5, size: 4, size1: 0, color: '#ff8a2a', grav: 900, add: true });
    else w.particles.splash(this.cx, this.surf);
    this.ripple = 0.5;
  }
  draw(ctx, a) {
    const w = this.world;
    // 予告：水面の輪・溶岩の赤い光
    if (this.state === 'warn' || this.ripple > 0) {
      const k = this.state === 'warn' ? (1 - this.timer / 0.75) : this.ripple * 2;
      const lava = this.K.liquid === 'lava';
      ctx.strokeStyle = lava ? '#ffbe5a' : '#ebfaff';
      ctx.globalAlpha = Math.min(1, 0.4 + 0.5 * k);
      ctx.lineWidth = 2;
      const r = 6 + 10 * ((w.time * 2.5) % 1);
      ctx.beginPath(); ctx.ellipse(this.cx, this.surf, r + 4, r * 0.3 + 1, 0, 0, 6.2832); ctx.stroke();
      ctx.globalAlpha = 1;
      if (lava && this.state === 'warn') w.lights.push({ x: this.cx, y: this.surf, r: 50 + 40 * k, color: '#ff7a2a', a: 0.8 });
    }
    if (this.state !== 'up') return;
    const rot = Math.max(-1, Math.min(1, this.vy / 500)) * 1.35;
    this.drawBody(ctx, a, 'jump', this.kind === 'ayu' ? { rot: this.face > 0 ? rot : -rot } : null);
  }
}

// 火柱：溶岩から立ち上がる炎の柱（踏めない・倒せない）。予告：表面が赤く光り火の粉が噴く
class FirePillar extends Entity {
  constructor(w, s) {
    super(w, s);
    this.K = KINDS.hibashira; this.kind = 'hibashira';
    this.placeAt(s, this.K.w, 2);
    this.baseSurf = s.y * TILE + 6; this.surf = this.baseSurf;
    this.maxH = (s.height ?? this.K.height) * TILE;
    this.period = s.period ?? this.K.period;
    this.cur = 0; this.state = 'idle'; this.timer = this.period * (0.3 + ((s.x * 0.29) % 1) * 0.7);
    this.hazard = false; this.cancelable = false; this.touchDamage = 1; this.z = 4;
    this.drawPad = this.maxH;
  }
  cancel() {}
  remove() {}
  findSurface() { return Popper.prototype.findSurface.call(this); }
  update(dt) {
    this.t += dt;
    const w = this.world;
    this.surf = this.findSurface();
    this.timer -= dt;
    if (this.state === 'idle') { if (this.timer <= 0 && onScreen(w, this, 40)) { this.state = 'warn'; this.timer = 0.9; } }
    else if (this.state === 'warn') {
      if (w.tick % 4 === 0) w.particles.spawn({ x: this.cx + (((w.tick * 29) % 25) - 12), y: this.surf, vx: 0, vy: -140 - (w.tick % 5) * 20, life: 0.5, size: 3, size1: 0, color: '#ffcf6a', add: true, front: true });
      if (this.timer <= 0) { this.state = 'rise'; this.timer = 0.18; w.sfx('explosion', { vol: 0.3 }); w.camera.shake(2, 0.15); }
    } else if (this.state === 'rise') { this.cur = this.maxH * (1 - Math.max(0, this.timer) / 0.18); if (this.timer <= 0) { this.state = 'hold'; this.timer = 1.0; } }
    else if (this.state === 'hold') { this.cur = this.maxH * (0.95 + 0.05 * Math.sin(this.t * 30)); if (this.timer <= 0) { this.state = 'fall'; this.timer = 0.3; } }
    else if (this.state === 'fall') { this.cur = this.maxH * Math.max(0, this.timer) / 0.3; if (this.timer <= 0) { this.state = 'idle'; this.cur = 0; this.timer = this.period; } }
    this.hazard = this.cur > 12;
    this.h = Math.max(2, this.cur - 8); this.y = this.surf - this.cur + 8;
    if (this.cur > 0 && w.tick % 5 === 0) w.particles.spawn({ x: this.cx + (((w.tick * 17) % 21) - 10), y: this.y + 10, vx: 0, vy: -120, life: 0.45, size: 4, size1: 0, color: '#ffd27a', add: true, front: true });
  }
  draw(ctx, a) {
    const w = this.world, cx = this.cx;
    if (this.state === 'warn') {
      const k = 1 - this.timer / 0.9;
      ctx.fillStyle = '#ffc050'; ctx.globalAlpha = 0.35 + 0.45 * k * (0.6 + 0.4 * Math.sin(w.time * 30));
      ctx.beginPath(); ctx.ellipse(cx, this.surf, 16 + 6 * k, 5, 0, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
      w.lights.push({ x: cx, y: this.surf, r: 50 + 50 * k, color: '#ff7a2a', a: 0.9 });
    }
    if (this.cur <= 0) return;
    const f = (w.time * 14) | 0;
    const top = this.surf - this.cur;
    for (let yy = top + 30, i = 0; yy < this.surf + 8; yy += 30, i++) drawSprite(ctx, 'enemy_hibashira_body', f + i, cx, yy + 34);
    drawSprite(ctx, 'enemy_hibashira_top', f, cx, top + 40);
    w.lights.push({ x: cx, y: top + this.cur / 2, r: 90 + this.cur * 0.3, color: '#ff8a3a', a: 1, flicker: 0.15 });
  }
}

// popper は kind で 飛び出す魚・火の玉 と 火柱 に分かれる
function PopperFactory(w, s) { return s.kind === 'hibashira' ? new FirePillar(w, s) : new Popper(w, s); }
registerEntity('popper', PopperFactory);

// ---- 突進：見つけると一瞬溜めて（足で地面をかく）突進。壁にぶつかると目を回す ----
class Charger extends Enemy {
  constructor(w, s) { super(w, s, 'charger'); this.state = 'patrol'; this.timer = 0; this.cd = 0; }
  update(dt) {
    this.t += dt;
    const w = this.world, p = w.player, K = this.K;
    if (this.cd > 0) this.cd -= dt;
    if (this.stun > 0) { this.stun -= dt; this.vx = 0; if (this.state === 'run') { this.state = 'dizzy'; this.timer = 0.6; } }
    switch (this.state) {
      case 'patrol': {
        if (this.onGround) this.vx = this.face * (this.spec.speed ? this.spec.speed * TILE : K.walk);
        const dx = p.cx - this.cx;
        if (this.cd <= 0 && this.onGround && Math.abs(dx) < K.sight * TILE && Math.abs(p.y + p.h - this.y - this.h) < 1.6 * TILE && onScreen(w, this, -10)) {
          this.face = dx > 0 ? 1 : -1; this.state = 'windup'; this.timer = this.spec.windup ?? K.windup; this.vx = 0;
          w.sfx('dash', { vol: 0.3 });
        }
        this.setAnim('walk', 7);
        break;
      }
      case 'windup':
        this.vx = 0; this.timer -= dt;
        if (w.tick % 8 === 0) w.particles.dust(this.face > 0 ? this.x + 4 : this.x + this.w - 4, this.y + this.h, -this.face, 2);
        if (this.timer <= 0) { this.state = 'run'; this.timer = 1.8; this.sx = 1.2; this.sy = 0.85; }
        this.setAnim('windup', 10);
        break;
      case 'run':
        this.vx = this.face * K.run; this.timer -= dt;
        if (w.tick % 5 === 0) w.particles.dust(this.cx - this.face * 14, this.y + this.h, this.face, 1);
        this.setAnim('run', 14);
        break;
      case 'skid':
        this.vx = approach(this.vx, 0, 1300 * dt); this.timer -= dt;
        if (w.tick % 3 === 0) w.particles.dust(this.cx + this.face * 10, this.y + this.h, this.face, 1);
        if (this.timer <= 0) { this.state = 'patrol'; this.cd = 1.0; }
        this.setAnim('windup', 4);
        break;
      case 'dizzy':
        this.vx = approach(this.vx, 0, 1300 * dt); this.timer -= dt;
        if (this.timer <= 0) { this.state = 'patrol'; this.cd = 1.2; }
        this.setAnim('dizzy', 6);
        break;
    }
    this.walkBody(dt);
    if (this.state === 'patrol') { if (this.wallAhead() || this.outOfRange() || (this.onGround && this.cliffAhead())) this.turn(); }
    else if (this.state === 'run') {
      if (this.wallAhead()) {
        this.state = 'dizzy'; this.timer = 1.1; this.vx = -this.face * 120; this.vy = -200;
        w.camera.shake(4, 0.15); w.sfx('bump');
        w.particles.burst(this.face > 0 ? this.x + this.w : this.x, this.cy, 6, { speed: 160, life: 0.5, size: 5, size1: 0, color: '#ffe56b', shape: 'star', drag: 3 });
      } else if (this.onGround && this.cliffAhead()) { this.state = 'skid'; this.timer = 0.3; this.vx = 0; }
      else if (this.timer <= 0) { this.state = 'skid'; this.timer = 0.35; }
    }
  }
  draw(ctx, a) {
    this.drawBody(ctx, a, this.anim, this.state === 'windup' ? SHAKE : null);
    if (this.state === 'windup') {
      // 「！」の予告
      const x = this.ix(a) + this.w / 2, y = this.iy(a) - 14 - Math.min(1, (this.animT) * 8) * 4;
      drawSprite(ctx, 'enemy_mark_alert', 0, x, y);
    }
    if (this.state === 'dizzy') {
      const x = this.ix(a) + this.w / 2, y = this.iy(a) - 6;
      for (let i = 0; i < 3; i++) { const an = this.t * 6 + i * 2.09; drawSprite(ctx, 'enemy_mark_star', 0, x + Math.cos(an) * 16, y + Math.sin(an) * 5); }
    }
  }
}
registerEntity('charger', Charger);

// ---- 盾：正面からの弾を防ぐ。上からのみ踏める。背後に回られると少し遅れて振り向く ----
class Shielder extends Enemy {
  constructor(w, s) { super(w, s, 'shielder'); this.behind = 0; this.block = 0; }
  update(dt) {
    this.t += dt;
    const w = this.world, p = w.player;
    if (this.block > 0) this.block -= dt;
    const dx = p.cx - this.cx;
    if (Math.abs(dx) < 6 * TILE && Math.abs(p.cy - this.cy) < 3 * TILE && dx * this.face < 0) {
      this.behind += dt;
      if (this.behind > 0.8) { this.turn(); this.behind = 0; if (this.onGround) this.vy = -180; }
    } else this.behind = 0;
    if (this.stun > 0) { this.stun -= dt; this.vx = 0; } else if (this.onGround) this.vx = this.face * (this.spec.speed ? this.spec.speed * TILE : this.K.speed);
    this.walkBody(dt);
    if (this.wallAhead() || this.outOfRange() || (this.onGround && this.cliffAhead())) this.turn();
    this.setAnim(this.block > 0 ? 'block' : 'walk', 7);
  }
  // 前から来た攻撃（上からではないもの）を防ぐ
  shielded(source, rect) {
    if (source === this.world.player && source.star > 0) return false;
    // どちらから来た攻撃か：一閃は主人公の位置、飛ぶ弾は進む向きで決める
    // （以前は当たり箱の中心で見ていたので、背後のすぐ近くからの一閃が「正面」扱いで防がれていた）
    let fromFront;
    if (source && source.p && source.p.cx !== undefined) fromFront = (source.p.cx - this.cx) * this.face > -4;
    else if (source && source.vx) fromFront = source.vx * this.face < 0;
    else { const sx = rect ? rect.x + rect.w / 2 : source.cx; fromFront = (sx - this.cx) * this.face > -4; }
    const fromAbove = rect && rect.y + rect.h < this.y + 12;
    if (fromFront && !fromAbove) { this.block = 0.25; this.sx = 0.9; return true; }
    return false;
  }
  damage(dmg, source) {
    // 雪けむりダッシュで正面から当たったら跳ね返す
    const p = this.world.player;
    if (source === p && p.dashT > 0 && p.star <= 0 && (p.cx - this.cx) * this.face > 0) {
      p.dashT = 0; p.vx = this.face * 300; p.vy = -260; p.controlLock = 0.2; p.invuln = Math.max(p.invuln, 0.4);
      this.block = 0.25; this.world.sfx('clang'); this.world.particles.hit(this.cx + this.face * 12, this.cy, '#ddd');
      return false;
    }
    return super.damage(dmg, source);
  }
}
registerEntity('shielder', Shielder);
