/**
 * PurchaseOrderService.gs
 * 発注リスト機能
 *
 * 在庫リスト・受注リストとは異なり、Hold中／受注確定のようなステータス管理や
 * メール・Google Chat通知は持たない、シンプルな一覧（発注情報を後から見返せる
 * ようにするための台帳）。アプリ画面はスプレッドシートのデータを閲覧する専用の
 * ため、新規登録はアプリ画面からは行わず、スプレッドシートへ直接追加する運用
 * にしている（既存行の編集・削除はアプリ画面からできる。Api.gs・html/Index.html・
 * JavaScript.html参照）。addPurchaseOrder自体はGASエディタから直接実行する場合等に
 * 備えて残してある。
 * モデル名・拠点・担当者・顧客は必須、コミッション・リード番号はまだ確定していない
 * 段階でも登録できるよう任意項目にしている（PURCHASE_ORDER_INPUT_COLUMNS参照）。
 * id はアプリが自動採番する一意な識別子で、編集・削除時の行特定に使う
 * （コミッションは任意項目のため一意性・存在を前提にできない）。
 */

/**
 * 発注リストの入力内容（PURCHASE_ORDER_INPUT_COLUMNS）から、保存用のレコードを
 * 組み立てる（純粋関数）。id・createdAtは呼び出し元がそれぞれの用途に応じて設定する。
 */
function buildPurchaseOrderRecord_(info) {
  var record = {};
  PURCHASE_ORDER_INPUT_COLUMNS.forEach(function (c) {
    record[c.key] = String((info && info[c.key]) || '').trim();
  });
  return record;
}

function listPurchaseOrders() {
  var rows = listPurchaseOrders_();
  rows.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  return rows;
}

/**
 * 発注情報を新規登録する。
 * @param {Object} info { model, salesLocation, staff, customer, commission, leadNumber }
 */
function addPurchaseOrder(info) {
  var check = validateRequiredInfo_(PURCHASE_ORDER_INPUT_COLUMNS, info);
  if (!check.ok) throw new Error(check.reason);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getPurchaseOrderSheet_();
    var record = Object.assign({ id: Utilities.getUuid(), createdAt: new Date().getTime() }, buildPurchaseOrderRecord_(info));
    var newRow = sheet.getLastRow() + 1;
    // id・コミッションは数字のみの値が混じっても先頭0等が消えないよう、
    // 他のシート（在庫リスト等）と同様に書式なしテキストへ明示的に設定してから書き込む。
    sheet.getRange(newRow, purchaseOrderColIndex1('id'), 1, 1).setNumberFormat('@');
    sheet.getRange(newRow, purchaseOrderColIndex1('commission'), 1, 1).setNumberFormat('@');
    sheet.getRange(newRow, 1, 1, PURCHASE_ORDER_COLUMNS.length).setValues([objectToRow_(record, PURCHASE_ORDER_COLUMNS)]);
    return record;
  } finally {
    lock.releaseLock();
  }
}

/**
 * 発注情報を編集する。id・createdAt（登録日時）は変更しない。
 * @param {string} id
 * @param {Object} info { model, salesLocation, staff, customer, commission, leadNumber }
 */
function updatePurchaseOrder(id, info) {
  var check = validateRequiredInfo_(PURCHASE_ORDER_INPUT_COLUMNS, info);
  if (!check.ok) throw new Error(check.reason);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getPurchaseOrderSheet_();
    var rowNumber = findPurchaseOrderRowNumber_(sheet, id);
    if (!rowNumber) throw new Error('該当の発注情報が見つかりません');
    var current = rowToObject_(
      sheet.getRange(rowNumber, 1, 1, PURCHASE_ORDER_COLUMNS.length).getValues()[0],
      PURCHASE_ORDER_COLUMNS,
      rowNumber
    );
    var merged = Object.assign({}, current, buildPurchaseOrderRecord_(info), { id: current.id, createdAt: current.createdAt });
    sheet.getRange(rowNumber, purchaseOrderColIndex1('id'), 1, 1).setNumberFormat('@');
    sheet.getRange(rowNumber, purchaseOrderColIndex1('commission'), 1, 1).setNumberFormat('@');
    sheet.getRange(rowNumber, 1, 1, PURCHASE_ORDER_COLUMNS.length).setValues([objectToRow_(merged, PURCHASE_ORDER_COLUMNS)]);
    return merged;
  } finally {
    lock.releaseLock();
  }
}

/**
 * 発注情報を削除する。
 * @param {string} id
 */
function deletePurchaseOrder(id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getPurchaseOrderSheet_();
    var rowNumber = findPurchaseOrderRowNumber_(sheet, id);
    if (!rowNumber) throw new Error('該当の発注情報が見つかりません');
    sheet.deleteRow(rowNumber);
    return { id: id };
  } finally {
    lock.releaseLock();
  }
}
