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

    // Hold中だった場合、1st Holdは受注確定を行った本人（＝canConfirmOrder_により
    // 1st Hold担当者のみ受注確定できる）が登録したものなので、そのカレンダーイベントは
    // ここで削除できる。2nd Holdが同時に存在した場合、その担当者のイベントは別人の
    // カレンダーにあるため、この実行コンテキストからは削除できない（CalendarService.gs参照）。
    if (holds.first) deleteHoldCalendarEvent_(holds.first.calendarEventId);

    appendOrder_(order);
    deleteInventoryRow_(sheet, rowNumber);
    deleteAllHoldRowsForCommission_(commission);
    notifyOrderConfirmed(order);
    appendAuditLog_(buildAuditLogEntry_('受注確定', commission, vehicle.model, currentStaff, '顧客: ' + info.customer, order.orderedAt));
    return order;
  } finally {
    lock.releaseLock();
  }
}

/**
 * 業販Holdからの受注確定。通常の受注確定（confirmOrder）と異なり、入力が必要な
 * 項目は「販売先」「登録月」の2つのみ（業販＝業者向け卸売のため、リード番号・
 * 下取車の有無・保険加入の有無・支払方法は収集しない）。業販Hold（1st Holdの
 * holdTypeがHOLD_TYPE.WHOLESALE）が掛かっている車両のみ対象で、通常のHold・
 * Hold無しの車両はこの関数では受注確定できない（通常どおりconfirmOrderを使う）。
 * 権限は通常の受注確定と同じく、Holdを行った担当者本人のみ（canConfirmOrder_）。
 * 販売拠点・担当者は、担当者マスタに登録された、ログイン中の担当者本人の情報から
 * 自動設定する（入力は求めない）。
 * @param {string} commission
 * @param {Object} info { salesStore, registeredMonth }
 */
function confirmWholesaleOrder(commission, info) {
  var currentStaff = requireCurrentStaff_();
  var salesStore = String((info && info.salesStore) || '').trim();
  var registeredMonth = String((info && info.registeredMonth) || '').trim();
  if (!salesStore || !registeredMonth) {
    throw new Error('次の項目を入力してください: 販売先、登録月');
  }

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
    if (!holds.first || (holds.first.holdType || HOLD_TYPE.NORMAL) !== HOLD_TYPE.WHOLESALE) {
      throw new Error('この車両には業販HOLDが掛かっていないため、業販受注確定できません');
    }
    var check = canConfirmOrder_(vehicle, holds.first, currentStaff.email);
    if (!check.ok) throw new Error(check.reason);

    var staffRecord = findStaffByEmail_(getStaffList_(), currentStaff.email);
    var order = {
      orderedAt: new Date().getTime(),
      salesLocation: (staffRecord && staffRecord.location) || '',
      salesStore: salesStore,
      registeredMonth: registeredMonth,
      staff: currentStaff.name,
      staffEmail: currentStaff.email
    };
    VEHICLE_COLUMNS.forEach(function (col) { order[col.key] = vehicle[col.key]; });

    // 業販HOLDはカレンダーイベントを作成しないため、calendarEventIdは常に空だが、
    // deleteHoldCalendarEvent_は空文字を渡しても何もしない（安全に呼べる）。
    deleteHoldCalendarEvent_(holds.first.calendarEventId);

    appendWholesaleOrder_(order);
    deleteInventoryRow_(sheet, rowNumber);
    deleteAllHoldRowsForCommission_(commission);
    notifyWholesaleOrderConfirmed(order);
    appendAuditLog_(buildAuditLogEntry_(
      '業販受注確定', commission, vehicle.model, currentStaff,
      '販売先: ' + salesStore + ' / 登録月: ' + registeredMonth, order.orderedAt
    ));
    return order;
  } finally {
    lock.releaseLock();
  }
}
