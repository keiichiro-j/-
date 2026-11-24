import { Entity, registerEntity } from '../actors/entity.js';
import { TILE } from '../core/config.js';
import { drawSprite } from '../gfx/atlas.js';
import { input } from '../core/input.js';
import { moveBody } from '../world/collision.js';
import { save } from '../core/save.js';
import { touch } from '../ui/touch.js';
import { drawText, roundRect, font, COL } from '../ui/text.js';

const O_GHOST = { alpha: 0.45 }, O_BEAT = { sx: 1 };
// アイテム・中間地点・看板・宝珠（設計書 6章「各ステージに必ず入れるもの」）
class Coin extends Entity {
  constructor(w, s) { super(w, s); this.pickup = true; this.placeAt(s, 20, 24); this.y -= 6; this.phase = (s.x * 0.37 + s.y * 0.11) % 1; this.z = 1; }
  // 武器の効果：コイン吸い寄せ
  update(dt) {
    const p = this.world.player, r = p.wfx ? p.wfx.magnet : 0;
    if (!r || p.dead) return;
    const dx = p.cx - this.cx, dy = p.cy - this.cy, d2 = dx * dx + dy * dy;
    if (d2 < r * r) { const d = Math.sqrt(d2) || 1, sp = 520 * dt; this.x += dx / d * Math.min(d, sp); this.y += dy / d * Math.min(d, sp); }
  }
  onTouch(p) {
    this.alive = false;
    // 武器の効果：ときどきコイン2倍
    const twice = p.wfx && p.wfx.coinx && Math.random() < p.wfx.coinx;
    this.world.addCoins(twice ? 2 : 1, this.cx, this.cy);
    if (twice) this.world.particles.coin(this.cx, this.cy - 10);
    this.world.particles.coin(this.cx, this.cy);
    this.world.sfx('coin');
  }
  draw(ctx, a) { drawSprite(ctx, 'item_coin', ((this.world.time * 10 + this.phase * 8) | 0), this.cx, this.y + this.h + Math.sin(this.world.time * 3 + this.phase * 6) * 1.5); }
}
registerEntity('coin', Coin);

// さるぼぼ（各ステージ3個。spec.index 0..2）
class Sarubobo extends Entity {
  constructor(w, s) { super(w, s); this.pickup = true; this.placeAt(s, 28, 32); this.index = s.index ?? 0; this.z = 2; this.got = !!(w.collectedSarubobo && w.collectedSarubobo[this.index]); }
  onTouch(p) {
    this.alive = false;
    this.world.collectSarubobo(this.index);
    this.world.particles.burst(this.cx, this.cy, 16, { speed: 200, life: 0.7, size: 6, size1: 0, color: '#ff5a4a', shape: 'star', front: true, drag: 3, vr: 10 });
    this.world.sfx('sarubobo');
    this.world.hitstop(0.08);
  }
  draw(ctx, a) {
    const y = this.y + this.h + Math.sin(this.world.time * 2.4) * 3;
    drawSprite(ctx, 'item_sarubobo', 0, this.cx, y, this.got ? O_GHOST : null);
  }
}
registerEntity('sarubobo', Sarubobo);

// 飛騨牛串：無敵アイテム
class Skewer extends Entity {
  constructor(w, s) { super(w, s); this.pickup = true; this.placeAt(s, 30, 30); this.z = 2; }
  onTouch(p) { this.alive = false; const t = 8 + (p.wfx ? p.wfx.star : 0); p.star = t; this.world.sfx('star'); this.world.events.emit('star', { t }); this.world.particles.burst(this.cx, this.cy, 20, { speed: 260, life: 0.6, size: 5, size1: 0, color: '#ffd76a', shape: 'star', front: true, add: true }); }
  draw(ctx, a) { drawSprite(ctx, 'item_skewer', (this.world.time * 6) | 0, this.cx, this.y + this.h + Math.sin(this.world.time * 4) * 3); }
}
registerEntity('skewer', Skewer);

class Heart extends Entity {
  constructor(w, s) { super(w, s); this.pickup = true; this.placeAt(s, 24, 24); this.z = 2; }
  onTouch(p) { this.alive = false; p.heal(1); this.world.sfx('heart'); this.world.particles.burst(this.cx, this.cy, 10, { speed: 140, life: 0.5, size: 5, size1: 0, color: '#ff7fa0', front: true }); }
  draw(ctx, a) { O_BEAT.sx = 1 + Math.sin(this.world.time * 8) * 0.06; drawSprite(ctx, 'item_heart', 0, this.cx, this.y + this.h + Math.sin(this.world.time * 4) * 2, O_BEAT); }
}
registerEntity('heart', Heart);

// 中間地点（spec.index 0,1）
class Checkpoint extends Entity {
  constructor(w, s) { super(w, s); this.pickup = true; this.placeAt(s, 30, 72); this.on = false; this.raise = 0; this.z = -1; }
  activate(silent) { this.on = true; this.raise = silent ? 1 : 0; if (silent) this.world.checkpoint = this; }
  onTouch(p) {
    if (this.on) return;
    this.on = true;
    this.world.setCheckpoint(this);
    this.world.sfx('checkpoint');
    this.world.particles.burst(this.cx, this.y + 10, 14, { speed: 160, life: 0.8, size: 5, size1: 0, color: '#ffe9a0', shape: 'star', front: true, grav: 120 });
  }
  update(dt) { if (this.on && this.raise < 1) this.raise = Math.min(1, this.raise + dt * 2.5); }
  draw(ctx, a) {
    drawSprite(ctx, 'prop_checkpoint', this.on ? 1 : 0, this.cx, this.y + this.h);
    if (this.on) { const L = this.light || (this.light = { x: 0, y: 0, r: 90, color: '#ffcf7a', a: 0.9 }); L.x = this.cx; L.y = this.y + 8; this.world.lights.push(L); }
  }
}
registerEntity('checkpoint', Checkpoint);

// 名物・名所の看板（spec.title, spec.text）。↑で読む
class Sign extends Entity {
  constructor(w, s) { super(w, s); this.pickup = true; this.placeAt(s, 40, 44); this.z = -1; this.near = 0; }
  onTouch(p) { this.near = 0.1; if (input.pressed.up && p.onGround) { this.world.showDialogue(this.spec.title, this.spec.text); if (!this.world.stats.signs.includes(this.spec.id || this.spec.title)) this.world.stats.signs.push(this.spec.id || this.spec.title); } }
  update(dt) { if (this.near > 0) this.near -= dt; }
  draw(ctx, a) {
    drawSprite(ctx, 'prop_sign', 0, this.cx, this.y + this.h);
    if (this.near > 0) drawSprite(ctx, 'ui_up_hint', (this.world.time * 3) | 0, this.cx, this.y - 6 + Math.sin(this.world.time * 6) * 2);
  }
}
registerEntity('sign', Sign);

// 宝珠（ボスを倒すと出る。取るとクリア）
class Orb extends Entity {
  constructor(w, s) { super(w, s); this.pickup = true; this.placeAt(s, 36, 36); this.vy = s.drop ? -520 : 0; this.persistent = true; this.z = 6; this.onGround = false; }
  update(dt) {
    if (this.spec.drop && !this.onGround) { this.vy = Math.min(this.vy + 1400 * dt, 700); moveBody(this.world.level, this, dt, { platforms: this.world.platforms }); }
    const L = this.light || (this.light = { x: 0, y: 0, r: 140, color: '#bfe8ff', a: 1 }); L.x = this.cx; L.y = this.cy; this.world.lights.push(L);
    if (this.world.tick % 5 === 0) this.world.particles.spawn({ x: this.cx + (Math.random() - 0.5) * 30, y: this.cy + (Math.random() - 0.5) * 30, vy: -40, life: 0.8, size: 3, size1: 0, color: '#e6f7ff', shape: 'star', add: true, front: true });
  }
  // ミスと同じフレームに触れた時はクリアにならないので、宝珠を残す（中間地点から戻って取り直せる）
  onTouch(p) { if (!this.world.stageClear()) return; this.alive = false; this.world.particles.explosion(this.cx, this.cy, 0.6); }
  draw(ctx, a) { drawSprite(ctx, `item_orb_${this.world.data.id || 1}`, (this.world.time * 8) | 0, this.cx, this.iy(a) + this.h + Math.sin(this.world.time * 3) * 4); }
}
registerEntity('orb', Orb);

// カメラ固定ゾーン（隠し部屋など）。spec: x,y,w,h（タイル）
class CameraZone extends Entity {
  constructor(w, s) { super(w, s); this.x = s.x * TILE; this.y = s.y * TILE; this.w = s.w * TILE; this.h = s.h * TILE; this.persistent = true; this.inside = false; }
  update(dt) {
    const p = this.world.player;
    const inside = p.cx > this.x && p.cx < this.x + this.w && p.cy > this.y && p.cy < this.y + this.h;
    if (inside && !this.inside) this.world.lockCamera({ x: this.x, y: this.y, w: this.w, h: this.h });
    if (!inside && this.inside && this.world.camera.lock && this.world.camera.lock.x === this.x) this.world.unlockCamera();
    this.inside = inside;
  }
}
registerEntity('cameraZone', CameraZone);

// ゴール（ボスのいない練習ステージ用）：触れるとクリア
class Goal extends Entity {
  constructor(w, s) { super(w, s); this.pickup = true; this.placeAt(s, 36, 72); }
  onTouch(p) { if (this.world.stageClear()) this.alive = false; }
  draw(ctx) { drawSprite(ctx, 'item_orb_1', 0, this.cx, this.y + this.h); }
}
registerEntity('goal', Goal);

// 背景の小物（当たり判定なし）。spec: sprite, z(既定-5), flip, scale, light: { r, color }, sway
class Decor extends Entity {
  constructor(w, s) {
    super(w, s);
    this.placeAt(s, 36, 36);
    this.z = s.z ?? -5; this.persistent = false; this.drawPad = 200;
    this.sprite = s.sprite || 'prop_toro';
    // 描画のオプションと灯りは1回だけ作って使い回す（以前は毎フレーム新しいオブジェクトを作っていた）
    this.opt = { flip: !!s.flip, sx: s.scale || 1, sy: s.scale || 1, rot: 0 };
    this.fps = s.fps || 6; this.baseY = (s.dy || 0) * TILE;
    const L = s.light;
    this.light = L ? { x: 0, y: 0, r: L.r || 110, color: L.color || '#ffbf6a', a: 1, flicker: L.flicker ?? 0.08 } : null;
    if (L) { this.lightDx = L.dx || 0; this.lightDy = L.dy ?? 40; this.drawPad = Math.max(this.drawPad, this.light.r); }
  }
  draw(ctx, a) {
    const s = this.spec, t = this.world.time;
    if (s.sway) this.opt.rot = Math.sin(t * 1.5 + this.x) * s.sway;
    drawSprite(ctx, this.sprite, (t * this.fps) | 0, this.cx, this.y + this.h + this.baseY, this.opt);
    if (this.light) { const L = this.light; L.x = this.cx + this.lightDx; L.y = this.y + this.h - this.lightDy; this.world.lights.push(L); }
  }
}
registerEntity('decor', Decor);

// ---- はじめて遊ぶ人への案内（吹き出し）----
// spec: id（move|jump|attack|dash|drop|sign）, range（左右の幅・タイル。既定2.5）, dy（上下の幅・タイル。既定3）
// その場所に来ると、上に短い吹き出しを出す（PC はキー名、スマホはボタンの絵）。一度見たら save.data.seenHints[id] に記録し、次からは出さない
// （save.js の defaultSave には無いキー。無くても動くように読む）
const HINT_KEY_NAME = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift', Enter: 'Enter' };
const hintKey = (act) => { const c = (input.keymap[act] || [])[0] || '?'; return HINT_KEY_NAME[c] || c.replace(/^Key/, '').replace(/^Digit/, ''); };
// 行ごとの部品：文字列はそのまま、{k:'jump'} はキー（スマホは対応するボタンの絵）
const HINTS = {
  move: [[{ k: 'left' }, { k: 'right' }, 'で歩く']],
  jump: [[{ k: 'jump' }, 'でジャンプ'], ['ながおしで高く跳ぶ']],
  attack: [[{ k: 'attack' }, 'で技'], ['上からふんでも倒せる']],
  dash: [[{ k: 'attack' }, 'を押したまま', { k: 'lr' }], ['でダッシュ']],
  drop: [[{ k: 'down' }, '＋', { k: 'jump' }, 'で足場から降りる']],
  sign: [[{ k: 'up' }, 'で看板を読む']],
};
const HINT_TXT = { size: 19, color: COL.kinari, align: 'left', baseline: 'middle' };
const HINT_KEY = { size: 17, color: COL.sumi, align: 'center', baseline: 'middle' };
const HINT_BTN = { size: 12, color: COL.kinari, align: 'center', baseline: 'middle' };
let keyboardUsed = false;
if (typeof window !== 'undefined') window.addEventListener('keydown', () => { keyboardUsed = true; }, { passive: true });
// スマホの操作か（タッチで遊んでいる・キーボードを使っていない）
export function touchControls() {
  if (input.lastDevice === 'touch') return true;
  return !!(touch.enabled && !keyboardUsed && input.lastDevice !== 'pad');
}
function seenHints() { const d = save.data; const s = d.seenHints; return s && typeof s === 'object' && !Array.isArray(s) ? s : null; }

class Hint extends Entity {
  constructor(w, s) {
    super(w, s); this.placeAt(s, 36, 36); this.z = 30; this.drawPad = 160;
    this.id = s.id || 'move'; this.lines = HINTS[this.id] || HINTS.move;
    const S = seenHints();
    this.done = !!(S && S[this.id]);
    this.show = 0;       // 0..1（出る・消えるの動き）
    this.shownT = 0;     // 出ていた時間
    this.lay = null; this.layTouch = null; this.layMap = null;
  }
  update(dt) {
    if (this.done && this.show <= 0) return;
    const p = this.world.player, W = this.world;
    const rx = (this.spec.range ?? 2.5) * TILE, ry = (this.spec.dy ?? 3) * TILE;
    const foot = p.y + p.h, base = this.y + this.h;
    let near = !this.done && W.state === 'play' && W.time > 2.1 && !p.dead && Math.abs(p.cx - this.cx) < rx && Math.abs(foot - base) <= ry;
    if (near && this.id === 'sign' && W.stats.signs.length) { near = false; this.markSeen(); }
    this.show = Math.max(0, Math.min(1, this.show + (near ? dt * 5 : -dt * 3.5)));
    if (this.show >= 1) this.shownT += dt;
    // 1.5秒見せたら「見た」。今いる間は出したまま、離れたら消えて二度と出ない
    if (!near && this.shownT > 1.5) this.markSeen();
  }
  markSeen() {
    if (this.done) return;
    this.done = true;
    const d = save.data;
    if (!seenHints()) d.seenHints = {};
    d.seenHints[this.id] = true;
    save.write();
  }
  // 部品の位置を計算（出始めと、操作の種類・キー設定が変わった時だけ。毎フレーム作らない）
  layout(ctx, isTouch) {
    if (this.lay && this.layTouch === isTouch && this.layMap === input.keymap) return this.lay;
    const items = [], lineW = [], LH = 34;
    for (const line of this.lines) {
      let x = 0; const row = [];
      for (const part of line) {
        if (typeof part === 'string') { ctx.font = font(HINT_TXT.size); const w = ctx.measureText(part).width; row.push({ t: 'txt', s: part, x, w }); x += w + 4; continue; }
        if (isTouch) {
          const kind = { left: 'padL', right: 'padR', lr: 'padLR', up: 'padU', down: 'padD', jump: 'btnJ', attack: 'btnA' }[part.k];
          if (part.k === 'right' && row.length && row[row.length - 1].kind === 'padL') { row[row.length - 1].kind = 'padLR'; continue; }   // ←→ はパッド1つの絵
          const w = kind.startsWith('pad') ? 46 : kind === 'btnJ' ? 58 : 28;
          row.push({ t: 'ico', kind, x, w }); x += w + 6;
        } else {
          const s = part.k === 'lr' ? hintKey('left') + hintKey('right') : hintKey(part.k);
          ctx.font = font(HINT_KEY.size); const w = Math.max(28, ctx.measureText(s).width + 14);
          row.push({ t: 'key', s, x, w }); x += w + 5;
        }
      }
      lineW.push(x - 4); items.push(row);
    }
    const W = Math.max(...lineW) + 28, H = this.lines.length * LH + 14;
    this.lay = { items, lineW, W, H, LH }; this.layTouch = isTouch; this.layMap = input.keymap;
    return this.lay;
  }
  draw(ctx, a) {
    if (this.show <= 0) return;
    const isTouch = touchControls();
    const L = this.layout(ctx, isTouch);
    const e = this.show, k = e < 1 ? 1 + 0.12 * Math.sin(e * Math.PI) : 1;   // ぽんと出る
    const bob = Math.sin(this.world.time * 2.4) * 2;
    const cx = this.cx, by = this.y + this.h - (this.spec.lift ?? 82) + bob;   // 吹き出しの下端
    ctx.save();
    ctx.globalAlpha = Math.min(1, e * 1.4);
    ctx.translate(cx, by); ctx.scale(k * (0.85 + 0.15 * e), k * (0.85 + 0.15 * e));
    const x0 = -L.W / 2, y0 = -L.H;
    // 枠（墨の地に金の縁）としっぽ
    ctx.fillStyle = 'rgba(29,24,22,0.86)'; ctx.strokeStyle = COL.kin; ctx.lineWidth = 2;
    roundRect(ctx, x0, y0, L.W, L.H, 12); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-9, -1); ctx.lineTo(0, 12); ctx.lineTo(9, -1); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(0, 12); ctx.lineTo(9, 0); ctx.stroke();
    for (let r = 0; r < L.items.length; r++) {
      const row = L.items[r], lx = -L.lineW[r] / 2, ly = y0 + 7 + L.LH * r + L.LH / 2;
      for (const it of row) {
        const x = lx + it.x;
        if (it.t === 'txt') drawText(ctx, it.s, x, ly + 1, HINT_TXT);
        else if (it.t === 'key') {
          ctx.fillStyle = '#6b5a44'; roundRect(ctx, x, ly - 12, it.w, 27, 6); ctx.fill();
          ctx.fillStyle = COL.kinari; roundRect(ctx, x, ly - 14, it.w, 25, 6); ctx.fill();
          drawText(ctx, it.s, x + it.w / 2, ly - 1, HINT_KEY);
        } else drawHintIcon(ctx, it.kind, x + it.w / 2, ly, this.world.time);
      }
    }
    ctx.restore();
  }
}
registerEntity('hint', Hint);

// スマホのボタンの小さな絵（ui/touch.js の見た目に合わせる）
function drawHintIcon(ctx, kind, x, y, t) {
  ctx.lineWidth = 2; ctx.strokeStyle = COL.kinari;
  if (kind.startsWith('pad')) {
    ctx.fillStyle = 'rgba(243,234,215,0.18)'; roundRect(ctx, x - 23, y - 14, 46, 28, 12); ctx.fill(); ctx.stroke();
    const on = ((t * 2) | 0) % 2 === 0;
    const tri = (tx, ty, dx, dy, lit) => {
      ctx.fillStyle = lit ? COL.kin : 'rgba(243,234,215,0.85)'; ctx.beginPath();
      ctx.moveTo(tx + dx * 7, ty + dy * 7); ctx.lineTo(tx - dx * 4 + dy * 6, ty - dy * 4 + dx * 6); ctx.lineTo(tx - dx * 4 - dy * 6, ty - dy * 4 - dx * 6); ctx.closePath(); ctx.fill();
    };
    tri(x - 12, y, -1, 0, kind === 'padL' || (kind === 'padLR' && on));
    tri(x + 12, y, 1, 0, kind === 'padR' || (kind === 'padLR' && !on));
    if (kind === 'padU') tri(x, y - 4, 0, -1, true);
    if (kind === 'padD') tri(x, y + 4, 0, 1, true);
    return;
  }
  ctx.fillStyle = COL.shu; ctx.beginPath();
  if (kind === 'btnJ') roundRect(ctx, x - 29, y - 14, 58, 28, 14); else ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  drawText(ctx, kind === 'btnJ' ? 'ジャンプ' : '技', x, y + 1, kind === 'btnJ' ? HINT_BTN : HINT_BTN_A);
}
const HINT_BTN_A = { size: 16, color: COL.kinari, align: 'center', baseline: 'middle' };
