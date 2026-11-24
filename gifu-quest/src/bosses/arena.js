import { Entity, registerEntity } from '../actors/entity.js';
import { TILE } from '../core/config.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { T, isSolid } from '../world/tiles.js';
import { BOSSES } from './bossBase.js';

// ボス部屋（設計書 7章）。spec: { type:'bossArena', x0, x1, y0, y1（タイル）, boss: 'musasabi'|... }
//  - x0 列が入口の壁（空いている所が入口）、x1 列が奥の壁。y1 が床の一番下の行
//  - 主人公が x0+2 列を越えたら：カメラ固定 → 入口を閉じる → 登場演出（2秒・ジャンプ/決定で飛ばせる）→ 戦闘
//  - 撃破後に入口を開ける。主人公がミスすると Boss.reset → rearm で入口を開けて最初から
const INTRO_TIME = 2.0;
const INTRO_SKIP_AFTER = 0.25;

class BossArena extends Entity {
  constructor(w, s) {
    super(w, s);
    this.persistent = true; this.z = 60; this.drawPad = 2000;
    this.tx0 = s.x0; this.tx1 = s.x1; this.ty0 = s.y0 ?? 0; this.ty1 = s.y1 ?? (w.level.h - 1);
    this.x = this.tx0 * TILE; this.y = this.ty0 * TILE;
    this.w = (this.tx1 - this.tx0 + 1) * TILE; this.h = (this.ty1 - this.ty0 + 1) * TILE;
    this.px = this.x; this.py = this.y;
    this.state = 'wait';   // wait | intro | fight | done
    this.gate = [];        // 閉じたタイル [tx, ty, 元のタイル]
    this.introT = 0;
    this.boss = null;
    // 床の高さ：中央の列を上から見て、最初の固いタイル
    const L = w.level, mid = (this.tx0 + this.tx1) >> 1;
    let fy = this.ty1;
    for (let ty = this.ty0 + 1; ty <= this.ty1; ty++) if (isSolid(L.get(mid, ty))) { fy = ty; break; }
    this.floorTy = fy;
    this.geo = {
      L: (this.tx0 + 1) * TILE, R: this.tx1 * TILE, top: this.ty0 * TILE, floorY: fy * TILE,
      cx: (this.tx0 + 1 + this.tx1) * TILE / 2, tx0: this.tx0, tx1: this.tx1, ty0: this.ty0, ty1: this.ty1, floorTy: fy, entity: this,
    };
    const C = BOSSES[s.boss];
    if (!C) console.warn('unknown boss', s.boss);
    else this.boss = w.spawn(new C(w, this.geo));
  }
  // 入口（x0 列）と奥（x1 列）の空いている所を壁でふさぐ
  closeGate() {
    const L = this.world.level;
    this.gate.length = 0;
    for (const tx of [this.tx0, this.tx1]) {
      for (let ty = this.ty0; ty < this.floorTy; ty++) {
        const t = L.get(tx, ty);
        if (!isSolid(t)) { this.gate.push([tx, ty, t]); L.set(tx, ty, T.STONE); }
      }
    }
    if (this.gate.length) {
      this.world.sfx('break');
      this.world.camera.shake(5, 0.25);
      for (const [tx, ty] of this.gate) if (ty >= this.floorTy - 4) this.world.particles.debris(tx * TILE + TILE / 2, ty * TILE + TILE / 2, '#8a8378');
    }
  }
  openGate() {
    const L = this.world.level;
    for (const [tx, ty, t] of this.gate) L.set(tx, ty, t);
    this.gate.length = 0;
  }
  rearm() {
    this.openGate();
    this.world.unlockCamera();
    this.state = 'wait';
    const p = this.world.player; if (p) p.frozen = false;
    const d = this.world.data;
    audio.bgm(d.bgm || `stage${d.id}`);
  }
  onBossDefeated() {
    this.state = 'done';
    this.openGate();
    audio.stopBgm();
  }
  update(dt) {
    const w = this.world, p = w.player;
    if (!this.boss) return;
    if (this.state === 'wait') {
      if (w.state === 'play' && p.cx > (this.tx0 + 2) * TILE && p.cx < (this.tx1 + 1) * TILE && p.y < (this.ty1 + 1) * TILE && p.y + p.h > this.ty0 * TILE) {
        this.state = 'intro'; this.introT = 0; this.frozeP = false;
        w.lockCamera({ x: this.x, y: this.y, w: this.w, h: this.h });
        this.closeGate();
        this.boss.beginIntro();
        w.sfx('bossIntro');
        audio.bgm('boss');
      }
    } else if (this.state === 'intro') {
      this.introT += dt;
      // 着地してから止める（空中で止めない）
      if (!this.frozeP && (p.onGround || this.introT > 0.6)) { this.frozeP = true; p.frozen = true; p.vx = 0; }
      const skip = this.introT > INTRO_SKIP_AFTER && (input.pressed.jump || input.pressed.confirm);
      if (this.introT >= INTRO_TIME || skip) {
        this.state = 'fight';
        p.frozen = false;
        this.boss.startFight();
        w.setBoss(this.boss);
      }
    }
  }
  // 登場演出：名前と二つ名を大きく（画面の中央）
  draw(ctx, a) {
    if (this.state !== 'intro' || !this.boss) return;
    const w = this.world, cam = w.camera;
    const vx = cam.px + (cam.x - cam.px) * a + cam.ox, vy = cam.py + (cam.y - cam.py) * a + cam.oy;
    const vw = cam.vw, vh = cam.vh;
    const t = this.introT;
    const inK = Math.min(1, t / 0.3), outK = Math.min(1, Math.max(0, (INTRO_TIME - t) / 0.25));
    const k = Math.min(inK, outK);
    const cx = vx + vw / 2, cy = vy + vh * 0.36;
    w.lights.push({ x: cx, y: cy, r: vw * 0.6, color: '#ffffff', a: 1 });
    ctx.save();
    // 帯
    ctx.globalAlpha = 0.72 * k;
    const bandH = 132 * (0.4 + 0.6 * inK);
    const g = ctx.createLinearGradient(vx, 0, vx + vw, 0);
    g.addColorStop(0, 'rgba(20,6,10,0)'); g.addColorStop(0.18, 'rgba(20,6,10,1)'); g.addColorStop(0.82, 'rgba(20,6,10,1)'); g.addColorStop(1, 'rgba(20,6,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(vx, cy - bandH / 2, vw, bandH);
    ctx.globalAlpha = k;
    ctx.fillStyle = '#d7a640';
    ctx.fillRect(vx + vw * 0.2, cy - bandH / 2 + 4, vw * 0.6 * inK, 2);
    ctx.fillRect(vx + vw * 0.8 - vw * 0.6 * inK, cy + bandH / 2 - 6, vw * 0.6 * inK, 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const slide = (1 - inK) * 60;
    // 二つ名
    ctx.font = 'bold 24px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif';
    ctx.fillStyle = '#f3d98a';
    ctx.fillText(this.boss.title, cx - slide, cy - 34);
    // 名前
    ctx.font = 'bold 64px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif';
    ctx.lineWidth = 8; ctx.strokeStyle = '#3a0d12'; ctx.lineJoin = 'round';
    ctx.strokeText(this.boss.name, cx + slide, cy + 18);
    ctx.fillStyle = '#fff4e2';
    ctx.fillText(this.boss.name, cx + slide, cy + 18);
    // 飛ばせる合図
    if (t > INTRO_SKIP_AFTER) {
      ctx.globalAlpha = k * (0.55 + 0.35 * Math.sin(t * 6));
      ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = '#fff';
      ctx.fillText('ジャンプで とばす', cx, cy + bandH / 2 + 18);
    }
    ctx.restore();
  }
}
registerEntity('bossArena', BossArena);
