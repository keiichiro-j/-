/**
 * TemplateService.gs
 * テンプレートシートの複製・書き込み・PDF出力・Drive保存。
 */

/**
 * 送信ごとに、該当ファミリーのテンプレートシートを複製して一時シートを作る。
 * @return {Sheet}
 */
function duplicateTemplateSheet_(ss, docType, submissionId) {
  var template = ss.getSheetByName(SHEET_NAMES[docType]);
  if (!template) {
    throw new Error('テンプレートシート「' + SHEET_NAMES[docType] + '」が見つかりません。setupTemplateSheets() を実行してください。');
  }
  var tempSheet = template.copyTo(ss);
  tempSheet.setName('__tmp_' + docType + '_' + submissionId);
  tempSheet.hideSheet();
  return tempSheet;
}

/**
 * 共通項目(送付日・送付便・登録日・依頼会社名・担当者名・バリエーション表示)を書き込む。
 */
function writeCommonFields_(sheet, docType, formData) {
  var maxCol = maxColumnOf_(VEHICLE_COLUMNS[docType]);

  sheet.getRange(COMMON_CELLS.sendDateRow, 2).setValue(formatDateJp_(formData.sendDate));
  sheet.getRange(COMMON_CELLS.sendBatchRow, 2).setValue(formData.sendBatch);
  sheet.getRange(COMMON_CELLS.regDateRow, 2).setValue(formatDateJp_(formData.regDate));
  sheet.getRange(COMMON_CELLS.companyRow, 2).setValue(formData.company);
  sheet.getRange(COMMON_CELLS.managerRow, 2).setValue(formData.manager);

  writeVariantBadge_(sheet, docType, formData, maxCol);
}

function formatDateJp_(dateStr) {
  if (!isValidDateStr_(dateStr)) return '';
  return Utilities.formatDate(parseDateOnly_(dateStr), TIMEZONE, 'yyyy年MM月dd日');
}

/**
 * バリエーション表示(飛騨/軽自動車/複合抹消/単純抹消)をバナー右端セルに書き込む。
 * 飛騨登録がONのときだけ、新車新規登録依頼書システムと同じ配色(HIDA_BADGE_COLOR)で強調する。
 */
function writeVariantBadge_(sheet, docType, formData, maxCol) {
  var cell = sheet.getRange(COMMON_CELLS.variantBadgeRow, maxCol);
  var labelParts = [];
  var isHida = docType === DOC_TYPE_TRANSFER && !!formData.hidaRegistration;

  if (docType === DOC_TYPE_TRANSFER) {
    if (isHida) labelParts.push('飛騨');
    if (formData.isKei) labelParts.push('軽自動車');
  } else if (docType === DOC_TYPE_CANCELLATION) {
    labelParts.push(CANCELLATION_KIND_LABELS[formData.cancelKind] || CANCELLATION_KIND_LABELS[CANCELLATION_KIND_SIMPLE]);
    if (formData.isKei) labelParts.push('軽自動車');
  }

  cell.setValue(labelParts.join('　'));
  if (isHida) {
    cell.setBackground(HIDA_BADGE_COLOR.bg);
    cell.setFontColor(HIDA_BADGE_COLOR.text);
  } else {
    cell.setBackground(null);
    cell.setFontColor(THEME.ink);
  }
}

/**
 * 明細行(1台/1件ぶん)を書き込む。番号列(1列目)はここで連番を書く
 * (テンプレート側は空欄のままにしてあるため、未使用行に不自然な番号が印字されない)。
 */
function writeItemRows_(sheet, docType, items) {
  var columns = VEHICLE_COLUMNS[docType];
  items.forEach(function (item, i) {
    var row = COMMON_CELLS.vehicleStartRow + i;
    sheet.getRange(row, 1).setValue(i + 1);
    Object.keys(columns).forEach(function (key) {
      var value = item[key];
      if (key === 'stamp' || key === 'plateFee' || key === 'agencyFee' || (key === 'envTax') || key === 'keiFee') {
        if (docType !== DOC_TYPE_PLATE_CHANGE) {
          sheet.getRange(row, columns[key]).setValue(toNonNegativeInt_(value));
          return;
        }
      }
      sheet.getRange(row, columns[key]).setValue(value || '');
    });
  });

  // 番号変更のみ、代行料・印紙は未入力なら既定値を印字する(元データ通り)。
  if (docType === DOC_TYPE_PLATE_CHANGE) {
    items.forEach(function (item, i) {
      var row = COMMON_CELLS.vehicleStartRow + i;
      if (!String(item.agencyFee || '').trim()) {
        sheet.getRange(row, columns.agencyFee).setValue(PLATE_CHANGE_DEFAULT_AGENCY_FEE);
      }
      if (!String(item.stamp || '').trim()) {
        sheet.getRange(row, columns.stamp).setValue(PLATE_CHANGE_DEFAULT_STAMP);
      }
    });
  }
}

/**
 * 指定シートだけをA4横向きでPDF化する(Drive上のスプレッドシート全体ではなく、
 * 対象シート1枚だけをエクスポートするため、Sheets の gid 付きエクスポートURLを使う)。
 */
function exportSheetAsPdfBlob_(ss, sheet) {
  var url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export'
    + '?format=pdf'
    + '&gid=' + sheet.getSheetId()
    + '&size=A4'
    + '&portrait=false'
    + '&fitw=true'
    + '&gridlines=false'
    + '&printtitle=false'
    + '&sheetnames=false'
    + '&top_margin=0.4&bottom_margin=0.4&left_margin=0.4&right_margin=0.4';

  var response = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  });
  return response.getBlob();
}

function buildPdfFileName_(docType, company, timestamp) {
  var ts = Utilities.formatDate(timestamp, TIMEZONE, 'yyyyMMdd_HHmmss');
  var safeCompany = String(company || '').replace(/[\\\/:*?"<>|]/g, '_');
  return DOC_TYPE_LABELS[docType] + '_' + safeCompany + '_' + ts + '.pdf';
}

function savePdfToMonthlyFolder_(blob, fileName, timestamp) {
  var root = getOrCreateFolder_(DriveApp.getRootFolder(), PDF_ROOT_FOLDER_NAME);
  var monthFolder = getOrCreateFolder_(root, Utilities.formatDate(timestamp, TIMEZONE, 'yyyy-MM'));
  return monthFolder.createFile(blob.setName(fileName));
}

function getOrCreateFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
