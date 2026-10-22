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

/**
 * 受注確定で入力が必要な項目（純粋関数）。デモカー・他店の受注は販売拠点を割り振らないため
 * 販売拠点を除き、他店の受注はリード番号も無いため除く。それ以外は全項目必須。
 */
function orderInputColumnsFor_(destination) {
  return HOLD_ORDER_INPUT_COLUMNS.filter(function (c) {
    if (c.key === 'salesLocation') return destination === HOLD_TYPE.NORMAL;
    if (c.key === 'leadNumber') return destination !== HOLD_TYPE.OTHER_STORE;
    return true;
  });
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

  var lock = acquireScriptLock_();
  try {
    // 期限を過ぎたHoldを先に片付けてから判定する（期限切れのHold担当者しか
    // 受注確定できない、といった食い違いを防ぐ）。
    processExpiredHoldsLocked_();
    var sheet = getInventorySheet_();
    assertUniqueInventoryCommission_(sheet, commission);
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

    // 入力項目の必須チェックは、受注先（通常／デモカー／他店）が決まってから行う
    // （デモカー・他店は販売拠点なし、他店はリード番号もなし。orderInputColumnsFor_）。
    var destination = orderDestinationFromHold_(holds.first);
    var inputCheck = validateRequiredInfo_(orderInputColumnsFor_(destination), info);
    if (!inputCheck.ok) throw new Error(inputCheck.reason);
    if (destination !== HOLD_TYPE.NORMAL) info.salesLocation = '';
    info.leadNumber = destination === HOLD_TYPE.OTHER_STORE ? '' : normalizeLeadNumber_(info.leadNumber);

    var order = { orderedAt: new Date().getTime() };
    HOLD_ORDER_INPUT_COLUMNS.forEach(function (c) { order[c.key] = info[c.key]; });
    order.staffEmail = info.staffEmail;
    VEHICLE_COLUMNS.forEach(function (col) { order[col.key] = vehicle[col.key]; });
    // 旧モデルのチェックも受注リストへ引き継ぐ（チェックボックスなので TRUE／FALSE で書く）
    order.isOldModel = isOldModelValue_(vehicle.isOldModel);
    // 備考は在庫・受注の末尾専用列（VEHICLE_COLUMNS外）。受注確定時に在庫から引き継ぐ。
    order.remarks = vehicle.remarks || '';
    // 受注取消で在庫リストの元の位置へ戻せるよう、今の行番号と上下の車両を記録する。
    Object.assign(order, buildInventoryPosition_(readInventoryCommissions_(sheet), rowNumber));

    // Hold中だった場合、1st Holdは受注確定を行った本人（＝canConfirmOrder_により
    // 1st Hold担当者のみ受注確定できる）が登録したものなので、そのカレンダーイベントは
    // ここで削除できる。2nd Holdが同時に存在した場合、その担当者のイベントは別人の
    // カレンダーにあるため、この実行コンテキストからは削除できない（CalendarService.gs参照）。
    if (holds.first) deleteHoldCalendarEvent_(holds.first.calendarEventId);

    appendOrderByDestination_(destination, order);
    deleteInventoryRow_(sheet, rowNumber);
    deleteAllHoldRowsForCommission_(commission);
    notifyOrderConfirmed_(order, destination);
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
    releaseScriptLock_(lock);
  }
}

// ===== 受注取消（管理者のみ） =====

/**
 * 在庫リストでの位置（行番号と上下の車両のコミッション）を記録用に組み立てる（純粋関数）。
 * @param {Array<string>} commissions 在庫リストのコミッション列（先頭要素が2行目）
 * @param {number} rowNumber 対象車両の実シート行番号
 */
function buildInventoryPosition_(commissions, rowNumber) {
  var index = rowNumber - 2;
  return {
    inventoryRowNumber: rowNumber,
    inventoryPrevCommission: index - 1 >= 0 ? (commissions[index - 1] || '') : '',
    inventoryNextCommission: index + 1 < commissions.length ? (commissions[index + 1] || '') : ''
  };
}

/**
 * 受注取消で車両を戻す在庫リストの行番号を決める（純粋関数）。
 * 受注確定後に在庫リストの行が増減していても「元あった位置」に戻せるよう、
 * 行番号そのものより上下の車両を優先して使う。
 *   1. 直前にあった車両が今も在庫リストにあれば、そのすぐ下
 *   2. なければ、直後にあった車両のすぐ上
 *   3. どちらもなければ、記録した行番号（最終行より後なら末尾）
 *   4. 記録が無い（この機能より前に受注確定した）場合は末尾
 * @param {{inventoryRowNumber:*, inventoryPrevCommission:*, inventoryNextCommission:*}} order
 * @param {Array<string>} commissions 現在の在庫リストのコミッション列（先頭要素が2行目）
 * @return {number} 差し込む実シート行番号（2〜commissions.length + 2）
 */
function decideInventoryRestoreRow_(order, commissions) {
  var list = (commissions || []).map(function (c) { return String(c == null ? '' : c).trim(); });
  var end = list.length + 2;
  var prev = String(order.inventoryPrevCommission == null ? '' : order.inventoryPrevCommission).trim();
  var next = String(order.inventoryNextCommission == null ? '' : order.inventoryNextCommission).trim();
  if (prev) {
    var p = list.indexOf(prev);
    if (p !== -1) return p + 3;
  }
  if (next) {
    var n = list.indexOf(next);
    if (n !== -1) return n + 2;
  }
  var row = Number(order.inventoryRowNumber);
  if (row >= 2 && isFinite(row)) return Math.min(Math.floor(row), end);
  return end;
}

/**
 * 受注を取り消し、車両を在庫リストの元の位置へ「在庫あり」で戻す（管理者のみ）。
 * 受注系シートからは該当行を削除する。Hold情報は受注確定時に削除済みのため戻らない。
 * @param {string} kind 'orders' / 'demoOrders' / 'otherStoreOrders'
 * @param {string} commission
 */
function cancelOrder(kind, commission) {
  var email = Session.getActiveUser().getEmail();
  if (!isSystemAdmin_(email)) {
    throw new Error('受注の取り消しは管理者のみ行えます');
  }
  var staffMatch = findStaffByEmail_(getRawSettings_().staffList, email);
  var operator = { name: staffMatch ? staffMatch.name : email, email: email };

  var lock = acquireScriptLock_();
  try {
    var orderSheet = getOrderSheetByKind_(kind);
    var orderRowNumber = findRowByKey_(orderSheet, ORDER_COLUMNS, 'commission', commission);
    if (!orderRowNumber) throw new Error('該当の受注が見つかりません（コミッション: ' + commission + '）');
    var order = rowToObject_(
      orderSheet.getRange(orderRowNumber, 1, 1, ORDER_COLUMNS.length).getValues()[0],
      ORDER_COLUMNS,
      orderRowNumber
    );

    var invSheet = getInventorySheet_();
    if (findInventoryRowNumber_(invSheet, commission)) {
      throw new Error('在庫リストに同じコミッションの車両が既にあるため取り消せません（コミッション: ' + commission + '）');
    }

    var vehicle = { holdStatus: HOLD_STATUS.AVAILABLE, remarks: order.remarks || '' };
    VEHICLE_COLUMNS.forEach(function (col) { vehicle[col.key] = order[col.key]; });
    vehicle.isOldModel = isOldModelValue_(order.isOldModel); // 旧モデルのチェックも在庫リストへ戻す
    vehicle.commission = String(order.commission);

    var targetRow = decideInventoryRestoreRow_(order, readInventoryCommissions_(invSheet));
    var restoredRow = insertInventoryVehicleAt_(invSheet, targetRow, vehicle);
    orderSheet.deleteRow(orderRowNumber);

    appendAuditLog_(buildAuditLogEntry_(
      '受注取消',
      commission,
      order.model,
      operator,
      '顧客: ' + (order.customer || '-') + ' / ' + orderListLabelByKind_(kind) + 'から在庫リスト' + restoredRow + '行目へ戻しました',
      new Date().getTime()
    ));
    return { commission: vehicle.commission, inventoryRowNumber: restoredRow };
  } finally {
    releaseScriptLock_(lock);
  }
}
