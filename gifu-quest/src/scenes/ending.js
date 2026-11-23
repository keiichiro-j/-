import { game } from '../game.js';
import { input } from '../core/input.js';
// 仮の画面（担当：UI が置き換える）
export const endingScene = {
  enter(params) { this.params = params; },
  update(dt) { if (input.pressed.confirm || input.pressed.jump) game.go('stage', { stage: 'test', char: 'leaf' }); },
  draw(ctx, a, vw, vh) { ctx.fillStyle = '#223'; ctx.fillRect(0, 0, vw, vh); ctx.fillStyle = '#fff'; ctx.font = '28px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('ending', vw / 2, vh / 2); },
};
