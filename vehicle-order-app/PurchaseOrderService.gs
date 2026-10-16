/**
 * PurchaseOrderService.gs
 * 発注リスト機能（閲覧専用）
 *
 * 在庫リスト・受注リストとは異なり、Hold中／受注確定のようなステータス管理や
 * メール・Google Chat通知は持たない、シンプルな一覧（発注情報を後から見返せる
 * ようにするための台帳）。アプリ画面はスプレッドシートのデータを閲覧する専用の
 * ため、登録・編集・削除はいずれもアプリ画面からは行わず、変更はすべて
 * スプレッドシートへ直接行う運用にしている（Api.gs・html/Index.html・
 * JavaScript.html参照）。addPurchaseOrder / updatePurchaseOrder / deletePurchaseOrder
 * 自体は、GASエディタから直接実行する場合等に備えて残してある（api_ラッパーは
 * addPurchaseOrderのみ用意しており、update・deleteはクライアントから呼び出せない）。
 * モデル名・拠点・担当者・顧客は必須、コミッション・リード番号はまだ確定していない
 * 段階でも登録できるよう任意項目にしている（PURCHASE_ORDER_INPUT_COLUMNS参照）。
 * id は自動採番する一意な識別子で、編集・削除時の行特定に使う
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
// 発注情報の登録・編集・削除はスプレッドシートへ直接行う運用で、アプリ画面からは呼ばない。
// ただしトップレベル関数は google.script.run から直接呼べてしまうため、管理者以外の
// 書き換えはサーバー側で拒否する（GASエディタから管理者が実行する用途は残す）。
function requireAdminForPurchaseOrderWrite_() {
  if (!isSystemAdmin_(Session.getActiveUser().getEmail())) {
    throw new Error('発注情報の登録・編集・削除は管理者のみ行えます');
  }
}

function addPurchaseOrder(info) {
  requireAdminForPurchaseOrderWrite_();
  var check = validateRequiredInfo_(PURCHASE_ORDER_INPUT_COLUMNS, info);
  if (!check.ok) throw new Error(check.reason);

  var lock = acquireScriptLock_();
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
    releaseScriptLock_(lock);
  }
}

/**
 * 発注情報を編集する。id・createdAt（登録日時）は変更しない。
 * @param {string} id
 * @param {Object} info { model, salesLocation, staff, customer, commission, leadNumber }
 */
function updatePurchaseOrder(id, info) {
  requireAdminForPurchaseOrderWrite_();
  var check = validateRequiredInfo_(PURCHASE_ORDER_INPUT_COLUMNS, info);
  if (!check.ok) throw new Error(check.reason);

  var lock = acquireScriptLock_();
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
    releaseScriptLock_(lock);
  }
}

/**
 * 発注情報を削除する。
 * @param {string} id
 */
function deletePurchaseOrder(id) {
  requireAdminForPurchaseOrderWrite_();
  var lock = acquireScriptLock_();
  try {
    var sheet = getPurchaseOrderSheet_();
    var rowNumber = findPurchaseOrderRowNumber_(sheet, id);
    if (!rowNumber) throw new Error('該当の発注情報が見つかりません');
    sheet.deleteRow(rowNumber);
    return { id: id };
  } finally {
    releaseScriptLock_(lock);
  }
}
