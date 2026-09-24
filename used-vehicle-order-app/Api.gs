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
    modelBodyTypeOptions: MODEL_BODY_TYPE_OPTIONS,
    modelBodyTypeRulesMax: MODEL_BODY_TYPE_RULES_MAX,
    modelPhotosMax: MODEL_PHOTOS_MAX,
    homeAnnouncementMax: HOME_ANNOUNCEMENT_MAX_LENGTH,
    appTitleMax: APP_TITLE_MAX_LENGTH,
    logoUrlMax: LOGO_URL_MAX_LENGTH,
    loadingImageUrlMax: LOADING_IMAGE_URL_MAX_LENGTH,
    notifyMailListMax: NOTIFY_MAIL_LIST_MAX,
    // 現在つながっているスプレッドシート自体のタイトル（Googleドライブ上の
    // ファイル名）。設定タブ「スプレッドシートのタイトル」欄の初期値として使う
    // （api_renameSpreadsheet参照。Script Propertiesではなくスプレッドシート
    // ファイル自体が持つ値のため、settingsオブジェクトとは別に都度取得する）。
    spreadsheetTitle: SpreadsheetApp.getActiveSpreadsheet().getName(),
    spreadsheetTitleMax: SPREADSHEET_TITLE_MAX_LENGTH,
    celebrationVariantOptions: CELEBRATION_VARIANT_OPTIONS,
    celebrationVariantLabels: CELEBRATION_VARIANT_LABELS,
    // 設定タブの「システムマスタ」（メール通知設定・担当者）を表示・操作できるか。
    // コード上のSYSTEM_ADMIN_EMAILS（Constants.gs）のみで判定する。
    isSystemAdmin: isAdmin,
    settings: redactSystemMasterSettings_(settings, isAdmin),
    currentUserEmail: email,
    // ログイン中のGoogleアカウントに対応する担当者名・登録拠点（未登録ならどちらもnull）。
    // Hold登録・受注確定・Hold解除の担当者欄、および販売拠点欄の初期値は
    // これらを自動的に使う。
    currentStaffName: staffMatch ? staffMatch.name : null,
    currentStaffLocation: staffMatch ? (staffMatch.location || '') : null
  };
}

/**
 * 現在つながっているスプレッドシート自体のタイトル（Googleドライブ上の
 * ファイル名）を変更する。設定タブの他の項目（Script Propertiesへの保存、
 * saveSettings）とは異なり、スプレッドシートというファイル自体の名前を
 * 書き換える操作のため、独立したAPIにしている（保存のタイミング・粒度を
 * 他の設定項目と分け、他の設定と一緒に保存されるまで待たせない）。
 * 本プロジェクトはコンテナバインド型のため、SpreadsheetApp.getActiveSpreadsheet()
 * で直接、実行元のスプレッドシートを変更できる。管理者限定
 * （SYSTEM_ADMIN_EMAILSのみ、SettingsService.gsのisSystemAdmin_参照）。
 */
function api_renameSpreadsheet(newTitle) {
  var email = Session.getActiveUser().getEmail();
  if (!isSystemAdmin_(email)) {
    throw new Error('スプレッドシートのタイトル変更は管理者権限を持つ担当者のみ操作できます');
  }
  var title = validateSpreadsheetTitle_(newTitle);
  SpreadsheetApp.getActiveSpreadsheet().rename(title);
  return title;
}

// ===== 在庫リスト一覧 =====
/**
 * 不具合修正: 期限切れのHoldは本来5分おきの時間主導トリガー
 * （triggerHoldExpiryCheck、Triggers.gs参照）が自動解放するが、そのトリガーが
 * 何らかの理由（未設定・実行エラー等）で動いていない環境では、期限が過ぎても
 * 「Hold中」のまま在庫が解放されない不具合になっていた。在庫リストを表示する
 * たびにも必ずチェックし直すことで、アプリを開く・更新するだけで確実に
 * 解放されるようにする（triggerHoldExpiryCheckは1回リトライ・失敗時は管理者へ
 * 通知したうえで例外を投げずに戻るため、ここで呼んでも在庫リスト自体の表示を
 * 妨げない）。
 */
function api_listInventory(filters, groupBy) {
  triggerHoldExpiryCheck();
  var vehicles = searchInventory(listInventory(), filters);
  return groupBy ? groupByField_(vehicles, groupBy) : [{ key: '', items: vehicles }];
}

/**
 * 在庫データの整合性チェック（ＯＣＮ重複・コミッション重複・モデル名欠落・Holdステータス不正値）。
 * アプリ起動時にクライアントから一度だけ呼び出し、問題があれば画面上部に警告表示する
 * （在庫の追加・編集はスプレッドシートへ直接行う運用のため、手作業のミスを早期発見する）。
 */
function api_checkInventoryIntegrity() {
  return checkInventoryIntegrity_(listInventory());
}

// ===== Hold機能 =====
// holdTypeは省略時 HOLD_TYPE.NORMAL として扱われる（registerHold内のnormalizeHoldType_参照）。
// 業販HOLDを指定できるのは管理者権限を持つ担当者のみで、この権限チェック自体は
// クライアントの表示制御ではなくサーバー側のnormalizeHoldType_で行う（Api.gsは薄いレイヤーの
// ため、ここでは権限チェックを行わない）。
function api_registerHold(commission, info, holdType) {
  return registerHold(commission, info, holdType);
}

function api_cancelHold(commission) {
  return cancelHold(commission);
}

// ===== 受注機能 =====
function api_confirmOrder(commission, info) {
  return confirmOrder(commission, info);
}

/**
 * 受注キャンセル（管理者権限を持つ担当者限定）。権限チェック自体はcancelOrder
 * （OrderService.gs）の中で行うため、ここでは呼び出すだけでよい。
 */
function api_cancelOrder(commission) {
  return cancelOrder(commission);
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

function api_confirmWholesaleOrder(commission, info) {
  return confirmWholesaleOrder(commission, info);
}

/**
 * 業販受注キャンセル（管理者権限を持つ担当者限定）。権限チェック自体は
 * cancelWholesaleOrder（OrderService.gs）の中で行うため、ここでは呼び出す
 * だけでよい。
 */
function api_cancelWholesaleOrder(commission) {
  return cancelWholesaleOrder(commission);
}

/**
 * 業販受注リスト一覧。コントロールパネルには管理者権限を持つ担当者にのみ
 * このタブ自体を表示するが（renderSettingsと同じisSystemAdmin判定、
 * JavaScript.html参照）、直接APIを呼ばれた場合の保険として、サーバー側でも
 * 非管理者には常に空配列を返す。
 */
function api_listWholesaleOrders(filters, groupBy) {
  var email = Session.getActiveUser().getEmail();
  if (!isSystemAdmin_(email)) return [{ key: '', items: [] }];
  var orders = listWholesaleOrders().map(function (o) {
    o.orderedMonth = o.orderedAt
      ? Utilities.formatDate(new Date(o.orderedAt), Session.getScriptTimeZone(), 'yyyy-MM')
      : '';
    return o;
  });
  var result = searchWholesaleOrders(orders, filters);
  return groupBy ? groupByField_(result, groupBy) : [{ key: '', items: result }];
}

// ===== デモカーリスト／サービス代車リスト =====
// コントロールパネルには管理者権限を持つ担当者にのみこのタブ自体を表示するが
// （業販受注リストと同じ判定、JavaScript.html参照）、直接APIを呼ばれた場合の
// 保険として、サーバー側でも非管理者には常に空配列を返す。
// keyword検索は在庫リストと同じsearchInventory（SearchService.gs）を流用する
// （モデル・コミッション・ＯＣＮ・車台番号下４桁・登録番号への部分一致）。
// includeHoldはデモカーリスト・サービス代車リストのデータにはholdStatusが
// 無いため常に無視される（filters.includeHold === falseの分岐が素通りする）。
function api_listDemoCarList(filters) {
  var email = Session.getActiveUser().getEmail();
  if (!isSystemAdmin_(email)) return [];
  return searchInventory(listCarTrackingList_(getDemoCarListSheet_(), DEMO_CAR_CATEGORY_VALUE), filters);
}

function api_listServiceCarList(filters) {
  var email = Session.getActiveUser().getEmail();
  if (!isSystemAdmin_(email)) return [];
  return searchInventory(listCarTrackingList_(getServiceCarListSheet_(), SERVICE_CAR_CATEGORY_VALUE), filters);
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
