import { renderer } from './gfx/renderer.js';
import { input } from './core/input.js';
import { createLoop } from './core/timestep.js';
import { game } from './game.js';
import { audio } from './core/audio.js';
import { defineAllArt } from './art/index.js';
import { touch } from './ui/touch.js';
import './ui/debug.js';
// エンティティ登録（import するだけで registerEntity される）
import './systems/pickups.js';
import './actors/enemyTypes.js';
import './world/platforms.js';
import './world/liquids.js';
import './world/triggers.js';
import './bosses/index.js';
// 画面
import { bootScene } from './scenes/boot.js';
import { titleScene } from './scenes/title.js';
import { openingScene } from './scenes/opening.js';
import { selectScene } from './scenes/select.js';
import { worldmapScene } from './scenes/worldmap.js';
import { stageScene } from './scenes/stage.js';
import { resultsScene } from './scenes/results.js';
import { gameoverScene } from './scenes/gameover.js';
import { endingScene } from './scenes/ending.js';
import { settingsScene } from './scenes/settings.js';
import { galleryScene } from './scenes/gallery.js';

function start() {
  const canvas = document.getElementById('game');
  renderer.init(canvas);
  input.attach(window);
  touch.init(canvas);
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
  defineAllArt();
  game.register('boot', bootScene);
  game.register('title', titleScene);
  game.register('opening', openingScene);
  game.register('select', selectScene);
  game.register('worldmap', worldmapScene);
  game.register('stage', stageScene);
  game.register('results', resultsScene);
  game.register('gameover', gameoverScene);
  game.register('ending', endingScene);
  game.register('settings', settingsScene);
  game.register('gallery', galleryScene);
  const loop = createLoop({ update: (dt) => game.update(dt), render: (a) => game.render(a) });
  game.loop = loop;
  game.go('boot', {}, 'none');
  loop.start();
  window.__GQ__ = { game, loop, input };   // 自動テスト用
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
