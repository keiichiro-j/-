/**
 * SetupService.gs
 * スプレッドシートの初期セットアップ（在庫リスト・Holdリスト・受注リスト・
 * 変更履歴の4タブを自動生成）。
 *
 * 元データスプレッドシート（xlsx）を手作業でアップロード・貼り付けする代わりに、
 * 任意の空のGoogleスプレッドシートに本プロジェクトをコンテナバインドした状態で
 * setupSpreadsheet_() を一度実行するだけで、必要な4タブ・ヘッダー・入力規則
 * （選択式の列のドロップダウン）・列ヘッダーの説明メモ・コミッション列の書式
 * （先頭0保持）・時間主導トリガーまで一括で整えられる（Constants.gsの
 * INVENTORY_COLUMNS / HOLD_COLUMNS / ORDER_COLUMNS / AUDIT_LOG_COLUMNSの
 * 列定義から自動生成するため、今後アプリ側に列が追加された場合もコード変更は
 * Constants.gs側だけで済む）。
 *
 * 既存のシートがある場合は作り直さない（getOrCreateSheet_ はシートが無いときだけ
 * ヘッダー・入力規則・説明メモを書き込むため、既存データ・書式はそのまま保持される）。
 * 本機能追加より前にセットアップ済みの既存スプレッドシートに、入力規則・説明メモ
 * だけを後から反映したい場合は applySelectValidationsAndNotes_ を使う。
 */

/**
 * 在庫リスト・Holdリスト・受注リスト・変更履歴を作成し、Hold期限チェックの
 * 時間主導トリガーをセットアップする。GASエディタから手動実行するか、
 * スプレッドシートのメニュー「販売可能リスト」→「初期セットアップ」からも
 * 実行できる（onOpen参照）。
 */
function setupSpreadsheet_() {
  getInventorySheet_();
  getHoldsSheet_();
  getOrderSheet_();
  getAuditLogSheet_();
  setupTimeDrivenTriggers_();

  var message = '在庫リスト・Holdリスト・受注リスト・変更履歴の4タブを準備しました' +
    '（既存のシートがあればそのまま利用し、上書きはしていません）。' +
    '選択式の列にはドロップダウンの入力規則を、列見出しには入力形式の説明メモを' +
    '設定済みです。Hold期限チェックの時間主導トリガーも設定済みです。';
  Logger.log(message);
  return message;
}

/**
 * 既存のスプレッドシートの「ステア」列に保存済みの「右」「左」を「R」「L」へ
 * 一括変換する一回限りのメンテナンス関数（formatCommissionColumnsAsText_と同じ
 * 位置づけ）。ステア列を持つ在庫リスト・受注リストが対象。「右」「左」以外の値
 * （空欄・既にR/Lへ変換済み等）はそのまま変更しない。
 */
function migrateSteeringToRL_() {
  var targets = [
    [getInventorySheet_(), INVENTORY_COLUMNS],
    [getOrderSheet_(), ORDER_COLUMNS]
  ];
  var converted = 0;
  targets.forEach(function (pair) {
    var sheet = pair[0];
    var colIndex1 = buildColIndex_(pair[1])['steering'] + 1;
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    var range = sheet.getRange(2, colIndex1, lastRow - 1, 1);
    var values = range.getValues();
    var changed = false;
    for (var i = 0; i < values.length; i++) {
      if (values[i][0] === '右') { values[i][0] = 'R'; changed = true; converted++; }
      else if (values[i][0] === '左') { values[i][0] = 'L'; changed = true; converted++; }
    }
    if (changed) range.setValues(values);
  });

  var message = 'ステア列の「右」「左」を「R」「L」へ' + converted + '件変換しました' +
    '（在庫リスト・受注リストが対象）。';
  Logger.log(message);
  return message;
}

/**
 * 既存のスプレッドシートに対して、選択式の列の入力規則（ドロップダウン）と
 * 列見出しの説明メモを後から反映し直す一回限りのメンテナンス関数
 * （formatCommissionColumnsAsText_と同じ位置づけ）。本機能追加より前に
 * setupSpreadsheet_() を実行済みだったスプレッドシートは、これらが無いまま
 * 作成されているため、スクリプトエディタまたはスプレッドシートのメニューから
 * 一度だけ実行する。既存のシート・データは変更しない（ヘッダー行のメモと、
 * 2行目以降の入力規則のみを追加・上書きする）。
 */
function applySelectValidationsAndNotes_() {
  [
    [getInventorySheet_(), INVENTORY_COLUMNS],
    [getHoldsSheet_(), HOLD_COLUMNS],
    [getOrderSheet_(), ORDER_COLUMNS],
    [getAuditLogSheet_(), AUDIT_LOG_COLUMNS]
  ].forEach(function (pair) {
    applySelectValidations_(pair[0], pair[1]);
    applyHeaderNotes_(pair[0], pair[1]);
  });

  var message = '在庫リスト・Holdリスト・受注リスト・変更履歴の入力規則・列見出しの説明メモを設定しました。';
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
    .addItem('初期セットアップ（4タブを作成）', 'setupSpreadsheet_')
    .addItem('入力規則・列見出しの説明メモを再設定', 'applySelectValidationsAndNotes_')
    .addItem('コミッション列を書式なしテキストに再設定', 'formatCommissionColumnsAsText_')
    .addItem('ステア列の「右/左」を「R/L」へ一括変換', 'migrateSteeringToRL_')
    .addToUi();
}
