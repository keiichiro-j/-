import { defineSprite } from '../gfx/atlas.js';
import { HERO_ANIMS } from '../actors/player.js';
import CHARS from '../data/characters.json';
import { ell, rrect, poly, fs, lin, rad, line, glow, sparkle, shade, rgba, mix, drawCormorant } from './props.js';
// 主人公の絵（担当：アート）。スプライト名 hero_<id>_<anim>、64×64、基準点は足元中央（下端から10ドット上）。
//
// 作り：骨格（腰・胸・頭・腕・脚の角度）を「アニメ×コマ」の表で持ち、drawHero() 1つで全コマを描く。
//  - 角度は度。脚：[もも, ひざの曲げ]（0=真下、＋=前）。腕：[肩, ひじの曲げ]（体の傾きに足される。＋=前・上へ）
//  - g:true のコマは、低い方の足が地面(y=54)に着くよう腰の高さを自動で決める
//  - 右向きで描く（左向きは drawSprite の flip）
const GROUND = 54, CX = 32;
const D = Math.PI / 180;

// ------------------------------------------------------------------ 骨格の表
// 姿勢：{ x, y, g, t(胴の傾き), h(首), fl/bl(手前/奥の脚), fa/ba(手前/奥の腕), sx, sy, rot(全体の回転), e(目), m(口), w(刀の角度), fx }
const N = (o) => ({ x: 0, y: 0, g: true, t: 3, h: 0, fl: [4, 6], bl: [-5, 6], fa: [-8, 18], ba: [10, 18], sx: 1, sy: 1, rot: 0, e: 'n', m: 'n', ...o });
const sin = (f, n, ph = 0) => Math.sin((f / n) * Math.PI * 2 + ph);
const cos = (f, n, ph = 0) => Math.cos((f / n) * Math.PI * 2 + ph);
const pos = (v) => Math.max(0, v);

const BASE = {
  idle: (f) => { const b = [0, 1, 2, 1][f]; return N({ fl: [4, 6 + b * 3], bl: [-5, 6 + b * 3], t: 3 + b * 0.6, h: -b * 0.8, fa: [-8 - b, 18 + b * 2], ba: [10 + b, 18 + b * 2], sy: 1 + b * 0.008 }); },
  walk: (f) => {
    const s = sin(f, 8), c = cos(f, 8);
    return N({ t: 5, h: -2 + Math.abs(s), fl: [26 * s, 6 + 42 * pos(c) ** 1.4], bl: [-26 * s, 6 + 42 * pos(-c) ** 1.4], fa: [-24 * s, 22 + 10 * pos(s)], ba: [24 * s, 22 + 10 * pos(-s)] });
  },
  run: (f) => {
    const s = sin(f, 8), c = cos(f, 8);
    return N({ t: 15, h: -6, y: -1.6 * pos(Math.sin((f / 8) * Math.PI * 4 + 0.8)), fl: [44 * s + 6, 14 + 78 * pos(c) ** 1.2], bl: [-44 * s + 6, 14 + 78 * pos(-c) ** 1.2], fa: [-55 * s, 85], ba: [55 * s, 85], e: 'f', m: 'n' });
  },
  brake: () => N({ t: -16, h: 6, fl: [38, 4], bl: [-6, 46], fa: [-70, 35], ba: [-35, 45], sx: 1.04, sy: 0.96, e: 'f', m: 'g' }),
  jumpUp: (f) => N({ g: false, y: -2, t: 6, h: -4, fl: [62, 92], bl: [-14, 12 + f * 8], fa: [150 - f * 10, 15], ba: [-45, 40], sx: 0.94 + f * 0.03, sy: 1.07 - f * 0.03, m: 'o' }),
  apex: () => N({ g: false, y: -3, t: 4, fl: [55, 95], bl: [18, 85], fa: [100, 25], ba: [-95, 25], m: 'o' }),
  fall: (f) => N({ g: false, y: 0, t: 0, h: 5, fl: [12 + f * 4, 22], bl: [-14 - f * 4, 16], fa: [155 + f * 12, 10], ba: [-150 - f * 12, 20], e: 'o', m: 'o' }),
  land: () => N({ t: 18, h: 6, fl: [45, 92], bl: [-28, 84], fa: [35, 15], ba: [-40, 15], sx: 1.1, sy: 0.9, e: 'f' }),
  crouch: () => N({ t: 24, h: 8, fl: [72, 136], bl: [-6, 128], fa: [48, 40], ba: [30, 45], sy: 0.97 }),
  wall: () => N({ g: false, x: -1, y: 1, t: -4, h: 8, fl: [48, 70], bl: [6, 18], fa: [140, -25], ba: [100, 10], e: 'f', m: 'g' }),
  attack: (f) => [
    N({ t: -6, fl: [24, 14], bl: [-22, 12], fa: [-110, 70], ba: [40, 30], e: 'f', m: 'g' }),
    N({ t: 12, x: 2, fl: [30, 18], bl: [-28, 8], fa: [95, 0], ba: [-60, 20], e: 'f', m: 'o' }),
    N({ t: 10, x: 2, fl: [28, 16], bl: [-26, 8], fa: [80, 10], ba: [-50, 25], e: 'f', m: 'n' }),
    N({ t: 6, x: 1, fl: [22, 12], bl: [-20, 10], fa: [40, 30], ba: [-20, 25], e: 'n', m: 'n' }),
  ][f],
  attack2: (f) => [
    N({ t: -4, fl: [20, 30], bl: [-18, 28], fa: [160, 30], ba: [150, 40], e: 'f', m: 'g', fx: 'charge' }),
    N({ t: -8, fl: [20, 34], bl: [-18, 30], fa: [170, 20], ba: [160, 30], e: 'f', m: 'g', fx: 'charge2' }),
    N({ t: 16, x: 3, fl: [34, 20], bl: [-30, 6], fa: [90, 0], ba: [80, 10], e: 'f', m: 'o' }),
    N({ t: 8, x: 2, fl: [26, 14], bl: [-24, 10], fa: [60, 20], ba: [40, 30], e: 'n', m: 'n' }),
  ][f],
  hurt: (f) => N({ g: false, y: -1, x: -1, t: -24 - f * 4, h: -14, fl: [30 + f * 6, 46], bl: [-8, 24], fa: [140 + f * 10, 35], ba: [-140, 30], e: 'x', m: 'o' }),
  win: (f) => [
    N({ t: 14, h: 8, fl: [40, 80], bl: [-22, 76], fa: [30, 40], ba: [-30, 40], e: 'h', m: 'n' }),
    N({ g: false, y: -5, t: -2, h: -6, fl: [20, 40], bl: [-10, 30], fa: [175, 10], ba: [-40, 40], e: 'h', m: 'w' }),
    N({ g: false, y: -7, t: -4, h: -8, fl: [30, 70], bl: [-6, 50], fa: [178, 0], ba: [-60, 50], e: 'h', m: 'w' }),
    N({ t: 0, h: -4, fl: [8, 6], bl: [-8, 6], fa: [170, 5], ba: [-20, 90], e: 'h', m: 'w' }),
  ][f],
  fidget: (f) => [
    N({ h: 6, fa: [-6, 20], ba: [8, 20] }), N({ h: 10, e: 'b' }), N({ h: -8, e: 'n' }),
    N({ h: -8, e: 'b' }), N({ h: 2, fa: [10, 40] }), N({ h: 0 }),
  ][f],
  swim: (f) => {
    const s = sin(f, 4);
    return N({ g: false, y: -6, rot: 62, t: 0, h: -42, fl: [-6 + 22 * s, 24], bl: [-6 - 22 * s, 24], fa: [[170, 120, 60, 120][f], [0, 20, 30, 40][f]], ba: [[120, 60, 30, 160][f], 30], m: 'n' });
  },
  glide: (f) => N({ g: false, y: -2, t: 18, h: -10, fl: [-4, 40 + f * 6], bl: [-22, 46], fa: [96 + f * 6, -4], ba: [88 - f * 6, 4], e: 'n', m: 'w', fx: 'glide' }),
  dash: (f) => N({ g: false, y: 1, t: 36, h: -24, fl: [70, 100], bl: [-50, 16 + f * 4], fa: [-80, 15], ba: [-95, 15], e: 'f', m: 'g', fx: 'dash' }),
  slide: () => N({ t: -22, h: 10, fl: [78, 16], bl: [68, 34], fa: [-60, 25], ba: [-30, 30], sx: 1.02, e: 'f', m: 'w', fx: 'slide' }),
};

// キャラごとの技・勝利・放置の仕草（BASE を上書き）
const OVR = {
  leaf: {
    attack: (f) => ({ ...BASE.attack(f), fx: ['', 'leafhand', '', ''][f] }),
    fidget: (f) => [
      N({ h: 8, e: 'n', fa: [-8, 18], ba: [10, 18] }),
      N({ h: -8, e: 'b' }),
      N({ t: 0, ba: [-70, 110], fa: [-10, 25], h: -4, key: 1, e: 'f' }),
      N({ t: 0, ba: [-72, 120], fa: [-10, 25], h: -4, key: 2, e: 'f' }),
      N({ t: 0, ba: [-70, 110], fa: [-10, 25], h: -4, key: 3, e: 'h' }),
      N({ h: -10, e: 'h', m: 'w', fa: [20, 60], sprout: 1 }),
    ][f],
    win: (f) => ({ ...BASE.win(f), ba: f >= 1 ? [-170, 5] : BASE.win(f).ba, sprout: f % 2 }),
  },
  minamo: {
    attack: (f) => [
      N({ t: -8, fl: [20, 12], bl: [-20, 12], fa: [-130, 50], ba: [30, 25], e: 'f', m: 'g' }),
      N({ t: 10, x: 2, fl: [30, 14], bl: [-26, 8], fa: [125, -10], ba: [-40, 25], e: 'f', m: 'o' }),
      N({ t: 12, x: 2, fl: [30, 14], bl: [-26, 8], fa: [100, -5], ba: [-45, 25], e: 'f', m: 'w' }),
      N({ t: 5, x: 1, fl: [22, 12], bl: [-20, 10], fa: [50, 20], ba: [-20, 25], e: 'n', m: 'n' }),
    ][f],
    attack2: (f) => [
      N({ t: 2, fa: [150, 120], ba: [30, 20], e: 'f', m: 'n', fx: 'whistle' }),
      N({ t: 2, fa: [152, 125], ba: [70, 0], e: 'b', m: 'n', fx: 'whistle' }),
      N({ t: 8, x: 1, fl: [24, 12], bl: [-22, 10], fa: [110, 0], ba: [-30, 20], e: 'f', m: 'o' }),
      N({ t: 4, fa: [50, 20], ba: [-10, 25], e: 'n' }),
    ][f],
    fidget: (f) => [
      N({ fa: [170, 30], ba: [160, 30], h: -10, e: 'b', m: 'o', sy: 1.03 }),
      N({ fa: [175, 20], ba: [168, 25], h: -12, e: 'b', m: 'o', sy: 1.04 }),
      N({ fa: [-6, 20], ba: [10, 20], h: 6, e: 'n', bird: 1 }),
      N({ fa: [140, 120], ba: [10, 20], h: -6, e: 'h', m: 'w', bird: 2 }),
      N({ fa: [140, 125], ba: [10, 20], h: -8, e: 'h', m: 'w', bird: 3 }),
      N({ fa: [-6, 20], ba: [10, 20], h: 2, e: 'n', bird: 1 }),
    ][f],
    win: (f) => [
      N({ t: 10, h: 6, fl: [30, 60], bl: [-20, 56], fa: [20, 40], ba: [-20, 40], e: 'h' }),
      N({ g: false, y: -6, fl: [40, 90], bl: [-30, 70], fa: [165, 10], ba: [160, 10], e: 'h', m: 'w' }),
      N({ g: false, y: -4, fl: [30, 80], bl: [-20, 60], fa: [175, 0], ba: [150, 20], e: 'h', m: 'w', bird: 3 }),
      N({ t: 0, h: -6, fl: [10, 4], bl: [-12, 8], fa: [160, 30], ba: [40, 120], e: 'w', m: 'w' }),
    ][f],
    glide: (f) => ({ ...BASE.glide(f), fa: [100 + f * 8, -8], ba: [92 - f * 8, 0] }),
  },
  gen: {
    attack: (f) => [
      N({ t: -10, fl: [26, 20], bl: [-24, 16], fa: [-150, 60], ba: [-130, 70], w: -200, e: 'f', m: 'g' }),
      N({ t: 18, x: 3, fl: [40, 28], bl: [-32, 6], fa: [80, -10], ba: [70, 10], w: 70, e: 'f', m: 'o', fx: 'blur' }),
      N({ t: 22, x: 4, fl: [42, 34], bl: [-34, 6], fa: [40, -10], ba: [30, 10], w: 130, e: 'f', m: 'g' }),
      N({ t: 10, x: 2, fl: [30, 20], bl: [-26, 10], fa: [20, 20], ba: [10, 30], w: 150, e: 'n', m: 'n' }),
    ][f],
    attack2: (f) => [
      N({ t: 18, fl: [40, 70], bl: [-24, 60], fa: [10, 80], ba: [0, 90], w: 30, e: 'f', m: 'g' }),
      N({ t: 0, x: 1, g: false, y: -3, fl: [40, 60], bl: [-10, 30], fa: [150, -10], ba: [140, 10], w: -20, e: 'f', m: 'o', fx: 'blur2' }),
      N({ t: -6, g: false, y: -4, fl: [30, 50], bl: [-10, 30], fa: [175, 0], ba: [165, 10], w: -5, e: 'f', m: 'g' }),
      N({ t: 6, fl: [24, 16], bl: [-22, 12], fa: [60, 30], ba: [50, 40], w: 100, e: 'n' }),
    ][f],
    fidget: (f) => [
      N({ fa: [60, 60], ba: [40, 70], w: -10, e: 'n' }),
      N({ fa: [80, 70], ba: [50, 80], w: -5, e: 'f', h: 4, fx: 'gleam' }),
      N({ fa: [80, 70], ba: [50, 80], w: -5, e: 'f', h: 6, fx: 'gleam2' }),
      N({ fa: [150, 140], ba: [10, 20], w: -150, e: 'n', h: -2 }),
      N({ fa: [150, 140], ba: [10, 20], w: -150, e: 'b', h: -4, m: 'w' }),
      N({ fa: [150, 140], ba: [10, 20], w: -150, e: 'n', h: 2, m: 'w' }),
    ][f],
    win: (f) => [
      N({ t: 10, fl: [30, 50], bl: [-24, 40], fa: [60, 60], ba: [40, 70], w: 0, e: 'f' }),
      N({ t: 0, fl: [20, 12], bl: [-22, 10], fa: [150, 10], ba: [-20, 60], w: -170, e: 'f', m: 'w' }),
      N({ t: -4, fl: [22, 12], bl: [-24, 10], fa: [172, 0], ba: [-30, 80], w: -178, e: 'h', m: 'w', fx: 'gleam' }),
      N({ t: -4, fl: [22, 12], bl: [-24, 10], fa: [172, 0], ba: [-30, 80], w: -178, e: 'h', m: 'w', fx: 'gleam2' }),
    ][f],
  },
  haku: {
    attack: (f) => [
      N({ t: 26, fl: [50, 90], bl: [-20, 70], fa: [-60, 40], ba: [-70, 40], e: 'f', m: 'g' }),
      N({ t: 34, x: 3, g: false, fl: [66, 96], bl: [-46, 14], fa: [-80, 15], ba: [-95, 15], e: 'f', m: 'g', fx: 'dash' }),
      N({ t: 30, x: 3, g: false, fl: [60, 90], bl: [-40, 20], fa: [-70, 20], ba: [-90, 20], e: 'f', m: 'g', fx: 'dash' }),
      N({ t: 10, fl: [24, 20], bl: [-20, 16], fa: [20, 30], ba: [-10, 30], e: 'n' }),
    ][f],
    attack2: (f) => OVR.haku.attack(f),
    fidget: (f) => [
      N({ fa: [130, 140], ba: [120, 140], h: 6, t: 6, e: 'b' }),
      N({ fa: [132, 145], ba: [122, 145], h: 6, t: 6, e: 'b', m: 'o', fx: 'breath' }),
      N({ fa: [132, 145], ba: [122, 145], h: 4, t: 6, e: 'h', m: 'o', fx: 'breath2' }),
      N({ fl: [40, 80], bl: [-4, 6], fa: [-20, 30], ba: [20, 30], e: 'n', m: 'w' }),
      N({ fl: [4, 6], bl: [-30, 70], fa: [20, 30], ba: [-20, 30], e: 'n', m: 'w' }),
      N({ fa: [10, 40], ba: [0, 40], e: 'x', m: 'n', sx: 1.02, fx: 'shiver' }),
    ][f],
    win: (f) => [
      N({ t: 14, fl: [40, 80], bl: [-22, 76], fa: [30, 40], ba: [-30, 40], e: 'h' }),
      N({ g: false, y: -8, rot: -30, fl: [30, 60], bl: [-30, 60], fa: [120, 0], ba: [-120, 0], e: 'h', m: 'w' }),
      N({ g: false, y: -9, rot: -60, fl: [30, 60], bl: [-30, 60], fa: [120, 0], ba: [-120, 0], e: 'h', m: 'w' }),
      N({ t: 0, fl: [14, 4], bl: [-14, 4], fa: [130, 0], ba: [-130, 0], e: 'h', m: 'w' }),
    ][f],
  },
  sarubobo: {
    // お守り人形らしく、手を左右に広げて立つ
    idle: (f) => { const b = [0, 1, 2, 1][f]; return { ...BASE.idle(f), fa: [38 + b * 2, 8], ba: [-38 - b * 2, 8] }; },
    walk: (f) => ({ ...BASE.walk(f), fa: [30 - 20 * sin(f, 8), 10], ba: [-30 + 20 * sin(f, 8), 10] }),
    win: (f) => [
      N({ t: 10, fl: [30, 60], bl: [-24, 56], fa: [20, 40], ba: [-20, 40] }),
      N({ g: false, y: -6, fl: [28, 10], bl: [-28, 10], fa: [110, 0], ba: [-110, 0] }),
      N({ g: false, y: -8, rot: 8, fl: [32, 6], bl: [-32, 6], fa: [120, 0], ba: [-120, 0] }),
      N({ fl: [24, 2], bl: [-24, 2], fa: [125, 0], ba: [-125, 0], sy: 1.03 }),
    ][f],
    fidget: (f) => {
      const s = [0, 1, 0, -1, 0, 1][f];
      return N({ rot: s * 8, t: s * 4, fl: [10 + s * 6, 6], bl: [-10 + s * 6, 6], fa: [110 + s * 10, 10], ba: [-110 + s * 10, 10], sy: 1 + Math.abs(s) * 0.02 });
    },
  },
};

// ------------------------------------------------------------------ キャラの見た目
const P = {
  leaf: {
    hr: 9, th: 10.5, wb: 12, wt: 12.5, L1: 5.6, L2: 5.6, lw: 3.6, aw: 3.2, U: 5, F: 5, hand: 2.6,
    wood: '#c48c52', woodD: '#8a5a30', woodO: '#3e2410', brass: '#e8bc4c', brassD: '#a87a22', brassO: '#4e3408',
    leaf: '#6cc24a', leafD: '#3a8a2e', leafO: '#1e4a16', eye: '#9aff6a',
  },
  minamo: {
    hr: 9, th: 10, wb: 10, wt: 10.5, L1: 5.8, L2: 5.8, lw: 3.6, aw: 3.2, U: 5, F: 5, hand: 2.2,
    skin: '#ffdcbc', skinD: '#eaa888', skinO: '#6a3a2a', navy: '#30508e', navyD: '#1c2e5c', navyO: '#0c1430',
    white: '#f6f4ec', whiteD: '#c8c8c0', straw: '#cfa85c', strawD: '#8f6f30', strawO: '#4a3610', hair: '#221c2a', hairL: '#4a3e5a',
  },
  gen: {
    hr: 9.2, th: 11.5, wb: 14, wt: 15.5, L1: 5.6, L2: 5.4, lw: 4.8, aw: 4.4, U: 5.2, F: 5.2, hand: 3,
    skin: '#f0c08e', skinD: '#c48656', skinO: '#5a2e1a', red: '#b8553a', redD: '#7e3424', redO: '#3a140c',
    apron: '#6b4a32', apronD: '#3e2a1c', pants: '#3c3a4e', pantsD: '#26243a', hair: '#2a1a14', band: '#f4f2ea',
  },
  haku: {
    hr: 8.8, th: 9.2, wb: 11.5, wt: 11, L1: 5, L2: 5, lw: 3.8, aw: 3.4, U: 4.4, F: 4.4, hand: 2.5,
    skin: '#ffe6d8', skinD: '#f0b0a0', skinO: '#6a3e3a', white: '#f6f8fc', whiteD: '#c4d0e4', whiteO: '#3e4c66',
    blue: '#8ccaf0', blueD: '#4a88c0', blueO: '#1e3a5a', straw: '#dcbc6a', strawD: '#9a7a3a', strawO: '#4a3814', hair: '#eef4fc', hairD: '#a8bcd8',
  },
  sarubobo: {
    hr: 8.6, th: 9.6, wb: 11, wt: 10, L1: 5.4, L2: 5.4, lw: 4.6, aw: 4.2, U: 4.8, F: 4.6, hand: 2.6,
    red: '#d8332e', redL: '#f26250', redD: '#9e1f1c', redO: '#4a0c0a', black: '#262626', blackL: '#4a4a4a',
  },
};

// ------------------------------------------------------------------ 描画の部品
function capsule(ctx, pts, w, fill, out, hi) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.strokeStyle = out; ctx.lineWidth = w + 2.2; ctx.stroke();
  ctx.strokeStyle = fill; ctx.lineWidth = w; ctx.stroke();
  if (hi) {
    // 光の当たる側（前・上）に細い明るい線
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
      let nx = -dy / L, ny = dx / L; if (nx + -ny < 0) { nx = -nx; ny = -ny; }
      const x = pts[i].x + nx * w * 0.22, y = pts[i].y + ny * w * 0.22;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = hi; ctx.lineWidth = w * 0.32; ctx.stroke();
  }
}
const pt = (x, y) => ({ x, y });
const along = (p, a, L) => pt(p.x + Math.sin(a) * L, p.y + Math.cos(a) * L);
function circle(ctx, p, r, fill, out, lw = 1) { ell(ctx, p.x, p.y, r, r); fs(ctx, fill, out, lw); }
function foot(ctx, a, rot, len, h, fill, out, sole) {
  ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(rot);
  ctx.beginPath(); ctx.moveTo(-1.8, -1.6); ctx.lineTo(len * 0.35, -1.8); ctx.quadraticCurveTo(len, -1.4, len, h * 0.6); ctx.lineTo(len, h); ctx.lineTo(-2, h); ctx.quadraticCurveTo(-2.6, 0, -1.8, -1.6); ctx.closePath();
  fs(ctx, fill, out, 1.1);
  if (sole) { ctx.fillStyle = sole; ctx.fillRect(-2, h - 1, len + 2, 1); }
  ctx.restore();
}
/** 胴の台形（ローカル座標：腰が原点、上が -y） */
function torsoPath(ctx, C, wb = C.wb, wt = C.wt, th = C.th) {
  ctx.beginPath();
  ctx.moveTo(-wb / 2, 1);
  ctx.quadraticCurveTo(-wb / 2 - 1, -th * 0.5, -wt / 2, -th + 2);
  ctx.quadraticCurveTo(-wt / 2, -th, -wt / 2 + 2.5, -th);
  ctx.lineTo(wt / 2 - 2.5, -th);
  ctx.quadraticCurveTo(wt / 2, -th, wt / 2, -th + 2);
  ctx.quadraticCurveTo(wb / 2 + 1, -th * 0.5, wb / 2, 1);
  ctx.closePath();
}

// ---- 目と口（頭のローカル：中心が原点、右が顔）
function eyes(ctx, r, e, opt = {}) {
  const ink = opt.ink || '#1e1428';
  const ex = [r * 0.2, r * 0.74], ey = r * 0.12 + (opt.dy || 0), sz = opt.size || 1;
  for (let i = 0; i < 2; i++) {
    const x = ex[i], w = (i ? 1.05 : 1.45) * sz, h = 2.6 * sz;
    ctx.strokeStyle = ink; ctx.lineCap = 'round';
    if (e === 'b' || e === 'w' && i === 0) { ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(x - w, ey + 0.6); ctx.quadraticCurveTo(x, ey + 1.6, x + w, ey + 0.6); ctx.stroke(); continue; }
    if (e === 'h') { ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - w, ey + 0.8); ctx.quadraticCurveTo(x, ey - 1.8, x + w, ey + 0.8); ctx.stroke(); continue; }
    if (e === 'x') { ctx.lineWidth = 1.1; const s = i ? -1 : 1; ctx.beginPath(); ctx.moveTo(x - w * s, ey - 1.6); ctx.lineTo(x + w * s, ey); ctx.lineTo(x - w * s, ey + 1.6); ctx.stroke(); continue; }
    const hh = e === 'f' ? h * 0.8 : e === 'o' ? h * 1.05 : h;
    ell(ctx, x, ey + (e === 'f' ? 0.4 : 0), w, hh); ctx.fillStyle = ink; ctx.fill();
    if (opt.iris) { ell(ctx, x + 0.2, ey + hh * 0.35, w * 0.75, hh * 0.45); ctx.fillStyle = opt.iris; ctx.fill(); }
    ctx.fillStyle = '#ffffff'; ell(ctx, x + w * 0.25, ey - hh * 0.38, w * 0.48, hh * 0.32); ctx.fill();
    if (e === 'o') { ctx.fillStyle = '#ffffff'; ell(ctx, x - w * 0.3, ey + hh * 0.4, 0.4, 0.4); ctx.fill(); }
  }
  if (opt.brow) {
    const ang = e === 'f' || e === 'x' ? 0.35 : e === 'o' ? -0.25 : 0.12;
    for (let i = 0; i < 2; i++) {
      const x = ex[i], y = ey - 3.8 * sz - (e === 'o' ? 0.8 : 0);
      ctx.save(); ctx.translate(x, y); ctx.rotate(i ? -ang : ang);
      ctx.strokeStyle = opt.brow; ctx.lineWidth = opt.browW || 1; ctx.beginPath(); ctx.moveTo(-(i ? 1.2 : 1.8), 0); ctx.lineTo(i ? 1.2 : 1.8, 0); ctx.stroke();
      ctx.restore();
    }
  }
}
function mouth(ctx, r, m, ink = '#5a2020', dy = 0) {
  const x = r * 0.5, y = r * 0.56 + dy;
  ctx.strokeStyle = ink; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
  if (m === 'n') { ctx.beginPath(); ctx.moveTo(x - 1.2, y); ctx.quadraticCurveTo(x, y + 0.9, x + 1.1, y - 0.1); ctx.stroke(); }
  else if (m === 'g') { ctx.beginPath(); ctx.moveTo(x - 1.4, y + 0.3); ctx.lineTo(x + 1.2, y); ctx.stroke(); }
  else if (m === 'o') { ell(ctx, x, y + 0.4, 1.1, 1.4); fs(ctx, '#7a2a2a', ink, 0.6); }
  else if (m === 'w') { ctx.beginPath(); ctx.moveTo(x - 1.8, y - 0.4); ctx.quadraticCurveTo(x, y + 2.6, x + 1.6, y - 0.6); ctx.closePath(); fs(ctx, '#a83a3a', ink, 0.7); }
}
function blush(ctx, r, a = 0.45) {
  ctx.fillStyle = `rgba(255,110,110,${a})`;
  ell(ctx, r * 0.08, r * 0.5, 1.8, 1); ctx.fill();
  ell(ctx, r * 0.9, r * 0.5, 1, 0.9); ctx.fill();
}
function headBall(ctx, r, fill, fillD, out) {
  ell(ctx, 0, 0, r * 1.02, r * 0.96);
  fs(ctx, rad(ctx, r * 0.35, -r * 0.35, 1, r * 1.3, [0, shade(fill, 0.12), 0.55, fill, 1, fillD]), out, 1.15);
}

// ------------------------------------------------------------------ 各キャラ
const DRAW = {
  // ---------------------------------------------------------------- リーフ：森のからくりロボ
  leaf: {
    back(ctx, C, J, Q) {
      // 背中のぜんまい鍵
      ctx.save(); ctx.translate(J.hip.x, J.hip.y); ctx.rotate(J.t);
      const k = Q.key ? Q.key : 0;
      ctx.translate(-C.wb / 2 - 1, -C.th * 0.55);
      line(ctx, 0, 0, -3, 0, C.brassO, 2.6); line(ctx, 0, 0, -3, 0, C.brassD, 1.4);
      ctx.translate(-4, 0); ctx.scale(Math.cos(k * 1.2) * 0.6 + 0.4 * Math.sign(Math.cos(k * 1.2) || 1), 1);
      ctx.beginPath(); ctx.ellipse(0, -2.6, 1.9, 2.6, 0, 0, 7); ctx.ellipse(0, 2.6, 1.9, 2.6, 0, 0, 7); fs(ctx, C.brass, C.brassO, 1);
      ctx.restore();
    },
    leg(ctx, C, h, k, a, back, rot) {
      const W = back ? shade(C.wood, -0.2) : C.wood;
      capsule(ctx, [h, k, a], C.lw, W, C.woodO, back ? null : rgba('#ffe0b0', 0.45));
      circle(ctx, k, 1.9, back ? C.brassD : C.brass, C.brassO, 0.9);
      foot(ctx, a, rot, 4.2, 2.4, back ? shade(C.brass, -0.3) : C.brass, C.brassO, C.brassO);
    },
    arm(ctx, C, s, e, h, back) {
      const W = back ? shade(C.wood, -0.2) : C.wood;
      capsule(ctx, [s, e, h], C.aw, W, C.woodO, back ? null : rgba('#ffe0b0', 0.45));
      circle(ctx, e, 1.7, back ? C.brassD : C.brass, C.brassO, 0.9);
      circle(ctx, h, C.hand, back ? shade(C.brass, -0.25) : C.brass, C.brassO, 1);
      ctx.fillStyle = 'rgba(255,255,220,0.7)'; ell(ctx, h.x + 0.6, h.y - 0.8, 0.9, 0.7); ctx.fill();
    },
    torso(ctx, C) {
      torsoPath(ctx, C);
      fs(ctx, lin(ctx, 6, -C.th, -6, 0, [0, shade(C.wood, 0.15), 0.6, C.wood, 1, C.woodD]), C.woodO, 1.2);
      ctx.save(); torsoPath(ctx, C); ctx.clip();
      ctx.strokeStyle = rgba(C.woodO, 0.35); ctx.lineWidth = 0.6;
      for (const x of [-3, 1.5]) { ctx.beginPath(); ctx.moveTo(x, 1); ctx.quadraticCurveTo(x + 0.6, -C.th / 2, x, -C.th); ctx.stroke(); }
      // 真鍮の帯
      ctx.fillStyle = lin(ctx, 0, -2.5, 0, 0.5, [0, C.brass, 1, C.brassD]); ctx.fillRect(-8, -2.2, 16, 2.6);
      ctx.fillStyle = lin(ctx, 0, -C.th, 0, -C.th + 2.4, [0, C.brass, 1, C.brassD]); ctx.fillRect(-8, -C.th, 16, 2.4);
      ctx.fillStyle = C.brassO; for (let x = -4; x <= 4; x += 4) { ctx.fillRect(x, -1.2, 0.8, 0.8); }
      ctx.restore();
      // 胸の歯車
      const gx = 2, gy = -C.th * 0.52;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 2 ? 3.2 : 4.1; ctx.lineTo(gx + Math.cos(a) * r, gy + Math.sin(a) * r); }
      ctx.closePath(); fs(ctx, lin(ctx, gx, gy - 4, gx, gy + 4, [0, '#fff0a0', 0.4, C.brass, 1, C.brassD]), C.brassO, 0.9);
      circle(ctx, pt(gx, gy), 1.7, rad(ctx, gx - 0.4, gy - 0.4, 0.2, 2, [0, '#e8ffd0', 1, C.leaf]), C.leafO, 0.7);
      // 葉っぱの襟
      for (let i = -2; i <= 2; i++) {
        ctx.save(); ctx.translate(i * 2.6, -C.th + 0.5); ctx.rotate(i * 0.45 + Math.PI);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(2.2, 2.2, 0, 4.6); ctx.quadraticCurveTo(-2.2, 2.2, 0, 0);
        fs(ctx, i % 2 ? C.leafD : C.leaf, C.leafO, 0.8); ctx.restore();
      }
    },
    head(ctx, C, Q) {
      const r = C.hr;
      // 若葉のアンテナ
      const sp = Q.sprout ? 1 : 0;
      line(ctx, -1, -r + 1, -1.5, -r - 4, C.leafO, 1.8); line(ctx, -1, -r + 1, -1.5, -r - 4, C.leafD, 0.9);
      for (const [s, a] of [[1, 0.7 + sp * 0.3], [-1, -0.8 - sp * 0.3]]) {
        ctx.save(); ctx.translate(-1.5, -r - 4); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(2.8, -2, 0, -6.4); ctx.quadraticCurveTo(-2.8, -2, 0, 0);
        fs(ctx, lin(ctx, -2, 0, 2, -6, [0, C.leafD, 1, '#b4f080']), C.leafO, 0.9);
        line(ctx, 0, -0.5, 0, -5, rgba('#e8ffc8', 0.8), 0.5);
        ctx.restore();
      }
      // 木の頭（角の丸い箱）
      rrect(ctx, -r, -r * 0.92, r * 2.05, r * 1.88, r * 0.62);
      fs(ctx, lin(ctx, r, -r, -r, r, [0, shade(C.wood, 0.2), 0.5, C.wood, 1, C.woodD]), C.woodO, 1.2);
      ctx.save(); rrect(ctx, -r, -r * 0.92, r * 2.05, r * 1.88, r * 0.62); ctx.clip();
      ctx.strokeStyle = rgba(C.woodO, 0.3); ctx.lineWidth = 0.6;
      for (let y = -r * 0.6; y < r; y += 3.4) { ctx.beginPath(); ctx.moveTo(-r, y); ctx.bezierCurveTo(-r * 0.3, y - 1, r * 0.3, y + 1, r * 1.1, y); ctx.stroke(); }
      ctx.restore();
      // 耳の歯車
      const ex = -r * 0.25, ey = r * 0.15;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, rr = i % 2 ? 2.4 : 3.2; ctx.lineTo(ex + Math.cos(a) * rr, ey + Math.sin(a) * rr); }
      ctx.closePath(); fs(ctx, C.brass, C.brassO, 0.8); circle(ctx, pt(ex, ey), 1, C.brassD, null);
      // 顔の真鍮の枠とガラスの目
      rrect(ctx, r * 0.02, -r * 0.42, r * 1.06, r * 0.98, 2.2);
      fs(ctx, lin(ctx, 0, -r * 0.4, 0, r * 0.6, [0, '#2a3a2a', 1, '#101810']), C.brassO, 1);
      ctx.strokeStyle = C.brass; ctx.lineWidth = 0.8; rrect(ctx, r * 0.02 + 0.6, -r * 0.42 + 0.6, r * 1.06 - 1.2, r * 0.98 - 1.2, 1.8); ctx.stroke();
      const e = Q.e;
      const lens = [[r * 0.34, 1.0], [r * 0.83, 0.65]];
      for (const [x, s] of lens) {
        const y = r * 0.06;
        if (e === 'b' || e === 'h' || e === 'w') {
          ctx.strokeStyle = C.eye; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
          ctx.beginPath();
          if (e === 'h' || e === 'w') { ctx.moveTo(x - 2 * s, y + 0.8); ctx.quadraticCurveTo(x, y - 2, x + 2 * s, y + 0.8); } else { ctx.moveTo(x - 2 * s, y); ctx.lineTo(x + 2 * s, y); }
          ctx.stroke(); continue;
        }
        if (e === 'x') { ctx.strokeStyle = '#ff9a6a'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(x - 1.6 * s, y - 1.6); ctx.lineTo(x + 1.6 * s, y + 1.6); ctx.moveTo(x + 1.6 * s, y - 1.6); ctx.lineTo(x - 1.6 * s, y + 1.6); ctx.stroke(); continue; }
        const rr = e === 'f' ? 2 : e === 'o' ? 2.8 : 2.5;
        glow(ctx, x, y, 5, C.eye, 0.35);
        ell(ctx, x, y, rr * s, rr * (e === 'f' ? 0.75 : 1)); fs(ctx, rad(ctx, x - 0.6, y - 0.6, 0.2, rr, [0, '#f0ffe0', 0.5, C.eye, 1, '#3aa82a']), null);
        ctx.fillStyle = '#ffffff'; ell(ctx, x - 0.7 * s, y - 0.9, 0.7 * s, 0.6); ctx.fill();
      }
      // 口のスピーカー
      ctx.fillStyle = C.brassO; for (let i = 0; i < 3; i++) ctx.fillRect(r * 0.38 + i * 1.6, r * 0.66, 0.9, Q.m === 'o' || Q.m === 'w' ? 1.6 : 0.8);
      // ボルト
      ctx.fillStyle = C.brass; for (const [x, y] of [[-r * 0.7, -r * 0.55], [-r * 0.7, r * 0.6]]) { ell(ctx, x, y, 0.9, 0.9); ctx.fill(); }
    },
  },

  // ---------------------------------------------------------------- ミナモ：長良川の鵜匠の娘
  minamo: {
    back(ctx, C, J) {
      // ポニーテール（頭巾の下から）
      const h = J.head;
      ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(J.ha);
      ctx.beginPath(); ctx.moveTo(-C.hr * 0.6, -1); ctx.quadraticCurveTo(-C.hr - 5, 0 + J.sway, -C.hr - 3, 8 + J.sway); ctx.quadraticCurveTo(-C.hr - 1, 3, -C.hr * 0.4, 3); ctx.closePath();
      fs(ctx, lin(ctx, 0, -2, 0, 9, [0, C.hairL, 1, C.hair]), '#0a0810', 1);
      ctx.fillStyle = '#e04040'; ell(ctx, -C.hr * 0.85, 0.5, 1.2, 1.8, 0.3); ctx.fill();
      ctx.restore();
    },
    leg(ctx, C, h, k, a, back, rot) {
      capsule(ctx, [h, k, a], C.lw, back ? C.navyD : C.navy, C.navyO, back ? null : rgba('#8ab0f0', 0.5));
      // 脚絆（白）
      capsule(ctx, [pt(k.x + (a.x - k.x) * 0.35, k.y + (a.y - k.y) * 0.35), a], C.lw - 0.2, back ? C.whiteD : C.white, C.navyO);
      foot(ctx, a, rot, 4, 2.2, back ? C.whiteD : C.white, C.navyO, C.strawD);
    },
    arm(ctx, C, s, e, h, back) {
      capsule(ctx, [s, e, h], C.aw, back ? C.navyD : C.navy, C.navyO, back ? null : rgba('#8ab0f0', 0.5));
      // 手甲（白い袖口）
      const m = pt(e.x + (h.x - e.x) * 0.55, e.y + (h.y - e.y) * 0.55);
      capsule(ctx, [m, h], C.aw - 0.3, back ? C.whiteD : C.white, C.navyO);
      circle(ctx, h, C.hand, back ? C.skinD : C.skin, C.skinO, 0.9);
      if (!back) {
        // 袖の鵜の紋
        ctx.save(); ctx.translate(s.x + (e.x - s.x) * 0.4, s.y + (e.y - s.y) * 0.4);
        ctx.fillStyle = 'rgba(245,245,235,0.9)'; ell(ctx, 0, 0, 1.4, 0.8, -0.3); ctx.fill(); ctx.fillRect(0.6, -1.4, 0.6, 1); ctx.restore();
      }
    },
    torso(ctx, C, Q, J) {
      torsoPath(ctx, C);
      fs(ctx, lin(ctx, 5, -C.th, -5, 0, [0, shade(C.navy, 0.15), 0.6, C.navy, 1, C.navyD]), C.navyO, 1.1);
      ctx.save(); torsoPath(ctx, C); ctx.clip();
      // 白い襟（右前）
      ctx.beginPath(); ctx.moveTo(-1, -C.th - 1); ctx.lineTo(1.8, -C.th - 1); ctx.lineTo(5.6, -3); ctx.lineTo(3.4, -3); ctx.closePath(); fs(ctx, C.white, null);
      line(ctx, -1, -C.th, 3.4, -3, rgba(C.navyO, 0.6), 0.6);
      ctx.restore();
      // 帯
      rrect(ctx, -C.wb / 2 - 0.4, -3.6, C.wb + 0.8, 2.8, 0.8); fs(ctx, lin(ctx, 0, -3.6, 0, -0.8, [0, '#f0f0e6', 1, '#b8b8ae']), C.navyO, 0.8);
      line(ctx, -C.wb / 2, -2.2, C.wb / 2, -2.2, '#d84040', 0.7);
      // 腰蓑
      const sw = J.sway * 0.6;
      ctx.beginPath(); ctx.moveTo(-C.wb / 2 - 1.4, -1.6); ctx.lineTo(C.wb / 2 + 1.4, -1.6);
      ctx.lineTo(C.wb / 2 + 2.2 + sw, 6.5); ctx.lineTo(-C.wb / 2 - 2 + sw, 6.5); ctx.closePath();
      fs(ctx, lin(ctx, 0, -2, 0, 7, [0, shade(C.straw, 0.15), 1, C.strawD]), C.strawO, 1);
      ctx.strokeStyle = rgba(C.strawO, 0.55); ctx.lineWidth = 0.6;
      for (let x = -C.wb / 2; x <= C.wb / 2 + 1; x += 1.5) { ctx.beginPath(); ctx.moveTo(x, -0.5); ctx.lineTo(x + sw * 0.9 + 0.3, 6.3); ctx.stroke(); }
      ctx.fillStyle = C.strawO; for (let x = -C.wb / 2 - 1; x <= C.wb / 2 + 1.5; x += 2) { poly(ctx, [x + sw, 6.2, x + 1 + sw, 6.2, x + 0.6 + sw, 7.6]); ctx.fill(); }
    },
    head(ctx, C, Q) {
      const r = C.hr;
      headBall(ctx, r, C.skin, C.skinD, C.skinO);
      // 髪（後ろ・横）
      ctx.beginPath(); ctx.moveTo(-r * 1.02, r * 0.2); ctx.quadraticCurveTo(-r * 1.05, -r * 0.6, -r * 0.2, -r * 0.7); ctx.lineTo(r * 0.1, -r * 0.2); ctx.quadraticCurveTo(-r * 0.2, r * 0.5, -r * 0.5, r * 0.85); ctx.quadraticCurveTo(-r * 0.9, r * 0.7, -r * 1.02, r * 0.2); ctx.closePath();
      fs(ctx, lin(ctx, 0, -r, 0, r, [0, C.hairL, 1, C.hair]), '#0a0810', 1);
      eyes(ctx, r, Q.e, { iris: '#3a5aa0', brow: '#221c2a', browW: 0.8 });
      mouth(ctx, r, Q.m);
      blush(ctx, r, 0.4);
      // 前髪
      ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.62); ctx.quadraticCurveTo(r * 0.4, -r * 0.95, r * 1.02, -r * 0.35);
      ctx.lineTo(r * 0.9, -r * 0.12); ctx.lineTo(r * 0.68, -r * 0.35); ctx.lineTo(r * 0.5, -r * 0.05); ctx.lineTo(r * 0.3, -r * 0.38); ctx.lineTo(r * 0.02, -r * 0.08); ctx.lineTo(-r * 0.12, -r * 0.42); ctx.closePath();
      fs(ctx, lin(ctx, 0, -r, 0, 0, [0, C.hairL, 1, C.hair]), '#0a0810', 0.9);
      // 風折烏帽子ふうの頭巾（紺）：後ろに折れた先
      ctx.beginPath();
      ctx.moveTo(r * 0.95, -r * 0.45);
      ctx.quadraticCurveTo(r * 0.6, -r * 1.25, -r * 0.3, -r * 1.12);
      ctx.quadraticCurveTo(-r * 0.9, -r * 1.05, -r * 1.25, -r * 1.5);
      ctx.lineTo(-r * 1.7, -r * 1.05);
      ctx.quadraticCurveTo(-r * 1.3, -r * 0.6, -r * 1.06, -r * 0.1);
      ctx.quadraticCurveTo(-r * 0.4, -r * 0.62, r * 0.95, -r * 0.45); ctx.closePath();
      fs(ctx, lin(ctx, r, -r * 1.2, -r, -r * 0.2, [0, '#4a64a6', 0.5, C.navy, 1, C.navyD]), C.navyO, 1.1);
      line(ctx, -r * 0.5, -r * 0.98, -r * 1.35, -r * 1.2, rgba('#9ab8f0', 0.6), 0.6);
    },
  },

  // ---------------------------------------------------------------- ゲン：関の刃物職人
  gen: {
    back(ctx, C, J, Q) {
      if (Q.w !== undefined) return;
      // 背負った刀（鞘）
      ctx.save(); ctx.translate(J.hip.x, J.hip.y); ctx.rotate(J.t);
      ctx.translate(-1, -C.th * 0.5); ctx.rotate(-0.95);
      rrect(ctx, -12, -1.4, 22, 2.8, 1.2); fs(ctx, lin(ctx, 0, -1.4, 0, 1.4, [0, '#4a3a3a', 1, '#140c0c']), '#000', 0.9);
      rrect(ctx, 10, -1.6, 7, 3.2, 1); fs(ctx, '#7e3424', '#2a0c06', 0.8);
      ctx.strokeStyle = '#e8d0a0'; ctx.lineWidth = 0.5; for (let x = 11; x < 17; x += 1.5) { ctx.beginPath(); ctx.moveTo(x, -1.4); ctx.lineTo(x + 1, 1.4); ctx.stroke(); }
      ell(ctx, 10, 0, 1, 2.6); fs(ctx, '#d8a840', '#4a3008', 0.6);
      ctx.restore();
    },
    leg(ctx, C, h, k, a, back, rot) {
      capsule(ctx, [h, k, a], C.lw, back ? C.pantsD : C.pants, '#121018', back ? null : rgba('#8a88a8', 0.5));
      capsule(ctx, [pt(k.x + (a.x - k.x) * 0.45, k.y + (a.y - k.y) * 0.45), a], C.lw - 0.4, back ? '#b8b0a0' : '#ece6d6', '#121018');
      foot(ctx, a, rot, 4.6, 2.6, back ? '#1a1a1a' : '#2e2e30', '#000', '#6a6a6a');
    },
    arm(ctx, C, s, e, h, back) {
      const sk = back ? C.skinD : C.skin;
      capsule(ctx, [s, e], C.aw + 0.6, back ? C.redD : C.red, C.redO, back ? null : rgba('#f0a080', 0.5));
      capsule(ctx, [e, h], C.aw, sk, C.skinO, back ? null : rgba('#ffe8c8', 0.6));
      const m = pt(e.x + (h.x - e.x) * 0.7, e.y + (h.y - e.y) * 0.7);
      capsule(ctx, [m, h], C.aw - 0.2, back ? '#c8c0b0' : '#f4f0e4', C.skinO);
      circle(ctx, h, C.hand, sk, C.skinO, 1);
    },
    torso(ctx, C) {
      torsoPath(ctx, C);
      fs(ctx, lin(ctx, 7, -C.th, -7, 0, [0, shade(C.red, 0.15), 0.6, C.red, 1, C.redD]), C.redO, 1.2);
      // 襟
      ctx.save(); torsoPath(ctx, C); ctx.clip();
      ctx.beginPath(); ctx.moveTo(-1.5, -C.th - 1); ctx.lineTo(1.5, -C.th - 1); ctx.lineTo(6, -4); ctx.lineTo(3, -4); ctx.closePath(); fs(ctx, C.redD, null);
      ctx.restore();
      // 前掛け（革）
      ctx.beginPath(); ctx.moveTo(-1, -C.th + 1.6); ctx.lineTo(C.wt / 2 + 0.2, -C.th + 1.6); ctx.lineTo(C.wb / 2 + 1.4, 7.5); ctx.quadraticCurveTo(2, 8.6, -2.6, 7.5); ctx.closePath();
      fs(ctx, lin(ctx, 0, -C.th, 0, 8, [0, shade(C.apron, 0.12), 1, C.apronD]), '#1e140c', 1.1);
      ctx.strokeStyle = 'rgba(240,220,190,0.35)'; ctx.lineWidth = 0.5; ctx.setLineDash([0.8, 0.8]);
      ctx.beginPath(); ctx.moveTo(0, -C.th + 2.6); ctx.lineTo(C.wt / 2 - 0.8, -C.th + 2.6); ctx.lineTo(C.wb / 2 + 0.4, 6.6); ctx.lineTo(-1.6, 6.6); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
      rrect(ctx, 1.5, -2.5, 4.5, 3.6, 0.6); fs(ctx, C.apronD, '#1e140c', 0.7);
      // 腰ひも
      line(ctx, -C.wb / 2, -3.4, C.wb / 2 + 0.5, -3.2, '#e8dcc0', 1.1);
      line(ctx, -C.wb / 2 - 0.5, -3.4, -C.wb / 2 - 2.5, -0.5, '#e8dcc0', 0.9);
    },
    head(ctx, C, Q) {
      const r = C.hr;
      // とがった短髪（後ろ）
      ctx.beginPath(); ctx.moveTo(-r * 1.05, r * 0.3);
      const spikes = [[-1.3, -0.1], [-1.0, -0.55], [-1.25, -0.75], [-0.6, -0.95], [-0.7, -1.3], [-0.1, -1.05], [0.1, -1.38], [0.5, -1.0], [0.9, -1.12], [0.95, -0.6]];
      for (const [x, y] of spikes) ctx.lineTo(x * r, y * r);
      ctx.lineTo(r * 0.4, -r * 0.4); ctx.closePath();
      fs(ctx, lin(ctx, 0, -r * 1.3, 0, r * 0.3, [0, '#5a4034', 1, C.hair]), '#0c0604', 1.1);
      headBall(ctx, r, C.skin, C.skinD, C.skinO);
      // もみあげ・後頭部
      ctx.beginPath(); ctx.moveTo(-r * 1.0, r * 0.25); ctx.quadraticCurveTo(-r * 1.0, -r * 0.6, -r * 0.1, -r * 0.65); ctx.lineTo(0, -r * 0.2); ctx.quadraticCurveTo(-r * 0.3, r * 0.2, -r * 0.45, r * 0.6); ctx.closePath();
      fs(ctx, C.hair, '#0c0604', 0.8);
      eyes(ctx, r, Q.e, { brow: '#2a1a14', browW: 1.6, size: 0.92, dy: 0.6 });
      mouth(ctx, r, Q.m);
      ctx.strokeStyle = 'rgba(150,80,40,0.6)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(r * 1.0, r * 0.2); ctx.lineTo(r * 1.08, r * 0.38); ctx.stroke();
      // ねじり鉢巻
      ctx.save(); ctx.rotate(-0.08);
      rrect(ctx, -r * 1.06, -r * 0.62, r * 2.1, 3.2, 1.4); fs(ctx, C.band, '#5a5040', 0.9);
      ctx.strokeStyle = '#c84a3a'; ctx.lineWidth = 0.9;
      for (let x = -r; x < r; x += 2.2) { ctx.beginPath(); ctx.moveTo(x, -r * 0.62 + 0.2); ctx.lineTo(x + 1.4, -r * 0.62 + 3); ctx.stroke(); }
      // 結び目と垂れ
      ell(ctx, -r * 1.05, -r * 0.48, 1.8, 1.8); fs(ctx, C.band, '#5a5040', 0.8);
      ctx.beginPath(); ctx.moveTo(-r * 1.1, -r * 0.55); ctx.quadraticCurveTo(-r * 1.6, -r * 0.5, -r * 1.75, -r * 0.05); ctx.lineTo(-r * 1.45, -r * 0.05); ctx.quadraticCurveTo(-r * 1.4, -r * 0.35, -r * 1.05, -r * 0.4); ctx.closePath(); fs(ctx, C.band, '#5a5040', 0.8);
      ctx.beginPath(); ctx.moveTo(-r * 1.08, -r * 0.42); ctx.quadraticCurveTo(-r * 1.35, -r * 0.1, -r * 1.3, r * 0.3); ctx.lineTo(-r * 1.05, r * 0.22); ctx.quadraticCurveTo(-r * 1.1, -r * 0.1, -r * 0.95, -r * 0.35); ctx.closePath(); fs(ctx, '#e8e0cc', '#5a5040', 0.8);
      ctx.restore();
    },
    hold(ctx, C, h, Q) {
      if (Q.w === undefined) return;
      // 抜き身の刀
      ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(-Q.w * D + Math.PI / 2);
      // w は「真下=0、前=+」の角度。刃は手から先へ
      rrect(ctx, -6, -1.3, 7, 2.6, 1); fs(ctx, '#6a2a1c', '#1e0804', 0.8);
      ctx.strokeStyle = '#e8d0a0'; ctx.lineWidth = 0.5; for (let x = -5.5; x < 0; x += 1.4) { ctx.beginPath(); ctx.moveTo(x, -1.2); ctx.lineTo(x + 1, 1.2); ctx.stroke(); }
      ell(ctx, 1.4, 0, 1.1, 3); fs(ctx, '#e0b048', '#4a3008', 0.8);
      ctx.beginPath(); ctx.moveTo(2.4, -1.2); ctx.lineTo(24, -1.6); ctx.quadraticCurveTo(28.5, -1.4, 29.5, 0.6); ctx.lineTo(2.4, 1.2); ctx.closePath();
      fs(ctx, lin(ctx, 0, -1.6, 0, 1.2, [0, '#ffffff', 0.45, '#d8e4ee', 1, '#7a8a9a']), '#2a323a', 0.8);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(4, 0.1); ctx.bezierCurveTo(10, -0.6, 16, 0.4, 26, -0.4); ctx.stroke();
      if (Q.fx === 'gleam' || Q.fx === 'gleam2') sparkle(ctx, Q.fx === 'gleam' ? 14 : 25, -1, 4.5, '#ffffff', 1);
      ctx.restore();
    },
  },

  // ---------------------------------------------------------------- ハク：白川郷の雪っ子
  haku: {
    back(ctx, C, J) {
      // わらの蓑（背中に垂れる）
      ctx.save(); ctx.translate(J.hip.x, J.hip.y); ctx.rotate(J.t);
      const sw = J.sway;
      ctx.beginPath(); ctx.moveTo(-1, -C.th - 2); ctx.quadraticCurveTo(-C.wb / 2 - 5, -C.th * 0.5, -C.wb / 2 - 4 + sw, 3);
      ctx.lineTo(-C.wb / 2 + 3 + sw * 0.5, 2); ctx.lineTo(1, -C.th * 0.4); ctx.closePath();
      fs(ctx, lin(ctx, 0, -C.th, 0, 3, [0, C.straw, 1, C.strawD]), C.strawO, 1);
      ctx.strokeStyle = rgba(C.strawO, 0.5); ctx.lineWidth = 0.5;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-2 - i * 1.1, -C.th + i); ctx.lineTo(-C.wb / 2 - 3.5 + i * 1.1 + sw, 2.5); ctx.stroke(); }
      ctx.restore();
    },
    leg(ctx, C, h, k, a, back, rot) {
      capsule(ctx, [h, k, a], C.lw, back ? C.blueD : C.blue, C.blueO, back ? null : rgba('#e0f4ff', 0.6));
      // 藁沓
      const m = pt(k.x + (a.x - k.x) * 0.25, k.y + (a.y - k.y) * 0.25);
      capsule(ctx, [m, a], C.lw + 0.6, back ? C.strawD : C.straw, C.strawO);
      ctx.strokeStyle = rgba(C.strawO, 0.6); ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(m.x - 1.5, m.y + 1); ctx.lineTo(m.x + 1.5, m.y + 1); ctx.stroke();
      foot(ctx, a, rot, 3.8, 2.4, back ? C.strawD : C.straw, C.strawO, C.strawO);
    },
    arm(ctx, C, s, e, h, back) {
      capsule(ctx, [s, e, h], C.aw + 0.8, back ? C.whiteD : C.white, C.whiteO, back ? null : '#ffffff');
      circle(ctx, h, C.hand, back ? C.blueD : C.blue, C.blueO, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ell(ctx, h.x + 0.4, h.y - 0.9, 0.9, 0.6); ctx.fill();
    },
    torso(ctx, C) {
      torsoPath(ctx, C, C.wb + 1, C.wt);
      fs(ctx, lin(ctx, 6, -C.th, -6, 0, [0, '#ffffff', 0.55, C.white, 1, C.whiteD]), C.whiteO, 1.1);
      ctx.save(); torsoPath(ctx, C, C.wb + 1, C.wt); ctx.clip();
      // 綿入れの水色の柄（雪の結晶の点）
      ctx.fillStyle = rgba(C.blue, 0.8);
      for (const [x, y] of [[-3, -6], [2, -8], [4, -3], [-1, -2.5], [-5, -1]]) { ell(ctx, x, y, 0.9, 0.9); ctx.fill(); ctx.fillRect(x - 1.6, y - 0.2, 3.2, 0.4); ctx.fillRect(x - 0.2, y - 1.6, 0.4, 3.2); }
      ctx.restore();
      // 襟と帯
      ctx.beginPath(); ctx.moveTo(-1, -C.th - 0.5); ctx.lineTo(2, -C.th - 0.5); ctx.lineTo(5.2, -3.2); ctx.lineTo(3, -3.2); ctx.closePath(); fs(ctx, C.blue, C.blueO, 0.6);
      rrect(ctx, -C.wb / 2 - 0.8, -3.4, C.wb + 1.6, 2.8, 1); fs(ctx, lin(ctx, 0, -3.4, 0, -0.6, [0, C.blue, 1, C.blueD]), C.blueO, 0.8);
      // 裾のふくらみ
      ctx.beginPath(); ctx.moveTo(-C.wb / 2 - 1.2, -1); ctx.quadraticCurveTo(0, 0, C.wb / 2 + 1.2, -1); ctx.lineTo(C.wb / 2 + 1.6, 2.4); ctx.quadraticCurveTo(0, 3.6, -C.wb / 2 - 1.6, 2.4); ctx.closePath();
      fs(ctx, lin(ctx, 0, -1, 0, 3, [0, '#ffffff', 1, C.whiteD]), C.whiteO, 0.9);
    },
    head(ctx, C, Q) {
      const r = C.hr;
      // わら帽子の後ろ側
      ctx.beginPath(); ctx.moveTo(r * 0.4, -r * 1.55); ctx.quadraticCurveTo(-r * 1.3, -r * 1.0, -r * 1.45, r * 0.9); ctx.lineTo(-r * 0.4, r * 0.95); ctx.closePath();
      fs(ctx, lin(ctx, 0, -r * 1.5, 0, r, [0, C.straw, 1, C.strawD]), C.strawO, 1);
      headBall(ctx, r, C.skin, C.skinD, C.skinO);
      // 白い髪
      ctx.beginPath(); ctx.moveTo(-r * 0.9, r * 0.5); ctx.quadraticCurveTo(-r * 1.1, -r * 0.7, r * 0.1, -r * 0.92); ctx.quadraticCurveTo(r * 0.9, -r * 0.8, r * 1.05, -r * 0.2);
      ctx.lineTo(r * 0.8, -r * 0.3); ctx.lineTo(r * 0.65, -r * 0.05); ctx.lineTo(r * 0.45, -r * 0.35); ctx.lineTo(r * 0.2, -r * 0.1); ctx.lineTo(0, -r * 0.4); ctx.quadraticCurveTo(-r * 0.4, -r * 0.1, -r * 0.5, r * 0.6); ctx.closePath();
      fs(ctx, lin(ctx, 0, -r, 0, r * 0.4, [0, '#ffffff', 1, C.hairD]), '#5a6a88', 0.9);
      eyes(ctx, r, Q.e, { iris: '#4a90d0', size: 1.08, dy: 0.4 });
      mouth(ctx, r, Q.m, '#7a3030', 0.4);
      blush(ctx, r, 0.6);
      // わら帽子（雪ん子のとがった頭巾）
      ctx.beginPath(); ctx.moveTo(r * 1.12, -r * 0.25); ctx.quadraticCurveTo(r * 0.8, -r * 1.05, r * 0.3, -r * 1.62); ctx.quadraticCurveTo(-r * 0.6, -r * 1.25, -r * 1.12, -r * 0.4);
      ctx.quadraticCurveTo(-r * 0.5, -r * 0.85, r * 0.4, -r * 0.78); ctx.quadraticCurveTo(r * 0.9, -r * 0.6, r * 1.12, -r * 0.25); ctx.closePath();
      fs(ctx, lin(ctx, r, -r * 1.6, -r, -r * 0.4, [0, shade(C.straw, 0.25), 0.5, C.straw, 1, C.strawD]), C.strawO, 1);
      ctx.strokeStyle = rgba(C.strawO, 0.5); ctx.lineWidth = 0.5;
      for (let i = 0; i < 7; i++) { const x = -r * 0.9 + i * r * 0.32; ctx.beginPath(); ctx.moveTo(r * 0.3, -r * 1.55); ctx.lineTo(x, -r * 0.7 - Math.abs(x) * 0.1); ctx.stroke(); }
      // 縁の雪
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 4; i++) { ell(ctx, r * (0.5 - i * 0.35), -r * (1.25 - i * 0.12), 1.6, 1); ctx.fill(); }
    },
  },

  // ---------------------------------------------------------------- さるぼぼ
  sarubobo: {
    back(ctx, C, J) {
      // 頭巾の垂れ（背中）
      const h = J.head;
      ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(J.ha);
      ctx.beginPath(); ctx.moveTo(-C.hr * 0.6, C.hr * 0.1); ctx.quadraticCurveTo(-C.hr * 1.3, C.hr * 0.8 + J.sway * 0.4, -C.hr * 1.0 + J.sway, C.hr * 1.5); ctx.lineTo(-C.hr * 0.2, C.hr * 0.9); ctx.closePath();
      fs(ctx, C.black, '#000', 1);
      ctx.restore();
    },
    leg(ctx, C, h, k, a, back) {
      capsule(ctx, [h, k, a], C.lw, back ? C.redD : C.red, C.redO, back ? null : rgba(C.redL, 0.9));
      // 先のとがった足
      const dx = a.x - k.x, dy = a.y - k.y, L = Math.hypot(dx, dy) || 1;
      ctx.beginPath(); ctx.moveTo(a.x - dy / L * 2.6, a.y + dx / L * 2.6); ctx.lineTo(a.x + dx / L * 3.6, a.y + dy / L * 3.6); ctx.lineTo(a.x + dy / L * 2.6, a.y - dx / L * 2.6); ctx.closePath();
      fs(ctx, back ? C.redD : C.red, C.redO, 1);
    },
    arm(ctx, C, s, e, h, back) {
      capsule(ctx, [s, e, h], C.aw, back ? C.redD : C.red, C.redO, back ? null : rgba(C.redL, 0.9));
      const dx = h.x - e.x, dy = h.y - e.y, L = Math.hypot(dx, dy) || 1;
      ctx.beginPath(); ctx.moveTo(h.x - dy / L * 2.2, h.y + dx / L * 2.2); ctx.lineTo(h.x + dx / L * 3.4, h.y + dy / L * 3.4); ctx.lineTo(h.x + dy / L * 2.2, h.y - dx / L * 2.2); ctx.closePath();
      fs(ctx, back ? C.redD : C.red, C.redO, 1);
    },
    torso(ctx, C) {
      ctx.beginPath(); ctx.ellipse(0, -C.th * 0.45, C.wb / 2 + 0.6, C.th * 0.62, 0, 0, Math.PI * 2);
      fs(ctx, rad(ctx, 2, -C.th * 0.7, 1, C.th, [0, C.redL, 0.6, C.red, 1, C.redD]), C.redO, 1.2);
      // 腹掛け（黒）
      ctx.beginPath(); ctx.moveTo(-1, -C.th + 1); ctx.lineTo(C.wb / 2, -C.th + 1.4); ctx.quadraticCurveTo(C.wb / 2 + 1.2, -2, C.wb / 2 - 1, 1.6); ctx.quadraticCurveTo(0, 3, -2.4, 0.4); ctx.closePath();
      fs(ctx, lin(ctx, 0, -C.th, 0, 2, [0, C.blackL, 1, C.black]), '#000', 1);
      ctx.fillStyle = '#e0b040'; ell(ctx, 2.4, -C.th * 0.45, 1.6, 1.6); ctx.fill();
      ctx.strokeStyle = '#7a5a10'; ctx.lineWidth = 0.5; ctx.stroke();
    },
    head(ctx, C) {
      const r = C.hr;
      headBall(ctx, r, C.red, C.redD, C.redO);
      ctx.fillStyle = rgba('#ffffff', 0.35); ell(ctx, r * 0.35, -r * 0.3, r * 0.3, r * 0.18, -0.4); ctx.fill();
      // 黒い頭巾（とがった角が2つ）
      ctx.beginPath();
      ctx.moveTo(r * 1.08, -r * 0.05);
      ctx.quadraticCurveTo(r * 1.25, -r * 0.8, r * 0.95, -r * 1.2);
      ctx.lineTo(r * 0.55, -r * 0.95);
      ctx.quadraticCurveTo(-r * 0.1, -r * 1.18, -r * 0.6, -r * 0.92);
      ctx.lineTo(-r * 1.0, -r * 1.18);
      ctx.quadraticCurveTo(-r * 1.35, -r * 0.5, -r * 1.05, r * 0.3);
      ctx.quadraticCurveTo(-r * 0.6, r * 0.6, -r * 0.4, r * 0.2);
      ctx.quadraticCurveTo(-r * 0.3, -r * 0.55, r * 0.2, -r * 0.62);
      ctx.quadraticCurveTo(r * 0.85, -r * 0.6, r * 1.08, -r * 0.05);
      ctx.closePath();
      fs(ctx, lin(ctx, r, -r * 1.3, -r, r * 0.3, [0, '#5a5a5a', 0.4, C.black, 1, '#0a0a0a']), '#000', 1.1);
      line(ctx, -r * 0.2, -r * 0.85, r * 0.6, -r * 0.82, 'rgba(255,255,255,0.25)', 0.8);
    },
  },
};

// ------------------------------------------------------------------ 共通の描画
const J = { hip: pt(0, 0), head: pt(0, 0), t: 0, ha: 0, sway: 0 };
function legJoints(C, hip, L) {
  const a = L[0] * D, k = L[1] * D;
  const knee = along(hip, a, C.L1), ankle = along(knee, a - k, C.L2);
  return { knee, ankle, rot: -(a - k) * 0.5 };
}
function armJoints(C, sh, A, t) {
  const a = A[0] * D + t, e = A[1] * D;
  const elbow = along(sh, a, C.U), hand = along(elbow, a + e, C.F);
  return { elbow, hand };
}

function drawFx(ctx, Q, C, front) {
  const fx = Q.fx;
  if (!fx) return;
  if (fx === 'dash' && !front) {
    // 雪けむり・速さの線
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 4; i++) { ell(ctx, 10 - i * 3.5, 44 - i * 4 + (i % 2) * 2, 4 - i * 0.6, 3 - i * 0.4); ctx.fill(); }
    ctx.strokeStyle = 'rgba(220,240,255,0.8)'; ctx.lineWidth = 1; ctx.lineCap = 'round';
    for (const [y, l] of [[26, 12], [33, 16], [40, 10]]) { ctx.beginPath(); ctx.moveTo(4, y); ctx.lineTo(4 + l, y); ctx.stroke(); }
  }
  if (fx === 'slide' && !front) {
    ctx.fillStyle = 'rgba(240,230,210,0.7)';
    for (let i = 0; i < 3; i++) { ell(ctx, 28 - i * 5, 52 - i, 3 - i * 0.6, 2 - i * 0.4); ctx.fill(); }
  }
  if (fx === 'glide' && !front) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.9;
    for (const [y, l] of [[22, 10], [30, 14]]) { ctx.beginPath(); ctx.moveTo(6, y); ctx.lineTo(6 + l, y); ctx.stroke(); }
  }
  if ((fx === 'charge' || fx === 'charge2') && front) {
    const c = C.eye || C.leaf || '#a8f06a';
    glow(ctx, CX + 2, 4 + (fx === 'charge2' ? 0 : 2), fx === 'charge2' ? 12 : 9, '#c8ff8a', 0.7);
    sparkle(ctx, CX + 8, 6, 3, '#ffffff', 0.9); sparkle(ctx, CX - 6, 10, 2, '#f0ffd0', 0.9);
  }
  if (fx === 'leafhand' && front) { sparkle(ctx, 50, 30, 3, '#e0ffc0', 0.9); }
  if ((fx === 'breath' || fx === 'breath2') && front) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    const k = fx === 'breath2' ? 1 : 0;
    ell(ctx, 45 + k * 3, 22 - k * 2, 2 + k, 1.6 + k * 0.6); ctx.fill(); ell(ctx, 49 + k * 4, 19 - k * 3, 1.4 + k * 0.6, 1.2 + k * 0.4); ctx.fill();
  }
  if (fx === 'shiver' && front) {
    ctx.strokeStyle = 'rgba(160,210,255,0.9)'; ctx.lineWidth = 0.9;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(CX + s * 13, 24); ctx.lineTo(CX + s * 15, 26); ctx.lineTo(CX + s * 13, 28); ctx.lineTo(CX + s * 15, 30); ctx.stroke(); }
  }
  if (fx === 'whistle' && front) { ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(46, 20, 3, -0.8, 0.8); ctx.stroke(); ctx.beginPath(); ctx.arc(46, 20, 5.5, -0.8, 0.8); ctx.stroke(); }
  if ((fx === 'blur' || fx === 'blur2') && !front) {
    ctx.strokeStyle = 'rgba(220,240,255,0.55)'; ctx.lineWidth = 2.2;
    ctx.beginPath(); if (fx === 'blur') ctx.arc(32, 30, 22, -2.4, 0.2); else ctx.arc(32, 34, 22, -0.2, -1.9, true); ctx.stroke();
  }
}

function drawHero(ctx, id, Q, bare = false) {
  const C = P[id], Dr = DRAW[id];
  const fl = legJoints(C, pt(0, 0), Q.fl), bl = legJoints(C, pt(0, 0), Q.bl);
  const footH = 2.4;
  let hy;
  if (Q.g) hy = GROUND - footH - Math.max(fl.ankle.y, bl.ankle.y) + Q.y;
  else hy = GROUND - footH - C.L1 - C.L2 + 1 + Q.y;
  const hx = CX + Q.x;
  ctx.save();
  ctx.translate(CX, GROUND); ctx.scale(Q.sx, Q.sy); ctx.translate(-CX, -GROUND);
  if (Q.rot) { const ry = hy - C.th * 0.6; ctx.translate(hx, ry); ctx.rotate(Q.rot * D); ctx.translate(-hx, -ry); }
  drawFx(ctx, Q, C, false);
  const hip = pt(hx, hy);
  const t = Q.t * D;
  const up = (L) => pt(hip.x + Math.sin(t) * L, hip.y - Math.cos(t) * L);
  const neck = up(C.th);
  const shF = up(C.th - 2.6), shB = pt(shF.x - Math.cos(t) * 1.6, shF.y - Math.sin(t) * 1.6);
  const ha = t * 0.6 + Q.h * D;
  const head = pt(neck.x + Math.sin(ha) * (C.hr * 0.82) + Math.cos(ha) * 0.8, neck.y - Math.cos(ha) * (C.hr * 0.82) + Math.sin(ha) * 0.8);
  J.hip = hip; J.head = head; J.t = t; J.ha = ha;
  J.sway = Math.max(-2.5, Math.min(2.5, -(Q.fl[0] + Q.bl[0]) * 0.03 - Q.t * 0.05 + (Q.g ? 0 : 1.5)));
  const shift = (j) => ({ knee: pt(j.knee.x + hip.x + 1.2, j.knee.y + hip.y), ankle: pt(j.ankle.x + hip.x + 1.2, j.ankle.y + hip.y), rot: j.rot });
  const F = shift(fl), B = shift(bl);
  B.knee.x -= 2.4; B.ankle.x -= 2.4;
  const aF = armJoints(C, shF, Q.fa, t), aB = armJoints(C, shB, Q.ba, t);

  Dr.back && Dr.back(ctx, C, J, Q);
  Dr.arm(ctx, C, shB, aB.elbow, aB.hand, true);
  Dr.leg(ctx, C, pt(hip.x - 1.2, hip.y - 0.5), B.knee, B.ankle, true, B.rot);
  Dr.leg(ctx, C, pt(hip.x + 1.2, hip.y - 0.5), F.knee, F.ankle, false, F.rot);
  ctx.save(); ctx.translate(hip.x, hip.y); ctx.rotate(t); Dr.torso(ctx, C, Q, J); ctx.restore();
  ctx.save(); ctx.translate(head.x, head.y); ctx.rotate(ha); Dr.head(ctx, C, Q); ctx.restore();
  if (id === 'minamo' && Q.bird) {
    // 手にとまる／肩にとまる小さな鵜
    if (Q.bird === 1) drawCormorant(ctx, shB.x - 1, shB.y - 3.5, 0.5, 0);
    else drawCormorant(ctx, aF.hand.x + 1, aF.hand.y - 3, 0.6, Q.bird === 2 ? -0.6 : 0.6);
  }
  Dr.arm(ctx, C, shF, aF.elbow, aF.hand, false);
  if (!bare) Dr.hold && Dr.hold(ctx, C, aF.hand, Q);
  drawFx(ctx, Q, C, true);
  ctx.restore();
}

export function heroPose(id, anim, f) {
  const o = OVR[id] && OVR[id][anim];
  return (o || BASE[anim] || BASE.idle)(f);
}

// 武器を装備した時に重ねて描くための、コマごとの位置（64×64の絵の中の座標）。
// hand: 手前の手, ang: 持った武器の向き（ラジアン。+x 方向が刃先）, neck: 首, t: 胴の傾き
const ANCH = new Map();
export function heroAnchor(id, anim, f) {
  const key = id + '|' + anim + '|' + f;
  let a = ANCH.get(key);
  if (a) return a;
  const C = P[id] || P.leaf, Q = heroPose(id, anim, f);
  const fl = legJoints(C, pt(0, 0), Q.fl), bl = legJoints(C, pt(0, 0), Q.bl);
  const hy = Q.g ? GROUND - 2.4 - Math.max(fl.ankle.y, bl.ankle.y) + Q.y : GROUND - 2.4 - C.L1 - C.L2 + 1 + Q.y;
  const hx = CX + Q.x, t = Q.t * D;
  const up = (L) => pt(hx + Math.sin(t) * L, hy - Math.cos(t) * L);
  const neck = up(C.th), shF = up(C.th - 2.6);
  const arm = armJoints(C, shF, Q.fa, t);
  const fore = Math.atan2(arm.hand.y - arm.elbow.y, arm.hand.x - arm.elbow.x);
  // 刀の角度 w があるコマはその向き、無いコマは前腕から少し前へ起こした向き
  let ang = Q.w !== undefined ? -Q.w * D + Math.PI / 2 : fore - 1.05;
  // 全体の回転と伸び縮み（drawHero と同じ順）
  const rot = (Q.rot || 0) * D, ry = hy - C.th * 0.6;
  const tf = (p) => {
    let x = p.x, y = p.y;
    if (rot) { const dx = x - hx, dy = y - ry; x = hx + dx * Math.cos(rot) - dy * Math.sin(rot); y = ry + dx * Math.sin(rot) + dy * Math.cos(rot); }
    return pt(CX + (x - CX) * Q.sx, GROUND + (y - GROUND) * Q.sy);
  };
  ang += rot;
  a = { hand: tf(arm.hand), neck: tf(neck), hip: tf(pt(hx, hy)), ang, t: t + rot, air: !Q.g };
  ANCH.set(key, a);
  return a;
}

export function defineHeroes() {
  for (const id of Object.keys(CHARS)) {
    if (!P[id]) continue;
    for (const [anim, A] of Object.entries(HERO_ANIMS)) {
      defineSprite(`hero_${id}_${anim}`, {
        w: 64, h: 64, frames: A.frames, ox: 32, oy: 54,
        draw(ctx, f) { drawHero(ctx, id, heroPose(id, anim, f)); },
      });
      // 自前の刀を持つコマがあるキャラは、武器を装備した時用に「素手」の絵も作る
      if (DRAW[id] && DRAW[id].hold && Array.from({ length: A.frames }, (_, f) => heroPose(id, anim, f)).some((q) => q.w !== undefined)) {
        defineSprite(`hero_${id}_${anim}_bare`, {
          w: 64, h: 64, frames: A.frames, ox: 32, oy: 54,
          draw(ctx, f) { drawHero(ctx, id, heroPose(id, anim, f), true); },
        });
      }
    }
  }
}
