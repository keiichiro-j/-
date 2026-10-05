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

// Utilities.formatDate は本テストで使う 'yyyy-MM' / 'yyyyMMdd_HHmmss' / 'M'(ゼロ埋めなし月)
// パターンのみ最小実装する。'MM'は'M'より先に判定させる(regex内の順序に依存)。
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
  return pattern.replace(/yyyy|MM|M|dd|HH|mm|ss/g, (token) => map[token]);
}

// EmailService.gs用の最小フェイク。MailAppは送信内容を capturedMails に積むだけ、
// DriveAppはファイルIDから固定のフェイクBlobを返すだけ、PropertiesServiceはメモリ上の
// オブジェクトで代用する。ScriptAppはメモリ上のトリガー一覧を操作する最小実装。
const capturedMails = [];
const fakeScriptProperties = {};
const fakeUserProperties = {}; // getThemePreference_/saveThemePreference_用
const fakeTriggers = [];
const fakeExternalSpreadsheets = {}; // id -> フェイクSpreadsheetオブジェクト(ExternalSyncService.gs用)

const sandbox = {
  Utilities: {
    formatDate: formatDateStub,
    base64Decode: (s) => Buffer.from(s, 'base64'),
    newBlob: (bytes, mimeType, name) => ({ bytes: bytes, mimeType: mimeType, name: name, isFakeBlob: true })
  },
  MailApp: {
    sendEmail: (opts) => { capturedMails.push(opts); }
  },
  DriveApp: {
    getFileById: (id) => {
      if (id === 'MISSING_ID') {
        throw new Error('ファイルが見つかりません');
      }
      return {
        getBlob: () => ({ fileId: id, isFakeBlob: true }),
        setTrashed: () => {}
      };
    }
  },
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
  Logger: { log: () => {} },
  // getManagerForCurrentUser_ 用。テストごとに currentUserEmail を書き換えてログイン状態を模する。
  Session: {
    getActiveUser: () => ({ getEmail: () => sandbox.currentUserEmail || '' })
  },
  currentUserEmail: '',
  // ExternalSyncService.gs用。fakeExternalSpreadsheets の id -> フェイクSpreadsheetオブジェクト
  // をテストごとに差し替えて、転記先スプレッドシートの状態を模する。
  SpreadsheetApp: {
    openById: (id) => {
      const ss = fakeExternalSpreadsheets[id];
      if (!ss) throw new Error('スプレッドシートが見つかりません: ' + id);
      return ss;
    }
  }
};
vm.createContext(sandbox);

const FILES = ['Constants.gs', 'ValidationService.gs', 'HistoryService.gs', 'TemplateService.gs', 'EmailService.gs', 'SettingsService.gs', 'BrandService.gs', 'CompanyService.gs', 'ExternalSyncService.gs', 'AuthService.gs'];
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
test('会社名が選択肢外ならエラー', () => {
  const errors = sandbox.validateFormData_(baseFormData({ company: '存在しない会社' }));
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

console.log('== ValidationService: validateFormData_ (行政書士登録) ==');
function gyoseiFormData(overrides) {
  return baseFormData(Object.assign({
    type: '行政書士',
    sendBatch: '',
    regDateCommon: '2026-08-20',
    gyoseiClass: '車庫証明申請から登録',
    gyoseiLocation: '岐阜本店',
    sealDate: '',
    vehicles: [{ userName: '橋本美咲', brand: 'MB', person: '担当A' }]
  }, overrides || {}));
}
test('必須項目が揃っていればエラーなし(送付便は不要)', () => {
  assert.strictEqual(sandbox.validateFormData_(gyoseiFormData()).length, 0);
});
test('送付便が空欄でもエラーにならない', () => {
  const errors = sandbox.validateFormData_(gyoseiFormData({ sendBatch: '' }));
  assert.ok(!errors.some((e) => e.includes('送付便')));
});
test('登録日（全体）が空ならエラー', () => {
  const errors = sandbox.validateFormData_(gyoseiFormData({ regDateCommon: '' }));
  assert.ok(errors.some((e) => e.includes('登録日（全体）')));
});
test('依頼事項が未選択ならエラー', () => {
  const errors = sandbox.validateFormData_(gyoseiFormData({ gyoseiClass: '' }));
  assert.ok(errors.some((e) => e.includes('依頼事項')));
});
test('依頼事項が選択肢外ならエラー', () => {
  const errors = sandbox.validateFormData_(gyoseiFormData({ gyoseiClass: '存在しない依頼' }));
  assert.ok(errors.some((e) => e.includes('依頼事項')));
});
test('依頼拠点が空ならエラー', () => {
  const errors = sandbox.validateFormData_(gyoseiFormData({ gyoseiLocation: '' }));
  assert.ok(errors.some((e) => e.includes('依頼拠点')));
});
test('顧客名(使用者名)が空ならエラー', () => {
  const errors = sandbox.validateFormData_(gyoseiFormData({ vehicles: [{ userName: '' }] }));
  assert.ok(errors.some((e) => e.includes('顧客名')));
});
test('顧客名が2件以上あるとエラー(1申請=1件)', () => {
  const errors = sandbox.validateFormData_(gyoseiFormData({
    vehicles: [{ userName: '橋本美咲' }, { userName: '山田花子' }]
  }));
  assert.ok(errors.some((e) => e.includes('1件のみ')));
});
test('封印取付日は空欄ならエラーにならない(任意項目)', () => {
  assert.strictEqual(sandbox.validateFormData_(gyoseiFormData({ sealDate: '' })).length, 0);
});
test('封印取付日は入力されていれば形式を検証する', () => {
  const errors = sandbox.validateFormData_(gyoseiFormData({ sealDate: '2026/08/20' }));
  assert.ok(errors.some((e) => e.includes('封印取付日')));
});
test('車台番号・税額は検証しない(車両テーブルを使わないため)', () => {
  const errors = sandbox.validateFormData_(gyoseiFormData({
    vehicles: [{ userName: '橋本美咲', person: '担当A', chassis: 'invalid', autoTax: '-1' }]
  }));
  assert.strictEqual(errors.length, 0);
});
test('担当者(担当セールス)が空ならエラー', () => {
  const errors = sandbox.validateFormData_(gyoseiFormData({
    vehicles: [{ userName: '橋本美咲', person: '' }]
  }));
  assert.ok(errors.some((e) => e.includes('担当者（担当セールス）')));
});
test('担当者(担当セールス)が入力されていればエラーなし', () => {
  assert.strictEqual(sandbox.validateFormData_(gyoseiFormData()).length, 0);
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
test('行政書士登録も共通登録日から年月タブ名を決める(紙登録と同じ扱い)', () => {
  assert.strictEqual(
    sandbox.resolveHistoryTabName_('行政書士', {}, '2026-09-01'),
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

console.log('== Constants: HISTORY_HEADER_ROW (行政書士登録の列追加) ==');
test('行政書士登録の4列は「飛騨登録」の直後・「送付書PDF」の直前に挿入されている(既存タブの列インデックスを保つため)', () => {
  const header = Array.from(sandbox.HISTORY_HEADER_ROW);
  assert.strictEqual(header.indexOf('飛騨登録') + 1, header.indexOf('依頼事項'));
  assert.strictEqual(header.indexOf('依頼事項') + 1, header.indexOf('依頼拠点'));
  assert.strictEqual(header.indexOf('依頼拠点') + 1, header.indexOf('封印取付日'));
  assert.strictEqual(header.indexOf('封印取付日') + 1, header.indexOf('車両所在'));
  assert.strictEqual(header.indexOf('車両所在') + 1, header.indexOf('送付書PDF'));
  // 既存列(依頼会社名=3, 担当責任者=4, 使用者名=9, 担当者=21)のインデックスは変わらない
  assert.strictEqual(header.indexOf('依頼会社名'), 3);
  assert.strictEqual(header.indexOf('担当責任者'), 4);
  assert.strictEqual(header.indexOf('使用者名'), 9);
  assert.strictEqual(header.indexOf('担当者'), 21);
});

console.log('== HistoryService: appendHistoryRow_ (行政書士登録) ==');

// insertSheet/appendRow/getRange().setValues()まで最小限サポートするミュータブルなフェイク
// (他のHistoryServiceテストで使うmakeFakeSheet/makeFakeSpreadsheetは読み取り専用のため別に用意する)。
function makeMutableFakeSpreadsheet() {
  const sheetsByName = {};
  return {
    getSheetByName: (name) => sheetsByName[name] || null,
    insertSheet: (name) => {
      const rows = [];
      const sheet = {
        getRange: (r, c, numRows, numCols) => ({
          setValues: (vals) => { rows[r - 1] = vals[0].slice(); },
          getValues: () => [rows[r - 1] || []]
        }),
        appendRow: (row) => { rows.push(row.slice()); },
        setFrozenRows: () => {},
        _rows: rows
      };
      sheetsByName[name] = sheet;
      return sheet;
    }
  };
}

test('依頼事項・依頼拠点・封印取付日・車両所在の4列に値を書き込み、車両テーブル用の列は空欄のままにする', () => {
  const ss = makeMutableFakeSpreadsheet();
  const formData = {
    company: '岐阜ヤナセ株式会社',
    manager: '戸田 圭市朗',
    sendDate: '2026-08-10',
    sendBatch: '',
    regDateCommon: '2026-08-20',
    gyoseiClass: '車庫証明申請から登録',
    gyoseiLocation: '岐阜本店',
    sealDate: '2026-08-25',
    gyoseiVehicleLocation: '本社駐車場'
  };
  const car = { userName: '橋本美咲', brand: 'MB' };
  const tabName = sandbox.appendHistoryRow_(ss, '行政書士', car, formData, 'uuid-1', 1, new Date(2026, 7, 10, 9, 0, 0), 'https://example.com/a.pdf');

  assert.strictEqual(tabName, '2026-08');
  const header = Array.from(sandbox.HISTORY_HEADER_ROW);
  const row = ss.getSheetByName('2026-08')._rows[1];
  assert.strictEqual(row[header.indexOf('種別')], '行政書士');
  assert.strictEqual(row[header.indexOf('使用者名')], '橋本美咲');
  assert.strictEqual(row[header.indexOf('ブランド')], 'MB');
  assert.strictEqual(row[header.indexOf('依頼事項')], '車庫証明申請から登録');
  assert.strictEqual(row[header.indexOf('依頼拠点')], '岐阜本店');
  assert.deepStrictEqual(row[header.indexOf('封印取付日')], sandbox.parseDateOnly_('2026-08-25'));
  assert.strictEqual(row[header.indexOf('車両所在')], '本社駐車場');
  // 車両テーブル専用の列(車台番号など)は行政書士登録では使わないため空欄のまま
  assert.strictEqual(row[header.indexOf('車台番号')], undefined);
});
test('封印取付日が未入力なら空文字のまま(エラーにしない)', () => {
  const ss = makeMutableFakeSpreadsheet();
  const formData = {
    company: '岐阜ヤナセ株式会社', manager: '戸田 圭市朗', sendDate: '2026-08-10',
    regDateCommon: '2026-08-20', gyoseiClass: '車庫証明申請から登録', gyoseiLocation: '岐阜本店', sealDate: ''
  };
  sandbox.appendHistoryRow_(ss, '行政書士', { userName: '橋本美咲' }, formData, 'uuid-2', 1, new Date(), 'https://example.com/b.pdf');
  const header = Array.from(sandbox.HISTORY_HEADER_ROW);
  const row = ss.getSheetByName('2026-08')._rows[1];
  assert.strictEqual(row[header.indexOf('封印取付日')], '');
});
test('OSS/紙では行政書士専用の4列は空欄のまま', () => {
  const ss = makeMutableFakeSpreadsheet();
  const formData = { company: '岐阜ヤナセ株式会社', manager: '戸田 圭市朗', sendDate: '2026-08-10', sendBatch: '第１便' };
  sandbox.appendHistoryRow_(ss, 'OSS', { userName: '橋本美咲', indivRegDate: '2026-08-15' }, formData, 'uuid-3', 1, new Date(), '');
  const header = Array.from(sandbox.HISTORY_HEADER_ROW);
  const row = ss.getSheetByName('2026-08')._rows[1];
  assert.strictEqual(row[header.indexOf('依頼事項')], '');
  assert.strictEqual(row[header.indexOf('依頼拠点')], '');
  assert.strictEqual(row[header.indexOf('封印取付日')], '');
  assert.strictEqual(row[header.indexOf('車両所在')], '');
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
    type: 'OSS',
    brand: 'MB',
    regDate: new Date(2026, 7, 10),
    sendDate: new Date(2026, 7, 10),
    sendBatch: '第１便',
    pdfUrl: 'https://drive.google.com/file/d/FAKE_ID/view',
    status: sandbox.SUBMISSION_STATUS_ACTIVE
  }, overrides || {});

  const h = sandbox.HISTORY_HEADER_ROW;
  const row = new Array(h.length).fill('');
  row[h.indexOf('送信日時')] = new Date(2026, 7, 10, 9, 0);
  row[h.indexOf('submissionId')] = o.submissionId;
  row[h.indexOf('種別')] = o.type;
  row[h.indexOf('依頼会社名')] = '岐阜ヤナセ株式会社';
  row[h.indexOf('担当責任者')] = '戸田 圭市朗';
  row[h.indexOf('登録日')] = o.regDate;
  row[h.indexOf('送付日')] = o.sendDate;
  row[h.indexOf('送付便')] = o.sendBatch;
  row[h.indexOf('車両No.')] = 1;
  row[h.indexOf('使用者名')] = o.userName;
  row[h.indexOf('ブランド')] = o.brand;
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

console.log('== HistoryService: getPdfsBySendDateRange_ ==');
test('指定した送付日の範囲・送付便に一致する行を申請単位(submissionId)にまとめ、使用者名一覧も持たせる', () => {
  const header = sandbox.HISTORY_HEADER_ROW;
  const day1 = new Date(2026, 7, 10);
  const day2 = new Date(2026, 7, 11);
  const dayOutside = new Date(2026, 7, 20);

  const rowA1 = makeHistoryFullRow({ submissionId: 'uuid-A', userName: '岐阜 太郎', sendDate: day1, sendBatch: '第１便' });
  const rowA2 = makeHistoryFullRow({ submissionId: 'uuid-A', userName: '岐阜 次郎', sendDate: day1, sendBatch: '第１便' });
  const rowB = makeHistoryFullRow({ submissionId: 'uuid-B', userName: '岐阜 花子', sendDate: day2, sendBatch: '第２便' });
  const rowC = makeHistoryFullRow({ submissionId: 'uuid-C', userName: '範囲外太郎', sendDate: dayOutside, sendBatch: '第１便' });

  const sheet = makeMutableSheet('2026-08', header, [rowA1, rowA2, rowB, rowC]);
  const ss = makeFakeSpreadsheet([sheet]);

  const all = sandbox.getPdfsBySendDateRange_(ss, '2026-08-10', '2026-08-12', '');
  assert.strictEqual(all.length, 2); // uuid-A, uuid-B (uuid-Cは範囲外の8/20なので対象外)

  const submissionA = all.find((x) => x.submissionId === 'uuid-A');
  assert.strictEqual(submissionA.vehicleCount, 2);
  // getHistoryEntries_は新しい順(appendRowと逆順)に並べ替えるため、使用者名の並び順は問わない
  assert.deepStrictEqual(Array.from(submissionA.userNames).sort(), ['岐阜 太郎', '岐阜 次郎'].sort());
  assert.strictEqual(submissionA.pdfUrl, 'https://drive.google.com/file/d/FAKE_ID/view');
  assert.strictEqual(submissionA.status, sandbox.SUBMISSION_STATUS_ACTIVE);

  const onlyBatch1 = sandbox.getPdfsBySendDateRange_(ss, '2026-08-10', '2026-08-12', '第１便');
  assert.strictEqual(onlyBatch1.length, 1);
  assert.strictEqual(onlyBatch1[0].submissionId, 'uuid-A');
});
test('開始日・終了日とも空なら全期間の行を対象にする', () => {
  const header = sandbox.HISTORY_HEADER_ROW;
  const sheet = makeMutableSheet('2026-08', header, [
    makeHistoryFullRow({ submissionId: 'uuid-A', sendDate: new Date(2020, 0, 1) }),
    makeHistoryFullRow({ submissionId: 'uuid-B', sendDate: new Date(2030, 0, 1) })
  ]);
  const ss = makeFakeSpreadsheet([sheet]);
  const result = sandbox.getPdfsBySendDateRange_(ss, '', '', '');
  assert.strictEqual(result.length, 2);
});
test('送付日が空/不正な行は対象外', () => {
  const header = sandbox.HISTORY_HEADER_ROW;
  const rowNoDate = makeHistoryFullRow({ submissionId: 'uuid-X', sendDate: '' });
  const sheet = makeMutableSheet('2026-08', header, [rowNoDate]);
  const ss = makeFakeSpreadsheet([sheet]);
  const result = sandbox.getPdfsBySendDateRange_(ss, '2026-01-01', '2026-12-31', '');
  assert.strictEqual(result.length, 0);
});

console.log('== HistoryService: getActivitySnapshot_ (常時アクティビティ表示) ==');
test('本日送付分が無ければ0件・空文字を返す', () => {
  const ss = makeFakeSpreadsheet([]);
  const snap = sandbox.getActivitySnapshot_(ss);
  assert.deepStrictEqual({ todayCount: snap.todayCount, latestCompany: snap.latestCompany, latestSentAt: snap.latestSentAt }, { todayCount: 0, latestCompany: '', latestSentAt: '' });
});
test('本日送付分の件数と最新1件の会社名・送信時刻を返す', () => {
  const header = sandbox.HISTORY_HEADER_ROW;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const row1 = makeHistoryFullRow({ submissionId: 'uuid-1', sendDate: today, sendBatch: '第１便' });
  const row2 = makeHistoryFullRow({ submissionId: 'uuid-2', sendDate: today, sendBatch: '第２便' });
  const sheet = makeMutableSheet(sandbox.formatYearMonth_(today), header, [row1, row2]);
  const ss = makeFakeSpreadsheet([sheet]);

  const snap = sandbox.getActivitySnapshot_(ss);
  assert.strictEqual(snap.todayCount, 2);
  assert.strictEqual(snap.latestCompany, '岐阜ヤナセ株式会社');
  assert.ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(snap.latestSentAt));
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

console.log('== TemplateService: 行政書士テンプレートへの書き込み ==');
// セル参照(A1形式または行列)への setValue 呼び出しをすべて記録するだけの最小限のフェイクシート。
function makeCellCaptureSheet_() {
  const cells = {};
  return {
    getRange: (a, b) => {
      const key = (typeof a === 'number') ? (a + ',' + b) : a;
      return {
        setValue: (v) => { cells[key] = v; },
        setBackground: () => {},
        setFontColor: () => {}
      };
    },
    _cells: cells
  };
}

test('担当責任者(ログイン)・担当者(担当セールス)・顧客名をそれぞれ別セルに書き込む', () => {
  const sheet = makeCellCaptureSheet_();
  const formData = {
    sendDate: '2026-08-10', gyoseiClass: '車庫証明申請から登録', gyoseiLocation: '岐阜本店',
    manager: '戸田 圭市朗', regDateCommon: '2026-08-20', sealDate: ''
  };
  sandbox.writeGyoseiCommonFields_(sheet, formData);
  sandbox.writeVehicleRows_(sheet, '行政書士', [{ userName: '橋本美咲', person: '担当A' }]);

  assert.strictEqual(sheet._cells[sandbox.GYOSEI_CELLS.manager], '戸田 圭市朗');
  assert.strictEqual(sheet._cells[sandbox.GYOSEI_CELLS.salesPerson], '担当A');
  assert.strictEqual(sheet._cells[sandbox.GYOSEI_CELLS.customerName], '橋本美咲');
  // 担当責任者と担当者は別々のセルに書き込まれる(同一セルを上書きし合わない)
  assert.notStrictEqual(sandbox.GYOSEI_CELLS.manager, sandbox.GYOSEI_CELLS.salesPerson);
});

test('車両所在をテンプレートのセルに書き込む', () => {
  const sheet = makeCellCaptureSheet_();
  const formData = {
    sendDate: '2026-08-10', gyoseiClass: '車庫証明申請から登録', gyoseiLocation: '岐阜本店',
    manager: '戸田 圭市朗', regDateCommon: '', sealDate: '', gyoseiVehicleLocation: '本社駐車場'
  };
  sandbox.writeGyoseiCommonFields_(sheet, formData);
  assert.strictEqual(sheet._cells[sandbox.GYOSEI_CELLS.vehicleLocation], '本社駐車場');
});

test('チェックリストはチェック済みの項目だけ✔を書き込み、備考もあわせて書き込む', () => {
  const sheet = makeCellCaptureSheet_();
  const formData = {
    sendDate: '2026-08-10', gyoseiClass: '車庫証明申請から登録', gyoseiLocation: '岐阜本店',
    manager: '戸田 圭市朗', regDateCommon: '', sealDate: '',
    gyoseiChecklist: {
      completionCert: { checked: true, remark: 'ディーラー発行分' },
      powerOfAttorney: { checked: true, remark: '' }
    }
  };
  sandbox.writeGyoseiCommonFields_(sheet, formData);

  const checkRow0 = sandbox.GYOSEI_CHECKLIST_START_ROW + 0; // completionCert
  const checkRow4 = sandbox.GYOSEI_CHECKLIST_START_ROW + 4; // powerOfAttorney
  const checkRow1 = sandbox.GYOSEI_CHECKLIST_START_ROW + 1; // transferCert(未チェック)

  assert.strictEqual(sheet._cells[checkRow0 + ',' + sandbox.GYOSEI_CHECKLIST_CHECK_COL], sandbox.CHECKBOX_MARK);
  assert.strictEqual(sheet._cells[checkRow0 + ',' + sandbox.GYOSEI_CHECKLIST_REMARK_COL], 'ディーラー発行分');
  assert.strictEqual(sheet._cells[checkRow4 + ',' + sandbox.GYOSEI_CHECKLIST_CHECK_COL], sandbox.CHECKBOX_MARK);
  assert.strictEqual(sheet._cells[checkRow1 + ',' + sandbox.GYOSEI_CHECKLIST_CHECK_COL], '');
  assert.strictEqual(sheet._cells[checkRow1 + ',' + sandbox.GYOSEI_CHECKLIST_REMARK_COL], '');
});

test('gyoseiChecklistが未指定でもエラーにならず全項目が空欄になる', () => {
  const sheet = makeCellCaptureSheet_();
  const formData = {
    sendDate: '2026-08-10', gyoseiClass: '車庫証明申請から登録', gyoseiLocation: '岐阜本店',
    manager: '戸田 圭市朗', regDateCommon: '', sealDate: ''
  };
  sandbox.writeGyoseiCommonFields_(sheet, formData);
  sandbox.GYOSEI_CHECKLIST_ITEMS.forEach((item, i) => {
    const row = sandbox.GYOSEI_CHECKLIST_START_ROW + i;
    assert.strictEqual(sheet._cells[row + ',' + sandbox.GYOSEI_CHECKLIST_CHECK_COL], '');
  });
});

console.log('== EmailService: validateMailRecipients_ ==');
test('空欄を除いた有効なメールアドレスの配列を返す', () => {
  const result = sandbox.validateMailRecipients_(['a@example.com', '', '  b@example.com  ', undefined]);
  assert.deepStrictEqual(Array.from(result), ['a@example.com', 'b@example.com']);
});
test('メールアドレスが1件も無ければエラー', () => {
  assert.throws(() => sandbox.validateMailRecipients_(['', '   ']), /1件以上/);
});
test('形式が不正なメールアドレスがあればエラー', () => {
  assert.throws(() => sandbox.validateMailRecipients_(['a@example.com', 'invalid']), /形式/);
});

console.log('== EmailService: sendPdfsByEmail_ ==');
test('指定した送付日の全便(取消済みを除く)のPDFを添付してメール送信し、宛先を保存する', () => {
  const header = sandbox.HISTORY_HEADER_ROW;
  const day = new Date(2026, 7, 10);
  const row1 = makeHistoryFullRow({
    submissionId: 'uuid-1', sendDate: day, sendBatch: '第１便',
    pdfUrl: 'https://drive.google.com/file/d/FILE_1/view', status: sandbox.SUBMISSION_STATUS_ACTIVE
  });
  const row2 = makeHistoryFullRow({
    submissionId: 'uuid-2', sendDate: day, sendBatch: '第２便',
    pdfUrl: 'https://drive.google.com/file/d/FILE_2/view', status: sandbox.SUBMISSION_STATUS_ACTIVE
  });
  const row3Cancelled = makeHistoryFullRow({
    submissionId: 'uuid-3', sendDate: day, sendBatch: '第３便',
    pdfUrl: 'https://drive.google.com/file/d/FILE_3/view', status: sandbox.SUBMISSION_STATUS_CANCELLED
  });

  const sheet = makeMutableSheet('2026-08', header, [row1, row2, row3Cancelled]);
  const ss = makeFakeSpreadsheet([sheet]);

  capturedMails.length = 0;
  const result = sandbox.sendPdfsByEmail_(ss, '2026-08-10', ['a@example.com', 'b@example.com']);

  assert.strictEqual(result.sentCount, 2); // 取消済みの第３便分は除外される
  assert.strictEqual(result.recipientCount, 2);
  assert.strictEqual(capturedMails.length, 1);
  assert.strictEqual(capturedMails[0].to, 'a@example.com,b@example.com');
  assert.strictEqual(capturedMails[0].attachments.length, 2);
  assert.ok(capturedMails[0].subject.includes('2026/08/10'));

  // 送信成功後、次回のために宛先が保存されている
  assert.deepStrictEqual(Array.from(sandbox.getSavedMailRecipients_()), ['a@example.com', 'b@example.com']);
});
test('該当する送付書PDFが無ければエラーになりメールは送信されない', () => {
  const ss = makeFakeSpreadsheet([]);
  capturedMails.length = 0;
  assert.throws(() => sandbox.sendPdfsByEmail_(ss, '2099-01-01', ['a@example.com']), /見つかりませんでした/);
  assert.strictEqual(capturedMails.length, 0);
});
test('送付日の形式が不正ならエラー', () => {
  const ss = makeFakeSpreadsheet([]);
  assert.throws(() => sandbox.sendPdfsByEmail_(ss, '2026/08/10', ['a@example.com']), /送付日/);
});

console.log('== EmailService: sendSavedRecipientsPdfsForDate_ (自動送信トリガー本体) ==');
test('宛先が保存されていなければ何もしない(例外を投げない)', () => {
  sandbox.saveMailRecipients_([]);
  capturedMails.length = 0;
  const ss = makeFakeSpreadsheet([]);
  assert.doesNotThrow(() => sandbox.sendSavedRecipientsPdfsForDate_(ss, '2026-08-10'));
  assert.strictEqual(capturedMails.length, 0);
});
test('該当する送付書PDFが無い日は例外を投げずに何もしない', () => {
  sandbox.saveMailRecipients_(['a@example.com']);
  capturedMails.length = 0;
  const ss = makeFakeSpreadsheet([]);
  assert.doesNotThrow(() => sandbox.sendSavedRecipientsPdfsForDate_(ss, '2099-01-01'));
  assert.strictEqual(capturedMails.length, 0);
});
test('保存済みの宛先へ、指定日のPDFを送信する', () => {
  const header = sandbox.HISTORY_HEADER_ROW;
  const day = new Date(2026, 7, 12);
  const row = makeHistoryFullRow({
    submissionId: 'uuid-auto', sendDate: day, sendBatch: '第１便',
    pdfUrl: 'https://drive.google.com/file/d/FILE_AUTO/view', status: sandbox.SUBMISSION_STATUS_ACTIVE
  });
  const sheet = makeMutableSheet('2026-08', header, [row]);
  const ss = makeFakeSpreadsheet([sheet]);

  sandbox.saveMailRecipients_(['a@example.com', 'b@example.com']);
  capturedMails.length = 0;
  sandbox.sendSavedRecipientsPdfsForDate_(ss, '2026-08-12');

  assert.strictEqual(capturedMails.length, 1);
  assert.strictEqual(capturedMails[0].to, 'a@example.com,b@example.com');
  assert.strictEqual(capturedMails[0].attachments.length, 1);
});

console.log('== EmailService: saveMailRecipientsOnly_ (設定画面の宛先保存) ==');
test('検証した上で宛先を保存し、送信は行わない', () => {
  sandbox.saveMailRecipients_([]);
  capturedMails.length = 0;
  const result = sandbox.saveMailRecipientsOnly_([' a@example.com ', 'b@example.com', '']);

  assert.strictEqual(result.recipientCount, 2);
  assert.strictEqual(capturedMails.length, 0); // メールは送信されない
  assert.deepStrictEqual(Array.from(sandbox.getSavedMailRecipients_()), ['a@example.com', 'b@example.com']);
});
test('不正なメールアドレスがあればエラーになり保存されない', () => {
  sandbox.saveMailRecipients_(['old@example.com']);
  assert.throws(() => sandbox.saveMailRecipientsOnly_(['not-an-email']), /メールアドレスの形式/);
  assert.deepStrictEqual(Array.from(sandbox.getSavedMailRecipients_()), ['old@example.com']); // 変更されない
});
test('全欄を空にして0件で保存できる(宛先を無くす操作を許可する)', () => {
  sandbox.saveMailRecipients_(['old@example.com']);
  const result = sandbox.saveMailRecipientsOnly_(['', '  ', '', '']);
  assert.strictEqual(result.recipientCount, 0);
  assert.deepStrictEqual(Array.from(sandbox.getSavedMailRecipients_()), []);
});

console.log('== EmailService: 自動送信トリガーのON/OFF切り替え ==');
test('初期状態はOFF(トリガー未設定)', () => {
  fakeTriggers.length = 0;
  assert.strictEqual(sandbox.isDailyMailTriggerEnabled_(), false);
});
test('ONにするとトリガーが1件作成される。何度ONにしても重複しない', () => {
  fakeTriggers.length = 0;
  sandbox.saveMailRecipients_(['a@example.com']);
  assert.strictEqual(sandbox.setDailyMailTriggerEnabled_(true), true);
  assert.strictEqual(sandbox.setDailyMailTriggerEnabled_(true), true);
  assert.strictEqual(fakeTriggers.length, 1);
});
test('OFFにするとトリガーが削除される', () => {
  fakeTriggers.length = 0;
  sandbox.saveMailRecipients_(['a@example.com']);
  sandbox.setDailyMailTriggerEnabled_(true);
  assert.strictEqual(sandbox.setDailyMailTriggerEnabled_(false), false);
  assert.strictEqual(fakeTriggers.length, 0);
});
test('宛先が1件も保存されていない状態でONにしようとするとエラーになり、トリガーは作成されない', () => {
  fakeTriggers.length = 0;
  sandbox.saveMailRecipients_([]);
  assert.throws(() => sandbox.setDailyMailTriggerEnabled_(true), /メール送信先を1件以上登録/);
  assert.strictEqual(fakeTriggers.length, 0);
});

console.log('== SettingsService: ヘッダーのロゴ画像URL ==');
test('未設定なら空文字を返す(ロゴ非表示)', () => {
  delete fakeScriptProperties[sandbox.LOGO_URL_PROP_KEY];
  assert.strictEqual(sandbox.getLogoUrl_(), '');
});
test('http(s)のURLを保存・取得できる', () => {
  const saved = sandbox.saveLogoUrl_('  https://example.com/logo.png  ');
  assert.strictEqual(saved, 'https://example.com/logo.png');
  assert.strictEqual(sandbox.getLogoUrl_(), 'https://example.com/logo.png');
});
test('空欄で保存するとロゴなしに戻せる', () => {
  sandbox.saveLogoUrl_('https://example.com/logo.png');
  const saved = sandbox.saveLogoUrl_('   ');
  assert.strictEqual(saved, '');
  assert.strictEqual(sandbox.getLogoUrl_(), '');
});
test('http(s)以外の形式はエラーになり保存されない', () => {
  sandbox.saveLogoUrl_('https://example.com/old.png');
  assert.throws(() => sandbox.saveLogoUrl_('javascript:alert(1)'), /http:\/\/ または https:\/\//);
  assert.strictEqual(sandbox.getLogoUrl_(), 'https://example.com/old.png'); // 変更されない
});
test('Googleドライブの共有リンク(file/d/<ID>/view)は表示用サムネイルURLに自動変換される', () => {
  const saved = sandbox.saveLogoUrl_('https://drive.google.com/file/d/1J3LS5DH8lutX3nUwb0UpuutXb01gWLk8/view?usp=drive_link');
  assert.strictEqual(saved, 'https://drive.google.com/thumbnail?id=1J3LS5DH8lutX3nUwb0UpuutXb01gWLk8&sz=w1000');
  assert.strictEqual(sandbox.getLogoUrl_(), saved);
});
test('Googleドライブの共有リンク(open?id=<ID>)も表示用サムネイルURLに自動変換される', () => {
  const saved = sandbox.saveLogoUrl_('https://drive.google.com/open?id=ABC123XYZ');
  assert.strictEqual(saved, 'https://drive.google.com/thumbnail?id=ABC123XYZ&sz=w1000');
});
test('ドライブ共有リンク以外の直接画像URLはそのまま保存される', () => {
  const saved = sandbox.saveLogoUrl_('https://drive.google.com/thumbnail?id=XYZ&sz=w500');
  assert.strictEqual(saved, 'https://drive.google.com/thumbnail?id=XYZ&sz=w500');
});

console.log('== SettingsService: 起動画面(ローディング画面)の画像URL ==');
test('未設定なら空文字を返す(画像なし)', () => {
  delete fakeScriptProperties[sandbox.LOADING_IMAGE_URL_PROP_KEY];
  assert.strictEqual(sandbox.getLoadingImageUrl_(), '');
});
test('http(s)のURLを保存・取得できる', () => {
  const saved = sandbox.saveLoadingImageUrl_('  https://example.com/loading.png  ');
  assert.strictEqual(saved, 'https://example.com/loading.png');
  assert.strictEqual(sandbox.getLoadingImageUrl_(), 'https://example.com/loading.png');
});
test('空欄で保存すると画像なしに戻せる', () => {
  sandbox.saveLoadingImageUrl_('https://example.com/loading.png');
  const saved = sandbox.saveLoadingImageUrl_('   ');
  assert.strictEqual(saved, '');
  assert.strictEqual(sandbox.getLoadingImageUrl_(), '');
});
test('http(s)以外の形式はエラーになり保存されない', () => {
  sandbox.saveLoadingImageUrl_('https://example.com/old.png');
  assert.throws(() => sandbox.saveLoadingImageUrl_('javascript:alert(1)'), /http:\/\/ または https:\/\//);
  assert.strictEqual(sandbox.getLoadingImageUrl_(), 'https://example.com/old.png'); // 変更されない
});
test('Googleドライブの共有リンク(file/d/<ID>/view)は表示用サムネイルURLに自動変換される', () => {
  const saved = sandbox.saveLoadingImageUrl_('https://drive.google.com/file/d/1J3LS5DH8lutX3nUwb0UpuutXb01gWLk8/view?usp=drive_link');
  assert.strictEqual(saved, 'https://drive.google.com/thumbnail?id=1J3LS5DH8lutX3nUwb0UpuutXb01gWLk8&sz=w1000');
  assert.strictEqual(sandbox.getLoadingImageUrl_(), saved);
});
test('Googleドライブの共有リンク(open?id=<ID>)も表示用サムネイルURLに自動変換される', () => {
  const saved = sandbox.saveLoadingImageUrl_('https://drive.google.com/open?id=ABC123XYZ');
  assert.strictEqual(saved, 'https://drive.google.com/thumbnail?id=ABC123XYZ&sz=w1000');
});
test('ドライブ共有リンク以外の直接画像URLはそのまま保存される', () => {
  const saved = sandbox.saveLoadingImageUrl_('https://drive.google.com/thumbnail?id=XYZ&sz=w500');
  assert.strictEqual(saved, 'https://drive.google.com/thumbnail?id=XYZ&sz=w500');
});

// vmサンドボックス(別Realm)から返る配列/オブジェクトは、そのままだとdeepStrictEqualで
// 「構造は同じだが参照が別」というエラーになるため、このRealムのプレーンオブジェクトに詰め替える。
function plainStaffRows(rows) {
  return Array.from(rows).map((row) => ({ name: row.name, email: row.email }));
}

console.log('== SettingsService: 担当者マスタ ==');
test('未設定なら空配列を返す', () => {
  delete fakeScriptProperties[sandbox.STAFF_MASTER_PROP_KEY];
  assert.deepStrictEqual(plainStaffRows(sandbox.getStaffMaster_()), []);
});
test('保存した内容(前後の空白除去・メール小文字化)を取得できる', () => {
  const saved = sandbox.saveStaffMaster_([
    { name: ' 山田太郎 ', email: ' Yamada@Example.com ' },
    { name: '鈴木花子', email: 'suzuki@example.com' }
  ]);
  assert.deepStrictEqual(plainStaffRows(saved), [
    { name: '山田太郎', email: 'yamada@example.com' },
    { name: '鈴木花子', email: 'suzuki@example.com' }
  ]);
  assert.deepStrictEqual(plainStaffRows(sandbox.getStaffMaster_()), plainStaffRows(saved));
});
test('両方空の行は無視して保存できる', () => {
  const saved = sandbox.saveStaffMaster_([
    { name: '山田太郎', email: 'yamada@example.com' },
    { name: '', email: '' }
  ]);
  assert.strictEqual(saved.length, 1);
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

console.log('== SettingsService: ログインユーザーに対応する担当責任者の判定 ==');
test('担当者マスタに一致するアカウントがあれば担当者名を返す', () => {
  sandbox.saveStaffMaster_([{ name: '山田太郎', email: 'yamada@example.com' }]);
  sandbox.currentUserEmail = 'Yamada@Example.com'; // 大文字小文字は区別しない
  assert.strictEqual(sandbox.getManagerForCurrentUser_(), '山田太郎');
});
test('一致するアカウントがなければメールアドレス自体を返す(未登録でも空欄にしない)', () => {
  sandbox.saveStaffMaster_([{ name: '山田太郎', email: 'yamada@example.com' }]);
  sandbox.currentUserEmail = 'unknown@example.com';
  assert.strictEqual(sandbox.getManagerForCurrentUser_(), 'unknown@example.com');
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
test('ログインアカウントを取得できない場合はisAuthorizedAdmin_がfalseを返す', () => {
  sandbox.AUTHORIZED_ADMIN_EMAILS_.push('admin@example.com');
  try {
    sandbox.currentUserEmail = '';
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
test('不正なテーマはエラーになり保存されない', () => {
  sandbox.saveThemePreference_('mono');
  assert.throws(() => sandbox.saveThemePreference_('rainbow'), /不正なテーマ/);
  assert.strictEqual(sandbox.getThemePreference_(), 'mono'); // 変更されない
});
test('プロパティの値が壊れている場合(選択肢にない値)は空文字を返す', () => {
  fakeUserProperties[sandbox.THEME_PREFERENCE_PROP_KEY] = 'not-a-real-theme';
  assert.strictEqual(sandbox.getThemePreference_(), '');
});

console.log('== BrandService: ブランドの選択肢 ==');
test('未設定なら初期値(MB/AU)を返す', () => {
  delete fakeScriptProperties[sandbox.BRAND_OPTIONS_PROP_KEY];
  assert.deepStrictEqual(Array.from(sandbox.getBrandOptions_()), ['MB', 'AU']);
});
test('保存した内容を取得できる(前後の空白除去・重複除去)', () => {
  const saved = sandbox.saveBrandOptions_([' MB ', 'AU', 'AU', ' VW ']);
  assert.deepStrictEqual(Array.from(saved), ['MB', 'AU', 'VW']);
  assert.deepStrictEqual(Array.from(sandbox.getBrandOptions_()), ['MB', 'AU', 'VW']);
});
test('空の行は無視して保存できる', () => {
  const saved = sandbox.saveBrandOptions_(['MB', '', '  ']);
  assert.deepStrictEqual(Array.from(saved), ['MB']);
});
test('1件も残らない場合はエラーになり保存されない', () => {
  sandbox.saveBrandOptions_(['MB']);
  assert.throws(() => sandbox.saveBrandOptions_(['', '  ']), /1つ以上登録/);
  assert.deepStrictEqual(Array.from(sandbox.getBrandOptions_()), ['MB']); // 変更されない
});

console.log('== CompanyService: 依頼会社名の選択肢 ==');
test('未設定なら初期値を返す', () => {
  delete fakeScriptProperties[sandbox.COMPANY_OPTIONS_PROP_KEY];
  assert.deepStrictEqual(Array.from(sandbox.getCompanyOptions_()), ['岐阜ヤナセ株式会社']);
});
test('保存した内容を取得できる(前後の空白除去・重複除去)', () => {
  const saved = sandbox.saveCompanyOptions_([' 岐阜ヤナセ株式会社 ', '岐阜ヤナセ株式会社', ' 岐阜支店 ']);
  assert.deepStrictEqual(Array.from(saved), ['岐阜ヤナセ株式会社', '岐阜支店']);
  assert.deepStrictEqual(Array.from(sandbox.getCompanyOptions_()), ['岐阜ヤナセ株式会社', '岐阜支店']);
});
test('空の行は無視して保存できる', () => {
  const saved = sandbox.saveCompanyOptions_(['岐阜ヤナセ株式会社', '', '  ']);
  assert.deepStrictEqual(Array.from(saved), ['岐阜ヤナセ株式会社']);
});
test('1件も残らない場合はエラーになり保存されない', () => {
  sandbox.saveCompanyOptions_(['岐阜ヤナセ株式会社']);
  assert.throws(() => sandbox.saveCompanyOptions_(['', '  ']), /1つ以上登録/);
  assert.deepStrictEqual(Array.from(sandbox.getCompanyOptions_()), ['岐阜ヤナセ株式会社']); // 変更されない
});

console.log('== ExternalSyncService: ブランド別の転記先スプレッドシートの設定 ==');

// 画像で提供された実物シートのヘッダー(A:ステータス〜H:備考)に合わせたフェイクSpreadsheet。
// tabs は { タブ名: dataRows(A〜H, ヘッダー除く) } の形。
function makeExternalSheetSpreadsheet(tabs) {
  const header = ['ステータス', '登録予定日', '拠点', '担当者', '車種', 'OSS区分', '顧客名', '備考'];
  const sheets = {};
  Object.keys(tabs).forEach((tabName) => {
    sheets[tabName] = makeMutableSheet(tabName, header, tabs[tabName]);
  });
  return { getSheetByName: (name) => sheets[name] || null };
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
test('片方だけ入力されている行はエラーになり保存されない', () => {
  assert.throws(() => sandbox.saveExternalSyncSheets_([{ brand: 'MB', sheetId: '' }]), /両方入力/);
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
test('最大5件を超えるとエラーになる', () => {
  fakeExternalSpreadsheets['SHEET_MANY'] = makeExternalSheetSpreadsheet({});
  const rows = ['MB', 'AU', 'VW', 'BMW', 'AUDI', 'PORSCHE'].map((b) => ({ brand: b, sheetId: 'SHEET_MANY' }));
  assert.throws(() => sandbox.saveExternalSyncSheets_(rows), /最大5件/);
});
test('全て空欄で保存すると転記しない設定(空配列)に戻せる', () => {
  fakeExternalSpreadsheets['SHEET_TMP'] = makeExternalSheetSpreadsheet({});
  sandbox.saveExternalSyncSheets_([{ brand: 'MB', sheetId: 'SHEET_TMP' }]);
  const saved = sandbox.saveExternalSyncSheets_([{ brand: '', sheetId: '' }]);
  assert.deepStrictEqual(Array.from(saved), []);
  assert.deepStrictEqual(Array.from(sandbox.getExternalSyncSheets_()), []);
});

console.log('== ExternalSyncService: タブ名の組み立て ==');
test('登録日の年月から "db_登録データ_YYYY_M月" 形式のタブ名を組み立てる(月はゼロ埋めしない)', () => {
  assert.strictEqual(sandbox.externalSyncTabName_(new Date(2026, 9, 2)), 'db_登録データ_2026_10月');
  assert.strictEqual(sandbox.externalSyncTabName_(new Date(2026, 0, 5)), 'db_登録データ_2026_1月');
});

console.log('== ExternalSyncService: 使用者名をキーにしたステータス・登録日・OSS区分の転記 ==');
test('転記先が1件も設定されていなければ何もしない(エラーにしない)', () => {
  delete fakeScriptProperties[sandbox.EXTERNAL_SYNC_SHEETS_PROP_KEY];
  assert.doesNotThrow(() => sandbox.syncRegistrationToExternalSheet_('橋本美咲', new Date(2026, 9, 2), 'OSS', 'MB'));
});
test('使用者名と一致する行のA列(ステータス)・B列(登録予定日)・F列(OSS区分)を更新する', () => {
  const ss = makeExternalSheetSpreadsheet({
    'db_登録データ_2026_10月': [
      ['登録予定日確認中', '', '岐阜', '戸田圭市朗', '', '', '橋本美咲', ''],
      ['登録予定日確認中', '', '', '', '', '', '山田花子', '']
    ]
  });
  fakeExternalSpreadsheets['SHEET_MATCH'] = ss;
  sandbox.saveExternalSyncSheets_([{ brand: 'MB', sheetId: 'SHEET_MATCH' }]);

  sandbox.syncRegistrationToExternalSheet_('橋本美咲', new Date(2026, 9, 2), 'OSS', 'MB');

  const sheet = ss.getSheetByName('db_登録データ_2026_10月');
  assert.strictEqual(sheet._rows[1][0], '登録予定日確定'); // A列(1行目はヘッダーなので2行目=配列index1)
  assert.strictEqual(sheet._rows[1][1], '2026-10-02'); // B列
  assert.strictEqual(sheet._rows[1][5], 'OSS'); // F列
  assert.strictEqual(sheet._rows[2][0], '登録予定日確認中'); // 一致しない行は変更されない
});
test('紙登録は"紙登録"という文字列を書き込む', () => {
  const ss = makeExternalSheetSpreadsheet({
    'db_登録データ_2026_11月': [['', '', '', '', '', '', '鈴木一郎', '']]
  });
  fakeExternalSpreadsheets['SHEET_PAPER'] = ss;
  sandbox.saveExternalSyncSheets_([{ brand: 'AU', sheetId: 'SHEET_PAPER' }]);

  sandbox.syncRegistrationToExternalSheet_('鈴木一郎', new Date(2026, 10, 15), '紙登録', 'AU');

  const sheet = ss.getSheetByName('db_登録データ_2026_11月');
  assert.strictEqual(sheet._rows[1][5], '紙登録');
});
test('ブランドに対応する転記先が設定されていない場合はエラーになる', () => {
  fakeExternalSpreadsheets['SHEET_MB2'] = makeExternalSheetSpreadsheet({});
  sandbox.saveExternalSyncSheets_([{ brand: 'MB', sheetId: 'SHEET_MB2' }]);
  assert.throws(
    () => sandbox.syncRegistrationToExternalSheet_('橋本美咲', new Date(2026, 9, 2), 'OSS', 'AU'),
    /ブランド「AU」の転記先スプレッドシートが設定されていません/
  );
});
test('対象タブが存在しない場合はエラーになる', () => {
  fakeExternalSpreadsheets['SHEET_NO_TAB'] = makeExternalSheetSpreadsheet({});
  sandbox.saveExternalSyncSheets_([{ brand: 'MB', sheetId: 'SHEET_NO_TAB' }]);
  assert.throws(
    () => sandbox.syncRegistrationToExternalSheet_('橋本美咲', new Date(2026, 9, 2), 'OSS', 'MB'),
    /db_登録データ_2026_10月.*タブが見つかりません/
  );
});
test('使用者名と一致する行が見つからない場合はエラーになる', () => {
  const ss = makeExternalSheetSpreadsheet({
    'db_登録データ_2026_10月': [['', '', '', '', '', '', '別人の名前', '']]
  });
  fakeExternalSpreadsheets['SHEET_NO_MATCH'] = ss;
  sandbox.saveExternalSyncSheets_([{ brand: 'MB', sheetId: 'SHEET_NO_MATCH' }]);
  assert.throws(
    () => sandbox.syncRegistrationToExternalSheet_('橋本美咲', new Date(2026, 9, 2), 'OSS', 'MB'),
    /一致する行が見つかりませんでした/
  );
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
  // 法人格が付いていない裸の名前とは区別する
  assert.notStrictEqual(sandbox.normalizeCustomerName_('高菜'), base);
});
test('末尾の敬称(様・殿)を無視する', () => {
  assert.strictEqual(sandbox.normalizeCustomerName_('山田太郎様'), sandbox.normalizeCustomerName_('山田太郎'));
  assert.strictEqual(sandbox.normalizeCustomerName_('山田太郎殿'), sandbox.normalizeCustomerName_('山田太郎'));
});
test('別人(文字自体が異なる名前)は同一視しない', () => {
  assert.notStrictEqual(sandbox.normalizeCustomerName_('山田優'), sandbox.normalizeCustomerName_('山田優作'));
  assert.notStrictEqual(sandbox.normalizeCustomerName_('山田太郎'), sandbox.normalizeCustomerName_('山田次郎'));
});
test('異体字(「高」と「髙」等)の表記ゆれを吸収する(他の文字が一致する場合に限る)', () => {
  assert.strictEqual(sandbox.normalizeCustomerName_('髙橋太郎'), sandbox.normalizeCustomerName_('高橋太郎'));
  assert.strictEqual(sandbox.normalizeCustomerName_('渡邊次郎'), sandbox.normalizeCustomerName_('渡辺次郎'));
  assert.strictEqual(sandbox.normalizeCustomerName_('㈱髙橋'), sandbox.normalizeCustomerName_('高橋株式会社'));
  // 異体字以外の部分(姓や名そのもの)が違えば、引き続き別人として区別する
  assert.notStrictEqual(sandbox.normalizeCustomerName_('髙橋太郎'), sandbox.normalizeCustomerName_('高橋次郎'));
  assert.notStrictEqual(sandbox.normalizeCustomerName_('髙田太郎'), sandbox.normalizeCustomerName_('高木太郎'));
});

console.log('== ExternalSyncService: 表記ゆれがあっても転記できる ==');
test('顧客名にスペースが入っていても(全角/半角問わず)一致して転記できる', () => {
  const ss = makeExternalSheetSpreadsheet({
    'db_登録データ_2026_10月': [['', '', '', '', '', '', '山田　太郎', '']]
  });
  fakeExternalSpreadsheets['SHEET_SPACE'] = ss;
  sandbox.saveExternalSyncSheets_([{ brand: 'MB', sheetId: 'SHEET_SPACE' }]);

  sandbox.syncRegistrationToExternalSheet_('山田 太郎', new Date(2026, 9, 2), 'OSS', 'MB');

  const sheet = ss.getSheetByName('db_登録データ_2026_10月');
  assert.strictEqual(sheet._rows[1][5], 'OSS');
});
test('「株式会社」の表記が違っても一致して転記できる', () => {
  const ss = makeExternalSheetSpreadsheet({
    'db_登録データ_2026_10月': [['', '', '', '', '', '', '株式会社高菜', '']]
  });
  fakeExternalSpreadsheets['SHEET_KK'] = ss;
  sandbox.saveExternalSyncSheets_([{ brand: 'MB', sheetId: 'SHEET_KK' }]);

  sandbox.syncRegistrationToExternalSheet_('（株）高菜', new Date(2026, 9, 2), 'OSS', 'MB');

  const sheet = ss.getSheetByName('db_登録データ_2026_10月');
  assert.strictEqual(sheet._rows[1][5], 'OSS');
});
test('文字が異なる別人(山田優 と 山田優作)は誤って一致させない', () => {
  const ss = makeExternalSheetSpreadsheet({
    'db_登録データ_2026_10月': [['', '', '', '', '', '', '山田優作', '']]
  });
  fakeExternalSpreadsheets['SHEET_DIFF_PERSON'] = ss;
  sandbox.saveExternalSyncSheets_([{ brand: 'MB', sheetId: 'SHEET_DIFF_PERSON' }]);

  assert.throws(
    () => sandbox.syncRegistrationToExternalSheet_('山田優', new Date(2026, 9, 2), 'OSS', 'MB'),
    /一致する行が見つかりませんでした/
  );
});

console.log('== ExternalSyncService: 有限会社・弁護士法人など他の法人格の表記ゆれ ==');
test('「有限会社」「(有)」「㈲」「（有）」の表記ゆれを吸収する', () => {
  const base = sandbox.normalizeCustomerName_('有限会社高菜');
  assert.strictEqual(sandbox.normalizeCustomerName_('高菜有限会社'), base);
  assert.strictEqual(sandbox.normalizeCustomerName_('（有）高菜'), base);
  assert.strictEqual(sandbox.normalizeCustomerName_('(有)高菜'), base);
  assert.strictEqual(sandbox.normalizeCustomerName_('㈲高菜'), base);
  // 法人格が付いていない裸の名前とは区別する(同じ会社と決めつけない)
  assert.notStrictEqual(sandbox.normalizeCustomerName_('高菜'), base);
});
test('「弁護士法人」「(弁)」の表記ゆれを吸収する', () => {
  const base = sandbox.normalizeCustomerName_('弁護士法人高菜');
  assert.strictEqual(sandbox.normalizeCustomerName_('（弁）高菜'), base);
  assert.strictEqual(sandbox.normalizeCustomerName_('(弁)高菜'), base);
});
test('「株式会社」と「有限会社」は法人格が違うので同一視しない', () => {
  assert.notStrictEqual(sandbox.normalizeCustomerName_('株式会社高菜'), sandbox.normalizeCustomerName_('有限会社高菜'));
});

console.log('== ExternalSyncService: 転記の成否・同姓同名の優先度 ==');
test('転記に成功するとtrueを返す', () => {
  const ss = makeExternalSheetSpreadsheet({
    'db_登録データ_2026_10月': [['', '', '', '', '', '', '橋本美咲', '']]
  });
  fakeExternalSpreadsheets['SHEET_RETURN_TRUE'] = ss;
  sandbox.saveExternalSyncSheets_([{ brand: 'MB', sheetId: 'SHEET_RETURN_TRUE' }]);

  const result = sandbox.syncRegistrationToExternalSheet_('橋本美咲', new Date(2026, 9, 2), 'OSS', 'MB');
  assert.strictEqual(result, true);
});
test('転記先が1件も設定されていない場合はundefinedを返す(成功メッセージを出さないため)', () => {
  delete fakeScriptProperties[sandbox.EXTERNAL_SYNC_SHEETS_PROP_KEY];
  const result = sandbox.syncRegistrationToExternalSheet_('橋本美咲', new Date(2026, 9, 2), 'OSS', 'MB');
  assert.strictEqual(result, undefined);
});
test('同姓同名が複数行ある場合、まだ確定していない行を優先して更新する', () => {
  const ss = makeExternalSheetSpreadsheet({
    'db_登録データ_2026_10月': [
      ['登録予定日確定', '2026-01-01', '', '', '', 'OSS', '山田太郎', ''], // 既に確定済み(過去の登録)
      ['登録予定日確認中', '', '', '', '', '', '山田太郎', '']            // 今回一致させたい行
    ]
  });
  fakeExternalSpreadsheets['SHEET_DUP_NAME'] = ss;
  sandbox.saveExternalSyncSheets_([{ brand: 'MB', sheetId: 'SHEET_DUP_NAME' }]);

  sandbox.syncRegistrationToExternalSheet_('山田太郎', new Date(2026, 9, 2), 'OSS', 'MB');

  const sheet = ss.getSheetByName('db_登録データ_2026_10月');
  assert.strictEqual(sheet._rows[1][1], '2026-01-01'); // 確定済みの行は変更されない
  assert.strictEqual(sheet._rows[2][1], '2026-10-02'); // 未確定の行が更新される
});
test('一致する行が全て確定済みの場合は、最初に見つかった行を使う', () => {
  const ss = makeExternalSheetSpreadsheet({
    'db_登録データ_2026_10月': [
      ['登録予定日確定', '2026-01-01', '', '', '', 'OSS', '山田太郎', '']
    ]
  });
  fakeExternalSpreadsheets['SHEET_ALL_CONFIRMED'] = ss;
  sandbox.saveExternalSyncSheets_([{ brand: 'MB', sheetId: 'SHEET_ALL_CONFIRMED' }]);

  sandbox.syncRegistrationToExternalSheet_('山田太郎', new Date(2026, 9, 2), 'OSS', 'MB');

  const sheet = ss.getSheetByName('db_登録データ_2026_10月');
  assert.strictEqual(sheet._rows[1][1], '2026-10-02');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
