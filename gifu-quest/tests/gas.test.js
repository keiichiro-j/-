// gas/Code.gs と gas/Recorder.gs を、Google のサービスの代わり（モック）の上で動かして確かめる
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

function sheetMock() {
  const sheets = {};
  const mk = (name) => {
    const rows = [];
    const sh = {
      rows,
      getLastRow: () => rows.length,
      appendRow: (r) => rows.push([...r]),
      getRange: (r, c, nr = 1, nc = 1) => ({
        setValues: (v) => { for (let i = 0; i < nr; i++) { rows[r - 1 + i] = rows[r - 1 + i] || []; for (let j = 0; j < nc; j++) rows[r - 1 + i][c - 1 + j] = v[i][j]; } return { setFontWeight: () => ({ setBackground: () => {} }) }; },
        setValue: (v) => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = v; },
        getValue: () => (rows[r - 1] || [])[c - 1],
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j])),
      }),
      setFrozenRows: () => {},
    };
    return sh;
  };
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = mk(n)),
    getSheets: () => Object.values(sheets), deleteSheet: () => {}, getUrl: () => 'https://sheet',
  };
  return { ss, sheets };
}

function loadRecorder(tokens) {
  const { ss, sheets } = sheetMock();
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    UrlFetchApp: { fetch: (url) => { const t = decodeURIComponent(url.split('id_token=')[1]); const info = tokens[t]; return { getResponseCode: () => (info ? 200 : 400), getContentText: () => JSON.stringify(info || {}) }; } },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Utilities: { computeDigest: (a, s) => Array.from(Buffer.from(String(s))), DigestAlgorithm: { SHA_256: 1 }, base64EncodeWebSafe: (b) => Buffer.from(b).toString('base64') },
    ContentService: { createTextOutput: (s) => ({ setMimeType: () => JSON.parse(s) }), MimeType: { JSON: 1 } },
    Logger: { log: () => {} },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('gas/Recorder.gs', 'utf8').replace("const GAME_AUD = '';", "const GAME_AUD = 'game-aud';") + '\nthis.doPost = doPost; this.cleanNickname_ = cleanNickname_;', ctx);
  const post = (body) => ctx.doPost({ postData: { contents: JSON.stringify(body) } });
  return { post, sheets, ctx };
}

describe('記録係（Recorder.gs）', () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const tokens = {
    alice: { sub: 'A1', email: 'alice@example.com', email_verified: 'true', aud: 'game-aud', exp },
    bob: { sub: 'B2', email: 'bob@example.com', email_verified: 'true', aud: 'game-aud', exp },
    other: { sub: 'X9', email: 'x@example.com', email_verified: 'true', aud: 'another-app', exp },
  };
  let R;
  beforeEach(() => { R = loadRecorder(tokens); });

  it('トークンが無い・偽物・別のアプリ向けなら書かない', () => {
    expect(R.post({ action: 'profile', token: '' }).ok).toBe(false);
    expect(R.post({ action: 'profile', token: 'fake' }).ok).toBe(false);
    expect(R.post({ action: 'profile', token: 'other' }).ok).toBe(false);
    expect(R.sheets['プレイヤー'] ? R.sheets['プレイヤー'].rows.length : 1).toBeLessThanOrEqual(1);
  });
  it('本人のメールはトークンから決まり、送られた値でなりすませない', () => {
    R.post({ action: 'progress', token: 'alice', nickname: 'あり', data: { cleared: '1,2', orbs: 2, email: 'bob@example.com' } });
    const p = R.sheets['プレイヤー'].rows;
    expect(p.length).toBe(2);
    expect(p[1][0]).toBe('A1'); expect(p[1][1]).toBe('alice@example.com'); expect(p[1][2]).toBe('あり');
  });
  it('クリアを記録し、ベストとランキング（メールは返さない）', () => {
    R.post({ action: 'clear', token: 'alice', nickname: 'あり', data: { stage: 1, time: 250 } });
    R.post({ action: 'clear', token: 'bob', nickname: 'ぼぶ', data: { stage: 1, time: 200 } });
    const again = R.post({ action: 'clear', token: 'alice', nickname: 'あり', data: { stage: 1, time: 180 } });
    expect(again.newBest).toBe(true);
    R.post({ action: 'clear', token: 'bob', nickname: 'ぼぶ', data: { stage: 1, time: 5 } });   // ありえない速さ
    expect(R.sheets['クリア記録'].rows.length).toBe(5);
    expect(R.sheets['クリア記録'].rows[4][11]).toContain('対象外');
    const rank = R.post({ action: 'ranking', token: 'alice', data: { stage: 1 } });
    expect(rank.list.map((r) => [r.nickname, r.time])).toEqual([['あり', 180], ['ぼぶ', 200]]);
    expect(rank.me).toEqual({ rank: 1, time: 180 });
    expect(JSON.stringify(rank)).not.toContain('@');
  });
  it('ニックネームの掃除（タグ・式・長すぎ）', () => {
    expect(R.ctx.cleanNickname_('<b>たろう</b>')).toBe('bたろう/b');
    expect(R.ctx.cleanNickname_('=HYPERLINK(1)')).toBe('HYPERLINK(');   // 先頭の = は消す（式として動かない）。10文字まで
    expect(R.ctx.cleanNickname_('あいうえおかきくけこさし')).toBe('あいうえおかきくけこ');
    expect(R.ctx.cleanNickname_(123)).toBe('');
  });
});

describe('ゲーム側（Code.gs）', () => {
  function loadGame(email) {
    const store = {};
    const sent = [];
    const ctx = {
      Session: { getActiveUser: () => ({ getEmail: () => email }) },
      PropertiesService: { getUserProperties: () => ({ getProperty: (k) => store[k] ?? null, setProperty: (k, v) => { store[k] = String(v); }, setProperties: (o) => Object.assign(store, o), deleteProperty: (k) => { delete store[k]; } }) },
      ScriptApp: { getIdentityToken: () => 'tok' },
      UrlFetchApp: { fetch: (url, o) => { sent.push(JSON.parse(o.payload)); return { getResponseCode: () => 200, getContentText: () => '{"ok":true}' }; } },
      HtmlService: {}, Logger: { log: () => {} }, Utilities: {},
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync('gas/Code.gs', 'utf8').replace("const RECORDER_URL = '';", "const RECORDER_URL = 'https://rec';") + '\nthis.api = { gqHello, gqLoad, gqSave, gqSetNickname, gqRecordClear };', ctx);
    return { api: ctx.api, store, sent };
  }
  it('大きなセーブを分けて保存し、そのまま読み戻せる', () => {
    const G = loadGame('alice@example.com');
    const save = JSON.stringify({ version: 4, cleared: [1], big: 'あ'.repeat(30000) });
    const r = G.api.gqSave(save, { cleared: '1', orbs: 1 });
    expect(r.recorded).toBe(true);
    expect(Number(G.store.save_n)).toBeGreaterThan(1);
    expect(G.api.gqLoad().json).toBe(save);
    // 小さくなったら古い分を消す
    G.api.gqSave(JSON.stringify({ v: 1 }), {});
    expect(G.store.save_n).toBe('1'); expect(G.store.save_2).toBeUndefined();
  });
  it('ID トークンを付けて記録係へ送る。壊れたセーブは保存しない', () => {
    const G = loadGame('alice@example.com');
    G.api.gqSetNickname('ありす');
    G.api.gqRecordClear({ stage: 3, time: 300, char: 'gen' });
    expect(G.sent.every((s) => s.token === 'tok')).toBe(true);
    expect(G.sent.at(-1)).toMatchObject({ action: 'clear', nickname: 'ありす', data: { stage: 3, time: 300 } });
    expect(() => G.api.gqSave('{壊れた', {})).toThrow();
    expect(G.api.gqHello()).toMatchObject({ signedIn: true, nickname: 'ありす', recorder: true });
  });
});
