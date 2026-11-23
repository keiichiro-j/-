import { game } from '../game.js';
import { bakeAll } from '../gfx/atlas.js';
import { save } from '../core/save.js';
// 起動：絵の事前描画を分割して裏で行い、終わったらタイトルへ（タイトル表示まで2秒以内）
export const bootScene = {
  progress: 0, done: false,
  enter(params) {
    this.progress = 0; this.done = false; this.t = 0;
    save.load();
    bakeAll((p) => { this.progress = p; }, 12).then(() => { this.done = true; });
  },
  update(dt) {
    this.t += dt;
    if (this.done) {
      const q = new URLSearchParams(location.search);
      const st = q.get('stage');
      if (q.get('gallery')) game.go('gallery', { filter: q.get('gallery') }, 'none');
      else if (q.get('scene')) game.go(q.get('scene'), {}, 'none');
      else if (st != null) game.go('stage', { stage: /^\d+$/.test(st) ? Number(st) : st, char: q.get('char') || 'leaf' }, 'none');
      else game.go('title', {}, 'fade', { dur: 0.6 });
      this.done = false;
    }
  },
  draw(ctx, a, vw, vh) {
    ctx.fillStyle = '#120c10'; ctx.fillRect(0, 0, vw, vh);
    ctx.fillStyle = '#3a2a2a'; ctx.fillRect(vw / 2 - 150, vh / 2 + 40, 300, 6);
    ctx.fillStyle = '#e8b04a'; ctx.fillRect(vw / 2 - 150, vh / 2 + 40, 300 * this.progress, 6);
    ctx.fillStyle = '#e8dccb'; ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ぎふクエスト', vw / 2, vh / 2 - 10);
  },
};
