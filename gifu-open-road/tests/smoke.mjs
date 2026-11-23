// スモークテスト：three.js同梱ビルドをヘッドレスChromiumで起動し、エラーが出ないこと・主要操作が動くことを確認
// 使い方: node build.mjs --inline-three && node tests/smoke.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const url = pathToFileURL(resolve('dist/index.html')).href;
const shots = 'tests/shots/';
const errors = [];
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'OK ' : 'NG '} ${name} ${info}`); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function run(label, ctxOpts, fn) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${label}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${label}] console: ${m.text()}`); });
  await page.goto(url);
  await page.waitForFunction(() => window.__G && window.__G.player, null, { timeout: 60000 });
  await fn(page);
  await ctx.close();
}
const wait = (p, ms) => p.waitForTimeout(ms);
// ヘッドレスのソフトウェア描画は遅いので、ゲーム内時間で待つ
async function waitGame(p, sec) { const t0 = await p.evaluate(() => __G.time); await p.waitForFunction((t) => __G.time >= t, t0 + sec, { timeout: 240000, polling: 200 }); }

await run('pc', { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }, async (page) => {
  await page.screenshot({ path: shots + 'pc-title.png' });
  await page.click('text=はじめから');
  await wait(page, 3500);
  await page.screenshot({ path: shots + 'pc-start.png' });
  const s0 = await page.evaluate(() => ({ x: __G.player.x, z: __G.player.z, peds: __G.crowd.agents.length, cars: __G.vehicles.cars.length, fps: __G.fps }));
  check('起動後に人と車が出る', s0.peds > 20 && s0.cars > 5, JSON.stringify(s0));
  await page.keyboard.down('KeyW'); await wait(page, 1500); await page.keyboard.up('KeyW');
  const s1 = await page.evaluate(() => ({ x: __G.player.x, z: __G.player.z }));
  check('Wで歩ける', Math.hypot(s1.x - s0.x, s1.z - s0.z) > 1, JSON.stringify(s1));
  // 交通が流れているか
  const lane0 = await page.evaluate(() => __G.vehicles.cars.filter(c => c.mode === 'lane').map(c => [c.id, c.ai.e, c.ai.s, c.ai.turn ? c.ai.turn.u : -1]));
  await waitGame(page, 3);
  const moved = await page.evaluate((l0) => { let n = 0; for (const [id, e, s, u] of l0) { const c = __G.vehicles.cars.find(x => x.id === id); if (c && c.ai && (c.ai.e !== e || Math.abs(c.ai.s - s) > 1 || (c.ai.turn && c.ai.turn.u !== u))) n++; } return { n, of: l0.length }; }, lane0);
  check('交通AIの車が動いている', moved.n >= moved.of * 0.4, JSON.stringify(moved));
  // 自宅前の車に乗って走る
  await page.evaluate(() => { const c = __G.vehicles.cars.find(c => c.owned); __G.player.x = c.phys.x + 1.5; __G.player.z = c.phys.z; });
  await page.keyboard.press('KeyF'); await wait(page, 300);
  const inCar = await page.evaluate(() => __G.player.inCar);
  check('Fで車に乗れる', inCar);
  await page.keyboard.down('KeyW'); await waitGame(page, 3);
  const sp = await page.evaluate(() => Math.abs(__G.player.car.phys.vf) * 3.6);
  await page.keyboard.down('KeyA'); await wait(page, 800); await page.keyboard.up('KeyA'); await page.keyboard.up('KeyW');
  check('アクセルで加速する', sp > 15, sp.toFixed(1) + 'km/h');
  await page.screenshot({ path: shots + 'pc-drive.png' });
  await page.keyboard.down('KeyS'); await wait(page, 2000); await page.keyboard.up('KeyS');
  await page.keyboard.press('KeyF'); await wait(page, 300);
  check('Fで降りられる', !(await page.evaluate(() => __G.player.inCar)));
  // 射撃→目撃→通報→手配
  const before = await page.evaluate(() => __G.wanted.stars);
  await page.evaluate(() => { __G.combat.select(1); });
  await page.mouse.move(640, 360);
  await page.evaluate(() => { const P = __G.player; const lm = __G.world.lm.statue; P.x = lm.x + 6; P.z = lm.z + 6; P.agent.x = P.x; P.agent.z = P.z; });
  await waitGame(page, 8);
  for (let k = 0; k < 4; k++) { await page.evaluate(() => { __G.combat.S.cooldown = 0; }); await page.mouse.down({ button: 'left' }); await wait(page, 80); await page.mouse.up({ button: 'left' }); await wait(page, 200); }
  await waitGame(page, 6);
  const st = await page.evaluate(() => ({ stars: __G.wanted.stars, status: __G.wanted.status, callers: __G.crowd.agents.filter(a => a.state === 'call').length }));
  check('発砲が通報されて手配が付く', st.stars > before, JSON.stringify(st));
  await page.screenshot({ path: shots + 'pc-wanted.png' });
  await waitGame(page, 8);
  const pol = await page.evaluate(() => ({ units: __G.police.units.length, officers: __G.police.officers.length }));
  check('警察が出動する', pol.units > 0, JSON.stringify(pol));
  await page.screenshot({ path: shots + 'pc-police.png' });
  // 夜
  await page.evaluate(() => { __G.clock = 21.5; __G.wanted.stars = 0; __G.clearWanted(); });
  await wait(page, 800);
  await page.screenshot({ path: shots + 'pc-night.png' });
  // メニュー類
  await page.keyboard.press('ArrowUp'); await wait(page, 300);
  check('スマホ画面が開く', await page.evaluate(() => __G.menus.M.open === 'phone'));
  for (const app of ['ギフグラム', 'クルマスキャン', 'メッセージ', '連絡先', '配車']) {
    await page.click(`.app:has-text("${app}")`); await wait(page, 200);
    const open = await page.evaluate(() => __G.menus.M.open);
    check(`アプリ「${app}」が開く`, !!open, open);
    await page.keyboard.press('ArrowUp'); await wait(page, 150);
    if (!(await page.evaluate(() => __G.menus.M.open === 'phone'))) { await page.evaluate(() => __G.menus.close()); await page.keyboard.press('ArrowUp'); await wait(page, 150); }
  }
  await page.evaluate(() => __G.menus.close());
  await page.keyboard.press('KeyM'); await wait(page, 300);
  await page.screenshot({ path: shots + 'pc-map.png' });
  await page.evaluate(() => __G.menus.close());
  await page.evaluate(() => { const lm = __G.world.lm.gunshop; __G.player.x = lm.x; __G.player.z = lm.z; __G.player.agent.x = lm.x; __G.player.agent.z = lm.z; });
  await wait(page, 300); await page.keyboard.press('KeyE'); await wait(page, 300);
  await page.screenshot({ path: shots + 'pc-gunshop.png' });
  check('ガンショップが開く', await page.evaluate(() => __G.menus.M.open === 'shop'));
  await page.evaluate(() => __G.menus.close());
  // ミッション開始
  await page.evaluate(() => { const p = __G.resolve('florist'); __G.player.x = p.x; __G.player.z = p.z; __G.player.agent.x = p.x; __G.player.agent.z = p.z; });
  await wait(page, 300); await page.keyboard.press('KeyE'); await wait(page, 300);
  await page.click('text=引き受ける'); await wait(page, 1500);
  const ms = await page.evaluate(() => __G.missions.active && { step: __G.missions.active.step, id: __G.missions.active.def.id });
  check('ミッションを始めて1段目を達成', ms && ms.step === 1, JSON.stringify(ms));
  // 性能の目安
  const perf = await page.evaluate(() => ({ fps: __G.fps.toFixed(1), calls: __G.renderer.info.render.calls, tris: __G.renderer.info.render.triangles }));
  check('描画統計', true, JSON.stringify(perf));
});

await run('mobile', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true }, async (page) => {
  await page.click('text=はじめから');
  await wait(page, 3000);
  await page.screenshot({ path: shots + 'mobile-start.png' });
  check('スマホでタッチUIが出る', await page.evaluate(() => getComputedStyle(document.getElementById('touch')).display !== 'none'));
  const s0 = await page.evaluate(() => ({ x: __G.player.x, z: __G.player.z }));
  // 左スティック
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 280, id: 1 }] });
  for (let k = 0; k < 10; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150, y: 280 - k * 6, id: 1 }] }); await wait(page, 30); }
  await wait(page, 1500);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const s1 = await page.evaluate(() => ({ x: __G.player.x, z: __G.player.z }));
  check('スマホのスティックで歩ける', Math.hypot(s1.x - s0.x, s1.z - s0.z) > 1, JSON.stringify(s1));
});

await run('portrait', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, async (page) => {
  await wait(page, 500);
  check('縦向きで「横向きにしてください」', await page.evaluate(() => getComputedStyle(document.getElementById('rotate')).display !== 'none'));
});

await browser.close();
console.log('\nエラー:', errors.length ? '\n' + errors.join('\n') : 'なし');
const ng = results.filter(r => !r.ok);
process.exit(ng.length || errors.length ? 1 : 0);
