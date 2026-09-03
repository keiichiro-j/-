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
  // 担当者名・拠点の自動判定は管理者かどうかに関わらず全員に必要なため、
  // 必ず（画面には出さない）実データのstaffListを使って判定してから
  // クライアントへ返す設定値をリダクトする（getSettings()は既にリダクト済みの
  // ものを返すため、ここではgetRawSettings_()で未リダクトの生データを使う）。
  var settings = getRawSettings_();
  var staffMatch = findStaffByEmail_(settings.staffList, email);
  return {
    yesNoOptions: YES_NO_OPTIONS,
    ossOptions: OSS_OPTIONS,
    paymentMethodOptions: PAYMENT_METHOD_OPTIONS,
    holdOrderInputColumns: HOLD_ORDER_INPUT_COLUMNS,
    holdTypeLabels: HOLD_TYPE_LABELS,
    staffListMax: STAFF_LIST_MAX,
    modelPhotosMax: MODEL_PHOTOS_MAX,
    homeAnnouncementMax: HOME_ANNOUNCEMENT_MAX_LENGTH,
    loadingImageUrlMax: LOADING_IMAGE_URL_MAX_LENGTH,
    notifyMailListMax: NOTIFY_MAIL_LIST_MAX,
    celebrationVariantOptions: CELEBRATION_VARIANT_OPTIONS,
    celebrationVariantLabels: CELEBRATION_VARIANT_LABELS,
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
// holdTypeは省略時 HOLD_TYPE.NORMAL として扱われる（registerHold内のnormalizeHoldType_参照）。
// デモカーHOLD・他店HOLDを指定できるのは管理者権限を持つ担当者のみで、この権限チェック自体は
// クライアントの表示制御ではなくサーバー側のnormalizeHoldType_で行う（Api.gsは薄いレイヤーの
// ため、ここでは権限チェックを行わない）。
function api_registerHold(commission, info, holdType) {
  return registerHold(commission, info, holdType);
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
// 管理者判定・リダクト・システムマスタ項目のガードは、いずれも
// SettingsService.gsのgetSettings()/saveSettings()自体の中で完結しているため、
// ここではそのまま呼び出すだけでよい（詳細はSettingsService.gs参照）。
function api_getSettings() {
  return getSettings();
}

function api_saveSettings(settings) {
  return saveSettings(settings);
}
