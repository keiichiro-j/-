// 武器の定義表（設計書6章）。バランス調整はこの表の書き換えだけで済む。実在の商品名は使わない
// dmg: 威力 / rpm: 連射(発/分) / mag: 装弾 / range: 射程m / price: 円 / mild: マイルド表現時の名前
export const WEAPON_CLASSES = ['近接', '拳銃', 'SMG', 'SG', 'ライフル', '狙撃', '重火器', '投擲', '特殊'];
export const WEAPONS = [
  { id: 'fist',    cls: '近接',   name: '素手',             dmg: 10,  rpm: 0,   mag: 0,  range: 1.2, price: 0,      mild: '素手', kind: 'melee', slot: 'melee' },
  { id: 'bat',     cls: '近接',   name: '金属バット',       dmg: 30,  rpm: 0,   mag: 0,  range: 1.6, price: 1500,   mild: 'ピコピコハンマー', kind: 'melee', slot: 'melee', prop: 3 },
  { id: 'bokuto',  cls: '近接',   name: '木刀',             dmg: 35,  rpm: 0,   mag: 0,  range: 1.8, price: 3000,   mild: 'スポンジ剣', kind: 'melee', slot: 'melee', prop: 3 },
  { id: 'knife',   cls: '近接',   name: 'サバイバルナイフ', dmg: 40,  rpm: 0,   mag: 0,  range: 1.2, price: 4000,   mild: 'フライ返し', kind: 'melee', slot: 'melee', prop: 2 },
  { id: 'pistol',  cls: '拳銃',   name: 'ハンドガン',       dmg: 25,  rpm: 240, mag: 12, range: 50,  price: 15000,  mild: '水鉄砲', kind: 'gun', slot: 'hand', spread: 0.012, recoil: 0.03 },
  { id: 'revolver',cls: '拳銃',   name: 'リボルバー',       dmg: 60,  rpm: 70,  mag: 6,  range: 60,  price: 40000,  mild: 'ペイント銃', kind: 'gun', slot: 'hand', spread: 0.01, recoil: 0.08 },
  { id: 'stun',    cls: '拳銃',   name: 'スタンガン',       dmg: 0,   rpm: 30,  mag: 1,  range: 10,  price: 8000,   mild: 'スタンガン', kind: 'gun', slot: 'hand', spread: 0.01, recoil: 0.01, stun: 4 },
  { id: 'smg',     cls: 'SMG',    name: 'サブマシンガン',   dmg: 18,  rpm: 800, mag: 30, range: 45,  price: 60000,  mild: '水鉄砲（連射）', kind: 'gun', slot: 'hand', auto: true, spread: 0.03, recoil: 0.012 },
  { id: 'mpistol', cls: 'SMG',    name: 'マシンピストル',   dmg: 15,  rpm: 900, mag: 20, range: 30,  price: 35000,  mild: '水鉄砲（連射）', kind: 'gun', slot: 'hand', auto: true, spread: 0.04, recoil: 0.014 },
  { id: 'pump',    cls: 'SG',     name: 'ポンプショットガン', dmg: 12, rpm: 60,  mag: 8,  range: 20,  price: 50000,  mild: '紙吹雪バズーカ', kind: 'gun', slot: 'long', pellets: 8, spread: 0.07, recoil: 0.09 },
  { id: 'autosg',  cls: 'SG',     name: 'セミオートショットガン', dmg: 10, rpm: 180, mag: 10, range: 18, price: 90000, mild: '紙吹雪バズーカ', kind: 'gun', slot: 'long', pellets: 8, spread: 0.08, recoil: 0.07 },
  { id: 'ar',      cls: 'ライフル', name: 'アサルトライフル', dmg: 30,  rpm: 600, mag: 30, range: 90,  price: 120000, mild: 'ペイントライフル', kind: 'gun', slot: 'long', auto: true, spread: 0.015, recoil: 0.016 },
  { id: 'carbine', cls: 'ライフル', name: 'カービン',       dmg: 28,  rpm: 700, mag: 30, range: 80,  price: 140000, mild: 'ペイントライフル', kind: 'gun', slot: 'long', auto: true, spread: 0.018, recoil: 0.014 },
  { id: 'sniper',  cls: '狙撃',   name: 'スナイパーライフル', dmg: 120, rpm: 40, mag: 5,  range: 300, price: 250000, mild: '長距離ペイント銃', kind: 'gun', slot: 'long', scope: true, spread: 0.001, recoil: 0.12 },
  { id: 'rpg',     cls: '重火器', name: 'ロケットランチャー', dmg: 200, rpm: 20, mag: 1,  range: 150, price: 500000, mild: '花火ランチャー', kind: 'proj', slot: 'long', radius: 6, speed: 45 },
  { id: 'gl',      cls: '重火器', name: 'グレネードランチャー', dmg: 150, rpm: 40, mag: 6, range: 60, price: 400000, mild: '花火ランチャー', kind: 'proj', slot: 'long', radius: 5, speed: 26, arc: true },
  { id: 'grenade', cls: '投擲',   name: '手榴弾',           dmg: 150, rpm: 0,   mag: 1,  range: 25,  price: 10000,  mild: '紙吹雪ボール', kind: 'throw', slot: 'throw', radius: 5, fuse: 2.5, unit: true },
  { id: 'sticky',  cls: '投擲',   name: '粘着爆弾',         dmg: 180, rpm: 0,   mag: 1,  range: 20,  price: 20000,  mild: '紙吹雪ボール', kind: 'throw', slot: 'throw', radius: 5, remote: true, unit: true },
  { id: 'smoke',   cls: '投擲',   name: '発煙筒',           dmg: 0,   rpm: 0,   mag: 1,  range: 25,  price: 3000,   mild: '発煙筒', kind: 'throw', slot: 'throw', smoke: true, fuse: 1.2, unit: true },
  { id: 'extinguisher', cls: '特殊', name: '消火器',        dmg: 0,   rpm: 600, mag: 200, range: 6,  price: 2000,   mild: '消火器', kind: 'spray', slot: 'hand', auto: true },
];
export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map(w => [w.id, w]));
// 所持の上限：近接1、拳銃類2、長物2、投擲は各種
export const CARRY_LIMIT = { melee: 1, hand: 2, long: 2 };

export function weaponName(w, mild) { return mild ? w.mild : w.name; }
export function fireInterval(w) { return w.rpm > 0 ? 60 / w.rpm : 0.5; }

// 頭×2.0、胴×1.0、手足×0.6
export const HIT_MULT = { head: 2.0, body: 1.0, limb: 0.6 };
export function damageFor(w, part, dist) {
  const fall = dist > w.range ? Math.max(0.25, 1 - (dist - w.range) / w.range) : 1;
  return w.dmg * (HIT_MULT[part] || 1) * fall;
}

// 所持品の追加（上限を超えたら同じ枠の最初の武器と入れ替え）
export function addWeapon(inv, id, ammo = 0) {
  const w = WEAPON_BY_ID[id]; if (!w) return inv;
  const has = inv.weapons.find(x => x.id === id);
  if (has) { has.ammo += ammo; return inv; }
  if (w.slot !== 'throw') {
    const same = inv.weapons.filter(x => WEAPON_BY_ID[x.id].slot === w.slot && x.id !== 'fist');
    if (same.length >= (CARRY_LIMIT[w.slot] || 9)) {
      const out = same[0];
      inv.weapons.splice(inv.weapons.indexOf(out), 1);
      inv.stored = inv.stored || []; inv.stored.push(out);
    }
  }
  inv.weapons.push({ id, ammo, clip: Math.min(w.mag, ammo) });
  if (w.unit) inv.weapons[inv.weapons.length - 1].clip = ammo;
  return inv;
}
