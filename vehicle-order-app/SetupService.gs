/**
 * SetupService.gs
 * スプレッドシートの初期セットアップ（在庫リスト・Holdリスト・受注リストの3タブを自動生成）。
 *
 * 元データスプレッドシート（xlsx）を手作業でアップロード・貼り付けする代わりに、
 * 任意の空のGoogleスプレッドシートに本プロジェクトをコンテナバインドした状態で
 * setupSpreadsheet_() を一度実行するだけで、必要な3タブ・ヘッダー・入力規則・
 * コミッション列の書式（先頭0保持）・時間主導トリガーまで一括で整えられる。
 *
 * 既存のシートがある場合は作り直さない（getOrCreateSheet_ はシートが無いときだけ
 * ヘッダーを書き込むため、既存データはそのまま保持される）。
 */

/**
 * 在庫リスト・Holdリスト・受注リストを作成し、Hold期限チェックの時間主導トリガーを
 * セットアップする。GASエディタから手動実行するか、スプレッドシートのメニュー
 * 「販売可能リスト」→「初期セットアップ」からも実行できる（onOpen参照）。
 */
function setupSpreadsheet_() {
  getInventorySheet_();
  getHoldsSheet_();
  getOrderSheet_();
  setupTimeDrivenTriggers_();

  var message = '在庫リスト・Holdリスト・受注リストの3タブを準備しました' +
    '（既存のシートがあればそのまま利用し、上書きはしていません）。' +
    'Hold期限チェックの時間主導トリガーも設定済みです。';
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
    .addItem('初期セットアップ（3タブを作成）', 'setupSpreadsheet_')
    .addItem('コミッション列を書式なしテキストに再設定', 'formatCommissionColumnsAsText_')
    .addToUi();
}
