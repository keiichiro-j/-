/**
 * SetupService.gs
 * 実物のテンプレートシートが手元にない場合に、Constants.gs のセル位置定義から
 * 逆算して雛形シート(OSS用/紙用)を自動生成する。GASエディタから
 * setupTemplateSheets() を一度だけ手動実行する。
 *
 * 印刷はA4横向き(TemplateService.gs#exportSheetAsPdfBlob_)を前提に、
 * 車両データ欄は列の隙間を空けず詰めたレイアウトにしている
 * (Constants.gs の VEHICLE_COLUMNS が連番になっている理由もこれに合わせたため)。
 * A列・B列を空白マージンとして予約するのもやめ、A列から詰めて配置している。
 *
 * 生成されるのはあくまで「動作する最低限のレイアウト」。罫線の太さ・結合セル・
 * 印刷範囲などは、生成後に見た目を見ながら手で調整してよい(Constants.gs の
 * セル位置さえ変えなければ、処理には影響しない)。
 *
 * 【デザイン方針】"Googleが作ったら" を意識したMaterial Designベース。
 * - 配色はGoogleの実際のトークン値(Google Blue #1A73E8、テキストグレー #202124、
 *   境界線グレー #DADCE0 等)を使用
 * - フォントはGoogle製の Roboto を指定(和文はGoogleスプレッドシート側が自動的に
 *   代替フォントへフォールバックする)
 * - タイトルバーはGoogle Blueの塗りつぶし地に白文字(Material の App Bar 相当)
 * - 税額など数値項目はヘッダー・データともに右寄せ(データテーブルの慣習)
 * - 印刷時の見切れを避けるため、行の高さ・列幅・文字サイズにゆとりを持たせている
 */

var THEME = {
  ink: '#202124',        // Googleのテキストグレー(ほぼ黒)
  inkSoft: '#5F6368',    // Googleの補助テキストグレー
  bannerBg: '#1A73E8',   // Google Blue
  bannerText: '#FFFFFF',
  panelSoft: '#F1F3F4',  // Googleのニュートラルなライトグレー(入力欄背景等で使われる色)
  panelSofter: '#F8F9FA',// Googleの最も薄いグレー
  hairline: '#DADCE0',   // Googleの標準的な境界線グレー
  accent: '#1A73E8',     // Google Blue(記入欄の下線など)
  tileBg: '#E8F0FE',     // 強調タイル(送付日・便・登録日)の背景
  zebra: '#F8F9FA'
};

var FONT_FAMILY = 'Roboto';
var DISPLAY_EYEBROW = 'VEHICLE REGISTRATION';
var DISPLAY_TITLE = '新車新規登録依頼書';

var OSS_FIELD_LABELS = {
  indivRegDate: '登録日',
  userName: '使用車名',
  brand: 'ブランド',
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
  brand: 'ブランド',
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
  buildOssCommonFields_(sheet);
  buildVehicleTableHeader_(sheet, VEHICLE_COLUMNS.OSS, OSS_FIELD_LABELS);
  applyZebraAndBorders_(sheet, VEHICLE_COLUMNS.OSS);
  applyNumericAlignment_(sheet, VEHICLE_COLUMNS.OSS);
  applyFieldWidths_(sheet, VEHICLE_COLUMNS.OSS);
  applyBrandEmphasis_(sheet, VEHICLE_COLUMNS.OSS);

  finishSheetStyle_(sheet, maxCol);
}

function buildPaperTemplateSheet_(sheet) {
  var maxCol = maxColumnOf_(VEHICLE_COLUMNS.PAPER);
  sheet.clear();

  setBanner_(sheet, maxCol, '紙');
  buildPaperCommonFields_(sheet);
  buildVehicleTableHeader_(sheet, VEHICLE_COLUMNS.PAPER, PAPER_FIELD_LABELS);
  applyZebraAndBorders_(sheet, VEHICLE_COLUMNS.PAPER);
  applyNumericAlignment_(sheet, VEHICLE_COLUMNS.PAPER);
  applyFieldWidths_(sheet, VEHICLE_COLUMNS.PAPER);
  applyBrandEmphasis_(sheet, VEHICLE_COLUMNS.PAPER);

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
 * タイトルバー(左: オーバーライン+タイトルの2段リッチテキスト、右: 飛騨登録バッジ+OSS/紙のバッジ)を
 * 1行目に描画する。Google BlueのApp Bar風の塗りつぶし地に白文字。
 * 車両データ欄の幅(maxCol)いっぱいに合わせる(縦向きより横に長いA4横印刷を想定)。
 *
 * 飛騨登録バッジは通常バナーに同化させて空欄のまま置いておき(このシートは全申請共通の
 * テンプレートのため)、TemplateService.gsが「飛騨登録」該当時のみ目立つ色で上書きする。
 * このバッジの列位置は Constants.gs の COMMON_CELLS.OSS/PAPER.hidaBadge と必ず一致させること。
 */
function setBanner_(sheet, maxCol, badgeText) {
  ensureColumns_(sheet, maxCol);
  var hidaBadgeWidth = 2;
  var typeBadgeWidth = 2;
  var titleEnd = maxCol - hidaBadgeWidth - typeBadgeWidth;

  var titleRange = sheet.getRange(1, 1, 1, titleEnd);
  titleRange.merge();

  var fullText = '  ' + DISPLAY_EYEBROW + '\n  ' + DISPLAY_TITLE;
  var eyebrowEnd = 2 + DISPLAY_EYEBROW.length;
  var titleStart = eyebrowEnd + 1; // 改行(\n)の次の文字から

  var richText = SpreadsheetApp.newRichTextValue()
    .setText(fullText)
    .setTextStyle(0, eyebrowEnd, SpreadsheetApp.newTextStyle()
      .setFontFamily(FONT_FAMILY)
      .setFontSize(9)
      .setForegroundColor('#D2E3FC')
      .setBold(true)
      .build())
    .setTextStyle(titleStart, fullText.length, SpreadsheetApp.newTextStyle()
      .setFontFamily(FONT_FAMILY)
      .setFontSize(18)
      .setForegroundColor(THEME.bannerText)
      .setBold(true)
      .build())
    .build();

  titleRange.setRichTextValue(richText);
  titleRange.setBackground(THEME.bannerBg);
  titleRange.setHorizontalAlignment('left');
  titleRange.setVerticalAlignment('middle');
  titleRange.setWrap(true);

  var hidaBadgeRange = sheet.getRange(1, titleEnd + 1, 1, hidaBadgeWidth);
  hidaBadgeRange.merge();
  hidaBadgeRange.setBackground(THEME.bannerBg); // 通常時はバナーと同化させ、空欄のまま目立たせない
  hidaBadgeRange.setFontFamily(FONT_FAMILY);
  hidaBadgeRange.setFontWeight('bold');
  hidaBadgeRange.setFontSize(11);
  hidaBadgeRange.setHorizontalAlignment('center');
  hidaBadgeRange.setVerticalAlignment('middle');

  var typeBadgeRange = sheet.getRange(1, titleEnd + hidaBadgeWidth + 1, 1, typeBadgeWidth);
  typeBadgeRange.merge();
  typeBadgeRange.setValue(badgeText);
  typeBadgeRange.setBackground('#174EA6'); // Google Blueより一段濃いトーンで面を分ける
  typeBadgeRange.setFontColor('#FFFFFF');
  typeBadgeRange.setFontFamily(FONT_FAMILY);
  typeBadgeRange.setFontWeight('bold');
  typeBadgeRange.setFontSize(14);
  typeBadgeRange.setHorizontalAlignment('center');
  typeBadgeRange.setVerticalAlignment('middle');

  // バナー下に太めのアクセント罫線を引き、本文との境目をくっきりさせる(モダンな二段ヘッダー風)
  sheet.getRange(1, 1, 1, maxCol)
    .setBorder(false, false, true, false, false, false, '#0B57D0', SpreadsheetApp.BorderStyle.SOLID_THICK);

  sheet.setRowHeight(1, 56);
}

/**
 * OSS用の共通項目欄。送付日・便を大きく強調したタイルを左側に、会社名・担当責任者を
 * 右側に配置する(受け取り手が送付日/便を一目で確認できるようにするため)。
 * 列位置は Constants.gs の COMMON_CELLS.OSS と必ず一致させること
 * (TemplateService.gs がその定数の位置に値を書き込むため)。
 */
function buildOssCommonFields_(sheet) {
  buildEmphasisTile_(sheet, 1, 4, '送付日'); // A-D → 値の左上セル = A3
  buildEmphasisTile_(sheet, 5, 4, '便');     // E-H → 値の左上セル = E3

  setFieldLabel_(sheet, 2, 9, 2, '会社名');
  mergeValueCell_(sheet, 2, 11, 4, 'left');   // K-N → 値の左上セル = K2
  setFieldLabel_(sheet, 3, 9, 2, '担当責任者');
  mergeValueCell_(sheet, 3, 11, 4, 'left');   // K-N → 値の左上セル = K3

  applyCommonRowHeights_(sheet);
}

/**
 * 紙用の共通項目欄。送付日・便・登録日を大きく強調したタイルを左側に、会社名・担当責任者を
 * 右側に配置する。列位置は Constants.gs の COMMON_CELLS.PAPER と必ず一致させること。
 */
function buildPaperCommonFields_(sheet) {
  buildEmphasisTile_(sheet, 1, 3, '送付日'); // A-C → 値の左上セル = A3
  buildEmphasisTile_(sheet, 4, 3, '便');     // D-F → 値の左上セル = D3
  buildEmphasisTile_(sheet, 7, 2, '登録日'); // G-H → 値の左上セル = G3

  setFieldLabel_(sheet, 2, 9, 2, '会社名');
  mergeValueCell_(sheet, 2, 11, 3, 'left');   // K-M → 値の左上セル = K2
  setFieldLabel_(sheet, 3, 9, 2, '担当責任者');
  mergeValueCell_(sheet, 3, 11, 3, 'left');   // K-M → 値の左上セル = K3

  applyCommonRowHeights_(sheet);
}

/**
 * 送付日・便(・登録日)を大きく目立たせる「タイル」を1つ描画する。
 * 2行目に小さめのキャプション、3〜6行目を結合した大きな太字の値欄という構成。
 * 値の書き込み先(左上セル)は必ず row3, colStart になる
 * (Constants.gs の COMMON_CELLS と対応させること)。
 */
function buildEmphasisTile_(sheet, colStart, colSpan, captionText) {
  var captionRange = sheet.getRange(2, colStart, 1, colSpan);
  captionRange.merge();
  captionRange.setValue(captionText);
  captionRange.setBackground(THEME.panelSoft);
  captionRange.setFontColor(THEME.inkSoft);
  captionRange.setFontWeight('bold');
  captionRange.setFontSize(10);
  captionRange.setHorizontalAlignment('center');
  captionRange.setVerticalAlignment('middle');

  var valueRange = sheet.getRange(3, colStart, 4, colSpan);
  valueRange.merge();
  valueRange.setBackground(THEME.tileBg);
  valueRange.setFontColor(THEME.bannerBg);
  valueRange.setFontWeight('bold');
  valueRange.setFontSize(30);
  valueRange.setHorizontalAlignment('center');
  valueRange.setVerticalAlignment('middle');
  valueRange.setBorder(true, true, true, true, false, false, THEME.accent, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}

/**
 * 共通項目欄(2〜6行目)の行の高さをまとめて設定する。
 */
function applyCommonRowHeights_(sheet) {
  sheet.setRowHeight(2, 26);
  sheet.setRowHeight(3, 24);
  sheet.setRowHeight(4, 24);
  sheet.setRowHeight(5, 24);
  sheet.setRowHeight(6, 24);
}

/**
 * ラベルは控えめなグレー・通常ウェイト、値は濃色・太字にして、
 * ダッシュボードのフォームでよくある「キャプション/値」のコントラストを付ける。
 */
function setFieldLabel_(sheet, row, colStart, colSpan, text) {
  var range = sheet.getRange(row, colStart, 1, colSpan);
  range.merge();
  range.setValue(text);
  range.setBackground(THEME.panelSoft);
  range.setFontColor(THEME.inkSoft);
  range.setFontWeight('normal');
  range.setFontSize(10);
  range.setHorizontalAlignment('right');
  range.setVerticalAlignment('middle');
}

function mergeValueCell_(sheet, row, colStart, colSpan, align) {
  var range = sheet.getRange(row, colStart, 1, colSpan);
  range.merge();
  styleValueCell_(range);
  range.setHorizontalAlignment(align || 'center');
}

function styleValueCell_(range) {
  range.setBorder(false, false, true, false, false, false, THEME.accent, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  range.setFontColor(THEME.ink);
  range.setFontWeight('bold');
  range.setFontSize(12);
  range.setHorizontalAlignment('center');
  range.setVerticalAlignment('middle');
}

/**
 * 車両データ欄(7行目)の見出しを、Constants.gs の列マッピング通りに配置する。
 * 2行のラベル(例:「車台番号」+「(下4桁)」)が印刷時に見切れないよう行高に余裕を持たせる。
 */
function buildVehicleTableHeader_(sheet, columns, labels) {
  var maxCol = maxColumnOf_(columns);
  Object.keys(columns).forEach(function (key) {
    var col = columns[key];
    var cell = sheet.getRange(7, col);
    cell.setValue(labels[key] || key);
    cell.setBackground(THEME.panelSofter);
    cell.setFontColor(THEME.inkSoft);
    cell.setFontWeight('bold');
    cell.setFontSize(10);
    cell.setHorizontalAlignment('center');
    cell.setVerticalAlignment('middle');
    cell.setWrap(true);
  });
  // 見出し行の下にアクセント罫線を引き、データ行との境目をくっきりさせる
  sheet.getRange(7, 1, 1, maxCol)
    .setBorder(false, false, true, false, false, false, THEME.accent, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.setRowHeight(7, 46);
}

/**
 * 車両データ欄(8行目〜MAX_VEHICLES分)に、交互の背景色と柔らかい罫線を付ける。
 */
function applyZebraAndBorders_(sheet, columns) {
  var maxCol = maxColumnOf_(columns);
  var width = maxCol - 1 + 1;

  for (var i = 0; i < MAX_VEHICLES; i++) {
    var row = VEHICLE_START_ROW + i;
    sheet.getRange(row, 1, 1, width).setBackground(i % 2 === 0 ? '#FFFFFF' : THEME.zebra);
    sheet.setRowHeight(row, 28);
  }

  var range = sheet.getRange(VEHICLE_START_ROW, 1, MAX_VEHICLES, width);
  range.setBorder(true, true, true, true, true, true, THEME.hairline, SpreadsheetApp.BorderStyle.SOLID);
  range.setFontColor(THEME.ink);
  range.setFontSize(11);
  range.setHorizontalAlignment('center');
  range.setVerticalAlignment('middle');

  // データ欄の左端にアクセントの縦罫線を引き、表全体の輪郭を引き締める
  sheet.getRange(VEHICLE_START_ROW, 1, MAX_VEHICLES, 1)
    .setBorder(null, true, null, null, null, null, THEME.accent, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}

/**
 * ブランド(MB/AU)列は新しく追加した絞り込み観点のため、太字・アクセントカラーで強調して目立たせる。
 */
function applyBrandEmphasis_(sheet, columns) {
  var col = columns.brand;
  if (!col) return;
  var range = sheet.getRange(VEHICLE_START_ROW, col, MAX_VEHICLES, 1);
  range.setFontWeight('bold');
  range.setFontColor(THEME.bannerBg);
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
 * フォント統一・見出し行の固定など、シート全体の仕上げ。
 * フォントはアプリ側と合わせて Roboto を指定する(和文グリフは
 * スプレッドシート側が自動的に代替フォントへフォールバックする)。
 * A列・B列を余白マージンとして縮小する処理は行わない(空白除去のため)。
 */
function finishSheetStyle_(sheet, maxCol) {
  sheet.getRange(1, 1, 17, maxCol).setFontFamily(FONT_FAMILY);
  sheet.setFrozenRows(7);
  sheet.setHiddenGridlines(true);
}
