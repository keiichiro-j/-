// ヘッドレスChromeで dist/index.html を開き、コンソールエラー0件・各ステージが動くことを確認する
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import path from 'node:path';
import fs from 'node:fs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const di = process.argv.indexOf('--dist');
const DIST = di > 0 ? process.argv[di + 1] : 'dist';
const file = 'file://' + path.join(root, DIST, 'index.html');
const shots = process.argv.includes('--shots');
const only = process.argv.find((a) => a.startsWith('--stage='))?.slice(8);

const browser = await chromium.launch();
let failed = 0;
async function check(name, url, fn, viewport = { width: 1280, height: 720 }) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__GQ__ && window.__GQ__.game.sceneName && window.__GQ__.game.sceneName !== 'boot', null, { timeout: 15000 }).catch(() => errors.push('boot timeout'));
  try { await fn(page); } catch (e) { errors.push(String(e.message || e)); }
  if (shots) { fs.mkdirSync(path.join(root, 'screenshots'), { recursive: true }); await page.screenshot({ path: path.join(root, 'screenshots', (DIST === 'dist' ? '' : DIST + '-') + name + '.png') }); }
  if (errors.length) { failed++; console.log(`✗ ${name}\n  ` + errors.slice(0, 5).join('\n  ')); } else console.log(`✓ ${name}`);
  await page.close();
}

const stages = (() => { const ids = fs.readdirSync(path.join(root, 'levels')).filter((f) => /^stage\d+\.json$/.test(f)).map((f) => f.match(/\d+/)[0]); return only ? ids.filter((i) => i === only) : ids; })();

if (!only) await check('title', file, async (page) => { await page.waitForTimeout(1500); });
for (const id of stages) {
  for (const ch of ['leaf', 'minamo', 'gen', 'haku']) {
    await check(`stage${id}-${ch}`, `${file}?stage=${id}&char=${ch}`, async (page) => {
      await page.waitForFunction(() => window.__GQ__.game.sceneName === 'stage', null, { timeout: 8000 });
      // 右へ走りながらジャンプし続ける
      await page.keyboard.down('ArrowRight');
      for (let i = 0; i < 12; i++) { await page.keyboard.down('KeyZ'); await page.waitForTimeout(220); await page.keyboard.up('KeyZ'); await page.keyboard.press('KeyX'); await page.waitForTimeout(80); }
      await page.keyboard.up('ArrowRight');
      const st = await page.evaluate(() => { const s = window.__GQ__.game.scene; const w = s.world; return w ? { x: w.player.x, fps: window.__GQ__.loop.stats.fps } : null; });
      if (st && st.x < 200 && window) throw new Error('player did not move: ' + JSON.stringify(st));
    });
    if (ch !== 'leaf' && !process.argv.includes('--all-chars')) break;
  }
}
// スマホ横向き
if (!only) await check('mobile', `${file}?stage=0`, async (page) => { await page.waitForTimeout(800); }, { width: 844, height: 390 });
await browser.close();
if (failed) { console.log(`${failed} failed`); process.exit(1); }
