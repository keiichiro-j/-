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
    M: date.getMonth() + 1,
    dd: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds())
  };
  // 'MM'は'M'より先に判定させる(regex内の順序に依存)。
  return pattern.replace(/yyyy|MM|M|dd|HH|mm|ss/g, (token) => map[token]);
}

const capturedMails = [];
const fakeScriptProperties = {};
const fakeUserProperties = {}; // getThemePreference_/saveThemePreference_用
const fakeTriggers = [];
const fakeExternalSpreadsheets = {}; // id -> フェイクSpreadsheetオブジェクト(ExternalSyncService.gs用)

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
  SpreadsheetApp: {
    BorderStyle: { SOLID: 'SOLID' },
    openById: (id) => {
      if (!(id in fakeExternalSpreadsheets)) throw new Error('スプレッドシートを開けませんでした: ' + id);
      return fakeExternalSpreadsheets[id];
    }
  },
  // getManagerForCurrentUser_/getCurrentUserEmail_用。テストごとに currentUserEmail を
  // 書き換えてログイン状態を模する。
  Session: {
    getActiveUser: () => ({ getEmail: () => sandbox.currentUserEmail || '' })
  },
  currentUserEmail: '',
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (key) => (key in fakeScriptProperties ? fakeScriptProperties[key] : null),
      setProperty: (key, value) => { fakeScriptProperties[key] = value; },
      deleteProperty: (key) => { delete fakeScriptProperties[key]; }
    }),
    // テーマ設定(getThemePreference_/saveThemePreference_)用。実際はGoogleアカウントごとに
    // 独立したストレージだが、テストでは fakeUserProperties を都度クリアして模擬する。
    getUserProperties: () => ({
      getProperty: (key) => (key in fakeUserProperties ? fakeUserProperties[key] : null),
      setProperty: (key, value) => { fakeUserProperties[key] = value; },
      deleteProperty: (key) => { delete fakeUserProperties[key]; }
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

const FILES = ['Constants.gs', 'ValidationService.gs', 'HistoryService.gs', 'TemplateService.gs', 'EmailService.gs', 'SettingsService.gs', 'SetupService.gs', 'AuthService.gs', 'BrandService.gs', 'ExternalSyncService.gs'];
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
test('登録区分は元データ通り「払出」「先方」も選択できる(7択)', () => {
  const formData = baseFormData('transfer', {
    items: [{ regNumber: '1234', chassis: '5678', transferClass: '払出' }]
  });
  assert.strictEqual(sandbox.validateFormData_(formData).length, 0);
  assert.deepStrictEqual(Array.from(sandbox.TRANSFER_CLASS_OPTIONS), ['T移転', 'W移転', '移転', '変更', '選択', '払出', '先方']);
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

console.log('== Constants: buildVehicleColumnLayout_ / bannerSplit_ (印刷レイアウト) ==');
test('チェックボックス項目は選択肢の数だけ列を使う(certificate: 登録区分3択)', () => {
  const columns = sandbox.VEHICLE_COLUMNS.certificate;
  const spans = sandbox.FIELD_SPANS.certificate;
  // regNumber(1列) → regClass(3列) → remarks(1列)
  assert.strictEqual(columns.regNumber, 2);
  assert.strictEqual(columns.regClass, 3);
  assert.strictEqual(spans.regClass, 3);
  assert.strictEqual(columns.remarks, 6);
  assert.strictEqual(sandbox.VEHICLE_MAX_COL.certificate, 6);
});
test('チェックボックス項目は選択肢の数だけ列を使う(transfer: 登録区分7択+記載変更・更正2択)', () => {
  const columns = sandbox.VEHICLE_COLUMNS.transfer;
  const spans = sandbox.FIELD_SPANS.transfer;
  assert.strictEqual(spans.transferClass, 7);
  assert.strictEqual(spans.correction, 2);
  assert.strictEqual(columns.correction, columns.transferClass + 7);
  assert.strictEqual(columns.stamp, columns.correction + 2);
});
test('チェックボックスを持たないファミリー(番号変更)は列を追加しない', () => {
  const columns = sandbox.VEHICLE_COLUMNS.plateChange;
  assert.strictEqual(columns.oldRegNumber, 2);
  assert.strictEqual(columns.chassis, 3);
  assert.strictEqual(columns.newRegNumber, 4);
  assert.strictEqual(columns.agencyFee, 5);
  assert.strictEqual(columns.stamp, 6);
  assert.strictEqual(sandbox.VEHICLE_MAX_COL.plateChange, 6);
});
test('bannerSplit_は左右をできるだけ均等に割り付ける(狭い明細欄でも1列以上を確保する)', () => {
  const split = sandbox.bannerSplit_(6);
  assert.strictEqual(split.leftValueCol, 2);
  assert.ok(split.leftValueSpan >= 1);
  assert.ok(split.rightLabelCol > split.leftValueCol);
  assert.strictEqual(split.rightValueCol + split.rightValueSpan - 1, 6);
});
test('bannerSplit_は明細欄が広いファミリーでも右端に収まる', () => {
  const maxCol = sandbox.VEHICLE_MAX_COL.transfer;
  const split = sandbox.bannerSplit_(maxCol);
  assert.strictEqual(split.rightValueCol + split.rightValueSpan - 1, maxCol);
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

console.log('== SettingsService: 起動画面(ローディング画面)の画像URL ==');
test('Googleドライブの共有リンクはサムネイルURLに変換されて保存・取得できる', () => {
  const saved = sandbox.saveLoadingImageUrl_('https://drive.google.com/file/d/XYZ999/view?usp=sharing');
  assert.strictEqual(saved, 'https://drive.google.com/thumbnail?id=XYZ999&sz=w1000');
  assert.strictEqual(sandbox.getLoadingImageUrl_(), saved);
});
test('http(s)以外のURLはsaveLoadingImageUrl_でエラーになる', () => {
  assert.throws(() => sandbox.saveLoadingImageUrl_('javascript:alert(1)'));
});
test('空欄は起動画面画像なし設定として保存できる', () => {
  assert.strictEqual(sandbox.saveLoadingImageUrl_(''), '');
  assert.strictEqual(sandbox.getLoadingImageUrl_(), '');
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
      const self = {
        setValue: (v) => { cells[key] = Object.assign(cells[key] || {}, { value: v }); return self; },
        setBackground: (bg) => { cells[key] = Object.assign(cells[key] || {}, { bg: bg }); return self; },
        setFontColor: (c) => { cells[key] = Object.assign(cells[key] || {}, { color: c }); return self; },
        setFontSize: () => self,
        setFontWeight: () => self,
        setWrap: () => self
      };
      return self;
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

test('writeItemRows_(transfer)は登録区分をチェックボックス形式で書く(選択した列だけ〇)', () => {
  const sheet = makeCellSheet();
  sandbox.writeItemRows_(sheet, 'transfer', [{ regNumber: '1234', chassis: '5678', transferClass: '払出' }]);
  const columns = sandbox.VEHICLE_COLUMNS.transfer;
  const row = sandbox.COMMON_CELLS.vehicleStartRow;
  const optionIndex = sandbox.TRANSFER_CLASS_OPTIONS.indexOf('払出');
  sandbox.TRANSFER_CLASS_OPTIONS.forEach((opt, i) => {
    const expected = i === optionIndex ? sandbox.CHECKBOX_MARK : '';
    assert.strictEqual(sheet.cellValue(row, columns.transferClass + i), expected, opt + '列');
  });
});

test('writeItemRows_(cancellation)は登録区分・記載変更どちらも未選択なら全列が空欄', () => {
  const sheet = makeCellSheet();
  sandbox.writeItemRows_(sheet, 'cancellation', [{ regNumber: '1234', chassis: '5678', cancelClass: '' }]);
  const columns = sandbox.VEHICLE_COLUMNS.cancellation;
  const row = sandbox.COMMON_CELLS.vehicleStartRow;
  sandbox.CANCELLATION_CLASS_OPTIONS.forEach((opt, i) => {
    assert.strictEqual(sheet.cellValue(row, columns.cancelClass + i), '');
  });
});

test('writeCommonFields_は送付日・送付便を1つの欄にまとめて印字する', () => {
  const sheet = makeCellSheet();
  const formData = { sendDate: '2026-08-20', sendBatch: '第２便', regDate: '2026-08-25', company: '岐阜ヤナセ株式会社', manager: '戸田', hidaRegistration: false, isKei: false };
  sandbox.writeCommonFields_(sheet, 'transfer', formData);
  const split = sandbox.bannerSplit_(sandbox.VEHICLE_MAX_COL.transfer);
  assert.strictEqual(sheet.cellValue(sandbox.COMMON_CELLS.sendRow, split.leftValueCol), '2026年08月20日　第２便');
  assert.strictEqual(sheet.cellValue(sandbox.COMMON_CELLS.sendRow, split.rightValueCol), '岐阜ヤナセ株式会社');
  assert.strictEqual(sheet.cellValue(sandbox.COMMON_CELLS.regRow, split.leftValueCol), '2026年08月25日');
  assert.strictEqual(sheet.cellValue(sandbox.COMMON_CELLS.regRow, split.rightValueCol), '戸田');
});

test('writeVariantBadge_は飛騨登録ONのときだけHIDA_BADGE_COLORで塗る', () => {
  const sheet = makeCellSheet();
  const maxCol = sandbox.maxColumnOf_('transfer');
  sandbox.writeVariantBadge_(sheet, 'transfer', { hidaRegistration: true, isKei: false }, maxCol);
  assert.strictEqual(sheet.cellValue(sandbox.COMMON_CELLS.variantBadgeRow, maxCol), '飛騨');
  assert.strictEqual(sheet.cellBg(sandbox.COMMON_CELLS.variantBadgeRow, maxCol), sandbox.HIDA_BADGE_COLOR.bg);
});

console.log('== SetupService: buildTemplateSheet_ (フェイクシート、実際の生成処理を一通り流す) ==');

// SetupService.gs のスタイル系メソッド(merge/setFontFamily/setBorder等)を全て no-op で
// 受け止められる、書き込み値だけをセルごとに記録するフェイクシート。
// 以前、buildTitleBanner_ がスタイルは設定するのに setValue を呼び忘れて
// タイトル/発行元が空欄のまま印刷される不具合があったため、この一連の処理を
// 実際に最後まで実行して検証できるようにしてある。
function makeStyleableSheet() {
  const cells = {};
  let maxColumns = 26;
  const chain = (extra) => Object.assign({
    setValue(v) { extra.value = v; return this; },
    getValue() { return extra.value; },
    merge() { return this; },
    setBackground() { return this; },
    setFontColor() { return this; },
    setFontFamily() { return this; },
    setFontSize() { return this; },
    setFontWeight() { return this; },
    setHorizontalAlignment() { return this; },
    setVerticalAlignment() { return this; },
    setWrap() { return this; },
    setBorder() { return this; },
    setFormula() { return this; },
    getNumColumns() { return extra.numColumns || 1; }
  }, extra);
  return {
    clear() {},
    getMaxColumns: () => maxColumns,
    insertColumnsAfter: (after, count) => { maxColumns = after + count; },
    getRange(r, c, numRows, numCols) {
      const key = r + ',' + c;
      if (!cells[key]) cells[key] = { value: '', numColumns: numCols || 1 };
      return chain(cells[key]);
    },
    setRowHeight() {},
    setColumnWidth() {},
    setFrozenRows() {},
    setHiddenGridlines() {},
    cellValue: (r, c) => (cells[r + ',' + c] || {}).value
  };
}

DOC_TYPE_OPTIONS_FOR_TEST().forEach((docType) => {
  test('buildTemplateSheet_(' + docType + ')はタイトル・発行元を書き込む(例外を投げず最後まで実行できる)', () => {
    const sheet = makeStyleableSheet();
    sandbox.buildTemplateSheet_(sheet, docType);
    assert.strictEqual(sheet.cellValue(sandbox.COMMON_CELLS.titleRow, 1), sandbox.DOC_TYPE_TITLES[docType]);
    assert.strictEqual(sheet.cellValue(sandbox.COMMON_CELLS.issuerRow, 1), sandbox.ISSUER_NAME);
  });
});

function DOC_TYPE_OPTIONS_FOR_TEST() {
  return Array.from(sandbox.DOC_TYPE_OPTIONS);
}

test('writeVariantBadge_は軽自動車のときKEI_BADGE_COLOR(ナンバープレートと同じ黄色)で塗る', () => {
  const sheet = makeCellSheet();
  const maxCol = sandbox.maxColumnOf_('transfer');
  sandbox.writeVariantBadge_(sheet, 'transfer', { hidaRegistration: false, isKei: true }, maxCol);
  assert.strictEqual(sheet.cellValue(sandbox.COMMON_CELLS.variantBadgeRow, maxCol), '軽自動車');
  assert.strictEqual(sheet.cellBg(sandbox.COMMON_CELLS.variantBadgeRow, maxCol), sandbox.KEI_BADGE_COLOR.bg);
});

test('writeVariantBadge_は抹消でも軽自動車ならKEI_BADGE_COLORで塗る', () => {
  const sheet = makeCellSheet();
  const maxCol = sandbox.maxColumnOf_('cancellation');
  sandbox.writeVariantBadge_(sheet, 'cancellation', { cancelKind: 'simple', isKei: true }, maxCol);
  assert.strictEqual(sheet.cellValue(sandbox.COMMON_CELLS.variantBadgeRow, maxCol), '単純抹消　軽自動車');
  assert.strictEqual(sheet.cellBg(sandbox.COMMON_CELLS.variantBadgeRow, maxCol), sandbox.KEI_BADGE_COLOR.bg);
});

test('writeVariantBadge_は飛騨登録・軽自動車どちらもONなら飛騨登録の色を優先する', () => {
  const sheet = makeCellSheet();
  const maxCol = sandbox.maxColumnOf_('transfer');
  sandbox.writeVariantBadge_(sheet, 'transfer', { hidaRegistration: true, isKei: true }, maxCol);
  assert.strictEqual(sheet.cellValue(sandbox.COMMON_CELLS.variantBadgeRow, maxCol), '飛騨　軽自動車');
  assert.strictEqual(sheet.cellBg(sandbox.COMMON_CELLS.variantBadgeRow, maxCol), sandbox.HIDA_BADGE_COLOR.bg);
});

test('writeVariantBadge_はどちらもOFFなら背景をリセットする', () => {
  const sheet = makeCellSheet();
  const maxCol = sandbox.maxColumnOf_('transfer');
  sandbox.writeVariantBadge_(sheet, 'transfer', { hidaRegistration: false, isKei: false }, maxCol);
  assert.strictEqual(sheet.cellValue(sandbox.COMMON_CELLS.variantBadgeRow, maxCol), '');
  assert.strictEqual(sheet.cellBg(sandbox.COMMON_CELLS.variantBadgeRow, maxCol), null);
});

console.log('== SettingsService: テーマ設定(Googleアカウントごとに保存) ==');
test('未設定なら空文字を返す', () => {
  delete fakeUserProperties[sandbox.THEME_PREFERENCE_PROP_KEY];
  assert.strictEqual(sandbox.getThemePreference_(), '');
});
test('保存した内容を取得できる', () => {
  const saved = sandbox.saveThemePreference_('navy');
  assert.strictEqual(saved, 'navy');
  assert.strictEqual(sandbox.getThemePreference_(), 'navy');
});
test('不正な値は保存できずエラーになる', () => {
  assert.throws(() => sandbox.saveThemePreference_('not-a-theme'), /不正なテーマ/);
});

console.log('== SettingsService: 担当者マスタ ==');
test('未設定なら空配列を返す', () => {
  delete fakeScriptProperties[sandbox.STAFF_MASTER_PROP_KEY];
  assert.deepStrictEqual(Array.from(sandbox.getStaffMaster_()), []);
});
test('保存した内容を取得できる(メールは小文字化される)', () => {
  const saved = sandbox.saveStaffMaster_([{ name: '山田太郎', email: 'Yamada@Example.com' }]);
  assert.deepStrictEqual(Array.from(saved, (r) => Object.assign({}, r)), [{ name: '山田太郎', email: 'yamada@example.com' }]);
});
test('片方だけ入力されている行はエラーになり保存されない', () => {
  sandbox.saveStaffMaster_([{ name: '既存太郎', email: 'existing@example.com' }]);
  assert.throws(() => sandbox.saveStaffMaster_([{ name: '山田太郎', email: '' }]), /両方入力/);
  assert.strictEqual(sandbox.getStaffMaster_().length, 1); // 変更されない
});
test('メール形式が不正な行はエラーになり保存されない', () => {
  sandbox.saveStaffMaster_([{ name: '既存太郎', email: 'existing@example.com' }]);
  assert.throws(() => sandbox.saveStaffMaster_([{ name: '山田太郎', email: 'not-an-email' }]), /形式が正しくありません/);
});

console.log('== SettingsService: ログインユーザーに対応する担当者名の判定 ==');
test('担当者マスタに一致するアカウントがあれば担当者名を返す', () => {
  sandbox.saveStaffMaster_([{ name: '山田太郎', email: 'yamada@example.com' }]);
  sandbox.currentUserEmail = 'Yamada@Example.com'; // 大文字小文字は区別しない
  assert.strictEqual(sandbox.getManagerForCurrentUser_(), '山田太郎');
});
test('一致するアカウントがなければ空文字を返す(新車新規登録依頼書 発行システムと異なり、既に' +
  '「申請フォームの既定値」機能があるため、メールアドレス自体は返さずフォールバックに任せる)', () => {
  sandbox.saveStaffMaster_([{ name: '山田太郎', email: 'yamada@example.com' }]);
  sandbox.currentUserEmail = 'unknown@example.com';
  assert.strictEqual(sandbox.getManagerForCurrentUser_(), '');
});
test('ログインアカウントを取得できない場合も空文字を返す(エラーにしない)', () => {
  sandbox.saveStaffMaster_([{ name: '山田太郎', email: 'yamada@example.com' }]);
  sandbox.currentUserEmail = '';
  assert.strictEqual(sandbox.getManagerForCurrentUser_(), '');
});
test('getCurrentUserEmail_はログイン中のアカウントをそのまま返す', () => {
  sandbox.currentUserEmail = 'yamada@example.com';
  assert.strictEqual(sandbox.getCurrentUserEmail_(), 'yamada@example.com');
});
test('getCurrentUserEmail_はアカウントを取得できない場合は空文字を返す', () => {
  sandbox.currentUserEmail = '';
  assert.strictEqual(sandbox.getCurrentUserEmail_(), '');
});

console.log('== AuthService: 権限者判定 ==');
test('AUTHORIZED_ADMIN_EMAILS_は初期状態では空(誰も権限者ではない)', () => {
  assert.strictEqual(sandbox.AUTHORIZED_ADMIN_EMAILS_.length, 0);
});
test('権限者リストに含まれるアカウントはisAuthorizedAdmin_がtrueを返す', () => {
  sandbox.AUTHORIZED_ADMIN_EMAILS_.push('admin@example.com');
  try {
    sandbox.currentUserEmail = 'admin@example.com';
    assert.strictEqual(sandbox.isAuthorizedAdmin_(), true);
  } finally {
    sandbox.AUTHORIZED_ADMIN_EMAILS_.length = 0;
  }
});
test('大文字小文字・前後の空白が違っても同一メールアドレスとみなす', () => {
  sandbox.AUTHORIZED_ADMIN_EMAILS_.push(' Admin@Example.com ');
  try {
    sandbox.currentUserEmail = 'admin@example.com';
    assert.strictEqual(sandbox.isAuthorizedAdmin_(), true);
  } finally {
    sandbox.AUTHORIZED_ADMIN_EMAILS_.length = 0;
  }
});
test('権限者リストに含まれないアカウントはisAuthorizedAdmin_がfalseを返す', () => {
  sandbox.AUTHORIZED_ADMIN_EMAILS_.push('admin@example.com');
  try {
    sandbox.currentUserEmail = 'other@example.com';
    assert.strictEqual(sandbox.isAuthorizedAdmin_(), false);
  } finally {
    sandbox.AUTHORIZED_ADMIN_EMAILS_.length = 0;
  }
});
test('assertAuthorizedAdmin_は権限者なら何もしない', () => {
  sandbox.AUTHORIZED_ADMIN_EMAILS_.push('admin@example.com');
  try {
    sandbox.currentUserEmail = 'admin@example.com';
    assert.doesNotThrow(() => sandbox.assertAuthorizedAdmin_());
  } finally {
    sandbox.AUTHORIZED_ADMIN_EMAILS_.length = 0;
  }
});
test('assertAuthorizedAdmin_は権限者でなければ例外を投げる', () => {
  sandbox.currentUserEmail = 'other@example.com';
  assert.throws(() => sandbox.assertAuthorizedAdmin_(), /権限がありません/);
});

console.log('== BrandService: ブランドコード設定 ==');
test('未設定なら初期値(MB, AU)を返す', () => {
  delete fakeScriptProperties[sandbox.BRAND_OPTIONS_PROP_KEY];
  assert.deepStrictEqual(Array.from(sandbox.getBrandOptions_()), ['MB', 'AU']);
});
test('保存した内容を取得できる(重複・空欄は除去)', () => {
  const saved = sandbox.saveBrandOptions_(['MB', '', 'MB', 'AUDI']);
  assert.deepStrictEqual(Array.from(saved), ['MB', 'AUDI']);
  assert.deepStrictEqual(Array.from(sandbox.getBrandOptions_()), ['MB', 'AUDI']);
});
test('1件も残らない場合はエラーになり保存されない', () => {
  sandbox.saveBrandOptions_(['MB']);
  assert.throws(() => sandbox.saveBrandOptions_(['', '  ']), /1つ以上登録/);
  assert.deepStrictEqual(Array.from(sandbox.getBrandOptions_()), ['MB']); // 変更されない
});

console.log('== ExternalSyncService: 備考欄からの使用者名・ブランドの分解(parseTransferRemarks_) ==');
test('末尾のブランドコードと使用者名を分解する', () => {
  sandbox.saveBrandOptions_(['MB', 'AU']);
  assert.deepStrictEqual(Object.assign({}, sandbox.parseTransferRemarks_('田中太郎MB')), { name: '田中太郎', brand: 'MB' });
  assert.deepStrictEqual(Object.assign({}, sandbox.parseTransferRemarks_('鈴木花子AU')), { name: '鈴木花子', brand: 'AU' });
});
test('前後の空白は無視する', () => {
  sandbox.saveBrandOptions_(['MB']);
  assert.deepStrictEqual(Object.assign({}, sandbox.parseTransferRemarks_('  田中太郎MB  ')), { name: '田中太郎', brand: 'MB' });
});
test('末尾がどのブランドコードとも一致しない場合はnullを返す(通常のメモ書き等)', () => {
  sandbox.saveBrandOptions_(['MB', 'AU']);
  assert.strictEqual(sandbox.parseTransferRemarks_('要確認メモ'), null);
});
test('空欄・ブランドコードのみ(氏名部分が空)の場合はnullを返す', () => {
  sandbox.saveBrandOptions_(['MB']);
  assert.strictEqual(sandbox.parseTransferRemarks_(''), null);
  assert.strictEqual(sandbox.parseTransferRemarks_('MB'), null);
});
test('複数のブランドコードが末尾として一致しうる場合は最も長く一致するものを優先する', () => {
  sandbox.saveBrandOptions_(['AU', 'AUDI']);
  assert.deepStrictEqual(Object.assign({}, sandbox.parseTransferRemarks_('田中太郎AUDI')), { name: '田中太郎', brand: 'AUDI' });
});

console.log('== ExternalSyncService: ブランド別の転記先スプレッドシートの設定 ==');

// 新車新規登録依頼書 発行システムと同じ列構成(A:ステータス〜G:顧客名)のフェイクSpreadsheet。
// tabs は { タブ名: dataRows(A〜G, ヘッダー除く) } の形。
function makeExternalSheetSpreadsheet(tabs) {
  const header = ['ステータス', '登録予定日', '拠点', '担当者', '車種', 'OSS区分', '顧客名'];
  const sheets = {};
  Object.keys(tabs).forEach((tabName) => {
    sheets[tabName] = makeMutableSheet(tabName, header, tabs[tabName]);
  });
  return { getSheetByName: (name) => sheets[name] || null };
}

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

test('未設定なら空配列を返す', () => {
  delete fakeScriptProperties[sandbox.EXTERNAL_SYNC_SHEETS_PROP_KEY];
  assert.deepStrictEqual(Array.from(sandbox.getExternalSyncSheets_()), []);
});
test('ブランドごとにIDをそのまま保存・取得できる(開けることを確認した上で)', () => {
  fakeExternalSpreadsheets['SHEET_MB'] = makeExternalSheetSpreadsheet({});
  fakeExternalSpreadsheets['SHEET_AU'] = makeExternalSheetSpreadsheet({});
  const saved = sandbox.saveExternalSyncSheets_([
    { brand: 'MB', sheetId: 'SHEET_MB' },
    { brand: 'AU', sheetId: 'SHEET_AU' }
  ]);
  const plain = Array.from(saved, (r) => ({ brand: r.brand, sheetId: r.sheetId }));
  assert.deepStrictEqual(plain, [{ brand: 'MB', sheetId: 'SHEET_MB' }, { brand: 'AU', sheetId: 'SHEET_AU' }]);
});
test('URLで貼り付けてもIDだけ取り出して保存できる', () => {
  fakeExternalSpreadsheets['SHEET_URL'] = makeExternalSheetSpreadsheet({});
  const saved = sandbox.saveExternalSyncSheets_([
    { brand: 'MB', sheetId: 'https://docs.google.com/spreadsheets/d/SHEET_URL/edit?gid=855142272#gid=855142272' }
  ]);
  assert.strictEqual(saved[0].sheetId, 'SHEET_URL');
});
test('開けない(共有されていない・存在しない)IDはエラーになり保存されない', () => {
  fakeExternalSpreadsheets['SHEET_OK'] = makeExternalSheetSpreadsheet({});
  sandbox.saveExternalSyncSheets_([{ brand: 'MB', sheetId: 'SHEET_OK' }]);
  assert.throws(
    () => sandbox.saveExternalSyncSheets_([{ brand: 'MB', sheetId: 'NOT_EXIST_ID' }]),
    /開けませんでした/
  );
  assert.strictEqual(sandbox.getExternalSyncSheets_()[0].sheetId, 'SHEET_OK'); // 変更されない
});
test('同じブランドが複数あるとエラーになる', () => {
  fakeExternalSpreadsheets['SHEET_DUP1'] = makeExternalSheetSpreadsheet({});
  fakeExternalSpreadsheets['SHEET_DUP2'] = makeExternalSheetSpreadsheet({});
  assert.throws(
    () => sandbox.saveExternalSyncSheets_([
      { brand: 'MB', sheetId: 'SHEET_DUP1' },
      { brand: 'MB', sheetId: 'SHEET_DUP2' }
    ]),
    /複数設定されています/
  );
});

console.log('== ExternalSyncService: タブ名の組み立て(中古車用タブに転記する) ==');
test('登録日の年月から "db_登録データ_中古_YYYY_M月" 形式のタブ名を組み立てる(月はゼロ埋めしない)', () => {
  assert.strictEqual(sandbox.externalSyncTabName_(new Date(2026, 9, 2)), 'db_登録データ_中古_2026_10月');
  assert.strictEqual(sandbox.externalSyncTabName_(new Date(2026, 0, 5)), 'db_登録データ_中古_2026_1月');
});

console.log('== ExternalSyncService: 使用者名をキーにしたステータス・登録日・区分の転記 ==');
test('転記先が1件も設定されていなければ何もしない(エラーにしない)', () => {
  delete fakeScriptProperties[sandbox.EXTERNAL_SYNC_SHEETS_PROP_KEY];
  assert.doesNotThrow(() => sandbox.syncRegistrationToExternalSheet_('橋本美咲', new Date(2026, 9, 2), 'MB'));
});
test('使用者名と一致する行のA列(ステータス)・B列(登録予定日)・F列(区分)を更新する(区分は常に"紙登録")', () => {
  const ss = makeExternalSheetSpreadsheet({
    'db_登録データ_中古_2026_10月': [
      ['登録予定日確認中', '', '岐阜', '戸田圭市朗', '', '', '橋本美咲'],
      ['登録予定日確認中', '', '', '', '', '', '山田花子']
    ]
  });
  fakeExternalSpreadsheets['SHEET_MATCH'] = ss;
  sandbox.saveExternalSyncSheets_([{ brand: 'MB', sheetId: 'SHEET_MATCH' }]);

  sandbox.syncRegistrationToExternalSheet_('橋本美咲', new Date(2026, 9, 2), 'MB');

  const sheet = ss.getSheetByName('db_登録データ_中古_2026_10月');
  assert.strictEqual(sheet._rows[1][0], '登録予定日確定'); // A列(1行目はヘッダーなので2行目=配列index1)
  assert.strictEqual(sheet._rows[1][1], '2026-10-02'); // B列
  assert.strictEqual(sheet._rows[1][5], '紙登録'); // F列
  assert.strictEqual(sheet._rows[2][0], '登録予定日確認中'); // 一致しない行は変更されない
});
test('ブランドに対応する転記先が設定されていない場合はエラーになる', () => {
  fakeExternalSpreadsheets['SHEET_MB2'] = makeExternalSheetSpreadsheet({});
  sandbox.saveExternalSyncSheets_([{ brand: 'MB', sheetId: 'SHEET_MB2' }]);
  assert.throws(
    () => sandbox.syncRegistrationToExternalSheet_('橋本美咲', new Date(2026, 9, 2), 'AU'),
    /ブランド「AU」の転記先スプレッドシートが設定されていません/
  );
});
test('対象タブが存在しない場合はエラーになる', () => {
  fakeExternalSpreadsheets['SHEET_NO_TAB'] = makeExternalSheetSpreadsheet({});
  sandbox.saveExternalSyncSheets_([{ brand: 'MB', sheetId: 'SHEET_NO_TAB' }]);
  assert.throws(
    () => sandbox.syncRegistrationToExternalSheet_('橋本美咲', new Date(2026, 9, 2), 'MB'),
    /db_登録データ_中古_2026_10月.*タブが見つかりません/
  );
});
test('使用者名と一致する行が見つからない場合はエラーになる', () => {
  const ss = makeExternalSheetSpreadsheet({
    'db_登録データ_中古_2026_10月': [['', '', '', '', '', '', '別人の名前']]
  });
  fakeExternalSpreadsheets['SHEET_NO_MATCH'] = ss;
  sandbox.saveExternalSyncSheets_([{ brand: 'MB', sheetId: 'SHEET_NO_MATCH' }]);
  assert.throws(
    () => sandbox.syncRegistrationToExternalSheet_('橋本美咲', new Date(2026, 9, 2), 'MB'),
    /一致する行が見つかりませんでした/
  );
});
test('同姓同名が複数行ある場合、まだ確定していない行を優先して更新する', () => {
  const ss = makeExternalSheetSpreadsheet({
    'db_登録データ_中古_2026_10月': [
      ['登録予定日確定', '', '', '', '', '', '橋本美咲'],
      ['登録予定日確認中', '', '', '', '', '', '橋本美咲']
    ]
  });
  fakeExternalSpreadsheets['SHEET_DUP_NAME'] = ss;
  sandbox.saveExternalSyncSheets_([{ brand: 'MB', sheetId: 'SHEET_DUP_NAME' }]);

  sandbox.syncRegistrationToExternalSheet_('橋本美咲', new Date(2026, 9, 2), 'MB');

  const sheet = ss.getSheetByName('db_登録データ_中古_2026_10月');
  assert.strictEqual(sheet._rows[1][0], '登録予定日確定'); // 既に確定済みの1行目は変更されない
  assert.strictEqual(sheet._rows[2][0], '登録予定日確定'); // 未確定だった2行目が更新される
});
test('転記に成功するとtrueを返す', () => {
  const ss = makeExternalSheetSpreadsheet({
    'db_登録データ_中古_2026_10月': [['', '', '', '', '', '', '橋本美咲']]
  });
  fakeExternalSpreadsheets['SHEET_RETURN_TRUE'] = ss;
  sandbox.saveExternalSyncSheets_([{ brand: 'MB', sheetId: 'SHEET_RETURN_TRUE' }]);
  assert.strictEqual(sandbox.syncRegistrationToExternalSheet_('橋本美咲', new Date(2026, 9, 2), 'MB'), true);
});
test('転記先が1件も設定されていない場合はundefinedを返す(成功メッセージを出さないため)', () => {
  delete fakeScriptProperties[sandbox.EXTERNAL_SYNC_SHEETS_PROP_KEY];
  assert.strictEqual(sandbox.syncRegistrationToExternalSheet_('橋本美咲', new Date(2026, 9, 2), 'MB'), undefined);
});

console.log('== ExternalSyncService: 使用者名の表記ゆれ吸収(normalizeCustomerName_) ==');
test('前後・途中のスペース(全角/半角)の有無を無視する', () => {
  assert.strictEqual(sandbox.normalizeCustomerName_('山田 太郎'), sandbox.normalizeCustomerName_('山田太郎'));
  assert.strictEqual(sandbox.normalizeCustomerName_('山田　太郎'), sandbox.normalizeCustomerName_('山田太郎'));
});
test('「株式会社」「(株)」「㈱」「（株）」の表記ゆれを吸収する(位置も問わない)', () => {
  const base = sandbox.normalizeCustomerName_('株式会社高菜');
  assert.strictEqual(sandbox.normalizeCustomerName_('高菜株式会社'), base);
  assert.strictEqual(sandbox.normalizeCustomerName_('（株）高菜'), base);
  assert.strictEqual(sandbox.normalizeCustomerName_('(株)高菜'), base);
  assert.strictEqual(sandbox.normalizeCustomerName_('㈱高菜'), base);
});
test('「株式会社」と「有限会社」は法人格が違うので同一視しない', () => {
  assert.notStrictEqual(sandbox.normalizeCustomerName_('株式会社高菜'), sandbox.normalizeCustomerName_('有限会社高菜'));
});
test('別人(文字自体が異なる名前)は同一視しない', () => {
  const base = sandbox.normalizeCustomerName_('山田優');
  assert.notStrictEqual(sandbox.normalizeCustomerName_('山田優作'), base);
});

console.log('\n== 結果: ' + pass + ' passed, ' + fail + ' failed ==');
if (fail > 0) process.exit(1);
