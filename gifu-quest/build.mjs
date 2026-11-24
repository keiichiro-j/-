// src → 1枚の dist/index.html（ステージデータ・素材を埋め込む）。GAS用に gas/ もコピーする。
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const watch = process.argv.includes('--watch');
const dev = process.argv.includes('--dev');
const oi = process.argv.indexOf('--out');
const OUT = oi > 0 ? process.argv[oi + 1] : 'dist';

const levelsPlugin = {
  name: 'gq-levels',
  setup(b) {
    b.onResolve({ filter: /^gq:levels$/ }, () => ({ path: 'levels', namespace: 'gq' }));
    b.onLoad({ filter: /.*/, namespace: 'gq' }, () => {
      const dir = path.join(root, 'levels');
      const files = fs.readdirSync(dir).filter((f) => /^stage\w+\.json$/.test(f)).sort();
      const obj = {};
      for (const f of files) obj[f.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      return { contents: 'export default ' + JSON.stringify(obj), loader: 'js', watchFiles: files.map((f) => path.join(dir, f)), watchDirs: [dir] };
    });
  },
};

function assetsScript() {
  const dir = path.join(root, 'assets');
  if (!fs.existsSync(dir)) return { js: '', bytes: 0 };
  const out = {};
  let bytes = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.png')) continue;
    const name = f.replace('.png', '');
    const jf = path.join(dir, name + '.json');
    if (!fs.existsSync(jf)) { console.warn(`assets/${f}: 同名の .json がないため無視`); continue; }
    const buf = fs.readFileSync(path.join(dir, f));
    bytes += buf.length;
    out[name] = { ...JSON.parse(fs.readFileSync(jf, 'utf8')), png: 'data:image/png;base64,' + buf.toString('base64') };
  }
  return { js: Object.keys(out).length ? `window.__GQ_ASSETS__=${JSON.stringify(out)};` : '', bytes };
}

const artifact = process.argv.includes('--artifact');
// claude.ai アーティファクト用：外側の doctype/head/body は公開時に付くので、中身だけを書く
const ARTIFACT_HTML = (js, assets) => `<title>ぎふクエスト</title>
<style>:root{color-scheme:dark}html,body{height:100%;margin:0;background:#120c10;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
canvas{position:absolute;display:block;outline:none}
#rotate{display:none;position:fixed;inset:0;background:#120c10;color:#e8dccb;font:bold 20px sans-serif;align-items:center;justify-content:center;text-align:center;z-index:5;padding:0 16px}
@media (orientation:portrait) and (max-width:820px){#rotate{display:flex}}</style>
<canvas id="game" tabindex="0"></canvas><div id="rotate">スマホを横向きにしてください</div>
<script>${assets}</script>
<script>${js}</script>`;
const HTML = (js, assets) => `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">
<title>ぎふクエスト 〜六つの宝珠〜</title>
<style>html,body{margin:0;height:100%;background:#120c10;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
canvas{position:absolute;display:block;image-rendering:auto;outline:none}
#rotate{display:none;position:fixed;inset:0;background:#120c10;color:#e8dccb;font:bold 20px sans-serif;align-items:center;justify-content:center;text-align:center;z-index:5}
@media (orientation:portrait) and (max-width:820px){#rotate{display:flex}}</style></head>
<body><canvas id="game" tabindex="0"></canvas><div id="rotate">スマホを横向きにしてください</div>
<script>${assets}</script>
<script>${js}</script></body></html>`;

async function build() {
  const t0 = Date.now();
  const r = await esbuild.build({
    entryPoints: [path.join(root, 'src/main.js')], bundle: true, format: 'iife', write: false,
    minify: !dev, sourcemap: dev ? 'inline' : false, target: ['es2020'], plugins: [levelsPlugin], loader: { '.json': 'json' },
    metafile: true, logLevel: 'warning',
  });
  const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const a = assetsScript();
  const html = artifact ? ARTIFACT_HTML(js, a.js) : HTML(js, a.js);
  fs.mkdirSync(path.join(root, OUT), { recursive: true });
  fs.writeFileSync(path.join(root, OUT, 'index.html'), html);
  for (const f of ['Code.gs', 'appsscript.json']) if (fs.existsSync(path.join(root, 'gas', f))) fs.copyFileSync(path.join(root, 'gas', f), path.join(root, OUT, f));
  const kb = (n) => (n / 1024).toFixed(0) + 'KB';
  console.log(`built ${OUT}/index.html ${kb(html.length)} (js ${kb(js.length)}, png ${kb(a.bytes)}) in ${Date.now() - t0}ms`);
  return r;
}

await build();
if (watch) {
  console.log('watching src/ levels/ assets/ ...');
  let timer = null;
  for (const d of ['src', 'levels', 'assets']) fs.watch(path.join(root, d), { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(() => build().catch((e) => console.error(e.message)), 100); });
}
