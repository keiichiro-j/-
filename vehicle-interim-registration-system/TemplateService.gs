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
  return tempSheet;
}

/**
 * 共通項目(送付日・送付便・登録日・依頼会社名・担当者名・バリエーション表示)を書き込む。
 * 元データと同じく、送付日と送付便は1つの欄にまとめて印字する(例: "2026年08月20日　第２便")。
 */
function writeCommonFields_(sheet, docType, formData) {
  var maxCol = VEHICLE_MAX_COL[docType];
  var split = bannerSplit_(maxCol);

  var sendValue = formatDateJp_(formData.sendDate) + (formData.sendBatch ? '　' + formData.sendBatch : '');
  sheet.getRange(COMMON_CELLS.sendRow, split.leftValueCol).setValue(sendValue);
  sheet.getRange(COMMON_CELLS.sendRow, split.rightValueCol).setValue(formData.company);

  sheet.getRange(COMMON_CELLS.regRow, split.leftValueCol).setValue(formatDateJp_(formData.regDate));
  sheet.getRange(COMMON_CELLS.regRow, split.rightValueCol).setValue(formData.manager);

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
 * 登録区分などのチェックボックス項目は、選択された選択肢の列にだけ CHECKBOX_MARK(〇)を書く
 * (元データの「該当する欄に〇を記入する」形式を再現する)。
 */
function writeItemRows_(sheet, docType, items) {
  var columns = VEHICLE_COLUMNS[docType];
  var order = FIELD_ORDER[docType];
  var numericKeys = NUMERIC_FIELD_KEYS[docType] || [];

  items.forEach(function (item, i) {
    var row = COMMON_CELLS.vehicleStartRow + i;
    sheet.getRange(row, 1).setValue(i + 1);

    order.forEach(function (key) {
      var options = CHECKBOX_OPTIONS[key];
      if (options) {
        writeCheckboxField_(sheet, row, columns[key], options, item[key]);
        return;
      }
      if (docType !== DOC_TYPE_PLATE_CHANGE && numericKeys.indexOf(key) !== -1) {
        sheet.getRange(row, columns[key]).setValue(toNonNegativeInt_(item[key]));
        return;
      }
      sheet.getRange(row, columns[key]).setValue(item[key] || '');
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
 * 選択肢(options)のうち selectedValue に一致する列だけ CHECKBOX_MARK を書き、
 * それ以外の列は空欄にする(未使用行を複製しても前回値が残らないようにするため)。
 */
function writeCheckboxField_(sheet, row, startCol, options, selectedValue) {
  options.forEach(function (opt, i) {
    sheet.getRange(row, startCol + i).setValue(opt === selectedValue ? CHECKBOX_MARK : '');
  });
}

/**
 * 指定シートだけをA4横向きでPDF化する(Drive上のスプレッドシート全体ではなく、
 * 対象シート1枚だけをエクスポートするため、Sheets の gid 付きエクスポートURLを使う)。
 */
function exportSheetAsPdfBlob_(ss, sheet) {
  // 直前の書き込みがまだ確定していないと、エクスポートが空白ページを返すことがあるため、
  // Sheetsへの反映を確実に待ってからPDF化する。
  SpreadsheetApp.flush();

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
