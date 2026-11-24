// ステージ2 長良川・鵜飼（夕暮れ→夜）。主役：川を下る鵜飼船（boat）＋潜って進む水中エリア
// 導入：川原。浅い川で初めての鵜飼船（落ちても泳いで岸に戻れる）。船から跳ぶと届く足場にさるぼぼ0
// 展開：大岩の下を潜って進む水中エリア。岩の間の縦に動く床でさるぼぼ2。岸の土手に隠し部屋
// 山場：鵜飼船で川を下る自動スクロール区間（跳ねるアユ・トンボ）。途中の足場に飛騨牛串
// ボス：川原で大山椒魚
import { Stage } from './lib.mjs';

export function build() {
  const b = new Stage({ id: 2, name: '長良川・鵜飼', theme: 'nagara', width: 300, height: 26, timeOfDay: 'dusk', timeFlow: ['dusk', 'night'], weathers: ['sunny', 'cloudy', 'rain'] });
  const D = (s, x, y, p) => b.decor('prop_' + s, x, y, p);
  const FIRE = { r: 150, color: '#ffb050', flicker: 0.15 };
  b.f = 15;

  // ===================== 導入（0〜76）=====================
  b.flat(23);                                      // 0-22
  b.start(3, 14);
  b.sign('ukai', 8, 14, '長良川の鵜飼', '長良川の鵜飼は1300年以上の歴史をもつ漁。鵜匠が鵜をあやつって鮎をとる。毎年5月11日から10月15日まで行われる。');
  D('kagaribi', 1, 14, { light: FIRE }); D('pine', 12, 14); D('grass', 16, 14);
  b.enemy('walker', 'sawagani', 18, 14, { range: 3 });
  b.coins(13, 16, 12);
  b.to(16).pool(7, 3);                             // 23-29 浅い水たまり（泳ぎを教える）
  b.coins(24, 28, 13);
  b.to(15).flat(9);                                // 30-38
  b.enemy('hopper', 'kajika', 35, 14);
  D('bamboo', 32, 14); D('rock', 37, 14);
  b.gap(3);                                        // 39-41 穴
  b.arc(38, 14, 42, 14, 2);
  b.flat(8);                                       // 42-49
  D('kagaribi', 47, 14, { light: FIRE });
  // 浅い川と最初の鵜飼船（落ちても泳いで岸へ戻れる）
  b.to(16).pool(18, 4);                            // 50-67
  b.ent('boat', 50, 16, { w: 4, x2: 64, speed: 2.0 });
  b.coins(52, 63, 12);
  // 船から跳ぶと届く足場（岸からは遠い）にさるぼぼ0
  b.row(57, 59, 13, '-');
  b.sarubobo(0, 58, 11, '見えているが取り方を考える');
  b.enemy('flyer', 'tonbo', 62, 9, { amp: 1, range: 3 });
  b.to(15).flat(9);                                // 68-76
  D('bridge_rail', 70, 14); D('grass', 74, 14);

  // ===================== 展開（77〜150）：大岩の下を潜る =====================
  b.checkpoint(0, 78, 14);
  b.flat(9);                                       // 77-85
  b.sign('usho', 81, 14, '鵜匠', '長良川の鵜匠は宮内庁式部職という身分をもち、皇室に鮎を納める御料鵜飼も行う。風折烏帽子に腰蓑という昔ながらの装束で舟に立つ。');
  D('kagaribi', 84, 14, { light: FIRE });
  b.to(16).pool(45, 8);                            // 86-130 深い淵（水面16、底24）
  // 大岩：上は高くて越えられない。下の水の中を潜って進む
  b.rect(92, 3, 104, 19, 'S');
  b.rect(112, 3, 124, 19, 'S');
  b.coins(94, 102, 21).coins(114, 122, 22);
  b.coinCol(89, 18, 21);                           // 「潜れ」の目印
  b.enemy('popper', 'ayu', 88, 16, { period: 2.6 });
  b.enemy('popper', 'ayu', 108, 16, { period: 2.2 });
  b.enemy('popper', 'ayu', 127, 16, { period: 2.4 });
  // 岩と岩の間：縦に動く床。上の張り出しにさるぼぼ2
  // （ミナモ・ハクは床から一気に跳べる。リーフは岩の壁をけって登れる。ゲンは床が上がりきった所から跳ぶ）
  b.ent('movingPlatform', 106, 16, { w: 2, dy: -6, speed: 1.2, kind: 'wood' });
  b.row(110, 111, 8, '-');
  b.sarubobo(2, 110, 6, '能力があると楽に取れる');
  b.coins(106, 107, 7);
  b.to(15).flat(4);                                // 131-134 岸
  // 土手の隠し部屋：土手の上の地面のふりをした H から落ちる。中の柱から上へ戻る
  b.to(15).flat(14);                               // 135-148
  b.room(137, 9, 147, 15);
  b.rect(137, 15, 147, 15, '#');
  b.row(142, 143, 9, 'H');                         // 入口（見た目は土手の上の土）
  b.rect(142, 12, 143, 14, '#');                   // 入口の下の柱
  b.coinCol(142, 5, 7);                            // 入口の目印
  b.coins(138, 141, 14).coins(144, 145, 14);
  b.sarubobo(1, 146, 14, '隠し部屋の奥');
  b.ent('heart', 138, 12);
  // 土手へ上る段（左右）
  b.rect(135, 12, 136, 14, '#');
  b.rect(148, 12, 149, 14, '#');
  b.coins(133, 136, 10);
  D('pine', 141, 8); D('kagaribi', 145, 8, { light: FIRE });
  b.flat(2);                                       // 149-150

  // ===================== 山場（151〜250）：鵜飼船の川下り（自動スクロール）=====================
  b.sign('kagaribi', 150, 14, '篝火と鵜飼', '鵜舟の舳先では篝火がたかれ、その明かりで鮎を見つけた鵜が水にもぐる。鵜がとらえた鮎は傷が少なく、昔から献上品にされてきた。');
  D('kagaribi', 148, 11, { light: FIRE });
  b.to(16).pool(86, 5);                            // 151-236 川
  // 船と画面の速さをそろえる（船は動き出しと着く前にゆっくりになるので、画面は船が走り出してから動かす）
  b.ent('boat', 151, 16, { w: 5, x2: 232, speed: 2.0 });
  b.ent('autoScroll', 155, 0, { x0: 155, x1: 240, speed: 2.0 });
  // 低い橋（くぐる）と、上の通り抜け足場のコイン
  b.row(168, 175, 11, 'W'); b.row(168, 175, 10, '-');
  D('bridge_rail', 171, 10);
  b.coins(169, 174, 9);
  b.enemy('popper', 'ayu', 162, 16, { period: 2.0 });
  b.enemy('popper', 'ayu', 181, 16, { period: 2.4 });
  b.enemy('flyer', 'tonbo', 188, 11, { amp: 1, range: 2 });
  b.arc(178, 14, 186, 14, 3);
  // 川の上の足場に飛騨牛串。この先にアユとトンボの群れ
  b.row(193, 196, 12, '-');
  b.ent('skewer', 195, 11);
  b.enemy('popper', 'ayu', 201, 16, { period: 1.6 });
  b.enemy('popper', 'ayu', 204, 16, { period: 1.8 });
  b.enemy('flyer', 'tonbo', 206, 12, { amp: 1, range: 2 });
  b.enemy('popper', 'ayu', 209, 16, { period: 1.7 });
  b.enemy('flyer', 'tonbo', 213, 11, { amp: 2, range: 2 });
  b.coins(200, 214, 13);
  b.row(220, 227, 11, 'W'); b.row(220, 227, 10, '-');
  b.coins(221, 226, 9);
  b.enemy('popper', 'ayu', 230, 16, { period: 2.2 });
  b.to(15).flat(14);                               // 237-250 岸
  D('kagaribi', 240, 14, { light: FIRE }); D('bamboo', 246, 14);
  b.enemy('walker', 'sawagani', 244, 14, { range: 3 });

  // ===================== ボス（251〜300）=====================
  b.flat(19);                                      // 251-269
  b.checkpoint(1, 253, 14);
  b.sign('nagara', 258, 14, '清流長良川', '長良川は郡上市の大日ヶ岳を源に、美濃の町を流れて伊勢湾へそそぐ。四万十川・柿田川とともに日本三大清流の一つに数えられる。');
  D('kagaribi', 262, 14, { light: FIRE }); D('kagaribi', 267, 14, { light: FIRE });
  b.coins(259, 265, 12);
  b.arena('salamander', 15, { wall: 'S' });
  D('bamboo', 274, 14, { z: -6 }); D('kagaribi', 286, 14, { light: FIRE, z: -6 }); D('bamboo', 295, 14, { z: -6 });

  b.area('導入', 0, 77).area('展開', 77, 150).area('山場', 150, 251).area('ボス', 251, 300);
  return b;
}
