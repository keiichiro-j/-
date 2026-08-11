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
  'OrderFormExtractionService.gs',
  'SearchService.gs',
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
test('下取損 = 買取金額 - 査定額', () => assert.strictEqual(sandbox.calcTradeInLoss(450000, 500000), 50000));
test('査定額・買取金額が欠けている場合は null', () => assert.strictEqual(sandbox.calcTradeInLoss(500000, null), null));
test('OCRテキストからの数値抽出（カンマ・円混在）', () => {
  assert.strictEqual(sandbox.toNumber_('¥1,234,000'), 1234000);
  assert.strictEqual(sandbox.toNumber_('123km'), 123);
  assert.strictEqual(sandbox.toNumber_(''), null);
});
test('normalizeAppraisalDraft_ は査定書由来の項目（買取金額・車両情報）のみを正規化する', () => {
  const draft = sandbox.normalizeAppraisalDraft_({
    carType: 'トヨタ', mileage: '32,000km', purchaseAmount: '650,000円'
  });
  assert.strictEqual(draft.carType, 'ﾄﾖﾀ');
  assert.strictEqual(draft.mileage, '32,000km');
  assert.strictEqual(draft.purchaseAmount, 650000);
  assert.strictEqual(draft.appraisalAmount, undefined); // 査定額は注文書側で取得するため含まない
  assert.strictEqual(draft.purchaseType, '下取');
});

console.log('== OrderFormExtractionService: ORDER_FORM_LABEL_MAP ==');
test('注文書テキストから査定金額・使用者名・住所を抽出', () => {
  const text = '査定金額：500,000円\n使用者の氏名又は名称：山田太郎\n使用者の住所：東京都千代田区1-1-1';
  const raw = sandbox.extractByLabels_(text, sandbox.ORDER_FORM_LABEL_MAP);
  assert.strictEqual(raw.appraisalAmount, '500,000円');
  assert.strictEqual(raw.supplier, '山田太郎');
  assert.strictEqual(raw.address, '東京都千代田区1-1-1');
});

console.log('== AppraisalExtractionService: 車種/モデル/カラー/走行距離の正規化 ==');
test('メーカー名を半角カタカナに変換', () => assert.strictEqual(sandbox.normalizeCarType_('トヨタ'), 'ﾄﾖﾀ'));
test('独系メーカーはMB/AU/VWへ省略', () => {
  assert.strictEqual(sandbox.normalizeCarType_('メルセデス・ベンツ'), 'MB');
  assert.strictEqual(sandbox.normalizeCarType_('アウディ'), 'AU');
  assert.strictEqual(sandbox.normalizeCarType_('フォルクスワーゲン'), 'VW');
});
test('独系モデルは「Aクラス180」→「A18」に短縮', () => assert.strictEqual(sandbox.normalizeModel_('MB', 'Aクラス 180'), 'A18'));
test('独系以外のモデルはそのまま', () => assert.strictEqual(sandbox.normalizeModel_('ﾄﾖﾀ', 'アルファード'), 'アルファード'));
test('カラーは漢字一文字に正規化', () => {
  assert.strictEqual(sandbox.normalizeColor_('ブラックマイカ'), '黒');
  assert.strictEqual(sandbox.normalizeColor_('パールホワイト'), '白');
});
test('走行距離は「00,000km」形式に整形', () => assert.strictEqual(sandbox.formatMileage_('62345'), '62,345km'));

console.log('== OcrService: 日付・登録番号の正規化 ==');
test('元号表記(令和)をyyyy/MM/ddへ変換', () => assert.strictEqual(sandbox.formatYearMonthDay_('令和7年5月31日'), '2025/05/31'));
test('元号表記(令和)をyyyy/MMへ変換（日省略）', () => assert.strictEqual(sandbox.formatYearMonth_('令和7年5月'), '2025/05'));
test('西暦表記をyyyy/MMへ変換', () => assert.strictEqual(sandbox.formatYearMonth_('2025年5月'), '2025/05'));
test('西暦スラッシュ表記をyyyy/MM/ddへ変換', () => assert.strictEqual(sandbox.formatYearMonthDay_('2025/05/31'), '2025/05/31'));
test('登録番号を4分割で抽出', () => {
  const r = sandbox.extractRegistrationPlate_('自動車登録番号又は車両番号　岐阜330あ1234\n車台番号：ABC-1');
  assert.strictEqual(r.plateRegion, '岐阜');
  assert.strictEqual(r.plateClass, '330');
  assert.strictEqual(r.plateKana, 'あ');
  assert.strictEqual(r.plateNumber, '1234');
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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
