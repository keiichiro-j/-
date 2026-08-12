/**
 * ScheduleService.gs
 * 登録スケジュール（休日・締切）データのスプレッドシート CRUD、権限・支局マスタ管理。
 */

var SCHEDULE_HEADER_ROW = ['ID', '日付', '種別', '支局', 'メモ', '作成者', '作成日時', '更新日時'];
var SCHEDULE_COL = { id: 0, date: 1, type: 2, office: 3, memo: 4, createdBy: 5, createdAt: 6, updatedAt: 7 };

function getScheduleSpreadsheetId_() {
  var id = PropertiesService.getScriptProperties().getProperty(SCHEDULE_PROP_KEYS.SHEET_ID);
  if (!id) throw new Error('登録スケジュール用スプレッドシートが未設定です（Script Properties: SCHEDULE_SHEET_ID）');
  return id;
}

function getScheduleSheet_() {
  var ss = SpreadsheetApp.openById(getScheduleSpreadsheetId_());
  var sheet = ss.getSheetByName(SCHEDULE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SCHEDULE_SHEET_NAME);
    sheet.getRange(1, 1, 1, SCHEDULE_HEADER_ROW.length).setValues([SCHEDULE_HEADER_ROW]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function scheduleFormatDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v || '';
}

function scheduleFormatDateTime_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  return v || '';
}

function scheduleRowToObject_(values, rowNumber) {
  return {
    rowNumber: rowNumber,
    id: values[SCHEDULE_COL.id],
    date: scheduleFormatDate_(values[SCHEDULE_COL.date]),
    type: values[SCHEDULE_COL.type],
    office: values[SCHEDULE_COL.office] || '',
    memo: values[SCHEDULE_COL.memo] || '',
    createdBy: values[SCHEDULE_COL.createdBy] || '',
    createdAt: scheduleFormatDateTime_(values[SCHEDULE_COL.createdAt]),
    updatedAt: scheduleFormatDateTime_(values[SCHEDULE_COL.updatedAt])
  };
}

function readAllScheduleEvents_() {
  var sheet = getScheduleSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, SCHEDULE_HEADER_ROW.length).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    if (!values[i][SCHEDULE_COL.id]) continue;
    rows.push(scheduleRowToObject_(values[i], i + 2));
  }
  return rows;
}

function findScheduleRowById_(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return null;
}

/**
 * 期間・支局で絞り込んだイベント一覧を取得する（startDate/endDate は 'yyyy-MM-dd'、両端含む）。
 */
function listScheduleEvents(startDate, endDate, officeFilter) {
  var events = readAllScheduleEvents_().filter(function (e) {
    return e.date >= startDate && e.date <= endDate;
  });
  return filterEventsByOffice_(events, officeFilter);
}

function validateScheduleEvent_(event) {
  if (!event.date || !/^\d{4}-\d{2}-\d{2}$/.test(event.date)) {
    throw new Error('日付の形式が不正です');
  }
  var meta = SCHEDULE_EVENT_TYPE_META[event.type];
  if (!meta) throw new Error('種別が不正です: ' + event.type);
  if (meta.requiresOffice && !event.office) {
    throw new Error(meta.label + 'は対象支局の指定が必須です');
  }
}

// ===== 権限（編集可否） =====
function getScheduleEditors_() {
  var json = PropertiesService.getScriptProperties().getProperty(SCHEDULE_PROP_KEYS.EDITORS);
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch (e) {
    return [];
  }
}

function isScheduleEditor_() {
  var editors = getScheduleEditors_();
  if (!editors.length) return true; // 未設定時は全員編集可（初期状態）
  var email = Session.getActiveUser().getEmail();
  return editors.indexOf(email) !== -1;
}

function assertScheduleEditable_() {
  if (!isScheduleEditor_()) throw new Error('この操作には編集権限が必要です');
}

// ===== 支局マスタ =====
function getScheduleOffices() {
  var json = PropertiesService.getScriptProperties().getProperty(SCHEDULE_PROP_KEYS.OFFICES);
  if (!json) return SCHEDULE_DEFAULT_OFFICES.slice();
  try {
    var offices = JSON.parse(json);
    return offices.length ? offices : SCHEDULE_DEFAULT_OFFICES.slice();
  } catch (e) {
    return SCHEDULE_DEFAULT_OFFICES.slice();
  }
}

function addScheduleOffice(name) {
  assertScheduleEditable_();
  name = (name || '').trim();
  if (!name) throw new Error('支局名を入力してください');
  var offices = getScheduleOffices();
  if (offices.indexOf(name) === -1) {
    offices.push(name);
    PropertiesService.getScriptProperties().setProperty(SCHEDULE_PROP_KEYS.OFFICES, JSON.stringify(offices));
  }
  return offices;
}

// ===== CRUD =====
function createScheduleEvent(event) {
  validateScheduleEvent_(event);
  assertScheduleEditable_();
  var sheet = getScheduleSheet_();
  var now = new Date();
  var id = 'EVT' + now.getTime() + Math.floor(Math.random() * 1000);
  var email = Session.getActiveUser().getEmail();
  sheet.appendRow([id, event.date, event.type, event.office || '', event.memo || '', email, now, now]);
  var nowStr = scheduleFormatDateTime_(now);
  return {
    id: id, date: event.date, type: event.type, office: event.office || '', memo: event.memo || '',
    createdBy: email, createdAt: nowStr, updatedAt: nowStr
  };
}

function updateScheduleEvent(id, patch) {
  assertScheduleEditable_();
  var sheet = getScheduleSheet_();
  var rowNumber = findScheduleRowById_(sheet, id);
  if (!rowNumber) throw new Error('該当する予定が見つかりません');

  var rawValues = sheet.getRange(rowNumber, 1, 1, SCHEDULE_HEADER_ROW.length).getValues()[0];
  var current = scheduleRowToObject_(rawValues, rowNumber);
  var merged = Object.assign({}, current, patch, { id: current.id });
  validateScheduleEvent_(merged);

  var now = new Date();
  sheet.getRange(rowNumber, 1, 1, SCHEDULE_HEADER_ROW.length).setValues([[
    merged.id, merged.date, merged.type, merged.office || '', merged.memo || '',
    merged.createdBy, rawValues[SCHEDULE_COL.createdAt], now
  ]]);
  merged.updatedAt = scheduleFormatDateTime_(now);
  return merged;
}

function deleteScheduleEvent(id) {
  assertScheduleEditable_();
  var sheet = getScheduleSheet_();
  var rowNumber = findScheduleRowById_(sheet, id);
  if (!rowNumber) throw new Error('該当する予定が見つかりません');
  sheet.deleteRow(rowNumber);
}

/**
 * 初回セットアップ用サンプル。実際のスプレッドシートIDに書き換えて GAS エディタから一度だけ実行する。
 */
function setupScheduleSpreadsheet_() {
  PropertiesService.getScriptProperties().setProperty(
    SCHEDULE_PROP_KEYS.SHEET_ID, 'REPLACE_WITH_登録スケジュール管理_SPREADSHEET_ID'
  );
}
