/**
 * Api.gs
 * HTML Service（クライアント）から google.script.run で呼び出す関数群。
 * サービス層（SheetService / HoldService / OrderService 等）を
 * 画面のユースケース単位に束ねる薄いレイヤー。
 */

// ===== 初期化 =====
function api_getBootstrapData() {
  var email = Session.getActiveUser().getEmail();
  var isAdmin = isSystemAdmin_(email);
  var settings = getSettings();
  // 担当者名・拠点の自動判定は管理者かどうかに関わらず全員に必要なため、
  // 必ず（画面には出さない）実データのstaffListを使って判定してから
  // クライアントへ返す設定値をリダクトする。
  var staffMatch = findStaffByEmail_(settings.staffList, email);
  return {
    yesNoOptions: YES_NO_OPTIONS,
    ossOptions: OSS_OPTIONS,
    paymentMethodOptions: PAYMENT_METHOD_OPTIONS,
    paidOptionKeys: PAID_OPTION_KEYS,
    holdOrderInputColumns: HOLD_ORDER_INPUT_COLUMNS,
    staffListMax: STAFF_LIST_MAX,
    modelPhotosMax: MODEL_PHOTOS_MAX,
    // 設定タブの「システムマスタ」（メール通知設定・担当者）を表示・操作できるか。
    // コード上のSYSTEM_ADMIN_EMAILS（Constants.gs）のみで判定する。
    isSystemAdmin: isAdmin,
    settings: redactSystemMasterSettings_(settings, isAdmin),
    currentUserEmail: email,
    // ログイン中のGoogleアカウントに対応する担当者名・登録拠点（未登録ならどちらもnull）。
    // Hold登録・2nd Hold登録・受注確定・Hold解除の担当者欄、および販売拠点欄の初期値は
    // これらを自動的に使う。
    currentStaffName: staffMatch ? staffMatch.name : null,
    currentStaffLocation: staffMatch ? (staffMatch.location || '') : null
  };
}

// ===== 在庫リスト一覧 =====
function api_listInventory(filters, groupBy) {
  var vehicles = searchInventory(listInventory(), filters);
  return groupBy ? groupByField_(vehicles, groupBy) : [{ key: '', items: vehicles }];
}

/**
 * 在庫データの整合性チェック（コミッション重複・モデル名欠落・Holdステータス不正値）。
 * アプリ起動時にクライアントから一度だけ呼び出し、問題があれば画面上部に警告表示する
 * （在庫の追加・編集はスプレッドシートへ直接行う運用のため、手作業のミスを早期発見する）。
 */
function api_checkInventoryIntegrity() {
  return checkInventoryIntegrity_(listInventory());
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
  var email = Session.getActiveUser().getEmail();
  return redactSystemMasterSettings_(getSettings(), isSystemAdmin_(email));
}

/**
 * システムマスタ（メール通知設定・担当者）は、コード上のSYSTEM_ADMIN_EMAILS
 * （Constants.gs）に登録されたメールアドレスの利用者のみ変更できる。
 * 管理者以外からの保存リクエストに含まれるこれらの項目は、既存の保存値を
 * そのまま維持し（applySystemMasterGuard_）、無視する。
 */
function api_saveSettings(settings) {
  var email = Session.getActiveUser().getEmail();
  var isAdmin = isSystemAdmin_(email);
  var current = getSettings();
  var guarded = applySystemMasterGuard_(settings, current, isAdmin);
  var saved = saveSettings(guarded);
  return redactSystemMasterSettings_(saved, isAdmin);
}
