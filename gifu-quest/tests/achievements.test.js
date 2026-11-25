// 称号（やり込み担当）
import { describe, it, expect } from 'vitest';
import { ACHIEVEMENTS, progressOf, checkAchievements, recordClear, progress } from '../src/systems/achievements.js';
import { defaultSave, migrate, SAVE_VERSION } from '../src/core/save.js';
import { events } from '../src/core/events.js';

const now = new Date(2026, 10, 24, 12);
describe('称号の表', () => {
  it('30前後・id が重ならない・報酬は50〜300・条件の種類はすべて判定できる', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(28);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    const d = defaultSave();
    for (const a of ACHIEVEMENTS) {
      expect(a.reward).toBeGreaterThanOrEqual(50); expect(a.reward).toBeLessThanOrEqual(300);
      const p = progressOf(a, d, { signIds: ['a'] });
      expect(p.unknown).toBeFalsy();
      expect(p.cur).toBeLessThan(p.max);
    }
    const sum = ACHIEVEMENTS.reduce((s, a) => s + a.reward, 0);
    expect(sum).toBeLessThan(6000);   // 一度きり。福引き60回分ほどまで
  });
});

describe('判定', () => {
  it('新しいセーブでは何も得ない', () => { expect(checkAchievements(defaultSave(), {}, now)).toEqual([]); });
  it('条件を満たすと得て、コインが入る。二度目は無し', () => {
    const d = defaultSave();
    d.cleared = [1, 2, 3]; d.records.enemies = 120; d.weapons = { w30: { lv: 1 } };
    const got = checkAchievements(d, {}, now).map((a) => a.id);
    expect(got).toEqual(expect.arrayContaining(['first_clear', 'orb3', 'enemy100']));
    expect(got).not.toContain('orb6');
    const coins = d.coins;
    expect(coins).toBe(got.reduce((s, id) => s + ACHIEVEMENTS.find((a) => a.id === id).reward, 0));
    expect(d.achievements.first_clear).toBe('2026-11-24');
    expect(checkAchievements(d, {}, now)).toEqual([]);
    expect(d.coins).toBe(coins);
  });
  it('看板・目標タイム・キャラ別クリア', () => {
    const d = defaultSave();
    d.seenSigns = ['s1', 's2'];
    expect(progressOf(ACHIEVEMENTS.find((a) => a.id === 'signs_all'), d, { signIds: ['s1', 's2', 's3'] })).toMatchObject({ cur: 2, max: 3 });
    d.bestTime = { 1: 100 };
    recordClear(d, { stage: 1, char: 'haku', stats: { hits: 0, misses: 0, time: 100 }, target: 300 }, now);
    recordClear(d, { stage: 0, char: 'gen', stats: { hits: 0, misses: 0, time: 10 }, target: 90 }, now);   // 練習は数えない
    const got = checkAchievements(d, { signIds: ['s1', 's2', 's3'] }, now).map((a) => a.id);
    expect(got).toEqual(expect.arrayContaining(['char_haku', 'nomiss_clear', 'target1']));
    expect(got).not.toContain('char_gen');
    expect(d.records.clears).toBe(1);
  });
});

describe('特別ステージ8（沖縄）', () => {
  it('クリアで「南の宝珠」、ミスも被弾もなしなら「ニライカナイの勇者」。6面クリアの数には入らない', () => {
    const d = defaultSave();
    d.cleared = [1, 2, 3, 4, 5, 6];
    checkAchievements(d, {}, now);
    expect(d.achievements.south_orb).toBeFalsy();
    // 1回目：被弾ありでクリア
    d.cleared.push(8);
    recordClear(d, { stage: 8, char: 'leaf', stats: { hits: 1, misses: 0, time: 400 }, target: 420 }, now);
    let got = checkAchievements(d, {}, now).map((a) => a.id);
    expect(got).toContain('south_orb');
    expect(got).not.toContain('nirai_hero');
    expect(d.records.clears).toBe(1);
    expect(progressOf(ACHIEVEMENTS.find((a) => a.id === 'orb6'), d)).toMatchObject({ cur: 6, max: 6 });
    // 2回目：ノーミス
    recordClear(d, { stage: 8, char: 'leaf', stats: { hits: 0, misses: 0, time: 390 }, target: 420 }, now);
    const c0 = d.coins;   // （お題の報酬は recordClear で入る）
    got = checkAchievements(d, {}, now).map((a) => a.id);
    expect(got).toContain('nirai_hero');   // （「無傷の旅」「早駆け」も一緒に得る）
    expect(d.coins - c0).toBe(got.reduce((s, id) => s + ACHIEVEMENTS.find((a) => a.id === id).reward, 0));
    // 他のステージのノーミスでは得ない
    const e = defaultSave();
    recordClear(e, { stage: 7, char: 'leaf', stats: { hits: 0, misses: 0, time: 300 }, target: 420 }, now);
    expect(checkAchievements(e, {}, now).map((a) => a.id)).not.toContain('nirai_hero');
  });
});

describe('イベントにつなぐ', () => {
  it('敵・コイン・踏みつけ・ボスのノーミスを数え、称号の通知とコイン', () => {
    events.clear();
    const d = defaultSave(); let writes = 0; const toasts = [];
    progress.deps = null;
    progress.install({ events, save: { data: d, write: () => { writes++; } }, toast: { push: (k, n, r) => toasts.push([k, n, r]) }, signIds: [], now: () => now });
    for (let i = 0; i < 100; i++) events.emit('enemyDefeated', { kind: 'uribo' });
    events.emit('coin', { n: 2 });
    for (let c = 1; c <= 5; c++) events.emit('stomp', { chain: c });
    const W = { stats: { hits: 0, misses: 0 } };
    events.emit('bossStart', { boss: { id: 'musasabi', world: W } });
    events.emit('bossDefeated', { boss: { id: 'musasabi', world: W } });
    W.stats.hits = 1;
    events.emit('bossStart', { boss: { id: 'dragon', world: W } });
    W.stats.hits = 2;
    events.emit('bossDefeated', { boss: { id: 'dragon', world: W } });
    expect(d.records).toMatchObject({ enemies: 100, coins: 2, stomps: 5, bestChain: 5, bosses: 2 });
    expect(d.noMissBoss).toEqual({ musasabi: true });
    expect(toasts.map((t) => t[1])).toEqual(expect.arrayContaining(['腕自慢', '五段跳び', '見切り']));
    expect(writes).toBeGreaterThan(0);
    events.clear(); progress.deps = null;
  });
});

describe('セーブ v4', () => {
  it('v3 のセーブを読める（記録は既定値・クリア数から始まる）', () => {
    const a = migrate({ version: 3, cleared: [1, 2], coins: 50, gacha: { lastFree: '', pity: 3, total: 4 } });
    expect(a.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(4);
    expect(a.records.clears).toBe(2);
    expect(a.records.enemies).toBe(0);
    expect(a.achievements).toEqual({});
    expect(a.missions).toEqual({ date: '', list: [], gachaBase: 0 });
    expect(a.bossRush).toEqual({ best: 0, noMiss: false, clears: 0, tries: 0, most: 0 });
  });
  it('壊れた v4 の値を直す', () => {
    const a = migrate({ version: 4, records: { enemies: -5, coins: 'x', charClears: { leaf: 2, nobody: 3 } }, achievements: { orb3: '2026-01-01', bad: 0 }, missions: { date: 5, list: [{ id: 'enemy20', p: 'a' }, null] }, bossRush: { best: -1, most: 99 } });
    expect(a.records.enemies).toBe(0); expect(a.records.coins).toBe(0);
    expect(a.records.charClears).toEqual({ leaf: 2 });
    expect(a.achievements).toEqual({ orb3: '2026-01-01' });
    expect(a.missions.list).toEqual([{ id: 'enemy20', p: 0, done: false }]);
    expect(a.bossRush.best).toBe(0); expect(a.bossRush.most).toBe(6);
  });
});
