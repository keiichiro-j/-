/**
 * CarTrackingService.gs
 * デモカーリスト／サービス代車リスト機能
 *
 * 在庫リストの区分（category）が「デモカー」「サービス」の車両を、在庫リストとは
 * 別の専用シート（デモカーリスト・サービス代車リスト）へ反映する。管理者権限を
 * 持つ担当者のみ閲覧できる（Api.gs参照）。在庫リストの区分デモカー・サービスの
 * 車両自体は、これまでどおり在庫リストにも変わらず表示され続ける（このシートは
 * 追加の管理用ビューであり、在庫リストからは何も除外しない）。
 *
 * 反映のタイミングは3種類:
 *   1. 在庫リストの直接編集（新規行の追加・区分の変更・情報修正）: インストール型の
 *      onEditトリガー（Triggers.gsのtriggerInventoryEdited参照）が、在庫リストへの
 *      編集のたびにsyncAllCarTrackingLists_を呼び出し、その時点の在庫リストの内容へ
 *      自動同期する。誰が編集してもオーナー権限で確実に動くよう、簡易トリガーでは
 *      なくインストール型にしている。
 *   2. デモカーリスト／サービス代車リストをアプリで開いたとき: 一覧取得のたび
 *      （listCarTrackingList_）にも同期する。onEditトリガーが未設定・何らかの
 *      理由で取りこぼした場合の保険を兼ねる。
 *   3. 販売済みへの変更・在庫への復帰: 受注確定（在庫リストからの除外）・
 *      受注キャンセル（在庫リストへの復元）はアプリが完全に制御する操作のため、
 *      その瞬間に正確に反映できる。OrderService.gsのconfirmOrder・
 *      confirmWholesaleOrder・cancelOrder・cancelWholesaleOrderから
 *      markCarTrackingIfApplicable_を呼び出す。
 *
 * 既存の在庫（この機能を追加する前から在庫リストにあった車両）も、上記1〜2の
 * いずれかのタイミング（次回の在庫リスト編集、またはデモカーリスト／サービス代車
 * リストをアプリで開いたとき）で自動的に反映される。今すぐ反映したい場合は、
 * スプレッドシートのメニュー「販売可能リスト」→「デモカーリスト・サービス代車
 * リストを在庫リストの内容で更新」（SetupService.gsのsyncCarTrackingListsManually_）
 * を実行するか、初期セットアップ（setupSpreadsheet_）を再実行する。
 */

/**
 * 在庫リストの区分（category）の値と、対象区分（デモカー／サービス）を比較する。
 * 区分は自由記述のテキスト列のため、スプレッドシート側で前後に空白が入って
 * しまっていても正しく一致と判定できるよう、前後の空白を無視して比較する
 * （不具合修正: 空白が原因で「デモカー」と完全一致せず、区分デモカーの車両が
 * 一件もデモカーリストに反映されないという事象があったため）。
 */
function categoryMatchesCarTracking_(category, targetValue) {
  return String(category || '').trim() === targetValue;
}

/**
 * 区分の値から、対象のデモカーリスト／サービス代車リストのシートを返す
 * （対象外の区分の場合はnull）。
 */
function carTrackingSheetForCategory_(category) {
  if (categoryMatchesCarTracking_(category, DEMO_CAR_CATEGORY_VALUE)) return getDemoCarListSheet_();
  if (categoryMatchesCarTracking_(category, SERVICE_CAR_CATEGORY_VALUE)) return getServiceCarListSheet_();
  return null;
}

/**
 * 受注確定（販売済みへ）・受注キャンセル（在庫中へ）のタイミングで、対象車両の
 * 区分がデモカー／サービスであれば、専用シートの該当行へ販売状況を反映する。
 * 対象外の区分の車両（通常の在庫）には何もしない。
 * @param {Object} vehicle VEHICLE_COLUMNSのキー（category・ocn等）を持つ車両情報
 * @param {string} saleStatus CAR_TRACKING_STATUS.IN_STOCK または .SOLD
 */
function markCarTrackingIfApplicable_(vehicle, saleStatus) {
  var sheet = carTrackingSheetForCategory_(vehicle.category);
  if (!sheet) return;
  upsertCarTrackingRow_(sheet, vehicle, saleStatus);
}

/**
 * 現在の在庫リストのうち、指定区分の車両（＝在庫中のもの）を専用シートへ
 * 追加・最新情報へ更新する。販売済みへの変更はここでは行わない
 * （markCarTrackingIfApplicable_が受注確定の瞬間に正確に行うため、在庫リストに
 * 見当たらないからといってここで「販売済み」と推測することはしない。手動で
 * 在庫リストの行を削除した等の理由である可能性があり、誤って販売済みにして
 * しまうことを避ける）。
 */
function syncCarTrackingFromInventory_(sheet, categoryValue) {
  var liveVehicles = listInventory().filter(function (v) { return categoryMatchesCarTracking_(v.category, categoryValue); });
  liveVehicles.forEach(function (v) {
    upsertCarTrackingRow_(sheet, v, CAR_TRACKING_STATUS.IN_STOCK);
  });
}

/**
 * デモカーリスト／サービス代車リストの一覧取得。取得のたびに在庫リストの
 * 最新内容へ同期してから返す（syncCarTrackingFromInventory_参照）。
 */
function listCarTrackingList_(sheet, categoryValue) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    syncCarTrackingFromInventory_(sheet, categoryValue);
  } finally {
    lock.releaseLock();
  }
  return listCarTracking_(sheet);
}

/**
 * デモカーリスト・サービス代車リスト双方を、現在の在庫リストの内容へ同期する。
 * 在庫リスト編集時のonEditトリガー（Triggers.gsのtriggerInventoryEdited）・
 * 初期セットアップ実行時（SetupService.gsのsetupSpreadsheet_）・手動同期メニュー
 * （SetupService.gsのsyncCarTrackingListsManually_）のいずれからも呼び出す
 * 共通処理。
 */
function syncAllCarTrackingLists_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    syncCarTrackingFromInventory_(getDemoCarListSheet_(), DEMO_CAR_CATEGORY_VALUE);
    syncCarTrackingFromInventory_(getServiceCarListSheet_(), SERVICE_CAR_CATEGORY_VALUE);
  } finally {
    lock.releaseLock();
  }
}
