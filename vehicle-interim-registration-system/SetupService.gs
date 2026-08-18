/**
 * SetupService.gs
 * 実物のテンプレートシートが手元にない場合に、Constants.gs のレイアウト定義から
 * 逆算して4ファミリー分の雛形シートを自動生成する。GASエディタから
 * setupTemplateSheets() を一度だけ手動実行する。
 *
 * 生成されるのはあくまで「動作する最低限のレイアウト」。罫線の太さや微調整などは、
 * 生成後に見た目を見ながら手で調整してよい(Constants.gs のセル位置さえ変えなければ、
 * 処理には影響しない)。
 *
 * 元の中間登録書類送付書(Numbersファイル)の構成にできるだけ近づけてあり、
 * ・登録区分などは選択肢の数だけ列を用意するチェックボックス形式(該当列に〇を印字)
 * ・「送付日・送付便」と「依頼会社名」、「登録日」と「担当者名」を横並び1行にまとめる
 * という2点を再現している(buildVehicleColumnLayout_ / bannerSplit_ は Constants.gs 参照)。
 */

var THEME = {
  ink: '#000000',
  headerFill: '#F1F1F1',
  badgeFill: '#D9D9D9'
};

var FONT_FAMILY = 'Roboto';

// チェックボックス項目(登録区分など)の1列あたりの幅(px)。名義変更は登録区分(7択)+
// 記載変更・更正(2択)、抹消は登録区分(9択)と列数が多いため、A4横1枚に収まるよう
// 「T移転抹消」等の選択肢見出しは2行に折り返す前提の最小限の幅にしてある。
var CHECKBOX_COL_WIDTH = 42;

// 明細欄1列目(番号)の幅(px)。共通項目バナーの左ラベル("送付日・送付便"等)も
// 同じ1列目を使うため、番号だけなら十分すぎる幅だが、ラベルが折り返して収まるように広めにとる。
var NO_COLUMN_WIDTH = 46;

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
  var spans = FIELD_SPANS[docType];
  var maxCol = VEHICLE_MAX_COL[docType];
  sheet.clear();

  buildTitleBanner_(sheet, docType, maxCol);
  buildCommonFieldsBanner_(sheet, maxCol);
  buildVehicleTableHeader_(sheet, docType, columns, spans, FIELD_LABELS[docType]);
  applyVehicleDataStyle_(sheet, docType, maxCol);
  applyFieldWidths_(sheet, docType);

  if (HAS_TOTAL_ROW[docType]) {
    buildTotalRow_(sheet, columns, maxCol, docType);
  }

  buildNotesFooter_(sheet, docType, maxCol);
  finishSheetStyle_(sheet, maxCol, docType);
}

/**
 * ファミリーの明細欄の最終列を返す(Constants.gs の VEHICLE_MAX_COL を引くだけの薄いラッパー)。
 */
function maxColumnOf_(docType) {
  return VEHICLE_MAX_COL[docType];
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
 * 1行目: 依頼書タイトル(DOC_TYPE_TITLES)。2行目: 発行元(ISSUER_NAME、左)+バリエーション
 * 表示(右端セル、Constants.gsのCOMMON_CELLS.variantBadgeRowと対応)。バリエーション表示の
 * 実際の値(飛騨/軽自動車/複合抹消/単純抹消)は申請ごとにTemplateService.gsが書き込むため、
 * テンプレート生成時は空欄のままにする。
 */
function buildTitleBanner_(sheet, docType, maxCol) {
  ensureColumns_(sheet, maxCol);

  var titleRange = sheet.getRange(COMMON_CELLS.titleRow, 1, 1, maxCol);
  titleRange.merge();
  titleRange.setValue(DOC_TYPE_TITLES[docType]);
  titleRange.setFontFamily(FONT_FAMILY);
  titleRange.setFontSize(14);
  titleRange.setFontWeight('bold');
  titleRange.setFontColor(THEME.ink);
  titleRange.setHorizontalAlignment('center');
  titleRange.setVerticalAlignment('middle');
  sheet.setRowHeight(COMMON_CELLS.titleRow, 32);

  var issuerRange = sheet.getRange(COMMON_CELLS.issuerRow, 1, 1, Math.max(1, maxCol - 1));
  if (maxCol > 1) issuerRange.merge();
  issuerRange.setValue(ISSUER_NAME);
  issuerRange.setFontFamily(FONT_FAMILY);
  issuerRange.setFontSize(10);
  issuerRange.setHorizontalAlignment('left');
  issuerRange.setVerticalAlignment('middle');

  var badgeCell = sheet.getRange(COMMON_CELLS.variantBadgeRow, maxCol);
  badgeCell.setFontFamily(FONT_FAMILY);
  badgeCell.setFontSize(10);
  badgeCell.setFontWeight('bold');
  badgeCell.setHorizontalAlignment('center');
  badgeCell.setVerticalAlignment('middle');

  sheet.setRowHeight(COMMON_CELLS.issuerRow, 18);
}

/**
 * 送付日・送付便+依頼会社名、登録日+担当者名。元データと同じく、それぞれ横並びで
 * 同じ行にまとめる(bannerSplit_ で明細欄の幅に応じて左右の割り付け列を計算する)。
 */
function buildCommonFieldsBanner_(sheet, maxCol) {
  var split = bannerSplit_(maxCol);
  buildBannerRow_(sheet, COMMON_CELLS.sendRow, split, '送付日・送付便', '依頼会社名');
  buildBannerRow_(sheet, COMMON_CELLS.regRow, split, '登録日', '担当者名');
}

function buildBannerRow_(sheet, row, split, leftLabel, rightLabel) {
  styleLabelCell_(sheet.getRange(row, 1), leftLabel);
  styleValueRange_(sheet.getRange(row, split.leftValueCol, 1, split.leftValueSpan));
  styleLabelCell_(sheet.getRange(row, split.rightLabelCol), rightLabel);
  styleValueRange_(sheet.getRange(row, split.rightValueCol, 1, split.rightValueSpan));

  var lastCol = split.rightValueCol + split.rightValueSpan - 1;
  sheet.getRange(row, 1, 1, lastCol)
    .setBorder(true, true, true, true, true, false, THEME.ink, SpreadsheetApp.BorderStyle.SOLID);
  // ラベル("送付日・送付便"等)は1列(NO_COLUMN_WIDTH)に収めるため折り返す。2行分の高さを確保する。
  sheet.setRowHeight(row, 32);
}

function styleLabelCell_(cell, text) {
  cell.setValue(text);
  cell.setBackground(THEME.headerFill);
  cell.setFontFamily(FONT_FAMILY);
  cell.setFontSize(10);
  cell.setFontWeight('bold');
  cell.setFontColor(THEME.ink);
  cell.setHorizontalAlignment('center');
  cell.setVerticalAlignment('middle');
  cell.setWrap(true);
}

function styleValueRange_(range) {
  if (range.getNumColumns() > 1) range.merge();
  range.setFontFamily(FONT_FAMILY);
  range.setFontSize(11);
  range.setFontColor(THEME.ink);
  range.setHorizontalAlignment('left');
  range.setVerticalAlignment('middle');
  range.setWrap(true); // 送付日+送付便を1つの欄にまとめて印字するため、狭いファミリーでも折り返して収める
}

/**
 * 車両(明細)欄の見出し。1列目は全ファミリー共通で「番号」(連番、TemplateService.gsが
 * 申請ごとに書き込む。見出し行2行ぶんを縦結合)。チェックボックス項目(登録区分など)は
 * 見出し行にグループ名(例: 登録区分)を横結合で表示し、その下の行に選択肢を1列ずつ並べる。
 * それ以外の項目は見出し行2行ぶんを縦結合して1つの見出しにする。
 */
function buildVehicleTableHeader_(sheet, docType, columns, spans, labels) {
  var noCell = sheet.getRange(COMMON_CELLS.tableHeaderRow, 1);
  noCell.setValue('番号');
  styleHeaderCell_(noCell);
  sheet.getRange(COMMON_CELLS.tableHeaderRow, 1, 2, 1).merge();

  FIELD_ORDER[docType].forEach(function (key) {
    var span = spans[key];
    var startCol = columns[key];
    var options = CHECKBOX_OPTIONS[key];

    var headerCell = sheet.getRange(COMMON_CELLS.tableHeaderRow, startCol, 1, span);
    if (span > 1) headerCell.merge();
    headerCell.setValue(labels[key] || key);
    styleHeaderCell_(headerCell);

    if (options) {
      options.forEach(function (opt, i) {
        var optCell = sheet.getRange(COMMON_CELLS.checkboxOptionRow, startCol + i);
        optCell.setValue(opt);
        styleHeaderCell_(optCell);
      });
    } else {
      sheet.getRange(COMMON_CELLS.tableHeaderRow, startCol, 2, 1).merge();
    }
  });

  // 見出しは「車台番号\n(下4桁)」のように2行の項目があり、選択肢見出しも折り返すことが
  // あるため、どちらも2行ぶんの高さを確保する(A4横1枚に収まるよう最小限の高さにとどめる)。
  sheet.setRowHeight(COMMON_CELLS.tableHeaderRow, 34);
  sheet.setRowHeight(COMMON_CELLS.checkboxOptionRow, 30);
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
function applyVehicleDataStyle_(sheet, docType, maxCol) {
  var maxRows = MAX_ROWS[docType];
  var range = sheet.getRange(COMMON_CELLS.vehicleStartRow, 1, maxRows, maxCol);
  range.setFontColor(THEME.ink);
  range.setFontFamily(FONT_FAMILY);
  range.setFontSize(10);
  range.setHorizontalAlignment('center');
  range.setVerticalAlignment('middle');
  range.setWrap(true); // 登録番号や備考など、列幅に対して長い文字列が入っても切れずに折り返す

  // A4横1枚(fitw=true)に収まるよう、明細行の高さは最小限にとどめる(最大20行×このファミリー)。
  for (var i = 0; i < maxRows; i++) {
    sheet.setRowHeight(COMMON_CELLS.vehicleStartRow + i, 21);
  }
}

function applyFieldWidths_(sheet, docType) {
  sheet.setColumnWidth(1, NO_COLUMN_WIDTH); // 番号列(共通項目バナーの左ラベルもこの列を使う)
  var columns = VEHICLE_COLUMNS[docType];
  var spans = FIELD_SPANS[docType];
  FIELD_ORDER[docType].forEach(function (key) {
    var startCol = columns[key];
    var span = spans[key];
    if (CHECKBOX_OPTIONS[key]) {
      for (var i = 0; i < span; i++) {
        sheet.setColumnWidth(startCol + i, CHECKBOX_COL_WIDTH);
      }
    } else {
      sheet.setColumnWidth(startCol, FIELD_WIDTHS[key] || 80);
    }
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
    cell.setWrap(true);
    sheet.setRowHeight(startRow + i, 20);
  });
}

/**
 * フォント統一・見出し行の固定・罫線など、シート全体の仕上げ。
 * 罫線は「明細の表」として一体になっている見出し行(2行ぶん)〜最終データ行(合計行があれば
 * そこまで)にだけ格子状に引く。見出しは2行ぶん(項目名+チェックボックス選択肢)を固定する。
 */
function finishSheetStyle_(sheet, maxCol, docType) {
  var lastRow = HAS_TOTAL_ROW[docType]
    ? totalRowOf_(docType)
    : (COMMON_CELLS.vehicleStartRow + MAX_ROWS[docType] - 1);

  sheet.getRange(1, 1, lastRow, maxCol).setFontFamily(FONT_FAMILY);

  var tableRows = lastRow - COMMON_CELLS.tableHeaderRow + 1;
  sheet.getRange(COMMON_CELLS.tableHeaderRow, 1, tableRows, maxCol)
    .setBorder(true, true, true, true, true, true, THEME.ink, SpreadsheetApp.BorderStyle.SOLID);

  sheet.setFrozenRows(COMMON_CELLS.checkboxOptionRow);
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
