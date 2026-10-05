/**
 * ChangeRequestService.gs
 * 「変更依頼」タブ: 発行済みの申請(履歴1行=車両1台)について、登録日・送付便だけを
 * 変更したPDFを再発行する。
 *
 * 【設計方針】
 * - 変更の単位は車両1台(履歴1行)ごと。OSSで1申請に複数台含まれていても、変更依頼は
 *   選んだ1台分だけを対象にする。
 * - 再発行するPDFは、選んだ1台分の情報だけを使って単票として組み立て直す(元の申請が
 *   複数台だった場合でも、他の車両を含む元のシートをそのまま複製することはできない
 *   ため)。会社名・担当責任者・送付日・飛騨登録の有無など、車両以外の共通項目は
 *   履歴行に記録済みの値をそのまま引き継ぐ。
 * - 登録日を変更すると、履歴タブは月ごとに分かれているため、該当する月のタブへ
 *   行ごと移動する(登録日を空にした場合は「登録日未定」タブへ移動する)。
 * - ブランドが設定されている行は、ブランド別の転記先スプレッドシート(ExternalSyncService.gs)
 *   にも新しい登録日を反映する。転記先が無い/転記に失敗した場合はPDF再発行・履歴更新は
 *   完了させた上で警告だけ呼び出し元に返す(processFormData_の失敗時方針と同じ)。
 * - 取消済みの申請は対象外(取り消した申請を変更すると状態が分かりにくくなるため)。
 */

/**
 * 「変更依頼」タブの検索結果用に、車両1台=1行として履歴データを返す(送付書PDF画面の
 * getPdfsBySendDateRange_とは異なり、申請単位にまとめない)。
 * @param {string} fromDate "YYYY-MM-DD"（空/不正なら下限なし）
 * @param {string} toDate "YYYY-MM-DD"（空/不正なら上限なし）
 * @param {string} sendBatch 例:"第１便"。空文字ならすべての便を対象にする
 * @param {string} keyword 使用者名の部分一致検索(空文字なら絞り込まない)
 * @return {Array<Object>} 送付日の新しい順
 */
function getChangeRequestCandidates_(ss, fromDate, toDate, sendBatch, keyword) {
  var fromD = isValidDateStr_(fromDate) ? parseDateOnly_(fromDate) : null;
  var toD = isValidDateStr_(toDate) ? parseDateOnly_(toDate) : null;
  var kw = String(keyword || '').trim().toLowerCase();

  var header = HISTORY_HEADER_ROW;
  var idx = {
    submissionId: header.indexOf('submissionId'),
    type: header.indexOf('種別'),
    company: header.indexOf('依頼会社名'),
    manager: header.indexOf('担当責任者'),
    regDate: header.indexOf('登録日'),
    sendDate: header.indexOf('送付日'),
    sendBatch: header.indexOf('送付便'),
    vehicleNo: header.indexOf('車両No.'),
    userName: header.indexOf('使用者名'),
    brand: header.indexOf('ブランド'),
    pdfUrl: header.indexOf('送付書PDF'),
    status: header.indexOf('状態'),
    changeRequest: header.indexOf('変更依頼')
  };

  var results = [];
  getAllHistoryTabNames_(ss).forEach(function (name) {
    getHistoryEntries_(ss, name).rows.forEach(function (row) {
      var sendDateStr = row[idx.sendDate];
      if (!isValidDateStr_(sendDateStr)) return;
      var d = parseDateOnly_(sendDateStr);
      if (fromD && d < fromD) return;
      if (toD && d > toD) return;
      if (sendBatch && row[idx.sendBatch] !== sendBatch) return;
      if (row[idx.status] === SUBMISSION_STATUS_CANCELLED) return; // 取消済みは対象外
      if (kw && String(row[idx.userName] || '').toLowerCase().indexOf(kw) === -1) return;

      results.push({
        submissionId: row[idx.submissionId],
        vehicleNo: row[idx.vehicleNo],
        type: row[idx.type],
        company: row[idx.company],
        manager: row[idx.manager],
        regDate: row[idx.regDate] || '',
        sendDate: row[idx.sendDate] || '',
        sendBatch: row[idx.sendBatch] || '',
        userName: row[idx.userName] || '',
        brand: row[idx.brand] || '',
        pdfUrl: row[idx.pdfUrl] || '',
        changeRequested: row[idx.changeRequest] === CHANGE_REQUEST_BADGE_LABEL
      });
    });
  });

  results.sort(function (a, b) {
    if (a.sendDate === b.sendDate) return 0;
    return a.sendDate < b.sendDate ? 1 : -1;
  });
  return results;
}

/**
 * submissionId・車両No.の組で履歴タブを横断して該当行を探す。
 * @return {?{tabName: string, sheet: Sheet, rowIndex: number, values: Array}}
 */
function findHistoryRowBySubmissionVehicle_(ss, submissionId, vehicleNo) {
  var header = HISTORY_HEADER_ROW;
  var subIdx = header.indexOf('submissionId');
  var noIdx = header.indexOf('車両No.');

  var tabNames = getAllHistoryTabNames_(ss);
  for (var t = 0; t < tabNames.length; t++) {
    var sheet = ss.getSheetByName(tabNames[t]);
    if (!sheet || sheet.getLastRow() < 2) continue;
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, header.length).getValues();
    for (var r = 0; r < values.length; r++) {
      if (values[r][subIdx] === submissionId && Number(values[r][noIdx]) === Number(vehicleNo)) {
        return { tabName: tabNames[t], sheet: sheet, rowIndex: r + 2, values: values[r] };
      }
    }
  }
  return null;
}

/**
 * Dateセルを"YYYY-MM-DD"文字列にする(Date以外・不正な値は空文字)。
 */
function dateCellToIsoStr_(value) {
  if (Object.prototype.toString.call(value) !== '[object Date]' || isNaN(value.getTime())) return '';
  return Utilities.formatDate(value, TIMEZONE, 'yyyy-MM-dd');
}

/**
 * 履歴1行から、writeVehicleRows_に渡せる「車両1台分」のオブジェクトを組み立てる。
 * @param {string} newRegDate 変更後の登録日("YYYY-MM-DD"、空文字なら未定)。OSSのみ
 *   車両側のindivRegDateとして使う(PAPER/GYOSEIはformData.regDateCommon側で扱うため)。
 */
function buildCarFromHistoryRow_(row, header, type, newRegDate) {
  function val(col) { return row[header.indexOf(col)]; }
  if (type === TYPE_GYOSEI) {
    return {
      userName: val('使用者名') || '',
      brand: val('ブランド') || '',
      person: val('担当者') || ''
    };
  }
  return {
    indivRegDate: (type === TYPE_OSS) ? newRegDate : '',
    userName: val('使用者名') || '',
    brand: val('ブランド') || '',
    chassis: val('車台番号') || '',
    model: val('型式') || '',
    classNum: val('類別番号') || '',
    autoTax: val('自動車税'),
    envTax: val('環境性能割'),
    weightTax: val('重量税'),
    hopeNum: val('希望ナンバー') || '',
    yobi: val('予備検登録車') || '',
    honken: val('本検登録車') || '',
    shinsho: val('身障者減免車') || '',
    person: val('担当者') || ''
  };
}

/**
 * 履歴1行から、writeCommonFields_に渡せるformData相当のオブジェクトを組み立てる。
 */
function buildFormDataFromHistoryRow_(row, header, type, newRegDate, newSendBatch) {
  function val(col) { return row[header.indexOf(col)]; }
  return {
    type: type,
    company: val('依頼会社名') || '',
    manager: val('担当責任者') || '',
    sendDate: dateCellToIsoStr_(val('送付日')),
    sendBatch: newSendBatch || val('送付便') || '',
    regDateCommon: (type !== TYPE_OSS) ? newRegDate : '',
    hidaRegistration: val('飛騨登録') === '対象',
    gyoseiClass: val('依頼事項') || '',
    gyoseiLocation: val('依頼拠点') || '',
    sealDate: dateCellToIsoStr_(val('封印取付日')),
    gyoseiVehicleLocation: val('車両所在') || ''
  };
}

function buildChangeRequestPdfFileName_(type, company, timestamp) {
  var safeCompany = String(company || '').replace(/[\/\\:*?"<>|]/g, '_');
  return '登録依頼書_変更依頼_' + type + '_' + safeCompany + '_' +
    Utilities.formatDate(timestamp, TIMEZONE, 'yyyyMMdd_HHmmss') + '.pdf';
}

/**
 * 「変更依頼」タブの保存ボタンから呼ばれるメイン処理。
 * @param {string} submissionId
 * @param {number} vehicleNo 履歴の「車両No.」列(1始まり)
 * @param {string} newRegDate 変更後の登録日("YYYY-MM-DD"、空文字なら「登録日未定」扱い)
 * @param {string} newSendBatch 変更後の送付便(空文字なら変更しない=元の値を維持)
 * @return {{pdfUrl: string, tabName: string, syncWarning: string}}
 */
function applyChangeRequest_(ss, submissionId, vehicleNo, newRegDate, newSendBatch) {
  if (!isNonEmptyString_(submissionId)) {
    throw new Error('対象の申請が指定されていません');
  }
  if (newRegDate && !isValidDateStr_(newRegDate)) {
    throw new Error('登録日の形式が不正です');
  }
  if (newSendBatch && SEND_BATCH_OPTIONS.indexOf(newSendBatch) === -1) {
    throw new Error('送付便の指定が不正です');
  }

  var found = findHistoryRowBySubmissionVehicle_(ss, submissionId, vehicleNo);
  if (!found) {
    throw new Error('対象の申請データが見つかりませんでした');
  }

  var header = HISTORY_HEADER_ROW;
  var row = found.values.slice();
  var type = row[header.indexOf('種別')];

  if (row[header.indexOf('状態')] === SUBMISSION_STATUS_CANCELLED) {
    throw new Error('取消済みの申請は変更できません');
  }

  var finalRegDate = (newRegDate !== undefined && newRegDate !== null && newRegDate !== '')
    ? newRegDate
    : dateCellToIsoStr_(row[header.indexOf('登録日')]);
  var finalSendBatch = newSendBatch || row[header.indexOf('送付便')] || '';

  var car = buildCarFromHistoryRow_(row, header, type, finalRegDate);
  var formData = buildFormDataFromHistoryRow_(row, header, type, finalRegDate, finalSendBatch);

  var tempSheet;
  var lock = LockService.getScriptLock();
  lock.waitLock(30 * 1000);
  try {
    tempSheet = duplicateTemplateSheet_(ss, type, 'chg_' + Utilities.getUuid());
  } finally {
    lock.releaseLock();
  }

  var pdfUrl;
  try {
    writeCommonFields_(tempSheet, type, formData);
    writeVehicleRows_(tempSheet, type, [car]);
    writeChangeRequestBadge_(tempSheet, type);

    var timestamp = new Date();
    var pdfBlob = exportSheetAsPdfBlob_(ss, tempSheet);
    var fileName = buildChangeRequestPdfFileName_(type, formData.company, timestamp);
    var file = savePdfToMonthlyFolder_(pdfBlob, fileName, timestamp);
    pdfUrl = file.getUrl();
  } finally {
    ss.deleteSheet(tempSheet);
  }

  // 履歴行を更新する(登録日・送付便・送付書PDF・変更依頼フラグ)。登録日の変更で
  // 月が変わる場合は、該当する月のタブへ行ごと移動する。
  row[header.indexOf('登録日')] = isValidDateStr_(finalRegDate) ? parseDateOnly_(finalRegDate) : '';
  row[header.indexOf('送付便')] = finalSendBatch;
  row[header.indexOf('送付書PDF')] = pdfUrl;
  row[header.indexOf('変更依頼')] = CHANGE_REQUEST_BADGE_LABEL;

  var newTabName = isValidDateStr_(finalRegDate) ? formatYearMonth_(parseDateOnly_(finalRegDate)) : HISTORY_PENDING_TAB_NAME;
  if (newTabName !== found.tabName) {
    var targetSheet = getOrCreateHistoryTab_(ss, newTabName);
    targetSheet.appendRow(row);
    found.sheet.deleteRow(found.rowIndex);
  } else {
    found.sheet.getRange(found.rowIndex, 1, 1, row.length).setValues([row]);
  }

  // ブランド別の転記先(外部スプレッドシート)にも新しい登録日を反映する。
  // 主処理(履歴更新・PDF再発行)は完了させた上で、失敗時は警告だけ返す。
  var syncWarning = '';
  var brand = row[header.indexOf('ブランド')];
  var userName = row[header.indexOf('使用者名')];
  if (brand && userName && isValidDateStr_(finalRegDate)) {
    try {
      var typeLabel = (type === TYPE_OSS) ? 'OSS' : '紙登録';
      syncRegistrationToExternalSheet_(userName, parseDateOnly_(finalRegDate), typeLabel, brand);
    } catch (e) {
      syncWarning = e.message;
    }
  }

  return { pdfUrl: pdfUrl, tabName: newTabName, syncWarning: syncWarning };
}
