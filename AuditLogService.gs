/**
 * AuditLogService.gs
 * 変更履歴（監査ログ）機能。
 *
 * 登録・編集・ステータス変更・削除のたびに、会社ごとのスプレッドシート内「変更履歴」シートへ
 * 変更前後のスナップショットを記録する。直近の変更に限り「元に戻す」（1ステップ分の取り消し）
 * が行える（対象車両にその後さらに別の変更が加えられている場合は取り消せない）。
 */

var AUDIT_LOG_SHEET_NAME = '変更履歴';
var AUDIT_LOG_HEADER = ['日時', '操作者', '操作種別', 'タブ', 'OCN', '変更前', '変更後', '取消済み', '備考'];

function getAuditLogSheet_(companyId) {
  var ss = openCompanySpreadsheet(companyId);
  var sheet = ss.getSheetByName(AUDIT_LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(AUDIT_LOG_SHEET_NAME);
    sheet.getRange(1, 1, 1, AUDIT_LOG_HEADER.length).setValues([AUDIT_LOG_HEADER]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * 変更履歴を1件記録する。常に2行目（ヘッダー直下）へ挿入するため、最新の変更が先頭に並ぶ。
 * @param {string} companyId
 * @param {{action:string, tabName:string, ocn:string, before:(Object|null), after:(Object|null)}} entry
 */
function appendAuditLog_(companyId, entry) {
  var sheet = getAuditLogSheet_(companyId);
  sheet.insertRowAfter(1);
  sheet.getRange(2, 1, 1, AUDIT_LOG_HEADER.length).setValues([[
    new Date(),
    Session.getActiveUser().getEmail(),
    entry.action,
    entry.tabName || '',
    entry.ocn || '',
    entry.before ? JSON.stringify(stripRowNumber_(entry.before)) : '',
    entry.after ? JSON.stringify(stripRowNumber_(entry.after)) : '',
    false,
    entry.note || ''
  ]]);
}

function stripRowNumber_(vehicle) {
  var copy = Object.assign({}, vehicle);
  delete copy.rowNumber;
  return copy;
}

function auditRowToEntry_(row, rowNumber) {
  return {
    rowNumber: rowNumber,
    timestamp: row[0] instanceof Date ? row[0].toISOString() : String(row[0]),
    user: row[1],
    action: row[2],
    tabName: row[3],
    ocn: String(row[4]),
    before: row[5] ? JSON.parse(row[5]) : null,
    after: row[6] ? JSON.parse(row[6]) : null,
    undone: row[7] === true,
    note: row[8] || ''
  };
}

function markAuditLogUndone_(companyId, rowNumber) {
  getAuditLogSheet_(companyId).getRange(rowNumber, 8).setValue(true);
}

/**
 * 変更履歴一覧（新しい順）を取得する。
 */
function listAuditLog(companyId, limit) {
  var sheet = getAuditLogSheet_(companyId);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var count = Math.min(limit || 100, lastRow - 1);
  var values = sheet.getRange(2, 1, count, AUDIT_LOG_HEADER.length).getValues();
  return values.map(function (row, i) { return auditRowToEntry_(row, i + 2); });
}

/**
 * 指定OCNについて、まだ取り消されていない直近の変更（取消操作自体は除く）を返す。
 * 取り消せるのは常にこの「直近の変更」のみ（ひとステップ前までの取り消し）。
 */
function findLatestActiveEntryForOcn_(companyId, ocn) {
  var sheet = getAuditLogSheet_(companyId);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var values = sheet.getRange(2, 1, lastRow - 1, AUDIT_LOG_HEADER.length).getValues();
  for (var i = 0; i < values.length; i++) {
    var entry = auditRowToEntry_(values[i], i + 2);
    if (entry.ocn === String(ocn) && !entry.undone && entry.action !== '取消') return entry;
  }
  return null;
}

/**
 * 「販売済み」への変更で販売済タブへ移動した車両を、元のタブへ戻す。
 */
function undoMoveToSoldTab_(companyId, ocn, beforeSnapshot) {
  var soldSheet = getOrCreateSheet(companyId, TAB_NAMES.SOLD);
  var rowNumber = findRowByOcn_(soldSheet, ocn);
  if (!rowNumber) throw new Error('取消対象の車両が販売済タブに見つかりません（OCN: ' + ocn + '）');
  var originalSheet = getOrCreateSheet(companyId, beforeSnapshot.tabName);
  originalSheet.appendRow(objectToRow_(beforeSnapshot));
  soldSheet.deleteRow(rowNumber);
}

/**
 * 変更履歴の1件を取り消す（ひとステップ前までのバックボタン）。
 * @param {string} companyId
 * @param {number} rowNumber 「変更履歴」シート上の行番号（listAuditLogのrowNumber）
 */
function undoAuditLogEntry(companyId, rowNumber) {
  var sheet = getAuditLogSheet_(companyId);
  var row = sheet.getRange(rowNumber, 1, 1, AUDIT_LOG_HEADER.length).getValues()[0];
  var entry = auditRowToEntry_(row, rowNumber);

  if (entry.undone) throw new Error('この変更は既に取り消し済みです');
  if (entry.action === '登録') throw new Error('登録の取り消しは「削除」機能をご利用ください');
  if (entry.action === '取消') throw new Error('取消操作自体は取り消せません');

  var latest = findLatestActiveEntryForOcn_(companyId, entry.ocn);
  if (!latest || latest.rowNumber !== entry.rowNumber) {
    throw new Error('この車両にはその後さらに別の変更が加えられているため、最新の変更のみ取り消せます');
  }

  if (entry.action === '削除') {
    restoreVehicleRow_(companyId, entry.before.tabName, entry.before);
  } else if (entry.action === 'ステータス変更' && entry.after && entry.after.status === STATUS_SOLD) {
    undoMoveToSoldTab_(companyId, entry.ocn, entry.before);
  } else {
    updateVehicle(companyId, entry.tabName, entry.ocn, entry.before);
  }

  markAuditLogUndone_(companyId, rowNumber);
  appendAuditLog_(companyId, { action: '取消', tabName: entry.tabName, ocn: entry.ocn, before: entry.after, after: entry.before });
  return { undone: true };
}
