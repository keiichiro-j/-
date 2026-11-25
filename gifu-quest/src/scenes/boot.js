import CHARS from '../data/characters.json';
import { game } from '../game.js';
import { bakeAll } from '../gfx/atlas.js';
import { save } from '../core/save.js';
import { cloud } from '../core/cloud.js';
// 起動：絵の事前描画を分割して裏で行い、終わったらタイトルへ（タイトル表示まで2秒以内）
export const bootScene = {
  progress: 0, done: false,
  enter(params) {
    this.progress = 0; this.done = false; this.t = 0;
    save.load();
    // 絵の焼き付けと、Google とのセーブ合わせを同時に（GAS の外ではすぐ終わる）
    Promise.all([bakeAll((p) => { this.progress = p; }, 12), cloud.init(save)]).then(() => { this.done = true; });
  },
  update(dt) {
    this.t += dt;
    if (this.done) {
      const q = new URLSearchParams(location.search);
      const st = q.get('stage');
      if (q.get('gallery')) game.go('gallery', { filter: q.get('gallery') }, 'none');
      else if (q.get('scene')) game.go(q.get('scene'), {}, 'none');
      else if (st != null) game.go('stage', { stage: /^\d+$/.test(st) ? Number(st) : st, char: CHARS[q.get('char')] ? q.get('char') : 'leaf' }, 'none');   // 存在しないキャラ名はリーフに
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
    if (cloud.status === 'connecting') { ctx.font = '15px sans-serif'; ctx.fillStyle = 'rgba(232,220,203,0.7)'; ctx.fillText('Google とつないでいます…', vw / 2, vh / 2 + 72); }
  },
};
