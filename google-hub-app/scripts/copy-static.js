// tsc の出力(dist/)に対して、GASプロジェクトのプッシュに必要な静的ファイルを追加コピーする。
// - appsscript.json (マニフェスト)
// - src/html/**/*.html (HtmlServiceテンプレート)
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyDirRecursive(fromDir, toDir, extensions) {
  const entries = fs.readdirSync(fromDir, { withFileTypes: true });
  entries.forEach((entry) => {
    const fromPath = path.join(fromDir, entry.name);
    const toPath = path.join(toDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(fromPath, toPath, extensions);
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      copyFile(fromPath, toPath);
    }
  });
}

if (!fs.existsSync(distDir)) {
  throw new Error('dist/ が見つかりません。先に `tsc` でビルドしてください。');
}

copyFile(path.join(projectRoot, 'appsscript.json'), path.join(distDir, 'appsscript.json'));
copyDirRecursive(path.join(projectRoot, 'src', 'html'), path.join(distDir, 'html'), ['.html']);

console.log('appsscript.json と html/ を dist/ へコピーしました。');
