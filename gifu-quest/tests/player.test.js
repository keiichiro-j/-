import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/gfx/atlas.js', () => ({ drawSprite: () => {}, hasSprite: () => true, defineSprite: () => {} }));
import { PHYS, STEP, TILE, statsToPhysics } from '../src/core/config.js';
import CHARS from '../src/data/characters.json';

// 設計書5章の数値から、各キャラの最高到達点を計算して「ゲンでも3段・4マスの穴」を越えられることを確かめる
function apex(jumpV) {
  let vy = -jumpV, y = 0, min = 0;
  for (let i = 0; i < 400; i++) {
    let g = vy < 0 ? PHYS.gravityHold : PHYS.gravityRelease;
    if (Math.abs(vy) < PHYS.apexThreshold) g *= PHYS.apexMul;
    vy = Math.min(vy + g * STEP, PHYS.maxFall);
    y += vy * STEP; min = Math.min(min, y);
    if (y > 0) break;
  }
  return -min;
}
function airDistance(jumpV, vx) {
  let vy = -jumpV, y = 0, t = 0;
  do { let g = vy < 0 ? PHYS.gravityHold : PHYS.gravityRelease; if (Math.abs(vy) < PHYS.apexThreshold) g *= PHYS.apexMul; vy = Math.min(vy + g * STEP, PHYS.maxFall); y += vy * STEP; t += STEP; } while (y < 0);
  return vx * t;
}

describe('character physics (design ch.4-5)', () => {
  it('stat conversion matches the design table', () => {
    expect(statsToPhysics({ speed: 1, jump: 1, power: 1, hp: 1 })).toMatchObject({ walk: 187, jump: 592, hearts: 2 });
    expect(statsToPhysics({ speed: 5, jump: 5, power: 5, hp: 5 }).walk).toBe(263);
    expect(statsToPhysics({ speed: 5, jump: 5, power: 5, hp: 5 }).power).toBeCloseTo(1.3);
  });
  for (const id of ['leaf', 'minamo', 'gen', 'haku']) {
    const s = statsToPhysics(CHARS[id]);
    it(`${id} clears 3-tile steps and 4-tile gaps`, () => {
      expect(apex(s.jump)).toBeGreaterThan(3 * TILE + 4);
      expect(airDistance(s.jump, s.walk)).toBeGreaterThan(4 * TILE + 24);
    });
  }
});
