// 福引き蔵の通しテスト：無料1回 → 10回 → 装備 → ステージで武器が効いている。--shots で画面写真
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const di = process.argv.indexOf('--dist'); const DIST = di > 0 ? process.argv[di + 1] : 'dist';
const shots = process.argv.includes('--shots');
const url = 'file://' + path.join(root, DIST, 'index.html');
const browser = await chromium.launch();
const errors = [];
let failed = 0;
const ok = (c, m) => { if (c) console.log('✓ ' + m); else { failed++; console.log('✗ ' + m); } };
async function run(viewport, tag) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await page.goto(url);
  await page.waitForFunction(() => window.__GQ__ && window.__GQ__.game.sceneName === 'title', null, { timeout: 15000 });
  const shot = async (n) => { if (shots) await page.screenshot({ path: path.join(root, 'screenshots', `gacha-${tag}-${n}.png`) }); };
  await page.evaluate(() => { window.__GQ__.game.go('gacha', { back: 'worldmap' }, 'none'); });
  await page.waitForTimeout(300);
  await shot('1-top');
  // 無料1回：Z
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(1500);
  await shot('2-spin');
  await page.waitForTimeout(1200);
  await shot('3-single');
  const single = await page.evaluate(() => { const A = window.__GQ__.game.scene.anim; return A ? A.results.length : 0; });
  ok(single === 1, `${tag}: 無料で1回引けた`);
  await page.keyboard.press('KeyZ'); await page.waitForTimeout(150); await page.keyboard.press('KeyZ'); await page.waitForTimeout(300);
  // もう一度無料は引けない
  await page.evaluate(() => { const s = window.__GQ__.game.scene; s.sel = 0; s.press(0); });
  const again = await page.evaluate(() => !!window.__GQ__.game.scene.anim);
  ok(!again, `${tag}: 同じ日に2回目の無料は引けない`);
  // コインを足して10回
  await page.evaluate(() => window.__GQ_SAVE__ && (window.__GQ_SAVE__.data.coins = 5000));
  const hasSaveHook = await page.evaluate(() => !!window.__GQ_SAVE__);
  ok(hasSaveHook, `${tag}: テスト用のセーブ参照がある`);
  await page.evaluate(() => { const s = window.__GQ__.game.scene; s.press(2); });
  await page.waitForTimeout(3450);
  await shot('4-ten-flip');
  await page.waitForTimeout(1800);
  await shot('4-ten');
  const ten = await page.evaluate(() => { const A = window.__GQ__.game.scene.anim; return A ? A.results.map((r) => r.rarity) : []; });
  ok(ten.length === 10 && ten.some((r) => r >= 3), `${tag}: 10回引けて特上以上が出た (${ten.join(',')})`);
  await page.evaluate(() => { const s = window.__GQ__.game.scene; s.skip(); s.skip(); s.skip(); });
  await page.evaluate(() => { const s = window.__GQ__.game.scene; s.press(3); });
  await page.waitForTimeout(200);
  await shot('5-rates');
  await page.evaluate(() => { const s = window.__GQ__.game.scene; s.showRates = false; s.setTab(1); });
  // 持っている武器を選んで装備
  const eq = await page.evaluate(() => { const s = window.__GQ__.game.scene, d = window.__GQ_SAVE__.data; const ids = Object.keys(d.weapons); const w = ids[ids.length - 1]; s.bagSel = +w.slice(1) - 1; if (d.equipped === w) d.equipped = null; s.toggleEquip(); return { w, eq: d.equipped }; });
  ok(eq.eq === eq.w, `${tag}: 武器を装備できた (${eq.w})`);
  await page.waitForTimeout(300);
  await shot('6-bag');
  // ステージで効いているか
  await page.evaluate(() => window.__GQ__.game.go('stage', { stage: 1, char: 'gen' }, 'none'));
  await page.waitForTimeout(2600);
  const p = await page.evaluate(() => { const pl = window.__GQ__.game.scene.world.player; return { id: pl.weaponId, power: pl.stats.power }; });
  ok(p.id === eq.w, `${tag}: ステージで武器が装備されている`);
  await shot('7-hud');
  await page.close();
}
await run({ width: 1200, height: 540 }, 'pc');
await run({ width: 844, height: 390 }, 'mobile');
ok(errors.length === 0, 'コンソールエラー0件' + (errors.length ? ': ' + errors.slice(0, 3).join(' / ') : ''));
await browser.close();
if (failed) process.exit(1);
