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
  await page.evaluate(() => { window.__vmax = 0; const f = () => { if (__G.player.car) window.__vmax = Math.max(window.__vmax, Math.abs(__G.player.car.phys.vf) * 3.6); requestAnimationFrame(f); }; f(); });
  await page.keyboard.down('KeyW'); await waitGame(page, 4);
  const sp = await page.evaluate(() => window.__vmax);
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
  // ---- 車屋・不動産・ガレージ・カスタム・強盗・警察の降車と発砲 ----
  await page.evaluate(() => { __G.menus.close(); __G.missions.active = null; __G.money.bank = 5000000; });
  const tp = (k, dx = 0, dz = 0) => page.evaluate(([k, dx, dz]) => { const lm = __G.world.lm[k]; const P = __G.player; P.x = lm.x + dx; P.z = lm.z + dz; P.agent.x = P.x; P.agent.z = P.z; }, [k, dx, dz]);
  await tp('dealer'); await wait(page, 400); await page.keyboard.press('KeyE'); await wait(page, 300);
  const nCars0 = await page.evaluate(() => __G.save.ownedCars.length);
  await page.click('[data-act="car:coupe"]'); await wait(page, 300);
  check('車屋で車を買える', await page.evaluate((n) => __G.save.ownedCars.length === n + 1 && __G.vehicles.cars.some(c => c.record && c.modelId === 'coupe'), nCars0));
  await page.screenshot({ path: shots + 'pc-dealer.png' });
  await tp('prop_yanagase'); await wait(page, 400); await page.keyboard.press('KeyE'); await wait(page, 300);
  await page.click('[data-act="buy"]'); await wait(page, 300);
  check('物件を買える', await page.evaluate(() => __G.realty.owned('yanagase')));
  await page.click('[data-act="home"]'); await wait(page, 300);
  check('自宅に登録できる', await page.evaluate(() => __G.realty.home() === 'yanagase'));
  await page.evaluate(() => __G.menus.close());
  // 買った車に乗ってカスタムショップへ
  await page.evaluate(() => { const c = __G.vehicles.cars.find(c => c.record && c.modelId === 'coupe'); const t = __G.world.lm.tuner; c.phys.x = t.x + 3; c.phys.z = t.z + 3; c.phys.vf = 0; __G.player.x = c.phys.x + 1.5; __G.player.z = c.phys.z; });
  await wait(page, 300); await page.keyboard.press('KeyF'); await wait(page, 300);
  await page.keyboard.press('KeyE'); await wait(page, 300);
  await page.screenshot({ path: shots + 'pc-tuner.png' });
  const acc0 = await page.evaluate(() => __G.player.car && __G.player.car.spec.accel);
  await page.click('[data-act="mod:engine"]'); await wait(page, 300);
  await page.click('[data-act="mod:neon"]'); await wait(page, 300);
  const acc1 = await page.evaluate(() => __G.player.car.spec.accel);
  check('カスタムショップでエンジンを強化', acc1 > acc0, `${acc0} → ${acc1}`);
  await page.evaluate(() => __G.menus.close());
  // ガレージにしまって、出す
  await page.evaluate(() => { const c = __G.player.car; const lp = __G.world.lm.prop_yanagase; c.phys.x = lp.x + 2; c.phys.z = lp.z + 2; });
  await wait(page, 300); await page.keyboard.press('KeyE'); await wait(page, 300);
  check('物件のガレージに車をしまえる', await page.evaluate(() => !__G.player.inCar && __G.realty.stored('yanagase').length === 1));
  await tp('prop_yanagase'); await wait(page, 300); await page.keyboard.press('KeyE'); await wait(page, 300);
  await page.screenshot({ path: shots + 'pc-property.png' });
  await page.click('[data-act="out:0"]'); await wait(page, 400);
  check('ガレージから車を出すと改造が残っている', await page.evaluate(() => { const c = __G.vehicles.cars.find(c => c.record && c.modelId === 'coupe'); return !!c && c.mods.engine === 1 && c.mods.neon === 1; }));
  // コンビニ強盗
  await page.evaluate(() => { __G.combat.give('pistol', 60); const i = __G.combat.inv.weapons.findIndex(w => w.id === 'pistol'); __G.combat.select(i); __G.clearWanted(); });
  const cash0 = await page.evaluate(() => __G.money.cash);
  await tp('conbini', 1.5, 0); await wait(page, 300);
  await page.mouse.down({ button: 'right' }); await wait(page, 400);
  await page.keyboard.press('KeyE'); await wait(page, 300);
  check('銃を構えて E で強盗が始まる', await page.evaluate(() => !!__G.robbery));
  await waitGame(page, 7);
  await page.mouse.up({ button: 'right' });
  const rob = await page.evaluate((c0) => ({ gain: __G.money.cash - c0 }), cash0);
  check('強盗で現金を奪える', rob.gain >= 20000, JSON.stringify(rob));
  const t0r = await page.evaluate(() => __G.time);
  await page.waitForFunction((t0) => __G.wanted.stars >= 3 || __G.time > t0 + 20, t0r, { timeout: 300000, polling: 250 });
  check('強盗のあと手配★3', await page.evaluate(() => __G.wanted.stars >= 3), await page.evaluate(() => JSON.stringify({ stars: __G.wanted.stars, late: __G.lateAlarm, rob: !!__G.robbery, dead: __G.player.dead })));
  // 警察が降りて撃ってくる（その場で待つ）
  await page.evaluate(() => { __G.godMode = true; __G.wanted.status = 'seen'; __G.wanted.detect = 1; });
  let pol2 = null;
  for (let k = 0; k < 8; k++) { await waitGame(page, 4); pol2 = await page.evaluate(() => ({ off: __G.police.officers.filter(o => !o.hidden && o.alive).length, aiming: __G.police.officers.filter(o => o.poseState === 'aim').length, units: __G.police.units.length })); if (pol2.aiming > 0) break; }
  await page.screenshot({ path: shots + 'pc-police-shoot.png' });
  check('警官がパトカーから降りて銃を構える', pol2.off > 0 && pol2.aiming > 0, JSON.stringify(pol2));
  await page.evaluate(() => { __G.godMode = false; __G.clearWanted(); });

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
