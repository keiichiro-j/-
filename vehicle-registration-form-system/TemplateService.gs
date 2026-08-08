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
  var templateName = (type === TYPE_OSS) ? SHEET_NAMES.OSS_TEMPLATE : SHEET_NAMES.PAPER_TEMPLATE;
  var templateSheet = ss.getSheetByName(templateName);
  if (!templateSheet) {
    throw new Error('指定されたテンプレートシートが見つかりません: ' + templateName);
  }
  var tempSheet = templateSheet.copyTo(ss);
  tempSheet.setName('_tmp_' + type + '_' + submissionId);
  return tempSheet;
}

function writeCommonFields_(sheet, type, formData) {
  sheet.getRange(COMMON_CELLS.company).setValue(formData.company);
  sheet.getRange(COMMON_CELLS.manager).setValue(formData.manager);
  sheet.getRange(COMMON_CELLS.sendDate).setValue(formatMonthDay_(formData.sendDate));
  sheet.getRange(COMMON_CELLS.sendBatch).setValue(formData.sendBatch || '');

  if (type === TYPE_PAPER && isValidDateStr_(formData.regDateCommon)) {
    sheet.getRange(COMMON_CELLS.regDateCommon).setValue(formatMonthDay_(formData.regDateCommon));
  }
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
 */
function exportSheetAsPdfBlob_(ss, sheet) {
  SpreadsheetApp.flush();

  var url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export' +
    '?exportFormat=pdf&format=pdf' +
    '&size=A4&portrait=false&fitw=true' +
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
