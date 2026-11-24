// 担当：敵・仕掛け。動く床（ARCHITECTURE「仕掛けの配置名」）
// platform=true の Entity は World が dx,dy を計算し、乗った主人公（player.platform）を運ぶ。
// 置き方：x,y は床の「左端のタイル」と「床の上面がくる行」（床の上面＝タイル y の上端）。w はタイル数
import { Entity, registerEntity } from '../actors/entity.js';
import { TILE } from '../core/config.js';
import { drawSprite } from '../gfx/atlas.js';
import { isSolid } from './tiles.js';

const THICK = 18;   // 床の厚み（当たりは上面だけ）

class PlatformBase extends Entity {
  constructor(w, s, wTiles, kind) {
    super(w, s);
    this.platform = true; this.oneWay = true; this.dropable = true;
    this.tilesW = Math.max(1, s.w ?? wTiles);
    this.w = this.tilesW * TILE; this.h = THICK;
    this.x = s.x * TILE; this.y = s.y * TILE;
    this.px = this.x; this.py = this.y;
    this.home = { x: this.x, y: this.y };
    this.kind = s.kind || kind;
    this.sprName = 'gim_plat_' + this.kind;
    this.z = -1;
  }
  riding() { const p = this.world.player; return p.platform === this && p.onGround; }
  // 板を左端・中・右端のコマで並べる（gim_plat_<kind>：0=左 1=中 2=右）
  drawPlanks(ctx, x, y, name, alpha) {
    const n = this.tilesW;
    const o = alpha !== undefined && alpha < 1 ? (this._ao || (this._ao = { alpha: 1 })) : null;
    if (o) o.alpha = alpha;
    for (let i = 0; i < n; i++) drawSprite(ctx, name, n === 1 ? 1 : i === 0 ? 0 : i === n - 1 ? 2 : 1, x + i * TILE, y, o);
  }
}

// ---- 往復する床：w, dx, dy（往復の距離・タイル）, speed（タイル/秒）, kind（wood/stone/cloud/ice）, phase(0..1) ----
class MovingPlatform extends PlatformBase {
  constructor(w, s) {
    super(w, s, 3, 'wood');
    this.ex = (s.dx ?? 0) * TILE; this.ey = (s.dy ?? 0) * TILE;
    if (!this.ex && !this.ey) this.ex = 4 * TILE;
    const len = Math.hypot(this.ex, this.ey);
    this.period = (2 * len) / ((s.speed ?? 2) * TILE);
    this.t = (s.phase ?? 0) * this.period;
    this.persistent = true;   // 画面外でも動いて、位相がずれない
    this.drawPad = len;
  }
  update(dt) {
    this.t += dt;
    const u = (1 - Math.cos((this.t / this.period) * Math.PI * 2)) / 2;   // 端でゆっくり折り返す
    this.x = this.home.x + this.ex * u; this.y = this.home.y + this.ey * u;
  }
  draw(ctx, a) {
    const x = this.ix(a), y = this.iy(a);
    this.drawPlanks(ctx, x, y, this.sprName);
    if (this.kind === 'cloud' && this.world.tick % 20 === 0) this.world.particles.spawn({ x: x + Math.random() * this.w, y: y + 14, vy: 10, life: 0.8, size: 5, size1: 0, color: 'rgba(255,255,255,0.6)' });
  }
}
registerEntity('movingPlatform', MovingPlatform);

// ---- 乗って0.5秒で落ちる床：w, kind（wood/rock）。3秒で復活 ----
class FallingPlatform extends PlatformBase {
  constructor(w, s) { super(w, s, 2, 'rock'); this.state = 'idle'; this.timer = 0; this.shakeX = 0; this.fade = 1; }
  update(dt) {
    const w = this.world;
    this.shakeX = 0;
    if (this.state === 'idle') {
      if (this.riding()) { this.state = 'shake'; this.timer = this.spec.delay ?? 0.5; w.sfx('bump', { vol: 0.3 }); }
    } else if (this.state === 'shake') {
      this.timer -= dt;
      this.shakeX = ((w.tick >> 1) & 1) ? 1.5 : -1.5;
      if (w.tick % 6 === 0) w.particles.spawn({ x: this.x + Math.random() * this.w, y: this.y + THICK, vy: 60, life: 0.5, size: 3, size1: 1, color: '#8a7060', grav: 600 });
      if (this.timer <= 0) { this.state = 'fall'; this.vy = 0; this.timer = 3; w.particles.debris(this.cx, this.y + 8, this.kind === 'rock' ? '#7a6656' : '#9a6b3c'); }
    } else if (this.state === 'fall') {
      this.vy = Math.min(this.vy + 1500 * dt, 700); this.y += this.vy * dt; this.timer -= dt;
      if (this.timer <= 0) { this.state = 'gone'; this.timer = 0.01; }
    } else if (this.state === 'gone') {
      // 主人公が重なっていなければ元の場所に戻る
      const p = w.player;
      const over = p.x + p.w > this.home.x && p.x < this.home.x + this.w && p.y + p.h > this.home.y - 4 && p.y < this.home.y + THICK;
      if (!over) { this.x = this.home.x; this.y = this.home.y; this.px = this.x; this.py = this.y; this.vy = 0; this.state = 'idle'; this.fade = 0; }
    }
    if (this.fade < 1) this.fade = Math.min(1, this.fade + dt * 3);
  }
  draw(ctx, a) {
    if (this.state === 'gone') return;
    this.drawPlanks(ctx, this.ix(a) + this.shakeX, this.iy(a), this.sprName, this.fade);
  }
}
registerEntity('fallingPlatform', FallingPlatform);

// ---- 乗ると終点まで運ぶ床の共通部分（ゴンドラ・鵜飼船・祭り屋台）----
// 乗ると動き出し、終点で止まる。誰も乗らずに主人公が始点側へ戻ったら（ミスで戻された時など）始点へ帰る
class Rider extends PlatformBase {
  constructor(w, s, wTiles, kind) {
    super(w, s, wTiles, kind);
    this.persistent = true;
    this.state = 'wait';
    this.idle = 0;
    this.speedPx = (s.speed ?? 2) * TILE;
  }
  setRoute(x2, y2) {
    this.sx0 = this.home.x; this.sy0 = this.home.y;
    this.sx1 = x2; this.sy1 = y2;
    this.len = Math.max(1, Math.hypot(x2 - this.sx0, y2 - this.sy0));
    this.u = 0;
    this.drawPad = this.len + 200;
  }
  update(dt) {
    this.t += dt;
    const p = this.world.player;
    const on = this.riding();
    if (this.state === 'wait' && on) { this.state = 'go'; this.onStart && this.onStart(); }
    if (this.state === 'go') {
      // 動き出しと止まりぎわはゆっくり
      const ease = Math.min(1, 0.25 + Math.min(this.u, 1 - this.u) * this.len / (TILE * 1.5));
      this.u = Math.min(1, this.u + (this.speedPx * ease / this.len) * dt);
      if (this.u >= 1) { this.state = 'end'; this.onArrive && this.onArrive(); }
    } else if (this.state === 'end' || this.state === 'back') {
      this.idle = on ? 0 : this.idle + dt;
      const nearStart = Math.abs(p.cx - (this.sx0 + this.w / 2)) < Math.abs(p.cx - (this.sx1 + this.w / 2)) - 4 * TILE;
      if (this.state === 'end' && this.idle > 2 && nearStart) this.state = 'back';
      if (this.state === 'back') {
        this.u = Math.max(0, this.u - (this.speedPx * 1.5 / this.len) * dt);
        if (this.u <= 0) this.state = 'wait';
        if (on) this.state = 'go';
      }
    }
    this.x = this.sx0 + (this.sx1 - this.sx0) * this.u;
    this.y = this.sy0 + (this.sy1 - this.sy0) * this.u + (this.bob ? this.bob() : 0);
  }
}

// ---- ロープウェイ：x2, y2（終点。床の左端タイルと上面の行）, speed。ケーブルも描く ----
class Gondola extends Rider {
  constructor(w, s) {
    super(w, s, 3, 'gondola');
    this.tilesW = 3; this.w = 3 * TILE;
    this.setRoute((s.x2 ?? s.x + 10) * TILE, (s.y2 ?? s.y - 4) * TILE);
    this.oneWay = true; this.dropable = false;
    this.swing = 0; this.swingV = 0;
    this.hang = 78;   // 床からケーブルまでの高さ
  }
  onStart() { this.world.sfx('confirm', { vol: 0.3 }); this.swingV = 0.6; }
  onArrive() { this.swingV -= 0.8; this.world.sfx('land', { vol: 0.4 }); }
  update(dt) {
    super.update(dt);
    // 吊り下げの揺れ（見た目だけ）
    this.swingV += (-this.swing * 30 - this.swingV * 2.5) * dt;
    this.swing += this.swingV * dt;
  }
  draw(ctx, a) {
    const x = this.ix(a), y = this.iy(a);
    // ケーブル：始点の先と終点の先まで伸ばす
    const ax = this.sx0 + this.w / 2, ay = this.sy0 - this.hang, bx = this.sx1 + this.w / 2, by = this.sy1 - this.hang;
    const dx = (bx - ax) / this.len, dy = (by - ay) / this.len;
    const ext = 260;
    ctx.strokeStyle = '#2a2a30'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(ax - dx * ext, ay - dy * ext); ctx.lineTo(bx + dx * ext, by + dy * ext); ctx.stroke();
    ctx.strokeStyle = '#4a4a55'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ax - dx * ext, ay - dy * ext - 6); ctx.lineTo(bx + dx * ext, by + dy * ext - 6); ctx.stroke();
    // 支柱（始点・終点）
    drawSprite(ctx, 'gim_ropeway_tower', 0, ax - dx * 150, ay - dy * 150 + 300);
    drawSprite(ctx, 'gim_ropeway_tower', 0, bx + dx * 150, by + dy * 150 + 300);
    // 滑車とゴンドラ本体（揺れ）
    const cx = x + this.w / 2, top = y - this.hang;
    const o = this._go || (this._go = { rot: 0 });
    o.rot = this.swing * 0.05;
    drawSprite(ctx, 'gim_gondola', 0, cx, top, o);
  }
}
registerEntity('gondola', Gondola);

// ---- 鵜飼船：w, x2（終点の左端タイル）, speed。乗ると川を下る。舳先に篝火 ----
class Boat extends Rider {
  constructor(w, s) {
    super(w, s, 5, 'boat');
    this.setRoute((s.x2 ?? s.x + 30) * TILE, this.home.y);
    this.z = 1;   // 水のタイルより手前
    this.speedPx = (s.speed ?? 2.2) * TILE;
  }
  bob() { return Math.sin(this.t * 2.2) * 2.5; }
  onStart() { this.world.sfx('splash', { vol: 0.4 }); }
  update(dt) {
    super.update(dt);
    const w = this.world;
    if (this.state === 'go' && w.tick % 6 === 0) w.particles.spawn({ x: this.x - 4, y: this.y + 24, vx: -40, vy: -10, life: 0.6, size: 3, size1: 7, color: 'rgba(230,245,255,0.7)', shape: 'ring' });
  }
  draw(ctx, a) {
    const x = this.ix(a), y = this.iy(a), w = this.world;
    const n = this.tilesW;
    for (let i = 0; i < n; i++) drawSprite(ctx, 'gim_boat', i === 0 ? 0 : i === n - 1 ? 2 : 1, x + i * TILE, y);
    // 舳先の篝火（右端）と、艫の船頭の竿
    const fx = x + this.w - 22, fy = y;
    drawSprite(ctx, 'gim_kagaribi', (w.time * 12) | 0, fx, fy);
    w.lights.push({ x: fx, y: fy - 50, r: 170, color: '#ffb050', a: 1, flicker: 0.15 });
    if (w.tick % 5 === 0) w.particles.spawn({ x: fx + (Math.random() - 0.5) * 8, y: fy - 58, vx: (Math.random() - 0.5) * 30, vy: -70, life: 0.7, size: 2.5, size1: 0, color: '#ffcf6a', add: true });
    // 水面への映り込み
    ctx.globalAlpha = 0.25 + 0.1 * Math.sin(w.time * 6);
    ctx.fillStyle = '#ffb050';
    ctx.fillRect(fx - 6, fy + 30, 12, 3); ctx.fillRect(fx - 10, fy + 38, 20, 2);
    ctx.globalAlpha = 1;
  }
}
registerEntity('boat', Boat);

// ---- 祭り屋台：w, x2, speed。乗って進む大きな床（車輪が回る。提灯の明かり）----
class FestivalFloat extends Rider {
  constructor(w, s) {
    super(w, s, 4, 'float');
    this.setRoute((s.x2 ?? s.x + 20) * TILE, this.home.y);
    this.speedPx = (s.speed ?? 1.8) * TILE;
    this.z = -2;
  }
  bob() { return this.state === 'go' ? Math.abs(Math.sin(this.t * 5)) * -1.2 : 0; }
  draw(ctx, a) {
    const x = this.ix(a), y = this.iy(a), w = this.world, n = this.tilesW;
    // 屋根と柱（主人公の後ろ）
    const cx = x + this.w / 2;
    drawSprite(ctx, 'gim_float_roof', 0, cx, y);
    // 台
    for (let i = 0; i < n; i++) drawSprite(ctx, 'gim_float_base', i === 0 ? 0 : i === n - 1 ? 2 : 1, x + i * TILE, y);
    // 車輪
    const rot = (this.x - this.home.x) / 15;
    const o = this._wo || (this._wo = { rot: 0 });
    o.rot = rot;
    drawSprite(ctx, 'gim_wheel', 0, x + 22, y + 46, o);
    drawSprite(ctx, 'gim_wheel', 0, x + this.w - 22, y + 46, o);
    // 提灯の明かり
    const ly = y - 72;
    for (let i = 0; i < 2; i++) {
      const lx = x + 14 + i * (this.w - 28);
      w.lights.push({ x: lx, y: ly, r: 90, color: '#ffb560', a: 0.9, flicker: 0.08 });
    }
  }
}
registerEntity('festivalFloat', FestivalFloat);

// ---- 太鼓に合わせて出たり消えたりする足場：w, beat（0/1）, bpm（既定100）, beats（切り替えまでの拍。既定4）----
// 消える1拍前から点滅。消えている間はうすい輪郭だけ見せる
class RhythmPlatform extends PlatformBase {
  constructor(w, s) {
    super(w, s, 2, 'rhythm');
    this.beat = s.beat ? 1 : 0;
    this.spb = 60 / (s.bpm ?? 100);
    this.beats = s.beats ?? 4;
    this.fullW = this.w;
    this.on = true; this.pulse = 0; this.lastBeat = -1;
    this.persistent = true;
  }
  update(dt) {
    const w = this.world;
    const b = w.time / this.spb;              // 全部の足場が同じ拍で動く
    const bi = Math.floor(b);
    const phase = Math.floor(bi / this.beats) % 2;
    this.on = phase === this.beat;
    this.inBeat = bi % this.beats;            // 0..beats-1
    this.frac = b - bi;
    if (bi !== this.lastBeat) { this.lastBeat = bi; if (this.on) this.pulse = 1; }
    this.pulse = Math.max(0, this.pulse - dt * 6);
    // 消えている間は当たりなし（幅0）
    this.w = this.on ? this.fullW : 0;
    if (!this.on && this.world.player.platform === this) this.world.player.platform = null;
  }
  draw(ctx, a) {
    const x = this.x, y = this.y, w = this.world;
    if (this.on) {
      const warn = this.inBeat === this.beats - 1;   // 最後の1拍：点滅
      const alpha = warn && ((this.frac * 8) | 0) % 2 === 0 ? 0.45 : 1;
      this.drawPlanks(ctx, x, y - this.pulse * 3, 'gim_plat_rhythm', alpha);
    } else {
      const soon = this.inBeat === this.beats - 1;   // 出る1拍前：輪郭が濃くなる
      this.drawPlanks(ctx, x, y, 'gim_plat_rhythm', soon ? 0.4 + 0.2 * Math.sin(w.time * 30) : 0.16);
    }
  }
}
registerEntity('rhythmPlatform', RhythmPlatform);

// ---- 提灯の綱渡り：w（タイル）。乗るとたわむ通り抜け足場。両端に柱 ----
class Tightrope extends PlatformBase {
  constructor(w, s) {
    super(w, s, 6, 'rope');
    this.h = 8; this.sag = 0; this.ux = 0.5; this.z = -1;
    this.lanterns = Math.max(1, Math.floor(this.tilesW / 2));
  }
  update(dt) {
    const p = this.world.player;
    const on = this.riding();
    if (on) this.ux = Math.max(0.05, Math.min(0.95, (p.cx - this.home.x) / this.w));
    const target = on ? 16 * Math.sin(Math.PI * this.ux) : 0;
    this.sag += (target - this.sag) * Math.min(1, dt * 10);
    this.y = this.home.y + this.sag;
  }
  draw(ctx, a) {
    const w = this.world, x0 = this.home.x, y0 = this.home.y, x1 = x0 + this.w;
    const mx = x0 + this.w * this.ux, my = this.iy(a);
    drawSprite(ctx, 'gim_post', 0, x0 - 4, y0 + 70);
    drawSprite(ctx, 'gim_post', 0, x1 + 4, y0 + 70);
    // たわむ綱：2本の2次曲線
    ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x0, y0 + 2);
    ctx.quadraticCurveTo((x0 + mx) / 2, my + 2 + (my - y0) * 0.1, mx, my + 2);
    ctx.quadraticCurveTo((mx + x1) / 2, my + 2 + (my - y0) * 0.1, x1, y0 + 2);
    ctx.stroke();
    ctx.strokeStyle = '#c89a62'; ctx.lineWidth = 1;
    ctx.stroke();
    // 綱からさがる提灯
    const n = this.lanterns;
    for (let i = 0; i < n; i++) {
      const u = (i + 1) / (n + 1);
      const lx = x0 + this.w * u;
      const d = Math.abs(u - this.ux);
      const ly = y0 + (my - y0) * Math.max(0, 1 - d * 2.2) + 4;
      const o = this._lo || (this._lo = { rot: 0 });
      o.rot = Math.sin(w.time * 2 + i) * 0.08;
      drawSprite(ctx, 'gim_chochin', i % 2, lx, ly, o);
      w.lights.push({ x: lx, y: ly + 16, r: 70, color: '#ffb560', a: 0.85, flicker: 0.06 });
    }
  }
}
registerEntity('tightrope', Tightrope);

// ---- 跳ね台：power（1で約5タイル、ジャンプ押しっぱなしでもっと高く）, kind（taiko/kasa）----
// 置き方：足元中央をタイル (x,y) に（他の敵・アイテムと同じ）
class Bouncer extends Entity {
  constructor(w, s) {
    super(w, s);
    this.placeAt(s, 44, 22);
    this.pickup = true; this.kind = s.kind || 'taiko'; this.squish = 0; this.z = 1;
    this.power = s.power ?? 1;
    this.sprName = 'gim_bouncer_' + (this.kind === 'kasa' ? 'kasa' : 'taiko');
  }
  onTouch(p) {
    if (p.vy < 0 || p.prevBottom > this.y + 12) return;
    const w = this.world;
    p.y = this.y - p.h; p.vy = -840 * Math.sqrt(this.power);
    p.jumpHeldFromJump = true; p.onGround = false; p.dashUsed = false;
    if (p.has('doubleJump')) p.airJumps = 1;
    p.sx = 0.75; p.sy = 1.3;
    this.squish = 1;
    w.sfx('jump', { pitch: 1.5 });
    w.particles.burst(this.cx, this.y, 8, { speed: 160, life: 0.4, size: 5, size1: 0, color: this.kind === 'taiko' ? '#ffe56b' : '#ff9ab0', shape: 'star', drag: 3, front: true });
    w.particles.spawn({ x: this.cx, y: this.y + 4, life: 0.3, size: 8, size1: 50, color: 'rgba(255,255,255,0.8)', shape: 'ring', front: true });
  }
  update(dt) { this.squish = Math.max(0, this.squish - dt * 5); }
  draw(ctx, a) {
    const s = this.squish;
    const o = this._o || (this._o = { sx: 1, sy: 1 });
    o.sx = 1 + s * 0.15; o.sy = 1 - s * 0.25 + Math.sin(s * 9) * s * 0.1;
    drawSprite(ctx, this.sprName, s > 0.5 ? 1 : 0, this.cx, this.y + this.h, o);
  }
}
registerEntity('bouncer', Bouncer);

// ---- 自動スクロール：x0, x1（タイル）, speed（タイル/秒）。主人公が x0 を越えると画面が一定速度で右へ進む ----
// 画面の左端に押されて壁に挟まるとミス。x1 で終わる（鵜飼船の川下りと組み合わせる）
class AutoScroll extends Entity {
  constructor(w, s) {
    super(w, s);
    this.persistent = true;
    this.x0 = s.x0 * TILE; this.x1 = s.x1 * TILE;
    this.speedPx = (s.speed ?? 2) * TILE;
    this.x = this.x0; this.y = 0; this.w = 1; this.h = 1;
    this.state = 'wait'; this.misses = 0; this.rect = { x: 0, y: 0, w: 0, h: 0 };
  }
  update(dt) {
    const w = this.world, p = w.player, c = w.camera;
    if (w.stats.misses !== this.misses) { this.misses = w.stats.misses; if (this.state === 'run') { this.state = 'wait'; w.unlockCamera(); } }
    if (this.state === 'wait' && w.state === 'play' && p.cx > this.x0 && p.cx < this.x1) {
      this.state = 'run'; this.cam = c.x;
    }
    if (this.state !== 'run') return;
    this.cam = Math.min(this.cam + this.speedPx * dt, this.x1 - c.vw);
    const r = this.rect;
    r.x = this.cam; r.w = c.vw; r.h = c.vh;
    r.y = Math.max(0, Math.min(w.level.pxH - c.vh, p.y + p.h - c.vh * 0.68));
    w.lockCamera(r);
    // 左端に押される
    if (p.x < c.x + 2) {
      p.x = c.x + 2;
      const t = w.level.at(p.x + p.w + 1, p.y + p.h * 0.5);
      if (isSolid(t)) w.playerMiss('pit');
    }
    if (this.cam >= this.x1 - c.vw - 1 || p.cx > this.x1) { this.state = 'done'; w.unlockCamera(); }
  }
}
registerEntity('autoScroll', AutoScroll);

// ---- 提灯（吊り下げ・揺れる・夜に光る）：color（"red"/"white"）。置き方：吊り下げ点のタイル（上端）----
class Lantern extends Entity {
  constructor(w, s) {
    super(w, s);
    this.x = s.x * TILE + TILE / 2 - 10; this.y = s.y * TILE; this.w = 20; this.h = 30;
    this.frame = s.color === 'white' ? 1 : 0; this.z = -2; this.ph = s.x * 0.7;
    this.o = { rot: 0 };
  }
  draw(ctx, a) {
    const w = this.world;
    this.o.rot = Math.sin(w.time * 1.8 + this.ph) * 0.1 + (w.env.wind || 0) * 0.0006;
    drawSprite(ctx, 'gim_chochin', this.frame, this.cx, this.y, this.o);
    w.lights.push({ x: this.cx, y: this.y + 18, r: 100, color: '#ffb560', a: 0.95, flicker: 0.08 });
  }
}
registerEntity('lantern', Lantern);
