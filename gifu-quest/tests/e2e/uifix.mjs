// UI のバグ修正の再発防止（UI担当）：看板を読んでいる間の一時停止・壊れたセーブ（存在しない武器・キャラ）でステージに入れる・保存できない環境
//   node tests/e2e/uifix.mjs [--dist dist]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const di = process.argv.indexOf('--dist'); const DIST = di > 0 ? process.argv[di + 1] : 'dist';
const url = 'file://' + path.join(root, DIST, 'index.html');
const browser = await chromium.launch();
let failed = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) failed++; };
async function open(q = '', init = null) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  if (init) await page.addInitScript(init[0], init[1]);
  await page.goto(url + q);
  await page.waitForFunction(() => window.__GQ__ && window.__GQ__.game.sceneName && window.__GQ__.game.sceneName !== 'boot', null, { timeout: 15000 });
  return page;
}
{ // 看板を読んでいる間に一時停止できる（看板は閉じない）
  const p = await open('?stage=1&char=leaf');
  await p.waitForTimeout(500);
  await p.evaluate(() => window.__GQ__.game.scene.world.showDialogue('テスト', 'あいうえお'));
  await p.waitForTimeout(500);
  await p.keyboard.press('KeyP'); await p.waitForTimeout(150);
  const s = await p.evaluate(() => { const S = window.__GQ__.game.scene; return { paused: S.paused, dlg: !!S.world.dialogue }; });
  ok(s.paused && s.dlg, '看板を読んでいる間に一時停止できる');
  await p.keyboard.press('KeyP'); await p.waitForTimeout(150);
  const s2 = await p.evaluate(() => { const S = window.__GQ__.game.scene; return { paused: S.paused, dlg: !!S.world.dialogue }; });
  ok(!s2.paused && s2.dlg, '再開すると看板の続きが読める');
  ok(p.errors.length === 0, 'コンソールエラー0件 ' + p.errors.join(' / '));
}
{ // 壊れたセーブ（存在しない武器を装備・存在しないキャラ）でもステージに入れる
  const bad = JSON.stringify({ version: 3, weapons: { w99: { lv: 3 } }, equipped: 'w99', lastChar: 'nobody', cleared: [1] });
  const p = await open('', [(s) => { localStorage.setItem('gq2_save', s); }, bad]);
  await p.evaluate(() => window.__GQ__.game.go('worldmap', {}, 'none'));
  await p.waitForTimeout(400);
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => window.__GQ__.game.sceneName === 'stage' && !window.__GQ__.game.trans, null, { timeout: 8000 }).catch(() => {});
  ok(await p.evaluate(() => window.__GQ__.game.sceneName === 'stage'), '壊れたセーブでもマップからステージに入れる');
  ok(p.errors.length === 0, 'コンソールエラー0件 ' + p.errors.join(' / '));
}
{ // localStorage が例外を投げる環境
  const p = await open('', [() => { const t = () => { throw new DOMException('denied', 'SecurityError'); }; Storage.prototype.getItem = t; Storage.prototype.setItem = t; }, null]);
  ok(await p.evaluate(() => window.__GQ__.game.sceneName === 'title' && window.__GQ_SAVE__.storageOk === false), '保存できない環境でもタイトルが出る（保存できない表示）');
  ok(p.errors.length === 0, 'コンソールエラー0件 ' + p.errors.join(' / '));
}
{ // 壊れた JSON は「保存できない」扱いにしない
  const p = await open('', [() => { localStorage.setItem('gq2_save', '{broken'); }, null]);
  ok(await p.evaluate(() => window.__GQ_SAVE__.storageOk === true), '壊れたセーブでも保存はできる扱い');
}
await browser.close();
console.log(failed ? `uifix: ${failed} 件失敗` : 'uifix ok');
process.exit(failed ? 1 : 0);
