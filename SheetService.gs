/**
 * SheetService.gs
 * スプレッドシートの行 ⇔ 車両オブジェクトの相互変換と、基本的な CRUD 操作。
 */

/**
 * シートの全データ行をオブジェクト配列に変換する。
 * 戻り値の各要素には rowNumber（1-indexed, ヘッダー込みの実シート行番号）を含む。
 */
function readAllRows_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var rowValues = values[i];
    // OCN が空の行（末尾の空行等）はスキップ
    if (!rowValues[COL_INDEX.ocn]) continue;
    rows.push(rowToObject_(rowValues, i + 2));
  }
  return rows;
}

function rowToObject_(rowValues, rowNumber) {
  var obj = { rowNumber: rowNumber };
  COLUMNS.forEach(function (col, i) {
    var v = rowValues[i];
    if (col.type === 'date' && v instanceof Date) {
      obj[col.key] = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else {
      obj[col.key] = v;
    }
  });
  return obj;
}

function objectToRow_(obj) {
  return COLUMNS.map(function (col) {
    var v = obj[col.key];
    if (v === undefined || v === null) return '';
    if (col.type === 'date' && typeof v === 'string' && v) {
      var d = new Date(v);
      return isNaN(d.getTime()) ? v : d;
    }
    return v;
  });
}

/**
 * 指定タブ内から OCN で1行検索する。見つからない場合は null。
 */
function findRowByOcn_(sheet, ocn) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var ocnValues = sheet.getRange(2, colIndex1('ocn'), lastRow - 1, 1).getValues();
  for (var i = 0; i < ocnValues.length; i++) {
    if (String(ocnValues[i][0]) === String(ocn)) {
      return i + 2; // 実シート行番号
    }
  }
  return null;
}

/**
 * 車両一覧取得（拠点1つ）
 */
function listVehicles(companyId, tabName) {
  var sheet = getOrCreateSheet(companyId, tabName);
  return readAllRows_(sheet).map(function (row) {
    row.companyId = companyId;
    row.tabName = tabName;
    return row;
  });
}

/**
 * 車両一覧取得（3拠点横断・在庫タブのみ／販売済含む場合は tabNames を指定）
 */
function listVehiclesAcrossCompanies(tabNames) {
  var targetTabs = tabNames && tabNames.length ? tabNames : STOCK_TAB_NAMES;
  var result = [];
  getCompanies().forEach(function (company) {
    targetTabs.forEach(function (tabName) {
      result = result.concat(listVehicles(company.id, tabName));
    });
  });
  return result;
}

/**
 * OCN・車台番号で全社横断の重複チェック用に走査する
 */
function findVehicleAnywhere_(predicate) {
  var found = [];
  getCompanies().forEach(function (company) {
    ALL_TAB_NAMES.forEach(function (tabName) {
      var sheet = getOrCreateSheet(company.id, tabName);
      readAllRows_(sheet).forEach(function (row) {
        if (predicate(row)) {
          row.companyId = company.id;
          row.tabName = tabName;
          found.push(row);
        }
      });
    });
  });
  return found;
}

/**
 * 新規車両登録
 */
function createVehicle(companyId, tabName, vehicle) {
  validateVehicle(vehicle, { isNew: true });
  var sheet = getOrCreateSheet(companyId, tabName);
  var row = objectToRow_(vehicle);
  sheet.appendRow(row);
  var result = Object.assign({}, vehicle);
  result.companyId = companyId;
  result.tabName = tabName;
  return result;
}

/**
 * 車両更新（OCNをキーに1行分を上書き）
 */
function updateVehicle(companyId, tabName, ocn, patch) {
  var sheet = getOrCreateSheet(companyId, tabName);
  var rowNumber = findRowByOcn_(sheet, ocn);
  if (!rowNumber) throw new Error('該当車両が見つかりません（OCN: ' + ocn + '）');

  var current = rowToObject_(
    sheet.getRange(rowNumber, 1, 1, COLUMNS.length).getValues()[0],
    rowNumber
  );
  var merged = Object.assign({}, current, patch, { ocn: current.ocn });
  validateVehicle(merged, { isNew: false, currentRowNumber: rowNumber, companyId: companyId, tabName: tabName });

  sheet.getRange(rowNumber, 1, 1, COLUMNS.length).setValues([objectToRow_(merged)]);
  return merged;
}

function findVehicle(companyId, tabName, ocn) {
  var sheet = getOrCreateSheet(companyId, tabName);
  var rowNumber = findRowByOcn_(sheet, ocn);
  if (!rowNumber) return null;
  var row = rowToObject_(sheet.getRange(rowNumber, 1, 1, COLUMNS.length).getValues()[0], rowNumber);
  row.companyId = companyId;
  row.tabName = tabName;
  return row;
}

/**
 * 指定セルに値を1件だけ書き込む（PDFリンク自動反映等で使用）
 */
function setCellValue_(sheet, rowNumber, key, value) {
  sheet.getRange(rowNumber, colIndex1(key)).setValue(value);
}

/**
 * 車両の削除。削除前のスナップショットを返す（変更履歴・取消機能で使用）。
 */
function deleteVehicleRow_(companyId, tabName, ocn) {
  var sheet = getOrCreateSheet(companyId, tabName);
  var rowNumber = findRowByOcn_(sheet, ocn);
  if (!rowNumber) throw new Error('該当車両が見つかりません（OCN: ' + ocn + '）');
  var vehicle = rowToObject_(sheet.getRange(rowNumber, 1, 1, COLUMNS.length).getValues()[0], rowNumber);
  vehicle.companyId = companyId;
  vehicle.tabName = tabName;
  sheet.deleteRow(rowNumber);
  return vehicle;
}

/**
 * 削除の取り消し用に、以前のスナップショットをそのままの内容で1行追加する
 * （新規登録と異なり重複チェックは行わない）。
 */
function restoreVehicleRow_(companyId, tabName, vehicleData) {
  var sheet = getOrCreateSheet(companyId, tabName);
  sheet.appendRow(objectToRow_(vehicleData));
}
