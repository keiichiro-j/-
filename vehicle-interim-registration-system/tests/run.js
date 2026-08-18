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

const capturedMails = [];
const fakeScriptProperties = {};
const fakeTriggers = [];

const sandbox = {
  Utilities: {
    formatDate: formatDateStub,
    getUuid: () => 'uuid-fixed'
  },
  MailApp: {
    sendEmail: (opts) => { capturedMails.push(opts); }
  },
  DriveApp: {
    getFileById: (id) => {
      if (id === 'MISSING_ID') throw new Error('ファイルが見つかりません');
      return { getBlob: () => ({ fileId: id, isFakeBlob: true }) };
    }
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (key) => (key in fakeScriptProperties ? fakeScriptProperties[key] : null),
      setProperty: (key, value) => { fakeScriptProperties[key] = value; },
      deleteProperty: (key) => { delete fakeScriptProperties[key]; }
    })
  },
  ScriptApp: {
    getProjectTriggers: () => fakeTriggers,
    newTrigger: (handlerFunction) => {
      const builder = {
        timeBased: () => builder,
        atHour: () => builder,
        everyDays: () => builder,
        inTimezone: () => builder,
        create: () => {
          const trigger = { getHandlerFunction: () => handlerFunction };
          fakeTriggers.push(trigger);
          return trigger;
        }
      };
      return builder;
    },
    deleteTrigger: (trigger) => {
      const idx = fakeTriggers.indexOf(trigger);
      if (idx !== -1) fakeTriggers.splice(idx, 1);
    }
  },
  Logger: { log: () => {} }
};
vm.createContext(sandbox);

const FILES = ['Constants.gs', 'ValidationService.gs', 'HistoryService.gs', 'TemplateService.gs', 'EmailService.gs', 'SettingsService.gs', 'SetupService.gs'];
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

function baseFormData(docType, overrides) {
  return Object.assign({
    docType: docType,
    company: '岐阜ヤナセ株式会社',
    manager: '戸田 圭市朗',
    sendDate: '2026-08-10',
    sendBatch: '第１便',
    regDate: '2026-08-20',
    hidaRegistration: false,
    isKei: false,
    cancelKind: 'compound'
  }, overrides || {});
}

console.log('== ValidationService: validateFormData_ (certificate) ==');
test('必須項目・明細が揃っていればエラーなし', () => {
  const formData = baseFormData('certificate', {
    items: [{ regNumber: '岐阜330 あ 1234', regClass: '登録証明' }]
  });
  assert.strictEqual(sandbox.validateFormData_(formData).length, 0);
});
test('登録日が空ならエラー', () => {
  const errors = sandbox.validateFormData_(baseFormData('certificate', {
    regDate: '', items: [{ regNumber: '1234', regClass: '登録証明' }]
  }));
  assert.ok(errors.some((e) => e.includes('登録日')));
});
test('登録区分が未選択ならエラー', () => {
  const errors = sandbox.validateFormData_(baseFormData('certificate', {
    items: [{ regNumber: '1234', regClass: '' }]
  }));
  assert.ok(errors.some((e) => e.includes('登録区分')));
});
test('明細が1件も無ければエラー', () => {
  const errors = sandbox.validateFormData_(baseFormData('certificate', { items: [] }));
  assert.ok(errors.some((e) => e.includes('明細を1件以上')));
});

console.log('== ValidationService: validateFormData_ (transfer) ==');
test('必須項目が揃っていればエラーなし', () => {
  const formData = baseFormData('transfer', {
    items: [{ regNumber: '岐阜330 あ 1234', chassis: '5678', transferClass: 'T移転', stamp: '1000' }]
  });
  assert.strictEqual(sandbox.validateFormData_(formData).length, 0);
});
test('車台番号が4桁数字でなければエラー', () => {
  const errors = sandbox.validateFormData_(baseFormData('transfer', {
    items: [{ regNumber: '1234', chassis: '56A8', transferClass: 'T移転' }]
  }));
  assert.ok(errors.some((e) => e.includes('車台番号')));
});
test('記載変更・更正に不正な値が入っていればエラー', () => {
  const errors = sandbox.validateFormData_(baseFormData('transfer', {
    items: [{ regNumber: '1234', chassis: '5678', transferClass: 'T移転', correction: '不正な値' }]
  }));
  assert.ok(errors.some((e) => e.includes('記載変更')));
});
test('手数料が負の数ならエラー', () => {
  const errors = sandbox.validateFormData_(baseFormData('transfer', {
    items: [{ regNumber: '1234', chassis: '5678', transferClass: 'T移転', stamp: '-100' }]
  }));
  assert.ok(errors.some((e) => e.includes('印紙')));
});
test('登録番号が空の行は無視される(未入力行はエラー対象外)', () => {
  const formData = baseFormData('transfer', {
    items: [
      { regNumber: '1234', chassis: '5678', transferClass: 'T移転' },
      { regNumber: '', chassis: '', transferClass: '' }
    ]
  });
  assert.strictEqual(sandbox.validateFormData_(formData).length, 0);
});

console.log('== ValidationService: validateFormData_ (cancellation) ==');
test('必須項目が揃っていればエラーなし', () => {
  const formData = baseFormData('cancellation', {
    items: [{ regNumber: '1234', chassis: '5678', cancelClass: '抹消' }]
  });
  assert.strictEqual(sandbox.validateFormData_(formData).length, 0);
});
test('登録区分が9択の候補外ならエラー', () => {
  const errors = sandbox.validateFormData_(baseFormData('cancellation', {
    items: [{ regNumber: '1234', chassis: '5678', cancelClass: '不正区分' }]
  }));
  assert.ok(errors.some((e) => e.includes('登録区分')));
});

console.log('== ValidationService: validateFormData_ (plateChange) ==');
test('必須項目が揃っていればエラーなし(代行料・印紙は自由記述のため未入力でもOK)', () => {
  const formData = baseFormData('plateChange', {
    items: [{ oldRegNumber: '岐阜300 あ 1111', chassis: '5678', newRegNumber: '岐阜300 あ 2222' }]
  });
  assert.strictEqual(sandbox.validateFormData_(formData).length, 0);
});
test('旧登録番号が空の行は無視される(getActiveItems_のキーがoldRegNumber)', () => {
  const formData = baseFormData('plateChange', {
    items: [{ oldRegNumber: '', chassis: '', newRegNumber: '' }]
  });
  const errors = sandbox.validateFormData_(formData);
  assert.ok(errors.some((e) => e.includes('明細を1件以上')));
});
test('新登録番号が未入力ならエラー', () => {
  const errors = sandbox.validateFormData_(baseFormData('plateChange', {
    items: [{ oldRegNumber: '1111', chassis: '5678', newRegNumber: '' }]
  }));
  assert.ok(errors.some((e) => e.includes('新登録番号')));
});

console.log('== ValidationService: getActiveItems_ / toNonNegativeInt_ ==');
test('getActiveItems_はplateChangeのときoldRegNumberキーで判定する', () => {
  const items = sandbox.getActiveItems_('plateChange', [{ oldRegNumber: '1111' }, { oldRegNumber: '' }]);
  assert.strictEqual(items.length, 1);
});
test('toNonNegativeInt_は空欄なら空文字を返す(0ではない)', () => {
  assert.strictEqual(sandbox.toNonNegativeInt_(''), '');
  assert.strictEqual(sandbox.toNonNegativeInt_('1500'), 1500);
});

console.log('== HistoryService: resolveHistoryTabName_ ==');
test('有効な登録日はyyyy-MM形式のタブ名になる', () => {
  assert.strictEqual(sandbox.resolveHistoryTabName_('2026-08-20'), '2026-08');
});
test('登録日が空/不正なら登録日未定タブになる', () => {
  assert.strictEqual(sandbox.resolveHistoryTabName_(''), sandbox.HISTORY_PENDING_TAB_NAME);
  assert.strictEqual(sandbox.resolveHistoryTabName_('不正な日付'), sandbox.HISTORY_PENDING_TAB_NAME);
});

console.log('== HistoryService: appendHistoryRow_ ==');

// insertSheet/appendRow に対応した書き込み可能なフェイクスプレッドシート
function makeWritableSpreadsheet(existingSheets) {
  const byName = {};
  (existingSheets || []).forEach((s) => { byName[s.getName()] = s; });
  return {
    getSheetByName: (name) => byName[name] || null,
    getSheets: () => Object.keys(byName).map((n) => byName[n]),
    insertSheet: (name) => {
      const sheet = makeAppendableSheet(name);
      byName[name] = sheet;
      return sheet;
    }
  };
}
function makeAppendableSheet(name) {
  const rows = [];
  let frozen = 0;
  return {
    getName: () => name,
    getLastRow: () => rows.length,
    getRange: (r, c, numRows, numCols) => ({
      getValues: () => {
        numRows = numRows || 1; numCols = numCols || 1;
        const out = [];
        for (let i = 0; i < numRows; i++) {
          const rowOut = [];
          for (let j = 0; j < numCols; j++) rowOut.push((rows[r - 1 + i] || [])[c - 1 + j]);
          out.push(rowOut);
        }
        return out;
      },
      setValues: (vals) => {
        vals.forEach((rowVals, i) => {
          rows[r - 1 + i] = rows[r - 1 + i] || [];
          rowVals.forEach((v, j) => { rows[r - 1 + i][c - 1 + j] = v; });
        });
      }
    }),
    setFrozenRows: (n) => { frozen = n; },
    appendRow: (row) => { rows.push(row.slice()); },
    _rows: rows
  };
}

test('新規タブが作られ、ヘッダー行が書き込まれる', () => {
  const ss = makeWritableSpreadsheet([]);
  const formData = baseFormData('transfer', { hidaRegistration: false, isKei: false });
  sandbox.appendHistoryRow_(ss, 'transfer', { regNumber: '岐阜1234', chassis: '5678', transferClass: 'T移転', stamp: '1000' }, formData, 'sub-1', 1, new Date(2026, 7, 10, 9, 0), 'https://example.com/a.pdf');
  const sheet = ss.getSheetByName('2026-08');
  assert.ok(sheet, 'タブ「2026-08」が作られていること');
  assert.deepStrictEqual(Array.from(sheet._rows[0]), Array.from(sandbox.HISTORY_HEADER_ROW));
  assert.strictEqual(sheet._rows.length, 2);
});

test('飛騨登録ONの名義変更は バリエーション欄と飛騨登録欄に反映される', () => {
  const ss = makeWritableSpreadsheet([]);
  const formData = baseFormData('transfer', { hidaRegistration: true, isKei: true });
  sandbox.appendHistoryRow_(ss, 'transfer', { regNumber: '岐阜1234', chassis: '5678', transferClass: 'T移転' }, formData, 'sub-2', 1, new Date(2026, 7, 10), 'https://example.com/b.pdf');
  const sheet = ss.getSheetByName('2026-08');
  const h = sandbox.HISTORY_HEADER_ROW;
  const row = sheet._rows[1];
  assert.strictEqual(row[h.indexOf('バリエーション')], '飛騨　軽自動車');
  assert.strictEqual(row[h.indexOf('飛騨登録')], '対象');
});

test('抹消はバリエーション欄に複合抹消/単純抹消が入る', () => {
  const ss = makeWritableSpreadsheet([]);
  const formData = baseFormData('cancellation', { cancelKind: 'simple' });
  sandbox.appendHistoryRow_(ss, 'cancellation', { regNumber: '岐阜1234', chassis: '5678', cancelClass: '抹消' }, formData, 'sub-3', 1, new Date(2026, 7, 10), '');
  const sheet = ss.getSheetByName('2026-08');
  const h = sandbox.HISTORY_HEADER_ROW;
  assert.strictEqual(sheet._rows[1][h.indexOf('バリエーション')], '単純抹消');
});

test('番号変更は代行料欄に item.agencyFee がそのまま入る(自由記述)', () => {
  const ss = makeWritableSpreadsheet([]);
  const formData = baseFormData('plateChange');
  sandbox.appendHistoryRow_(ss, 'plateChange', { oldRegNumber: '1111', chassis: '5678', newRegNumber: '2222', agencyFee: '550円' }, formData, 'sub-4', 1, new Date(2026, 7, 10), '');
  const sheet = ss.getSheetByName('2026-08');
  const h = sandbox.HISTORY_HEADER_ROW;
  const row = sheet._rows[1];
  assert.strictEqual(row[h.indexOf('代行料')], '550円');
  assert.strictEqual(row[h.indexOf('新登録番号')], '2222');
});

test('登録日が空(未定)なら「登録日未定」タブへ記録される', () => {
  const ss = makeWritableSpreadsheet([]);
  const formData = baseFormData('certificate', { regDate: '' });
  sandbox.appendHistoryRow_(ss, 'certificate', { regNumber: '1234', regClass: '登録証明' }, formData, 'sub-5', 1, new Date(2026, 7, 10), '');
  assert.ok(ss.getSheetByName(sandbox.HISTORY_PENDING_TAB_NAME));
});

console.log('== HistoryService: getHistoryEntriesByDateRange_ / cancelSubmission_ / getPdfsBySendDateRange_ ==');

function makeReadOnlySheet(name, dataRows) {
  return {
    getName: () => name,
    getLastRow: () => dataRows.length + 1,
    getRange: (r, c, numRows, numCols) => ({ getValues: () => dataRows })
  };
}
function makeReadOnlySpreadsheet(sheets) {
  const byName = {};
  sheets.forEach((s) => { byName[s.getName()] = s; });
  return { getSheets: () => sheets, getSheetByName: (name) => byName[name] || null };
}
function makeFullHistoryRow(overrides) {
  const h = sandbox.HISTORY_HEADER_ROW;
  const o = Object.assign({
    sentAt: new Date(2026, 7, 10, 9, 0),
    submissionId: 'uuid-x',
    docType: '名義変更',
    variant: '',
    company: '岐阜ヤナセ株式会社',
    manager: '戸田 圭市朗',
    regDate: new Date(2026, 7, 10),
    sendDate: new Date(2026, 7, 10),
    sendBatch: '第１便',
    itemNo: 1,
    regNumber: '岐阜1234',
    newRegNumber: '',
    pdfUrl: 'https://drive.google.com/file/d/FAKE_ID/view',
    status: sandbox.SUBMISSION_STATUS_ACTIVE
  }, overrides || {});
  const row = new Array(h.length).fill('');
  row[h.indexOf('送信日時')] = o.sentAt;
  row[h.indexOf('submissionId')] = o.submissionId;
  row[h.indexOf('書類種別')] = o.docType;
  row[h.indexOf('バリエーション')] = o.variant;
  row[h.indexOf('依頼会社名')] = o.company;
  row[h.indexOf('担当責任者')] = o.manager;
  row[h.indexOf('登録日')] = o.regDate;
  row[h.indexOf('送付日')] = o.sendDate;
  row[h.indexOf('送付便')] = o.sendBatch;
  row[h.indexOf('明細No.')] = o.itemNo;
  row[h.indexOf('登録番号')] = o.regNumber;
  row[h.indexOf('新登録番号')] = o.newRegNumber;
  row[h.indexOf('送付書PDF')] = o.pdfUrl;
  row[h.indexOf('状態')] = o.status;
  return row;
}

test('登録日の期間指定で新しい順に集められる', () => {
  const ss = makeReadOnlySpreadsheet([
    makeReadOnlySheet('2026-08', [
      makeFullHistoryRow({ sentAt: new Date(2026, 7, 5, 9, 0), regDate: new Date(2026, 7, 5), regNumber: '先' }),
      makeFullHistoryRow({ sentAt: new Date(2026, 7, 20, 9, 0), regDate: new Date(2026, 7, 20), regNumber: '後' })
    ]),
    makeReadOnlySheet(sandbox.HISTORY_PENDING_TAB_NAME, [])
  ]);
  const result = sandbox.getHistoryEntriesByDateRange_(ss, '2026-08-01', '2026-08-31', false);
  const regCol = sandbox.HISTORY_HEADER_ROW.indexOf('登録番号');
  const names = Array.from(result.rows, (r) => r[regCol]);
  assert.deepStrictEqual(names, ['後', '先']);
});

test('cancelSubmission_は該当submissionIdの状態列・取消日時列を更新する', () => {
  const h = sandbox.HISTORY_HEADER_ROW;
  const headerRow = h.slice();
  const dataRow = makeFullHistoryRow({ submissionId: 'target-id' });
  const sheet = {
    getName: () => '2026-08',
    getLastRow: () => 2,
    getRange: (r, c, numRows, numCols) => {
      if (c === h.indexOf('submissionId') + 1 && numRows === 1) {
        return { getValues: () => [[dataRow[h.indexOf('submissionId')]]] };
      }
      return {
        setValue: (v) => { dataRow[c - 1] = v; }
      };
    }
  };
  const ss = makeReadOnlySpreadsheet([sheet]);
  const updated = sandbox.cancelSubmission_(ss, 'target-id');
  assert.strictEqual(updated, 1);
  assert.strictEqual(dataRow[h.indexOf('状態')], sandbox.SUBMISSION_STATUS_CANCELLED);
});

test('getPdfsBySendDateRange_はsubmissionIdごとに1件へ集約し、登録番号/新登録番号をregNumbersへ集める', () => {
  const ss = makeReadOnlySpreadsheet([
    makeReadOnlySheet('2026-08', [
      makeFullHistoryRow({ submissionId: 'grp-1', itemNo: 1, regNumber: '1234', sendDate: new Date(2026, 7, 10) }),
      makeFullHistoryRow({ submissionId: 'grp-1', itemNo: 2, regNumber: '5678', sendDate: new Date(2026, 7, 10) }),
      makeFullHistoryRow({ submissionId: 'grp-2', itemNo: 1, regNumber: '', newRegNumber: '9999', docType: '番号変更', sendDate: new Date(2026, 7, 10) })
    ])
  ]);
  const list = sandbox.getPdfsBySendDateRange_(ss, '2026-08-10', '2026-08-10', '');
  assert.strictEqual(list.length, 2);
  // getHistoryEntries_は「新しい登録が先頭」になるようタブ内の行を逆順で返すため、
  // 後から追記した明細(5678)が先に集約される。
  const grp1 = list.find((x) => x.submissionId === 'grp-1');
  assert.strictEqual(grp1.itemCount, 2);
  assert.deepStrictEqual(Array.from(grp1.regNumbers), ['5678', '1234']);
  const grp2 = list.find((x) => x.submissionId === 'grp-2');
  assert.deepStrictEqual(Array.from(grp2.regNumbers), ['9999']);
});

console.log('== SettingsService: normalizeDriveImageUrl_ / saveLogoUrl_ ==');
test('Googleドライブの共有リンクはサムネイルURLに変換される', () => {
  const converted = sandbox.normalizeDriveImageUrl_('https://drive.google.com/file/d/ABC123/view?usp=sharing');
  assert.strictEqual(converted, 'https://drive.google.com/thumbnail?id=ABC123&sz=w1000');
});
test('通常の画像URLはそのまま返る', () => {
  assert.strictEqual(sandbox.normalizeDriveImageUrl_('https://example.com/logo.png'), 'https://example.com/logo.png');
});
test('http(s)以外のURLはsaveLogoUrl_でエラーになる', () => {
  assert.throws(() => sandbox.saveLogoUrl_('javascript:alert(1)'));
});
test('空欄はロゴなし設定として保存できる', () => {
  assert.strictEqual(sandbox.saveLogoUrl_(''), '');
  assert.strictEqual(sandbox.getLogoUrl_(), '');
});

console.log('== SettingsService: 既定値の保存/取得 ==');
test('保存した既定値がトリムされて取得できる', () => {
  sandbox.saveDefaultFormValues_({ company: '  岐阜ヤナセ株式会社  ', manager: ' 戸田 ' });
  const values = sandbox.getDefaultFormValues_();
  assert.strictEqual(values.company, '岐阜ヤナセ株式会社');
  assert.strictEqual(values.manager, '戸田');
});

console.log('== EmailService: メールアドレス検証 ==');
test('validateMailRecipients_は不正な形式でエラー', () => {
  assert.throws(() => sandbox.validateMailRecipients_(['not-an-email']));
});
test('validateMailRecipients_は1件も無ければエラー', () => {
  assert.throws(() => sandbox.validateMailRecipients_([]));
});
test('sanitizeMailRecipientsForSave_は空配列を許可する(全削除)', () => {
  assert.deepStrictEqual(sandbox.sanitizeMailRecipientsForSave_([]), []);
});
test('driveFileIdFromUrl_はfile/d/形式のURLからIDを取り出す', () => {
  assert.strictEqual(sandbox.driveFileIdFromUrl_('https://drive.google.com/file/d/XYZ789/view?usp=drivesdk'), 'XYZ789');
});

console.log('== EmailService: 自動送信トリガー ==');
test('宛先が未登録ならONにできない', () => {
  assert.throws(() => sandbox.setDailyMailTriggerEnabled_(true));
});
test('宛先を保存すればONにでき、状態取得にも反映される', () => {
  sandbox.saveMailRecipients_(['a@example.com']);
  const enabled = sandbox.setDailyMailTriggerEnabled_(true);
  assert.strictEqual(enabled, true);
  assert.strictEqual(sandbox.isDailyMailTriggerEnabled_(), true);
});
test('OFFにすればトリガーが削除される', () => {
  const enabled = sandbox.setDailyMailTriggerEnabled_(false);
  assert.strictEqual(enabled, false);
  assert.strictEqual(sandbox.isDailyMailTriggerEnabled_(), false);
});

console.log('== TemplateService: formatDateJp_ / buildPdfFileName_ ==');
test('formatDateJp_は yyyy年MM月dd日 形式に整形する', () => {
  assert.strictEqual(sandbox.formatDateJp_('2026-08-20'), '2026年08月20日');
});
test('formatDateJp_は不正な日付なら空文字を返す', () => {
  assert.strictEqual(sandbox.formatDateJp_(''), '');
});
test('buildPdfFileName_は書類種別ラベル・会社名・タイムスタンプを含む', () => {
  const name = sandbox.buildPdfFileName_('transfer', '岐阜ヤナセ株式会社', new Date(2026, 7, 20, 9, 30, 0));
  assert.strictEqual(name, '名義変更_岐阜ヤナセ株式会社_20260820_093000.pdf');
});
test('buildPdfFileName_は会社名に含まれる禁則文字をアンダースコアへ置換する', () => {
  const name = sandbox.buildPdfFileName_('certificate', 'A/B:C', new Date(2026, 7, 20, 9, 30, 0));
  assert.ok(name.indexOf('A_B_C') !== -1);
});

console.log('== TemplateService: writeItemRows_ / writeVariantBadge_ (フェイクシート) ==');

// getRange(row,col) 単体呼び出しのみに対応した最小フェイクシート(セル単位のMapで保持)
function makeCellSheet() {
  const cells = {};
  return {
    getRange: (row, col) => {
      const key = row + ',' + col;
      return {
        setValue: (v) => { cells[key] = { value: v, bg: (cells[key] || {}).bg, color: (cells[key] || {}).color }; },
        setBackground: (bg) => { cells[key] = Object.assign(cells[key] || {}, { bg: bg }); },
        setFontColor: (c) => { cells[key] = Object.assign(cells[key] || {}, { color: c }); }
      };
    },
    cellValue: (row, col) => (cells[row + ',' + col] || {}).value,
    cellBg: (row, col) => (cells[row + ',' + col] || {}).bg
  };
}

test('writeItemRows_(plateChange)は代行料・印紙が未入力なら既定値を印字する', () => {
  const sheet = makeCellSheet();
  sandbox.writeItemRows_(sheet, 'plateChange', [{ oldRegNumber: '1111', chassis: '5678', newRegNumber: '2222', agencyFee: '', stamp: '' }]);
  const columns = sandbox.VEHICLE_COLUMNS.plateChange;
  const row = sandbox.COMMON_CELLS.vehicleStartRow;
  assert.strictEqual(sheet.cellValue(row, columns.agencyFee), sandbox.PLATE_CHANGE_DEFAULT_AGENCY_FEE);
  assert.strictEqual(sheet.cellValue(row, columns.stamp), sandbox.PLATE_CHANGE_DEFAULT_STAMP);
});

test('writeItemRows_(transfer)は手数料欄を数値として書き込む', () => {
  const sheet = makeCellSheet();
  sandbox.writeItemRows_(sheet, 'transfer', [{ regNumber: '1234', chassis: '5678', transferClass: 'T移転', stamp: '1000', plateFee: '' }]);
  const columns = sandbox.VEHICLE_COLUMNS.transfer;
  const row = sandbox.COMMON_CELLS.vehicleStartRow;
  assert.strictEqual(sheet.cellValue(row, columns.stamp), 1000);
  assert.strictEqual(sheet.cellValue(row, columns.plateFee), '');
});

test('writeVariantBadge_は飛騨登録ONのときだけHIDA_BADGE_COLORで塗る', () => {
  const sheet = makeCellSheet();
  const maxCol = sandbox.maxColumnOf_(sandbox.VEHICLE_COLUMNS.transfer);
  sandbox.writeVariantBadge_(sheet, 'transfer', { hidaRegistration: true, isKei: false }, maxCol);
  assert.strictEqual(sheet.cellValue(sandbox.COMMON_CELLS.variantBadgeRow, maxCol), '飛騨');
  assert.strictEqual(sheet.cellBg(sandbox.COMMON_CELLS.variantBadgeRow, maxCol), sandbox.HIDA_BADGE_COLOR.bg);
});

test('writeVariantBadge_は飛騨登録OFFなら背景をリセットする', () => {
  const sheet = makeCellSheet();
  const maxCol = sandbox.maxColumnOf_(sandbox.VEHICLE_COLUMNS.transfer);
  sandbox.writeVariantBadge_(sheet, 'transfer', { hidaRegistration: false, isKei: true }, maxCol);
  assert.strictEqual(sheet.cellValue(sandbox.COMMON_CELLS.variantBadgeRow, maxCol), '軽自動車');
  assert.strictEqual(sheet.cellBg(sandbox.COMMON_CELLS.variantBadgeRow, maxCol), null);
});

console.log('\n== 結果: ' + pass + ' passed, ' + fail + ' failed ==');
if (fail > 0) process.exit(1);
