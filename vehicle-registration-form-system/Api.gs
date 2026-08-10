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

/**
 * 「送付書PDF」画面のメール送信ボタン用。指定した送付日の全便(第１便〜第３便、取消済みを除く)
 * 分のPDFをまとめて宛先へメール送信する。
 * @return {{sentCount: number, recipientCount: number}}
 */
function sendPdfsByEmail(sendDate, recipients) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return sendPdfsByEmail_(ss, sendDate, recipients);
}

/**
 * メール送信フォームの初期表示用。前回送信時に使った宛先を返す(入力の手間を減らすため)。
 */
function getMailRecipients() {
  return getSavedMailRecipients_();
}

/**
 * 「設定」画面のメール送信先保存ボタン用。送信は行わず、宛先の検証と保存だけを行う。
 * @param {Array<string>} recipients
 * @return {{recipientCount: number}}
 */
function saveMailRecipients(recipients) {
  return saveMailRecipientsOnly_(recipients);
}

/**
 * 「設定」画面の自動送信トグル用。現在の設定状態(ON/OFF)を返す。
 * @return {boolean}
 */
function getDailyMailTriggerStatus() {
  return isDailyMailTriggerEnabled_();
}

/**
 * 「設定」画面の自動送信トグル用。トリガーの作成/削除を行い、切り替え後の状態を返す。
 * @param {boolean} enabled
 * @return {boolean}
 */
function setDailyMailTriggerEnabled(enabled) {
  return setDailyMailTriggerEnabled_(!!enabled);
}

/**
 * 「設定」画面・申請フォーム双方から呼ばれる。申請フォームの既定値(依頼会社名・担当責任者)を返す。
 * @return {{company: string, manager: string}}
 */
function getDefaultFormValues() {
  return getDefaultFormValues_();
}

/**
 * 「設定」画面の既定値保存ボタン用。
 * @param {{company: string, manager: string}} values
 * @return {{company: string, manager: string}}
 */
function saveDefaultFormValues(values) {
  return saveDefaultFormValues_(values);
}

/**
 * 画面上部の常時アクティビティ表示用。本日の送付件数・直近の申請情報を返す。
 * @return {{todayCount: number, latestCompany: string, latestSentAt: string}}
 */
function getActivitySnapshot() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return getActivitySnapshot_(ss);
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
