// 車種の定義表（すべてオリジナル名）。速度は m/s
export const KMH = 1 / 3.6;
export const VEHICLES = {
  kei:     { name: 'ミニワゴン',     cls: '軽自動車', len: 3.4, wid: 1.48, hgt: 1.7, mass: 850,  vmax: 110 * KMH, accel: 4.2, grip: 0.95, drive: 'FF', price: 600000,   style: 'wagon',  colors: [0xf2f0ea, 0xe8c64a, 0x9fc6d8, 0xd87a6a, 0x6e8f5a], security: 1 },
  sedan:   { name: 'スタンダード',   cls: 'セダン',   len: 4.6, wid: 1.76, hgt: 1.45, mass: 1350, vmax: 160 * KMH, accel: 5.2, grip: 1.0,  drive: 'FF', price: 1800000,  style: 'sedan',  colors: [0xeeeeee, 0x222428, 0x8a8f96, 0x2c4a7a, 0x7a2a2a, 0xb8b0a0], security: 2 },
  taxi:    { name: 'タクシー',       cls: 'セダン',   len: 4.6, wid: 1.72, hgt: 1.5, mass: 1350, vmax: 150 * KMH, accel: 4.8, grip: 1.0,  drive: 'FR', price: 1500000,  style: 'sedan',  colors: [0xf0c419], security: 2, taxi: true },
  suv:     { name: 'トレイル4WD',    cls: 'SUV',      len: 4.7, wid: 1.9, hgt: 1.8, mass: 1900, vmax: 150 * KMH, accel: 5.0, grip: 1.05, drive: '4WD', price: 3200000, style: 'suv',    colors: [0x2f3b2f, 0x8a8f96, 0xeeeeee, 0x5a3a2a, 0x223355], security: 3 },
  coupe:   { name: 'ミノ・クーペ',   cls: 'スポーツ', len: 4.4, wid: 1.8, hgt: 1.28, mass: 1250, vmax: 230 * KMH, accel: 7.5, grip: 1.05, drive: 'FR', price: 4500000,  style: 'coupe',  colors: [0xd0302a, 0x1d4fa8, 0xf2f2f2, 0x111111, 0xf09a1a], security: 4 },
  super:   { name: 'ナガラ GT',      cls: 'スポーツ', len: 4.5, wid: 1.95, hgt: 1.15, mass: 1450, vmax: 290 * KMH, accel: 10.5, grip: 1.15, drive: '4WD', price: 28000000, style: 'super', colors: [0xe8c020, 0x2ad06a, 0xd02a6a, 0x222222], security: 5, tracker: true },
  van:     { name: 'ワークバン',     cls: '商用',     len: 4.8, wid: 1.7, hgt: 2.0, mass: 1700, vmax: 130 * KMH, accel: 3.8, grip: 0.95, drive: 'FR', price: 2200000,  style: 'van',    colors: [0xf4f4f4, 0x9aa0a6, 0x3a5a8a], security: 1 },
  kturck:  { name: 'ミニトラック',   cls: '商用',     len: 3.4, wid: 1.48, hgt: 1.8, mass: 800,  vmax: 105 * KMH, accel: 3.8, grip: 0.9,  drive: 'FR', price: 700000,   style: 'ktruck', colors: [0xf2f2f2, 0x5a7a9a], security: 1 },
  truck:   { name: 'カーゴトラック', cls: '商用',     len: 7.2, wid: 2.2, hgt: 3.0, mass: 6000, vmax: 100 * KMH, accel: 2.6, grip: 0.9,  drive: 'FR', price: 5000000,  style: 'truck',  colors: [0x2a5aa0, 0xeeeeee, 0x3a7a3a], security: 2 },
  bus:     { name: '路線バス',       cls: '商用',     len: 10.5, wid: 2.4, hgt: 3.0, mass: 10000, vmax: 90 * KMH, accel: 2.0, grip: 0.9, drive: 'FR', price: 20000000, style: 'bus',    colors: [0xf2f2f2], security: 2 },
  police:  { name: 'パトカー',       cls: '緊急',     len: 4.8, wid: 1.8, hgt: 1.5, mass: 1500, vmax: 200 * KMH, accel: 7.2, grip: 1.1,  drive: 'FR', price: 0,        style: 'sedan',  colors: [0xf4f4f4], security: 5, police: true },
  ambulance:{ name: '救急車',        cls: '緊急',     len: 5.6, wid: 1.9, hgt: 2.4, mass: 2600, vmax: 150 * KMH, accel: 4.0, grip: 0.95, drive: 'FR', price: 0,        style: 'van',    colors: [0xf8f8f8], security: 5 },
  armored: { name: '装甲車',         cls: '緊急',     len: 5.8, wid: 2.3, hgt: 2.4, mass: 7000, vmax: 130 * KMH, accel: 4.0, grip: 1.0,  drive: '4WD', price: 0,       style: 'truck',  colors: [0x2a2e34], security: 5, police: true },
};
// 交通に出る車種と出現率（時間帯で変える）
export const TRAFFIC_MIX = [['kei', 22], ['sedan', 26], ['taxi', 9], ['suv', 10], ['coupe', 4], ['super', 1], ['van', 9], ['kturck', 7], ['truck', 5], ['bus', 3]];
export function pickModel(rng = Math.random, mix = TRAFFIC_MIX) {
  const tot = mix.reduce((a, m) => a + m[1], 0); let r = rng() * tot;
  for (const [id, w] of mix) { r -= w; if (r <= 0) return id; }
  return mix[0][0];
}
