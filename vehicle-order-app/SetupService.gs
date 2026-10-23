/**
 * SetupService.gs
 * スプレッドシートの初期セットアップ（在庫リスト・Holdリスト・受注リスト・
 * デモカー受注リスト・他店受注リスト・発注リスト・
 * Gクラス予約リスト・変更履歴・有償OPマスタの9タブを自動生成）。
 *
 * 元データスプレッドシート（xlsx）を手作業でアップロード・貼り付けする代わりに、
 * 任意の空のGoogleスプレッドシートに本プロジェクトをコンテナバインドした状態で
 * setupSpreadsheet_() を一度実行するだけで、必要な9タブ・ヘッダー・入力規則
 * （選択式の列のドロップダウン）・列ヘッダーの説明メモ・コミッション列の書式
 * （先頭0保持）・時間主導トリガーまで一括で整えられる（Constants.gsの
 * INVENTORY_COLUMNS / HOLD_COLUMNS / ORDER_COLUMNS / PURCHASE_ORDER_COLUMNS /
 * GCLASS_COLUMNS / AUDIT_LOG_COLUMNS / PAID_OPTION_MASTER_COLUMNSの列定義から自動生成するため、今後アプリ側に
 * 列が追加された場合もコード変更はConstants.gs側だけで済む）。
 *
 * 既存のシートがある場合は作り直さない。不足している列（備考・発注のステア等）は
 * syncSheetColumns_ が正しい位置へ挿入し、列見出しの注意事項はセルコメント（メモ）として
 * 書き込む。入力規則・説明メモだけを後から反映したい場合も applySelectValidationsAndNotes_ を使う。
 */

/**
 * 在庫リスト・Holdリスト・受注リスト・デモカー受注リスト・他店受注リスト・発注リスト・
 * Gクラス予約リスト・変更履歴・有償OPマスタを作成し、Hold期限チェックの時間主導トリガーを
 * セットアップする。GASエディタから手動実行するか、スプレッドシートのメニュー
 * 「販売可能リスト」→「初期セットアップ」からも実行できる（onOpen参照）。
 */
function setupSpreadsheet_() {
  getInventorySheet_();
  getHoldsSheet_();
  getOrderSheet_();
  getDemoOrderSheet_();
  getOtherStoreOrderSheet_();
  getPurchaseOrderSheet_();
  getGClassReservationSheet_();
  getAuditLogSheet_();
  getPaidOptionMasterSheet_();
  applySelectValidationsAndNotes_();
  setupTimeDrivenTriggers_();

  var message = '在庫リスト・Holdリスト・受注リスト・デモカー受注リスト・他店受注リスト・発注リスト・Gクラス予約リスト・変更履歴・有償OPマスタの9タブを準備しました' +
    '（既存のシートがあれば列構成をアプリに合わせて不足列だけ挿入し、データは上書きしていません）。' +
    '選択式の列にはドロップダウンの入力規則を、列見出しには注意事項のコメント（メモ）を' +
    '設定済みです。Hold期限チェックの時間主導トリガーも設定済みです。';
  Logger.log(message);
  return message;
}

/**
 * 既存のスプレッドシートに対して、選択式の列の入力規則（ドロップダウン）と
 * 列見出しの説明メモを後から反映し直す一回限りのメンテナンス関数
 * （formatCommissionColumnsAsText_と同じ位置づけ）。不足列の挿入と、見出しコメント・
 * 入力規則の再設定を行う。既存データは上書きしない。
 */
function applySelectValidationsAndNotes_() {
  [
    [getInventorySheet_(), INVENTORY_COLUMNS],
    [getHoldsSheet_(), HOLD_COLUMNS],
    [getOrderSheet_(), ORDER_COLUMNS],
    [getDemoOrderSheet_(), ORDER_COLUMNS],
    [getOtherStoreOrderSheet_(), ORDER_COLUMNS],
    [getPurchaseOrderSheet_(), PURCHASE_ORDER_COLUMNS],
    [getGClassReservationSheet_(), GCLASS_COLUMNS],
    [getAuditLogSheet_(), AUDIT_LOG_COLUMNS],
    [getPaidOptionMasterSheet_(), PAID_OPTION_MASTER_COLUMNS]
  ].forEach(function (pair) {
    syncSheetColumns_(pair[0], pair[1]);
    applySelectValidations_(pair[0], pair[1]);
    applyHeaderNotes_(pair[0], pair[1]);
    normalizeSteeringColumn_(pair[0], pair[1]);
  });

  var message = '在庫リスト・Holdリスト・受注リスト・デモカー受注リスト・他店受注リスト・発注リスト・Gクラス予約リスト・変更履歴・有償OPマスタの列構成・入力規則・列見出しの注意コメントをアプリに合わせて更新しました。';
  Logger.log(message);
  return message;
}

/**
 * ステア列の値を「R」「L」にそろえる（右／左、right／left、小文字などを書き換える）。
 * R・L・空欄以外の値はそのまま残す（入力規則によりシート上で赤い警告が付くので、手で直す）。
 * @return {number} 書き換えたセルの数
 */
function normalizeSteeringColumn_(sheet, columns) {
  var index = -1;
  columns.forEach(function (c, i) { if (c.key === 'steering') index = i; });
  if (index === -1) return 0;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var range = sheet.getRange(2, index + 1, lastRow - 1, 1);
  var values = range.getValues();
  var changed = 0;
  var next = values.map(function (row) {
    var raw = row[0];
    var formatted = formatSteering_(raw);
    if (STEERING_OPTIONS.indexOf(formatted) !== -1 && formatted !== raw) {
      changed++;
      return [formatted];
    }
    return [raw];
  });
  if (changed) range.setValues(next);
  return changed;
}

/**
 * ステア列を持つ全シート（在庫・受注3種・発注・Gクラス予約）のステアを R／L にそろえる。
 */
function normalizeSteeringColumns_() {
  return [
    [getInventorySheet_(), INVENTORY_COLUMNS],
    [getOrderSheet_(), ORDER_COLUMNS],
    [getDemoOrderSheet_(), ORDER_COLUMNS],
    [getOtherStoreOrderSheet_(), ORDER_COLUMNS],
    [getPurchaseOrderSheet_(), PURCHASE_ORDER_COLUMNS],
    [getGClassReservationSheet_(), GCLASS_COLUMNS]
  ].reduce(function (sum, pair) { return sum + normalizeSteeringColumn_(pair[0], pair[1]); }, 0);
}

/**
 * 受注リスト3種の空き行を詰める（旧モデル列のチェックボックスのせいで下の方に書き込まれた受注を上へ戻す）。
 * スプレッドシートのメニュー「受注リストの空き行を詰める」からも実行できる。
 */
function compactOrderSheets_() {
  return [getOrderSheet_(), getDemoOrderSheet_(), getOtherStoreOrderSheet_()].reduce(function (sum, sheet) {
    return sum + compactRowsByKey_(sheet, ORDER_COLUMNS, 'commission');
  }, 0);
}

/**
 * メニュー「受注リストの空き行を詰める」から実行する（管理者のみ）。結果をメッセージで表示する。
 */
function compactOrderSheetsFromMenu() {
  if (!isSystemAdmin_(Session.getActiveUser().getEmail())) {
    throw new Error('この操作は管理者のみ行えます');
  }
  var lock = acquireScriptLock_();
  var moved;
  try {
    moved = compactOrderSheets_();
  } finally {
    releaseScriptLock_(lock);
  }
  var message = moved
    ? '受注リストの空き行を詰めました（' + moved + '件の受注を上へ移動しました）。'
    : '受注リストに詰める空き行はありませんでした。';
  try { SpreadsheetApp.getUi().alert(message); } catch (e) {}
  return message;
}

/**
 * アプリを開いたとき（api_getBootstrapData）に呼ぶ。SHEET_RULES_VERSION が保存済みの番号と
 * 違うときだけ、入力規則・見出しメモの付け直しとステア列の書き換えを1回行う。
 * 失敗してもアプリの起動は止めない（次に開いたときに再度試す）。
 */
function applySheetRulesIfOutdated_() {
  var props = PropertiesService.getScriptProperties();
  var key = 'SHEET_RULES_VERSION';
  if (String(props.getProperty(key) || '') === String(SHEET_RULES_VERSION)) return false;
  var lock = acquireScriptLock_();
  try {
    if (String(props.getProperty(key) || '') === String(SHEET_RULES_VERSION)) return false;
    applySelectValidationsAndNotes_();
    normalizeSteeringColumns_();
    compactOrderSheets_();
    props.setProperty(key, String(SHEET_RULES_VERSION));
    return true;
  } finally {
    releaseScriptLock_(lock);
  }
}

/**
 * コンテナバインドのスプレッドシートを開いたときに、セットアップ用のメニューを追加する
 * （単純トリガー）。スタンドアロン運用の場合は動作しないため、GASエディタから
 * setupSpreadsheet_() を直接実行すればよい。
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('販売可能リスト')
    .addItem('初期セットアップ（9タブを作成）', 'setupSpreadsheet_')
    .addItem('列構成・入力規則・列見出しのコメントを再設定', 'applySelectValidationsAndNotes_')
    .addItem('コミッション列を書式なしテキストに再設定', 'formatCommissionColumnsAsText_')
    .addItem('Hold期限チェックのトリガーを設定', 'installHoldExpiryTrigger')
    .addItem('受注リストの空き行を詰める', 'compactOrderSheetsFromMenu')
    .addToUi();
}
