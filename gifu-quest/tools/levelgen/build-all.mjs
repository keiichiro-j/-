// levels/stage1〜7.json を組み立てて書き出し、検査結果を表示する。
//   node tools/levelgen/build-all.mjs            全部
//   node tools/levelgen/build-all.mjs 3 --map    ステージ3だけ、地図も表示
// あわせて tools/level-editor.html（validate.js を埋め込んだ単体HTML）も作り直す。
import fs from 'node:fs';
import path from 'node:path';
import { stringify } from './lib.mjs';
import { validateLevel } from '../../src/world/validate.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const args = process.argv.slice(2);
const only = args.filter((a) => /^\d+$/.test(a)).map(Number);
const showMap = args.includes('--map');
const ids = [1, 2, 3, 4, 5, 6, 7].filter((i) => !only.length || only.includes(i));

let bad = 0;
for (const id of ids) {
  const file = path.join(root, 'tools/levelgen', `stage${id}.mjs`);
  if (!fs.existsSync(file)) continue;
  const mod = await import(file);
  const stage = mod.build();
  const data = stage.toJSON();
  fs.writeFileSync(path.join(root, 'levels', `stage${id}.json`), stringify(data));
  const r = validateLevel(data);
  const ok = r.errors.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} stage${id} ${data.name}  ${r.stats.w}×${r.stats.h}  敵${r.stats.enemies} コイン${r.stats.coins} 穴${r.stats.pits}`);
  for (const e of r.errors) console.log('   エラー: ' + e);
  for (const w of r.warnings) console.log('   注意:   ' + w);
  if (showMap) {
    const mask = r.stats.reachedMask;
    const path_ = new Set(r.stats.path.map(([x, y]) => y * r.stats.w + x));
    const marks = new Map();
    for (const e of data.entities) if (Number.isFinite(e.x) && e.type !== 'decor' && e.type !== 'cameraZone') {
      const c = { start: '@', sarubobo: '$', checkpoint: 'C', sign: '?', skewer: '*' }[e.type] || (/Platform|gondola|boat|Float|tightrope|steam|bouncer/.test(e.type) ? '=' : 'E');
      marks.set(e.y * r.stats.w + e.x, c);
    }
    const step = 100;
    for (let x0 = 0; x0 < r.stats.w; x0 += step) {
      console.log('      ' + Array.from({ length: Math.min(step, r.stats.w - x0) }, (_, i) => ((x0 + i) % 10 === 0 ? String(((x0 + i) / 10) % 10) : ' ')).join(''));
      data.tiles.forEach((row, y) => {
        let s = '';
        for (let x = x0; x < Math.min(x0 + step, r.stats.w); x++) {
          const n = y * r.stats.w + x;
          s += marks.get(n) || (row[x] === '.' && path_.has(n) ? '+' : row[x] === '.' && mask[n] ? ',' : row[x]);
        }
        console.log(String(y).padStart(4) + '  ' + s);
      });
    }
  }
}

// エディタ：validate.js を埋め込む
const tpl = path.join(root, 'tools/levelgen/editor-template.html');
if (fs.existsSync(tpl)) {
  const v = fs.readFileSync(path.join(root, 'src/world/validate.js'), 'utf8').replace(/^export /gm, '');
  const html = fs.readFileSync(tpl, 'utf8').replace('/*__VALIDATE_JS__*/', () => v);
  fs.writeFileSync(path.join(root, 'tools/level-editor.html'), html);
}
if (bad) { console.log(`${bad} ステージにエラー`); process.exitCode = 1; }
