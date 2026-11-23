import { describe, it, expect } from 'vitest';
import { Level } from '../src/world/level.js';
import { moveBody } from '../src/world/collision.js';
import { TILE, STEP } from '../src/core/config.js';

const mk = (rows) => new Level({ id: 't', name: 't', tiles: rows });
const body = (tx, ty) => ({ x: tx * TILE + 6, y: ty * TILE - 44, w: 24, h: 44, vx: 0, vy: 0, onGround: false });
const run = (lv, b, sec, f) => { for (let i = 0; i < sec / STEP; i++) { f && f(b); b.vy = Math.min(b.vy + 2550 * STEP, 860); moveBody(lv, b, STEP); } };

describe('collision', () => {
  it('lands on flat ground', () => {
    const lv = mk(['..........', '..........', '..........', '##########']);
    const b = body(2, 1);
    run(lv, b, 1);
    expect(b.onGround).toBe(true);
    expect(b.y + b.h).toBeCloseTo(3 * TILE, 3);
  });
  it('stops at walls', () => {
    const lv = mk(['..........', '.....#....', '.....#....', '##########']);
    const b = body(2, 3);
    run(lv, b, 1, (b) => { b.vx = 200; });
    expect(b.x + b.w).toBeLessThanOrEqual(5 * TILE + 0.01);
  });
  it('walks up and down a 45 degree slope keeping contact', () => {
    const lv = mk(['............', '............', '............', '..../##\\....', '############']);
    const b = body(1, 4);
    let airborne = 0;
    run(lv, b, 0.2);
    run(lv, b, 2.5, (b) => { b.vx = 200; if (!b.onGround) airborne++; });
    expect(b.x).toBeGreaterThan(8 * TILE);
    expect(airborne).toBeLessThan(3);
    expect(b.y + b.h).toBeCloseTo(4 * TILE, 1);
  });
  it('22.5 degree slopes are walkable', () => {
    const lv = mk(['............', '............', '............', '...ab##cd...', '############']);
    const b = body(1, 4);
    let maxUp = 0;
    run(lv, b, 0.2);
    run(lv, b, 2.5, (b) => { b.vx = 200; maxUp = Math.max(maxUp, 4 * TILE - (b.y + b.h)); });
    expect(maxUp).toBeCloseTo(TILE, 0);
    expect(b.x).toBeGreaterThan(9 * TILE);
  });
  it('one-way platforms only block from above', () => {
    const lv = mk(['..........', '..........', '..----....', '..........', '##########']);
    const b = body(2, 4);
    run(lv, b, 0.1);
    b.vy = -700;
    for (let i = 0; i < 40; i++) { b.vy += 1320 * STEP; moveBody(lv, b, STEP); }
    expect(b.y + b.h).toBeLessThan(2 * TILE);
    run(lv, b, 1);
    expect(b.y + b.h).toBeCloseTo(2 * TILE, 3);
  });
  it('corner correction nudges around block corners', () => {
    const lv = mk(['..........', '..#.......', '..........', '..........', '##########']);
    const b = body(1, 4);
    b.x = 3 * TILE - 4 + 0.5 - TILE + 12; // 右端が2マス目ブロックに数ドット重なる
    b.x = 2 * TILE - b.w + 4;
    run(lv, b, 0.05);
    b.vy = -720;
    let hit = false;
    for (let i = 0; i < 60; i++) { b.vy += 1320 * STEP; moveBody(lv, b, STEP); if (b.hitCeil) hit = true; }
    expect(hit).toBe(false);
  });
});
