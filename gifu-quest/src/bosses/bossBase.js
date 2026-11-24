import { Entity } from '../actors/entity.js';
import { Bullet } from '../actors/projectiles.js';
import { TILE, RUNTIME, HITBOX } from '../core/config.js';
import { drawSprite } from '../gfx/atlas.js';
import { isSolid } from '../world/tiles.js';

// ボスの基底クラス（設計書 7章）。担当：ボス
// 状態機械：dormant(出番前) → intro(登場) → idle(待機) → tell(予告) → attack(攻撃) → rest(隙) → recover(戻る) → idle …
//           被弾 → hurt → recover。段階変化 → phase。HP 0 → dying → 宝珠
// 各ボスは def（名前・HP・技の表・段階の表）と、フック onEnter(state, move) / tick(dt, state, move) / draw だけを書く。
//   tick の戻り値 true で attack / recover / intro を終える。tell・rest・idle・hurt・phase は表の時間で終わる（tick は毎フレーム呼ばれる）
// def = {
//   id, name, title, hp,
//   moves: { <技>: { tell: 予告秒(0.4〜0.8に丸める), rest: 隙の秒(0なら隙なし) } },
//   phases: [ { moves: [<技>...順に繰り返す], speed: 速度の倍率, wait: 待ち時間(秒) }, ×3 ],
// }

export const BOSSES = {};
export function registerBoss(name, cls) { BOSSES[name] = cls; }

export const TELL_MIN = 0.4, TELL_MAX = 0.8;
export const HURT_INVULN = 1.0;     // 被弾後の無敵
export const PHASE_INVULN = 0.8;    // 段階変化の無敵
export const PHASE_TIME = 1.25;     // 段階変化の演出の長さ
export const HURT_TIME = 0.45;      // ひるみ
export const MAX_HIT = 3;           // 1回の攻撃の最大ダメージ（飛騨牛串の99など）
export const EASY_HP = 0.7, EASY_WAIT = 1.3;
export const PHASE_MARKS = [2 / 3, 1 / 3];   // 段階2・段階3に上がるHPの割合

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export { clamp };
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => t * t * (3 - 2 * t);
export const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const rect = () => ({ x: -1e5, y: -1e5, w: 0, h: 0 });
export function setRect(r, x, y, w, h) { r.x = x; r.y = y; r.w = w; r.h = h; return r; }
export function hideRect(r) { r.x = -1e5; r.y = -1e5; r.w = 0; r.h = 0; return r; }

export class Boss extends Entity {
  // arena: { L, R, top, floorY, cx, tx0, tx1, ty0, ty1, entity }  L/R は内側の端（ドット）
  constructor(world, arena, def) {
    super(world, { type: 'boss_' + def.id });
    this.def = def; this.arena = arena; this.id = def.id;
    this.boss = true; this.enemy = false; this.stompable = true; this.stompFromTopOnly = true;
    this.persistent = true; this.z = 4; this.drawPad = 320;
    this.name = def.name; this.title = def.title;
    this.phaseMarks = PHASE_MARKS;          // HUD のHPバーの目盛り（HPに対する割合）。段階は HP がこの割合以下で上がる
    this.touchDamage = 1;
    this.weak = rect();                     // 弱点（hurtRect）
    this.bodies = [rect(), rect(), rect(), rect()];  // 触れると被弾する本体の箱
    this.nBodies = 0;
    this.owned = [];                        // 出した弾・足場など（片付け用）
    this._o = { flip: false, sx: 1, sy: 1, rot: 0, alpha: 1 };
    this._pr = rect();
    this.clangCd = 0;
    this.setup();
    this.hardReset();
  }
  // ---- 派生クラスが上書きするもの ----
  setup() {}                         // 1回だけ（部品の用意）
  resetPose() {}                     // 初期位置・ギミックの初期化（reset のたび）
  onEnter(state, move) {}            // 状態に入った時
  tick(dt, state, move) { return true; }
  onPhase(n) {}                      // 段階が上がった時（ギミック開始）
  cancelMove() {}                    // 段階変化・撃破で技を中断する時
  onDefeat() {}                      // 撃破の瞬間（溶岩を冷やす等）
  isVulnerable() { return this.state === 'rest'; }
  updateRects() {}                   // weak と bodies/nBodies を更新
  defeatPoint() { return null; }      // 宝珠を出す位置 {x,y}（null なら自動）

  // ---- 共通 ----
  get easy() { return RUNTIME.difficulty === 'easy'; }
  get P() { return this.def.phases[this.phase - 1]; }
  get spd() { return this.P.speed || 1; }
  hardReset() {
    this.maxHp = this.easy ? Math.ceil(this.def.hp * EASY_HP) : this.def.hp;
    this.hp = this.maxHp;
    this.phase = 1; this.moveIdx = 0; this.move = null; this.moveName = '';
    this.state = 'dormant'; this.st = 0; this.t = 0;
    this.invuln = 0; this.flash = 0; this.vx = this.vy = 0;
    this.enemy = false; this.dying = false;
    this.cleanupOwned();
    hideRect(this.weak); this.nBodies = 0;
    this.resetPose();
    this.px = this.x; this.py = this.y;
  }
  // 主人公がミスして中間地点に戻った時（World.respawn から）。HP全快・初期位置に戻し、アリーナを開け直す
  reset() {
    // 撃破演出の途中でミスした時は、倒したことを取り消さない（宝珠はそのまま出る）。カメラの固定だけ外す
    if (this.dying) { this.world.unlockCamera(); return; }
    this.hardReset();
    // 残った手下（からくり人形・分身）と弾を消す（再挑戦の登場演出中に当たらないように）
    for (const e of this.world.entities) if (e.alive && (e.bossMinion || e.bossHazard || e instanceof Bullet) && overlap(e, this.arena.entity || this)) e.alive = false;
    if (this.world.boss === this) this.world.boss = null;
    if (this.arena.entity) this.arena.entity.rearm();
  }
  // アリーナから：登場演出を始める
  beginIntro() { this.state = 'intro'; this.st = 0; this.enemy = true; this.onEnter('intro', null); }
  // アリーナから：戦闘開始
  startFight() { if (this.state === 'intro' || this.state === 'dormant') this.enter('idle'); }
  own(e) { this.owned.push(e); this.world.spawn(e); return e; }
  cleanupOwned() { for (const e of this.owned) e.alive = false; this.owned.length = 0; }
  // 出した弾を消す（撃破時）
  clearShots() {
    for (const e of this.world.entities) if (e.alive && (e instanceof Bullet || e.bossMinion || e.bossHazard)) { this.world.particles.hit(e.cx, e.cy, '#fff'); e.alive = false; }
  }
  waitTime() { return (this.P.wait ?? 1) * (this.easy ? EASY_WAIT : 1); }
  nextMove() {
    const list = this.P.moves;
    this.moveName = list[this.moveIdx % list.length];
    this.moveIdx++;
    this.move = this.def.moves[this.moveName];
    this.enter('tell');
  }
  enter(state) {
    this.state = state; this.st = 0;
    if (state === 'tell') this.tellT = clamp(this.move.tell ?? 0.6, TELL_MIN, TELL_MAX);
    if (state === 'rest') this.restT = (this.move && this.move.rest) || 1.2;
    if (state === 'idle') this.waitT = this.waitTime();
    this.onEnter(state, this.move);
  }
  playerRect() {
    const p = this.world.player, i = HITBOX.hurtInset;
    return setRect(this._pr, p.x + i, p.y + i, p.w - i * 2, p.h - i * 2);
  }
  touchesPlayer(r) { return overlap(this.playerRect(), r); }
  hurtPlayer(src) { const p = this.world.player; if (this.world.state === 'play' && !p.dead) return p.hurt(src || this, 1); return false; }

  update(dt) {
    if (this.state === 'dormant') return;
    this.t += dt; this.st += dt;
    if (this.clangCd > 0) this.clangCd -= dt;
    const s = this.state, m = this.move;
    const done = this.tick(dt, s, m);
    if (this.state === s) {
      switch (s) {
        case 'intro': break;   // アリーナが startFight を呼ぶ
        case 'idle': if (this.st >= this.waitT) this.nextMove(); break;
        case 'tell': if (this.st >= this.tellT) this.enter('attack'); break;
        case 'attack': if (done) this.enter(m && m.rest > 0 ? 'rest' : 'recover'); break;
        case 'rest': if (this.st >= this.restT) this.enter('recover'); break;
        case 'recover': if (done) this.enter('idle'); break;
        case 'hurt': if (this.st >= HURT_TIME) this.enter('recover'); break;
        case 'phase': if (this.st >= PHASE_TIME) this.enter('recover'); break;
        case 'dying': this.dyingUpdate(dt); break;
      }
    }
    this.updateRects();
    // 本体に触れると被弾
    if (this.state !== 'dying' && this.state !== 'dormant') {
      for (let i = 0; i < this.nBodies; i++) if (this.touchesPlayer(this.bodies[i])) { this.hurtPlayer(this); break; }
    }
  }
  hurtRect() { return this.weak; }
  shielded(source, r) { return !this.canHit(); }
  canHit() { return this.state !== 'dormant' && this.state !== 'intro' && this.state !== 'dying' && this.state !== 'phase' && this.isVulnerable(); }
  clang() {
    if (this.clangCd > 0) return;
    this.clangCd = 0.3;
    this.world.sfx('clang');
    this.world.particles.hit(this.weak.x + this.weak.w / 2, this.weak.y + this.weak.h / 2, '#dde');
  }
  onStomp(p, dmg) { if (!this.damage(dmg, p)) this.clang(); }
  damage(dmg, source) {
    if (!this.alive || this.dying) return false;
    if (this.invuln > 0) return false;
    if (!this.canHit()) { this.clang(); return false; }
    dmg = Math.min(dmg, MAX_HIT);
    this.hp = Math.max(0, this.hp - dmg);
    this.flash = 0.16;
    this.invuln = HURT_INVULN;
    const w = this.world;
    w.hitstop(0.08);
    w.camera.shake(6, 0.25);
    w.particles.burst(this.weak.x + this.weak.w / 2, this.weak.y + this.weak.h / 2, 10, { speed: 260, life: 0.45, size: 6, size1: 0, color: '#fff6c0', shape: 'star', drag: 3, front: true, vr: 10 });
    if (this.hp <= 0) { this.startDying(); return true; }
    const np = this.hp <= this.maxHp * PHASE_MARKS[1] + 1e-6 ? 3 : this.hp <= this.maxHp * PHASE_MARKS[0] + 1e-6 ? 2 : 1;
    if (np > this.phase) this.startPhase(np);
    else { this.cancelMove(); this.enter('hurt'); }
    return true;
  }
  startPhase(n) {
    this.cancelMove();
    this.phase = n; this.moveIdx = 0;
    this.invuln = Math.max(this.invuln, PHASE_INVULN);
    const w = this.world;
    w.camera.shake(12, 0.8);
    w.sfx('bossPhase');
    this.enter('phase');
    this.onPhase(n);
  }
  startDying() {
    this.dying = true;
    this.cancelMove();
    this.enemy = false;
    this.state = 'dying'; this.st = 0; this.boomT = 0;
    const w = this.world;
    w.slowmo(0.25, 0.5);
    w.camera.shake(14, 1.2);
    w.sfx('bossDefeat');
    this.clearShots();
    this.onDefeat();
  }
  dyingUpdate(dt) {
    const w = this.world;
    this.flash = (this.st * 10 | 0) % 2 ? 0.1 : 0;
    this.boomT -= dt;
    if (this.boomT <= 0 && this.st < 1.25) {
      this.boomT = 0.14;
      const x = this.x + Math.random() * this.w, y = this.y + Math.random() * this.h;
      w.particles.explosion(x, y, 0.55);
      w.sfx('explosion');
    }
    if (this.st >= 1.45) {
      const dp = this.defeatPoint();
      const A = this.arena;
      const cx = clamp(dp ? dp.x : this.cx, A.L + TILE * 3, A.R - TILE * 3);
      const cy = Math.min(dp ? dp.y : this.cy, A.floorY - TILE * 1.5);
      w.particles.explosion(cx, cy, 1.8);
      w.camera.shake(16, 0.6);
      w.sfx('explosion');
      this.cleanupOwned();
      // 宝珠は boss の中心に出る
      this.x = cx - this.w / 2; this.y = cy - this.h / 2;
      w.bossDefeated(this);
      if (this.arena.entity) this.arena.entity.onBossDefeated();
      this.alive = false;
    }
  }

  // ---- 描画の補助 ----
  // 被弾の白フラッシュ・無敵の点滅つきでスプライトを描く
  sprite(ctx, name, frame, x, y, flip = false, sx = 1, sy = 1, rot = 0, alpha = 1) {
    const o = this._o;
    o.flip = flip; o.sx = sx; o.sy = sy; o.rot = rot;
    const blink = this.invuln > 0 && this.state !== 'phase' && this.state !== 'dying' && ((this.t * 18) | 0) % 2 === 0;
    o.alpha = alpha * (blink ? 0.45 : 1);
    drawSprite(ctx, name, frame, x, y, o);
    if (this.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      o.alpha = Math.min(1, this.flash * 9) * alpha;
      drawSprite(ctx, name, frame, x, y, o);
      drawSprite(ctx, name, frame, x, y, o);
      ctx.restore();
    }
  }
  shadow(ctx, x, y, w, a = 0.35) {
    ctx.fillStyle = `rgba(20,10,20,${a})`;
    ctx.beginPath(); ctx.ellipse(x, y, w / 2, w / 7, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 弱点が光る（隙の間）
  weakGlow(ctx) {
    if (!this.canHit() || this.invuln > 0) return;
    const r = this.weak, x = r.x + r.w / 2, y = r.y + r.h / 2;
    const k = 0.5 + 0.5 * Math.sin(this.t * 12);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,240,150,${0.35 + k * 0.45})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(x, y, r.w / 2 + 6 + k * 4, r.h / 2 + 4 + k * 3, 0, 0, Math.PI * 2); ctx.stroke();
    // 下向きの矢印（踏める合図）
    ctx.fillStyle = `rgba(255,236,120,${0.5 + k * 0.5})`;
    const ay = r.y - 22 - k * 6;
    ctx.beginPath(); ctx.moveTo(x - 9, ay); ctx.lineTo(x + 9, ay); ctx.lineTo(x, ay + 11); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // 予告の「！」
  alertMark(ctx, x, y, k = 1) {
    ctx.save();
    ctx.globalAlpha = k;
    ctx.fillStyle = '#ff3b2f'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y - 24); ctx.lineTo(x + 14, y); ctx.lineTo(x - 14, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 1.5, y - 17, 3, 9); ctx.fillRect(x - 1.5, y - 6, 3, 3);
    ctx.restore();
  }
  light(x, y, r, color, a = 1) { const L = this.world.lights; L.push({ x, y, r, color, a }); }
}

// ---- ボスが出す弾（Bullet の拡張：向きに合わせて回す・光る・自前の描画） ----
export class BossShot extends Bullet {
  constructor(world, x, y, opts) {
    super(world, x, y, opts);
    this.orient = !!opts.orient;
    this.glow = opts.glow || null;
    this.trail = opts.trail || null;
    this.scale = opts.scale || 1;
    this.frames = opts.fps || 12;
    this.grow = opts.grow || 0;
    this.drag = opts.drag || 0;
  }
  update(dt) {
    super.update(dt);
    if (this.drag) { this.vx *= 1 - this.drag * dt; }
    if (this.glow) this.world.lights.push({ x: this.cx, y: this.cy, r: 60 * this.scale, color: this.glow, a: 0.9 });
    if (this.trail && this.world.tick % 4 === 0) this.world.particles.spawn({ x: this.cx, y: this.cy, vx: -this.vx * 0.1, vy: -this.vy * 0.1, life: 0.35, size: 6 * this.scale, size1: 0, color: this.trail, add: true });
  }
  draw(ctx, a) {
    const rot = this.orient ? Math.atan2(this.vy, this.vx) : this.spin * this.t;
    drawSprite(ctx, this.sprite, (this.t * this.frames) | 0, this.ix(a) + this.w / 2, this.iy(a) + this.h / 2, { rot, sx: this.scale, sy: this.scale });
  }
}

// ---- ボスが動かす足場（屋台の上・浮き足場・岩場）。持ち主が tx,ty を決め、World が dx,dy を計算して主人公を運ぶ ----
export class BossPlatform extends Entity {
  constructor(world, x, y, w, h = 16) {
    super(world, { type: 'bossPlatform' });
    this.platform = true; this.oneWay = true; this.dropable = true; this.persistent = true;
    this.x = this.px = this.tx = x; this.y = this.py = this.ty = y; this.w = w; this.h = h;
    this.z = 2;
    this.drawFn = null;   // 持ち主が描くなら null
  }
  moveTo(x, y) { this.tx = x; this.ty = y; }
  warp(x, y) { this.x = this.px = this.tx = x; this.y = this.py = this.ty = y; }
  update(dt) { this.x = this.tx; this.y = this.ty; }
  // 主人公が上に乗っているか
  riding() { const p = this.world.player; return p.platform === this && p.onGround; }
  draw(ctx, a) { if (this.drawFn) this.drawFn(ctx, this, a); }
}

// 主人公を横に押す（吹雪の横風など）。壁にはめり込ませない
export function pushPlayer(world, dx) {
  const p = world.player, L = world.level;
  if (p.frozen || p.dead) return;
  const nx = p.x + dx;
  const edge = dx > 0 ? nx + p.w - 0.01 : nx;
  const y0 = p.y + 2, y1 = p.y + p.h - 2;
  if (isSolid(L.at(edge, y0)) || isSolid(L.at(edge, (y0 + y1) / 2)) || isSolid(L.at(edge, y1))) return;
  p.x = nx;
}

// ボスの背景・前景を別の描画順で描くための層（木・水・吹雪など）。持ち主の method を呼ぶ
export class BossLayer extends Entity {
  constructor(world, owner, z, method) {
    super(world, { type: 'bossLayer' });
    const A = owner.arena;
    this.owner = owner; this.method = method; this.z = z; this.persistent = true;
    this.x = A.L - 2 * TILE; this.y = A.top; this.w = A.R - A.L + 4 * TILE; this.h = A.floorY - A.top + 4 * TILE;
    this.px = this.x; this.py = this.y; this.drawPad = 200;
  }
  draw(ctx, a) { this.owner[this.method](ctx, a); }
}
