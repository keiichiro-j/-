import { defineSprite } from '../gfx/atlas.js';
import { HERO_ANIMS } from '../actors/player.js';
import CHARS from '../data/characters.json';
// 主人公の絵（担当：アート）。スプライト名 hero_<id>_<anim>、64×64、基準点は足元中央（下端から10ドット上）
export function defineHeroes() {
  for (const [id, c] of Object.entries(CHARS)) {
    for (const [anim, A] of Object.entries(HERO_ANIMS)) {
      defineSprite(`hero_${id}_${anim}`, {
        w: 64, h: 64, frames: A.frames, ox: 32, oy: 54,
        draw(ctx, f) {
          const bob = anim === 'walk' || anim === 'run' ? Math.sin(f / A.frames * Math.PI * 2) * 2 : 0;
          ctx.fillStyle = c.color;
          ctx.beginPath(); ctx.roundRect(20, 12 + bob, 24, 42 - bob, 8); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.fillRect(34, 20 + bob, 6, 6);
          ctx.fillStyle = '#000'; ctx.fillRect(37, 22 + bob, 3, 3);
        },
      });
    }
  }
}
