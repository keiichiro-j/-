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
