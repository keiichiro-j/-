/**
 * OrderService.gs
 * 3.3 受注機能
 *
 * 受注確定時、在庫リストから「受注リスト（販売済み）」へ自動移行する。
 * Hold中の車両を受注確定する場合、2nd Holdが存在しても不成立として破棄する。
 */

/**
 * 受注を確定し、在庫行を受注リストへ移行する。
 * @param {string} commission
 * @param {Object} info { registeredMonth, staff, customer, tradeIn, oss, insurance }
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

    var order = {
      commission: vehicle.commission,
      arrivalMonth: vehicle.arrivalMonth,
      model: vehicle.model,
      exteriorColor: vehicle.exteriorColor,
      interiorColor: vehicle.interiorColor,
      steeringPosition: vehicle.steeringPosition,
      options: vehicle.options,
      orderRegisteredMonth: info.registeredMonth,
      staff: info.staff,
      customer: info.customer,
      tradeIn: info.tradeIn,
      oss: info.oss,
      insurance: info.insurance,
      orderedAt: new Date().getTime()
    };

    appendOrder_(order);
    deleteInventoryRow_(sheet, rowNumber);
    notifyOrderConfirmed(order);
    return order;
  } finally {
    lock.releaseLock();
  }
}
