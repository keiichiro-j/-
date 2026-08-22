/**
 * OrderService.gs
 * 受注機能
 *
 * 受注確定時、在庫リストから「受注リスト」へ自動移行する。
 * Hold中の車両は、Holdを行った担当者のみ受注確定できる（canConfirmOrder_）。
 * Holdが入っていない車両は誰でも受注確定できる。
 * 受注確定時も、Hold登録時と同じ入力項目をすべて入力する必要がある
 * （担当者はログイン中のGoogleアカウントから自動設定される。requireCurrentStaff_参照）。
 */

/**
 * 受注を確定し、在庫リストの行を受注リストへ移行する。
 * @param {string} commission
 * @param {Object} info { salesLocation, leadNumber, registeredMonth, customer, tradeIn, oss, insurance }
 */
function confirmOrder(commission, info) {
  var currentStaff = requireCurrentStaff_();
  info = Object.assign({}, info, { staff: currentStaff.name, staffEmail: currentStaff.email });
  var inputCheck = validateRequiredInfo_(HOLD_ORDER_INPUT_COLUMNS, info);
  if (!inputCheck.ok) throw new Error(inputCheck.reason);
  if (!info.salesLocation || !String(info.salesLocation).trim()) {
    throw new Error('販売拠点を入力してください');
  }
  info.leadNumber = normalizeLeadNumber_(info.leadNumber);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getInventorySheet_();
    var rowNumber = findInventoryRowNumber_(sheet, commission);
    if (!rowNumber) throw new Error('該当車両が見つかりません（コミッション: ' + commission + '）');
    var vehicle = rowToObject_(
      sheet.getRange(rowNumber, 1, 1, INVENTORY_COLUMNS.length).getValues()[0],
      INVENTORY_COLUMNS,
      rowNumber
    );
    var holds = getHoldsForCommission_(commission);
    var check = canConfirmOrder_(vehicle, holds.first, currentStaff.email);
    if (!check.ok) throw new Error(check.reason);

    var order = { salesLocation: info.salesLocation, orderedAt: new Date().getTime() };
    HOLD_ORDER_INPUT_COLUMNS.forEach(function (c) { order[c.key] = info[c.key]; });
    order.staffEmail = info.staffEmail;
    order.isDemo = deriveOrderIsDemo_(vehicle);
    VEHICLE_COLUMNS.forEach(function (col) { order[col.key] = vehicle[col.key]; });

    appendOrder_(order);
    deleteInventoryRow_(sheet, rowNumber);
    deleteAllHoldRowsForCommission_(commission);
    notifyOrderConfirmed(order);
    return order;
  } finally {
    lock.releaseLock();
  }
}
