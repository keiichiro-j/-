// 担当：敵・仕掛け。湯気・つらら・吹雪の横風・落雷（ARCHITECTURE「仕掛けの配置名」）
// どれも予告がある：湯気は小さな噴き出し、つららは揺れ、横風は雪煙、落雷は地面の印
import { Entity, registerEntity } from '../actors/entity.js';
import { TILE } from '../core/config.js';
import { isSolid } from './tiles.js';
import { drawSprite } from '../gfx/atlas.js';

const inRect = (p, x, y, w, h) => p.x + p.w > x && p.x < x + w && p.y + p.h > y && p.y < y + h;

// ---- 温泉の湯気：power（1で普通）, period（秒。0なら出っぱなし）, h（届く高さ・タイル。既定5）----
// 置き方：足元中央をタイル (x,y) に（噴き出し口が地面の上）。出る0.6秒前から小さく噴いて予告
class SteamVent extends Entity {
  constructor(w, s) {
    super(w, s);
    this.placeAt(s, 44, 14);
    this.power = s.power ?? 1;
    this.period = s.period ?? 3;
    this.reach = (s.h ?? 5) * TILE;
    this.on = this.period <= 0; this.str = this.on ? 1 : 0; this.warn = false;
    this.t = (s.phase ?? 0) * this.period;
    this.z = -1; this.drawPad = this.reach;
  }
  update(dt) {
    const w = this.world, p = w.player;
    this.t += dt;
    if (this.period > 0) {
      const u = (this.t % this.period) / this.period;   // 前半55%が噴き出し
      this.on = u < 0.55;
      this.warn = u > 1 - 0.6 / this.period;
    }
    this.str += ((this.on ? 1 : 0) - this.str) * Math.min(1, dt * 8);
    const top = this.y - this.reach;
    if (this.str > 0.3 && inRect(p, this.x + 4, top, this.w - 8, this.reach + this.h)) {
      // 上へ押し上げる（重力に勝つ加速。上限あり）
      const maxUp = -430 * this.power;
      if (p.vy > maxUp) p.vy = Math.max(maxUp, p.vy - (2550 + 1900 * this.power) * this.str * dt);
      p.onGround = false; p.jumpHeldFromJump = false;
    }
    const n = this.on ? 2 : this.warn ? 6 : 0;
    if (n && w.tick % n === 0) {
      const big = this.on;
      w.particles.spawn({ x: this.cx + (Math.random() - 0.5) * (big ? 26 : 12), y: this.y + 4, vx: (Math.random() - 0.5) * 20, vy: big ? -(260 + 120 * this.power) : -90, life: big ? this.reach / 330 : 0.4, size: big ? 7 : 4, size1: big ? 20 : 8, color: 'rgba(255,255,255,0.45)', drag: 0.6 });
    }
  }
  draw(ctx, a) {
    const w = this.world;
    if (this.str > 0.05) {
      // 湯気の柱（うすい円をいくつか重ねる）
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 7; i++) {
        const k = ((w.time * 0.9 + i / 7) % 1);
        const yy = this.y - k * this.reach;
        ctx.globalAlpha = this.str * 0.22 * (1 - k);
        ctx.beginPath(); ctx.ellipse(this.cx + Math.sin(w.time * 2 + i) * 6, yy, 14 + k * 16, 12 + k * 10, 0, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    drawSprite(ctx, 'gim_vent', this.warn && !this.on ? 1 : 0, this.cx, this.y + this.h);
  }
}
registerEntity('steamVent', SteamVent);

// ---- つらら：下に来ると揺れて（0.6秒）落ちる。5秒でまた生える ----
// 置き方：つららが下がる天井のすぐ下のタイル (x,y)（上端から吊り下がる）
class Icicle extends Entity {
  constructor(w, s) {
    super(w, s);
    this.w = 12; this.h = 34;
    this.hx = s.x * TILE + TILE / 2 - this.w / 2; this.hy = s.y * TILE;
    this.x = this.hx; this.y = this.hy; this.px = this.x; this.py = this.y;
    this.state = 'hang'; this.timer = 0; this.grow = 1;
    this.touchDamage = 1; this.cancelable = true; this.z = 2;
  }
  cancel() { this.shatter(); }
  shatter() {
    const w = this.world;
    w.particles.burst(this.cx, this.y + this.h - 4, 10, { speed: 200, life: 0.5, size: 4, size1: 0, color: '#d8f2ff', shape: 'square', grav: 1200, vr: 10, angle: -Math.PI / 2, spread: 2.4 });
    w.sfx('break', { vol: 0.4 });
    this.state = 'gone'; this.timer = 5; this.hazard = false;
  }
  update(dt) {
    const w = this.world, p = w.player;
    if (this.state === 'hang') {
      this.grow = Math.min(1, this.grow + dt * 1.5);
      const c = w.camera;
      const visible = this.x > c.x + 10 && this.x < c.x + c.vw - 10 && this.y > c.y - 10 && this.y < c.y + c.vh;
      if (this.grow >= 1 && visible && Math.abs(p.cx - this.cx) < 46 && p.y > this.y && p.y - this.y < 9 * TILE) { this.state = 'shake'; this.timer = this.spec.delay ?? 0.6; }
    } else if (this.state === 'shake') {
      this.timer -= dt;
      this.x = this.hx + (((w.tick >> 1) & 1) ? 1.5 : -1.5);
      if (w.tick % 8 === 0) w.particles.spawn({ x: this.cx, y: this.hy + 2, vy: 50, life: 0.4, size: 2, size1: 0, color: '#eef8ff', grav: 400 });
      if (this.timer <= 0) { this.state = 'fall'; this.x = this.hx; this.vy = 0; this.hazard = true; }
    } else if (this.state === 'fall') {
      this.vy = Math.min(this.vy + 1700 * dt, 900);
      this.y += this.vy * dt;
      if (isSolid(w.level.at(this.cx, this.y + this.h)) || this.y > w.level.pxH) this.shatter();
    } else if (this.state === 'gone') {
      this.timer -= dt;
      if (this.timer <= 0) { this.state = 'hang'; this.x = this.hx; this.y = this.hy; this.px = this.x; this.py = this.y; this.grow = 0; }
    }
  }
  draw(ctx, a) {
    if (this.state === 'gone') return;
    const o = this._o || (this._o = { sy: 1 });
    o.sy = Math.max(0.05, this.grow);
    drawSprite(ctx, 'gim_icicle', 0, this.ix(a) + this.w / 2, this.iy(a), o);
  }
}
registerEntity('icicle', Icicle);

// ---- 吹雪の横風：x0, x1（タイル）, force（ドット/秒。正で右向き、負で左向き。既定 -150）, period（秒。既定4）----
// 周期の前半に吹き、吹く0.8秒前から地面の雪煙で予告。主人公を直接押す（壁は越えない）
class WindZone extends Entity {
  constructor(w, s) {
    super(w, s);
    this.x0 = (s.x0 ?? s.x) * TILE; this.x1 = (s.x1 ?? s.x + 20) * TILE;
    this.x = this.x0; this.w = this.x1 - this.x0; this.y = 0; this.h = w.level.pxH;
    this.force = s.force ?? -150;
    this.period = s.period ?? 4;
    this.t = (s.phase ?? 0) * this.period;
    this.str = 0; this.persistent = true; this.z = 12;
  }
  update(dt) {
    const w = this.world, p = w.player, c = w.camera;
    this.t += dt;
    const u = (this.t % this.period) / this.period;
    const on = u < 0.5;
    const warn = !on && u > 1 - 0.8 / this.period;
    this.str += ((on ? 1 : 0) - this.str) * Math.min(1, dt * 3);
    const inZone = p.cx > this.x0 && p.cx < this.x1;
    if (inZone && this.str > 0.02 && w.state === 'play') {
      const dx = this.force * this.str * dt * (p.onGround ? 1 : 1.3);
      const edge = dx > 0 ? p.x + p.w + dx : p.x + dx;
      let blocked = false;
      for (let y = p.y + 2; y < p.y + p.h - 4; y += 12) if (isSolid(w.level.at(edge, y))) { blocked = true; break; }
      if (!blocked) p.x += dx;
    }
    // 雪煙（予告と吹いている間）。画面の中だけに出す
    if (!(inZone || (this.x0 < c.x + c.vw && this.x1 > c.x))) return;
    const dir = Math.sign(this.force) || 1;
    if (warn && w.tick % 5 === 0) {
      w.particles.spawn({ x: c.x + (dir > 0 ? 0 : c.vw) + (Math.random() - 0.5) * 100, y: p.y + p.h - 4 - Math.random() * 10, vx: dir * 120, vy: -10, life: 0.9, size: 5, size1: 14, color: 'rgba(240,248,255,0.45)', drag: 0.5, front: true });
    }
    if (this.str > 0.1 && w.tick % 2 === 0) {
      const sx = dir > 0 ? c.x - 10 : c.x + c.vw + 10;
      w.particles.spawn({ x: sx, y: c.y + Math.random() * c.vh, vx: dir * (500 + Math.random() * 300) * this.str, vy: 40 + Math.random() * 40, life: 2.2, size: 2.5, size1: 1.5, color: '#ffffff', alpha: 0.85, front: true });
      if (w.tick % 6 === 0) w.particles.spawn({ x: sx, y: c.y + Math.random() * c.vh, vx: dir * 700 * this.str, vy: 0, life: 1.6, size: 1.5, color: '#ffffff', shape: 'spark', alpha: 0.5, front: true });
    }
  }
}
registerEntity('windZone', WindZone);

// ---- 落雷：x0, x1（タイル）, interval（秒。既定4）, weather（例 "thunder"。指定するとその天気の時だけ）----
// 主人公がゾーン内にいると、足元に予告の印（1.0秒点滅）→ 落雷（触れると1ダメージ）
class LightningZone extends Entity {
  constructor(w, s) {
    super(w, s);
    this.x0 = (s.x0 ?? s.x) * TILE; this.x1 = (s.x1 ?? s.x + 20) * TILE;
    this.x = this.x0; this.w = 40; this.y = 0; this.h = 40;
    this.persistent = true; this.z = 12;
    this.interval = s.interval ?? 4;
    this.timer = this.interval * 0.6; this.state = 'idle';
    this.touchDamage = 1; this.cancelable = false;
    this.jag = new Float32Array(12);
  }
  cancel() {}
  groundBelow(x, y) {
    const L = this.world.level;
    for (let ty = Math.max(0, Math.floor(y / TILE)); ty < L.h; ty++) if (isSolid(L.get(Math.floor(x / TILE), ty))) return ty * TILE;
    return L.pxH;
  }
  update(dt) {
    const w = this.world, p = w.player;
    const inZone = p.cx > this.x0 && p.cx < this.x1;
    const wxOk = !this.spec.weather || w.env.weather === this.spec.weather;
    this.hazard = false;
    if (this.state !== 'strike') { this.x = this.x0; this.w = this.x1 - this.x0; this.y = 0; this.h = w.level.pxH; }
    if (this.state === 'idle') {
      if (inZone && wxOk && w.state === 'play') this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'warn'; this.timer = 1.0;
        this.tx = Math.max(this.x0 + 20, Math.min(this.x1 - 20, p.cx + p.vx * 0.35));
        this.gy = this.groundBelow(this.tx, p.y);
      }
    } else if (this.state === 'warn') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'strike'; this.timer = 0.22;
        for (let i = 0; i < this.jag.length; i++) this.jag[i] = (Math.random() - 0.5) * 30;
        w.sfx('thunder'); w.camera.shake(7, 0.35);
        w.particles.burst(this.tx, this.gy, 14, { angle: -Math.PI / 2, spread: 2, speed: 300, life: 0.5, size: 3, size1: 0, color: '#fff7b0', shape: 'spark', add: true, front: true });
      }
    } else if (this.state === 'strike') {
      this.timer -= dt;
      if ('flash' in w.env) w.env.flash = Math.max(w.env.flash, this.timer / 0.22);
      this.x = this.tx - 16; this.w = 32; this.y = w.camera.y - 40; this.h = this.gy - this.y;
      this.hazard = this.timer > 0.06;
      if (this.timer <= 0) { this.state = 'idle'; this.timer = this.interval * (0.8 + Math.random() * 0.4); }
    }
  }
  draw(ctx, a) {
    const w = this.world;
    if (this.state === 'warn') {
      const k = 1 - this.timer;
      const blink = ((this.timer * 10) | 0) % 2 === 0;
      drawSprite(ctx, 'gim_bolt_mark', blink ? 1 : 0, this.tx, this.gy);
      ctx.strokeStyle = '#ffe56b'; ctx.globalAlpha = 0.4 + 0.5 * k; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(this.tx, this.gy - 2, 26 - 10 * k, 7 - 2 * k, 0, 0, 6.2832); ctx.stroke();
      ctx.globalAlpha = 1;
      w.lights.push({ x: this.tx, y: this.gy - 10, r: 40 + 30 * k, color: '#fff0a0', a: 0.7 });
    } else if (this.state === 'strike') {
      const top = w.camera.y - 20, n = this.jag.length, seg = (this.gy - top) / n;
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? '#ffffff' : '#ffe56b';
        ctx.lineWidth = pass ? 3 : 9; ctx.globalAlpha = pass ? 1 : 0.5;
        ctx.beginPath(); ctx.moveTo(this.tx + this.jag[0] * 0.3, top);
        for (let i = 1; i < n; i++) ctx.lineTo(this.tx + this.jag[i], top + seg * i);
        ctx.lineTo(this.tx, this.gy); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      w.lights.push({ x: this.tx, y: this.gy - 100, r: 260, color: '#fffbe0', a: 1 });
    }
  }
}
registerEntity('lightningZone', LightningZone);
