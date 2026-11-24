// 画面の流れの通しテスト（UI担当）：
// タイトル→はじめから→オープニング飛ばし→キャラ選択→マップ→ステージ→（一時停止→設定→再開）→stageClear→結果→マップ
// さらにスマホ幅でタップ操作（タイトル→設定→もどる）とゲームオーバー→マップを確認する。
//   node tests/e2e/flow.mjs [--dist dist-ui]
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const di = process.argv.indexOf('--dist');
const DIST = di > 0 ? process.argv[di + 1] : 'dist';
const file = 'file://' + path.join(root, DIST, 'index.html');

const browser = await chromium.launch();
let failed = 0;
const log = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++; };

async function open(viewport, mobile = false, query = '') {
  const ctx = await browser.newContext({ viewport, hasTouch: mobile, isMobile: false });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(file + query);
  await page.waitForFunction(() => window.__GQ__ && window.__GQ__.game.sceneName && window.__GQ__.game.sceneName !== 'boot', null, { timeout: 15000 });
  return { ctx, page, errors };
}
const scene = (page) => page.evaluate(() => window.__GQ__.game.sceneName);
async function waitScene(page, name, timeout = 8000) {
  await page.waitForFunction((n) => window.__GQ__.game.sceneName === n && !window.__GQ__.game.trans, name, { timeout });
  await page.waitForTimeout(350);   // 各画面の入力待ち（誤操作防止の0.2〜0.5秒）
}
async function press(page, key, wait = 120) { await page.keyboard.press(key); await page.waitForTimeout(wait); }
// 論理座標（高さ540）→ 画面座標
const toClient = (page, x, y) => page.evaluate(([x, y]) => { const c = document.getElementById('game').getBoundingClientRect(); const k = c.height / 540; return { x: c.left + x * k, y: c.top + y * k }; }, [x, y]);

// ---- 1. PC：キーボードで通し ----
{
  const { ctx, page, errors } = await open({ width: 1200, height: 540 });
  const step = async (name, fn) => { try { await fn(); log(true, name); } catch (e) { log(false, `${name}: ${e.message.split('\n')[0]}（今の画面: ${await scene(page).catch(() => '?')}）`); throw e; } };
  try {
    await step('タイトル表示', () => waitScene(page, 'title'));
    await step('はじめから→オープニング', async () => { await press(page, 'Enter'); await waitScene(page, 'opening'); });
    await step('オープニングを飛ばす→キャラ選択', async () => { await press(page, 'Escape'); await waitScene(page, 'select'); });
    await step('キャラ選択（右へ1人→決定）→マップ', async () => { await press(page, 'ArrowRight'); await press(page, 'Enter'); await waitScene(page, 'worldmap'); });
    const chosen = await page.evaluate(() => JSON.parse(localStorage.getItem('gq2_save')).lastChar);
    log(chosen === 'minamo', `選んだキャラが保存される（${chosen}）`);
    const st = await page.evaluate(() => window.__GQ__.game.scene.sel);
    await step(`マップから出発（stage ${st}）→ステージ`, async () => { await press(page, 'Enter'); await waitScene(page, 'stage', 10000); });
    // 一時停止→設定→再開（ワールドが作り直されないこと）
    await page.evaluate(() => { window.__GQ__.game.scene.world.__mark = 1; });
    await page.waitForTimeout(2500);   // ステージ名の表示が終わるまで
    await step('一時停止→設定', async () => {
      await press(page, 'Escape', 250);
      for (let i = 0; i < 3; i++) await press(page, 'ArrowDown');
      await press(page, 'Enter');
      await waitScene(page, 'settings');
    });
    await step('設定で揺れを切→もどる→ステージ再開', async () => {
      for (let i = 0; i < 4; i++) await press(page, 'ArrowDown');
      await press(page, 'ArrowRight');
      await press(page, 'Escape');
      await waitScene(page, 'stage');
      const ok = await page.evaluate(() => window.__GQ__.game.scene.world && window.__GQ__.game.scene.world.__mark === 1);
      if (!ok) throw new Error('ステージが作り直された');
      const shake = await page.evaluate(() => JSON.parse(localStorage.getItem('gq2_save')).settings.shake);
      if (shake !== false) throw new Error('設定が保存されていない');
    });
    await step('stageClear→結果', async () => { await page.evaluate(() => window.__GQ__.game.scene.world.stageClear()); await waitScene(page, 'results', 10000); });
    await step('結果（カウントアップを飛ばして）→マップ', async () => { await press(page, 'Enter', 300); await press(page, 'Enter'); await waitScene(page, 'worldmap'); });
    const sv = await page.evaluate(() => JSON.parse(localStorage.getItem('gq2_save')));
    log(sv.cleared.includes(st) && sv.bestTime[String(st)] > 0, `クリアとベストタイムが保存される（cleared=${JSON.stringify(sv.cleared)}）`);
    await step('マップ↑メニュー→図鑑（または準備中）', async () => {
      await press(page, 'ArrowUp'); await press(page, 'ArrowRight'); await press(page, 'Enter');
      await page.waitForTimeout(700);
      const s = await scene(page);
      if (s === 'zukan') { await waitScene(page, 'zukan'); await press(page, 'ArrowRight'); await press(page, 'ArrowRight'); await press(page, 'Escape'); await waitScene(page, 'worldmap'); }
      else if (s !== 'worldmap') throw new Error('図鑑ボタンで想定外の画面 ' + s);
    });
    await step('タイトルへ→つづき→マップ', async () => {
      await press(page, 'Escape'); await waitScene(page, 'title');
      await press(page, 'Enter');   // 「つづき」が初期選択
      await waitScene(page, 'worldmap');
    });
  } catch { /* 上で記録済み */ }
  log(errors.length === 0, 'PC：コンソールエラー0件' + (errors.length ? '\n  ' + errors.slice(0, 5).join('\n  ') : ''));
  await ctx.close();
}

// ---- 2. スマホ横向き：タップで操作 ----
{
  const { ctx, page, errors } = await open({ width: 844, height: 390 }, true);
  try {
    await waitScene(page, 'title');
    // メニューの「設定」の木札の中心（論理座標）
    const r = await page.evaluate(() => { const l = window.__GQ__.game.scene.list.rects[2]; return { x: l.x + l.w / 2, y: l.y + l.h / 2 }; });
    let p = await toClient(page, r.x, r.y);
    await page.touchscreen.tap(p.x, p.y);
    await waitScene(page, 'settings');
    log(true, 'スマホ：タイトルの「設定」をタップ→設定');
    // 「もどる」行をタップ
    const b = await page.evaluate(() => { const R = window.__GQ__.game.scene.rowRects; const l = R[R.length - 1].row; return { x: l.x + 60, y: l.y + l.h / 2 }; });
    p = await toClient(page, b.x, b.y);
    await page.touchscreen.tap(p.x, p.y);
    await waitScene(page, 'title');
    log(true, 'スマホ：設定の「もどる」をタップ→タイトル');
  } catch (e) { log(false, 'スマホのタップ操作: ' + e.message.split('\n')[0]); }
  log(errors.length === 0, 'スマホ：コンソールエラー0件' + (errors.length ? '\n  ' + errors.slice(0, 5).join('\n  ') : ''));
  await ctx.close();
}

// ---- 3. ゲームオーバー→マップ ----
{
  const { ctx, page, errors } = await open({ width: 1200, height: 540 }, false, '?stage=1&char=gen');
  try {
    await waitScene(page, 'stage');
    await page.evaluate(() => { const w = window.__GQ__.game.scene.world; w.player.hearts = 0; w.playerDown(); });
    await waitScene(page, 'gameover', 10000);
    await page.waitForTimeout(900);
    await press(page, 'Enter');
    await waitScene(page, 'worldmap');
    log(true, 'ゲームオーバー→「マップへ」→マップ');
  } catch (e) { log(false, 'ゲームオーバー: ' + e.message.split('\n')[0]); }
  log(errors.length === 0, 'ゲームオーバー：コンソールエラー0件' + (errors.length ? '\n  ' + errors.slice(0, 5).join('\n  ') : ''));
  await ctx.close();
}

await browser.close();
if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('flow ok');
