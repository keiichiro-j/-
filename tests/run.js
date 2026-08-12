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
  'OcrService.gs',
  'ScheduleConstants.gs',
  'ScheduleCalendar.gs'
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

console.log('== ScheduleCalendar: buildCalendarGrid_ ==');
test('2026年8月は日曜始まりで7/26～9/5の42マス', () => {
  const grid = sandbox.buildCalendarGrid_(2026, 8, '2026-08-27');
  assert.strictEqual(grid.length, 42);
  assert.strictEqual(grid[0].date, '2026-07-26');
  assert.strictEqual(grid[grid.length - 1].date, '2026-09-05');
});
test('月内の日は inMonth: true、前後月は false', () => {
  const grid = sandbox.buildCalendarGrid_(2026, 8, '2026-08-27');
  assert.strictEqual(grid.find((c) => c.date === '2026-08-01').inMonth, true);
  assert.strictEqual(grid.find((c) => c.date === '2026-07-26').inMonth, false);
});
test('todayStr と一致する日のみ isToday: true', () => {
  const grid = sandbox.buildCalendarGrid_(2026, 8, '2026-08-27');
  assert.strictEqual(grid.find((c) => c.date === '2026-08-27').isToday, true);
  assert.strictEqual(grid.find((c) => c.date === '2026-08-26').isToday, false);
});

console.log('== ScheduleCalendar: filterEventsByOffice_ ==');
const sampleEvents = [
  { date: '2026-08-27', type: 'deadline_plate', office: 'A支局', memo: '' },
  { date: '2026-08-27', type: 'deadline_paper', office: 'B支局', memo: '' },
  { date: '2026-08-31', type: 'holiday_own', office: '', memo: '' }
];
test('office指定なしは全件そのまま', () => {
  assert.strictEqual(sandbox.filterEventsByOffice_(sampleEvents, '').length, 3);
});
test('office指定時は一致する支局＋office無し（弊社休日等）のみ残る', () => {
  const filtered = sandbox.filterEventsByOffice_(sampleEvents, 'A支局');
  assert.strictEqual(filtered.length, 2);
  assert.deepStrictEqual(filtered.map((e) => e.type), ['deadline_plate', 'holiday_own']);
});

console.log('== ScheduleCalendar: groupEventsByDate_ ==');
test('日付ごとにグルーピングし、種別優先度順（希望番号締切が先頭）にソートする', () => {
  const grouped = sandbox.groupEventsByDate_(sampleEvents);
  assert.strictEqual(grouped['2026-08-27'].length, 2);
  assert.strictEqual(grouped['2026-08-27'][0].type, 'deadline_plate');
  assert.strictEqual(grouped['2026-08-27'][1].type, 'deadline_paper');
  assert.strictEqual(grouped['2026-08-31'][0].type, 'holiday_own');
});

console.log('== ScheduleCalendar: limitCellTags_ ==');
test('上限以下なら全件表示・overflow 0', () => {
  const r = sandbox.limitCellTags_(sampleEvents.slice(0, 2), 3);
  assert.strictEqual(r.shown.length, 2);
  assert.strictEqual(r.overflow, 0);
});
test('上限超過分は overflow 件数として畳まれる', () => {
  const many = [1, 2, 3, 4, 5].map((n) => ({ date: '2026-08-27', type: 'holiday_own', office: '', memo: String(n) }));
  const r = sandbox.limitCellTags_(many, 3);
  assert.strictEqual(r.shown.length, 3);
  assert.strictEqual(r.overflow, 2);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
