/**
 * SetupService.gs
 * 実物のテンプレートシートが手元にない場合に、Constants.gs のセル位置定義から
 * 逆算して雛形シート(OSS用/紙用)を自動生成する。GASエディタから
 * setupTemplateSheets_() を一度だけ手動実行する。
 *
 * 生成されるのはあくまで「動作する最低限のレイアウト」。罫線の太さ・結合セル・
 * 印刷範囲などは、生成後に見た目を見ながら手で調整してよい(Constants.gs の
 * セル位置さえ変えなければ、処理には影響しない)。
 */

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
 * 再実行すると both シートを作り直す(既存の内容は消える)ので、運用開始後は実行しないこと。
 */
function setupTemplateSheets_() {
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
  sheet.clear();

  setMergedLabel_(sheet, 1, 1, 35, SHEET_NAMES.OSS_TEMPLATE, { fontSize: 14 });

  setMergedLabel_(sheet, 2, 27, 30, '会社名', { align: 'right', background: '#F1F3F4' });
  setValueCell_(sheet, COMMON_CELLS.company);

  setMergedLabel_(sheet, 3, 27, 30, '担当責任者', { align: 'right', background: '#F1F3F4' });
  setValueCell_(sheet, COMMON_CELLS.manager);

  setMergedLabel_(sheet, 4, 30, 31, '送付日(月／日)', { fontSize: 9, background: '#F1F3F4' });
  setValueCell_(sheet, COMMON_CELLS.sendDateMonth);
  setValueCell_(sheet, COMMON_CELLS.sendDateDay);

  buildVehicleTableHeader_(sheet, VEHICLE_COLUMNS.OSS, OSS_FIELD_LABELS);
  applyDataAreaBorders_(sheet, VEHICLE_COLUMNS.OSS);

  sheet.setColumnWidths(3, 33, 68);
  sheet.setFrozenRows(7);
}

function buildPaperTemplateSheet_(sheet) {
  sheet.clear();

  setMergedLabel_(sheet, 1, 1, 34, SHEET_NAMES.PAPER_TEMPLATE, { fontSize: 14 });

  setMergedLabel_(sheet, 2, 27, 30, '会社名', { align: 'right', background: '#F1F3F4' });
  setValueCell_(sheet, COMMON_CELLS.company);

  setMergedLabel_(sheet, 3, 27, 30, '担当責任者', { align: 'right', background: '#F1F3F4' });
  setValueCell_(sheet, COMMON_CELLS.manager);

  // 登録日(全体) : N3:P3 にラベル、Q4=月・V4=日(間のR4/W4に「月」「日」を静的表示)
  setMergedLabel_(sheet, 3, 14, 16, '登録日(月／日)', { fontSize: 9, background: '#F1F3F4' });
  setValueCell_(sheet, COMMON_CELLS.regDateCommonMonth);
  sheet.getRange('R4').setValue('月').setHorizontalAlignment('left').setFontSize(9);
  setValueCell_(sheet, COMMON_CELLS.regDateCommonDay);
  sheet.getRange('W4').setValue('日').setHorizontalAlignment('left').setFontSize(9);

  setMergedLabel_(sheet, 4, 30, 31, '送付日(月／日)', { fontSize: 9, background: '#F1F3F4' });
  setValueCell_(sheet, COMMON_CELLS.sendDateMonth);
  setValueCell_(sheet, COMMON_CELLS.sendDateDay);

  buildVehicleTableHeader_(sheet, VEHICLE_COLUMNS.PAPER, PAPER_FIELD_LABELS);
  applyDataAreaBorders_(sheet, VEHICLE_COLUMNS.PAPER);

  sheet.setColumnWidths(3, 32, 68);
  sheet.setFrozenRows(7);
}

/**
 * 車両データ欄(7行目)の見出しを、Constants.gs の列マッピング通りに配置する。
 */
function buildVehicleTableHeader_(sheet, columns, labels) {
  Object.keys(columns).forEach(function (key) {
    var col = columns[key];
    var cell = sheet.getRange(7, col);
    cell.setValue(labels[key] || key);
    cell.setFontWeight('bold');
    cell.setFontSize(10);
    cell.setBackground('#EEF1F2');
    cell.setHorizontalAlignment('center');
    cell.setVerticalAlignment('middle');
    cell.setWrap(true);
  });
  sheet.setRowHeight(7, 40);
}

/**
 * 車両データ欄(8行目〜MAX_VEHICLES分)に罫線を引く。
 */
function applyDataAreaBorders_(sheet, columns) {
  var maxCol = Math.max.apply(null, Object.keys(columns).map(function (k) { return columns[k]; }));
  var range = sheet.getRange(VEHICLE_START_ROW, 3, MAX_VEHICLES, maxCol - 3 + 1);
  range.setBorder(true, true, true, true, true, true, '#D9E0E3', SpreadsheetApp.BorderStyle.SOLID);
}

function setMergedLabel_(sheet, row, colStart, colEnd, text, opts) {
  opts = opts || {};
  var range = sheet.getRange(row, colStart, 1, colEnd - colStart + 1);
  range.merge();
  range.setValue(text);
  range.setHorizontalAlignment(opts.align || 'center');
  range.setVerticalAlignment('middle');
  range.setFontWeight(opts.bold === false ? 'normal' : 'bold');
  range.setFontSize(opts.fontSize || 11);
  if (opts.background) range.setBackground(opts.background);
}

function setValueCell_(sheet, a1) {
  var range = sheet.getRange(a1);
  range.setBorder(false, false, true, false, false, false);
  range.setHorizontalAlignment('center');
}
