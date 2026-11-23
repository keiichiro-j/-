// 不動産・車屋・カスタム・強盗の定義表。three.jsに依存しない（テスト対象）
import { VEHICLES } from '../vehicles/vehicle.js';

// 物件：near=おおよその場所（タイル）。slots=ガレージの台数
export const PROPERTIES = [
  { id: 'nagara', name: '長良の自宅', kind: '一軒家', near: [70, 6], price: 0, slots: 2, start: true, note: '最初の住まい。川向こうの静かな住宅街' },
  { id: 'farmhouse', name: '田園の古民家', kind: '古民家', near: [27, 37], price: 120000, slots: 4, any: true, note: '広い納屋つき。田んぼに囲まれている' },
  { id: 'east', name: '東部の一軒家', kind: '一軒家', near: [118, 65], price: 240000, slots: 3, note: '金華山のふもと。夜は静か' },
  { id: 'yanagase', name: '柳ケ瀬のマンション', kind: 'マンション', near: [74, 46], price: 380000, slots: 3, note: '繁華街の真ん中。アーケードまで徒歩1分' },
  { id: 'station', name: '駅前タワーマンション', kind: 'タワーマンション', near: [54, 78], price: 950000, slots: 6, note: '岐阜駅直結。黄金の像を見下ろす' },
  { id: 'villa', name: '長良川沿いの邸宅', kind: '邸宅', near: [90, 6], price: 1800000, slots: 8, note: '鵜飼の見える高台の豪邸。ガレージ8台' },
];

export const dealerPrice = (id) => Math.max(20000, Math.round(VEHICLES[id].price / 20 / 1000) * 1000);
// 車屋で売る車（緊急車両は売らない）
export const DEALER_STOCK = ['kei', 'kturck', 'sedan', 'taxi', 'van', 'suv', 'coupe', 'truck', 'super', 'bus'];

// カスタムパーツ：levels の各段の価格。効果は applyMods で反映
export const CAR_MODS = [
  { id: 'engine', name: 'エンジン', levels: [0, 15000, 40000, 90000], desc: '加速と最高速が上がる' },
  { id: 'turbo', name: 'ターボ', levels: [0, 60000], desc: '加速が大きく上がる' },
  { id: 'brakes', name: 'ブレーキ', levels: [0, 8000, 20000, 45000], desc: '止まる距離が短くなる' },
  { id: 'tires', name: 'タイヤ', levels: [0, 10000, 25000, 50000], desc: 'グリップが上がり、曲がりやすくなる' },
  { id: 'susp', name: 'サスペンション', levels: [0, 8000, 20000, 40000], desc: '車体の傾きが減り、安定する' },
  { id: 'armor', name: '装甲', levels: [0, 20000, 50000, 100000], desc: '衝突や銃撃のダメージが減る' },
  { id: 'tint', name: 'スモークガラス', levels: [0, 5000], desc: '警察に気づかれにくくなる' },
  { id: 'neon', name: 'ネオン（車体下）', levels: [0, 12000], desc: '夜に車体の下が光る' },
];
export const NEON_COLORS = [0x3ad0ff, 0xff3ad0, 0x7aff3a, 0xffd23a, 0xff5a3a];
export const PAINT_COLORS = [0xd0302a, 0x1d4fa8, 0xf2f2f2, 0x111111, 0x2a7a3a, 0xe8c020, 0x7a3ab0, 0x8a8f96, 0xf08a1a, 0x2ab0b0];
export const PAINT_PRICE = 3000;
export const REGISTER_PRICE = 5000;

export function modLevel(mods, id) { return (mods && mods[id]) || 0; }
export function nextModPrice(mods, id) {
  const m = CAR_MODS.find(x => x.id === id); const lv = modLevel(mods, id);
  return lv + 1 < m.levels.length ? m.levels[lv + 1] : null;
}

// 改造を反映した車の性能（元の定義表は書き換えない）
export function applyMods(base, mods = {}) {
  const L = (id) => modLevel(mods, id);
  return {
    ...base,
    accel: base.accel * (1 + 0.12 * L('engine') + 0.22 * L('turbo')),
    vmax: base.vmax * (1 + 0.05 * L('engine') + 0.04 * L('turbo')),
    grip: base.grip * (1 + 0.06 * L('tires') + 0.03 * L('susp')),
    brakeK: 1 + 0.18 * L('brakes'),
    rollK: 1 - 0.22 * L('susp'),
    armorK: 1 - 0.18 * L('armor'),
    tint: L('tint') > 0,
  };
}

// 強盗できる店：stars=通報されたときの★、sec=袋に詰める時間、amount=[最小,最大]
export const ROBBERIES = {
  conbini: { name: 'コンビニ', stars: 'robbery', sec: 6, amount: [20000, 60000] },
  gas: { name: 'ガソリンスタンド', stars: 'robbery', sec: 6, amount: [15000, 45000] },
  jewelry: { name: '宝飾店', stars: 'robbery', sec: 10, amount: [80000, 250000] },
  bank: { name: '銀行', stars: 'bank', sec: 15, amount: [300000, 1000000] },
};
export const robberyAmount = (kind, r = Math.random()) => { const a = ROBBERIES[kind].amount; return Math.round((a[0] + (a[1] - a[0]) * r) / 1000) * 1000; };
