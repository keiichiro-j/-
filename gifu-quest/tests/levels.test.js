// 全ステージに自動検査（src/world/validate.js）をかける。設計書6章「レベルデザインのルール」
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validateLevel } from '../src/world/validate.js';

const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../levels');
// 本編のステージ（stage1〜6、あればうらステージ7・特別ステージ8 沖縄）。stage0 は練習、stage9x はボス担当の試験用
const files = fs.readdirSync(dir).filter((f) => /^stage[1-8]\.json$/.test(f)).sort();
const load = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

describe('levels', () => {
  it('stage1〜6 がそろっている', () => {
    for (let i = 1; i <= 6; i++) expect(files).toContain(`stage${i}.json`);
  });
  for (const f of files) {
    it(`${f} は検査を通る`, () => {
      const r = validateLevel(load(f));
      expect(r.errors, r.errors.join('\n')).toEqual([]);
    });
    it(`${f} の看板は事実の短文（60〜90字程度）`, () => {
      const d = load(f);
      const signs = d.entities.filter((e) => e.type === 'sign');
      expect(signs.length).toBeGreaterThanOrEqual(3);
      for (const s of signs) {
        expect(s.title.length).toBeGreaterThan(0);
        expect(s.text.length).toBeGreaterThanOrEqual(45);
        expect(s.text.length).toBeLessThanOrEqual(100);
      }
    });
  }
  it('練習ステージ stage0 も形式は正しい（到達の検査は本編だけ）', () => {
    const r = validateLevel(load('stage0.json'));
    expect(r.errors.filter((e) => /未知の文字|行 \d+ の長さ|範囲外|壁に埋まって|start が/.test(e))).toEqual([]);
  });
});

// 検査そのものが壊れた地形をちゃんと見つけるか
describe('validateLevel', () => {
  const base = () => load('stage1.json');
  it('幅5の穴を見つける', () => {
    const d = base();
    const t = d.tiles.map((r) => r.split(''));
    // 導入の平地（x=4〜8）に穴をあける
    for (let y = 0; y < t.length; y++) for (let x = 4; x <= 8; x++) if (y >= 39) t[y][x] = '.';
    d.tiles = t.map((r) => r.join(''));
    const r = validateLevel(d);
    expect(r.errors.some((e) => e.includes('穴の幅 5'))).toBe(true);
  });
  it('高さ4の壁で道をふさぐと届かない', () => {
    const d = base();
    const t = d.tiles.map((r) => r.split(''));
    for (let y = 36; y < 40; y++) t[y][12] = '#';
    d.tiles = t.map((r) => r.join(''));
    const r = validateLevel(d);
    expect(r.errors.some((e) => e.includes('ボス部屋に届かない'))).toBe(true);
  });
  it('高さ3の段は登れる', () => {
    const d = base();
    const t = d.tiles.map((r) => r.split(''));
    for (let y = 37; y < 40; y++) t[y][12] = '#';
    d.tiles = t.map((r) => r.join(''));
    expect(validateLevel(d).errors).toEqual([]);
  });
  it('必須要素の不足・未知の文字・行の長さ・壁に埋まった物を見つける', () => {
    const d = base();
    d.entities = d.entities.filter((e) => !(e.type === 'sarubobo' && e.index === 2) && e.type !== 'skewer');
    d.entities.push({ type: 'coin', x: 5, y: 41 });
    d.tiles[0] = d.tiles[0].slice(0, -1) + 'Q';
    d.tiles[1] = d.tiles[1] + '.';
    const r = validateLevel(d);
    const all = r.errors.join('\n');
    expect(all).toMatch(/sarubobo が 2 個/);
    expect(all).toMatch(/skewer/);
    expect(all).toMatch(/未知の文字 'Q'/);
    expect(all).toMatch(/行 1 の長さ/);
    expect(all).toMatch(/壁に埋まっている/);
  });
  it('ステージ8：潮（tide）を外すと防波堤・サンゴ礁の壁を越えられない', () => {
    if (!files.includes('stage8.json')) return;
    const d = load('stage8.json');
    expect(validateLevel(d).errors).toEqual([]);
    d.entities = d.entities.filter((e) => e.type !== 'tide');
    const r = validateLevel(d);
    expect(r.errors.some((e) => e.includes('ボス部屋に届かない'))).toBe(true);
  });
  it('ステージ8：潮の形式（満ち潮が引き潮より上・周期8秒以上）を検査する', () => {
    if (!files.includes('stage8.json')) return;
    const d = load('stage8.json');
    const t = d.entities.find((e) => e.type === 'tide');
    t.period = 3; [t.yLow, t.yHigh] = [t.yHigh, t.yLow];
    const all = validateLevel(d).errors.join('\n');
    expect(all).toMatch(/period 3 秒は短すぎる/);
    expect(all).toMatch(/yHigh < yLow/);
  });
  it('ゴンドラを外すと谷を渡れない', () => {
    const d = base();
    d.entities = d.entities.filter((e) => !(e.type === 'gondola' && e.x > 100));
    const r = validateLevel(d);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
