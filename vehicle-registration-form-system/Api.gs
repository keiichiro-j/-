/**
 * Api.gs
 * クライアント（HTML）から google.script.run で呼び出すエントリポイント。
 */

/**
 * 初期表示時に呼ばれる。会社名・担当者などのコンボボックス候補を返す。
 */
function getSuggestions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return collectSuggestions_(ss);
}

/**
 * 履歴確認画面の対象月プルダウンを埋めるため、存在する月次履歴タブ名を新しい順に返す。
 */
function getHistoryTabNames() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return getAllHistoryTabNames_(ss);
}

/**
 * 履歴確認画面用に、指定タブの履歴データをヘッダー付きで返す。
 * @param {string} tabName getHistoryTabNames() が返す値のいずれか
 */
function getHistoryEntries(tabName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return getHistoryEntries_(ss, tabName);
}

/**
 * フォーム送信のメイン処理（SPEC.md 4.2 送信処理）。
 * 1. サーバー側検証（NGならシートへの書き込みを一切行わずエラーを返す）
 * 2. LockServiceでテンプレート複製のみを保護
 * 3. 複製先へ値を書き込み → PDFエクスポート → Drive月別フォルダへ保存 → 一時シート削除
 * 4. 車両ごとに、登録日が属する年月の履歴タブへ追記
 * @return {string} 発行されたPDFのURL
 */
function processFormData(formData) {
  var errors = validateFormData_(formData);
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var timestamp = new Date();
  var submissionId = Utilities.getUuid();
  var activeVehicles = getActiveVehicles_(formData.vehicles);

  var tempSheet = null;
  var lock = LockService.getScriptLock();
  lock.waitLock(30 * 1000);
  try {
    tempSheet = duplicateTemplateSheet_(ss, formData.type, submissionId);
  } finally {
    lock.releaseLock();
  }

  var file;
  try {
    writeCommonFields_(tempSheet, formData.type, formData);
    writeVehicleRows_(tempSheet, formData.type, activeVehicles);

    var pdfBlob = exportSheetAsPdfBlob_(ss, tempSheet);
    var fileName = buildPdfFileName_(formData.type, formData.company, timestamp);
    file = savePdfToMonthlyFolder_(pdfBlob, fileName, timestamp);
  } finally {
    ss.deleteSheet(tempSheet);
  }

  activeVehicles.forEach(function (car, i) {
    appendHistoryRow_(ss, formData.type, car, formData, submissionId, i + 1, timestamp);
  });

  return file.getUrl();
}
