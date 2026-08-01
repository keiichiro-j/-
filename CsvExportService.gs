/**
 * CsvExportService.gs
 * 10.4 期間指定CSV出力機能
 *
 * 月単位、または任意の仕入期間（開始日〜終了日）を指定して、該当する車両データを
 * CSV文字列として出力する。拠点切替表示・3拠点横断表示のどちらの状態からでも
 * 呼び出せるよう、対象データは呼び出し側（Api.gs）から渡す。
 */

/**
 * @param {Array<Object>} vehicles
 * @param {string} dateFrom 'yyyy-MM-dd'（仕入日の範囲開始・省略可）
 * @param {string} dateTo   'yyyy-MM-dd'（仕入日の範囲終了・省略可）
 * @return {string} CSV文字列（BOM付き・UTF-8）
 */
function exportVehiclesToCsv(vehicles, dateFrom, dateTo) {
  var filtered = vehicles.filter(function (v) {
    if (!v.purchaseDate) return false;
    if (dateFrom && v.purchaseDate < dateFrom) return false;
    if (dateTo && v.purchaseDate > dateTo) return false;
    return true;
  });
  return buildCsv_(filtered);
}

/**
 * ビジネスロジックからCSV文字列を組み立てる（純粋関数）。
 */
function buildCsv_(vehicles) {
  var header = ['拠点', 'タブ'].concat(HEADER_ROW);
  var lines = [header.map(csvEscape_).join(',')];

  vehicles.forEach(function (v) {
    var row = [v.companyId || '', v.tabName || ''].concat(
      COLUMNS.map(function (col) {
        var val = v[col.key];
        return val === undefined || val === null ? '' : val;
      })
    );
    lines.push(row.map(csvEscape_).join(','));
  });

  return '﻿' + lines.join('\r\n');
}

function csvEscape_(value) {
  var s = String(value);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
