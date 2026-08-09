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
test('使用者名が入力された行が0台ならエラー', () => {
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
test('使用者名が空の行はアクティブな車両とみなさない', () => {
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

// cancelSubmission_ / getPdfsBySendDate_ のテスト用に、setValue/setValues にも対応した
// (書き込み可能な)フェイクシートを用意する。既存の makeFakeSheet は読み取り専用のため、
// 混同を避けて別名にしている。
function makeMutableSheet(name, headerRow, dataRows) {
  const rows = [headerRow].concat(dataRows.map((r) => r.slice()));
  return {
    getName: () => name,
    getLastRow: () => rows.length,
    getRange: (r, c, numRows, numCols) => {
      numRows = numRows || 1;
      numCols = numCols || 1;
      return {
        getValues: () => {
          const out = [];
          for (let i = 0; i < numRows; i++) {
            const rowOut = [];
            for (let j = 0; j < numCols; j++) {
              rowOut.push(rows[r - 1 + i][c - 1 + j]);
            }
            out.push(rowOut);
          }
          return out;
        },
        setValue: (v) => { rows[r - 1][c - 1] = v; },
        setValues: (vals) => {
          vals.forEach((rowVals, i) => {
            rowVals.forEach((v, j) => { rows[r - 1 + i][c - 1 + j] = v; });
          });
        }
      };
    },
    _rows: rows // テストからの直接検証用
  };
}

// HISTORY_HEADER_ROW の列順に合わせた1行分のテストデータを作る(overridesで一部だけ上書き)
function makeHistoryFullRow(overrides) {
  const o = Object.assign({
    submissionId: 'uuid-x',
    userName: '岐阜 太郎',
    sendDate: new Date(2026, 7, 10),
    sendBatch: '第１便',
    pdfUrl: 'https://drive.google.com/file/d/FAKE_ID/view',
    status: sandbox.SUBMISSION_STATUS_ACTIVE
  }, overrides || {});

  const h = sandbox.HISTORY_HEADER_ROW;
  const row = new Array(h.length).fill('');
  row[h.indexOf('送信日時')] = new Date(2026, 7, 10, 9, 0);
  row[h.indexOf('submissionId')] = o.submissionId;
  row[h.indexOf('種別')] = 'OSS';
  row[h.indexOf('依頼会社名')] = '岐阜ヤナセ株式会社';
  row[h.indexOf('担当責任者')] = '戸田 圭市朗';
  row[h.indexOf('登録日')] = new Date(2026, 7, 10);
  row[h.indexOf('送付日')] = o.sendDate;
  row[h.indexOf('送付便')] = o.sendBatch;
  row[h.indexOf('車両No.')] = 1;
  row[h.indexOf('使用者名')] = o.userName;
  row[h.indexOf('ブランド')] = 'MB';
  row[h.indexOf('車台番号')] = '1234';
  row[h.indexOf('送付書PDF')] = o.pdfUrl;
  row[h.indexOf('状態')] = o.status;
  return row;
}

console.log('== HistoryService: cancelSubmission_ ==');
test('指定したsubmissionIdの行を状態=取消・取消日時ありに更新する(複数タブにまたがる場合も)', () => {
  const header = sandbox.HISTORY_HEADER_ROW;
  const row1 = makeHistoryFullRow({ submissionId: 'uuid-A', userName: '岐阜 太郎' });
  const row2 = makeHistoryFullRow({ submissionId: 'uuid-B', userName: '岐阜 花子' });
  const row3 = makeHistoryFullRow({ submissionId: 'uuid-A', userName: '岐阜 次郎' }); // 同じ申請の別車両、別タブ

  const sheet1 = makeMutableSheet('2026-08', header, [row1, row2]);
  const sheet2 = makeMutableSheet('2026-09', header, [row3]);
  const ss = makeFakeSpreadsheet([sheet1, sheet2]);

  const updated = sandbox.cancelSubmission_(ss, 'uuid-A');
  assert.strictEqual(updated, 2);

  const statusCol = header.indexOf('状態');
  const cancelledAtCol = header.indexOf('取消日時');
  assert.strictEqual(sheet1._rows[1][statusCol], sandbox.SUBMISSION_STATUS_CANCELLED);
  assert.strictEqual(Object.prototype.toString.call(sheet1._rows[1][cancelledAtCol]), '[object Date]');
  assert.strictEqual(sheet1._rows[2][statusCol], sandbox.SUBMISSION_STATUS_ACTIVE); // uuid-Bは変更されない
  assert.strictEqual(sheet2._rows[1][statusCol], sandbox.SUBMISSION_STATUS_CANCELLED);
});
test('存在しないsubmissionIdを指定すると0件更新', () => {
  const header = sandbox.HISTORY_HEADER_ROW;
  const sheet = makeMutableSheet('2026-08', header, [makeHistoryFullRow({ submissionId: 'uuid-A' })]);
  const ss = makeFakeSpreadsheet([sheet]);
  assert.strictEqual(sandbox.cancelSubmission_(ss, 'uuid-not-exist'), 0);
});

console.log('== HistoryService: getPdfsBySendDate_ ==');
test('指定した送付日・送付便に一致する行を申請単位(submissionId)にまとめて返す', () => {
  const header = sandbox.HISTORY_HEADER_ROW;
  const sendDateStr = '2026-08-10';
  const sendDateObj = new Date(2026, 7, 10);
  const otherDateObj = new Date(2026, 7, 11);

  const rowA1 = makeHistoryFullRow({ submissionId: 'uuid-A', userName: '岐阜 太郎', sendDate: sendDateObj, sendBatch: '第１便' });
  const rowA2 = makeHistoryFullRow({ submissionId: 'uuid-A', userName: '岐阜 次郎', sendDate: sendDateObj, sendBatch: '第１便' });
  const rowB = makeHistoryFullRow({ submissionId: 'uuid-B', userName: '岐阜 花子', sendDate: sendDateObj, sendBatch: '第２便' });
  const rowC = makeHistoryFullRow({ submissionId: 'uuid-C', userName: '他日分', sendDate: otherDateObj, sendBatch: '第１便' });

  const sheet = makeMutableSheet('2026-08', header, [rowA1, rowA2, rowB, rowC]);
  const ss = makeFakeSpreadsheet([sheet]);

  const all = sandbox.getPdfsBySendDate_(ss, sendDateStr, '');
  assert.strictEqual(all.length, 2); // uuid-A, uuid-B (uuid-Cは別日なので対象外)

  const submissionA = all.find((x) => x.submissionId === 'uuid-A');
  assert.strictEqual(submissionA.vehicleCount, 2);
  assert.strictEqual(submissionA.pdfUrl, 'https://drive.google.com/file/d/FAKE_ID/view');
  assert.strictEqual(submissionA.status, sandbox.SUBMISSION_STATUS_ACTIVE);

  const onlyBatch1 = sandbox.getPdfsBySendDate_(ss, sendDateStr, '第１便');
  assert.strictEqual(onlyBatch1.length, 1);
  assert.strictEqual(onlyBatch1[0].submissionId, 'uuid-A');
});
test('該当する送付日がなければ空配列を返す', () => {
  const header = sandbox.HISTORY_HEADER_ROW;
  const sheet = makeMutableSheet('2026-08', header, [makeHistoryFullRow({})]);
  const ss = makeFakeSpreadsheet([sheet]);
  const result = sandbox.getPdfsBySendDate_(ss, '2099-01-01', '');
  assert.strictEqual(result.length, 0);
});
test('送付日の形式が不正なら空配列を返す', () => {
  const ss = makeFakeSpreadsheet([]);
  assert.strictEqual(sandbox.getPdfsBySendDate_(ss, '', '').length, 0);
  assert.strictEqual(sandbox.getPdfsBySendDate_(ss, '2026/08/10', '').length, 0);
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
