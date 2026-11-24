// ステージ4 飛騨高山・古い町並み（昼→夜祭り／くもり・霧・雨）。主役：屋根伝いと、乗って進む祭り屋台
// 導入：宮川の朝市。屋台の屋根（通り抜け足場）を足場に町家の屋根へ。路地は箱で戻れる。
//       通りで最初の祭り屋台に乗る（落ちても通りに降りるだけ）。屋台から跳ぶと届く足場にさるぼぼ0
// 展開：古い町並みの屋根伝い（路地は落ちるとミス）。蔵の屋根の H から屋根裏の隠し部屋。提灯の綱渡りを初めて
// 山場：夜祭り。トゲの道の上を祭り屋台で進む → 飛騨牛串の先に獅子舞・からくりの群れ → 綱渡りの連続（上にさるぼぼ2）
// ボス：祭りの広場でからくり屋台
import { Stage } from './lib.mjs';

export function build() {
  const b = new Stage({ id: 4, name: '飛騨高山・古い町並み', theme: 'takayama', width: 300, height: 22, timeOfDay: 'day', timeFlow: ['day', 'festival'], weathers: ['cloudy', 'fog', 'rain'] });
  const D = (s, x, y, p) => b.decor('prop_' + s, x, y, p);
  const LAMP = { r: 100, color: '#ffb560' };
  // 町家：屋根の行 roof（瓦 R）から下は木の壁 W（地面まで）
  const house = (x0, x1, roof) => { b.rect(x0, roof, x1, b.H - 1, 'W'); b.row(x0, x1, roof, 'R'); D('noren', ((x0 + x1) >> 1), 17, { z: -1 }); };
  const stall = (x0, x1, y) => { b.row(x0, x1, y, '-'); D('yatai_stall', (x0 + x1) >> 1, 17, { z: -3 }); };
  b.f = 18;

  // ===================== 導入（0〜76）：宮川の朝市 =====================
  b.flat(76);                                      // 0-75 通り
  b.start(3, 17);
  b.sign('asaichi', 7, 17, '朝市', '高山では毎朝、宮川沿いと高山陣屋前で朝市が開かれる。地元の野菜や漬物、花などが並び、町の人と旅人でにぎわう。');
  D('lamp', 1, 17); D('bridge_rail', 5, 17, { z: -6 });
  stall(11, 14, 15); stall(17, 20, 13); stall(23, 26, 15);
  b.coins(11, 14, 13).coins(17, 20, 11).coins(23, 26, 13);
  b.enemy('shielder', 'karakuri', 29, 17, { face: -1 });
  stall(30, 32, 15);
  house(34, 41, 14);
  b.rect(42, 16, 42, 17, 'W');                     // 路地の箱（落ちても戻れる）
  house(44, 50, 13);
  b.coins(35, 40, 12).coins(45, 49, 11);
  b.enemy('flyer', 'tako', 47, 8, { amp: 1, range: 3 });
  // 通りの祭り屋台（最初）。屋台から跳ぶと届く足場にさるぼぼ0
  b.ent('festivalFloat', 52, 16, { w: 5, x2: 66, speed: 1.6 });
  b.row(60, 62, 13, '-');
  b.sarubobo(0, 61, 11, '見えているが取り方を考える（屋台から跳ぶ）');
  b.coins(53, 58, 12);
  b.enemy('thrower', 'hanabi', 72, 17, { face: -1 });
  stall(70, 73, 15);
  D('machiya', 56, 17, { z: -8 }); D('machiya', 66, 17, { z: -8 });

  // ===================== 展開（76〜151）：屋根伝い =====================
  b.flat(12);                                      // 76-87 通り
  b.checkpoint(0, 77, 17);
  b.sign('machinami', 80, 17, '古い町並み', '高山の古い町並みは江戸時代からの城下町・商家町。格子戸の町家や造り酒屋が並び、国の重要伝統的建造物群保存地区に選ばれている。');
  stall(83, 86, 15);
  house(88, 97, 13);                               // 98-100 路地（穴）
  house(101, 108, 12);                             // 109-112 路地（穴）
  b.arc(96, 12, 102, 11, 2);
  b.arc(107, 11, 114, 13, 1);
  b.enemy('shielder', 'karakuri', 105, 11, { face: -1 });
  // 蔵：屋根の H から屋根裏の隠し部屋へ落ちる
  house(113, 121, 14);
  b.room(113, 14, 121, 20, 'W');
  b.row(113, 121, 14, 'R');
  b.row(117, 118, 14, 'H');                        // 入口（見た目は瓦）
  b.rect(117, 17, 118, 19, 'W');                   // 入口の下の柱
  b.coinCol(117, 10, 12);
  b.coins(114, 116, 19).coins(119, 120, 19);
  b.sarubobo(1, 114, 19, '隠し部屋の奥');
  b.ent('heart', 120, 17);
  house(125, 131, 12);                             // 122-124 路地（穴）
  b.arc(120, 13, 126, 11, 1);
  b.enemy('flyer', 'tako', 128, 7, { amp: 1, range: 2 });
  // 提灯の綱渡り（初めて。幅10の路地）
  b.ent('tightrope', 132, 12, { w: 10 });
  b.coins(133, 140, 9);
  house(142, 155, 12);
  b.enemy('thrower', 'hanabi', 148, 11, { face: -1 });
  D('chochin', 134, 9, { z: -2, light: LAMP }); D('chochin', 139, 9, { z: -2, light: LAMP });

  // ===================== 山場（151〜244）：夜祭り =====================
  b.sign('matsuri', 152, 11, '高山祭', '高山祭は春の山王祭と秋の八幡祭の総称。豪華な祭屋台が町を巡り、からくり人形が演じられる。ユネスコ無形文化遺産にも登録されている。');
  // トゲの道の上を祭り屋台で進む
  b.x = 156; b.flat(51);                           // 156-206 通り
  b.row(160, 196, 17, '^');
  b.ent('festivalFloat', 156, 15, { w: 5, x2: 197, speed: 1.8 });
  b.row(170, 172, 10, '-'); b.enemy('thrower', 'hanabi', 171, 9, { face: -1 });
  b.row(186, 188, 10, '-'); b.enemy('thrower', 'hanabi', 187, 9, { face: -1 });
  b.enemy('flyer', 'tako', 178, 9, { amp: 1, range: 3 });
  b.enemy('flyer', 'tako', 193, 8, { amp: 1, range: 3 });
  b.coins(160, 168, 11).coins(174, 184, 11).coins(190, 196, 11);
  for (const x of [162, 168, 176, 182, 190]) D('chochin', x, 6, { z: -2, light: LAMP });
  // 飛騨牛串の先に獅子舞・からくり・花火師の群れ
  b.ent('skewer', 203, 17);
  b.enemy('charger', 'shishi', 210, 17, { face: -1 });
  b.enemy('shielder', 'karakuri', 213, 17, { face: -1 });
  b.enemy('thrower', 'hanabi', 216, 17, { face: -1 });
  b.enemy('charger', 'shishi', 219, 17, { face: -1 });
  b.enemy('shielder', 'karakuri', 222, 17, { face: -1 });
  b.flat(19);                                      // 207-225
  b.coins(208, 224, 14);
  for (const x of [209, 217, 224]) D('chochin', x, 13, { z: -2, light: LAMP });
  // 綱渡りの連続（下は穴）。真ん中に石灯籠の柱
  b.ent('tightrope', 226, 15, { w: 7 });
  b.rect(233, 15, 234, b.H - 1, 'S');
  D('toro', 233, 14, { light: LAMP });
  b.ent('tightrope', 235, 15, { w: 8 });
  b.enemy('flyer', 'tako', 230, 10, { amp: 1, range: 2 });
  b.coins(227, 232, 13).coins(236, 242, 13);
  // さるぼぼ2：綱の上の高い足場。ハクの二段ジャンプ・ミナモの大ジャンプなら綱から直接、
  // リーフは柱の上から壁キック。ゲンは上下に動く床に乗って行く
  b.row(238, 239, 9, '-');
  b.rect(240, 6, 240, 9, 'W');
  b.ent('movingPlatform', 236, 14, { w: 2, dy: -5, speed: 1.0, kind: 'wood' });
  b.sarubobo(2, 238, 8, '能力があると楽に取れる');
  b.x = 243; b.flat(1);

  // ===================== ボス（244〜300）=====================
  b.flat(26);                                      // 244-269
  b.checkpoint(1, 247, 17);
  b.sign('karakuri', 252, 17, 'からくり人形', '高山祭の屋台の上では、からくり人形が糸で操られて芸を見せる。人形方が何本もの糸を使い分け、人形に細かな動きをさせる。');
  for (const x of [256, 262, 268]) D('chochin', x, 12, { z: -2, light: LAMP });
  D('machiya', 259, 17, { z: -8 });
  b.coins(256, 266, 14);
  b.arena('yatai', 18, { wall: 'W' });
  for (const x of [276, 288, 297]) D('chochin', x, 7, { z: -6, light: LAMP });

  b.area('導入', 0, 76).area('展開', 76, 151).area('山場', 151, 244).area('ボス', 244, 300);
  return b;
}
