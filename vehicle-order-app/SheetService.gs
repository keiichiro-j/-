/**
 * SheetService.gs
 * スプレッドシートの行 ⇔ オブジェクトの相互変換と、在庫・受注リストの基本 CRUD 操作。
 */

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateSheet_(sheetName, headerRow) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getInventorySheet_() {
  return getOrCreateSheet_(SHEET_NAMES.INVENTORY, INVENTORY_HEADER_ROW);
}

function getOrderSheet_() {
  return getOrCreateSheet_(SHEET_NAMES.ORDERS, ORDER_HEADER_ROW);
}

/**
 * シートの全データ行をオブジェクト配列に変換する。
 * 戻り値の各要素には rowNumber（1-indexed, ヘッダー込みの実シート行番号）を含む。
 */
function readAllRows_(sheet, columns, keyField) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var keyIndex = buildColIndex_(columns)[keyField];
  var values = sheet.getRange(2, 1, lastRow - 1, columns.length).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var rowValues = values[i];
    if (!rowValues[keyIndex]) continue; // キー列が空の行（末尾の空行等）はスキップ
    rows.push(rowToObject_(rowValues, columns, i + 2));
  }
  return rows;
}

/**
 * シートのセル値をクライアントへ返せる形（プリミティブ）に変換する。
 * スプレッドシートは「入港予定日」等の date 型セルや、日付らしい文字列を
 * 貼り付けた text 列も自動的に Date 型として保持することがある。
 * Date のまま google.script.run で返すとシリアライズに失敗し、クライアント側の
 * 成功ハンドラに null が渡ってしまう（在庫一覧が読み込めなくなる不具合の原因）ため、
 * 宣言された type に関わらず Date 値は必ずプリミティブへ変換する。
 */
function rowToObject_(rowValues, columns, rowNumber) {
  var obj = { rowNumber: rowNumber };
  columns.forEach(function (col, i) {
    var v = rowValues[i];
    if (v instanceof Date) {
      obj[col.key] = col.type === 'datetime'
        ? v.getTime()
        : Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else {
      obj[col.key] = v === '' ? null : v;
    }
  });
  return obj;
}

function objectToRow_(obj, columns) {
  return columns.map(function (col) {
    var v = obj[col.key];
    if (v === undefined || v === null || v === '') return '';
    if (col.type === 'datetime' && typeof v === 'number') {
      return new Date(v);
    }
    return v;
  });
}

/**
 * 指定シート内からキー列の値で1行検索する。見つからない場合は null。
 */
function findRowByKey_(sheet, columns, keyField, keyValue) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var keyIndex1 = buildColIndex_(columns)[keyField] + 1;
  var keyValues = sheet.getRange(2, keyIndex1, lastRow - 1, 1).getValues();
  for (var i = 0; i < keyValues.length; i++) {
    if (String(keyValues[i][0]) === String(keyValue)) {
      return i + 2; // 実シート行番号
    }
  }
  return null;
}

// ===== 在庫 =====

function listInventory() {
  return readAllRows_(getInventorySheet_(), INVENTORY_COLUMNS, 'commission');
}

function findInventoryRowNumber_(sheet, commission) {
  return findRowByKey_(sheet, INVENTORY_COLUMNS, 'commission', commission);
}

function findInventoryVehicle(commission) {
  var sheet = getInventorySheet_();
  var rowNumber = findInventoryRowNumber_(sheet, commission);
  if (!rowNumber) return null;
  return rowToObject_(
    sheet.getRange(rowNumber, 1, 1, INVENTORY_COLUMNS.length).getValues()[0],
    INVENTORY_COLUMNS,
    rowNumber
  );
}

function createInventoryVehicle(vehicle) {
  var sheet = getInventorySheet_();
  if (findInventoryRowNumber_(sheet, vehicle.commission)) {
    throw new Error('同一のコミッションが既に登録されています: ' + vehicle.commission);
  }
  var data = Object.assign({ holdStatus: HOLD_STATUS.AVAILABLE }, vehicle);
  sheet.appendRow(objectToRow_(data, INVENTORY_COLUMNS));
  return data;
}

function updateInventoryVehicle_(sheet, rowNumber, patch) {
  var current = rowToObject_(
    sheet.getRange(rowNumber, 1, 1, INVENTORY_COLUMNS.length).getValues()[0],
    INVENTORY_COLUMNS,
    rowNumber
  );
  var merged = Object.assign({}, current, patch, { commission: current.commission });
  sheet.getRange(rowNumber, 1, 1, INVENTORY_COLUMNS.length).setValues([objectToRow_(merged, INVENTORY_COLUMNS)]);
  return merged;
}

function deleteInventoryRow_(sheet, rowNumber) {
  sheet.deleteRow(rowNumber);
}

// ===== 受注リスト =====

function listOrders() {
  return readAllRows_(getOrderSheet_(), ORDER_COLUMNS, 'commission');
}

function appendOrder_(order) {
  var sheet = getOrderSheet_();
  sheet.appendRow(objectToRow_(order, ORDER_COLUMNS));
  return order;
}
