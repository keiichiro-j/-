import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../src/gfx/atlas.js', () => ({ drawSprite: () => {}, hasSprite: () => true, defineSprite: () => {} }));
vi.mock('../src/art/heroGear.js', () => ({ drawHeroDressed: () => {}, heroSpriteName: () => 'x' }));
import { Player } from '../src/actors/player.js';
import { input } from '../src/core/input.js';
import { Level } from '../src/world/level.js';
import { STEP, TILE, PHYS } from '../src/core/config.js';

// デバッグで直した主人公の状態まわり（ヒットストップ中の入力・溜め・復活・滑空・タップ・武器 id）
const nop = () => {};
function makeWorld(rows, weapon = null) {
  const level = new Level({ id: 't', name: 't', tiles: rows });
  return {
    level, weapon, platforms: [], entities: [], tick: 0, env: null,
    particles: { burst: nop, dust: nop, splash: nop, spawn: nop, hit: nop, leaves: nop },
    sfx: nop, spawn: (e) => e, playerMiss: nop, playerDown: nop, inLiquid: () => false,
    breakTile: nop, bumpTile: nop, events: { emit: nop }, camera: { shake: nop }, hitstop: nop, stats: { hits: 0 },
  };
}
const FLAT = ['..........', '..........', '..........', '..........', '..........', '..........', '..........', '..........', '##########'];
const clearInput = () => { for (const b of Object.keys(input.held)) { input.src.key[b] = false; input.latch[b] = false; } input.sample(); input.sample(); };
const tick = (w, p, n = 1) => { for (let i = 0; i < n; i++) { input.sample(); w.tick++; p.update(STEP); } };

describe('player state fixes', () => {
  beforeEach(clearInput);

  it('a short tap is released on the next step (no charge or hold left over)', () => {
    input.latch.attack = true; input.sample();
    expect(input.pressed.attack).toBe(true);
    input.sample();
    expect(input.released.attack).toBe(true);
    expect(input.held.attack).toBe(false);
  });

  it('charge does not survive a release that happened during hitstop', () => {
    const w = makeWorld(FLAT), p = new Player(w, 'leaf', 2 * TILE, 8 * TILE - 44);
    tick(w, p, 10);
    input.src.key.attack = true; tick(w, p, 10);
    expect(p.charge).toBeGreaterThan(0);
    // ヒットストップ中に離す：p.update は呼ばれず holdInputs だけ
    input.src.key.attack = false; input.sample(); p.holdInputs(); input.sample(); p.holdInputs();
    tick(w, p, 3);
    expect(p.charge).toBe(0);
  });

  it('a jump pressed during hitstop is not lost', () => {
    const w = makeWorld(FLAT), p = new Player(w, 'gen', 2 * TILE, 8 * TILE - 44);
    tick(w, p, 20);
    expect(p.onGround).toBe(true);
    input.src.key.jump = true; input.sample(); p.holdInputs(); input.sample(); p.holdInputs();
    tick(w, p, 2);
    expect(p.vy).toBeLessThan(-300);
  });

  it('resetMotion clears what a miss should not carry over', () => {
    const w = makeWorld(FLAT), p = new Player(w, 'leaf', 2 * TILE, 8 * TILE - 44);
    Object.assign(p, { vx: 300, vy: 500, star: 6, charge: 0.5, attackHeld: 1, dashT: 0.2, inWater: true, platform: { dx: 9, dy: 9 }, controlLock: 0.2, hurtT: 0.3, gliding: true });
    p.resetMotion();
    for (const k of ['vx', 'vy', 'star', 'charge', 'attackHeld', 'dashT', 'controlLock', 'hurtT']) expect(p[k]).toBe(0);
    expect(p.inWater).toBe(false); expect(p.platform).toBe(null); expect(p.gliding).toBe(false);
  });

  it('Minamo glides right away when there is no ground just below (jump buffer does not delay it)', () => {
    const rows = Array.from({ length: 20 }, () => '..........'); rows.push('##########');
    const w = makeWorld(rows), p = new Player(w, 'minamo', 2 * TILE, 2 * TILE);
    p.vy = 600;
    input.src.key.jump = true; tick(w, p, 2);
    expect(p.gliding).toBe(true);
    expect(p.vy).toBeLessThanOrEqual(PHYS.glideFall + 1);
  });

  it('an unknown weapon id (old save) does not crash', () => {
    const w = makeWorld(FLAT, { id: 'no_such_weapon', lv: 3 });
    const p = new Player(w, 'leaf', 2 * TILE, 8 * TILE - 44);
    expect(p.weaponId).toBe(null); expect(p.weaponColor).toBe(null);
  });
});
