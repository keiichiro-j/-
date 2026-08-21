/**
 * Api.gs
 * HTML Service（クライアント）から google.script.run で呼び出す関数群。
 * サービス層（SheetService / HoldService / OrderService 等）を
 * 画面のユースケース単位に束ねる薄いレイヤー。
 */

// ===== 初期化 =====
function api_getBootstrapData() {
  return {
    steeringPositionOptions: STEERING_POSITION_OPTIONS,
    yesNoOptions: YES_NO_OPTIONS,
    ossOptions: OSS_OPTIONS,
    settings: getSettings(),
    currentUserEmail: Session.getActiveUser().getEmail()
  };
}

// ===== 在庫一覧（3.1） =====
function api_listInventory(filters, groupBy) {
  var vehicles = searchInventory(listInventory(), filters);
  return groupBy ? groupByField_(vehicles, groupBy) : [{ key: '', items: vehicles }];
}

/**
 * 3.1 のスコープ外だが、独立システムとして最低限の在庫データ投入手段を提供する。
 * 本来は企画書 5. のとおり既存の新車売上在庫スプレッドシートと連携する想定（README参照）。
 */
function api_createInventoryVehicle(vehicle) {
  if (!vehicle.commission) throw new Error('コミッション（車両特定番号）は必須です');
  if (!vehicle.model) throw new Error('モデルは必須です');
  return createInventoryVehicle(vehicle);
}

// ===== Hold機能（3.2） =====
function api_registerHold(commission, info) {
  return registerHold(commission, info);
}

function api_registerSecondHold(commission, info) {
  return registerSecondHold(commission, info);
}

// ===== 受注機能（3.3） =====
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
