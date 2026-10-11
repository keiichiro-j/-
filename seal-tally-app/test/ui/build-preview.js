#!/usr/bin/env node
/**
 * test/ui/build-preview.js
 * html/index.html の <?!= include_('html/xxx') ?> を html/xxx.html の中身で置き換え、
 * google.script.run のフェイク（fake-gas.js）を埋め込んだ単体HTML（test/ui/preview.html）を作る。
 * 実行: node test/ui/build-preview.js
 * 開き方の例: test/ui/preview.html?role=editor&delay=800
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, 'preview.html');

function include(name) {
  const file = path.join(ROOT, name + '.html');
  if (!fs.existsSync(file)) throw new Error('include 先がありません: ' + file);
  return fs.readFileSync(file, 'utf8');
}

let html = fs.readFileSync(path.join(ROOT, 'html', 'index.html'), 'utf8');
const fake = fs.readFileSync(path.join(__dirname, 'fake-gas.js'), 'utf8');

html = html.replace(/<\?!=\s*include_\(\s*['"]([^'"]+)['"]\s*\)\s*;?\s*\?>/g, (_, name) => include(name));
if (/<\?/.test(html)) throw new Error('置き換えられていないスクリプトレットが残っています');

// フェイクは画面スクリプトより前に読み込む（head の末尾）
html = html.replace('</head>', '<script>/* fake-gas.js（ローカル確認用） */\n' + fake.replace(/<\/script/gi, '<\\/script') + '\n</script>\n</head>');

fs.writeFileSync(OUT, html);
console.log('wrote ' + path.relative(process.cwd(), OUT) + ' (' + html.length + ' bytes)');
