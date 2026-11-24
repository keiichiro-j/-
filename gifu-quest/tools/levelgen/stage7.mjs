// ステージ7 うらステージ・天空の宝殿（夜／雷雨・霧）。全ステージのギミックを組み合わせた高難度。ボスはなく、奥の宝珠（goal）を取るとクリア
// 導入：太鼓の足場で穴を渡る → 雷の中をゴンドラで登る。地面の H から隠し部屋
// 展開：氷の上から合掌の屋根を滑って穴を越える → 向かい風の中の綱渡り → 溶岩の上の崩れる岩。湯気で届く高い足場にさるぼぼ0
// 山場：せり上がる溶岩の縦穴を、太鼓の足場と崩れる岩で登る（左上にさるぼぼ2）→ 高台で飛騨牛串と全ステージの敵の群れ
// ゴール：宝殿の前の広場
import { Stage } from './lib.mjs';

export function build() {
  const b = new Stage({ id: 7, name: 'うらステージ・天空の宝殿', theme: 'kinka', width: 300, height: 30, timeOfDay: 'night', weathers: ['thunder', 'fog'], bgm: 'stage6' });
  const D = (s, x, y, p) => b.decor('prop_' + s, x, y, p);
  const LAMP = { r: 110, color: '#ffbf6a' };
  const drum = (x, y, w, beat, bpm = 110) => b.ent('rhythmPlatform', x, y, { w, beat, bpm, beats: 4 });
  const rock = (x, y, w = 2) => b.ent('fallingPlatform', x, y, { w, kind: 'rock' });
  const lavaPool = (x0, x1, top) => { for (let x = x0; x <= x1; x++) { for (let y = 0; y < top; y++) b.set(x, y, '.'); b.set(x, top, 'L'); for (let y = top + 1; y < top + 3; y++) b.set(x, y, 'l'); b.column(x, top + 3); } };
  b.f = 24;

  // ===================== 導入（0〜70）=====================
  b.flat(13);                                      // 0-12
  b.start(3, 23);
  b.sign('gifu', 7, 23, '岐阜県', '岐阜県は日本のほぼまん中にある、海に面していない県。北の飛騨地方と南の美濃地方からなり、県の面積の約8割を森林がしめる。');
  D('toro', 1, 23, { light: LAMP }); D('pine', 10, 23);
  b.gap(12);                                       // 13-24 太鼓の足場
  drum(14, 24, 3, 0); drum(18, 24, 3, 1); drum(22, 24, 3, 0);
  b.coins(14, 16, 22).coins(18, 20, 22).coins(22, 24, 22);
  b.flat(10);                                      // 25-34
  b.enemy('walker', 'uribo', 30, 23, { range: 2 });
  b.ent('gondola', 35, 24, { x2: 46, y2: 18, speed: 2.4 });
  b.ent('lightningZone', 0, 0, { x0: 35, x1: 50, interval: 3.5, weather: 'thunder' });
  b.enemy('flyer', 'karasu', 41, 16, { amp: 1, range: 3 });
  for (let i = 0; i <= 5; i++) b.coin(37 + i * 2, 21 - i);
  b.gap(14);                                       // 35-48 谷
  b.to(18).flat(21);                               // 49-69
  // 地面の H を踏み抜く隠し部屋
  b.room(52, 18, 60, 25);
  b.row(55, 56, 18, 'H');
  b.rect(55, 21, 56, 24, '#');
  b.coinCol(55, 14, 16);
  b.coins(53, 54, 24).coins(57, 59, 24);
  b.sarubobo(1, 59, 24, '隠し部屋の奥');
  b.ent('heart', 53, 22);
  b.enemy('hopper', 'kajika', 64, 17);

  // ===================== 展開（70〜150）=====================
  b.checkpoint(0, 70, 17);
  b.flat(10, { top: 'I' });                        // 70-79 氷
  b.sign('seki', 74, 17, '関の刃物', '関市は古くから刀づくりで知られる刃物の町。鎌倉時代に刀鍛冶が移り住んだのが始まりと伝えられ、今も包丁やはさみが作られている。');
  b.enemy('walker', 'yukidama', 77, 17, { range: 2 });
  b.up45(2); b.flat(2);                            // 80-83 → f16
  for (let i = 0; i < 5; i++) { b.set(84 + i, 16 + i, '>'); for (let y = 17 + i; y < b.H; y++) b.set(84 + i, y, 'W'); }
  b.x = 89; b.to(21).gap(4);                       // 89-92 穴（滑った勢いで越える）
  b.coin(85, 15).coin(87, 17).coin(89, 18).coin(91, 18).coin(93, 19);
  b.flat(8, { top: 'I' });                         // 93-100
  b.ent('windZone', 0, 0, { x0: 93, x1: 131, force: -160, period: 3.5 });
  b.ent('tightrope', 101, 21, { w: 10 });          // 101-110 綱渡り（向かい風）
  b.enemy('flyer', 'tako', 106, 16, { amp: 1, range: 3 });
  b.coins(102, 109, 19);
  b.x = 111; b.flat(8, { top: 'I' });              // 111-118
  lavaPool(119, 129, 22);                          // 溶岩の上の崩れる岩
  rock(121, 21); rock(125, 21);
  b.enemy('popper', 'hinotama', 128, 22, { period: 2.2 });
  b.coins(121, 126, 18);
  b.x = 130; b.flat(25);                           // 130-154
  // さるぼぼ0：湯気に乗ると届く高い足場
  b.ent('steamVent', 135, 20, { power: 1, period: 3, h: 5 });
  b.row(137, 139, 16, '-');
  b.sarubobo(0, 138, 14, '見えているが取り方を考える（湯気に乗る）');
  b.enemy('shielder', 'kappa', 144, 20);

  // ===================== 山場（150〜250）=====================
  b.sign('washi', 152, 20, '美濃和紙', '美濃和紙は1300年以上の歴史をもつ和紙。2014年、本美濃紙をすく技術が「和紙」の一つとしてユネスコ無形文化遺産に登録された。');
  b.x = 155; b.flat(31);                           // 155-185 縦穴の底
  b.rect(158, 2, 158, 18, 'S');                    // 左の壁（下の2マスが入口）
  b.rect(186, 6, 249, 29, '#');                    // 高台（右の壁）
  b.ent('risingLava', 0, 0, { x0: 159, x1: 186, y: 23, speed: 0.7, trigger: 161, stopY: 9 });
  b.row(162, 165, 18, '-');
  drum(168, 15, 3, 0, 90); drum(171, 12, 3, 1, 90);
  rock(176, 9);
  b.row(180, 183, 7, '-');
  b.coins(162, 165, 16).coins(168, 170, 13).coins(171, 173, 10).coins(176, 177, 7).coins(180, 183, 5);
  b.enemy('flyer', 'komori', 166, 10, { amp: 1, range: 2 });
  // さるぼぼ2：左上。ハク・ミナモは太鼓の足場から一気に、リーフは左の壁をけって。ゲンは崩れる岩から
  rock(168, 9);
  b.row(163, 164, 7, '-');
  b.sarubobo(2, 163, 5, '能力があると楽に取れる');
  // 高台：飛騨牛串の先に全ステージの敵
  b.ent('skewer', 190, 5);
  b.enemy('charger', 'inoshishi', 196, 5);
  b.enemy('thrower', 'geta', 199, 5);
  b.enemy('shielder', 'karakuri', 202, 5);
  b.enemy('hopper', 'yukiusagi', 205, 5);
  b.enemy('charger', 'kamoshika', 208, 5);
  b.enemy('flyer', 'chochin', 204, 1, { amp: 1, range: 4 });
  b.coins(193, 211, 3);
  b.clear(215, 6, 217, 8);
  b.set(215, 6, '\\'); b.set(216, 7, '\\'); b.set(217, 8, '\\');   // 下り坂
  b.set(215, 7, '#').set(215, 8, '#').set(216, 8, '#');
  b.clear(218, 6, 249, 8);
  b.rect(226, 9, 229, 29, '.');                    // 穴
  b.arc(225, 8, 230, 8, 2);
  b.ent('icicle', 233, 5);
  b.rect(231, 3, 240, 4, 'S');                     // 軒
  b.ent('icicle', 236, 5); b.ent('icicle', 239, 5);
  b.set(243, 9, 'L').set(244, 9, 'L'); b.set(243, 10, 'l').set(244, 10, 'l');   // 溶岩の割れ目と火柱
  b.enemy('popper', 'hibashira', 244, 9, { period: 2.5 });

  // ===================== ゴール（250〜300）=====================
  b.x = 250; b.to(9).flat(50);                     // 250-299
  b.rect(299, 0, 299, 8, 'S');
  b.checkpoint(1, 252, 8);
  b.sign('sarubobo', 256, 8, 'さるぼぼ', 'さるぼぼは飛騨地方に伝わる人形のお守り。飛騨の言葉で「猿の赤ちゃん」という意味で、災いが去るようにとの願いがこめられている。');
  for (const x of [262, 270, 278, 286]) D('toro', x, 8, { light: LAMP });
  D('castle_wall', 292, 8, { z: -6 });
  b.coins(260, 288, 5);
  b.ent('goal', 290, 8);

  for (const [x, y] of [[27, 23], [62, 17], [96, 20], [114, 20], [140, 20], [162, 20], [181, 6], [212, 5], [233, 8]]) D('kagaribi', x, y, { light: { r: 130, color: '#ff9a50', flicker: 0.2 } });
  b.area('導入', 0, 70).area('展開', 70, 150).area('山場', 150, 250, true).area('ゴール', 250, 300);
  return b;
}
