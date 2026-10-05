/**
 * TemplateService.gs
 * テンプレートシートの複製・書き込み・PDF出力・Drive保存（SPEC.md 3章・4.2・4.4 対応）。
 *
 * 旧実装は共有テンプレートを毎回クリアして使い回していたため、同時送信で
 * 他ユーザーのデータを上書きするおそれがあった。本実装は依頼ごとに一時シートを
 * 複製し、複製先にのみ書き込む。複製の瞬間だけ LockService で保護し、
 * PDF出力を待つ間はロックしない。
 */

/**
 * @return {Sheet} 複製された一時シート
 */
function duplicateTemplateSheet_(ss, type, submissionId) {
  var templateName = (type === TYPE_OSS) ? SHEET_NAMES.OSS_TEMPLATE :
    (type === TYPE_GYOSEI) ? SHEET_NAMES.GYOSEI_TEMPLATE : SHEET_NAMES.PAPER_TEMPLATE;
  var templateSheet = ss.getSheetByName(templateName);
  if (!templateSheet) {
    throw new Error('指定されたテンプレートシートが見つかりません: ' + templateName);
  }
  var tempSheet = templateSheet.copyTo(ss);
  tempSheet.setName('_tmp_' + type + '_' + submissionId);
  return tempSheet;
}

function writeCommonFields_(sheet, type, formData) {
  if (type === TYPE_GYOSEI) {
    writeGyoseiCommonFields_(sheet, formData);
    return;
  }

  var cells = (type === TYPE_PAPER) ? COMMON_CELLS.PAPER : COMMON_CELLS.OSS;

  sheet.getRange(cells.company).setValue(formData.company);
  sheet.getRange(cells.manager).setValue(formData.manager);
  sheet.getRange(cells.sendDate).setValue(formatMonthDay_(formData.sendDate));
  // テンプレート側に固定文字の「第」「便」が両隣にあるため、ここでは数字部分だけを書き込む。
  // 例: "第１便" → "１"。並べて表示すると「第１便」に見える。
  sheet.getRange(cells.sendBatch).setValue((formData.sendBatch || '').replace('第', '').replace('便', ''));

  if (type === TYPE_PAPER && isValidDateStr_(formData.regDateCommon)) {
    sheet.getRange(cells.regDateCommon).setValue(formatMonthDay_(formData.regDateCommon));
  }

  // 飛騨登録のときだけ、通常はバナーに同化して見えないバッジを目立つ色に上書きして印字する。
  if (formData.hidaRegistration) {
    var hidaRange = sheet.getRange(cells.hidaBadge);
    hidaRange.setValue('飛騨登録');
    hidaRange.setBackground(HIDA_BADGE_COLOR.bg);
    hidaRange.setFontColor(HIDA_BADGE_COLOR.text);
  }
}

/**
 * ChangeRequestService.gs#applyChangeRequest_ が、登録日・送付便を変更してPDFを
 * 再発行するときだけ呼び出す。通常の新規発行(writeCommonFields_)からは呼ばれないため、
 * 変更依頼でないPDFには一切影響しない。
 * OSS/紙はbanner右端(Constants.gsのCOMMON_CELLS.*.changeRequestBadge)に飛騨登録と同様の
 * バッジを表示する。行政書士は単票レイアウトで同種のバッジ欄が無いため、タイトル文字列に
 * 直接「（変更依頼）」を付け足す。
 */
function writeChangeRequestBadge_(sheet, type) {
  if (type === TYPE_GYOSEI) {
    sheet.getRange(1, 1).setValue(DISPLAY_TITLE_GYOSEI + '（変更依頼）');
    return;
  }
  var cells = (type === TYPE_PAPER) ? COMMON_CELLS.PAPER : COMMON_CELLS.OSS;
  var badgeRange = sheet.getRange(cells.changeRequestBadge);
  badgeRange.setValue(CHANGE_REQUEST_BADGE_LABEL);
  badgeRange.setBackground(CHANGE_REQUEST_BADGE_COLOR.bg);
  badgeRange.setFontColor(CHANGE_REQUEST_BADGE_COLOR.text);
}

/**
 * 行政書士依頼書は車両テーブル形式ではなく単票形式のため、共通項目(依頼日・依頼事項・
 * 依頼拠点・担当者・登録日・封印取付日・車両所在)をここでまとめて書き込む。顧客名(使用者名)は
 * 単票内の唯一の「車両」データとして writeVehicleRows_ 側で書き込む。
 */
function writeGyoseiCommonFields_(sheet, formData) {
  sheet.getRange(GYOSEI_CELLS.requestDate).setValue(formatMonthDay_(formData.sendDate));
  sheet.getRange(GYOSEI_CELLS.gyoseiClass).setValue(formData.gyoseiClass || '');
  sheet.getRange(GYOSEI_CELLS.branch).setValue(formData.gyoseiLocation || '');
  sheet.getRange(GYOSEI_CELLS.manager).setValue(formData.manager);
  if (isValidDateStr_(formData.regDateCommon)) {
    sheet.getRange(GYOSEI_CELLS.regDate).setValue(formatMonthDay_(formData.regDateCommon));
  }
  if (isValidDateStr_(formData.sealDate)) {
    sheet.getRange(GYOSEI_CELLS.sealDate).setValue(formatMonthDay_(formData.sealDate));
  }
  sheet.getRange(GYOSEI_CELLS.vehicleLocation).setValue(formData.gyoseiVehicleLocation || '');
  writeGyoseiChecklist_(sheet, formData);
}

/**
 * 提出書類チェックリスト(完成検査証/譲渡証明書/...)を1項目=1行で書き込む。
 * formData.gyoseiChecklist は { <item.key>: { checked: boolean, remark: string } } の
 * キー付きオブジェクト。未定義の項目は空欄のまま(チェック無し・備考無し)にする。
 */
function writeGyoseiChecklist_(sheet, formData) {
  var checklist = formData.gyoseiChecklist || {};
  GYOSEI_CHECKLIST_ITEMS.forEach(function (item, i) {
    var row = GYOSEI_CHECKLIST_START_ROW + i;
    var entry = checklist[item.key] || {};
    sheet.getRange(row, GYOSEI_CHECKLIST_CHECK_COL).setValue(entry.checked ? CHECKBOX_MARK : '');
    sheet.getRange(row, GYOSEI_CHECKLIST_REMARK_COL).setValue(entry.remark || '');
  });
}

/**
 * "YYYY-MM-DD" を「M/D」形式の表示用文字列にする。不正/空なら空文字。
 */
function formatMonthDay_(dateStr) {
  if (!isValidDateStr_(dateStr)) return '';
  var d = parseDateOnly_(dateStr);
  return (d.getMonth() + 1) + '/' + d.getDate();
}

function writeVehicleRows_(sheet, type, vehicles) {
  if (type === TYPE_GYOSEI) {
    // 単票形式のため1件(先頭のみ)の顧客名・担当者(担当セールス)だけをテンプレートの
    // 固定セルへ書き込む。担当責任者(ログインユーザー)は writeGyoseiCommonFields_ 側で
    // 別途 GYOSEI_CELLS.manager に書き込み済み。
    if (vehicles.length > 0) {
      sheet.getRange(GYOSEI_CELLS.customerName).setValue(vehicles[0].userName || '');
      sheet.getRange(GYOSEI_CELLS.salesPerson).setValue(vehicles[0].person || '');
    }
    return;
  }

  var columns = (type === TYPE_OSS) ? VEHICLE_COLUMNS.OSS : VEHICLE_COLUMNS.PAPER;
  var row = VEHICLE_START_ROW;

  vehicles.forEach(function (car) {
    if (type === TYPE_OSS) {
      sheet.getRange(row, columns.indivRegDate).setValue(formatMonthDay_(car.indivRegDate));
    }
    sheet.getRange(row, columns.userName).setValue(car.userName);
    sheet.getRange(row, columns.brand).setValue(car.brand || '');
    sheet.getRange(row, columns.chassis).setValue(car.chassis);
    sheet.getRange(row, columns.model).setValue(car.model);
    sheet.getRange(row, columns.classNum).setValue(car.classNum);
    sheet.getRange(row, columns.autoTax).setValue(toNonNegativeInt_(car.autoTax));
    sheet.getRange(row, columns.envTax).setValue(toNonNegativeInt_(car.envTax));
    sheet.getRange(row, columns.weightTax).setValue(toNonNegativeInt_(car.weightTax));
    sheet.getRange(row, columns.hopeNum).setValue(car.hopeNum);
    sheet.getRange(row, columns.yobi).setValue(car.yobi);
    sheet.getRange(row, columns.honken).setValue(car.honken);
    sheet.getRange(row, columns.shinsho).setValue(car.shinsho);
    sheet.getRange(row, columns.person).setValue(car.person);
    row++;
  });
}

/**
 * 対象シートのみをA4横・グリッド線なしでPDF化してBlobを返す。
 * scale=4（Googleスプレッドシートの「ページに合わせて印刷」相当）を指定し、
 * 車両MAX_VEHICLES台+合計行の内容でも縦横比を保ったまま自動拡大・縮小して
 * 必ず1ページに収める（fitw=trueだけだと横幅のみ合わせるため、行数が多いと
 * 2ページ目に溢れていた）。余白は0にして、縮小率をできるだけ大きく保つ。
 * 内容の縦横比が用紙とぴったり一致するとは限らない(どちらか一方の辺で
 * 余りが出る)ため、horizontal_alignment/vertical_alignmentで、余った分が
 * 左右・上下どちらも中央に寄るようにする。この2つのパラメータは値の語彙が違う
 * (horizontalはLEFT/CENTER/RIGHT、verticalはTOP/MIDDLE/BOTTOM)ことに注意。
 * verticalにCENTERを指定すると無効な値として無視され、既定(上寄せ)のままに
 * なってしまうため、必ずMIDDLEを指定すること。
 */
function exportSheetAsPdfBlob_(ss, sheet) {
  SpreadsheetApp.flush();

  var url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export' +
    '?exportFormat=pdf&format=pdf' +
    '&size=A4&portrait=false&scale=4' +
    '&top_margin=0&bottom_margin=0&left_margin=0&right_margin=0' +
    '&horizontal_alignment=CENTER&vertical_alignment=MIDDLE' +
    '&sheetnames=false&printtitle=false&pagenumbers=false' +
    '&gridlines=false&fzr=false&gid=' + sheet.getSheetId();

  var token = ScriptApp.getOAuthToken();
  var response = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    throw new Error('PDF出力に失敗しました。（HTTP ' + response.getResponseCode() + '）');
  }
  return response.getBlob();
}

/**
 * PDFを "<PDF_ROOT_FOLDER_NAME>/yyyy-MM/" フォルダへ保存する（月は処理日基準）。
 */
function savePdfToMonthlyFolder_(blob, fileName, timestamp) {
  var root = getOrCreateFolder_(DriveApp.getRootFolder(), PDF_ROOT_FOLDER_NAME);
  var monthFolder = getOrCreateFolder_(root, formatYearMonth_(timestamp));
  return monthFolder.createFile(blob.setName(fileName));
}

function getOrCreateFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function buildPdfFileName_(type, company, timestamp) {
  var safeCompany = String(company || '').replace(/[\/\\:*?"<>|]/g, '_');
  return '登録依頼書_' + type + '_' + safeCompany + '_' +
    Utilities.formatDate(timestamp, TIMEZONE, 'yyyyMMdd_HHmmss') + '.pdf';
}
