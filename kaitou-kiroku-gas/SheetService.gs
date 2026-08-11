/**
 * SheetService.gs
 * スプレッドシートをDBとして使うための基盤（企画書 8. 実装方式）。
 * 初回アクセス時にスプレッドシートとシートを自動生成し、Script Propertiesに保存する。
 */

function getOrCreateSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_KEYS.SPREADSHEET_ID);
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (e) {
      // 削除等で開けない場合は再作成する
    }
  }
  var ss = SpreadsheetApp.create(DB_SPREADSHEET_NAME);
  // 新規作成直後の既定シート（ロケールにより名称は不定）を Sets シートとして流用する
  var defaultSheet = ss.getSheets()[0];
  defaultSheet.setName(SHEET_NAMES.SETS);
  writeHeader_(defaultSheet, SETS_HEADER_ROW);
  props.setProperty(PROP_KEYS.SPREADSHEET_ID, ss.getId());
  return ss;
}

function writeHeader_(sheet, header) {
  sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function getSheet_(name) {
  var ss = getOrCreateSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    writeHeader_(sheet, name === SHEET_NAMES.SETS ? SETS_HEADER_ROW : ANSWERS_HEADER_ROW);
  }
  return sheet;
}

function readAllRows_(sheet, colIndex) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var keys = Object.keys(colIndex);
  return values
    .map(function (row, i) {
      var obj = { _row: i + 2 };
      keys.forEach(function (key) {
        obj[key] = row[colIndex[key]];
      });
      return obj;
    })
    .filter(function (obj) { return String(obj.id !== undefined ? obj.id : obj.setId).length > 0; });
}

function rowFromObject_(obj, columns) {
  return columns.map(function (c) {
    var v = obj[c.key];
    return v === undefined || v === null ? '' : v;
  });
}

function generateId_() {
  return Utilities.getUuid();
}

function nowIso_() {
  return new Date().toISOString();
}
