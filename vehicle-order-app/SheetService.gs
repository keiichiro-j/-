/**
 * SheetService.gs
 * スプレッドシートの行 ⇔ オブジェクトの相互変換と、在庫・Hold・受注リストの基本 CRUD 操作。
 */

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateSheet_(sheetName, headerRow, textColumnIndexes1) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
    sheet.setFrozenRows(1);
    applyTextColumnFormat_(sheet, textColumnIndexes1);
  }
  return sheet;
}

/**
 * 指定した列を「書式なしテキスト」に設定する。
 * コミッション（車両特定番号）は数字のみの値（例: 0583911111）だと、
 * 何も設定しない場合Googleスプレッドシートが自動でNumber型に変換し、
 * 先頭の0が消えてしまう。列の書式をあらかじめテキストにしておくことで、
 * 貼り付け・入力時にこの自動変換が起きないようにする。
 */
function applyTextColumnFormat_(sheet, columnIndexes1) {
  if (!columnIndexes1 || !columnIndexes1.length) return;
  var numRows = Math.max(sheet.getMaxRows() - 1, 1000);
  columnIndexes1.forEach(function (col1) {
    sheet.getRange(2, col1, numRows, 1).setNumberFormat('@');
  });
}

function getInventorySheet_() {
  return getOrCreateSheet_(SHEET_NAMES.INVENTORY, INVENTORY_HEADER_ROW, [inventoryColIndex1('commission')]);
}

function getHoldsSheet_() {
  return getOrCreateSheet_(SHEET_NAMES.HOLDS, HOLD_HEADER_ROW, [holdColIndex1('commission')]);
}

function getOrderSheet_() {
  return getOrCreateSheet_(SHEET_NAMES.ORDERS, ORDER_HEADER_ROW, [orderColIndex1('commission')]);
}

/**
 * 既存のスプレッドシートに対して、コミッション列を書式なしテキストへ設定し直す
 * 一回限りのメンテナンス関数。スクリプトエディタから手動で一度だけ実行する
 * （README参照）。既にNumber型に変換され先頭の0が消えてしまった値は、
 * このスクリプトを実行しても自動では復元されないため、該当セルは
 * 手動で正しい値を入力し直す必要がある。
 */
function formatCommissionColumnsAsText_() {
  applyTextColumnFormat_(getInventorySheet_(), [inventoryColIndex1('commission')]);
  applyTextColumnFormat_(getHoldsSheet_(), [holdColIndex1('commission')]);
  applyTextColumnFormat_(getOrderSheet_(), [orderColIndex1('commission')]);
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

// ===== 在庫リスト =====

function listInventory() {
  var vehicles = readAllRows_(getInventorySheet_(), INVENTORY_COLUMNS, 'commission');
  return attachHoldInfo_(vehicles);
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

function updateInventoryVehicle_(sheet, rowNumber, patch) {
  var current = rowToObject_(
    sheet.getRange(rowNumber, 1, 1, INVENTORY_COLUMNS.length).getValues()[0],
    INVENTORY_COLUMNS,
    rowNumber
  );
  var merged = Object.assign({}, current, patch, { commission: current.commission });
  // Hold登録時など、この行全体を書き直すたびにコミッション欄の書式を明示的に
  // 「書式なしテキスト」へ再設定してから書き込む。これを省くと、その行のコミッション
  // セルがまだテキスト書式になっていない場合（列全体への一括書式設定を実行していない
  // 既存シート等）、数字のみのコミッション（例: 0583911111）の先頭0が、Hold登録の
  // たびに消えてしまう（createHoldRow_・appendOrder_と同じ対策をここにも適用する）。
  sheet.getRange(rowNumber, inventoryColIndex1('commission'), 1, 1).setNumberFormat('@');
  sheet.getRange(rowNumber, 1, 1, INVENTORY_COLUMNS.length).setValues([objectToRow_(merged, INVENTORY_COLUMNS)]);
  return merged;
}

function deleteInventoryRow_(sheet, rowNumber) {
  sheet.deleteRow(rowNumber);
}

// ===== Holdリスト =====

/**
 * Holdリストの1行が指定コミッションのものかどうかを判定する（純粋関数）。
 * スプレッドシートの「コミッション」列は、数字のみの値を貼り付けると自動的に
 * Number型として保持されることがある。呼び出し元（在庫リスト側）から渡される
 * commission は常に文字列のため、厳密等価（===）で比較すると型不一致で
 * 一致しない行が見つからない扱いになってしまう（Hold中のはずなのに受注確定の
 * 担当者チェックが素通りしてしまう不具合・2nd Hold登録時に「Hold情報が
 * 見つかりません」と誤ってエラーになる不具合の原因）。文字列化して比較する。
 */
function holdMatchesCommission_(hold, commission) {
  return String(hold.commission) === String(commission);
}

function listHoldsForCommission_(commission) {
  var sheet = getHoldsSheet_();
  return readAllRows_(sheet, HOLD_COLUMNS, 'commission').filter(function (h) {
    return holdMatchesCommission_(h, commission);
  });
}

/**
 * 指定コミッションの Hold行を { first, second } の形で返す（見つからなければ null）。
 */
function getHoldsForCommission_(commission) {
  var rows = listHoldsForCommission_(commission);
  return {
    first: rows.find(function (h) { return h.rank === HOLD_RANK.FIRST; }) || null,
    second: rows.find(function (h) { return h.rank === HOLD_RANK.SECOND; }) || null
  };
}

function findHoldRowNumber_(sheet, commission, rank) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues(); // commission, rank は先頭2列
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(commission) && values[i][1] === rank) {
      return i + 2;
    }
  }
  return null;
}

function createHoldRow_(holdRecord) {
  var sheet = getHoldsSheet_();
  var newRow = sheet.getLastRow() + 1;
  // appendRow経由の書き込みは、シート作成時に設定した「書式なしテキスト」が
  // 効かず数字のみのコミッション（例: 0583911111）の先頭0が消えてしまうことが
  // あるため、書き込み先の行を明示的に確保して直前に書式を再設定する
  // （createInventoryVehicle と同じ対策）。
  sheet.getRange(newRow, holdColIndex1('commission'), 1, 1).setNumberFormat('@');
  sheet.getRange(newRow, 1, 1, HOLD_COLUMNS.length).setValues([objectToRow_(holdRecord, HOLD_COLUMNS)]);
  return holdRecord;
}

function updateHoldRow_(sheet, rowNumber, patch) {
  var current = rowToObject_(
    sheet.getRange(rowNumber, 1, 1, HOLD_COLUMNS.length).getValues()[0],
    HOLD_COLUMNS,
    rowNumber
  );
  var merged = Object.assign({}, current, patch);
  // updateInventoryVehicle_ と同様、行全体を書き直す前にコミッション欄の書式を
  // 明示的にテキストへ再設定する（2nd Hold昇格・Hold解除時などにも先頭0を消さない）。
  sheet.getRange(rowNumber, holdColIndex1('commission'), 1, 1).setNumberFormat('@');
  sheet.getRange(rowNumber, 1, 1, HOLD_COLUMNS.length).setValues([objectToRow_(merged, HOLD_COLUMNS)]);
  return merged;
}

function deleteHoldRow_(sheet, rowNumber) {
  sheet.deleteRow(rowNumber);
}

/**
 * 指定コミッションのHold行（1st・2ndとも存在すれば両方）をすべて削除する。
 * 受注確定時に、成立しなかった2nd Holdも含めて後始末するために使う。
 */
function deleteAllHoldRowsForCommission_(commission) {
  var sheet = getHoldsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]) === String(commission)) sheet.deleteRow(i + 2);
  }
}

// ===== 受注リスト =====

function listOrders() {
  return readAllRows_(getOrderSheet_(), ORDER_COLUMNS, 'commission');
}

function appendOrder_(order) {
  var sheet = getOrderSheet_();
  var newRow = sheet.getLastRow() + 1;
  // createHoldRow_と同様、appendRowだけに頼ると数字のみのコミッションの先頭0が
  // 消えることがあるため、書き込み直前に対象セルの書式を明示的に設定する。
  sheet.getRange(newRow, orderColIndex1('commission'), 1, 1).setNumberFormat('@');
  sheet.getRange(newRow, 1, 1, ORDER_COLUMNS.length).setValues([objectToRow_(order, ORDER_COLUMNS)]);
  return order;
}
