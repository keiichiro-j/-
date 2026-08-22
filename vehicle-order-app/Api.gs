/**
 * Api.gs
 * HTML Service（クライアント）から google.script.run で呼び出す関数群。
 * サービス層（SheetService / HoldService / OrderService 等）を
 * 画面のユースケース単位に束ねる薄いレイヤー。
 */

// ===== 初期化 =====
function api_getBootstrapData() {
  var email = Session.getActiveUser().getEmail();
  var settings = getSettings();
  return {
    steeringOptions: STEERING_OPTIONS,
    stockDisclosureOptions: STOCK_DISCLOSURE_OPTIONS,
    yesNoOptions: YES_NO_OPTIONS,
    ossOptions: OSS_OPTIONS,
    paymentMethodOptions: PAYMENT_METHOD_OPTIONS,
    paidOptionKeys: PAID_OPTION_KEYS,
    holdOrderInputColumns: HOLD_ORDER_INPUT_COLUMNS,
    salesLocationColumn: { key: 'salesLocation', label: '販売拠点', required: true },
    staffListMax: STAFF_LIST_MAX,
    settings: settings,
    currentUserEmail: email,
    // ログイン中のGoogleアカウントに対応する担当者名（未登録なら null）。
    // Hold登録・2nd Hold登録・受注確定・Hold解除の担当者欄はこれを自動的に使う。
    currentStaffName: resolveStaffNameByEmail_(settings.staffList, email)
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

/**
 * Excel／Googleスプレッドシートからのデータを在庫リストへ一括取り込みする
 * （設定タブ参照）。取り込み結果（件数・重複・不正行）を返す。
 */
function api_importInventory(text) {
  return importInventoryFromText_(text);
}

// ===== Hold機能 =====
function api_registerHold(commission, info) {
  return registerHold(commission, info);
}

function api_registerSecondHold(commission, info) {
  return registerSecondHold(commission, info);
}

function api_cancelHold(commission, rank) {
  return cancelHold(commission, rank);
}

// ===== 受注機能 =====
function api_confirmOrder(commission, info) {
  return confirmOrder(commission, info);
}

/**
 * 受注リスト一覧。受注確定日時（orderedAt）から「2026-08」形式の orderedMonth を
 * 付与し、月ごとのグループ表示・トータル台数の把握に使えるようにする。
 */
function api_listOrders(filters, groupBy) {
  var orders = listOrders().map(function (o) {
    o.orderedMonth = o.orderedAt
      ? Utilities.formatDate(new Date(o.orderedAt), Session.getScriptTimeZone(), 'yyyy-MM')
      : '';
    return o;
  });
  var result = searchOrders(orders, filters);
  return groupBy ? groupByField_(result, groupBy) : [{ key: '', items: result }];
}

// ===== 設定機能（3.6） =====
function api_getSettings() {
  return getSettings();
}

function api_saveSettings(settings) {
  return saveSettings(settings);
}

// ===== デモカー予約機能（設定タブ） =====
function api_listAvailableForDemo() {
  return listAvailableForDemo();
}

function api_listDemoReservedVehicles() {
  return listDemoReservedVehicles();
}

function api_reserveDemoCar(commission) {
  return reserveDemoCar(commission);
}

function api_releaseDemoReservation(commission) {
  return releaseDemoReservation(commission);
}
