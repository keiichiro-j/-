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
  // submissionIdは「取消」操作に必要なため、そのままクライアントへ返す。
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
 * 「送付書PDF」画面のメール送信機能でも同じ宛先欄を使うため、権限者以外でも取得できる
 * 必要がある(宛先の変更・保存(saveMailRecipients)自体は権限者のみに制限している)。
 */
function getMailRecipients() {
  return getSavedMailRecipients_();
}

/**
 * 「設定」画面のメール送信先保存ボタン用(権限者のみ)。送信は行わず、宛先の検証と保存だけを行う。
 * @param {Array<string>} recipients
 * @return {{recipientCount: number}}
 */
function saveMailRecipients(recipients) {
  assertAuthorizedAdmin_();
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
 * 「設定」画面の自動送信トグル用(権限者のみ)。トリガーの作成/削除を行い、切り替え後の状態を返す。
 * @param {boolean} enabled
 * @return {boolean}
 */
function setDailyMailTriggerEnabled(enabled) {
  assertAuthorizedAdmin_();
  return setDailyMailTriggerEnabled_(!!enabled);
}

/**
 * 「設定」画面・申請フォーム双方から呼ばれる。申請フォームの既定値(依頼会社名・担当者名)を返す。
 * 申請フォーム側の自動入力に使うため、権限者以外でも取得できる必要がある。
 * @return {{company: string, manager: string}}
 */
function getDefaultFormValues() {
  return getDefaultFormValues_();
}

/**
 * 「設定」画面の既定値保存ボタン用(権限者のみ)。
 * @param {{company: string, manager: string}} values
 * @return {{company: string, manager: string}}
 */
function saveDefaultFormValues(values) {
  assertAuthorizedAdmin_();
  return saveDefaultFormValues_(values);
}

/**
 * 画面上部にログイン中のアカウントを表示するために使う。
 * @return {string}
 */
function getCurrentUserEmail() {
  return getCurrentUserEmail_();
}

/**
 * 申請フォーム初期表示用。ログイン中のGoogleアカウントに対応する担当者名を返す
 * (担当者マスタに未登録・アカウント取得不可の場合は空文字。空文字の場合、クライアント側で
 * 「申請フォームの既定値」へフォールバックする)。
 * @return {string}
 */
function getManagerForCurrentUser() {
  return getManagerForCurrentUser_();
}

/**
 * 「設定」画面のテーマ表示用。ログイン中のGoogleアカウントに紐づく保存済みテーマを返す。
 * @return {string}
 */
function getThemePreference() {
  return getThemePreference_();
}

/**
 * 「設定」画面のテーマ選択用。
 * @param {string} theme
 * @return {string}
 */
function saveThemePreference(theme) {
  return saveThemePreference_(theme);
}

/**
 * 「設定」画面の担当者マスタ表示用(権限者のみ)。
 * @return {Array<{name: string, email: string}>}
 */
function getStaffMaster() {
  assertAuthorizedAdmin_();
  return getStaffMaster_();
}

/**
 * 「設定」画面の担当者マスタ保存ボタン用(権限者のみ)。
 * @param {Array<{name: string, email: string}>} rows
 * @return {Array<{name: string, email: string}>}
 */
function saveStaffMaster(rows) {
  assertAuthorizedAdmin_();
  return saveStaffMaster_(rows);
}

/**
 * 「設定」画面のブランド設定表示用。「名義変更」の備考欄の解釈(ExternalSyncService.gs参照)にも
 * 使うため、権限者以外でも取得できる必要がある。
 * @return {Array<string>}
 */
function getBrandOptions() {
  return getBrandOptions_();
}

/**
 * 「設定」画面のブランド設定保存ボタン用(権限者のみ)。
 * @param {Array<string>} brands
 * @return {Array<string>}
 */
function saveBrandOptions(brands) {
  assertAuthorizedAdmin_();
  return saveBrandOptions_(brands);
}

/**
 * 「設定」画面の他システム連携表示用(権限者のみ)。ブランドごとの転記先スプレッドシート
 * 一覧を返す(未設定なら空配列)。
 * @return {Array<{brand: string, sheetId: string}>}
 */
function getExternalSyncSheets() {
  assertAuthorizedAdmin_();
  return getExternalSyncSheets_();
}

/**
 * 「設定」画面の他システム連携保存ボタン用(権限者のみ)。
 * @param {Array<{brand: string, sheetId: string}>} rows
 * @return {Array<{brand: string, sheetId: string}>}
 */
function saveExternalSyncSheets(rows) {
  assertAuthorizedAdmin_();
  return saveExternalSyncSheets_(rows);
}

/**
 * 「設定」画面の表示切り替え用。ログイン中のGoogleアカウントが権限者かどうかを返す。
 * @return {boolean}
 */
function isAuthorizedAdmin() {
  return isAuthorizedAdmin_();
}

/**
 * 画面上部の常時アクティビティ表示用。本日の送付件数・直近の申請情報を返す。
 * @return {{todayCount: number, latestCompany: string, latestSentAt: string}}
 */
function getActivitySnapshot() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return getActivitySnapshot_(ss);
}

/**
 * ヘッダー(masthead)のロゴ画像表示用。設定済みの画像URLを返す。
 * @return {string}
 */
function getLogoUrl() {
  return getLogoUrl_();
}

/**
 * 「設定」画面のロゴ画像URL保存ボタン用(権限者のみ)。
 * @param {string} url
 * @return {string}
 */
function saveLogoUrl(url) {
  assertAuthorizedAdmin_();
  return saveLogoUrl_(url);
}

/**
 * 起動画面(ローディング画面)表示用。設定済みの画像URLを返す。
 * @return {string}
 */
function getLoadingImageUrl() {
  return getLoadingImageUrl_();
}

/**
 * 「設定」画面の起動画面(ローディング画面)画像URL保存用(権限者のみ)。ロゴ画像URLと同じく
 * Googleドライブの共有リンクを表示用URLへ自動変換する。空欄で保存すると画像なしに戻せる。
 * @param {string} url
 * @return {string} 保存後のURL(変換・トリム済み)
 */
function saveLoadingImageUrl(url) {
  assertAuthorizedAdmin_();
  return saveLoadingImageUrl_(url);
}

// 二重送信防止用トークンのキャッシュ保持時間(秒)。ボタン連打やネットワーク遅延による
// 再送はほぼ数秒以内に発生するため、余裕をみて5分にしている。
var SUBMISSION_TOKEN_TTL_SEC = 300;

/**
 * フォーム送信のメイン処理。
 * 0. submissionToken を CacheService でチェックし、同一トークンでの再処理を防ぐ
 * 1. サーバー側検証（NGならシートへの書き込みを一切行わずエラーを返す）
 * 2. LockServiceでテンプレート複製のみを保護
 * 3. 複製先へ値を書き込み → PDFエクスポート → Drive月別フォルダへ保存 → 一時シート削除
 * 4. 明細ごとに、登録日が属する年月の履歴タブへ追記
 * 5. 「名義変更」の明細は、備考欄が「使用者名+ブランドコード」の表記になっていれば
 *    他システム(外部スプレッドシート、設定済みの場合のみ)へ転記する。この転記は本アプリの
 *    主処理(PDF発行・履歴記録)には影響させず、失敗しても1件ごとにその旨を警告として
 *    集めて返すだけにする(ExternalSyncService.gs参照)。
 * @return {{pdfUrl: string, transcriptionWarnings: Array<string>, transcriptionSuccessCount: number}}
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
  var activeItems = getActiveItems_(formData.docType, formData.items);

  var tempSheet = null;
  var lock = LockService.getScriptLock();
  lock.waitLock(30 * 1000);
  try {
    tempSheet = duplicateTemplateSheet_(ss, formData.docType, submissionId);
  } finally {
    lock.releaseLock();
  }

  var file;
  try {
    writeCommonFields_(tempSheet, formData.docType, formData);
    writeItemRows_(tempSheet, formData.docType, activeItems);

    var pdfBlob = exportSheetAsPdfBlob_(ss, tempSheet);
    var fileName = buildPdfFileName_(formData.docType, formData.company, timestamp);
    file = savePdfToMonthlyFolder_(pdfBlob, fileName, timestamp);
  } finally {
    ss.deleteSheet(tempSheet);
  }

  var pdfUrl = file.getUrl();
  var transcriptionWarnings = [];
  var transcriptionSuccessCount = 0;
  activeItems.forEach(function (item, i) {
    appendHistoryRow_(ss, formData.docType, item, formData, submissionId, i + 1, timestamp, pdfUrl);

    if (formData.docType !== DOC_TYPE_TRANSFER) return; // 転記は「名義変更」の明細のみ対象
    if (!isValidDateStr_(formData.regDate)) return; // 登録日未定では転記のしようがないためスキップ
    var parsed = parseTransferRemarks_(item.remarks);
    if (!parsed) return; // 備考欄が「使用者名+ブランドコード」の表記でなければ対象外(エラーにしない)
    try {
      if (syncRegistrationToExternalSheet_(parsed.name, parseDateOnly_(formData.regDate), parsed.brand)) {
        transcriptionSuccessCount++;
      }
    } catch (e) {
      transcriptionWarnings.push((parsed.name || (i + 1) + '件目') + ': ' + e.message);
    }
  });

  return { pdfUrl: pdfUrl, transcriptionWarnings: transcriptionWarnings, transcriptionSuccessCount: transcriptionSuccessCount };
}
