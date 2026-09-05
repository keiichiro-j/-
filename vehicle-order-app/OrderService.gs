/**
 * OrderService.gs
 * 受注機能
 *
 * 受注確定時、在庫リストから受注系シートへ自動移行する。
 * デモカーHOLDからの受注は「デモカー受注リスト」、他店HOLDからの受注は
 * 「他店受注リスト」、それ以外（通常Hold／Holdなし）は「受注リスト」へ書く
 * （orderDestinationFromHold_）。
 * Hold中の車両は、Holdを行った担当者のみ受注確定できる（canConfirmOrder_）。
 * Holdが入っていない車両は誰でも受注確定できる。
 * 受注確定時も、Hold登録時と同じ入力項目をすべて入力する必要がある
 * （担当者はログイン中のGoogleアカウントから自動設定される。requireCurrentStaff_参照）。
 */

/**
 * 1st Holdの種別から、受注確定後の書き込み先を決める（純粋関数）。
 * Holdなし・通常Hold・不明な値は受注リスト（normal）。
 */
function orderDestinationFromHold_(holdRow) {
  var type = holdRow && holdRow.holdType;
  if (type === HOLD_TYPE.DEMO) return HOLD_TYPE.DEMO;
  if (type === HOLD_TYPE.OTHER_STORE) return HOLD_TYPE.OTHER_STORE;
  return HOLD_TYPE.NORMAL;
}

function orderListNameForDestination_(destination) {
  if (destination === HOLD_TYPE.DEMO) return SHEET_NAMES.DEMO_ORDERS;
  if (destination === HOLD_TYPE.OTHER_STORE) return SHEET_NAMES.OTHER_STORE_ORDERS;
  return SHEET_NAMES.ORDERS;
}

function appendOrderByDestination_(destination, order) {
  if (destination === HOLD_TYPE.DEMO) return appendDemoOrder_(order);
  if (destination === HOLD_TYPE.OTHER_STORE) return appendOtherStoreOrder_(order);
  return appendOrder_(order);
}

/**
 * 受注を確定し、在庫リストの行を受注リストへ移行する。
 * @param {string} commission
 * @param {Object} info { salesLocation, leadNumber, registeredMonth, customer, tradeIn, oss, insurance, paymentMethod }
 */
function confirmOrder(commission, info) {
  var currentStaff = requireCurrentStaff_();
  info = Object.assign({}, info, { staff: currentStaff.name, staffEmail: currentStaff.email });
  var inputCheck = validateRequiredInfo_(HOLD_ORDER_INPUT_COLUMNS, info);
  if (!inputCheck.ok) throw new Error(inputCheck.reason);
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

    var order = { orderedAt: new Date().getTime() };
    HOLD_ORDER_INPUT_COLUMNS.forEach(function (c) { order[c.key] = info[c.key]; });
    order.staffEmail = info.staffEmail;
    VEHICLE_COLUMNS.forEach(function (col) { order[col.key] = vehicle[col.key]; });
    // 備考は在庫・受注の末尾専用列（VEHICLE_COLUMNS外）。受注確定時に在庫から引き継ぐ。
    order.remarks = vehicle.remarks || '';

    // Hold中だった場合、1st Holdは受注確定を行った本人（＝canConfirmOrder_により
    // 1st Hold担当者のみ受注確定できる）が登録したものなので、そのカレンダーイベントは
    // ここで削除できる。2nd Holdが同時に存在した場合、その担当者のイベントは別人の
    // カレンダーにあるため、この実行コンテキストからは削除できない（CalendarService.gs参照）。
    if (holds.first) deleteHoldCalendarEvent_(holds.first.calendarEventId);

    var destination = orderDestinationFromHold_(holds.first);
    appendOrderByDestination_(destination, order);
    deleteInventoryRow_(sheet, rowNumber);
    deleteAllHoldRowsForCommission_(commission);
    notifyOrderConfirmed(order, destination);
    appendAuditLog_(buildAuditLogEntry_(
      '受注確定',
      commission,
      vehicle.model,
      currentStaff,
      '顧客: ' + info.customer + ' / ' + orderListNameForDestination_(destination),
      order.orderedAt
    ));
    return order;
  } finally {
    lock.releaseLock();
  }
}
