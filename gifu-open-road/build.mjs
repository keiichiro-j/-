// src を esbuild で1本にまとめ、index.html に埋め込む。
//   node build.mjs                 → dist/index.html と gas/index.html（three.js は CDN）
//   node build.mjs --inline-three  → three.min.js も同梱（外部通信ゼロで起動）
//   node build.mjs --dev           → ソースマップ付き・圧縮なし
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const args = new Set(process.argv.slice(2));
const inlineThree = args.has('--inline-three');
const dev = args.has('--dev');
const artifact = args.has('--artifact'); // claude.ai のアーティファクト用（doctype/head なし）
const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

const res = await build({
  entryPoints: ['src/main.js'], bundle: true, format: 'iife', target: ['es2019'],
  minify: !dev, sourcemap: dev ? 'inline' : false, write: false, legalComments: 'none',
  charset: 'utf8',
});
let js = res.outputFiles[0].text;
// HTML内に埋め込むため </script> を無害化
js = js.replace(/<\/script/gi, '<\\/script');
const tpl = readFileSync('src/index.template.html', 'utf8');
const css = readFileSync('src/ui/style.css', 'utf8');
let three;
if (inlineThree) {
  const t = readFileSync('node_modules/three/build/three.min.js', 'utf8').replace(/<\/script/gi, '<\\/script');
  three = `<script>${t}</script>`;
} else three = `<script src="${THREE_CDN}"></script>`;
const html = tpl
  .replace('/*__CSS__*/', () => css)
  .replace('<!--__THREE__-->', () => three)
  .replace('/*__GAME__*/', () => js);
mkdirSync('dist', { recursive: true });
if (artifact) {
  const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
  const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>') + 8).replace('<style>', '<style>:root{color-scheme:dark}');
  const out = `<title>GIFU OPEN ROAD 3D</title>\n${style}\n${body}`;
  writeFileSync('dist/artifact.html', out);
  console.log(`dist/artifact.html ${(out.length / 1024).toFixed(0)} KB`);
  process.exit(0);
}
writeFileSync('dist/index.html', html);
writeFileSync('gas/index.html', html);
console.log(`dist/index.html ${(html.length / 1024).toFixed(0)} KB${inlineThree ? '（three.js 同梱）' : ''}`);
