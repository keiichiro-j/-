/**
 * SetupService.gs
 * 実物のテンプレートシートが手元にない場合に、Constants.gs のセル位置定義から
 * 逆算して雛形シート(OSS用/紙用)を自動生成する。GASエディタから
 * setupTemplateSheets() を一度だけ手動実行する。
 *
 * 生成されるのはあくまで「動作する最低限のレイアウト」。罫線の太さ・結合セル・
 * 印刷範囲などは、生成後に見た目を見ながら手で調整してよい(Constants.gs の
 * セル位置さえ変えなければ、処理には影響しない)。
 *
 * デザインは「1システム・2フォーマット」として、両シートで同じ配色
 * (アクセントカラー1色)を使い、右上のバッジ文字(OSS / 紙)だけで見分ける。
 */

var THEME = {
  primary: '#2B4A73',       // バナー・見出し・アクセント
  primaryDark: '#1D3555',   // バッジ(タイプ表示)の濃色
  primaryTint: '#E4EAF1',   // ラベルセルの薄色背景
  gridLine: '#C9D2D8',      // 表の罫線(黒より柔らかい色)
  zebra: '#F5F7F9',         // データ行の交互背景
  ink: '#16212B'
};

var OSS_FIELD_LABELS = {
  indivRegDate: '登録日',
  userName: '使用車名',
  chassis: '車台番号\n(下4桁)',
  model: '型式',
  classNum: '類別番号',
  autoTax: '自動車税',
  envTax: '環境性能割',
  weightTax: '重量税',
  hopeNum: '希望\nナンバー',
  yobi: '予備検\n登録車',
  honken: '本検\n登録車',
  shinsho: '身障者\n減免車',
  person: '担当者'
};

var PAPER_FIELD_LABELS = {
  userName: '使用車名',
  chassis: '車台番号\n(下4桁)',
  model: '型式',
  classNum: '類別番号',
  autoTax: '自動車税',
  envTax: '環境性能割',
  weightTax: '重量税',
  hopeNum: '希望\nナンバー',
  yobi: '予備検\n登録車',
  honken: '本検\n登録車',
  shinsho: '身障者\n減免車',
  person: '担当者'
};

/**
 * GASエディタの関数選択プルダウンからこれを選んで実行する(初回セットアップ用、1回だけでよい)。
 * 再実行すると両方のシートを作り直す(既存の内容は消える)ので、運用開始後は実行しないこと。
 */
function setupTemplateSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  buildOssTemplateSheet_(getOrCreateSheetForSetup_(ss, SHEET_NAMES.OSS_TEMPLATE));
  buildPaperTemplateSheet_(getOrCreateSheetForSetup_(ss, SHEET_NAMES.PAPER_TEMPLATE));

  // 新規スプレッドシート作成時のデフォルト「シート1」が残っていれば削除する
  var defaultSheet = ss.getSheetByName('シート1');
  if (defaultSheet && ss.getSheets().length > 2) {
    ss.deleteSheet(defaultSheet);
  }

  SpreadsheetApp.getUi().alert('テンプレートシートを作成しました。内容を確認してください。');
}

function getOrCreateSheetForSetup_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
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

function buildOssTemplateSheet_(sheet) {
  var maxCol = 35; // AI
  sheet.clear();
  ensureColumns_(sheet, maxCol);

  setBanner_(sheet, 1, 1, maxCol, 4, SHEET_NAMES.OSS_TEMPLATE, 'OSS');
  sheet.setRowHeight(1, 34);

  buildCommonFields_(sheet, { includeRegDateCommon: false });
  buildVehicleTableHeader_(sheet, VEHICLE_COLUMNS.OSS, OSS_FIELD_LABELS);
  applyZebraAndBorders_(sheet, VEHICLE_COLUMNS.OSS);

  finishSheetStyle_(sheet, maxCol, 33);
}

function buildPaperTemplateSheet_(sheet) {
  var maxCol = 34; // AH
  sheet.clear();
  ensureColumns_(sheet, maxCol);

  setBanner_(sheet, 1, 1, maxCol, 4, SHEET_NAMES.PAPER_TEMPLATE, '紙');
  sheet.setRowHeight(1, 34);

  buildCommonFields_(sheet, { includeRegDateCommon: true });
  buildVehicleTableHeader_(sheet, VEHICLE_COLUMNS.PAPER, PAPER_FIELD_LABELS);
  applyZebraAndBorders_(sheet, VEHICLE_COLUMNS.PAPER);

  finishSheetStyle_(sheet, maxCol, 32);
}

/**
 * タイトルバー(左: タイトル文字、右: OSS/紙のバッジ)を1行に描画する。
 */
function setBanner_(sheet, row, colStart, colEnd, badgeWidth, titleText, badgeText) {
  var titleEnd = colEnd - badgeWidth;

  var titleRange = sheet.getRange(row, colStart, 1, titleEnd - colStart + 1);
  titleRange.merge();
  titleRange.setValue('  ' + titleText);
  titleRange.setBackground(THEME.primary);
  titleRange.setFontColor('#FFFFFF');
  titleRange.setFontWeight('bold');
  titleRange.setFontSize(15);
  titleRange.setHorizontalAlignment('left');
  titleRange.setVerticalAlignment('middle');

  var badgeRange = sheet.getRange(row, titleEnd + 1, 1, badgeWidth);
  badgeRange.merge();
  badgeRange.setValue(badgeText);
  badgeRange.setBackground(THEME.primaryDark);
  badgeRange.setFontColor('#FFFFFF');
  badgeRange.setFontWeight('bold');
  badgeRange.setFontSize(13);
  badgeRange.setHorizontalAlignment('center');
  badgeRange.setVerticalAlignment('middle');
}

/**
 * 会社名・担当責任者・送付日(・紙のみ登録日)の共通項目欄を描画する。
 * ラベルはアクセントカラーの文字、値欄はアクセントカラーの下線(記入欄)にする。
 */
function buildCommonFields_(sheet, opts) {
  setFieldLabel_(sheet, 2, 27, 30, '会社名');
  setValueCell_(sheet, COMMON_CELLS.company);
  sheet.setRowHeight(2, 26);

  setFieldLabel_(sheet, 3, 27, 30, '担当責任者');
  setValueCell_(sheet, COMMON_CELLS.manager);
  sheet.setRowHeight(3, 26);

  if (opts.includeRegDateCommon) {
    setFieldLabel_(sheet, 3, 14, 16, '登録日');
    setValueCell_(sheet, COMMON_CELLS.regDateCommonMonth);
    sheet.getRange('R4').setValue('月').setFontColor(THEME.primary).setFontSize(9).setHorizontalAlignment('left');
    setValueCell_(sheet, COMMON_CELLS.regDateCommonDay);
    sheet.getRange('W4').setValue('日').setFontColor(THEME.primary).setFontSize(9).setHorizontalAlignment('left');
  }

  setFieldLabel_(sheet, 4, 30, 31, '送付日(月／日)', { fontSize: 9 });
  setValueCell_(sheet, COMMON_CELLS.sendDateMonth);
  setValueCell_(sheet, COMMON_CELLS.sendDateDay);
  sheet.setRowHeight(4, 18);
  sheet.setRowHeight(5, 26);
}

/**
 * 車両データ欄(7行目)の見出しを、Constants.gs の列マッピング通りに配置する。
 */
function buildVehicleTableHeader_(sheet, columns, labels) {
  Object.keys(columns).forEach(function (key) {
    var col = columns[key];
    var cell = sheet.getRange(7, col);
    cell.setValue(labels[key] || key);
    cell.setBackground(THEME.primary);
    cell.setFontColor('#FFFFFF');
    cell.setFontWeight('bold');
    cell.setFontSize(10);
    cell.setHorizontalAlignment('center');
    cell.setVerticalAlignment('middle');
    cell.setWrap(true);
  });
  sheet.setRowHeight(7, 42);
}

/**
 * 車両データ欄(8行目〜MAX_VEHICLES分)に、交互の背景色と柔らかい罫線を付ける。
 */
function applyZebraAndBorders_(sheet, columns) {
  var maxCol = Math.max.apply(null, Object.keys(columns).map(function (k) { return columns[k]; }));
  var width = maxCol - 3 + 1;

  for (var i = 0; i < MAX_VEHICLES; i++) {
    var row = VEHICLE_START_ROW + i;
    sheet.getRange(row, 3, 1, width).setBackground(i % 2 === 0 ? '#FFFFFF' : THEME.zebra);
    sheet.setRowHeight(row, 26);
  }

  var range = sheet.getRange(VEHICLE_START_ROW, 3, MAX_VEHICLES, width);
  range.setBorder(true, true, true, true, true, true, THEME.gridLine, SpreadsheetApp.BorderStyle.SOLID);
  range.setHorizontalAlignment('center');
  range.setVerticalAlignment('middle');
}

function setFieldLabel_(sheet, row, colStart, colEnd, text, opts) {
  opts = opts || {};
  var range = sheet.getRange(row, colStart, 1, colEnd - colStart + 1);
  range.merge();
  range.setValue(text);
  range.setBackground(THEME.primaryTint);
  range.setFontColor(THEME.primary);
  range.setFontWeight('bold');
  range.setFontSize(opts.fontSize || 11);
  range.setHorizontalAlignment('right');
  range.setVerticalAlignment('middle');
}

function setValueCell_(sheet, a1) {
  var range = sheet.getRange(a1);
  range.setBorder(false, false, true, false, false, false, THEME.primary, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  range.setFontColor(THEME.ink);
  range.setFontWeight('bold');
  range.setHorizontalAlignment('center');
}

/**
 * フォント統一・列幅・見出し行の固定など、シート全体の仕上げ。
 */
function finishSheetStyle_(sheet, maxCol, dataColCount) {
  sheet.getRange(1, 1, 17, maxCol).setFontFamily('Noto Sans JP');
  sheet.setColumnWidths(3, dataColCount, 68);
  sheet.setColumnWidth(1, 16);
  sheet.setColumnWidth(2, 16);
  sheet.setFrozenRows(7);
  sheet.setHiddenGridlines(true);
}
