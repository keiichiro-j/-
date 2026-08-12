/**
 * ScheduleService.gs
 * 登録スケジュール（休日・締切）データのスプレッドシート CRUD、権限・支局マスタ管理。
 * 予定データは月ごとに「yyyy-MM」形式のシートタブへ分けて保存する（例: 2026-08）。
 */

var SCHEDULE_HEADER_ROW = ['ID', '日付', '種別', '支局', 'メモ', '作成者', '作成日時', '更新日時'];
var SCHEDULE_COL = { id: 0, date: 1, type: 2, office: 3, memo: 4, createdBy: 5, createdAt: 6, updatedAt: 7 };
var SCHEDULE_MONTH_SHEET_PATTERN = /^\d{4}-\d{2}$/;

function getScheduleSpreadsheetId_() {
  var id = PropertiesService.getScriptProperties().getProperty(SCHEDULE_PROP_KEYS.SHEET_ID);
  if (!id) throw new Error('登録スケジュール用スプレッドシートが未設定です（Script Properties: SCHEDULE_SHEET_ID）');
  return id;
}

function getScheduleSpreadsheet_() {
  return SpreadsheetApp.openById(getScheduleSpreadsheetId_());
}

/**
 * 指定月（'yyyy-MM'）のシートを取得する。存在しなければヘッダー付きで新規作成し、
 * 既存の月タブと日付順になるようタブ位置を並べ替える。
 */
function getScheduleMonthSheet_(monthKey) {
  var ss = getScheduleSpreadsheet_();
  var sheet = ss.getSheetByName(monthKey);
  if (!sheet) {
    sheet = ss.insertSheet(monthKey);
    sheet.getRange(1, 1, 1, SCHEDULE_HEADER_ROW.length).setValues([SCHEDULE_HEADER_ROW]);
    sheet.setFrozenRows(1);
    repositionMonthSheet_(ss, sheet, monthKey);
  }
  return sheet;
}

/**
 * 新規作成した月シートを、既存タブと時系列順になる位置へ移動する。
 */
function repositionMonthSheet_(ss, sheet, monthKey) {
  var others = ss.getSheets().filter(function (s) { return s.getSheetId() !== sheet.getSheetId(); });
  var insertBeforeCount = others.filter(function (s) { return s.getName() < monthKey; }).length;
  ss.setActiveSheet(sheet);
  ss.moveActiveSheet(insertBeforeCount + 1);
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

/**
 * 指定月シート（存在しない場合は空配列）のイベント一覧を読み取る。
 */
function readMonthEvents_(ss, monthKey) {
  var sheet = ss.getSheetByName(monthKey);
  if (!sheet) return [];
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
 * ID から該当行を探す。hintDate（'yyyy-MM-dd'）が分かっていればその月シートを優先的に探し、
 * 見つからない場合は全ての月シートを走査する。
 */
function findScheduleEventLocation_(id, hintDate) {
  var ss = getScheduleSpreadsheet_();
  var hintKey = hintDate ? monthKeyOfDate_(hintDate) : null;
  var candidateNames = [];
  if (hintKey) candidateNames.push(hintKey);
  ss.getSheets().forEach(function (sheet) {
    var name = sheet.getName();
    if (SCHEDULE_MONTH_SHEET_PATTERN.test(name) && candidateNames.indexOf(name) === -1) {
      candidateNames.push(name);
    }
  });

  for (var i = 0; i < candidateNames.length; i++) {
    var sheet = ss.getSheetByName(candidateNames[i]);
    if (!sheet) continue;
    var rowNumber = findScheduleRowById_(sheet, id);
    if (rowNumber) return { ss: ss, sheet: sheet, rowNumber: rowNumber };
  }
  return null;
}

/**
 * 期間・支局で絞り込んだイベント一覧を取得する（startDate/endDate は 'yyyy-MM-dd'、両端含む）。
 * 期間にまたがる月シートをすべて読み取ってから絞り込む。
 */
function listScheduleEvents(startDate, endDate, officeFilter) {
  var ss = getScheduleSpreadsheet_();
  var events = [];
  enumerateMonthKeys_(startDate, endDate).forEach(function (monthKey) {
    events = events.concat(readMonthEvents_(ss, monthKey));
  });
  events = events.filter(function (e) { return e.date >= startDate && e.date <= endDate; });
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
  var sheet = getScheduleMonthSheet_(monthKeyOfDate_(event.date));
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
  var location = findScheduleEventLocation_(id, patch && patch.date);
  if (!location) throw new Error('該当する予定が見つかりません');

  var rawValues = location.sheet.getRange(location.rowNumber, 1, 1, SCHEDULE_HEADER_ROW.length).getValues()[0];
  var current = scheduleRowToObject_(rawValues, location.rowNumber);
  var merged = Object.assign({}, current, patch, { id: current.id });
  validateScheduleEvent_(merged);

  var now = new Date();
  var currentMonthKey = location.sheet.getName();
  var targetMonthKey = monthKeyOfDate_(merged.date);
  var newRow = [
    merged.id, merged.date, merged.type, merged.office || '', merged.memo || '',
    merged.createdBy, rawValues[SCHEDULE_COL.createdAt], now
  ];

  if (targetMonthKey !== currentMonthKey) {
    // 日付変更により月をまたぐ場合は、旧シートの行を削除して新しい月のシートへ追記する
    location.sheet.deleteRow(location.rowNumber);
    getScheduleMonthSheet_(targetMonthKey).appendRow(newRow);
  } else {
    location.sheet.getRange(location.rowNumber, 1, 1, SCHEDULE_HEADER_ROW.length).setValues([newRow]);
  }

  merged.updatedAt = scheduleFormatDateTime_(now);
  return merged;
}

function deleteScheduleEvent(id, hintDate) {
  assertScheduleEditable_();
  var location = findScheduleEventLocation_(id, hintDate);
  if (!location) throw new Error('該当する予定が見つかりません');
  location.sheet.deleteRow(location.rowNumber);
}

/**
 * 初回セットアップ用サンプル。実際のスプレッドシートIDに書き換えて GAS エディタから一度だけ実行する。
 * 月ごとのシートタブ（例: 2026-08）は、その月の予定が最初に登録されたタイミングで自動生成される。
 */
function setupScheduleSpreadsheet_() {
  PropertiesService.getScriptProperties().setProperty(
    SCHEDULE_PROP_KEYS.SHEET_ID, 'REPLACE_WITH_登録スケジュール管理_SPREADSHEET_ID'
  );
}
