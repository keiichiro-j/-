// dist/ を毎回のビルド前に空にする。
// tsc も copy-static.js もソースファイル削除時に dist/ 側の対応ファイルを消さないため、
// これをしないとリネーム・統合済みの古いファイルが dist/ に残り続け、
// clasp push で古いファイルまで一緒にGASへ送られてしまう。
'use strict';

const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');

fs.rmSync(distDir, { recursive: true, force: true });
console.log('dist/ をクリーンにしました。');
