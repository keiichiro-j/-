import { game } from '../game.js';
import { input } from '../core/input.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { touch } from '../ui/touch.js';
import { drawText, drawOrb, ORB_COLORS, COL } from '../ui/text.js';
import { Kamishibai, P } from './opening.js';
import { drawCastleHill, drawGifuDusk, drawLeaves } from './title.js';
// エンディング（設計書 3章・9章）：紙芝居風＋スタッフロール。いつでも飛ばせる。担当：UI

const IDS = ['leaf', 'minamo', 'gen', 'haku'];
export const ENDING = [
  {
    text: '六つの宝珠は、ふたたび金華山の城へもどりました。城の屋根に光があつまり、岐阜の空に ひさしぶりの青空がひろがります。',
    draw(ctx, x, y, w, h, t) {
      P.sky(ctx, x, y, w, h, '#4a90d8', '#f4ecd0');
      P.hills(ctx, x, y, w, h, 0.8, 0.12, '#8aa878', 2);
      drawCastleHill(ctx, x + w * 0.5, y + h * 0.42, y + h, 1.1, '#5a4a4a');
      P.sixOrbs(ctx, x + w * 0.5, y + h * 0.24, 70 + Math.max(0, 40 - t * 20), t * 1.5, 1, 1);
    },
  },
  {
    text: '火の竜は、宝珠のあたたかな光につつまれて、乗鞍の山で ふたたび おだやかな眠りにつきました。',
    draw(ctx, x, y, w, h, t) {
      P.sky(ctx, x, y, w, h, '#0e1430', '#3a4a7a');
      for (let i = 0; i < 30; i++) { ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.4 * Math.sin(t * 2 + i)})`; ctx.fillRect(x + (i * 131) % w, y + (i * 47) % (h * 0.5), 2, 2); }
      P.moon(ctx, x + w * 0.2, y + h * 0.2, 20);
      P.volcano(ctx, x + w * 0.55, y + h, 1.3, '#1a1a2a', 0.15);
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = 'bold 18px sans-serif'; ctx.fillText('z', x + w * 0.62, y + h * 0.42 - (t * 10) % 20); ctx.fillText('z', x + w * 0.66, y + h * 0.35 - (t * 10 + 10) % 20);
    },
  },
  {
    text: '長良川には鵜飼の篝火、郡上には踊りの太鼓、高山には祭りの屋台、白川郷には雪あかり。町に にぎわいがもどってきました。',
    draw(ctx, x, y, w, h, t) {
      P.sky(ctx, x, y, w, h, '#1a1a3a', '#6a3a5a');
      P.hills(ctx, x, y, w, h, 0.62, 0.1, '#2a2040', 3);
      P.lanterns(ctx, x + 20, x + w - 20, y + 40, t);
      for (let i = 0; i < 3; i++) P.gassho(ctx, x + w * (0.62 + i * 0.13), y + h * 0.66, 0.7, '#3a2a3a', true);
      ctx.fillStyle = '#1a2a4a'; ctx.fillRect(x, y + h * 0.75, w, h * 0.25);
      P.boat(ctx, x + w * 0.3 + Math.sin(t * 0.5) * 20, y + h * 0.8, 1, t);
      ctx.fillStyle = 'rgba(255,200,100,0.3)'; for (let i = 0; i < 8; i++) ctx.fillRect(x + w * 0.3 + Math.sin(t + i) * 30 + 20, y + h * 0.84 + i * 6, 30, 2);
    },
  },
  {
    text: '四人の仲間は、それぞれの町へ帰っていきます。「また いつか、いっしょに旅をしよう！」 ── おしまい。',
    draw(ctx, x, y, w, h, t) {
      P.sky(ctx, x, y, w, h, '#ff9a60', '#ffe8b8');
      P.hills(ctx, x, y, w, h, 0.78, 0.16, '#b86a5a', 6);
      ctx.fillStyle = '#6a4a3a'; ctx.fillRect(x, y + h * 0.86, w, h * 0.14);
      for (let i = 0; i < 4; i++) P.hero(ctx, IDS[i], x + w * (0.22 + i * 0.18), y + h * 0.88, 1.8, t + i * 0.25, 'win');
    },
  },
];

// スタッフ（名前は役職名だけ）
const ROLL = [
  ['ぎふクエスト 〜六つの宝珠〜', 'title'],
  ['', 'gap'],
  ['ディレクター', 'role'], ['ディレクター／リードプログラマ', 'name'],
  ['アート', 'role'], ['主人公・背景・小物のアート担当', 'name'],
  ['レベルデザイン', 'role'], ['ステージ設計担当', 'name'],
  ['敵・仕掛け', 'role'], ['敵と仕掛けの担当', 'name'],
  ['ボス', 'role'], ['ボス設計担当', 'name'],
  ['FX・サウンド', 'role'], ['天気・光・音の担当', 'name'],
  ['UI', 'role'], ['画面・操作・セーブの担当', 'name'],
  ['', 'gap'],
  ['題材', 'role'], ['岐阜県の名所・名物（地図・人物・団体は架空です）', 'name'],
  ['', 'gap'],
  ['制作', 'role'], ['ぎふクエスト製作委員会（架空）', 'name'],
  ['', 'gap'], ['', 'gap'],
  ['あそんでくれて ありがとう！', 'title'],
];
const RS = {
  title: { size: 30, color: COL.kinLight, stroke: COL.sumi, strokeW: 6, align: 'center', baseline: 'middle', serif: true, shadow: true },
  role: { size: 16, color: COL.kin, stroke: COL.sumi, strokeW: 3, align: 'center', baseline: 'middle' },
  name: { size: 22, color: COL.kinari, stroke: COL.sumi, strokeW: 4, align: 'center', baseline: 'middle' },
  hint: { size: 13, color: COL.kinari, stroke: COL.sumi, strokeW: 3, align: 'right', baseline: 'middle', alpha: 0.7 },
};
const LINE_H = { title: 56, role: 30, name: 46, gap: 40 };
let ROLL_H = 0; for (const [, k] of ROLL) ROLL_H += LINE_H[k];
const smax = (vh) => vh / 2 + 20 + ROLL_H - LINE_H.title / 2;

export const endingScene = {
  show: new Kamishibai(ENDING),
  phase: 'story', t: 0,
  enter(params) {
    this.show.reset(); this.phase = 'story'; this.t = 0; this.leaving = false;
    save.data.seenEnding = true; save.write();
    touch.show('menu');
    audio.bgm('ending');
  },
  exit() { touch.hide(); },
  update(dt) {
    if (this.leaving) return;
    this.t += dt;
    if (this.phase === 'story') {
      const r = this.show.update(dt);
      if (r === 'end') { this.phase = 'roll'; this.t = 0; }
      else if (r === 'skip') { this.phase = 'roll'; this.t = 0; }
      return;
    }
    const tp = touch.tap();
    const end = this.t * 40 > smax(540) + 240;   // 最後の行で止まって6秒
    if (end || input.pressed.back || input.pressed.pause || ((tp || input.pressed.confirm || input.pressed.jump) && this.t > 1.5)) {
      this.leaving = true; game.go('title', {}, 'wipe', { dur: 0.4 });
    }
  },
  draw(ctx, a, vw, vh) {
    if (this.phase === 'story') { this.show.draw(ctx, vw, vh, '#1a1420'); return; }
    const t = this.t;
    drawGifuDusk(ctx, vw, vh, t, { top: '#0a1028', mid: '#2a2050', low: '#6a3a5a', bottom: '#a05a50' });
    ctx.fillStyle = 'rgba(10,6,12,0.45)'; ctx.fillRect(0, 0, vw, vh);
    drawLeaves(ctx, vw, vh, t, 0.6);
    // 宝珠が並んで見守る
    for (let i = 0; i < 6; i++) drawOrb(ctx, 60 + i * 0, 80 + i * 70 + Math.sin(t + i) * 4, 9, ORB_COLORS[i], 0.8);
    let y = vh + 20 - Math.min(t * 40, smax(vh));
    for (const [txt, k] of ROLL) {
      const h = LINE_H[k];
      if (k !== 'gap' && y > -40 && y < vh + 40) drawText(ctx, txt, vw / 2, y + h / 2, RS[k]);
      y += h;
    }
    drawText(ctx, touch.enabled ? 'タップでタイトルへ' : 'Z でタイトルへ', vw - 16, vh - 14, RS.hint);
  },
};
