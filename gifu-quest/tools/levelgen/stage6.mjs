// ステージ6 奥飛騨・乗鞍の火の山（夜／火山灰・雷雨・霧）。主役：せり上がる溶岩（上へ逃げる縦スクロール）
// 導入：湯の里。湯気で崖の上へ（下は地面なので安全）。小さな溶岩の池。崩れる岩をくぼ地の上で（落ちても戻れる）。
//       湯気が出た時に乗ると届く足場にさるぼぼ0
// 展開：溶岩の池を崩れる岩で渡る。溶岩の湖を、小島の湯気で上の足場へ（下から火柱）。岩山の割れ目に隠し部屋
// 山場：火口の縦穴を、せり上がる溶岩から逃げて登る（崩れる岩・湯気・コウモリ）。左の壁ぎわにさるぼぼ2。
//       尾根に出たら飛騨牛串、その先にカモシカ・岩投げの群れ、溶岩の穴と火柱
// ボス：山頂の火口で火竜
import { Stage } from './lib.mjs';

export function build() {
  const b = new Stage({ id: 6, name: '奥飛騨・乗鞍の火の山', theme: 'okuhida', width: 300, height: 60, timeOfDay: 'night', weathers: ['ash', 'thunder', 'fog'] });
  const D = (s, x, y, p) => b.decor('prop_' + s, x, y, p);
  const FIRE = { r: 130, color: '#ff8a40', flicker: 0.2 };
  const LAMP = { r: 110, color: '#ffbf6a' };
  const vent = (x, y, h = 5, period = 3, phase = 0) => b.ent('steamVent', x, y, { power: 1, period, h, phase });
  const rock = (x, y, w = 2) => b.ent('fallingPlatform', x, y, { w, kind: 'rock' });
  // 溶岩の池（表面は床より1段下）
  const lavaPool = (x0, x1, top) => { for (let x = x0; x <= x1; x++) { for (let y = 0; y < top; y++) b.set(x, y, '.'); b.set(x, top, 'L'); for (let y = top + 1; y < top + 3; y++) b.set(x, y, 'l'); b.column(x, top + 3); } };
  b.f = 56;

  // ===================== 導入（0〜76）：湯の里 =====================
  b.flat(22);                                      // 0-21
  b.start(3, 55);
  b.sign('onsen', 8, 55, '奥飛騨温泉郷', '奥飛騨温泉郷は平湯・福地・新平湯・栃尾・新穂高の五つの温泉地の総称。北アルプスのふもとにあり、露天風呂の多さで知られる。');
  D('onsen', 13, 55, { light: LAMP }); D('lamp', 6, 55, { light: LAMP }); D('cedar', 1, 55); D('rock', 17, 55);
  // 湯気で崖の上へ（落ちても下は地面）
  // 湯気は崖の壁ぎわに（QA：以前は壁から1列はなれていて、右へ歩いて壁に当たると湯気の外に立ってしまい、上がれないまま詰まりやすかった）
  vent(21, 55, 5, 2.5);
  b.coinCol(21, 50, 53);
  b.to(50).flat(19);                               // 22-40
  b.enemy('hopper', 'yogangaeru', 30, 49);
  b.enemy('flyer', 'komori', 36, 44, { amp: 1, range: 3 });
  D('lamp', 25, 49, { light: LAMP });
  lavaPool(41, 43, 51);                            // 小さな溶岩の池
  b.enemy('popper', 'hinotama', 42, 51, { period: 2.5 });
  b.arc(40, 49, 44, 49, 2);
  b.x = 44; b.flat(8);                             // 44-51
  // くぼ地の上の崩れる岩（落ちても右の段で戻れる）
  b.to(54).flat(9);                                // 52-60 くぼ地
  b.rect(59, 52, 60, 53, '#');
  rock(53, 50); rock(56, 50);
  b.coins(53, 57, 47);
  b.to(50).flat(16);                               // 61-76
  // さるぼぼ0：湯気が出ている時に乗ると届く高い足場
  vent(68, 49, 5, 3);
  b.row(70, 72, 45, '-');
  b.sarubobo(0, 71, 43, '見えているが取り方を考える（湯気に乗る）');
  b.enemy('hopper', 'yogangaeru', 75, 49);
  D('onsen', 63, 49, { light: LAMP });

  // ===================== 展開（77〜160）=====================
  b.checkpoint(0, 78, 49);
  b.sign('norikura', 81, 49, '乗鞍岳', '乗鞍岳は岐阜県と長野県にまたがる火山で、最高峰の剣ヶ峰は標高3026メートル。夏はバスで山頂近くの畳平まで行ける。');
  b.flat(9);                                       // 77-85
  lavaPool(86, 97, 51);                            // 溶岩の池を崩れる岩で渡る
  rock(88, 50); rock(92, 50);
  b.enemy('popper', 'hinotama', 95, 51, { period: 2.2 });
  b.coins(88, 89, 47).coins(92, 93, 47);
  b.x = 98; b.flat(13);                            // 98-110
  b.enemy('charger', 'kamoshika', 107, 49, { face: -1 });
  b.up45(3);                                       // 111-113 → f47
  b.flat(7);                                       // 114-120
  b.enemy('thrower', 'iwanage', 119, 46, { face: -1 });
  // 溶岩の湖：小島の湯気で上の足場へ（下から火柱）
  lavaPool(121, 138, 50);
  b.rect(124, 49, 125, 52, 'S');                   // 小島A
  vent(125, 48, 5, 3);
  b.row(127, 131, 44, '-');                        // 上の足場
  b.rect(135, 49, 136, 52, 'S');                   // 小島C
  b.enemy('popper', 'hibashira', 129, 50, { period: 3 });
  b.enemy('popper', 'hibashira', 133, 50, { period: 3.4 });
  b.coins(127, 131, 42);
  b.x = 139; b.to(47).flat(22);                    // 139-160
  // 岩山の割れ目の隠し部屋：段の向こうのすき間から、岩の壁（H）へ入る
  b.rect(145, 44, 146, 46, 'S');                   // 段
  b.room(148, 41, 157, 47, 'S');
  b.rect(148, 47, 157, 47, '#');
  b.row(148, 148, 45, 'H').row(148, 148, 46, 'H'); // 入口
  b.coin(147, 45);
  b.coins(149, 155, 46).coins(150, 154, 43);
  b.sarubobo(1, 156, 46, '隠し部屋の奥');
  b.ent('heart', 149, 43);
  b.enemy('flyer', 'komori', 153, 37, { amp: 1, range: 3 });

  // ===================== 山場（161〜246）：火口の縦穴 → 尾根 =====================
  b.x = 161; b.to(50).flat(35);                    // 161-195 縦穴の底
  b.rect(162, 10, 162, 47, 'S');                   // 左の壁（下の2マスが入口）
  b.rect(196, 14, 269, 59, '#');                   // 尾根（右の壁）
  b.sign('yakedake', 165, 49, '焼岳', '焼岳は奥飛騨にそびえる活火山。今も山頂付近から噴気が上がっていて、気象庁が24時間体制で観測している火山の一つ。');
  b.ent('risingLava', 0, 0, { x0: 163, x1: 196, y: 53, speed: 0.6, trigger: 167, stopY: 20 });
  // 段（ジグザグ。どれも高さ3以内）
  b.row(166, 170, 47, '-');                        // L1
  b.row(173, 176, 44, '-');                        // L2
  b.row(179, 183, 41, '-');                        // L3
  b.row(186, 189, 38, '-');                        // L4
  b.rect(191, 35, 195, 35, 'S');                   // L5（右の壁から張り出す岩）
  b.row(186, 188, 32, '-');                        // L6
  rock(183, 29); rock(179, 29);                    // 崩れる岩
  b.row(172, 176, 26, '-');                        // L8
  vent(173, 25, 6, 2.5);                           // 湯気で上へ
  b.row(168, 171, 20, '-');                        // L9
  b.row(175, 179, 18, '-');                        // L10
  b.row(182, 195, 16, '-');                        // L11 → 尾根へ
  b.coins(167, 169, 45).coins(174, 175, 42).coins(180, 182, 39).coins(187, 188, 36).coins(192, 194, 33)
    .coins(186, 188, 30).coins(179, 184, 27).coinCol(173, 19, 23).coins(176, 178, 16).coins(184, 192, 14);
  b.enemy('flyer', 'komori', 181, 35, { amp: 1, range: 3 });
  b.enemy('flyer', 'komori', 177, 22, { amp: 1, range: 2, dir: 'h' });
  b.enemy('thrower', 'iwanage', 193, 34, { face: -1 });
  // さるぼぼ2：左の壁ぎわの高い足場。ハク・ミナモは L8 から一気に、リーフは左の壁をけって。
  // ゲンは崩れる岩を一つはさんで渡る（溶岩が迫るので急いで）
  rock(167, 24);
  b.row(163, 164, 23, '-');
  b.sarubobo(2, 163, 21, '能力があると楽に取れる');
  // 尾根
  b.ent('skewer', 200, 13);
  b.enemy('charger', 'kamoshika', 207, 13, { face: -1 });
  b.enemy('thrower', 'iwanage', 210, 13, { face: -1 });
  b.enemy('hopper', 'yogangaeru', 213, 13);
  b.enemy('charger', 'kamoshika', 217, 13, { face: -1 });
  b.enemy('flyer', 'komori', 214, 8, { amp: 1, range: 3 });
  b.enemy('hopper', 'yogangaeru', 220, 13);
  b.coins(203, 222, 10);
  // 溶岩の穴と火柱、崩れる岩
  lavaPool(225, 228, 15);
  b.enemy('popper', 'hibashira', 226, 15, { period: 2.8 });
  b.arc(224, 13, 229, 13, 2);
  lavaPool(233, 241, 15);
  rock(235, 14); rock(238, 14);
  b.enemy('popper', 'hinotama', 240, 15, { period: 2.0 });
  b.coins(235, 239, 11);
  D('rock', 231, 13); D('rock', 244, 13);

  // ===================== ボス（247〜300）=====================
  b.checkpoint(1, 250, 13);
  b.sign('alps', 255, 13, '北アルプスの火山', '奥飛騨のまわりには焼岳や乗鞍岳など北アルプスの火山が連なる。地下の熱で温められた湯が、各地で温泉となってわき出している。');
  D('rock', 259, 13); D('onsen', 264, 13, { light: LAMP });
  b.coins(258, 266, 11);
  b.arena('dragon', 14, { wall: 'S' });
  D('rock', 280, 13, { z: -6 }); D('rock', 292, 13, { z: -6 });
  // 夜で暗いので、道すじに篝火を置く（明かりの穴）
  for (const [x, y] of [[33, 49], [47, 49], [62, 49], [84, 49], [100, 49], [116, 46], [142, 46], [159, 46], [208, 13], [222, 13], [246, 13]]) D('kagaribi', x, y, { light: FIRE });
  // 縦穴の段にも
  for (const [x, y] of [[166, 46], [181, 40], [193, 34], [174, 25], [178, 17], [190, 15]]) D('kagaribi', x, y, { light: FIRE, z: -2 });

  b.area('導入', 0, 77).area('展開', 77, 161).area('山場', 161, 247, true).area('ボス', 247, 300);
  return b;
}
