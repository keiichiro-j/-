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
    sendBatch: '第１便',
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
test('ブランドが空欄ならエラーにならない(任意項目)', () => {
  const errors = sandbox.validateFormData_(baseFormData({
    vehicles: [{ userName: '岐阜 太郎', chassis: '1234', brand: '' }]
  }));
  assert.strictEqual(errors.length, 0);
});
test('ブランドがMB/AU以外ならエラー', () => {
  const errors = sandbox.validateFormData_(baseFormData({
    vehicles: [{ userName: '岐阜 太郎', chassis: '1234', brand: 'BMW' }]
  }));
  assert.ok(errors.some((e) => e.includes('ブランド')));
});
test('使用車名が入力された行が0台ならエラー', () => {
  const errors = sandbox.validateFormData_(baseFormData({ vehicles: [{ userName: '' }] }));
  assert.ok(errors.some((e) => e.includes('1台以上')));
});
test('MAX_VEHICLESを超えて入力するとエラー', () => {
  const vehicles = [];
  for (let i = 0; i < sandbox.MAX_VEHICLES + 1; i++) vehicles.push({ userName: '車' + i, chassis: '1234' });
  const errors = sandbox.validateFormData_(baseFormData({ vehicles }));
  assert.ok(errors.some((e) => e.includes(sandbox.MAX_VEHICLES + '台以内')));
});
test('送付便が選択肢外(空欄含む)ならエラー', () => {
  const errors = sandbox.validateFormData_(baseFormData({ sendBatch: '' }));
  assert.ok(errors.some((e) => e.includes('送付便')));
});
test('送付便が第１〜第３便のいずれかならエラーなし', () => {
  ['第１便', '第２便', '第３便'].forEach((batch) => {
    assert.strictEqual(sandbox.validateFormData_(baseFormData({ sendBatch: batch })).length, 0);
  });
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

console.log('== HistoryService: formatHistoryCell_ ==');
test('送信日時はyyyy-MM-dd HH:mmに整形される', () => {
  const v = sandbox.formatHistoryCell_('送信日時', new Date(2026, 7, 8, 9, 5, 0));
  assert.strictEqual(v, '2026-08-08 09:05');
});
test('送信日時以外の日付セルはyyyy-MM-ddに整形される', () => {
  const v = sandbox.formatHistoryCell_('登録日', new Date(2026, 7, 8, 0, 0, 0));
  assert.strictEqual(v, '2026-08-08');
});
test('Date以外の値はそのまま返す', () => {
  assert.strictEqual(sandbox.formatHistoryCell_('依頼会社名', '岐阜ヤナセ株式会社'), '岐阜ヤナセ株式会社');
  assert.strictEqual(sandbox.formatHistoryCell_('自動車税', 12000), 12000);
});

console.log('== HistoryService: getHistoryEntriesByDateRange_ ==');

// Spreadsheet/Sheetの最小限のフェイク実装(getSheets/getSheetByName/getLastRow/getRange().getValues()のみ)
function makeFakeSheet(name, dataRows) {
  return {
    getName: () => name,
    getLastRow: () => dataRows.length + 1,
    getRange: (r, c, numRows, numCols) => ({ getValues: () => dataRows })
  };
}
function makeFakeSpreadsheet(sheets) {
  const byName = {};
  sheets.forEach((s) => { byName[s.getName()] = s; });
  return {
    getSheets: () => sheets,
    getSheetByName: (name) => byName[name] || null
  };
}
// HISTORY_HEADER_ROWの列順に合わせた1行分のテストデータを作る(登録日はcolsで上書き)
function makeHistoryRow(sentAt, regDate, userName, brand) {
  return [
    sentAt, 'uuid-' + userName, 'OSS', '岐阜ヤナセ株式会社', '戸田 圭市朗',
    regDate, sentAt, '第１便', 1, userName, brand, '1234', 'W205', '000-1',
    10000, 0, 5000, '', '', '', '', '担当A'
  ];
}

test('月をまたぐ期間指定で、範囲内の登録日の行だけを新しい順に集める', () => {
  const ss = makeFakeSpreadsheet([
    makeFakeSheet('2026-07', [
      makeHistoryRow(new Date(2026, 6, 10, 9, 0), new Date(2026, 6, 10), '範囲外(7/10)', 'MB'),
      makeHistoryRow(new Date(2026, 6, 25, 9, 0), new Date(2026, 6, 25), '範囲内(7/25)', 'MB')
    ]),
    makeFakeSheet('2026-08', [
      makeHistoryRow(new Date(2026, 7, 5, 9, 0), new Date(2026, 7, 5), '範囲内(8/05)', 'AU')
    ]),
    makeFakeSheet(sandbox.HISTORY_PENDING_TAB_NAME, [])
  ]);

  const result = sandbox.getHistoryEntriesByDateRange_(ss, '2026-07-20', '2026-08-10', false);
  // result.rows はvmサンドボックス内で生成された配列(別Realm)のため、
  // Array.from で現在のRealmの配列に変換してから比較する(でないとdeepStrictEqualが
  // プロトタイプ差分を理由に失敗する)。
  const names = Array.from(result.rows, (r) => r[9]);
  assert.deepStrictEqual(names, ['範囲内(8/05)', '範囲内(7/25)']);
});

test('登録日未定を含める指定で、範囲を問わず登録日未定タブの行も追加される', () => {
  const ss = makeFakeSpreadsheet([
    makeFakeSheet('2026-08', [
      makeHistoryRow(new Date(2026, 7, 5, 9, 0), new Date(2026, 7, 5), '確定分', 'MB')
    ]),
    makeFakeSheet(sandbox.HISTORY_PENDING_TAB_NAME, [
      makeHistoryRow(new Date(2026, 7, 6, 9, 0), '', '未定分', 'AU')
    ])
  ]);

  const withoutPending = sandbox.getHistoryEntriesByDateRange_(ss, '2026-08-01', '2026-08-31', false);
  assert.strictEqual(withoutPending.rows.length, 1);

  const withPending = sandbox.getHistoryEntriesByDateRange_(ss, '2026-08-01', '2026-08-31', true);
  assert.strictEqual(withPending.rows.length, 2);
  assert.ok(withPending.rows.some((r) => r[9] === '未定分'));
});

test('開始日・終了日とも空なら全期間の行を対象にする', () => {
  const ss = makeFakeSpreadsheet([
    makeFakeSheet('2026-01', [makeHistoryRow(new Date(2026, 0, 1, 9, 0), new Date(2026, 0, 1), '1月分', 'MB')]),
    makeFakeSheet('2026-08', [makeHistoryRow(new Date(2026, 7, 1, 9, 0), new Date(2026, 7, 1), '8月分', 'AU')])
  ]);

  const result = sandbox.getHistoryEntriesByDateRange_(ss, '', '', false);
  assert.strictEqual(result.rows.length, 2);
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
