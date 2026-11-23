// ロジックの単体テスト（three.js 不要）。npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genWorld, T, idx, signalState, findPath, nearestNode, isWalkable, solidAt, H_ROADS, V_ROADS, DRIVEWAY } from '../../src/world/mapgen.js';
import { sampleH, groundH, mtnH, initTerrain } from '../../src/world/terrain.js';
import { makeVehicle, stepVehicle, collideVehicles } from '../../src/vehicles/physics.js';
import { VEHICLES } from '../../src/vehicles/vehicle.js';
import { idmAccel } from '../../src/vehicles/traffic.js';
import { newWanted, reportCrime, updateWanted, starStyle, heatMatch } from '../../src/systems/wanted.js';
import { MISSIONS, newMissionState, startMission, updateMission, taxiFare } from '../../src/systems/missions.js';
import { WEAPONS, addWeapon, damageFor, WEAPON_BY_ID } from '../../src/combat/weapons.js';
import { migrate, defaultSave } from '../../src/core/save.js';
import { newPose, pose, strideLength, advancePhase } from '../../src/actors/pedAnim.js';
import { newMoney, pay, onBusted, onWasted } from '../../src/systems/economy.js';
import { TILE, MAP_W, MAP_H, HEIGHTS } from '../../src/core/config.js';

const world = genWorld(19500);
initTerrain(world);

test('地図：140×100タイルで同じシードなら同じ街', () => {
  assert.equal(world.tiles.length, MAP_W * MAP_H);
  const w2 = genWorld(19500);
  assert.deepEqual(Array.from(w2.tiles), Array.from(world.tiles));
  assert.ok(world.buildings.length > 100, '建物が十分ある');
});

test('交通グラフ：全ノードがつながっている', () => {
  const g = world.graph;
  assert.ok(g.nodes.length > 40 && g.edges.length > 60);
  const seen = new Set([0]); const q = [0];
  while (q.length) { const n = q.pop(); for (const ei of g.nodes[n].edges) { const e = g.edges[ei]; const m = e.a === n ? e.b : e.a; if (!seen.has(m)) { seen.add(m); q.push(m); } } }
  assert.equal(seen.size, g.nodes.length);
  const a = nearestNode(g, 10, 10), b = nearestNode(g, 500, 380);
  assert.ok(findPath(g, a, b).length > 2);
});

test('道路タイルの上に建物はない・ランドマークは歩道上', () => {
  for (let i = 0; i < world.tiles.length; i++) if (world.tiles[i] === T.ROAD) assert.equal(world.bh[i], 0);
  for (const k of ['gunshop', 'police', 'hospital', 'home', 'bank', 'gas']) {
    const p = world.lm[k]; assert.ok(p, k);
    assert.ok(!solidAt(world, p.x, p.z, 0.5), k + 'は通れる');
  }
});

test('信号：同じ交差点の縦横が同時に青にならない', () => {
  const n = world.graph.nodes.find(n => n.signal);
  for (let t = 0; t < 60; t += 0.5) assert.ok(!(signalState(n, 'h', t) === 'green' && signalState(n, 'v', t) === 'green'));
});

test('横断歩道は歩ける', () => {
  let n = 0; for (let i = 0; i < world.cw.length; i++) if (world.cw[i] >= 0) { n++; assert.ok(isWalkable(world, i % MAP_W, Math.floor(i / MAP_W))); }
  assert.ok(n > 50);
});

test('地形：里山は起伏があり、道路と田んぼは平ら', () => {
  let maxHill = 0;
  for (let r = 20; r < 90; r++) for (let c = 0; c < 9; c++) maxHill = Math.max(maxHill, groundH(c * TILE + 2, r * TILE + 2));
  assert.ok(maxHill > 6, '里山の高さ ' + maxHill);
  for (let i = 0; i < world.tiles.length; i++) if ((world.tiles[i] === T.ROAD && world.dist[i] !== 3) || world.tiles[i] === T.FIELD) { const c = i % MAP_W, r = Math.floor(i / MAP_W); assert.ok(Math.abs(groundH(c * TILE + 2, r * TILE + 2)) < 0.6, `(${c},${r}) ${groundH(c * TILE + 2, r * TILE + 2)}`); }
});

test('地形：金華山の頂上は約58mで平ら、川底は低い、橋は水面より上', () => {
  const c = world.lm.castle;
  assert.ok(Math.abs(mtnH(c.x, c.z) - HEIGHTS.mountainPeak) < 1);
  assert.ok(Math.abs(mtnH(c.x + 4, c.z) - mtnH(c.x, c.z)) < 0.5);
  assert.ok(groundH(200, 13 * TILE) < -2);
  assert.equal(sampleH(world, (50 + 1) * TILE, 13 * TILE), HEIGHTS.bridge);
});

test('ドライブウェイ：隣り合う点の勾配が車で登れる範囲（35%以下）', () => {
  for (let k = 3; k < DRIVEWAY.length; k++) {
    const [c0, r0] = DRIVEWAY[k - 1], [c1, r1] = DRIVEWAY[k];
    const d = Math.hypot(c1 - c0, r1 - r0) * TILE;
    const dh = Math.abs(groundH(c1 * TILE, r1 * TILE) - groundH(c0 * TILE, r0 * TILE));
    assert.ok(dh / d < 0.35, `区間${k}: ${(dh / d * 100).toFixed(0)}%`);
  }
});

const flat = { height: () => 0, solid: () => false, grip: () => 1, water: () => false };
test('車両物理：加速して最高速を超えない、ブレーキで止まる', () => {
  const v = makeVehicle(VEHICLES.sedan, 0, 0, 0);
  for (let i = 0; i < 60 * 30; i++) stepVehicle(v, { throttle: 1, brake: 0, steer: 0 }, 1 / 60, flat);
  assert.ok(v.vf > 30 && v.vf <= VEHICLES.sedan.vmax + 0.5, `vf=${v.vf}`);
  for (let i = 0; i < 60 * 8; i++) stepVehicle(v, { throttle: 0, brake: 1, steer: 0 }, 1 / 60, flat);
  assert.ok(v.vf < 0.7);
});

test('車両物理：ハンドルで左に曲がる（左＝正）', () => {
  const v = makeVehicle(VEHICLES.sedan, 0, 0, 0);
  for (let i = 0; i < 120; i++) stepVehicle(v, { throttle: 0.6, brake: 0, steer: 1 }, 1 / 60, flat);
  assert.ok(v.heading > 0.2, 'heading=' + v.heading);
  assert.ok(v.x > 0, '+x 側（左）へ進む');
});

test('車両物理：FR車はサイドブレーキで横滑り（ドリフト）する', () => {
  const v = makeVehicle(VEHICLES.coupe, 0, 0, 0);
  v.vf = 22;
  let maxSlip = 0;
  for (let i = 0; i < 90; i++) { stepVehicle(v, { throttle: 1, brake: 0, steer: 1, handbrake: i < 40 }, 1 / 60, flat); maxSlip = Math.max(maxSlip, Math.abs(v.vl)); }
  assert.ok(maxSlip > 1.5, 'slip=' + maxSlip);
});

test('車両物理：壁で跳ね返り、壁の中に入らない', () => {
  const env = { ...flat, solid: (x) => x > 10 };
  const v = makeVehicle(VEHICLES.sedan, 0, 0, Math.PI / 2); v.vf = 20;
  let hit = 0;
  for (let i = 0; i < 120; i++) { stepVehicle(v, { throttle: 0, brake: 0, steer: 0 }, 1 / 60, env); hit = Math.max(hit, v.crashImpulse); }
  assert.ok(v.x < 10 && hit > 10);
});

test('車同士：質量比でインパルスを分配', () => {
  const a = makeVehicle(VEHICLES.truck, 0, 0, 0), b = makeVehicle(VEHICLES.kei, 0, 4.5, 0);
  a.vf = 10; b.vf = 0;
  collideVehicles(a, b);
  assert.ok(b.vf > a.vf - 0.1 && b.vf > 5, `a=${a.vf} b=${b.vf}`);
});

test('IDM：前が詰まると減速、空いていれば加速', () => {
  assert.ok(idmAccel(10, 14, 60, 10) > 0);
  assert.ok(idmAccel(10, 14, 5, 0) < -3);
});

test('手配：目撃なしの通報で中空き★、警察の視認で白★、捜索エリアの外で解除', () => {
  const w = newWanted();
  reportCrime(w, 'shooting', 100, 100, 'civ');
  assert.equal(w.stars, 2); assert.equal(starStyle(w), 'hollow');
  updateWanted(w, 0.1, { policeSees: true, x: 100, z: 100, seeRate: 10, features: {} });
  for (let i = 0; i < 20; i++) updateWanted(w, 0.1, { policeSees: true, x: 100, z: 100, features: {} });
  assert.equal(starStyle(w), 'solid');
  updateWanted(w, 0.1, { policeSees: false, x: 100, z: 100, features: {} });
  assert.equal(starStyle(w), 'blink');
  let t = 0; while (w.stars && t < 120) { updateWanted(w, 0.5, { policeSees: false, x: 600, z: 600, features: {} }); t += 0.5; }
  assert.equal(w.stars, 0);
  assert.ok(t >= 2 * 8 - 0.5, '★×8秒以上かかる: ' + t);
});

test('手配：速度超過は一般人の通報では付かない、警官攻撃は＋1', () => {
  const w = newWanted();
  reportCrime(w, 'speeding', 0, 0, 'civ'); assert.equal(w.stars, 0);
  reportCrime(w, 'speeding', 0, 0, 'police'); assert.equal(w.stars, 1);
  reportCrime(w, 'copAttack', 0, 0, 'police'); assert.equal(w.stars, 3);
  reportCrime(w, 'copAttack', 0, 0, 'police'); assert.equal(w.stars, 4);
});

test('ヒート：着替えと車の乗り換えで一致度が下がる', () => {
  const known = { outfit: 1, mask: false, car: 5, carColor: 0xff0000 };
  assert.equal(heatMatch(known, { ...known }), 1);
  assert.ok(heatMatch(known, { outfit: 2, mask: false, car: 9, carColor: 0x00ff00 }) < 0.3);
});

test('ミッション：配達を順に達成すると報酬、時間切れで失敗', () => {
  const ms = newMissionState();
  const def = MISSIONS.find(m => m.id === 'flowers');
  const pos = { florist: { x: 0, z: 0 }, ryokan: { x: 100, z: 0 } };
  const res = (k) => pos[k];
  startMission(ms, def);
  assert.equal(updateMission(ms, 0.1, { x: 0, z: 0, inCar: false, wanted: 0 }, res).type, 'step');
  const r = updateMission(ms, 0.1, { x: 100, z: 0, inCar: false, wanted: 0 }, res);
  assert.equal(r.type, 'complete'); assert.equal(r.reward, def.reward);
  startMission(ms, def);
  updateMission(ms, 0.1, { x: 0, z: 0 }, res);
  let out; for (let i = 0; i < 2000 && !out; i++) out = updateMission(ms, 0.1, { x: 50, z: 50 }, res);
  assert.equal(out.type, 'fail');
});

test('タクシー料金：距離で増え、早いとボーナス', () => {
  assert.ok(taxiFare(500, 30) > taxiFare(500, 200));
  assert.ok(taxiFare(800, 200) > taxiFare(200, 200));
});

test('武器：定義表は20種、所持上限を超えると保管へ', () => {
  assert.equal(WEAPONS.length, 20);
  for (const w of WEAPONS) assert.ok(w.mild && w.name && w.cls);
  const inv = { weapons: [{ id: 'fist', ammo: 0, clip: 0 }], stored: [] };
  addWeapon(inv, 'ar', 30); addWeapon(inv, 'sniper', 10); addWeapon(inv, 'pump', 8);
  assert.equal(inv.weapons.filter(w => WEAPON_BY_ID[w.id].slot === 'long').length, 2);
  assert.equal(inv.stored.length, 1);
  assert.equal(damageFor(WEAPON_BY_ID.pistol, 'head', 10), 50);
  assert.ok(damageFor(WEAPON_BY_ID.pistol, 'limb', 10) < 25);
});

test('セーブ：古い形式を変換できる', () => {
  const d = migrate({ money: 1234 });
  assert.equal(d.v, 1); assert.equal(d.money.cash, 1234);
  assert.deepEqual(migrate(defaultSave()).money, defaultSave().money);
});

test('お金：逮捕で現金だけ失う、ダウンは治療費', () => {
  const m = newMoney(5000, 10000);
  assert.equal(onBusted(m), 5000); assert.equal(m.bank, 10000);
  m.cash = 100; onWasted(m, 3000); assert.equal(m.bank, 7000);
  assert.ok(pay(m, 6000)); assert.equal(m.bank, 1000);
  assert.ok(!pay(m, 99999));
});

test('歩行：歩幅は速度とともに伸び、足こすりしない（1周期で進む距離≒2歩）', () => {
  for (const v of [1.2, 3, 6]) {
    let ph = 0; const dt = 1 / 60; let t = 0;
    while (ph < Math.PI * 2) { ph = advancePhase(ph, v, dt); t += dt; }
    const dist = v * t;
    assert.ok(Math.abs(dist - 2 * strideLength(v)) < 0.1, `v=${v} ${dist} vs ${2 * strideLength(v)}`);
  }
  const p = pose(newPose(), { speed: 1.3, phase: Math.PI / 2, state: 'walk' });
  assert.ok(p.thL < 0 && p.thR > 0, '左右の脚が逆');
});

import { PROPERTIES, applyMods, dealerPrice, DEALER_STOCK, CAR_MODS, nextModPrice, robberyAmount, ROBBERIES } from '../../src/systems/property.js';

test('操作性：高速でハンドルを切りっぱなしにしてもスピンしない', () => {
  const v = makeVehicle(VEHICLES.coupe, 0, 0, 0); v.vf = 30;
  let maxSlip = 0;
  for (let i = 0; i < 120; i++) { stepVehicle(v, { throttle: 1, brake: 0, steer: 1 }, 1 / 60, flat); maxSlip = Math.max(maxSlip, Math.abs(v.vl)); }
  assert.ok(maxSlip < 2.5, '横滑り ' + maxSlip.toFixed(2));
  assert.ok(Math.abs(v.yawRate) < 1.2, 'ヨー ' + v.yawRate.toFixed(2));
});

test('操作性：ハンドルを離すとまっすぐに戻る', () => {
  const v = makeVehicle(VEHICLES.sedan, 0, 0, 0); v.vf = 20;
  for (let i = 0; i < 30; i++) stepVehicle(v, { throttle: 0.5, brake: 0, steer: 1 }, 1 / 60, flat);
  for (let i = 0; i < 60; i++) stepVehicle(v, { throttle: 0.5, brake: 0, steer: 0 }, 1 / 60, flat);
  assert.ok(Math.abs(v.yawRate) < 0.05 && Math.abs(v.steer) < 0.01);
});

test('カスタム：エンジンとタイヤで性能が上がり、元の表は変わらない', () => {
  const base = VEHICLES.sedan;
  const m = applyMods(base, { engine: 3, tires: 2, armor: 2, brakes: 1 });
  assert.ok(m.accel > base.accel * 1.3 && m.grip > base.grip && m.armorK < 1 && m.brakeK > 1);
  assert.equal(VEHICLES.sedan.accel, base.accel);
  assert.equal(nextModPrice({ engine: 3 }, 'engine'), null);
  assert.equal(nextModPrice({}, 'turbo'), CAR_MODS.find(x => x.id === 'turbo').levels[1]);
});

test('ブレーキの改造で止まる距離が短くなる', () => {
  const run = (spec) => { const v = makeVehicle(spec, 0, 0, 0); v.vf = 25; let d = 0; for (let i = 0; i < 600 && v.vf > 0.7; i++) { const z = v.z; stepVehicle(v, { throttle: 0, brake: 1, steer: 0 }, 1 / 60, flat); d += v.z - z; } return d; };
  assert.ok(run(applyMods(VEHICLES.sedan, { brakes: 3 })) < run(VEHICLES.sedan) * 0.75);
});

test('車屋と不動産：価格がつき、最初の家は無料で1軒だけ', () => {
  for (const id of DEALER_STOCK) assert.ok(dealerPrice(id) >= 20000);
  assert.ok(dealerPrice('super') > dealerPrice('kei') * 10);
  assert.equal(PROPERTIES.filter(p => p.start).length, 1);
  assert.ok(PROPERTIES.every(p => p.slots >= 2));
  const world2 = genWorld(19500);
  for (const p of PROPERTIES) assert.ok(world2.lm['prop_' + p.id], p.id);
  for (const k of ['dealer', 'tuner', 'realty', 'jewelry']) assert.ok(world2.lm[k], k);
});

test('強盗：店ごとの金額の範囲と★', () => {
  for (const k in ROBBERIES) { const [a, b] = ROBBERIES[k].amount; assert.ok(robberyAmount(k, 0) >= a && robberyAmount(k, 1) <= b); }
  assert.equal(ROBBERIES.bank.stars, 'bank');
});
