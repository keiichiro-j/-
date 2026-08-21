/**
 * Api.gs
 * HTML Service（クライアント）から google.script.run で呼び出す関数群。
 * サービス層（SheetService / HoldService / OrderService 等）を
 * 画面のユースケース単位に束ねる薄いレイヤー。
 */

// ===== 初期化 =====
function api_getBootstrapData() {
  return {
    steeringOptions: STEERING_OPTIONS,
    stockDisclosureOptions: STOCK_DISCLOSURE_OPTIONS,
    yesNoOptions: YES_NO_OPTIONS,
    ossOptions: OSS_OPTIONS,
    paidOptionKeys: PAID_OPTION_KEYS,
    holdOrderInputColumns: HOLD_ORDER_INPUT_COLUMNS,
    salesLocationColumn: { key: 'salesLocation', label: '販売拠点', required: true },
    staffListMax: STAFF_LIST_MAX,
    settings: getSettings(),
    currentUserEmail: Session.getActiveUser().getEmail()
  };
}

// ===== 在庫リスト一覧 =====
function api_listInventory(filters, groupBy) {
  var vehicles = searchInventory(listInventory(), filters);
  return groupBy ? groupByField_(vehicles, groupBy) : [{ key: '', items: vehicles }];
}

/**
 * 在庫リストへの車両登録。通常は既存の在庫リスト用スプレッドシートへ直接データを
 * 貼り付ける運用を想定しているが、個別追加の手段としても提供する（README参照）。
 */
function api_createInventoryVehicle(vehicle) {
  if (!vehicle.commission) throw new Error('コミッションは必須です');
  if (!vehicle.model) throw new Error('モデルは必須です');
  return createInventoryVehicle(vehicle);
}

// ===== Hold機能 =====
function api_registerHold(commission, info) {
  return registerHold(commission, info);
}

function api_registerSecondHold(commission, info) {
  return registerSecondHold(commission, info);
}

// ===== 受注機能 =====
function api_confirmOrder(commission, info) {
  return confirmOrder(commission, info);
}

function api_listOrders(filters, groupBy) {
  var orders = searchOrders(listOrders(), filters);
  return groupBy ? groupByField_(orders, groupBy) : [{ key: '', items: orders }];
}

// ===== 設定機能（3.6） =====
function api_getSettings() {
  return getSettings();
}

function api_saveSettings(settings) {
  return saveSettings(settings);
}
