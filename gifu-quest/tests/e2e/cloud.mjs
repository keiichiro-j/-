// Google ログイン連携の通しテスト：google.script.run のかわり（モック）を入れて、GAS で動いている時の流れを確かめる
//  1. Google 側のセーブが新しければ読み込む 2. 名前を聞かれて決める 3. クリアが記録係に届く 4. 番付が出る 5. GAS の外では何もしない
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const di = process.argv.indexOf('--dist'); const DIST = di > 0 ? process.argv[di + 1] : 'dist';
const shots = process.argv.includes('--shots');
const url = 'file://' + path.join(root, DIST, 'index.html');
const browser = await chromium.launch();
let failed = 0; const errors = [];
const ok = (c, m) => { if (c) console.log('✓ ' + m); else { failed++; console.log('✗ ' + m); } };

const MOCK = () => {
  const server = window.__SERVER__ = { calls: [], nickname: '', save: { json: '', savedAt: 0 }, clears: [] };
  const cloudSave = { version: 4, cleared: [1, 2, 3], coins: 777, sarubobo: {}, bestTime: { '1': 200 }, seenOpening: true, lastChar: 'gen', savedAt: Date.now() + 60000 };
  server.save = { json: JSON.stringify(cloudSave), savedAt: cloudSave.savedAt };
  const api = {
    gqHello: () => ({ signedIn: true, nickname: server.nickname, savedAt: server.save.savedAt, recorder: true }),
    gqLoad: () => server.save,
    gqSave: (json) => { server.save = { json, savedAt: Date.now() }; return { savedAt: server.save.savedAt, recorded: true }; },
    gqSetNickname: (n) => { server.nickname = n; return n; },
    gqRecordClear: (r) => { server.clears.push(r); return { ok: true, ranked: true }; },
    gqRanking: (st) => ({ ok: true, stage: st, list: [{ rank: 1, nickname: 'はやい人', time: 150 }, { rank: 2, nickname: server.nickname || '？', time: 200, me: true }], me: { rank: 2, time: 200 }, total: 2 }),
  };
  const make = (ok, ng) => new Proxy({}, { get: (_, k) => {
    if (k === 'withSuccessHandler') return (f) => make(f, ng);
    if (k === 'withFailureHandler') return (f) => make(ok, f);
    return (...a) => { server.calls.push(k); setTimeout(() => { try { ok && ok(api[k](...a)); } catch (e) { ng && ng(e); } }, 30); };
  } });
  window.google = { script: { get run() { return make(null, null); } } };
};

async function page(viewport, withMock) {
  const p = await browser.newPage({ viewport });
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('gq2_save', JSON.stringify({ version: 4, cleared: [1], coins: 5, seenOpening: true, savedAt: 1000 })); } catch {} });
  if (withMock) await p.addInitScript(MOCK);
  await p.goto(url);
  await p.waitForFunction(() => window.__GQ__ && window.__GQ__.game.sceneName === 'title', null, { timeout: 20000 });
  return p;
}

// ---- GAS の中（モックあり） ----
const p = await page({ width: 1200, height: 540 }, true);
const s1 = await p.evaluate(() => ({ coins: window.__GQ_SAVE__.data.coins, cleared: window.__GQ_SAVE__.data.cleared }));
ok(s1.coins === 777 && s1.cleared.length === 3, 'Google 側の新しいセーブを読み込んだ（別の端末の続き）');
await p.waitForSelector('#gq-nick', { timeout: 5000 }).catch(() => {});
const asked = await p.$('#gq-nick');
ok(!!asked, '名前がまだの時、ランキングに出す名前を聞かれる');
if (shots) await p.screenshot({ path: path.join(root, 'screenshots/cloud-name.png') });
if (asked) { await p.fill('#gq-nick', 'ぎふの風'); await p.keyboard.press('Enter'); await p.waitForTimeout(400); }
const nick = await p.evaluate(() => window.__SERVER__.nickname);
ok(nick === 'ぎふの風', '名前が Google 側に保存された');
ok(!(await p.$('#gq-nick')), '入力欄が閉じた');
if (shots) await p.screenshot({ path: path.join(root, 'screenshots/cloud-title.png') });
// クリア → 記録とセーブが届く
await p.evaluate(() => window.__GQ__.game.go('stage', { stage: 1, char: 'gen' }, 'none'));
await p.waitForTimeout(2500);
await p.evaluate(() => { const w = window.__GQ__.game.scene.world; w.stats.time = 321; w.stageClear(); });
await p.waitForFunction(() => window.__GQ__.game.sceneName === 'results', null, { timeout: 10000 });
await p.waitForTimeout(3800);
const srv = await p.evaluate(() => ({ clears: window.__SERVER__.clears, saved: JSON.parse(window.__SERVER__.save.json) }));
ok(srv.clears.length === 1 && srv.clears[0].stage === 1 && Math.round(srv.clears[0].time) === 321 && srv.clears[0].char === 'gen', 'クリアの記録が記録係に届いた');
ok(srv.saved.cleared.includes(1) && srv.saved.savedAt > 0, 'クリア後のセーブが Google 側に送られた（数秒まとめて）');
// 番付
await p.evaluate(() => window.__GQ__.game.go('records', { tab: 3 }, 'none'));
await p.waitForTimeout(800);
const rk = await p.evaluate(() => { const s = window.__GQ__.game.scene; return s.rankCache && s.rankCache[s.rankSel]; });
ok(rk && rk.state === 'ok' && rk.list.length === 2, '番付が読みこめた');
if (shots) await p.screenshot({ path: path.join(root, 'screenshots/cloud-rank.png') });
await p.close();

// ---- GAS の外（モックなし）：今までどおり ----
const q = await page({ width: 1200, height: 540 }, false);
const s2 = await q.evaluate(() => window.__GQ_SAVE__.data.coins);
ok(s2 === 5, 'GAS の外では端末のセーブのまま（何も送らない）');
await q.evaluate(() => window.__GQ__.game.go('records', { tab: 3 }, 'none'));
await q.waitForTimeout(500);
if (shots) await q.screenshot({ path: path.join(root, 'screenshots/cloud-rank-offline.png') });
await q.close();

ok(errors.length === 0, 'コンソールエラー0件' + (errors.length ? ': ' + errors.slice(0, 3).join(' / ') : ''));
await browser.close();
if (failed) process.exit(1);
