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
 * 反映のタイミングは2種類:
 *   1. 新規追加・情報更新: 在庫は基本的にスプレッドシートへ直接追加・編集される
 *      運用のため、アプリが変更のタイミングを直接検知できない。そのため、
 *      デモカーリスト／サービス代車リストを一覧取得するたび（listCarTrackingList_）に、
 *      その時点の在庫リストの内容へ同期する（在庫中の車両を追加・最新情報に更新）。
 *   2. 販売済みへの変更・在庫への復帰: 受注確定（在庫リストからの除外）・
 *      受注キャンセル（在庫リストへの復元）はアプリが完全に制御する操作のため、
 *      その瞬間に正確に反映できる。OrderService.gsのconfirmOrder・
 *      confirmWholesaleOrder・cancelOrder・cancelWholesaleOrderから
 *      markCarTrackingIfApplicable_を呼び出す。
 */

/**
 * 区分の値から、対象のデモカーリスト／サービス代車リストのシートを返す
 * （対象外の区分の場合はnull）。
 */
function carTrackingSheetForCategory_(category) {
  if (category === DEMO_CAR_CATEGORY_VALUE) return getDemoCarListSheet_();
  if (category === SERVICE_CAR_CATEGORY_VALUE) return getServiceCarListSheet_();
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
  var liveVehicles = listInventory().filter(function (v) { return v.category === categoryValue; });
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
