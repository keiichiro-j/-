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
    paidOptionKeys: PAID_OPTION_KEYS,
    paidOptionMaster: (function () {
      try { return listPaidOptionMaster_(); } catch (e) { return []; }
    })(),
    paidOptionMasterMax: PAID_OPTION_MASTER_MAX,
    holdOrderInputColumns: HOLD_ORDER_INPUT_COLUMNS,
    holdTypeLabels: HOLD_TYPE_LABELS,
    staffListMax: STAFF_LIST_MAX,
    salesLocationOptions: SALES_LOCATION_OPTIONS,
    modelPhotosMax: MODEL_PHOTOS_MAX,
    homeAnnouncementMax: HOME_ANNOUNCEMENT_MAX_LENGTH,
    notifyMailListMax: NOTIFY_MAIL_LIST_MAX,
    modelBodyTypeOptions: MODEL_BODY_TYPE_OPTIONS,
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
 * 受注リスト一覧。スプレッドシートの「登録月」列を YYYY-MM に揃えてから返す。
 * グループ表示の初期値「登録月」は受注確定日時ではなく、この列で分かれる。
 */
function api_listOrders(filters, groupBy) {
  var result = searchOrders(normalizeOrdersRegisteredMonth_(listOrders()), filters);
  return groupBy ? groupByField_(result, groupBy) : [{ key: '', items: result }];
}

// ===== Gクラス予約リスト（閲覧専用） =====
function api_listGClassReservations(filters) {
  return searchGClassReservations_(listGClassReservations_(), filters);
}

// ===== 発注リスト（閲覧専用） =====
// 在庫リスト・受注リストのようなステータス管理・通知は持たない、
// シンプルな一覧（PurchaseOrderService.gs参照）。アプリ画面はスプレッドシートの
// データを閲覧する専用のため、登録・編集・削除の導線はいずれも置いていない
// （html/Index.html・JavaScript.html参照）。
function api_listPurchaseOrders() {
  return listPurchaseOrders();
}

// アプリ画面からは呼ばれない（発注情報の登録・変更・削除はすべてスプレッドシートへ
// 直接行う運用のため）。GASエディタから直接実行する場合等に備え、
// PurchaseOrderService.gs側の関数（addPurchaseOrder / updatePurchaseOrder /
// deletePurchaseOrder）自体は残しているが、api_ ラッパーはこのlistのみとする。
function api_addPurchaseOrder(info) {
  return addPurchaseOrder(info);
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

/**
 * 有償OPマスタの保存。名称ポップアップ用のコード→名称辞書。管理者のみ更新可。
 * 登録・編集は設定の「有償OPマスタ」から行う。読み取りは bootstrap.paidOptionMaster 経由で全利用者に渡す。
 */
function api_savePaidOptionMaster(list) {
  var email = Session.getActiveUser().getEmail();
  if (!isSystemAdmin_(email)) {
    throw new Error('有償OPマスタを変更する権限がありません');
  }
  return replacePaidOptionMaster_(list);
}
