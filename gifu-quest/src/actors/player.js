import { PHYS, TILE, HITBOX, statsToPhysics, RUNTIME } from '../core/config.js';
import { input } from '../core/input.js';
import { moveBody, overlapsTile } from '../world/collision.js';
import { T, isWater, isLava, isSlippery, isSlide, isOneWay, isBreakable } from '../world/tiles.js';
import { drawSprite, hasSprite } from '../gfx/atlas.js';
import { ABILITIES } from './abilities.js';
import CHARS from '../data/characters.json';
import { weaponEffects, weaponById } from '../systems/gacha.js';
import { WaveShot } from './projectiles.js';
import { drawHeroDressed, heroSpriteName } from '../art/heroGear.js';

// 主人公（設計書 4章・5章）。アニメ名は docs/ARCHITECTURE.md の HERO_ANIMS
export const HERO_ANIMS = {
  idle: { frames: 4, fps: 5 }, walk: { frames: 8, fps: 12 }, run: { frames: 8, fps: 16 }, brake: { frames: 1, fps: 1 },
  jumpUp: { frames: 2, fps: 10 }, apex: { frames: 1, fps: 1 }, fall: { frames: 2, fps: 8 }, land: { frames: 1, fps: 1 },
  crouch: { frames: 1, fps: 1 }, wall: { frames: 1, fps: 1 }, attack: { frames: 4, fps: 20 }, attack2: { frames: 4, fps: 20 },
  hurt: { frames: 2, fps: 10 }, win: { frames: 4, fps: 6 }, fidget: { frames: 6, fps: 6 },
  swim: { frames: 4, fps: 8 }, glide: { frames: 2, fps: 6 }, dash: { frames: 3, fps: 18 }, slide: { frames: 1, fps: 1 },
};

export class Player {
  constructor(world, charId, x, y) {
    this.world = world;
    this.id = charId;
    this.def = CHARS[charId];
    this.stats = statsToPhysics(this.def);
    this.ability = ABILITIES[charId];
    this.w = HITBOX.w; this.h = HITBOX.h;
    this.x = x; this.y = y; this.px = x; this.py = y;
    this.vx = 0; this.vy = 0;
    this.face = 1;
    this.onGround = false;
    // 装備した武器（福引き）の効果。docs/gacha.md
    const wp = world.weapon;
    this.weaponId = wp ? wp.id : null;
    this.wfx = weaponEffects(this.weaponId, wp ? wp.lv : 1, charId);
    const F = this.wfx;
    this.stats.power *= 1 + F.atk;
    this.stats.walk *= 1 + F.spd; this.stats.dash *= 1 + F.spd;
    this.stats.jump *= 1 + F.jmp;
    this.guardLeft = F.guard;
    this.weaponColor = this.weaponId ? weaponById(this.weaponId).color : null;
    // 難易度「やさしい」：ハート+1
    const bonus = (RUNTIME.difficulty === 'easy' ? 1 : 0) + F.heart;
    this.hearts = this.stats.hearts + bonus;
    this.maxHearts = this.stats.hearts + bonus;
    this.coyote = 0; this.buffer = 0; this.invuln = 0; this.star = 0;
    this.techCd = 0; this.techMax = this.def.techCooldown * (1 - this.wfx.cd); this.attackHeld = 0; this.charge = 0;
    this.airJumps = 0; this.dashT = 0; this.dashUsed = false; this.controlLock = 0;
    this.wallSliding = 0; this.gliding = false; this.inWater = false; this.crouch = false;
    this.dropTimer = 0;
    this.anim = 'idle'; this.animT = 0; this.attackAnim = 0;
    this.sx = 1; this.sy = 1;      // 伸び縮み
    this.idleT = 0;
    this.dead = false; this.frozen = false; this.winning = false;
    this.prevBottom = y + this.h;
    this.trail = [];               // 残像
    this.jumpHeldFromJump = false;
    this.landT = 0;
    this.techIndex = 0;            // さるぼぼ用
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  has(skill) { return this.ability.skills.includes(skill) || (this.id === 'sarubobo'); }
  hurtRect() { const i = HITBOX.hurtInset; return { x: this.x + i, y: this.y + i, w: this.w - i * 2, h: this.h - i * 2 }; }
  isInvincible() { return this.invuln > 0 || this.star > 0 || this.dashT > 0 || this.dead || this.winning; }

  update(dt) {
    const w = this.world, I = input;
    this.px = this.x; this.py = this.y;
    this.prevBottom = this.y + this.h;
    if (this.dead || this.frozen) { this.updateAnim(dt); return; }
    if (this.winning) { this.vx *= 0.9; this.physics(dt, 0, false); this.updateAnim(dt); return; }

    // 乗っている動く床の移動を引き継ぐ
    if (this.platform && this.platform.alive !== false) { this.x += this.platform.dx || 0; this.y += this.platform.dy || 0; }

    for (const k of ['coyote', 'buffer', 'invuln', 'star', 'techCd', 'controlLock', 'dropTimer', 'landT']) if (this[k] > 0) this[k] -= dt;

    let dir = (I.held.right ? 1 : 0) - (I.held.left ? 1 : 0);
    if (this.controlLock > 0) dir = 0;
    this.crouch = this.onGround && I.held.down && !dir;

    // 技（押しっぱなしでダッシュ）
    if (I.held.attack) this.attackHeld += dt; else this.attackHeld = 0;
    if (I.pressed.attack && this.techCd <= 0) {
      this.ability.tech(this, w, false);
      // 刃の波（からくり刀など）：技が出た時に一緒に飛ばす
      if (this.wfx.wave && this.techCd > 0) w.spawn(new WaveShot(w, this));
    }
    if (I.held.attack) this.charge += dt;
    if (I.released.attack) { if (this.charge >= 0.6 && this.ability.charged) this.ability.charged(this, w); this.charge = 0; }
    const dashing = this.attackHeld > 0.18 && dir !== 0;

    // ジャンプ入力
    if (I.pressed.jump) this.buffer = PHYS.jumpBuffer;
    if (this.onGround) { this.coyote = PHYS.coyote; this.airJumps = this.has('doubleJump') ? 1 : 0; this.dashUsed = false; }

    // 下＋ジャンプで通り抜け足場から降りる
    if (this.buffer > 0 && I.held.down && this.onGround && (isOneWay(this.groundTile) || (this.platform && this.platform.oneWay !== false && this.platform.dropable))) {
      this.dropTimer = 0.22; this.buffer = 0; this.onGround = false; this.y += 2;
    }

    if (this.buffer > 0) {
      if (this.coyote > 0 && !this.inWater) this.jump(1);
      else if (this.inWater && this.atWaterSurface(w)) { this.jump(1); }   // 水面からは普通に跳べる（レベル検査の前提：水面から3段まで上がれる）
      else if (this.inWater) { this.vy = -PHYS.swimImpulse * (this.has('swim') ? 1.35 : 1); this.buffer = 0; w.particles.burst(this.cx, this.y + 10, 4, { speed: 40, life: 0.6, size: 3, size1: 1, color: 'rgba(220,240,255,0.8)', grav: -120 }); w.sfx('swim'); }
      else if (this.wallSliding > 0 && this.has('wallKick')) {
        this.vy = -this.stats.jump * 0.98; this.vx = -this.wallDir * PHYS.wallKickVX; this.face = -this.wallDir;
        this.controlLock = 0.13; this.buffer = 0; this.wallSliding = 0; this.jumpHeldFromJump = true;
        this.sx = 0.8; this.sy = 1.2; w.particles.dust(this.wallDir > 0 ? this.x + this.w : this.x, this.cy, -this.wallDir, 5); w.sfx('jump');
      } else if (this.airJumps > 0) { this.airJumps--; this.jump(0.9); w.particles.burst(this.cx, this.y + this.h, 8, { speed: 120, life: 0.4, size: 4, size1: 0, color: '#eaf6ff', shape: 'star', drag: 3 }); }
    }

    // 横移動
    const S = this.stats;
    let maxV = dashing ? S.dash : S.walk;
    if (this.inWater) maxV *= this.has('swim') ? 1.0 : 0.6;
    if (this.crouch) maxV = 0;
    let accel = PHYS.accelGround, decel = PHYS.decelGround;
    if (!this.onGround) { accel *= PHYS.airMul; decel *= PHYS.airMul * 0.6; }
    const slippery = this.onGround && isSlippery(this.groundTile) && !this.has('noSlip');
    if (slippery) { accel *= PHYS.iceFriction * 2.2; decel *= PHYS.iceFriction; }
    if (this.onGround && w.env && w.env.wet) decel *= PHYS.rainFriction;
    // 合掌造りの屋根（滑り台）に乗っている：通常の加減速（止まろうとする力）を使わず、勝手に滑り下りる（下で処理）
    const onSlide = this.onGround && isSlide(this.groundTile) && this.dashT <= 0;
    if (onSlide) this.slideKeep = 0.12; else if (this.slideKeep > 0) this.slideKeep -= dt;
    // 屋根の継ぎ目（一瞬だけ平らな所）で勢いが落ちないよう、滑り終わりの直後は減速しない（逆に押した時を除く）
    const keepSlide = !onSlide && this.slideKeep > 0 && this.onGround && dir * this.vx >= 0;
    if (this.dashT > 0 || onSlide || keepSlide) { /* 雪けむりダッシュ中は速度固定 */ if (onSlide && dir) this.face = dir; }
    else if (dir) {
      if (this.vx * dir < 0) {
        accel *= PHYS.turnMul;
        if (this.onGround && Math.abs(this.vx) > 120 && !slippery) { this.braking = 0.12; if (w.tick % 6 === 0) w.particles.dust(this.cx, this.y + this.h, -dir, 2); }
      }
      this.vx = approach(this.vx, dir * maxV, accel * dt);
      if (Math.abs(this.vx) > maxV) this.vx = approach(this.vx, dir * maxV, decel * dt);
      this.face = dir;
    } else {
      this.vx = approach(this.vx, 0, decel * dt);
    }
    if (this.braking > 0) this.braking -= dt;

    // 合掌造りの屋根（滑り台）：勝手に滑り下りる
    if (onSlide) {
      // 滑る向きに押すと少し速く、逆に押すと少し遅く（止まれはしない）
      const sd = this.groundTile === T.ROOF_SLIDE_R ? 1 : -1;
      this.vx = approach(this.vx, sd * S.dash * 1.15 + dir * S.walk * 0.25, 1400 * dt);
      this.sliding = true;
    } else this.sliding = false;

    this.physics(dt, dir, dashing);

    // 走りの土ぼこり
    if (this.onGround && Math.abs(this.vx) > S.walk * 1.05 && w.tick % 8 === 0) w.particles.dust(this.cx - this.face * 8, this.y + this.h, this.face, 1);
    // 残像（ダッシュ・無敵）
    if ((this.dashT > 0 || this.star > 0 || (dashing && Math.abs(this.vx) > S.walk * 1.2)) && w.tick % 4 === 0) {
      this.trail.push({ x: this.x, y: this.y, life: 0.25, anim: this.anim, frame: this.frame | 0, face: this.face });
      if (this.trail.length > 8) this.trail.shift();
    }
    for (const t of this.trail) t.life -= dt;
    while (this.trail.length && this.trail[0].life <= 0) this.trail.shift();

    this.updateAnim(dt);
  }

  jump(mul) {
    const w = this.world;
    this.vy = -this.stats.jump * mul;
    if (this.platform && this.platform.dy < 0) this.vy += this.platform.dy * 120;   // 床の勢いを引き継ぐ
    if (this.platform) this.vx += (this.platform.dx || 0) * 120 * 0.8;
    this.coyote = 0; this.buffer = 0; this.onGround = false; this.jumpHeldFromJump = true;
    this.sx = 0.78; this.sy = 1.25;
    w.particles.dust(this.cx, this.y + this.h, 0, 5);
    w.sfx('jump');
  }

  physics(dt, dir, dashing) {
    const w = this.world, I = input;
    const wasGround = this.onGround;
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vy = this.onGroundAtDash ? this.vy : 0;
    }
    // 重力
    let g = (this.vy < 0 && I.held.jump && this.jumpHeldFromJump) ? PHYS.gravityHold : PHYS.gravityRelease;
    if (Math.abs(this.vy) < PHYS.apexThreshold && !this.onGround) g *= PHYS.apexMul;
    let maxFall = PHYS.maxFall;
    if (this.inWater) { g = PHYS.waterGravity; maxFall = PHYS.waterMaxFall; }
    if (this.dashT > 0 && !this.onGroundAtDash) g = 0;
    this.vy = Math.min(this.vy + g * dt, maxFall);
    if (this.vy >= 0) this.jumpHeldFromJump = false;

    // ミナモ：滑空
    this.gliding = false;
    if (this.has('glide') && !this.onGround && !this.inWater && this.vy > 0 && I.held.jump && this.buffer <= 0) {
      this.vy = Math.min(this.vy, PHYS.glideFall); this.gliding = true;
    }
    // リーフ：壁に張り付く
    if (this.wallSliding > 0) this.wallSliding -= dt;
    if (this.has('wallKick') && !this.onGround && this.vy > 0) {
      const into = (this.wallR && dir > 0) ? 1 : (this.wallL && dir < 0) ? -1 : 0;
      if (into) { this.wallSliding = 0.1; this.wallDir = into; this.vy = Math.min(this.vy, PHYS.wallSlideMax); if (w.tick % 10 === 0) w.particles.dust(into > 0 ? this.x + this.w : this.x, this.y + 8, 0, 1); }
    }

    // 天井ブロック（ゲンは頭突きでレンガも壊す）
    const onCeil = (tx, ty) => {
      w.sfx('bump');
      const t = w.level.get(tx, ty);
      if (this.has('breakBricks') && isBreakable(t)) w.breakTile(tx, ty);
      else w.bumpTile(tx, ty);
    };
    // 横風（吹雪）。進む向きによって速くなる・遅くなる
    const wind = (w.env && w.env.wind) || 0;
    this.vx += wind;
    moveBody(w.level, this, dt, { platforms: w.platforms, onCeil });
    if (!(this.wallL || this.wallR)) this.vx -= wind;
    if (this.wallL || this.wallR) { if (this.dashT > 0) { this.dashT = 0; } this.vx = 0; }

    // 着地
    if (this.onGround && !wasGround) {
      const impact = Math.min(1, this.landVy / PHYS.maxFall);
      this.sx = 1 + 0.3 * impact; this.sy = 1 - 0.28 * impact;
      if (impact > 0.35) { w.particles.dust(this.cx, this.y + this.h, 0, Math.round(4 + impact * 6)); w.sfx('land'); }
      this.landT = 0.08;
    }
    this.landVy = this.vy > 0 ? this.vy : this.landVy;
    if (!this.onGround) this.landVy = Math.max(this.landVy || 0, this.vy);
    else this.landVy = 0;

    // 水・溶岩・トゲ・穴
    const lv = w.level;
    const wasWater = this.inWater;
    this.inWater = !!overlapsTile(lv, { x: this.x, y: this.y + this.h * 0.45, w: this.w, h: this.h * 0.55 }, isWater, 3) || w.inLiquid?.(this, 'water');
    if (this.inWater !== wasWater) { w.particles.splash(this.cx, this.inWater ? this.y + this.h * 0.5 : this.y + this.h); w.sfx('splash'); if (!this.inWater && this.vy < 0) this.vy = Math.min(this.vy, -this.stats.jump * 0.75); }
    if (overlapsTile(lv, this, isLava, 6) || w.inLiquid?.(this, 'lava')) { w.playerMiss('lava'); return; }
    if (overlapsTile(lv, this, (t) => t === T.SPIKE, 5)) this.hurt(null, 1);
    if (this.y > lv.pxH + 40) { w.playerMiss('pit'); return; }

    // 伸び縮みを戻す
    const k = 1 - Math.exp(-14 * dt);
    this.sx += (1 - this.sx) * k; this.sy += (1 - this.sy) * k;
  }

  // 水面に浮いている（頭の少し上が水でない）。水中で上が空いている時の「泳ぐ」と区別する
  atWaterSurface(w) {
    const r = this._surfRect || (this._surfRect = { x: 0, y: 0, w: 0, h: 8 });
    r.x = this.x; r.y = this.y - 14; r.w = this.w;
    return this.vy > -120 && !overlapsTile(w.level, r, isWater, 3) && !w.inLiquid?.(r, 'water');
  }

  hurt(source, dmg = 1) {
    if (this.isInvincible()) return false;
    const w = this.world;
    // 守り（武器）：中間地点ごとに決まった回数だけ攻撃を防ぐ
    if (this.guardLeft > 0) {
      this.guardLeft--;
      this.invuln = 1.0;
      w.particles.spawn({ x: this.cx, y: this.cy, life: 0.4, size: 14, size1: 46, color: 'rgba(160,220,255,0.9)', shape: 'ring', front: true });
      w.particles.hit(this.cx, this.cy, '#bfe8ff');
      w.sfx('clang');
      w.events.emit('guard', { left: this.guardLeft });
      return false;
    }
    this.hearts -= dmg;
    w.stats.hits++;
    w.events.emit('playerHurt', { hearts: this.hearts });
    w.sfx('hurt');
    w.camera.shake(8, 0.3);
    w.hitstop(0.08);
    const from = source ? Math.sign(this.cx - (source.cx ?? source.x)) || -this.face : -this.face;
    this.vx = from * PHYS.hurtKnockX; this.vy = -PHYS.hurtKnockY;
    this.onGround = false; this.controlLock = 0.25; this.dashT = 0;
    this.invuln = PHYS.hurtInvuln;
    this.hurtT = 0.35;
    if (this.hearts <= 0) { this.hearts = 0; w.playerDown(); }
    return true;
  }

  heal(n = 1) { this.hearts = Math.min(this.maxHearts, this.hearts + n); }

  updateAnim(dt) {
    let a;
    if (this.hurtT > 0) { this.hurtT -= dt; a = 'hurt'; }
    else if (this.winning) a = 'win';
    else if (this.dead) a = 'hurt';
    else if (this.attackAnim > 0) { this.attackAnim -= dt; a = this.attackAlt ? 'attack2' : 'attack'; }
    else if (this.dashT > 0) a = 'dash';
    else if (this.sliding) a = 'slide';
    else if (this.inWater && !this.onGround) a = 'swim';
    else if (this.wallSliding > 0) a = 'wall';
    else if (this.gliding) a = 'glide';
    else if (!this.onGround) a = this.vy < -PHYS.apexThreshold ? 'jumpUp' : this.vy > PHYS.apexThreshold ? 'fall' : 'apex';
    else if (this.landT > 0) a = 'land';
    else if (this.crouch) a = 'crouch';
    else if (this.braking > 0) a = 'brake';
    else if (Math.abs(this.vx) > this.stats.walk * 1.05) a = 'run';
    else if (Math.abs(this.vx) > 12) a = 'walk';
    else a = this.idleT > 3 ? 'fidget' : 'idle';
    if (a === 'idle' || a === 'fidget') this.idleT += dt; else this.idleT = 0;
    if (a !== this.anim) { this.anim = a; this.animT = 0; }
    this.animT += dt;
    const A = HERO_ANIMS[a];
    let fps = A.fps;
    if (a === 'walk' || a === 'run') fps *= Math.max(0.6, Math.abs(this.vx) / this.stats.walk);
    this.frame = (a === 'fidget' && this.animT * fps >= A.frames) ? A.frames - 1 : Math.floor(this.animT * fps) % A.frames;
    if (a === 'fidget' && this.idleT > 6) this.idleT = 0;
  }

  draw(ctx, alpha) {
    const x = this.px + (this.x - this.px) * alpha, y = this.py + (this.y - this.py) * alpha;
    const name = heroSpriteName(this.id, this.anim, this.weaponId);
    // 残像
    for (const t of this.trail) {
      drawSprite(ctx, heroSpriteName(this.id, t.anim, this.weaponId), t.frame, t.x + this.w / 2, t.y + this.h, { flip: t.face < 0, alpha: t.life * 1.6 * 0.5 });
    }
    // 足元の影
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(x + this.w / 2, this.shadowY ?? (y + this.h), 13 * (this.onGround ? 1 : 0.7), 4, 0, 0, 6.2832); ctx.fill();
    if (this.invuln > 0 && !this.dead && ((this.invuln * 16) | 0) % 2 === 0) return;
    const fx = x + this.w / 2, fy = y + this.h;   // スプライトの基準点(oy=54)が足元。当たり箱の下端に合わせる
    // 装備した武器があれば、手に武器・首に武器の色の布を重ねる（art/heroGear.js）
    drawHeroDressed(ctx, this.id, hasSprite(`hero_${this.id}_${this.anim}`) ? this.anim : 'idle', this.frame || 0, fx, fy, { flip: this.face < 0, sx: this.sx, sy: this.sy, weaponId: this.weaponId, time: this.world.time, vx: this.vx });
    if (this.star > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(this.world.time * 30);
      drawSprite(ctx, hasSprite(name) ? name : `hero_${this.id}_idle`, this.frame || 0, fx, fy, { flip: this.face < 0, sx: this.sx * 1.08, sy: this.sy * 1.08 });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // 溜め表示
    if (this.charge > 0.25 && this.ability.charged) {
      const c = Math.min(1, this.charge / 0.6);
      ctx.strokeStyle = c >= 1 ? '#bfff6a' : 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + this.w / 2, y + this.h / 2, 26 + Math.sin(this.world.time * 20) * 2, -Math.PI / 2, -Math.PI / 2 + c * Math.PI * 2); ctx.stroke();
    }
  }
}

function approach(v, target, d) { return v < target ? Math.min(v + d, target) : Math.max(v - d, target); }
