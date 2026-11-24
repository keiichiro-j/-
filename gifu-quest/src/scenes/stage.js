import { game } from '../game.js';
import { World } from '../world/world.js';
import { renderer } from '../gfx/renderer.js';
import { input } from '../core/input.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { events } from '../core/events.js';
import { LEVELS } from '../world/levels.js';
import { drawHud } from '../ui/hud.js';
import { touch } from '../ui/touch.js';
import { pauseMenu } from '../ui/menus.js';
import { drawDialogue, updateDialogue } from '../systems/dialogue.js';
import { weaponById } from '../systems/gacha.js';
import { progress } from '../systems/achievements.js';
import { toast } from '../ui/toast.js';
import META from '../data/stages.json';

// ステージ（プレイ中の画面）。params: { stage: 1..6 | 'test', char, checkpoint }
export const stageScene = {
  world: null, params: null, paused: false, intro: 0,
  enter(params) {
    // 設定画面などから戻る時は世界をそのまま再開する
    if (params.resume && this.world) { this.paused = false; touch.show('play'); audio.bgm(this.world.data.bgm || `stage${this.params.stage}`); return; }
    this.params = params;
    const data = LEVELS[params.stage];
    if (!data) throw new Error('level not found ' + params.stage);
    // 装備中の武器（持っていない・データに無い id は装備なし扱い。無いと主人公の作成で止まる）
    const eq = save.data.equipped, own = eq && save.data.weapons[eq];
    const weapon = own && weaponById(eq) ? { id: eq, lv: own.lv } : null;
    const W = new World(data, params.char || save.data.lastChar || 'leaf', { checkpoint: params.checkpoint, viewW: renderer.viewW, viewH: renderer.viewH, weapon });
    W.collectedSarubobo = save.data.sarubobo[params.stage] || [false, false, false];
    this.world = W;
    this.paused = false;
    this.intro = 2.2;    // ステージ名と天気を大きく表示
    touch.show('play');
    audio.bgm(data.bgm || `stage${params.stage}`);
    events.emit('stageEnter', { stage: params.stage });
  },
  exit() { touch.hide(); },
  update(dt) {
    const W = this.world;
    if (!W) return;
    if (this.paused) { const r = pauseMenu.update(dt); if (r) this.onPause(r); return; }
    // 一時停止は看板を読んでいる間も効く（看板は開いたまま。続けるとそのまま読める）
    if (input.pressed.pause && W.state === 'play') { this.paused = true; pauseMenu.open(); audio.sfx('pause'); return; }
    if (this.intro > 0) this.intro -= dt;   // ステージ名の帯は看板を読んでいる間も消えていく（巻物の後ろに残らない）
    if (W.dialogue) { if (updateDialogue(W, dt)) W.dialogue = null; return; }
    W.update(dt);
    if (W.result === 'clear') this.finish();
    else if (W.result === 'gameover') game.go('gameover', { stage: this.params.stage, char: W.charId }, 'fade', { dur: 0.8 });
  },
  onPause(r) {
    this.paused = false;
    if (r === 'retry') game.go('stage', { ...this.params, checkpoint: undefined }, 'iris');
    else if (r === 'map') game.go('worldmap', { stage: this.params.stage }, 'iris');
    else if (r === 'settings') game.go('settings', { back: 'stage-resume' }, 'fade');
  },
  finish() {
    const W = this.world, st = this.params.stage, d = save.data;
    if (W._finished) return;
    W._finished = true;
    const key = String(st);
    const prevBest = d.bestTime[key];
    const newBest = prevBest == null || W.stats.time < prevBest;
    if (typeof st === 'number') {
      if (!d.cleared.includes(st)) d.cleared.push(st);
      const old = d.sarubobo[key] || [false, false, false];
      d.sarubobo[key] = old.map((v, i) => v || W.stats.sarubobo[i]);
      if (newBest) d.bestTime[key] = W.stats.time;
      d.coins += W.stats.coins;
      for (const s of W.stats.signs) if (!d.seenSigns.includes(s)) d.seenSigns.push(s);
      d.lastChar = W.charId;
      // 称号・お題（累計の記録とお題を進め、得た称号の通知を積む。保存もここで）
      progress.stageCleared({ stage: st, char: W.charId, stats: W.stats, target: META.stages[key] ? META.stages[key].target : null });
      save.write();
    }
    game.go('results', { stage: st, char: W.charId, stats: W.stats, newBest, prevBest }, 'iris', { cx: renderer.viewW / 2, cy: renderer.viewH / 2 });
  },
  draw(ctx, alpha, vw, vh) {
    const W = this.world;
    if (!W) return;
    W.draw(ctx, this.paused || W.dialogue ? 1 : alpha, vw, vh);
    drawHud(ctx, W, vw, vh, this);
    touch.draw(ctx, vw, vh);   // タッチボタンは看板の巻物より下に（文字に重ならない）
    if (W.dialogue) drawDialogue(ctx, W, vw, vh);
    if (this.paused) pauseMenu.draw(ctx, vw, vh);
    else toast.draw(ctx, vw, vh);   // 称号・お題の通知（一時停止中はメニューと重ねない）
  },
};
