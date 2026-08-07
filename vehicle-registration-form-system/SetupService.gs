/**
 * SetupService.gs
 * 実物のテンプレートシートが手元にない場合に、Constants.gs のセル位置定義から
 * 逆算して雛形シート(OSS用/紙用)を自動生成する。GASエディタから
 * setupTemplateSheets() を一度だけ手動実行する。
 *
 * 印刷はA4横向き(TemplateService.gs#exportSheetAsPdfBlob_)を前提に、
 * 車両データ欄は列の隙間を空けず詰めたレイアウトにしている
 * (Constants.gs の VEHICLE_COLUMNS が連番になっている理由もこれに合わせたため)。
 *
 * 生成されるのはあくまで「動作する最低限のレイアウト」。罫線の太さ・結合セル・
 * 印刷範囲などは、生成後に見た目を見ながら手で調整してよい(Constants.gs の
 * セル位置さえ変えなければ、処理には影響しない)。
 *
 * デザインは「1システム・2フォーマット」として、両シートで同じ配色
 * (チャコール+アクセントブルー1色)を使い、右上のバッジ文字(OSS / 紙)だけで見分ける。
 */

var THEME = {
  charcoal: '#14161A',      // バナー・表見出しの濃色地
  accent: '#2F6FED',        // バッジ・記入欄の下線・バナー下の帯(差し色)
  labelBg: '#EEF0F3',       // ラベルセルの薄色背景(ニュートラルなグレー)
  gridLine: '#C7CBD1',      // 表の罫線
  zebra: '#F5F6F8',         // データ行の交互背景
  ink: '#14161A'
};

var DISPLAY_TITLE = '新車新規登録依頼書';

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

function buildOssTemplateSheet_(sheet) {
  var maxCol = maxColumnOf_(VEHICLE_COLUMNS.OSS);
  sheet.clear();

  setBanner_(sheet, maxCol, 'OSS');
  buildCommonFields_(sheet, TYPE_OSS, maxCol);
  buildVehicleTableHeader_(sheet, VEHICLE_COLUMNS.OSS, OSS_FIELD_LABELS);
  applyZebraAndBorders_(sheet, VEHICLE_COLUMNS.OSS);
  applyFieldWidths_(sheet, VEHICLE_COLUMNS.OSS);

  finishSheetStyle_(sheet, maxCol);
}

function buildPaperTemplateSheet_(sheet) {
  var maxCol = maxColumnOf_(VEHICLE_COLUMNS.PAPER);
  sheet.clear();

  setBanner_(sheet, maxCol, '紙');
  buildCommonFields_(sheet, TYPE_PAPER, maxCol);
  buildVehicleTableHeader_(sheet, VEHICLE_COLUMNS.PAPER, PAPER_FIELD_LABELS);
  applyZebraAndBorders_(sheet, VEHICLE_COLUMNS.PAPER);
  applyFieldWidths_(sheet, VEHICLE_COLUMNS.PAPER);

  finishSheetStyle_(sheet, maxCol);
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
 * タイトルバー(左: タイトル文字、右: OSS/紙のバッジ)を1行目に描画する。
 * チャコール地に白文字、バッジだけをアクセントブルーで抜いて目を引かせる。
 * 下端にアクセントブルーの帯を1本通し、バナー自体をロゴマーク的に見せる。
 * 車両データ欄の幅(maxCol)いっぱいに合わせる(縦向きより横に長いA4横印刷を想定)。
 */
function setBanner_(sheet, maxCol, badgeText) {
  ensureColumns_(sheet, maxCol);
  var badgeWidth = 2;
  var titleEnd = maxCol - badgeWidth;

  var titleRange = sheet.getRange(1, 1, 1, titleEnd);
  titleRange.merge();
  titleRange.setValue('  ' + DISPLAY_TITLE);
  titleRange.setBackground(THEME.charcoal);
  titleRange.setFontColor('#FFFFFF');
  titleRange.setFontWeight('bold');
  titleRange.setFontSize(16);
  titleRange.setHorizontalAlignment('left');
  titleRange.setVerticalAlignment('middle');
  titleRange.setBorder(false, false, true, false, false, false, THEME.accent, SpreadsheetApp.BorderStyle.SOLID_THICK);

  var badgeRange = sheet.getRange(1, titleEnd + 1, 1, badgeWidth);
  badgeRange.merge();
  badgeRange.setValue(badgeText);
  badgeRange.setBackground(THEME.accent);
  badgeRange.setFontColor('#FFFFFF');
  badgeRange.setFontWeight('bold');
  badgeRange.setFontSize(13);
  badgeRange.setHorizontalAlignment('center');
  badgeRange.setVerticalAlignment('middle');
  badgeRange.setBorder(false, false, true, false, false, false, THEME.accent, SpreadsheetApp.BorderStyle.SOLID_THICK);

  sheet.setRowHeight(1, 32);
}

/**
 * 会社名・担当責任者・送付日(・紙のみ登録日)の共通項目欄を描画する。
 * ラベルは3〜4列目(C:D)、値は5列目(E)から表幅いっぱいに使う。
 * 日付は「M/D」形式の単一セルにして、月と日の間に隙間を作らない。
 */
function buildCommonFields_(sheet, type, maxCol) {
  setFieldLabel_(sheet, 2, '会社名');
  setFullWidthValueCell_(sheet, 2, maxCol);
  sheet.setRowHeight(2, 26);

  setFieldLabel_(sheet, 3, '担当責任者');
  setFullWidthValueCell_(sheet, 3, maxCol);
  sheet.setRowHeight(3, 26);

  setFieldLabel_(sheet, 4, '送付日');
  setDateValueCell_(sheet, COMMON_CELLS.sendDate);
  sheet.setRowHeight(4, 24);

  if (type === TYPE_PAPER) {
    setFieldLabel_(sheet, 5, '登録日(全体)');
    setDateValueCell_(sheet, COMMON_CELLS.regDateCommon);
    sheet.setRowHeight(5, 24);
  } else {
    sheet.setRowHeight(5, 10);
  }

  sheet.setRowHeight(6, 10);
}

function setFieldLabel_(sheet, row, text) {
  var range = sheet.getRange(row, 3, 1, 2); // C:D
  range.merge();
  range.setValue(text);
  range.setBackground(THEME.labelBg);
  range.setFontColor(THEME.ink);
  range.setFontWeight('bold');
  range.setFontSize(10);
  range.setHorizontalAlignment('right');
  range.setVerticalAlignment('middle');
}

function setFullWidthValueCell_(sheet, row, maxCol) {
  var range = sheet.getRange(row, 5, 1, maxCol - 5 + 1); // E列〜表幅いっぱい
  range.merge();
  styleValueCell_(range);
  range.setHorizontalAlignment('left');
}

function setDateValueCell_(sheet, a1) {
  styleValueCell_(sheet.getRange(a1));
}

function styleValueCell_(range) {
  range.setBorder(false, false, true, false, false, false, THEME.accent, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  range.setFontColor(THEME.ink);
  range.setFontWeight('bold');
  range.setFontSize(11);
  range.setHorizontalAlignment('center');
  range.setVerticalAlignment('middle');
}

/**
 * 車両データ欄(7行目)の見出しを、Constants.gs の列マッピング通りに配置する。
 */
function buildVehicleTableHeader_(sheet, columns, labels) {
  Object.keys(columns).forEach(function (key) {
    var col = columns[key];
    var cell = sheet.getRange(7, col);
    cell.setValue(labels[key] || key);
    cell.setBackground(THEME.charcoal);
    cell.setFontColor('#FFFFFF');
    cell.setFontWeight('bold');
    cell.setFontSize(10.5);
    cell.setHorizontalAlignment('center');
    cell.setVerticalAlignment('middle');
    cell.setWrap(true);
  });
  sheet.setRowHeight(7, 40);
}

/**
 * 車両データ欄(8行目〜MAX_VEHICLES分)に、交互の背景色と柔らかい罫線を付ける。
 */
function applyZebraAndBorders_(sheet, columns) {
  var maxCol = maxColumnOf_(columns);
  var width = maxCol - 3 + 1;

  for (var i = 0; i < MAX_VEHICLES; i++) {
    var row = VEHICLE_START_ROW + i;
    sheet.getRange(row, 3, 1, width).setBackground(i % 2 === 0 ? '#FFFFFF' : THEME.zebra);
    sheet.setRowHeight(row, 26);
  }

  var range = sheet.getRange(VEHICLE_START_ROW, 3, MAX_VEHICLES, width);
  range.setBorder(true, true, true, true, true, true, THEME.gridLine, SpreadsheetApp.BorderStyle.SOLID);
  range.setFontSize(10.5);
  range.setHorizontalAlignment('center');
  range.setVerticalAlignment('middle');
}

/**
 * 車両欄の各列を、フィールドごとの推奨幅(Constants.gs の FIELD_WIDTHS)に設定する。
 * 列の隙間をなくして詰めているため、内容に応じた幅の出し分けが必要。
 */
function applyFieldWidths_(sheet, columns) {
  Object.keys(columns).forEach(function (key) {
    sheet.setColumnWidth(columns[key], FIELD_WIDTHS[key] || 70);
  });
}

/**
 * フォント統一・余白列の縮小・見出し行の固定など、シート全体の仕上げ。
 */
function finishSheetStyle_(sheet, maxCol) {
  sheet.getRange(1, 1, 17, maxCol).setFontFamily('Noto Sans JP');
  sheet.setColumnWidth(1, 12);
  sheet.setColumnWidth(2, 12);
  sheet.setFrozenRows(7);
  sheet.setHiddenGridlines(true);
}
