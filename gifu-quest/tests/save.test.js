// セーブの読み込み・古い版の変換・壊れたデータ（UI担当）
import { describe, it, expect, afterEach } from 'vitest';
import { migrate, defaultSave, save, SAVE_KEY, SAVE_VERSION } from '../src/core/save.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
afterEach(() => { delete globalThis.localStorage; });

describe('save.migrate', () => {
  it('v0: clear オブジェクト・配列と best 配列を変換', () => {
    const a = migrate({ clear: { 1: true, 2: false, 3: true }, best: [100, 0, 200] });
    expect(a.cleared).toEqual([1, 3]);
    expect(a.bestTime).toEqual({ 1: 100, 3: 200 });
    expect(migrate({ clear: [true, false, true] }).cleared).toEqual([1, 3]);
    expect(a.version).toBe(SAVE_VERSION);
  });
  it('v1/v2: 既定値で埋まり、変な値は直る（クリアしていないステージはクリア扱いにしない）', () => {
    const a = migrate({ version: 1, cleared: [1, '2', 1, 99, -1, 'x'], bestTime: { 1: 'abc', 2: -5, 3: 0, 4: 120 }, coins: -10, lastChar: 'nobody', lastStage: 'z' });
    expect(a.cleared).toEqual([1, 2]);
    expect(a.bestTime).toEqual({ 4: 120 });
    expect(a.coins).toBe(0);
    expect(a.lastChar).toBe('leaf');
    expect(a.lastStage).toBe(1);
    expect(a.weapons).toEqual({});
    expect(a.gacha).toEqual({ lastFree: '', pity: 0, total: 0 });
  });
  it('さるぼぼ18個そろった古いセーブは隠しキャラを解放', () => {
    const sb = {}; for (let i = 1; i <= 6; i++) sb[i] = [true, true, true];
    expect(migrate({ version: 2, sarubobo: sb }).unlocked).toContain('sarubobo');
    sb[6] = [true, true, false];
    expect(migrate({ version: 2, sarubobo: sb }).unlocked).not.toContain('sarubobo');
    // 解放されていない隠しキャラを最後のキャラにしない
    expect(migrate({ version: 2, lastChar: 'sarubobo' }).lastChar).toBe('leaf');
  });
  it('存在しない武器 id は捨て、装備も外す', () => {
    const a = migrate({ version: 3, weapons: { w99: { lv: 3 }, w01: { lv: 9 }, w02: 'x' }, equipped: 'w99', gacha: { pity: 'a', lastFree: 5 } });
    expect(a.weapons).toEqual({ w01: { lv: 5 }, w02: { lv: 1 } });
    expect(a.equipped).toBe(null);
    expect(a.gacha.pity).toBe(0);
    expect(migrate({ version: 3, weapons: { w01: { lv: 1 } }, equipped: 'w01' }).equipped).toBe('w01');
  });
  it('設定：壊れたキー設定・ボタン配置・音量', () => {
    const a = migrate({ version: 3, settings: { keymap: 'oops', touchLayout: { pad: { x: 0.2 } }, sfxVol: 'loud', quality: 'ultra' } });
    expect(a.settings.keymap).toBe(null);
    expect(a.settings.touchLayout.pad).toEqual({ x: 0.2, y: 0.8, s: 1 });
    expect(a.settings.touchLayout.pause).toBeTruthy();
    expect(a.settings.sfxVol).toBe(0.8);
    expect(a.settings.quality).toBe('auto');
  });
  it('配列・数・null は新しいセーブ', () => {
    for (const v of [null, [], 42, 'x']) expect(migrate(v)).toEqual(defaultSave());
  });
});

describe('save.load', () => {
  it('壊れた JSON は新しいデータで続け、保存はできる扱い', () => {
    globalThis.localStorage = mem(); localStorage.setItem(SAVE_KEY, '{bad');
    save.load();
    expect(save.storageOk).toBe(true);
    expect(save.data.cleared).toEqual([]);
  });
  it('localStorage が例外を投げても止まらない', () => {
    globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    save.load();
    expect(save.storageOk).toBe(false);
    expect(save.write()).toBe(false);
  });
});
