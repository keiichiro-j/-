import { renderer } from './gfx/renderer.js';
import { input } from './core/input.js';
import { createLoop } from './core/timestep.js';
import { game } from './game.js';
import { audio } from './core/audio.js';
import { defineAllArt } from './art/index.js';
import { touch } from './ui/touch.js';
import { save } from './core/save.js';
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
import { galleryScene, dressupScene } from './scenes/gallery.js';
import { zukanScene } from './scenes/zukan.js';
import { gachaScene } from './scenes/gacha.js';
import { recordsScene } from './scenes/records.js';
import { bossrushScene } from './scenes/bossrush.js';
import { progress } from './systems/achievements.js';
import { events } from './core/events.js';
import { toast } from './ui/toast.js';
import { LEVELS } from './world/levels.js';

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
  game.register('dressup', dressupScene);
  game.register('zukan', zukanScene);
  game.register('gacha', gachaScene);
  game.register('records', recordsScene);
  game.register('bossrush', bossrushScene);
  // 称号・お題：イベントにつなぐ（名物看板の id はステージ1〜7から）
  const signIds = [];
  for (let n = 1; n <= 7; n++) for (const e of (LEVELS[n] && LEVELS[n].entities) || []) if (e.type === 'sign') { const id = e.id || e.title; if (id && !signIds.includes(id)) signIds.push(id); }
  progress.install({ events, save, toast, signIds });
  const loop = createLoop({ update: (dt) => game.update(dt), render: (a, dt) => game.render(a, dt) });
  game.loop = loop;
  game.go('boot', {}, 'none');
  loop.start();
  window.__GQ__ = { game, loop, input, progress, toast };   // 自動テスト用
  window.__GQ_SAVE__ = save;
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
