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
 * 履歴確認画面用に、指定期間（登録日ベース）に該当する履歴データをヘッダー付きで返す。
 * @param {string} fromDate "YYYY-MM-DD"（省略/空文字なら下限なし）
 * @param {string} toDate "YYYY-MM-DD"（省略/空文字なら上限なし）
 * @param {boolean} includePending 登録日未定の行も範囲を問わず含めるか
 */
function getHistoryEntriesByDateRange(fromDate, toDate, includePending) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // submissionIdは「訂正・取消」操作に必要なため、そのままクライアントへ返す。
  // 表示から隠す処理はクライアント側(JavaScript.html)の描画時に行う。
  return getHistoryEntriesByDateRange_(ss, fromDate, toDate, !!includePending);
}

/**
 * 指定した申請(submissionId)を「取消」状態にする。履歴確認画面の取消ボタンから呼ばれる。
 * @return {number} 更新した行数
 */
function cancelSubmission(submissionId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return cancelSubmission_(ss, submissionId);
}

/**
 * 「送付書PDF」画面用。指定した送付日の範囲(・送付便)に発行済みのPDFを申請単位で返す。
 */
function getPdfsBySendDate(fromDate, toDate, sendBatch) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return getPdfsBySendDateRange_(ss, fromDate, toDate, sendBatch);
}

// 二重送信防止用トークンのキャッシュ保持時間(秒)。ボタン連打やネットワーク遅延による
// 再送はほぼ数秒以内に発生するため、余裕をみて5分にしている。
var SUBMISSION_TOKEN_TTL_SEC = 300;

/**
 * フォーム送信のメイン処理（SPEC.md 4.2 送信処理）。
 * 0. submissionToken を CacheService でチェックし、同一トークンでの再処理を防ぐ
 * 1. サーバー側検証（NGならシートへの書き込みを一切行わずエラーを返す）
 * 2. LockServiceでテンプレート複製のみを保護
 * 3. 複製先へ値を書き込み → PDFエクスポート → Drive月別フォルダへ保存 → 一時シート削除
 * 4. 車両ごとに、登録日が属する年月の履歴タブへ追記
 * @return {string} 発行されたPDFのURL
 */
function processFormData(formData) {
  var cache = CacheService.getScriptCache();
  var token = formData.submissionToken;
  if (token) {
    if (cache.get('submission_' + token)) {
      throw new Error('この内容は送信処理中、または送信済みです。しばらく待ってから履歴をご確認ください。');
    }
    cache.put('submission_' + token, '1', SUBMISSION_TOKEN_TTL_SEC);
  }

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

  var pdfUrl = file.getUrl();
  activeVehicles.forEach(function (car, i) {
    appendHistoryRow_(ss, formData.type, car, formData, submissionId, i + 1, timestamp, pdfUrl);
  });

  return pdfUrl;
}
