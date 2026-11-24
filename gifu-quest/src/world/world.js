import { TILE, PHYS, RUNTIME } from '../core/config.js';
import { events } from '../core/events.js';
import { audio } from '../core/audio.js';
import { input } from '../core/input.js';
import { Level } from './level.js';
import { T, isBreakable } from './tiles.js';
import { Player } from '../actors/player.js';
import { entityClass } from '../actors/entity.js';
import { rectsOverlap } from './collision.js';
import { Camera } from '../gfx/camera.js';
import { Particles } from '../gfx/particles.js';
import { TileMap } from '../gfx/tilemap.js';
import { drawTile } from '../art/tiles.js';
import { createBackdrop } from '../art/backdrops.js';
import { createEnv } from '../systems/env.js';
import { Lighting } from '../gfx/lighting.js';
import { drawPostFx } from '../gfx/postfx.js';

// ステージ1つ分の実行時の世界。シーン（scenes/stage.js）が持つ。API は docs/ARCHITECTURE.md
export class World {
  constructor(levelData, charId, opts = {}) {
    this.events = events;
    this.level = new Level(levelData);
    this.data = levelData;
    this.theme = levelData.theme || 'kinka';
    this.charId = charId;
    this.weapon = opts.weapon || null;   // { id, lv }（福引きの武器）
    this._regenBase = 0;
    this.time = 0; this.tick = 0;
    this.timeScale = 1; this.slowT = 0; this.hitstopT = 0;
    this.entities = []; this.platforms = []; this.lights = []; this.liquids = [];
    this.particles = new Particles();
    this.camera = new Camera();
    this.tilemap = new TileMap(this.level, this.theme);
    this.backdrop = createBackdrop(this.theme, levelData);
    this.env = createEnv(this, levelData);
    this.lighting = new Lighting();
    this.stats = { coins: 0, sarubobo: [false, false, false], hits: 0, misses: 0, time: 0, enemies: 0, signs: [] };
    this.boss = null;
    this.state = 'play';   // play | respawn | down | clear
    this.stateT = 0;
    this.dialogue = null;
    this.fakeTiles = [];
    this.checkpoint = null;
    this.result = null;     // 'clear' | 'gameover' になったらシーンが拾う

    const L = this.level;
    for (let ty = 0; ty < L.h; ty++) for (let tx = 0; tx < L.w; tx++) if (L.get(tx, ty) === T.FAKE) this.fakeTiles.push([tx, ty]);

    // エンティティ生成
    let start = null;
    for (const spec of L.entities) {
      if (spec.type === 'start') { start = spec; continue; }
      const C = entityClass(spec.type);
      if (!C) { console.warn('unknown entity', spec.type); continue; }
      this.spawn(new C(this, spec));
    }
    start = start || { x: 2, y: L.h - 3 };
    if (opts.checkpoint != null) {
      const cp = this.entities.find((e) => e.type === 'checkpoint' && e.spec.index === opts.checkpoint);
      if (cp) { start = { x: cp.spec.x, y: cp.spec.y }; cp.activate?.(true); }
    }
    this.startPos = start;
    this.player = new Player(this, charId, start.x * TILE + TILE / 2 - 12, (start.y + 1) * TILE - 44);
    if (opts.hearts) this.player.hearts = Math.min(opts.hearts, this.player.maxHearts);
    this.camera.vw = opts.viewW || 960; this.camera.vh = opts.viewH || 540;
    this.camera.bounds = { x: 0, y: 0, w: L.pxW, h: L.pxH };
    this.camera.snapTo(this.player.cx, this.player.y + this.player.h);
    this._unsub = [];
  }

  // ---- 世界への操作（エンティティ・システムから呼ぶ） ----
  spawn(e) { this.entities.push(e); if (e.platform) this.platforms.push(e); if (e.init) e.init(); return e; }
  sfx(name, opts) { audio.sfx(name, opts); }
  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); }
  slowmo(scale, dur) { this.timeScale = scale; this.slowT = dur; }
  addCoins(n, x, y) {
    this.stats.coins += n;
    if (this.stats.coins % 100 === 0) { this.player.heal(1); this.sfx('heart'); }
    events.emit('coin', { n, total: this.stats.coins });
  }
  collectSarubobo(i) { this.stats.sarubobo[i] = true; events.emit('sarubobo', { index: i }); }
  setCheckpoint(cp) {
    this.checkpoint = cp;
    this.player.hearts = this.player.maxHearts;   // 中間地点でハートを回復
    this.player.guardLeft = this.player.wfx.guard;  // 武器の守りも戻る
    events.emit('checkpoint', { index: cp.spec.index });
  }
  breakTile(tx, ty) {
    const t = this.level.get(tx, ty);
    this.level.set(tx, ty, T.EMPTY);
    this.particles.debris(tx * TILE + TILE / 2, ty * TILE + TILE / 2, t === T.CRACK ? '#8a8378' : '#b0603e');
    this.sfx('break');
    this.camera.shake(3, 0.12);
    events.emit('tileBroken', { tx, ty, t });
  }
  bumpTile(tx, ty) {
    this.particles.burst(tx * TILE + TILE / 2, (ty + 1) * TILE, 4, { angle: Math.PI / 2, spread: 1.4, speed: 80, life: 0.3, size: 3, size1: 0, color: '#d8c8a8' });
    events.emit('tileBumped', { tx, ty });
  }
  lockCamera(rect) { this.camera.lock = rect; }
  unlockCamera() { this.camera.lock = null; }
  setBoss(b) { this.boss = b; events.emit('bossStart', { boss: b }); }
  // ボス撃破：スロー → 爆発 → 宝珠が出る（ボス担当が演出の後に呼ぶ）
  bossDefeated(b) {
    this.boss = null;
    const C = entityClass('orb');
    if (C) this.spawn(new C(this, { type: 'orb', x: (b.cx / TILE) - 0.5, y: Math.floor((b.cy) / TILE), drop: true }));
    events.emit('bossDefeated', { boss: b });
  }
  onEnemyHit(e, dmg) {
    this.particles.hit(e.cx, e.cy);
    this.hitstop(0.05);
    this.sfx(e.alive ? 'hit' : 'defeat');
    if (!e.alive) { this.stats.enemies++; }
  }
  showDialogue(title, text) { this.dialogue = { title, text, t: 0 }; this.sfx('sign'); events.emit('dialogue', this.dialogue); }
  inLiquid(rect, kind) {
    for (const q of this.liquids) {
      if (q.kind !== kind) continue;
      if (rect.x + rect.w > q.x0 && rect.x < q.x1 && rect.y + rect.h * (kind === 'water' ? 0.55 : 0.7) > q.y) return true;
    }
    return false;
  }
  stageClear() {
    if (this.state === 'clear') return;
    this.state = 'clear'; this.stateT = 0;
    this.player.winning = true;
    this.sfx('clear');
    events.emit('stageClear', {});
  }
  playerMiss(kind) {
    if (this.state !== 'play') return;
    const p = this.player;
    this.stats.misses++;
    p.hearts -= 1;
    this.sfx('miss');
    this.camera.shake(6, 0.25);
    if (kind === 'lava') this.particles.burst(p.cx, p.cy, 16, { speed: 200, life: 0.6, size: 6, size1: 0, color: '#ff7a2a', add: true, grav: -200 });
    if (p.hearts <= 0) { p.hearts = 0; this.playerDown(); return; }
    this.state = 'respawn'; this.stateT = 0; p.frozen = true;
  }
  playerDown() {
    if (this.state === 'down') return;
    this.state = 'down'; this.stateT = 0;
    this.player.dead = true; this.player.vy = -500; this.player.vx = 0;
    this.slowmo(0.4, 0.6);
    this.sfx('down');
    events.emit('playerDown', {});
  }
  respawn() {
    const p = this.player;
    p.guardLeft = p.wfx.guard;
    const cp = this.checkpoint ? this.checkpoint.spec : this.startPos;
    p.x = cp.x * TILE + TILE / 2 - p.w / 2; p.y = (cp.y + 1) * TILE - p.h; p.px = p.x; p.py = p.y;
    p.vx = p.vy = 0; p.frozen = false; p.invuln = 1.5; p.onGround = false; p.dashT = 0;
    this.camera.snapTo(p.cx, p.y + p.h);
    if (this.boss && this.boss.reset) this.boss.reset();
    events.emit('respawn', {});
  }

  activeRange() { const c = this.camera; return { x0: c.x - c.vw, x1: c.x + c.vw * 2 }; }

  // ---- 更新 ----
  update(dt) {
    this.tick++;
    if (this.dialogue) { this.dialogue.t += dt; return; }   // 看板を読んでいる間は止める
    if (this.hitstopT > 0) { this.hitstopT -= dt; this.particles.update(dt * 0.2); return; }
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.timeScale = 1; }
    dt *= this.timeScale;
    this.time += dt;
    if (this.state === 'play') this.stats.time += dt;
    this.stateT += dt;
    this.env.update(dt);

    const R = this.activeRange();
    // 1. 動く床
    for (const e of this.platforms) {
      if (!e.alive) continue;
      if (!e.persistent && (e.x + e.w < R.x0 || e.x > R.x1)) { e.dx = e.dy = 0; continue; }
      e.preUpdate(); e.update(dt); e.dx = e.x - e.px; e.dy = e.y - e.py;
    }
    // 2. 主人公
    const p = this.player;
    p.update(dt);
    // 3. その他
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (!e.alive || e.platform) continue;
      if (!e.persistent && (e.x + e.w < R.x0 || e.x > R.x1)) continue;
      e.preUpdate(); e.update(dt);
    }
    // 4. ぶつかり
    if (this.state === 'play') this.interact();
    // 武器の効果：決まった数の敵を倒すごとにハート回復
    const rg = p.wfx.regen;
    if (rg && this.stats.enemies - this._regenBase >= rg) { this._regenBase += rg; if (p.hearts < p.maxHearts) { p.heal(1); this.sfx('heart'); this.particles.burst(p.cx, p.y, 8, { speed: 120, life: 0.5, size: 5, size1: 0, color: '#ff7fa0', front: true }); } }
    // 5. 片付け
    if (this.tick % 30 === 0 || this.entities.length > 400) {
      this.entities = this.entities.filter((e) => e.alive);
      this.platforms = this.platforms.filter((e) => e.alive);
    }
    // 6. 状態
    if (this.state === 'respawn' && this.stateT > 0.9) { this.state = 'play'; this.respawn(); }
    if (this.state === 'down') { p.vy += 1600 * dt; p.y += p.vy * dt; if (this.stateT > 2.0) this.result = 'gameover'; }
    if (this.state === 'clear' && this.stateT > 2.6) this.result = 'clear';

    const area = this.level.areaAt(Math.floor(p.cx / TILE));
    this.camera.update(dt, p, area && area.tall);
    this.particles.update(dt);
  }

  interact() {
    const p = this.player;
    const pr = p.hurtRect();
    for (const e of this.entities) {
      if (!e.alive) continue;
      if (e.pickup) { if (rectsOverlap(p, e)) e.onTouch(p); continue; }
      if (e.hazard) { if (rectsOverlap(pr, e)) { if (p.star > 0 || p.dashT > 0) { e.cancel ? e.cancel() : e.remove(); } else if (p.hurt(e, e.touchDamage)) { if (e.onHitPlayer) e.onHitPlayer(p); } } continue; }
      if (!e.enemy) continue;
      const er = e.hurtRect();
      if (!rectsOverlap(pr, er) && !rectsOverlap(p, er)) continue;
      // 無敵（飛騨牛串）・雪けむりダッシュ中は体当たりで倒す
      if (p.star > 0 || p.dashT > 0) {
        if (e.invuln <= 0) {
          const dmg = p.star > 0 ? 99 : 1 * p.stats.power;
          if (e.damage(dmg, p)) this.onEnemyHit(e, dmg);
        }
        continue;
      }
      // 踏みつけ：落下中で、前のフレームの足元が敵の上端＋12より上
      const stompOk = e.stompable && p.vy > 0 && p.prevBottom <= er.y + PHYS.stompMargin + (e.vy < 0 ? -e.vy / 120 : 0);
      if (stompOk) {
        const dmg = (p.has('heavyStomp') ? 2 : 1) + (p.wfx ? p.wfx.stomp : 0);
        p.y = er.y - p.h;
        const hold = input.held.jump;
        p.vy = -(hold ? PHYS.stompBounceHold : PHYS.stompBounceRelease);
        p.jumpHeldFromJump = true; p.airJumps = p.has('doubleJump') ? 1 : 0; p.dashUsed = false;
        p.sx = 1.25; p.sy = 0.8;
        this.stompChain = (p.onGroundSinceStomp === false ? (this.stompChain || 0) + 1 : 1);
        p.onGroundSinceStomp = false;
        e.onStomp(p, dmg);
        this.particles.stomp(p.cx, er.y);
        this.hitstop(0.05);
        this.camera.shake(3, 0.1);
        this.sfx('stomp', { chain: this.stompChain });
        const pts = Math.min(8, 2 ** (this.stompChain - 1));
        events.emit('stomp', { chain: this.stompChain, points: pts, x: p.cx, y: er.y });
        if (!e.alive) this.stats.enemies++;
      } else if (e.touchDamage > 0) {
        p.hurt(e, e.touchDamage);
      }
    }
    if (p.onGround) p.onGroundSinceStomp = true;
    // カメラ固定ゾーン（隠し部屋）
  }

  // ---- 描画 ----
  draw(ctx, alpha, vw, vh) {
    this.camera.vw = vw; this.camera.vh = vh;
    const cam = this.camera.view(alpha);
    this.backdrop.draw(ctx, cam.x, cam.y, vw, vh, this.env, this.time);
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    this.lights.length = 0;
    const x0 = cam.x - 80, x1 = cam.x + vw + 80, y0 = cam.y - 80, y1 = cam.y + vh + 80;
    // 後ろのエンティティ（z<0：背景の小物など）
    const list = this._drawList || (this._drawList = []);
    list.length = 0;
    for (const e of this.entities) if (e.alive && e.x + e.w > x0 - (e.drawPad || 0) && e.x < x1 + (e.drawPad || 0) && e.y + e.h > y0 - (e.drawPad || 0) && e.y < y1 + (e.drawPad || 0)) list.push(e);
    list.sort((a, b) => a.z - b.z);
    let i = 0;
    for (; i < list.length && list[i].z < 0; i++) list[i].draw(ctx, alpha);
    this.tilemap.draw(ctx, cam.x, cam.y, vw, vh);
    this.particles.draw(ctx, false);
    for (; i < list.length && list[i].z < 10; i++) list[i].draw(ctx, alpha);
    this.player.draw(ctx, alpha);
    for (; i < list.length; i++) list[i].draw(ctx, alpha);
    this.drawFake(ctx, cam, vw, vh);
    this.particles.draw(ctx, true);
    if (RUNTIME.debug) this.drawDebug(ctx);
    ctx.restore();
    this.backdrop.drawFront && this.backdrop.drawFront(ctx, cam.x, cam.y, vw, vh, this.env, this.time);
    this.env.drawFront(ctx, cam, vw, vh);
    this.lighting.draw(ctx, this, cam, vw, vh);
    drawPostFx(ctx, this.env, vw, vh);
  }
  drawFake(ctx, cam, vw, vh) {
    if (!this.fakeTiles.length) return;
    const p = this.player;
    const ptx = Math.floor(p.cx / TILE), pty = Math.floor(p.cy / TILE);
    let inside = false;
    for (const [tx, ty] of this.fakeTiles) if (Math.abs(tx - ptx) <= 1 && Math.abs(ty - pty) <= 1) { inside = true; break; }
    this.fakeAlpha = this.fakeAlpha ?? 1;
    this.fakeAlpha += ((inside ? 0.25 : 1) - this.fakeAlpha) * 0.15;
    ctx.globalAlpha = this.fakeAlpha;
    for (const [tx, ty] of this.fakeTiles) {
      const x = tx * TILE, y = ty * TILE;
      if (x + TILE < cam.x || x > cam.x + vw || y + TILE < cam.y || y > cam.y + vh) continue;
      ctx.save(); ctx.translate(x, y); drawTile(ctx, T.FAKE, tx, ty, this.level, this.theme); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  drawDebug(ctx) {
    ctx.strokeStyle = '#0f0'; ctx.lineWidth = 1;
    const p = this.player; ctx.strokeRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = '#f00';
    for (const e of this.entities) if (e.alive && (e.enemy || e.hazard)) { const r = e.hurtRect(); ctx.strokeRect(r.x, r.y, r.w, r.h); }
    ctx.strokeStyle = '#0ff';
    for (const e of this.platforms) if (e.alive) ctx.strokeRect(e.x, e.y, e.w, e.h);
  }
}
