/**
 * tests/run.js
 * GAS ファイル（.gs）中の純粋関数（スプレッドシート/Drive等の外部サービスに依存しない
 * ロジック）を Node.js 上の vm サンドボックスへ読み込み、単体テストする。
 * 外部ライブラリ非依存。実行: npm test / node tests/run.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const sandbox = {};
vm.createContext(sandbox);

// Constants.gs -> OcnService.gs -> PdfLinkService.gs の順で依存関係あり
const FILES = [
  'Constants.gs',
  'OcnService.gs',
  'PdfLinkService.gs',
  'AppraisalExtractionService.gs',
  'SearchService.gs',
  'CsvExportService.gs',
  'OcrService.gs'
];

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

console.log('== OcnService: parseOcnSequence ==');
test('12345 -> 12345', () => assert.strictEqual(sandbox.parseOcnSequence('12345'), 12345));
test('00042 -> 42（ゼロパディング）', () => assert.strictEqual(sandbox.parseOcnSequence('00042'), 42));
test('不正形式（英字混在）は null', () => assert.strictEqual(sandbox.parseOcnSequence('OCN123'), null));
test('空値は null', () => assert.strictEqual(sandbox.parseOcnSequence(''), null));

console.log('== PdfLinkService: parseInspectionCertFileName ==');
test('前所有者名義PDF', () => {
  const r = sandbox.parseInspectionCertFileName('12345.pdf');
  assert.strictEqual(r.ocn, '12345');
  assert.strictEqual(r.kind, 'prev');
});
test('自社名義PDF', () => {
  const r = sandbox.parseInspectionCertFileName('12345_自社名義.pdf');
  assert.strictEqual(r.ocn, '12345');
  assert.strictEqual(r.kind, 'own');
});
test('ゼロパディングされたファイル名は先頭ゼロを除去して正規化される', () => {
  const r = sandbox.parseInspectionCertFileName('00099.pdf');
  assert.strictEqual(r.ocn, '99');
});
test('OCN形式でないファイル名は null', () => {
  assert.strictEqual(sandbox.parseInspectionCertFileName('random.pdf'), null);
});

console.log('== AppraisalExtractionService: calcTradeInLoss / normalizeAppraisalDraft_ ==');
test('下取損 = 査定額 - 買取金額', () => assert.strictEqual(sandbox.calcTradeInLoss(500000, 450000), 50000));
test('査定額・買取金額が欠けている場合は null', () => assert.strictEqual(sandbox.calcTradeInLoss(500000, null), null));
test('OCRテキストからの数値抽出（カンマ・円混在）', () => {
  assert.strictEqual(sandbox.toNumber_('¥1,234,000'), 1234000);
  assert.strictEqual(sandbox.toNumber_('123km'), 123);
  assert.strictEqual(sandbox.toNumber_(''), null);
});
test('normalizeAppraisalDraft_ が下取損まで一括計算する', () => {
  const draft = sandbox.normalizeAppraisalDraft_({
    carType: 'プリウス', mileage: '32,000km', appraisalAmount: '600,000円', purchaseAmount: '550,000円'
  });
  assert.strictEqual(draft.mileage, 32000);
  assert.strictEqual(draft.tradeInLoss, 50000);
});

console.log('== OcrService: extractByLabels_（テンプレート抽出） ==');
test('ラベル+コロンの直後の値を抽出', () => {
  const text = '車台番号：ABC-1234567\n所有者：山田太郎\n';
  const r = sandbox.extractByLabels_(text, { chassisNumber: ['車台番号'], supplier: ['所有者'] });
  assert.strictEqual(r.chassisNumber, 'ABC-1234567');
  assert.strictEqual(r.supplier, '山田太郎');
});
test('候補ラベルのうち先にヒットしたものを採用', () => {
  const text = '使用者の住所：岐阜県岐阜市1-2-3\n';
  const r = sandbox.extractByLabels_(text, { address: ['所有者の住所', '使用者の住所'] });
  assert.strictEqual(r.address, '岐阜県岐阜市1-2-3');
});
test('該当ラベルが無ければキー自体が生成されない', () => {
  const r = sandbox.extractByLabels_('無関係なテキスト', { supplier: ['所有者'] });
  assert.strictEqual('supplier' in r, false);
});

console.log('== SearchService: matchesKeyword / matchesRegistrationNumber ==');
const sampleVehicle = {
  carType: 'プリウス', model: 'Sツーリング', chassisNumber: 'ZVW30-1234567', ocn: 'OCN00001', supplier: '山田太郎',
  plateRegion: '岐阜', plateClass: '301', plateKana: 'は', plateNumber: '2000'
};
test('車種名の部分一致でヒット', () => assert.strictEqual(sandbox.matchesKeyword(sampleVehicle, 'プリウス'), true));
test('登録番号の結合表記（スペース無し）でヒット', () => assert.strictEqual(sandbox.matchesRegistrationNumber(sampleVehicle, '岐阜301は2000'), true));
test('登録番号の結合表記（スペース有り）でヒット', () => assert.strictEqual(sandbox.matchesRegistrationNumber(sampleVehicle, '岐阜 301 は 2000'), true));
test('登録番号の一部分（分類番号のみ）でもヒット', () => assert.strictEqual(sandbox.matchesRegistrationNumber(sampleVehicle, '301'), true));
test('無関係な文字列はヒットしない', () => assert.strictEqual(sandbox.matchesKeyword(sampleVehicle, '横浜'), false));

console.log('== CsvExportService: buildCsv_ / csvEscape_ ==');
test('カンマ・改行を含む値はダブルクォートでエスケープされる', () => {
  assert.strictEqual(sandbox.csvEscape_('a,b'), '"a,b"');
  assert.strictEqual(sandbox.csvEscape_('a"b'), '"a""b"');
  assert.strictEqual(sandbox.csvEscape_('plain'), 'plain');
});
test('buildCsv_ はヘッダー行＋会社/タブ列を含む', () => {
  const csv = sandbox.buildCsv_([{ companyId: 'A', tabName: '輸入車', ocn: 'OCN00001', carType: 'プリウス' }]);
  const lines = csv.replace('﻿', '').split('\r\n');
  assert.ok(lines[0].startsWith('拠点,タブ,OCN'));
  // 列順は 拠点,タブ,OCN,仕入日(空欄),車種... のため、仕入日の空欄を挟む
  assert.ok(lines[1].startsWith('A,輸入車,OCN00001,,プリウス'));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
