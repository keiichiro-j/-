import { describe, it, expect } from 'vitest';
import { pull, rollRarity, today, canFree, weaponEffects, WEAPONS, RARITIES, PITY, COST, MAX_LEVEL } from '../src/systems/gacha.js';
import { makeRng } from '../src/core/rng.js';

const fresh = (coins = 0) => ({ coins, weapons: {}, equipped: null, gacha: { lastFree: '', pity: 0, total: 0 } });

describe('gacha', () => {
  it('has 30 weapons in 4 rarities and rates summing to 1', () => {
    expect(WEAPONS.length).toBe(30);
    expect(new Set(WEAPONS.map((w) => w.rarity))).toEqual(new Set([1, 2, 3, 4]));
    expect(RARITIES.reduce((s, r) => s + r.rate, 0)).toBeCloseTo(1, 6);
    expect(new Set(WEAPONS.map((w) => w.id)).size).toBe(30);
  });
  it('free pull once per day', () => {
    const d = fresh(), now = new Date(2026, 10, 24, 10);
    expect(pull(d, 'free', Math.random, now).ok).toBe(true);
    expect(canFree(d, now)).toBe(false);
    expect(pull(d, 'free', Math.random, now).ok).toBe(false);
    expect(canFree(d, new Date(2026, 10, 25, 0, 1))).toBe(true);
    expect(today(now)).toBe('2026-11-24');
  });
  it('charges coins and refuses when short', () => {
    const d = fresh(150);
    expect(pull(d, 'single').ok).toBe(true);
    expect(d.coins).toBeLessThan(150);
    expect(pull(fresh(COST.ten - 1), 'ten').ok).toBe(false);
  });
  it('10-pull guarantees at least one 特上', () => {
    const rng = makeRng(7);
    for (let k = 0; k < 200; k++) {
      const d = fresh(COST.ten);
      const r = pull(d, 'ten', rng.next);
      expect(r.results.length).toBe(10);
      expect(r.results.some((x) => x.rarity >= 3)).toBe(true);
    }
  });
  it('pity guarantees 極 within PITY pulls', () => {
    const d = fresh(1e9);
    const alwaysLow = () => 0.01;  // いつも並
    let got = false;
    for (let i = 0; i < PITY; i++) if (pull(d, 'single', alwaysLow).results[0].rarity === 4) got = true;
    expect(got).toBe(true);
    expect(d.gacha.pity).toBe(0);
  });
  it('observed rates are close to the table', () => {
    const rng = makeRng(42), n = 200000, c = [0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) c[rollRarity(rng.next, 0)]++;
    for (const r of RARITIES) expect(c[r.r] / n).toBeCloseTo(r.rate, 2);
  });
  it('duplicates level up then refund coins', () => {
    const d = fresh(1e9);
    const one = () => 0.0;  // いつも並の最初の武器
    for (let i = 0; i < MAX_LEVEL; i++) pull(d, 'single', one);
    expect(d.weapons.w01.lv).toBe(MAX_LEVEL);
    const before = d.coins;
    const r = pull(d, 'single', one).results[0];
    expect(r.refund).toBeGreaterThan(0);
    expect(d.coins).toBe(before - COST.single + r.refund);
    expect(d.equipped).toBe('w01');
  });
  it('effects scale with level and affinity, within caps', () => {
    const a = weaponEffects('w11', 1, 'leaf').atk, b = weaponEffects('w11', 5, 'leaf').atk, c = weaponEffects('w11', 5, 'gen').atk;
    expect(b).toBeGreaterThan(a); expect(c).toBeGreaterThan(b);
    expect(weaponEffects('w28', 5, 'minamo').cd).toBeLessThanOrEqual(0.5);
    expect(weaponEffects('w22', 5, 'haku').jmp).toBeLessThanOrEqual(0.1);
  });
});
