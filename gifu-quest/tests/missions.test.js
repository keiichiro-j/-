// 毎日のお題（やり込み担当）
import { describe, it, expect } from 'vitest';
import { dailyMissions, ensureMissions, addMission, syncGacha, missionDef, missionText, secondsToReset, MISSIONS } from '../src/systems/missions.js';
import { defaultSave } from '../src/core/save.js';
import M from '../src/data/missions.json';

const day = (y, m, d, h = 12) => new Date(y, m - 1, d, h, 0, 0);

describe('dailyMissions', () => {
  it('同じ日は同じお題、3つで group が重ならない', () => {
    const a = dailyMissions('2026-11-24'), b = dailyMissions('2026-11-24');
    expect(a).toEqual(b);
    expect(a.length).toBe(M.perDay);
    expect(new Set(a.map((m) => missionDef(m.id).group)).size).toBe(a.length);
  });
  it('日によって変わる・報酬は60〜120', () => {
    const seen = new Set();
    for (let i = 1; i <= 30; i++) seen.add(dailyMissions(`2026-12-${String(i).padStart(2, '0')}`).map((m) => m.id).join());
    expect(seen.size).toBeGreaterThan(20);
    for (const m of MISSIONS) { expect(m.reward).toBeGreaterThanOrEqual(60); expect(m.reward).toBeLessThanOrEqual(120); }
  });
  it('キャラ指定のお題はキャラを持つ', () => {
    for (let i = 1; i <= 60; i++) for (const m of dailyMissions(`2027-01-${i}`)) if (missionDef(m.id).type === 'charClears') { expect(M.chars).toContain(m.char); expect(missionText(m)).not.toContain('{'); }
  });
});

describe('進み具合と入れ替わり', () => {
  it('0時に入れ替わり、進みはリセット', () => {
    const d = defaultSave();
    expect(ensureMissions(d, day(2026, 11, 24, 23))).toBe(true);
    expect(ensureMissions(d, day(2026, 11, 24, 23))).toBe(false);
    d.missions.list[0].p = 5;
    expect(ensureMissions(d, day(2026, 11, 25, 0))).toBe(true);
    expect(d.missions.date).toBe('2026-11-25');
    expect(d.missions.list.every((m) => m.p === 0 && !m.done)).toBe(true);
  });
  it('達成でコインが入り、二重にはもらえない', () => {
    const d = defaultSave(), now = day(2026, 11, 24);
    ensureMissions(d, now);
    d.missions.list = [{ id: 'enemy20', p: 0, done: false }];
    expect(addMission(d, 'enemies', 19, {}, now)).toEqual([]);
    const r = addMission(d, 'enemies', 5, {}, now);
    expect(r.length).toBe(1);
    expect(d.coins).toBe(80);
    expect(d.records.missionsDone).toBe(1);
    expect(addMission(d, 'enemies', 50, {}, now)).toEqual([]);
    expect(d.coins).toBe(80);
  });
  it('キャラ指定・連続・福引き', () => {
    const d = defaultSave(), now = day(2026, 11, 24);
    ensureMissions(d, now);
    d.missions.list = [{ id: 'char', char: 'gen', p: 0, done: false }, { id: 'chain3', p: 0, done: false }, { id: 'gacha', p: 0, done: false }];
    addMission(d, 'charClears', 1, { char: 'leaf' }, now);
    expect(d.missions.list[0].done).toBe(false);
    addMission(d, 'charClears', 1, { char: 'gen' }, now);
    expect(d.missions.list[0].done).toBe(true);
    addMission(d, 'chain', 2, {}, now); expect(d.missions.list[1].p).toBe(2);
    addMission(d, 'chain', 1, {}, now); expect(d.missions.list[1].p).toBe(2);
    addMission(d, 'chain', 4, {}, now); expect(d.missions.list[1].done).toBe(true);
    expect(syncGacha(d, now)).toEqual([]);
    d.gacha.total += 1;
    expect(syncGacha(d, now).length).toBe(1);
    expect(d.coins).toBe(80 + 80 + 60);
  });
  it('入れ替わりまでの秒数', () => {
    expect(secondsToReset(new Date(2026, 10, 24, 23, 0, 0))).toBe(3600);
  });
});
