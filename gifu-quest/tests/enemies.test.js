import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
// 絵はここでは焼き付けない（名前の登録だけ見る）
const defined = new Set();
vi.mock('../src/gfx/atlas.js', () => ({ drawSprite: () => {}, hasSprite: () => true, spriteInfo: () => ({ oy: 40, h: 40 }), defineSprite: (n) => defined.add(n) }));
import { Level } from '../src/world/level.js';
import { STEP, TILE } from '../src/core/config.js';
import { entityClass } from '../src/actors/entity.js';
import { KINDS } from '../src/actors/enemyTypes.js';
import '../src/world/platforms.js';
import '../src/world/liquids.js';
import '../src/world/triggers.js';
import { defineEnemies } from '../src/art/enemies.js';

// 敵を動かすための最小の World
function fakeWorld(rows) {
  const level = new Level({ id: 't', tiles: rows });
  const w = {
    level, entities: [], platforms: [], liquids: [], lights: [], time: 0, tick: 0, state: 'play',
    stats: { misses: 0, enemies: 0 },
    camera: { x: 0, y: 0, vw: 2000, vh: 1000, shake() {} },
    player: { x: -9999, y: -9999, w: 24, h: 44, vx: 0, vy: 0, cx: -9999, cy: -9999, platform: null, onGround: false },
    particles: new Proxy({}, { get: () => () => null }),
    events: { emit() {} }, env: { weather: 'sunny', wind: 0 },
    sfx() {}, spawn(e) { w.entities.push(e); if (e.platform) w.platforms.push(e); if (e.init) e.init(); return e; },
  };
  return w;
}
const make = (w, spec) => w.spawn(new (entityClass(spec.type))(w, spec));
const step = (w, e, sec) => { for (let i = 0; i < sec / STEP; i++) { w.time += STEP; w.tick++; e.preUpdate(); e.update(STEP); } };

describe('敵の種類', () => {
  it('ARCHITECTURE の表の kind がすべて KINDS にある', () => {
    const doc = fs.readFileSync(new URL('../docs/ARCHITECTURE.md', import.meta.url), 'utf8');
    const kinds = [...doc.matchAll(/([a-z]+)（(walker|spiky|hopper|flyer|thrower|popper|charger|shielder)/g)];
    expect(kinds.length).toBeGreaterThan(20);
    for (const [, kind, motion] of kinds) expect(KINDS[kind]?.motion, kind).toBe(motion);
  });
  it('すべての kind・アニメ・弾・仕掛けの絵が登録されている', () => {
    defineEnemies();
    const need = {
      walker: ['walk', 'hurt'], spiky: ['walk', 'hurt'], hopper: ['idle', 'crouch', 'jump', 'fall', 'hurt'], flyer: ['fly', 'hurt'],
      thrower: ['idle', 'windup', 'throw', 'hurt'], popper: ['jump', 'hurt'], charger: ['walk', 'windup', 'run', 'dizzy', 'hurt'], shielder: ['walk', 'block', 'hurt'],
    };
    for (const [kind, K] of Object.entries(KINDS)) {
      if (kind === 'hibashira') continue;
      for (const a of need[K.motion]) expect(defined.has(`enemy_${kind}_${a}`), `enemy_${kind}_${a}`).toBe(true);
    }
    for (const n of ['enemy_yukigumo_warn', 'enemy_hibashira_body', 'enemy_hibashira_top', 'enemy_shot_iga', 'enemy_shot_geta', 'enemy_shot_hanabi', 'enemy_shot_yukidama', 'enemy_shot_iwa', 'enemy_shot_ougi', 'enemy_shot_tsurara',
      'gim_plat_wood', 'gim_plat_stone', 'gim_plat_cloud', 'gim_plat_ice', 'gim_plat_rock', 'gim_plat_rhythm', 'gim_gondola', 'gim_boat', 'gim_kagaribi', 'gim_float_base', 'gim_float_roof', 'gim_wheel',
      'gim_chochin', 'gim_post', 'gim_bouncer_taiko', 'gim_bouncer_kasa', 'gim_switch', 'gim_gate', 'gim_gate_frame', 'gim_vent', 'gim_icicle', 'gim_bolt_mark', 'gim_ropeway_tower']) expect(defined.has(n), n).toBe(true);
  });
});

describe('敵の動き', () => {
  const rows = ['#..............#', '#..............#', '#..............#', '################'];
  it('歩く：壁で折り返す', () => {
    const w = fakeWorld(rows);
    const e = make(w, { type: 'walker', kind: 'uribo', x: 3, y: 2, face: -1 });
    step(w, e, 2);
    expect(e.face).toBe(1);
  });
  it('歩くは崖から落ち、トゲは崖で折り返す', () => {
    const cliff = ['................', '................', '#######.........', '#######.........', '################'];
    const w = fakeWorld(cliff);
    const a = make(w, { type: 'walker', kind: 'uribo', x: 4, y: 1, face: 1 });
    const b = make(w, { type: 'spiky', kind: 'iga', x: 4, y: 1, face: 1 });
    step(w, a, 3); step(w, b, 3);
    expect(a.y).toBeGreaterThan(2 * TILE);   // 下の段に落ちた
    expect(b.y + b.h).toBeCloseTo(2 * TILE, 0);   // 上の段に残る
    expect(b.stompable).toBe(false);
  });
  it('飛び出す：隠れている間は当たらず、予告のあと飛び出す', () => {
    const w = fakeWorld(['................', '................', '........~~~~....', '########wwww####']);
    const e = make(w, { type: 'popper', kind: 'ayu', x: 9, y: 2, period: 1 });
    expect(e.enemy).toBe(false);
    let warned = false, up = false;
    for (let i = 0; i < 3 / STEP; i++) { w.tick++; e.preUpdate(); e.update(STEP); if (e.state === 'warn') warned = true; if (e.state === 'up') { up = true; expect(warned).toBe(true); expect(e.enemy).toBe(true); break; } }
    expect(up).toBe(true);
  });
  it('投げる：予告（0.4秒以上）のあとに弾を投げる', () => {
    const w = fakeWorld(rows);
    const e = make(w, { type: 'thrower', kind: 'saru', x: 10, y: 2 });
    Object.assign(w.player, { x: 4 * TILE, y: 2 * TILE, cx: 4 * TILE + 12, cy: 2 * TILE + 22 });
    let windT = 0;
    for (let i = 0; i < 4 / STEP && !w.entities.some((b) => b.type === 'bullet'); i++) { w.tick++; e.preUpdate(); e.update(STEP); if (e.state === 'windup') windT += STEP; }
    expect(w.entities.some((b) => b.type === 'bullet')).toBe(true);
    expect(windT).toBeGreaterThanOrEqual(0.4);
  });
  it('盾：正面の弾は防ぎ、後ろからは防がない', () => {
    const w = fakeWorld(rows);
    const e = make(w, { type: 'shielder', kind: 'kappa', x: 7, y: 2, face: -1 });
    const front = { x: e.x - 30, y: e.y + 10, w: 20, h: 14 }, back = { x: e.x + e.w + 10, y: e.y + 10, w: 20, h: 14 };
    expect(e.shielded({}, front)).toBe(true);
    expect(e.shielded({}, back)).toBe(false);
    expect(e.hp).toBe(2);
  });
  it('盾：背後のすぐ近くからの一閃・後ろへ飛ぶ弾は防がない（向きは主人公の位置・弾の進む向きで決める）', () => {
    const w = fakeWorld(rows);
    const e = make(w, { type: 'shielder', kind: 'kappa', x: 7, y: 2, face: -1 });
    // 主人公は背後（右）すぐ近くで左を向いて一閃：当たり箱の中心は盾の前に出る
    const slash = { p: { cx: e.cx + 20 }, x: e.cx + 26 - 76, y: e.y - 10, w: 76, h: 60 };
    expect(e.shielded(slash, slash)).toBe(false);
    const slashFront = { p: { cx: e.cx - 20 }, x: e.cx - 26, y: e.y - 10, w: 76, h: 60 };
    expect(e.shielded(slashFront, slashFront)).toBe(true);
    const shotFromBack = { vx: -640, x: e.cx - 10, y: e.y + 10, w: 20, h: 14 };
    expect(e.shielded(shotFromBack, shotFromBack)).toBe(false);
    const shotFromFront = { vx: 640, x: e.cx - 10, y: e.y + 10, w: 20, h: 14 };
    expect(e.shielded(shotFromFront, shotFromFront)).toBe(true);
  });
  it('鵜飼船：途中でミスして始点側に戻されたら、すぐ始点に戻る', () => {
    const w = fakeWorld(['................................................', '................................................', '................................................', '################################################']);
    const b = make(w, { type: 'boat', x: 2, y: 2, w: 3, x2: 40, speed: 2 });
    Object.assign(w.player, { platform: b, onGround: true, cx: b.cx });
    step(w, b, 4);
    expect(b.state).toBe('go');
    expect(b.u).toBeGreaterThan(0.1);
    Object.assign(w.player, { platform: null, onGround: false, cx: 1 * TILE });
    w.stats.misses++;
    step(w, b, 0.1);
    expect(b.state).toBe('wait');
    expect(b.x).toBeCloseTo(2 * TILE, 0);
  });
  it('動く床：往復して元の位置に戻る', () => {
    const w = fakeWorld(rows);
    const e = make(w, { type: 'movingPlatform', x: 2, y: 1, w: 2, dx: 4, speed: 2 });
    const x0 = e.x;
    step(w, e, 2); expect(e.x - x0).toBeCloseTo(4 * TILE, 0);
    step(w, e, 2); expect(e.x).toBeCloseTo(x0, 0);
  });
  it('水位：スイッチで上がる', () => {
    const w = fakeWorld(rows);
    const q = make(w, { type: 'waterLevel', id: 'p', x0: 1, x1: 14, yLow: 2, yHigh: 0 });
    const s = make(w, { type: 'waterSwitch', x: 3, y: 2, target: 'p' });
    const y0 = w.liquids[0].y;
    s.damage(1, {});
    step(w, q, 4);
    expect(w.liquids[0].y).toBeLessThan(y0 - TILE);
  });
});
