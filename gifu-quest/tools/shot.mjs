// 画面写真を撮る道具。例：
//   node tools/shot.mjs --dist dist --stage 1 --char leaf --tx 120 --ty 10 --wait 1.5 --out screenshots/s1.png
//   node tools/shot.mjs --scene title --out t.png      node tools/shot.mjs --gallery --out g.png
//   --keys "ArrowRight:1.0,KeyZ:0.2"  （キーを押す秒数を順に） --w 1280 --h 720  --mobile（844×390） --dpr 2（画面のピクセル比）
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes('--' + k);
const dist = arg('dist', 'dist');
const q = new URLSearchParams();
if (arg('stage')) { q.set('stage', arg('stage')); q.set('char', arg('char', 'leaf')); }
if (flag('gallery')) q.set('gallery', arg('filter', '1'));
if (arg('scene')) q.set('scene', arg('scene'));
for (const k of ['wpn', 'f', 'zoom']) if (arg(k)) q.set(k, arg(k));
const url = 'file://' + path.resolve(root, dist, 'index.html') + '?' + q;   // --dist は絶対パスでもよい
const mobile = flag('mobile');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: mobile ? { width: 844, height: 390 } : { width: +arg('w', 1200), height: +arg('h', 540) }, hasTouch: mobile, deviceScaleFactor: +arg('dpr', 1) });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__GQ__ && window.__GQ__.game.sceneName !== 'boot', null, { timeout: 15000 }).catch(() => errors.push('boot timeout'));
if (arg('tx')) {
  await page.waitForTimeout(200);
  await page.evaluate(([tx, ty]) => { const w = window.__GQ__.game.scene.world; const p = w.player; p.x = p.px = tx * 36; p.y = p.py = ty * 36; w.camera.snapTo(p.cx, p.y + p.h); }, [+arg('tx'), +arg('ty', 5)]);
}
if (arg('time')) await page.evaluate((t) => { const w = window.__GQ__.game.scene.world; if (w && w.env.debugSet) w.env.debugSet(t); }, arg('time'));
for (const k of (arg('keys', '') || '').split(',').filter(Boolean)) { const [key, s] = k.split(':'); await page.keyboard.down(key); await page.waitForTimeout(+s * 1000); await page.keyboard.up(key); }
await page.waitForTimeout(+arg('wait', 1) * 1000);
const out = arg('out', 'screenshots/shot.png');
await page.screenshot({ path: path.resolve(root, out) });
console.log('saved', out);
if (errors.length) console.log('console:\n  ' + [...new Set(errors)].slice(0, 10).join('\n  '));
await browser.close();
