/**
 * SetupService.gs
 * スプレッドシートの初期セットアップ（在庫リスト・Holdリスト・受注リスト・発注リスト・
 * Gクラス予約リスト・変更履歴・有償OPマスタの7タブを自動生成）。
 *
 * 元データスプレッドシート（xlsx）を手作業でアップロード・貼り付けする代わりに、
 * 任意の空のGoogleスプレッドシートに本プロジェクトをコンテナバインドした状態で
 * setupSpreadsheet_() を一度実行するだけで、必要な7タブ・ヘッダー・入力規則
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
 * 在庫リスト・Holdリスト・受注リスト・発注リスト・Gクラス予約リスト・変更履歴・
 * 有償OPマスタを作成し、Hold期限チェックの時間主導トリガーをセットアップする。GASエディタから
 * 手動実行するか、スプレッドシートのメニュー「販売可能リスト」→「初期セットアップ」
 * からも実行できる（onOpen参照）。
 */
function setupSpreadsheet_() {
  getInventorySheet_();
  getHoldsSheet_();
  getOrderSheet_();
  getPurchaseOrderSheet_();
  getGClassReservationSheet_();
  getAuditLogSheet_();
  getPaidOptionMasterSheet_();
  applySelectValidationsAndNotes_();
  setupTimeDrivenTriggers_();

  var message = '在庫リスト・Holdリスト・受注リスト・発注リスト・Gクラス予約リスト・変更履歴・有償OPマスタの7タブを準備しました' +
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
    [getPurchaseOrderSheet_(), PURCHASE_ORDER_COLUMNS],
    [getGClassReservationSheet_(), GCLASS_COLUMNS],
    [getAuditLogSheet_(), AUDIT_LOG_COLUMNS],
    [getPaidOptionMasterSheet_(), PAID_OPTION_MASTER_COLUMNS]
  ].forEach(function (pair) {
    syncSheetColumns_(pair[0], pair[1]);
    applySelectValidations_(pair[0], pair[1]);
    applyHeaderNotes_(pair[0], pair[1]);
  });

  var message = '在庫リスト・Holdリスト・受注リスト・発注リスト・Gクラス予約リスト・変更履歴・有償OPマスタの列構成・入力規則・列見出しの注意コメントをアプリに合わせて更新しました。';
  Logger.log(message);
  return message;
}

/**
 * コンテナバインドのスプレッドシートを開いたときに、セットアップ用のメニューを追加する
 * （単純トリガー）。スタンドアロン運用の場合は動作しないため、GASエディタから
 * setupSpreadsheet_() を直接実行すればよい。
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('販売可能リスト')
    .addItem('初期セットアップ（7タブを作成）', 'setupSpreadsheet_')
    .addItem('列構成・入力規則・列見出しのコメントを再設定', 'applySelectValidationsAndNotes_')
    .addItem('コミッション列を書式なしテキストに再設定', 'formatCommissionColumnsAsText_')
    .addToUi();
}
