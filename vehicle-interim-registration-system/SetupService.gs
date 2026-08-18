/**
 * SetupService.gs
 * 実物のテンプレートシートが手元にない場合に、Constants.gs のレイアウト定義から
 * 逆算して4ファミリー分の雛形シートを自動生成する。GASエディタから
 * setupTemplateSheets() を一度だけ手動実行する。
 *
 * 生成されるのはあくまで「動作する最低限のレイアウト」。罫線の太さ・結合セル・
 * 印刷範囲などは、生成後に見た目を見ながら手で調整してよい(Constants.gs の
 * セル位置さえ変えなければ、処理には影響しない)。
 *
 * 4ファミリーとも「ラベル(A列)+値(B列〜最終列を結合)」の縦積み共通項目バナーで統一しており、
 * 幅が異なる(登録証明4列〜名義変更11列)テンプレート間でもレイアウトが崩れない。
 */

var THEME = {
  ink: '#000000',
  headerFill: '#F1F1F1',
  badgeFill: '#D9D9D9'
};

var FONT_FAMILY = 'Roboto';

/**
 * GASエディタの関数選択プルダウンからこれを選んで実行する(初回セットアップ用、1回だけでよい)。
 * 再実行すると4シートすべて作り直す(既存の内容は消える)ので、運用開始後は実行しないこと。
 */
function setupTemplateSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  DOC_TYPE_OPTIONS.forEach(function (docType) {
    buildTemplateSheet_(getOrCreateSheetForSetup_(ss, SHEET_NAMES[docType]), docType);
  });

  // 新規スプレッドシート作成時のデフォルト「シート1」が残っていれば削除する
  var defaultSheet = ss.getSheetByName('シート1');
  if (defaultSheet && ss.getSheets().length > DOC_TYPE_OPTIONS.length) {
    ss.deleteSheet(defaultSheet);
  }

  SpreadsheetApp.getUi().alert('4種類のテンプレートシートを作成しました。内容を確認してください。');
}

function getOrCreateSheetForSetup_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function buildTemplateSheet_(sheet, docType) {
  var columns = VEHICLE_COLUMNS[docType];
  var maxCol = maxColumnOf_(columns);
  sheet.clear();

  buildTitleBanner_(sheet, maxCol);
  buildCommonFieldsBanner_(sheet, maxCol);
  buildVehicleTableHeader_(sheet, columns, FIELD_LABELS[docType]);
  applyVehicleDataStyle_(sheet, columns, docType);
  applyFieldWidths_(sheet, columns);

  if (HAS_TOTAL_ROW[docType]) {
    buildTotalRow_(sheet, columns, maxCol, docType);
  }

  buildNotesFooter_(sheet, docType, maxCol);
  finishSheetStyle_(sheet, maxCol, docType);
}

function maxColumnOf_(columns) {
  return Math.max.apply(null, Object.keys(columns).map(function (k) { return columns[k]; }));
}

/**
 * 新規シートはデフォルト26列(Z列)までしかないため、必要な列数に満たなければ追加する。
 */
function ensureColumns_(sheet, minCols) {
  var current = sheet.getMaxColumns();
  if (current < minCols) {
    sheet.insertColumnsAfter(current, minCols - current);
  }
}

/**
 * 1行目: 依頼書タイトル。2行目: 発行元(左)+バリエーション表示(右端セル、Constants.gsの
 * COMMON_CELLS.variantBadgeRowと対応)。バリエーション表示の実際の値(飛騨/軽自動車/
 * 複合抹消/単純抹消)は申請ごとにTemplateService.gsが書き込むため、テンプレート生成時は空欄。
 */
function buildTitleBanner_(sheet, maxCol) {
  ensureColumns_(sheet, maxCol);

  var titleRange = sheet.getRange(COMMON_CELLS.titleRow, 1, 1, maxCol);
  titleRange.merge();
  titleRange.setFontFamily(FONT_FAMILY);
  titleRange.setFontSize(15);
  titleRange.setFontWeight('bold');
  titleRange.setFontColor(THEME.ink);
  titleRange.setHorizontalAlignment('center');
  titleRange.setVerticalAlignment('middle');
  sheet.setRowHeight(COMMON_CELLS.titleRow, 34);

  var issuerRange = sheet.getRange(COMMON_CELLS.issuerRow, 1, 1, Math.max(1, maxCol - 1));
  if (maxCol > 1) issuerRange.merge();
  issuerRange.setFontFamily(FONT_FAMILY);
  issuerRange.setFontSize(10);
  issuerRange.setHorizontalAlignment('left');
  issuerRange.setVerticalAlignment('middle');

  var badgeCell = sheet.getRange(COMMON_CELLS.variantBadgeRow, maxCol);
  badgeCell.setFontFamily(FONT_FAMILY);
  badgeCell.setFontSize(11);
  badgeCell.setFontWeight('bold');
  badgeCell.setHorizontalAlignment('center');
  badgeCell.setVerticalAlignment('middle');

  sheet.setRowHeight(COMMON_CELLS.issuerRow, 20);
}

/**
 * 送付日・送付便・登録日・依頼会社名・担当者名。ラベル(A列)+値(B列〜最終列を結合)の
 * 縦積みで統一する(名義変更11列/登録証明4列など幅が違っても崩れないようにするため)。
 */
function buildCommonFieldsBanner_(sheet, maxCol) {
  buildLabelValueRow_(sheet, COMMON_CELLS.sendDateRow, maxCol, '送付日');
  buildLabelValueRow_(sheet, COMMON_CELLS.sendBatchRow, maxCol, '送付便');
  buildLabelValueRow_(sheet, COMMON_CELLS.regDateRow, maxCol, '登録日');
  buildLabelValueRow_(sheet, COMMON_CELLS.companyRow, maxCol, '依頼会社名');
  buildLabelValueRow_(sheet, COMMON_CELLS.managerRow, maxCol, '担当者名');
}

function buildLabelValueRow_(sheet, row, maxCol, labelText) {
  var labelCell = sheet.getRange(row, 1);
  labelCell.setValue(labelText);
  labelCell.setBackground(THEME.headerFill);
  labelCell.setFontFamily(FONT_FAMILY);
  labelCell.setFontSize(11);
  labelCell.setFontWeight('bold');
  labelCell.setFontColor(THEME.ink);
  labelCell.setHorizontalAlignment('center');
  labelCell.setVerticalAlignment('middle');

  var valueRange = sheet.getRange(row, 2, 1, Math.max(1, maxCol - 1));
  if (maxCol > 1) valueRange.merge();
  valueRange.setFontFamily(FONT_FAMILY);
  valueRange.setFontSize(12);
  valueRange.setFontColor(THEME.ink);
  valueRange.setHorizontalAlignment('left');
  valueRange.setVerticalAlignment('middle');

  sheet.getRange(row, 1, 1, maxCol)
    .setBorder(true, true, true, true, true, false, THEME.ink, SpreadsheetApp.BorderStyle.SOLID);
  sheet.setRowHeight(row, 22);
}

/**
 * 車両(明細)欄の見出し行。1列目は全ファミリー共通で「番号」(連番、TemplateService.gsが
 * 申請ごとに書き込む)。
 */
function buildVehicleTableHeader_(sheet, columns, labels) {
  var noCell = sheet.getRange(COMMON_CELLS.tableHeaderRow, 1);
  noCell.setValue('番号');
  styleHeaderCell_(noCell);

  Object.keys(columns).forEach(function (key) {
    var cell = sheet.getRange(COMMON_CELLS.tableHeaderRow, columns[key]);
    cell.setValue(labels[key] || key);
    styleHeaderCell_(cell);
  });
  sheet.setRowHeight(COMMON_CELLS.tableHeaderRow, 40);
}

function styleHeaderCell_(cell) {
  cell.setBackground(THEME.headerFill);
  cell.setFontColor(THEME.ink);
  cell.setFontFamily(FONT_FAMILY);
  cell.setFontWeight('bold');
  cell.setFontSize(10);
  cell.setHorizontalAlignment('center');
  cell.setVerticalAlignment('middle');
  cell.setWrap(true);
}

/**
 * 明細行(COMMON_CELLS.vehicleStartRow 〜 MAX_ROWS[docType]分)の文字スタイル・行高を設定する。
 * 罫線はシート全体をまとめて finishSheetStyle_ で引くため、ここでは扱わない。
 * 「番号」列は空欄のままにしておき(TemplateService.gsが申請ごとに書き込む)、
 * 未使用行を空のまま複製しても不自然な連番が印字されないようにする。
 */
function applyVehicleDataStyle_(sheet, columns, docType) {
  var maxCol = maxColumnOf_(columns);
  var maxRows = MAX_ROWS[docType];
  var range = sheet.getRange(COMMON_CELLS.vehicleStartRow, 1, maxRows, maxCol);
  range.setFontColor(THEME.ink);
  range.setFontFamily(FONT_FAMILY);
  range.setFontSize(10);
  range.setHorizontalAlignment('center');
  range.setVerticalAlignment('middle');

  for (var i = 0; i < maxRows; i++) {
    sheet.setRowHeight(COMMON_CELLS.vehicleStartRow + i, 22);
  }
}

function applyFieldWidths_(sheet, columns) {
  sheet.setColumnWidth(1, 40); // 番号列
  Object.keys(columns).forEach(function (key) {
    sheet.setColumnWidth(columns[key], FIELD_WIDTHS[key] || 80);
  });
}

/**
 * 合計行(HAS_TOTAL_ROWがtrueのファミリーのみ)。数値項目(NUMERIC_FIELD_KEYS)をSUM関数で集計する。
 * このテンプレートを複製して送信ごとの一時シートを作るため(TemplateService.gs)、
 * SUM式もそのまま複製され、各申請の実際のデータに応じて自動的に再計算される。
 */
function buildTotalRow_(sheet, columns, maxCol, docType) {
  var row = totalRowOf_(docType);
  var numericKeys = NUMERIC_FIELD_KEYS[docType];

  var fillRange = sheet.getRange(row, 1, 1, maxCol);
  fillRange.setBackground(THEME.headerFill);
  fillRange.setFontFamily(FONT_FAMILY);
  fillRange.setFontWeight('bold');
  fillRange.setFontSize(10);
  fillRange.setFontColor(THEME.ink);

  var labelSpan = columns[numericKeys[0]] - 1;
  var labelRange = sheet.getRange(row, 1, 1, labelSpan);
  labelRange.merge();
  labelRange.setValue('合計');
  labelRange.setHorizontalAlignment('right');
  labelRange.setVerticalAlignment('middle');

  var firstRow = COMMON_CELLS.vehicleStartRow;
  var lastRow = COMMON_CELLS.vehicleStartRow + MAX_ROWS[docType] - 1;

  numericKeys.forEach(function (key) {
    var col = columns[key];
    var colLetter = columnToLetter_(col);
    sheet.getRange(row, col)
      .setFormula('=SUM(' + colLetter + firstRow + ':' + colLetter + lastRow + ')')
      .setHorizontalAlignment('right')
      .setVerticalAlignment('middle');
  });

  sheet.setRowHeight(row, 24);
}

/**
 * 元データの脚注・注記(名義変更/抹消の記入上の注意、番号変更の必要書類一覧)を
 * 明細欄の下に印字する。
 */
function buildNotesFooter_(sheet, docType, maxCol) {
  var lastDataRow = HAS_TOTAL_ROW[docType]
    ? totalRowOf_(docType)
    : (COMMON_CELLS.vehicleStartRow + MAX_ROWS[docType] - 1);
  var startRow = lastDataRow + 2;

  var lines = [];
  if (docType === DOC_TYPE_TRANSFER) lines = TRANSFER_NOTES;
  else if (docType === DOC_TYPE_CANCELLATION) lines = CANCELLATION_NOTES;
  else if (docType === DOC_TYPE_PLATE_CHANGE) lines = PLATE_CHANGE_REQUIRED_DOCS;

  lines.forEach(function (line, i) {
    var cell = sheet.getRange(startRow + i, 1, 1, maxCol);
    cell.merge();
    cell.setValue(line);
    cell.setFontFamily(FONT_FAMILY);
    cell.setFontSize(9);
    cell.setFontColor(THEME.ink);
    cell.setHorizontalAlignment('left');
    cell.setVerticalAlignment('middle');
  });
}

/**
 * フォント統一・見出し行の固定・罫線など、シート全体の仕上げ。
 * 罫線は「明細の表」として一体になっている見出し行〜最終データ行(合計行があればそこまで)
 * にだけ格子状に引く。
 */
function finishSheetStyle_(sheet, maxCol, docType) {
  var lastRow = HAS_TOTAL_ROW[docType]
    ? totalRowOf_(docType)
    : (COMMON_CELLS.vehicleStartRow + MAX_ROWS[docType] - 1);

  sheet.getRange(1, 1, lastRow, maxCol).setFontFamily(FONT_FAMILY);

  var tableRows = lastRow - COMMON_CELLS.tableHeaderRow + 1;
  sheet.getRange(COMMON_CELLS.tableHeaderRow, 1, tableRows, maxCol)
    .setBorder(true, true, true, true, true, true, THEME.ink, SpreadsheetApp.BorderStyle.SOLID);

  sheet.setFrozenRows(COMMON_CELLS.tableHeaderRow);
  sheet.setHiddenGridlines(true);
}

/**
 * 列番号(1始まり)をA1形式の列名("A","B",...,"AA"等)に変換する。
 */
function columnToLetter_(col) {
  var letter = '';
  while (col > 0) {
    var rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}
