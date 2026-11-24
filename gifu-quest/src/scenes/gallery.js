import { spriteNames, spriteInfo, drawSprite } from '../gfx/atlas.js';
// 開発用：?gallery=<名前の一部> で登録済みスプライトを一覧表示（アート確認用）
export const galleryScene = {
  enter(p) { this.filter = p.filter && p.filter !== '1' ? p.filter : ''; this.t = 0; },
  update(dt) { this.t += dt; },
  draw(ctx, a, vw, vh) {
    ctx.fillStyle = '#5a6a7a'; ctx.fillRect(0, 0, vw, vh);
    const names = spriteNames().filter((n) => n.includes(this.filter));
    let x = 8, y = 8, rowH = 0;
    ctx.font = '9px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (const n of names) {
      const s = spriteInfo(n);
      const cell = Math.max(s.w, 50);
      if (x + cell > vw) { x = 8; y += rowH + 14; rowH = 0; }
      if (y > vh) break;
      drawSprite(ctx, n, (this.t * 8) | 0, x + cell / 2 - s.w / 2 + s.ox, y + s.oy);
      ctx.fillStyle = '#fff'; ctx.fillText(n.replace(/^(hero|enemy|prop|item|boss)_/, ''), x, y + s.h + 1);
      x += cell + 6; rowH = Math.max(rowH, s.h);
    }
  },
};

// 開発用：?scene=dressup&wpn=w27 で、全キャラ×全アニメに武器を持たせて並べる（装いの確認用）
import { drawHeroDressed } from '../art/heroGear.js';
import { HERO_ANIMS } from '../actors/player.js';
export const dressupScene = {
  enter() { this.t = 0; const q = new URLSearchParams(location.search); this.w = q.get('wpn') || 'w27'; this.zoom = +(q.get('zoom') || 1.4); this.frame = q.get('f'); this.anim = q.get('anim'); },
  update(dt) { this.t += dt; },
  draw(ctx, a, vw, vh) {
    ctx.fillStyle = '#7a8a9a'; ctx.fillRect(0, 0, vw, vh);
    const ids = ['leaf', 'minamo', 'gen', 'haku', 'sarubobo'], anims = Object.keys(HERO_ANIMS);
    // ?anim=win：そのアニメの全コマを大きく並べる（顔と武器の重なりを見る）
    if (this.anim && HERO_ANIMS[this.anim]) {
      const n = HERO_ANIMS[this.anim].frames, cw = (vw - 20) / n, rh = (vh - 20) / ids.length, z = Math.min(rh / 52, cw / 60);
      ids.forEach((id, r) => { for (let f = 0; f < n; f++) drawHeroDressed(ctx, id, this.anim, f, 10 + cw * (f + 0.5), 10 + r * rh + rh * 0.86, { sx: z, sy: z, weaponId: this.w === 'none' ? null : this.w, time: this.t }); });
      return;
    }
    const cw = Math.min(62, (vw - 20) / anims.length), rh = (vh - 20) / ids.length, z = Math.min(this.zoom, cw / 40);
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ids.forEach((id, r) => anims.forEach((an, c) => {
      const x = 10 + c * cw + cw / 2, y = 10 + r * rh + rh * 0.78;
      const f = this.frame != null ? +this.frame : (this.t * HERO_ANIMS[an].fps) | 0;
      drawHeroDressed(ctx, id, an, f, x, y, { sx: z, sy: z, weaponId: this.w === 'none' ? null : this.w, time: this.t, vx: an === 'run' ? 300 : 0 });
      if (r === 0) ctx.fillText(an, x, 9);
    }));
  },
};
