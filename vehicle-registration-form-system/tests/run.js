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

// EmailService.gs用の最小フェイク。MailAppは送信内容を capturedMails に積むだけ、
// DriveAppはファイルIDから固定のフェイクBlobを返すだけ、PropertiesServiceはメモリ上の
// オブジェクトで代用する。ScriptAppはメモリ上のトリガー一覧を操作する最小実装。
const capturedMails = [];
const fakeScriptProperties = {};
const fakeTriggers = [];
const fakeDriveFiles = {}; // createFileで作られたファイルをid別に保持(トラッシュ状態・共有設定を含む)
let fakeDriveFileSeq = 0;

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
      if (id === 'MISSING_ID' || (fakeDriveFiles[id] && fakeDriveFiles[id].trashed)) {
        throw new Error('ファイルが見つかりません');
      }
      return {
        getBlob: () => ({ fileId: id, isFakeBlob: true }),
        setTrashed: (v) => { if (fakeDriveFiles[id]) fakeDriveFiles[id].trashed = v; }
      };
    },
    createFile: (blob) => {
      const id = 'FAKE_DRIVE_FILE_' + (++fakeDriveFileSeq);
      fakeDriveFiles[id] = { blob: blob, sharing: null, trashed: false };
      return {
        getId: () => id,
        setSharing: (access, permission) => { fakeDriveFiles[id].sharing = { access: access, permission: permission }; }
      };
    },
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
    Permission: { VIEW: 'VIEW' }
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

const FILES = ['Constants.gs', 'ValidationService.gs', 'HistoryService.gs', 'TemplateService.gs', 'EmailService.gs', 'SettingsService.gs'];
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

console.log('== SettingsService: 申請フォームの既定値 ==');
test('未設定なら空文字を返す', () => {
  delete fakeScriptProperties[sandbox.DEFAULT_FORM_VALUES_PROP_KEY];
  const result = sandbox.getDefaultFormValues_();
  assert.deepStrictEqual({ company: result.company, manager: result.manager }, { company: '', manager: '' });
});
test('前後の空白を除いて保存し、取得できる', () => {
  const saved = sandbox.saveDefaultFormValues_({ company: ' 岐阜ヤナセ株式会社 ', manager: ' 戸田 圭市朗 ' });
  assert.deepStrictEqual({ company: saved.company, manager: saved.manager }, { company: '岐阜ヤナセ株式会社', manager: '戸田 圭市朗' });

  const loaded = sandbox.getDefaultFormValues_();
  assert.deepStrictEqual({ company: loaded.company, manager: loaded.manager }, { company: '岐阜ヤナセ株式会社', manager: '戸田 圭市朗' });
});
test('片方だけ空欄でも保存できる', () => {
  const saved = sandbox.saveDefaultFormValues_({ company: '岐阜ヤナセ株式会社', manager: '' });
  assert.deepStrictEqual({ company: saved.company, manager: saved.manager }, { company: '岐阜ヤナセ株式会社', manager: '' });
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

console.log('== SettingsService: 起動画面(ローディング画面)の画像アップロード ==');
test('未設定なら空文字を返す(画像なし)', () => {
  delete fakeScriptProperties[sandbox.LOADING_IMAGE_URL_PROP_KEY];
  assert.strictEqual(sandbox.getLoadingImageUrl_(), '');
});
test('画像(base64)をアップロードすると、ドライブのサムネイルURL形式で保存・取得できる', () => {
  const saved = sandbox.saveLoadingImage_(Buffer.from('fake-image-bytes').toString('base64'), 'image/png', 'loading.png');
  assert.ok(/^https:\/\/drive\.google\.com\/thumbnail\?id=FAKE_DRIVE_FILE_\d+&sz=w1000$/.test(saved));
  assert.strictEqual(sandbox.getLoadingImageUrl_(), saved);
});
test('画像以外のMIMEタイプはエラーになり保存されない', () => {
  delete fakeScriptProperties[sandbox.LOADING_IMAGE_URL_PROP_KEY];
  assert.throws(() => sandbox.saveLoadingImage_(Buffer.from('x').toString('base64'), 'application/pdf', 'a.pdf'), /画像ファイル/);
  assert.strictEqual(sandbox.getLoadingImageUrl_(), '');
});
test('base64データが空ならエラーになる', () => {
  assert.throws(() => sandbox.saveLoadingImage_('', 'image/png', 'a.png'), /画像を選択/);
});
test('差し替えアップロード時、以前のドライブファイルはゴミ箱へ移動される', () => {
  const first = sandbox.saveLoadingImage_(Buffer.from('one').toString('base64'), 'image/png', 'one.png');
  const firstId = first.match(/id=([^&]+)/)[1];
  sandbox.saveLoadingImage_(Buffer.from('two').toString('base64'), 'image/png', 'two.png');
  assert.throws(() => sandbox.DriveApp.getFileById(firstId), /見つかりません/);
});
test('削除すると空文字に戻り、ドライブファイルもゴミ箱へ移動される', () => {
  const saved = sandbox.saveLoadingImage_(Buffer.from('three').toString('base64'), 'image/png', 'three.png');
  const savedId = saved.match(/id=([^&]+)/)[1];
  sandbox.clearLoadingImage_();
  assert.strictEqual(sandbox.getLoadingImageUrl_(), '');
  assert.throws(() => sandbox.DriveApp.getFileById(savedId), /見つかりません/);
});
test('未設定の状態で削除してもエラーにならない', () => {
  delete fakeScriptProperties[sandbox.LOADING_IMAGE_URL_PROP_KEY];
  delete fakeScriptProperties[sandbox.LOADING_IMAGE_FILE_ID_PROP_KEY];
  assert.doesNotThrow(() => sandbox.clearLoadingImage_());
});
test('data:URLのヘッダー部分が紛れ込んでいても取り除いて保存できる', () => {
  delete fakeScriptProperties[sandbox.LOADING_IMAGE_URL_PROP_KEY];
  const raw = 'data:image/png;base64,' + Buffer.from('four').toString('base64');
  const saved = sandbox.saveLoadingImage_(raw, 'image/png', 'four.png');
  assert.ok(/^https:\/\/drive\.google\.com\/thumbnail\?id=FAKE_DRIVE_FILE_\d+&sz=w1000$/.test(saved));
});
test('ファイル名に改行が含まれていてもエラーにならず保存できる', () => {
  delete fakeScriptProperties[sandbox.LOADING_IMAGE_URL_PROP_KEY];
  const saved = sandbox.saveLoadingImage_(Buffer.from('five').toString('base64'), 'image/png', 'five\n.png');
  assert.ok(/^https:\/\/drive\.google\.com\/thumbnail\?id=FAKE_DRIVE_FILE_\d+&sz=w1000$/.test(saved));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
