// ステージ3 郡上八幡（昼／雨・雷雨・晴れ）。主役：水路と水門（スイッチで水位が上下する）
// 導入：町なかの水路。スイッチを踏むと水位が上がり、向こう岸へ泳いで渡れる（落ちても泳げるだけ）。
//       水位を上げると届くさるぼぼ0。郡上踊りの太鼓の足場も、ここでは下が水なので安全
// 展開：深い水路。水中の石の台のスイッチで水位を上げて高い石垣の上へ。太鼓の足場で穴を渡る。石垣の割れ目に隠し部屋
// 山場：太鼓の足場の階段（上にさるぼぼ2）→ 水門の水路（水位を上げると門が開いてくぐれる）→ 飛騨牛串の先に踊りの群れ（落雷）
// ボス：城下の広場で踊り神
import { Stage } from './lib.mjs';

export function build() {
  const b = new Stage({ id: 3, name: '郡上八幡', theme: 'gujo', width: 300, height: 22, timeOfDay: 'day', weathers: ['rain', 'thunder', 'sunny'] });
  const D = (s, x, y, p) => b.decor('prop_' + s, x, y, p);
  const BPM = 100;
  const drum = (x, y, w, beat) => b.ent('rhythmPlatform', x, y, { w, beat, bpm: BPM, beats: 4 });
  b.f = 16;

  // ===================== 導入（0〜73）=====================
  b.flat(24);                                      // 0-23
  b.start(3, 15);
  b.sign('mizu', 8, 15, '水の町 郡上八幡', '郡上八幡は吉田川や小駄良川が流れる水の町。町なかには用水がめぐり、昔から野菜を洗うなど暮らしの水として使われてきた。');
  D('machiya', 12, 15); D('lamp', 6, 15); D('noren', 16, 15);
  b.enemy('hopper', 'uchiwa', 18, 15);
  // 最初の水路：スイッチで水位が上がる。右岸は3段高い
  b.ent('waterSwitch', 22, 15, { target: 'canal1' });
  b.coins(20, 22, 13);
  b.to(20).flat(12);                               // 24-35 水路の底
  b.to(13).flat(15);                               // 36-50 右岸（高い）
  b.rect(36, 13, 38, 19, 'S');
  b.ent('waterLevel', 0, 0, { id: 'canal1', x0: 24, x1: 36, yLow: 18, yHigh: 13, start: 'low' });
  b.coins(25, 34, 12);
  b.sarubobo(0, 30, 11, '見えているが取り方を考える（水位を上げると届く）');
  b.enemy('thrower', 'geta', 47, 12, { face: -1 });
  D('machiya', 42, 12); D('lamp', 39, 12);
  // 太鼓の足場（下は浅い水なので落ちても大丈夫）
  b.to(14).pool(11, 3);                            // 51-61
  drum(52, 13, 3, 0); drum(57, 13, 3, 1);
  b.coins(52, 54, 11).coins(57, 59, 11);
  b.to(13).flat(12);                               // 62-73
  b.enemy('shielder', 'kappa', 68, 12, { face: -1 });
  D('chochin', 64, 9, { z: -2 }); D('machiya', 71, 12);

  // ===================== 展開（74〜151）=====================
  b.checkpoint(0, 75, 12);
  b.flat(6);                                       // 74-79
  b.sign('sogisui', 77, 12, '宗祇水', '宗祇水は町なかにわき出る清水で、室町時代の連歌師・飯尾宗祇にちなむ名。1985年、環境庁の名水百選の第1号に選ばれた。');
  // 深い水路：水中の石の台のスイッチで水位を上げ、右の高い石垣の上へ
  b.to(20).flat(21);                               // 80-100 水路の底
  b.rect(87, 15, 92, 19, 'S');                     // 石の台（上にスイッチ）
  b.ent('waterSwitch', 90, 14, { target: 'canal2' });
  b.ent('waterLevel', 0, 0, { id: 'canal2', x0: 80, x1: 101, yLow: 17, yHigh: 9, start: 'low' });
  b.coins(82, 85, 18).coins(94, 99, 12).coins(94, 99, 10);
  b.enemy('flyer', 'chochin', 96, 6, { amp: 1, range: 3 });
  b.to(8).flat(12);                                // 101-112 高い石垣の上の道
  b.rect(101, 8, 103, 21, 'S');
  D('machiya', 106, 7); D('lamp', 110, 7);
  b.enemy('hopper', 'uchiwa', 108, 7);
  b.down45(3);                                     // 113-115 → f11
  b.flat(8);                                       // 116-123
  b.enemy('thrower', 'geta', 121, 10, { face: -1 });
  // 太鼓の足場で穴を渡る（ここは落ちるとミス）
  b.gap(14);                                       // 124-137
  drum(125, 11, 3, 0); drum(129, 11, 3, 1); drum(133, 11, 3, 0);
  b.coins(125, 127, 9).coins(129, 131, 9).coins(133, 135, 9);
  b.flat(14);                                      // 138-151
  // 石垣の割れ目の隠し部屋：段の向こうの狭いすき間から、石垣の壁（H）へ入る
  b.rect(140, 8, 141, 10, 'S');                    // 段
  b.room(143, 6, 151, 11, 'S');
  b.rect(143, 11, 151, 11, '#');
  b.row(143, 143, 9, 'H').row(143, 143, 10, 'H');  // 入口（すき間の奥の石垣）
  b.coins(144, 149, 10).coins(145, 148, 8);
  b.sarubobo(1, 150, 10, '隠し部屋の奥');
  b.ent('heart', 144, 8);
  b.coin(142, 9);
  D('bamboo', 139, 10);

  // ===================== 山場（152〜246）=====================
  b.to(11).flat(4);                                // 152-155
  b.sign('odori', 153, 10, '郡上おどり', '郡上おどりは夏に30夜以上つづく盆踊り。お盆の4日間は夜通し踊る「徹夜おどり」になる。国の重要無形民俗文化財に指定されている。');
  // 太鼓の足場の階段（下は穴）
  b.gap(19);                                       // 156-174
  drum(157, 11, 3, 0); drum(161, 9, 2, 1); drum(165, 7, 3, 0); drum(169, 9, 2, 1);
  b.coins(157, 159, 9).coins(161, 162, 7).coins(165, 167, 5).coins(169, 170, 7);
  // さるぼぼ2：階段のてっぺんの上。ハク・ミナモは太鼓の足場から一気に、リーフは右の柱をけって。
  // ゲンは左上に出る太鼓の足場（拍が逆）を待って乗り継ぐ
  drum(162, 4, 2, 1);
  b.row(166, 167, 3, '-');
  b.rect(168, 0, 168, 3, 'S');
  b.sarubobo(2, 166, 2, '能力があると楽に取れる');
  b.to(10).flat(5);                                // 175-179
  // 水門の水路：スイッチで水位を上げると、右の壁の水門が開いてくぐれる
  b.ent('waterSwitch', 178, 9, { target: 'canal3' });
  b.to(20).flat(21);                               // 180-200 水路の底
  b.ent('waterLevel', 0, 0, { id: 'canal3', x0: 180, x1: 201, yLow: 18, yHigh: 10, start: 'low' });
  b.rect(201, 0, 203, 21, 'S');                    // 石垣
  b.clear(201, 8, 203, 10);                        // 水門のくぐり
  b.ent('waterGate', 201, 10, { target: 'canal3', h: 3 });
  b.enemy('shielder', 'kappa', 184, 19, { face: 1 });
  b.enemy('flyer', 'chochin', 192, 7, { amp: 1, range: 4 });
  b.coins(183, 198, 9);
  b.x = 204; b.to(11).flat(4);                     // 204-207
  b.ent('skewer', 206, 10);
  // 飛騨牛串の先：踊りうちわ・下駄投げ・提灯おばけ・かっぱの群れ（雷雨なら落雷）
  b.flat(26);                                      // 208-233
  b.ent('lightningZone', 0, 0, { x0: 208, x1: 234, interval: 4, weather: 'thunder' });
  b.enemy('hopper', 'uchiwa', 211, 10);
  b.enemy('hopper', 'uchiwa', 214, 10);
  b.enemy('thrower', 'geta', 218, 10, { face: -1 });
  b.enemy('flyer', 'chochin', 221, 7, { amp: 1, range: 3 });
  b.enemy('shielder', 'kappa', 225, 10, { face: -1 });
  b.enemy('hopper', 'uchiwa', 228, 10);
  b.enemy('thrower', 'geta', 231, 10, { face: -1 });
  b.coins(210, 230, 7);
  D('chochin', 213, 6, { z: -2 }); D('chochin', 223, 6, { z: -2 }); D('machiya', 216, 10); D('machiya', 229, 10);
  // 最後の太鼓の足場
  b.gap(11);                                       // 234-244
  drum(235, 11, 3, 0); drum(239, 11, 3, 1);
  b.coins(235, 237, 9).coins(239, 241, 9);
  b.flat(2);                                       // 245-246

  // ===================== ボス（247〜300）=====================
  b.flat(23);                                      // 247-269
  b.checkpoint(1, 249, 10);
  b.sign('castle', 254, 10, '郡上八幡城', '郡上八幡城は町を見下ろす山の上に建つ城。今の天守は1933年に木造で再建されたもので、木造の再建天守としては日本で最も古いとされる。');
  D('chochin', 259, 6, { z: -2 }); D('chochin', 265, 6, { z: -2 }); D('lamp', 262, 10);
  b.coins(258, 266, 8);
  b.arena('dancer', 11, { wall: 'S' });
  D('chochin', 278, 4, { z: -6 }); D('chochin', 290, 4, { z: -6 });

  b.area('導入', 0, 74).area('展開', 74, 152).area('山場', 152, 247).area('ボス', 247, 300);
  return b;
}
