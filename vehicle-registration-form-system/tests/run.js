/**
 * tests/run.js
 * GASの外部サービス（Spreadsheet/Drive等）に依存しない純粋関数を
 * Node.js の vm サンドボックスへ読み込み、単体テストする。
 * 実行: npm test / node tests/run.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');

// Utilities.formatDate は本テストで使う 'yyyy-MM' / 'yyyyMMdd_HHmmss' パターンのみ最小実装する。
function pad(n, len) { return String(n).padStart(len || 2, '0'); }
function formatDateStub(date, tz, pattern) {
  const map = {
    yyyy: date.getFullYear(),
    MM: pad(date.getMonth() + 1),
    dd: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds())
  };
  return pattern.replace(/yyyy|MM|dd|HH|mm|ss/g, (token) => map[token]);
}

const sandbox = {
  Utilities: { formatDate: formatDateStub }
};
vm.createContext(sandbox);

const FILES = ['Constants.gs', 'ValidationService.gs', 'HistoryService.gs', 'TemplateService.gs'];
FILES.forEach((file) => {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  vm.runInContext(code, sandbox, { filename: file });
});

let pass = 0;
let fail = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log('  ok - ' + name);
  } catch (e) {
    fail++;
    console.error('  NG - ' + name);
    console.error('       ' + e.message);
  }
}

function baseFormData(overrides) {
  return Object.assign({
    type: 'OSS',
    company: '岐阜ヤナセ株式会社',
    manager: '戸田 圭市朗',
    sendDate: '2026-08-10',
    regDateCommon: '',
    vehicles: [{ userName: '岐阜 太郎', chassis: '1234', indivRegDate: '2026-08-15' }]
  }, overrides || {});
}

console.log('== ValidationService: validateFormData_ ==');
test('必須項目が揃っていればエラーなし', () => {
  assert.strictEqual(sandbox.validateFormData_(baseFormData()).length, 0);
});
test('会社名が空ならエラー', () => {
  const errors = sandbox.validateFormData_(baseFormData({ company: '' }));
  assert.ok(errors.some((e) => e.includes('依頼会社名')));
});
test('紙登録で登録日（全体）が空ならエラー', () => {
  const errors = sandbox.validateFormData_(baseFormData({ type: '紙', regDateCommon: '' }));
  assert.ok(errors.some((e) => e.includes('登録日（全体）')));
});
test('OSSは個別登録日が未入力でもエラーにならない（登録日未定タブへ記録するため）', () => {
  const errors = sandbox.validateFormData_(baseFormData({
    vehicles: [{ userName: '岐阜 太郎', chassis: '1234', indivRegDate: '' }]
  }));
  assert.strictEqual(errors.length, 0);
});
test('車台番号が4桁数字でなければエラー', () => {
  const errors = sandbox.validateFormData_(baseFormData({
    vehicles: [{ userName: '岐阜 太郎', chassis: '12A4' }]
  }));
  assert.ok(errors.some((e) => e.includes('車台番号')));
});
test('税額が負の数ならエラー', () => {
  const errors = sandbox.validateFormData_(baseFormData({
    vehicles: [{ userName: '岐阜 太郎', chassis: '1234', autoTax: '-100' }]
  }));
  assert.ok(errors.some((e) => e.includes('自動車税')));
});
test('使用車名が入力された行が0台ならエラー', () => {
  const errors = sandbox.validateFormData_(baseFormData({ vehicles: [{ userName: '' }] }));
  assert.ok(errors.some((e) => e.includes('1台以上')));
});
test('11台以上入力するとエラー', () => {
  const vehicles = [];
  for (let i = 0; i < 11; i++) vehicles.push({ userName: '車' + i, chassis: '1234' });
  const errors = sandbox.validateFormData_(baseFormData({ vehicles }));
  assert.ok(errors.some((e) => e.includes('10台以内')));
});

console.log('== ValidationService: parseDateOnly_ / isValidDateStr_ ==');
test('YYYY-MM-DDをローカル日付として解釈する（UTCシフトしない）', () => {
  const d = sandbox.parseDateOnly_('2026-08-07');
  assert.strictEqual(d.getFullYear(), 2026);
  assert.strictEqual(d.getMonth(), 7);
  assert.strictEqual(d.getDate(), 7);
});
test('不正な形式はfalse', () => {
  assert.strictEqual(sandbox.isValidDateStr_('2026/08/07'), false);
  assert.strictEqual(sandbox.isValidDateStr_(''), false);
});

console.log('== HistoryService: resolveHistoryTabName_ / getActiveVehicles_ ==');
test('OSSは車両の個別登録日から年月タブ名を決める', () => {
  assert.strictEqual(
    sandbox.resolveHistoryTabName_('OSS', { indivRegDate: '2026-08-15' }, ''),
    '2026-08'
  );
});
test('OSSで登録日未入力なら「登録日未定」タブになる', () => {
  assert.strictEqual(
    sandbox.resolveHistoryTabName_('OSS', { indivRegDate: '' }, ''),
    sandbox.HISTORY_PENDING_TAB_NAME
  );
});
test('紙登録は共通登録日から年月タブ名を決める', () => {
  assert.strictEqual(
    sandbox.resolveHistoryTabName_('紙', {}, '2026-09-01'),
    '2026-09'
  );
});
test('使用車名が空の行はアクティブな車両とみなさない', () => {
  const active = sandbox.getActiveVehicles_([
    { userName: '岐阜 太郎' }, { userName: '' }, { userName: '  ' }, { userName: '岐阜 花子' }
  ]);
  assert.strictEqual(active.length, 2);
});

console.log('== TemplateService: buildPdfFileName_ ==');
test('ファイル名にタイムスタンプと種別・会社名を含む', () => {
  const name = sandbox.buildPdfFileName_('OSS', '岐阜ヤナセ株式会社', new Date(2026, 7, 7, 9, 30, 0));
  assert.ok(name.startsWith('登録依頼書_OSS_岐阜ヤナセ株式会社_20260807_0930'));
  assert.ok(name.endsWith('.pdf'));
});
test('会社名にファイル名として使えない文字が含まれていても安全化する', () => {
  const name = sandbox.buildPdfFileName_('紙', 'A/B:C', new Date(2026, 7, 7, 9, 30, 0));
  assert.ok(!/[\/:]/.test(name.replace('.pdf', '')));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
