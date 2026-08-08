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
 * 【デザイン方針】ユーザー提供のサンプルデザインに準拠。
 * - 白背景・黒文字・黒の格子罫線を基調にした、印刷物らしいクラシックな配色
 * - 送付日・便(・紙のみ登録日)は「ラベル文字列がそのまま値欄になる」方式。
 *   空欄時はラベル("送付日"等)を表示し、TemplateService.gs が同じセルへ
 *   実際の値を上書きする。「第」だけは固定の飾り文字で、コードからは書き込まない。
 * - 会社名・担当責任者は右側に、送付日・便より小さめの文字で配置
 * - 車両データ欄の下に「合計」行を設け、自動車税・環境性能割・重量税をSUM関数で集計
 * - 飛騨登録バッジは通常空欄にしておき、該当申請のときだけ目立つ色で上書きする
 */

var THEME = {
  ink: '#000000',
  headerFill: '#F1F1F1',  // 車両データ見出し行・合計行の薄いグレー
  badgeFill: '#D9D9D9'    // OSS登録/紙登録バッジの薄いグレー
};

var FONT_FAMILY = 'Roboto';
var DISPLAY_TITLE = '新車新規登録依頼書';

var OSS_FIELD_LABELS = {
  indivRegDate: '登録日',
  userName: '使用者名',
  brand: 'ブランド',
  chassis: '車台番号\n(下4桁)',
  model: '型式',
  classNum: '類別番号',
  autoTax: '自動車税',
  envTax: '環境性能割',
  weightTax: '重量税',
  hopeNum: '希望ナンバー',
  yobi: '予備検登録車',
  honken: '本検登録車',
  shinsho: '身障者減免車',
  person: '担当者'
};

var PAPER_FIELD_LABELS = {
  userName: '使用者名',
  brand: 'ブランド',
  chassis: '車台番号\n(下4桁)',
  model: '型式',
  classNum: '類別番号',
  autoTax: '自動車税',
  envTax: '環境性能割',
  weightTax: '重量税',
  hopeNum: '希望ナンバー',
  yobi: '予備検登録車',
  honken: '本検登録車',
  shinsho: '身障者減免車',
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

  setBanner_(sheet, maxCol, 'OSS登録');
  buildOssCommonFields_(sheet);
  buildVehicleTableHeader_(sheet, VEHICLE_COLUMNS.OSS, OSS_FIELD_LABELS);
  applyVehicleDataStyle_(sheet, VEHICLE_COLUMNS.OSS);
  applyNumericAlignment_(sheet, VEHICLE_COLUMNS.OSS);
  applyFieldWidths_(sheet, VEHICLE_COLUMNS.OSS);
  applyBrandEmphasis_(sheet, VEHICLE_COLUMNS.OSS);
  buildTotalRow_(sheet, VEHICLE_COLUMNS.OSS, maxCol, 6); // A:F(登録日〜類別番号)を「合計」ラベルに使う

  finishSheetStyle_(sheet, maxCol);
}

function buildPaperTemplateSheet_(sheet) {
  var maxCol = maxColumnOf_(VEHICLE_COLUMNS.PAPER);
  sheet.clear();

  setBanner_(sheet, maxCol, '紙登録');
  buildPaperCommonFields_(sheet);
  buildVehicleTableHeader_(sheet, VEHICLE_COLUMNS.PAPER, PAPER_FIELD_LABELS);
  applyVehicleDataStyle_(sheet, VEHICLE_COLUMNS.PAPER);
  applyNumericAlignment_(sheet, VEHICLE_COLUMNS.PAPER);
  applyFieldWidths_(sheet, VEHICLE_COLUMNS.PAPER);
  applyBrandEmphasis_(sheet, VEHICLE_COLUMNS.PAPER);
  buildTotalRow_(sheet, VEHICLE_COLUMNS.PAPER, maxCol, 5); // A:E(使用者名〜類別番号)を「合計」ラベルに使う

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
 * タイトルバー(1行目)。白背景に黒太字中央寄せのタイトル、右端に飛騨登録バッジ+
 * 種別バッジ(OSS登録/紙登録)を配置する。
 *
 * 飛騨登録バッジは通常空欄のまま置いておき(このシートは全申請共通のテンプレートのため)、
 * TemplateService.gsが「飛騨登録」該当時のみ目立つ色で上書きする。このバッジの列位置は
 * Constants.gs の COMMON_CELLS.OSS/PAPER.hidaBadge と必ず一致させること。
 */
function setBanner_(sheet, maxCol, badgeText) {
  ensureColumns_(sheet, maxCol);
  var hidaBadgeWidth = 2;
  var typeBadgeWidth = 2;
  var titleEnd = maxCol - hidaBadgeWidth - typeBadgeWidth;

  var titleRange = sheet.getRange(1, 1, 1, titleEnd);
  titleRange.merge();
  titleRange.setValue(DISPLAY_TITLE);
  titleRange.setFontFamily(FONT_FAMILY);
  titleRange.setFontSize(22);
  titleRange.setFontWeight('bold');
  titleRange.setFontColor(THEME.ink);
  titleRange.setHorizontalAlignment('center');
  titleRange.setVerticalAlignment('middle');

  var hidaBadgeRange = sheet.getRange(1, titleEnd + 1, 1, hidaBadgeWidth);
  hidaBadgeRange.merge();
  hidaBadgeRange.setFontFamily(FONT_FAMILY);
  hidaBadgeRange.setFontWeight('bold');
  hidaBadgeRange.setFontSize(12);
  hidaBadgeRange.setHorizontalAlignment('center');
  hidaBadgeRange.setVerticalAlignment('middle');

  var typeBadgeRange = sheet.getRange(1, titleEnd + hidaBadgeWidth + 1, 1, typeBadgeWidth);
  typeBadgeRange.merge();
  typeBadgeRange.setValue(badgeText);
  typeBadgeRange.setBackground(THEME.badgeFill);
  typeBadgeRange.setFontColor(THEME.ink);
  typeBadgeRange.setFontFamily(FONT_FAMILY);
  typeBadgeRange.setFontWeight('bold');
  typeBadgeRange.setFontSize(16);
  typeBadgeRange.setHorizontalAlignment('center');
  typeBadgeRange.setVerticalAlignment('middle');

  sheet.setRowHeight(1, 46);
}

/**
 * OSS用の共通項目欄。送付日・便を大きく強調したブロックを左側(D〜J列)に、
 * 会社名・担当責任者を右側(K〜N列)に配置する。列位置は Constants.gs の
 * COMMON_CELLS.OSS と必ず一致させること(TemplateService.gs がその位置に値を書き込む)。
 */
function buildOssCommonFields_(sheet) {
  buildBigLabelBlock_(sheet, 4, 3, '送付日'); // D-F → 値の左上セル = D3
  buildBigLabelBlock_(sheet, 7, 2, '第');     // G-H(固定文字、コードからは書き込まない)
  buildBigLabelBlock_(sheet, 9, 2, '便');     // I-J → 値の左上セル = I3

  buildLabelValueRow_(sheet, 3, 11, 4, '会社名');     // K-N → 値の左上セル = K3
  buildLabelValueRow_(sheet, 5, 11, 4, '担当責任者'); // K-N → 値の左上セル = K5

  applyCommonRowHeights_(sheet);
}

/**
 * 紙用の共通項目欄。送付日・便・登録日を大きく強調したブロックを左側(A〜I列)に、
 * 会社名・担当責任者を右側(J〜M列)に配置する。列位置は Constants.gs の
 * COMMON_CELLS.PAPER と必ず一致させること。
 */
function buildPaperCommonFields_(sheet) {
  buildBigLabelBlock_(sheet, 1, 2, '送付日'); // A-B → 値の左上セル = A3
  buildBigLabelBlock_(sheet, 3, 3, '登録日'); // C-E → 値の左上セル = C3
  buildBigLabelBlock_(sheet, 6, 2, '第');     // F-G(固定文字、コードからは書き込まない)
  buildBigLabelBlock_(sheet, 8, 2, '便');     // H-I → 値の左上セル = H3

  buildLabelValueRow_(sheet, 3, 10, 4, '会社名');     // J-M → 値の左上セル = J3
  buildLabelValueRow_(sheet, 5, 10, 4, '担当責任者'); // J-M → 値の左上セル = J5

  applyCommonRowHeights_(sheet);
}

/**
 * 送付日・便(・登録日)・「第」を大きく表示するブロックを1つ描画する(3〜5行目を結合)。
 * 送付日・便・登録日は、ここで表示するプレースホルダー文字列(自分自身のラベル名)を
 * TemplateService.gs が同じセルへ実際の値で上書きする想定。「第」のような固定文字は
 * コードから一切書き込まれない(常にこの文字のまま)。
 * 値の書き込み先(左上セル)は必ず row3, colStart になる(Constants.gs の COMMON_CELLS と対応させること)。
 */
function buildBigLabelBlock_(sheet, colStart, colSpan, text) {
  var range = sheet.getRange(3, colStart, 3, colSpan);
  range.merge();
  range.setValue(text);
  range.setFontFamily(FONT_FAMILY);
  range.setFontSize(26);
  range.setFontWeight('bold');
  range.setFontColor(THEME.ink);
  range.setHorizontalAlignment('center');
  range.setVerticalAlignment('middle');
}

/**
 * 会社名・担当責任者のように、1行だけの「ラベルがそのまま値欄になる」セルを描画する。
 * 左寄せにすることで、空欄時はラベルが左端に見え、値が入ると同じ位置から書き換わる。
 */
function buildLabelValueRow_(sheet, row, colStart, colSpan, text) {
  var range = sheet.getRange(row, colStart, 1, colSpan);
  range.merge();
  range.setValue(text);
  range.setFontFamily(FONT_FAMILY);
  range.setFontSize(13);
  range.setFontWeight('bold');
  range.setFontColor(THEME.ink);
  range.setHorizontalAlignment('left');
  range.setVerticalAlignment('middle');
}

/**
 * 共通項目欄(2〜6行目)の行の高さをまとめて設定する。4行目はごく短い区切り行。
 */
function applyCommonRowHeights_(sheet) {
  sheet.setRowHeight(2, 6);
  sheet.setRowHeight(3, 30);
  sheet.setRowHeight(4, 6);
  sheet.setRowHeight(5, 30);
  sheet.setRowHeight(6, 8);
}

/**
 * 車両データ欄(7行目)の見出しを、Constants.gs の列マッピング通りに配置する。
 * 2行のラベル(例:「車台番号」+「(下4桁)」)が印刷時に見切れないよう行高に余裕を持たせる。
 */
function buildVehicleTableHeader_(sheet, columns, labels) {
  Object.keys(columns).forEach(function (key) {
    var col = columns[key];
    var cell = sheet.getRange(7, col);
    cell.setValue(labels[key] || key);
    cell.setBackground(THEME.headerFill);
    cell.setFontColor(THEME.ink);
    cell.setFontFamily(FONT_FAMILY);
    cell.setFontWeight('bold');
    cell.setFontSize(10);
    cell.setHorizontalAlignment('center');
    cell.setVerticalAlignment('middle');
    cell.setWrap(true);
  });
  sheet.setRowHeight(7, 40);
}

/**
 * 車両データ欄(8行目〜MAX_VEHICLES分)の文字スタイル・行高を設定する。
 * 罫線はシート全体をまとめて finishSheetStyle_ で引くため、ここでは扱わない。
 */
function applyVehicleDataStyle_(sheet, columns) {
  var maxCol = maxColumnOf_(columns);
  var range = sheet.getRange(VEHICLE_START_ROW, 1, MAX_VEHICLES, maxCol);
  range.setFontColor(THEME.ink);
  range.setFontFamily(FONT_FAMILY);
  range.setFontSize(11);
  range.setHorizontalAlignment('center');
  range.setVerticalAlignment('middle');

  for (var i = 0; i < MAX_VEHICLES; i++) {
    sheet.setRowHeight(VEHICLE_START_ROW + i, 26);
  }
}

/**
 * ブランド(MB/AU)列は絞り込みの観点として使う項目のため、太字にして目立たせる。
 */
function applyBrandEmphasis_(sheet, columns) {
  var col = columns.brand;
  if (!col) return;
  sheet.getRange(VEHICLE_START_ROW, col, MAX_VEHICLES, 1).setFontWeight('bold');
}

/**
 * 金額系の列(Constants.gs の NUMERIC_FIELD_KEYS)は、見出し・データともに
 * 右寄せにする(データテーブルで数値を右寄せする一般的な慣習に合わせる)。
 */
function applyNumericAlignment_(sheet, columns) {
  NUMERIC_FIELD_KEYS.forEach(function (key) {
    var col = columns[key];
    if (!col) return;
    sheet.getRange(7, col).setHorizontalAlignment('right');
    sheet.getRange(VEHICLE_START_ROW, col, MAX_VEHICLES, 1).setHorizontalAlignment('right');
  });
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
 * 合計行(Constants.gs の TOTAL_ROW)。自動車税・環境性能割・重量税をSUM関数で集計する。
 * このテンプレートを複製して送信ごとの一時シートを作るため(TemplateService.gs)、
 * SUM式もそのまま複製され、各申請の実際のデータに応じて自動的に再計算される。
 * @param {number} labelSpan 「合計」ラベルに使う先頭列数(数値項目より左側の列数)
 */
function buildTotalRow_(sheet, columns, maxCol, labelSpan) {
  var fillRange = sheet.getRange(TOTAL_ROW, 1, 1, maxCol);
  fillRange.setBackground(THEME.headerFill);
  fillRange.setFontFamily(FONT_FAMILY);
  fillRange.setFontWeight('bold');
  fillRange.setFontSize(11);
  fillRange.setFontColor(THEME.ink);

  var labelRange = sheet.getRange(TOTAL_ROW, 1, 1, labelSpan);
  labelRange.merge();
  labelRange.setValue('合計');
  labelRange.setHorizontalAlignment('right');
  labelRange.setVerticalAlignment('middle');

  NUMERIC_FIELD_KEYS.forEach(function (key) {
    var col = columns[key];
    if (!col) return;
    var colLetter = columnToLetter_(col);
    var lastVehicleRow = VEHICLE_START_ROW + MAX_VEHICLES - 1;
    sheet.getRange(TOTAL_ROW, col)
      .setFormula('=SUM(' + colLetter + VEHICLE_START_ROW + ':' + colLetter + lastVehicleRow + ')')
      .setHorizontalAlignment('right')
      .setVerticalAlignment('middle');
  });

  sheet.setRowHeight(TOTAL_ROW, 26);
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

/**
 * フォント統一・見出し行の固定・全体の罫線など、シート全体の仕上げ。
 * ユーザー提供のサンプルに合わせ、バナーから合計行まで全域に黒の格子罫線を引く
 * (Sheetsのデフォルトの薄いグリッド線は非表示にし、明示的な罫線に置き換える)。
 */
function finishSheetStyle_(sheet, maxCol) {
  var wholeRange = sheet.getRange(1, 1, TOTAL_ROW, maxCol);
  wholeRange.setFontFamily(FONT_FAMILY);
  wholeRange.setBorder(true, true, true, true, true, true, THEME.ink, SpreadsheetApp.BorderStyle.SOLID);
  sheet.setFrozenRows(7);
  sheet.setHiddenGridlines(true);
}
