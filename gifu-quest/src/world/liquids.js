// 担当：敵・仕掛け。水位が変わる水域・水門・せり上がる溶岩（ARCHITECTURE「仕掛けの配置名」）
// world.liquids に { kind:'water'|'lava', x0, x1, y }（ドット）を登録すると、主人公が泳ぐ／ミスになる（World.inLiquid）
import { Entity, registerEntity } from '../actors/entity.js';
import { TILE } from '../core/config.js';
import { T } from './tiles.js';
import { drawSprite } from '../gfx/atlas.js';

const WAVE_STEP = 12;

// 水面・溶岩の表面の波線を描く（毎フレーム。配列を作らない）
function surfacePath(ctx, x0, x1, y, t, amp, freq) {
  ctx.moveTo(x0, y + Math.sin(x0 * freq + t) * amp);
  for (let x = x0 + WAVE_STEP; x < x1; x += WAVE_STEP) ctx.lineTo(x, y + Math.sin(x * freq + t) * amp + Math.sin(x * freq * 2.3 - t * 1.7) * amp * 0.4);
  ctx.lineTo(x1, y + Math.sin(x1 * freq + t) * amp);
}

// ---- 水位が変わる水域：id, x0, x1, yLow, yHigh（水面の行・タイル）, start（"low"/"high"）, speed（タイル/秒。既定0.8）----
// 水域のタイルは空（.）にしておく。水面より下が泳げる水になる
class WaterLevel extends Entity {
  constructor(w, s) {
    super(w, s);
    this.persistent = true; this.z = 11;
    const x0 = (s.x0 ?? s.x) * TILE, x1 = (s.x1 ?? s.x + 10) * TILE;
    this.yLow = (s.yLow ?? s.y) * TILE + 8; this.yHigh = (s.yHigh ?? s.y - 3) * TILE + 8;
    this.high = s.start === 'high';
    this.q = { kind: 'water', x0, x1, y: this.high ? this.yHigh : this.yLow };
    this.speedPx = (s.speed ?? 0.8) * TILE;
    this.x = x0; this.w = x1 - x0; this.y = this.q.y; this.h = 1;
    this.moving = 0;
  }
  init() { this.world.liquids.push(this.q); }
  toggle() { this.high = !this.high; this.moving = 1; this.world.sfx('splash'); this.world.camera.shake(2, 0.4); }
  update(dt) {
    const q = this.q, target = this.high ? this.yHigh : this.yLow;
    const d = target - q.y;
    const step = this.speedPx * dt;
    q.y = Math.abs(d) <= step ? target : q.y + Math.sign(d) * step;
    if (Math.abs(d) <= step) this.moving = 0;
    this.y = q.y; this.h = this.world.level.pxH - q.y;
    if (this.moving && this.world.tick % 6 === 0) {
      const x = q.x0 + Math.random() * (q.x1 - q.x0);
      this.world.particles.spawn({ x, y: q.y, vy: -40, life: 0.5, size: 3, size1: 7, color: 'rgba(230,245,255,0.8)', shape: 'ring' });
    }
  }
  draw(ctx, a) { drawWater(ctx, this.world, this.q, this.world.camera); }
}
registerEntity('waterLevel', WaterLevel);
function drawWater(ctx, w, q, cam) {
  const x0 = Math.max(q.x0, cam.x - 20), x1 = Math.min(q.x1, cam.x + cam.vw + 20);
  if (x1 <= x0) return;
  const bottom = Math.min(w.level.pxH, cam.y + cam.vh + 20);
  if (q.y > bottom) return;
  const t = w.time * 2.2;
  ctx.fillStyle = 'rgba(46,118,190,0.42)';
  ctx.beginPath(); surfacePath(ctx, x0, x1, q.y, t, 2.2, 0.035); ctx.lineTo(x1, bottom); ctx.lineTo(x0, bottom); ctx.closePath(); ctx.fill();
  // 少し下を濃く
  ctx.fillStyle = 'rgba(20,70,140,0.25)';
  ctx.fillRect(x0, q.y + 40, x1 - x0, Math.max(0, bottom - q.y - 40));
  // 水面のハイライト
  ctx.strokeStyle = 'rgba(225,245,255,0.85)'; ctx.lineWidth = 2;
  ctx.beginPath(); surfacePath(ctx, x0, x1, q.y, t, 2.2, 0.035); ctx.stroke();
  ctx.strokeStyle = 'rgba(200,235,255,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); surfacePath(ctx, x0, x1, q.y + 7, -t * 0.8, 1.5, 0.05); ctx.stroke();
}

// ---- 水位スイッチ：target（waterLevel の id）。踏む・技で叩くと水位と水門が切り替わる ----
// 置き方：足元中央をタイル (x,y) に
class WaterSwitch extends Entity {
  constructor(w, s) {
    super(w, s);
    this.placeAt(s, 34, 30);
    // 踏める・技が当たる「敵」として扱うが、触れても痛くない
    this.enemy = true; this.stompable = true; this.touchDamage = 0;
    this.state = 0; this.cool = 0; this.z = 1;
    this._hr = { x: 0, y: 0, w: 0, h: 0 };
  }
  hurtRect() { const r = this._hr; r.x = this.x; r.y = this.y + 6; r.w = this.w; r.h = this.h - 6; return r; }
  update(dt) { if (this.cool > 0) this.cool -= dt; }
  onStomp(p) { this.hit(); }
  damage(dmg, source) { return this.hit(); }
  hit() {
    const w = this.world;
    if (this.cool > 0) return false;
    // 水位が動いている間は切り替えない（踏み続けて行ったり来たりしないように）
    for (const e of w.entities) if (e.alive && e.spec && e.spec.id === this.spec.target && e.moving) return false;
    this.cool = 1.0; this.state ^= 1; this.flash = 0.15;
    w.sfx('bump');
    w.particles.burst(this.cx, this.y + 6, 6, { speed: 140, life: 0.4, size: 4, size1: 0, color: '#ffe56b', shape: 'star', drag: 3, front: true });
    for (const e of w.entities) if (e.alive && e.spec && e.spec.id === this.spec.target && e.toggle) e.toggle();
    for (const e of w.entities) if (e.alive && e.type === 'waterGate' && e.spec.target === this.spec.target) e.toggle();
    return false;   // 敵を倒した扱いにしない
  }
  draw(ctx, a) {
    drawSprite(ctx, 'gim_switch', this.state, this.cx, this.y + this.h);
    if (this.cool > 0.3) { ctx.globalCompositeOperation = 'lighter'; drawSprite(ctx, 'gim_switch', this.state, this.cx, this.y + this.h, FLASH); ctx.globalCompositeOperation = 'source-over'; }
  }
}
const FLASH = { alpha: 0.5 };
registerEntity('waterSwitch', WaterSwitch);

// ---- 水門：target（waterLevel の id）, h（高さ・タイル。既定3）, open（はじめから開いているか）----
// 置き方：門のいちばん下のタイル (x,y)。閉じている間はそのタイルが固くなる（タイルを書き換える）
class WaterGate extends Entity {
  constructor(w, s) {
    super(w, s);
    this.th = s.h ?? 3;
    this.x = s.x * TILE; this.w = TILE; this.y = (s.y - this.th + 1) * TILE; this.h = this.th * TILE;
    this.open = !!s.open; this.lift = this.open ? 1 : 0; this.persistent = true; this.z = 2;
  }
  init() { this.apply(); }
  toggle() { this.open = !this.open; this.apply(); this.world.sfx('break', { vol: 0.4 }); this.world.camera.shake(3, 0.3); }
  apply() {
    const L = this.world.level, tx = this.spec.x;
    // 閉じている間はそのタイルを固い板（WOOD）にする。絵は門のスプライトで上から描く
    for (let i = 0; i < this.th; i++) L.set(tx, this.spec.y - i, this.open ? T.EMPTY : T.WOOD);
  }
  update(dt) { this.lift += ((this.open ? 1 : 0) - this.lift) * Math.min(1, dt * 4); }
  draw(ctx, a) {
    const up = this.lift * (this.h - 10);
    ctx.save();
    ctx.beginPath(); ctx.rect(this.x - 6, this.y - this.h, this.w + 12, this.h * 2); ctx.clip();
    for (let i = 0; i < this.th; i++) drawSprite(ctx, 'gim_gate', i === 0 ? 0 : 1, this.cx, this.y + (i + 1) * TILE - up);
    ctx.restore();
    // 門の枠（柱）
    drawSprite(ctx, 'gim_gate_frame', 0, this.cx, this.y + this.h);
  }
}
registerEntity('waterGate', WaterGate);

// ---- せり上がる溶岩：x0, x1, y（開始の表面の行）, speed（タイル/秒。既定0.55）, trigger（主人公の x がこのタイルを越えたら開始）, stopY ----
// ミスで中間地点に戻ると、溶岩も始めの高さに戻る
class RisingLava extends Entity {
  constructor(w, s) {
    super(w, s);
    this.persistent = true; this.z = 11;
    const x0 = (s.x0 ?? 0) * TILE, x1 = (s.x1 ?? w.level.w) * TILE;
    this.y0 = (s.y ?? w.level.h - 1) * TILE + 8;
    this.stopY = s.stopY != null ? s.stopY * TILE + 8 : -1e9;
    this.trigger = (s.trigger ?? s.x0 ?? 0) * TILE;
    this.speedPx = (s.speed ?? 0.55) * TILE;
    this.q = { kind: 'lava', x0, x1, y: this.y0 };
    this.x = x0; this.w = x1 - x0; this.y = this.y0; this.h = 1;
    this.started = false; this.misses = 0; this.drawPad = 400;
  }
  init() { this.world.liquids.push(this.q); }
  update(dt) {
    const w = this.world, p = w.player, q = this.q;
    if (w.stats.misses !== this.misses) { this.misses = w.stats.misses; this.reset = true; }
    if (this.reset && w.state === 'play') { this.reset = false; this.started = false; q.y = this.y0; }
    if (!this.started && w.state === 'play' && p.cx > this.trigger && p.cx > q.x0 && p.cx < q.x1) { this.started = true; w.camera.shake(4, 0.6); w.sfx('explosion', { vol: 0.4 }); }
    if (this.started && w.state === 'play') {
      // 主人公から離れすぎたら少し速く（画面の下から見える距離を保つ）
      const gap = q.y - (p.y + p.h);
      const boost = gap > w.camera.vh * 0.75 ? 2.2 : 1;
      q.y = Math.max(this.stopY, q.y - this.speedPx * boost * dt);
    }
    this.y = q.y; this.h = Math.max(1, w.level.pxH - q.y);
    if (w.tick % 4 === 0 && q.y < w.camera.y + w.camera.vh + 20) {
      const x = Math.max(q.x0, w.camera.x) + Math.random() * Math.min(q.x1 - q.x0, w.camera.vw);
      w.particles.spawn({ x, y: q.y, vx: (Math.random() - 0.5) * 30, vy: -60 - Math.random() * 80, life: 0.8, size: 3, size1: 0, color: '#ffb347', add: true });
    }
  }
  draw(ctx, a) {
    const w = this.world, q = this.q, cam = w.camera;
    const x0 = Math.max(q.x0, cam.x - 20), x1 = Math.min(q.x1, cam.x + cam.vw + 20);
    const bottom = Math.min(w.level.pxH, cam.y + cam.vh + 20);
    if (x1 <= x0 || q.y > bottom + 40) return;
    const t = w.time * 1.6;
    ctx.fillStyle = '#c2340c';
    ctx.beginPath(); surfacePath(ctx, x0, x1, q.y, t, 3, 0.03); ctx.lineTo(x1, bottom); ctx.lineTo(x0, bottom); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff6a1a';
    ctx.beginPath(); surfacePath(ctx, x0, x1, q.y, t, 3, 0.03); surfacePathBack(ctx, x0, x1, q.y + 14, t * 1.3, 2, 0.045); ctx.closePath(); ctx.fill();
    // 冷えた岩の筋
    ctx.fillStyle = 'rgba(90,20,10,0.45)';
    for (let i = 0; i < 6; i++) {
      const bx = (Math.floor(x0 / 160) + i) * 160 + ((i * 53) % 70);
      if (bx > x1) break;
      ctx.beginPath(); ctx.ellipse(bx + Math.sin(w.time + i) * 10, q.y + 36 + (i % 3) * 18, 26, 5, 0, 0, 6.2832); ctx.fill();
    }
    ctx.strokeStyle = '#ffd36a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); surfacePath(ctx, x0, x1, q.y, t, 3, 0.03); ctx.stroke();
    // 光
    for (let x = Math.floor(x0 / 140) * 140; x < x1; x += 140) w.lights.push({ x, y: q.y, r: 150, color: '#ff7a2a', a: 0.9, flicker: 0.1 });
  }
}
function surfacePathBack(ctx, x0, x1, y, t, amp, freq) {
  for (let x = x1; x > x0; x -= WAVE_STEP) ctx.lineTo(x, y + Math.sin(x * freq + t) * amp);
  ctx.lineTo(x0, y + Math.sin(x0 * freq + t) * amp);
}
registerEntity('risingLava', RisingLava);
