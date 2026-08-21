/**
 * OrderService.gs
 * 受注機能
 *
 * 受注確定時、販売リストから「受注リスト」へ自動移行する。
 * Hold中の車両を受注確定する場合、2nd Holdが存在しても不成立として破棄する。
 */

/**
 * 受注を確定し、販売リストの行を受注リストへ移行する。
 * @param {string} commission
 * @param {Object} info { salesLocation, staff, customer }
 */
function confirmOrder(commission, info) {
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

    var order = { salesLocation: info.salesLocation, staff: info.staff, customer: info.customer, orderedAt: new Date().getTime() };
    VEHICLE_COLUMNS.forEach(function (col) { order[col.key] = vehicle[col.key]; });

    appendOrder_(order);
    deleteInventoryRow_(sheet, rowNumber);
    notifyOrderConfirmed(order);
    return order;
  } finally {
    lock.releaseLock();
  }
}
