/**
 * Triggers.gs
 * インストール型トリガー（時間主導型・onEdit）のセットアップ。
 * GASエディタから setupTimeDrivenTriggers_() を一度だけ手動実行する
 * （setupSpreadsheet_からも自動的に呼び出される）。
 *
 * GASの時間主導トリガーは最短1分間隔のため、72時間経過判定に数分単位の誤差が
 * 生じ得るが、運用上許容範囲と判断し 5分間隔で判定する（企画書 8.）。
 */

function setupTimeDrivenTriggers_() {
  deleteAllTriggers_();

  ScriptApp.newTrigger('triggerHoldExpiryCheck')
    .timeBased()
    .everyMinutes(5)
    .create();

  // 在庫リストが直接編集されるたび、区分「デモカー」「サービス」の車両を
  // デモカーリスト・サービス代車リストへ自動反映する（CarTrackingService.gsの
  // syncAllCarTrackingLists_参照）。onEdit(e)をそのまま定義する簡易トリガーでは
  // なく、あえてインストール型にしている理由: 簡易トリガーは編集した本人の
  // 認可状態で実行されるため、Webアプリを一度も開いたことがない担当者が
  // スプレッドシートを直接編集した場合、LockService等の権限が必要な処理が
  // 失敗し得る。インストール型トリガーは常にこの関数を実行した（スクリプトを
  // 認可した）オーナーの権限で動くため、誰が編集しても確実に動作する。
  ScriptApp.newTrigger('triggerInventoryEdited')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();

  // 上記onEditトリガーだけに頼らない保険として、5分おきにも必ず在庫リストの
  // 最新内容へ同期し直す（triggerCarTrackingPeriodicSync参照）。編集の種類や
  // 環境によってはonEditが発火しないケースが稀にあり得るため、たとえonEditが
  // 何らかの理由で機能しなくても、最大5分以内には確実に反映されるようにする。
  ScriptApp.newTrigger('triggerCarTrackingPeriodicSync')
    .timeBased()
    .everyMinutes(5)
    .create();
}

function deleteAllTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    ScriptApp.deleteTrigger(t);
  });
}

/**
 * インストール型onEditトリガー本体。在庫リストへの編集（追加・変更・貼り付け等、
 * セル単位・範囲単位を問わない）のたびに呼び出される。編集対象が在庫リスト
 * 以外のシート（Holdリスト・受注リスト・デモカーリスト自身等）であれば何もしない。
 * どの列が編集されたかまでは絞り込まず、在庫リストへの編集であれば常に区分
 * デモカー／サービスの車両全体を再同期する（行の追加・複数セル貼り付け・
 * 削除・並び替え等、どのような編集でも取りこぼさないようにするため。
 * CarTrackingService.gsのsyncAllCarTrackingLists_参照）。
 * onEditトリガーは処理内容を画面に表示できないため、失敗しても編集操作自体は
 * 中断させず、管理者へのメール通知のみ行う（triggerHoldExpiryCheckと同じ方針）。
 */
function triggerInventoryEdited(e) {
  try {
    var sheet = e && e.range && e.range.getSheet();
    if (!sheet || sheet.getName() !== SHEET_NAMES.INVENTORY) return;
    syncAllCarTrackingLists_();
  } catch (err) {
    notifySystemError_('在庫リスト編集時のデモカーリスト・サービス代車リスト自動反映', err);
  }
}

/**
 * 在庫リスト編集時のonEditトリガー（triggerInventoryEdited）だけに頼らない、
 * デモカーリスト・サービス代車リスト自動反映の保険。5分おきに必ず
 * syncAllCarTrackingLists_（CarTrackingService.gs参照）を実行し、在庫リストの
 * 最新内容へ同期し直す。onEditが何らかの理由（貼り付けの種類・実行環境の違い等）
 * で発火しなかった場合でも、この定期実行により最大5分以内には確実に反映される。
 * triggerHoldExpiryCheckと同じく、失敗時は1回だけ即時リトライし、それでも
 * 失敗した場合は管理者へメール通知する。
 */
function triggerCarTrackingPeriodicSync() {
  try {
    syncAllCarTrackingLists_();
    return;
  } catch (e) {
    Utilities.sleep(2000);
  }
  try {
    syncAllCarTrackingLists_();
  } catch (e2) {
    notifySystemError_('デモカーリスト・サービス代車リストの定期同期', e2);
  }
}

/**
 * processExpiredHolds() は5分おきに繰り返し実行される冪等な処理のため、
 * 一時的なエラー（スプレッドシートAPIの瞬断等）であれば次回の実行が
 * 自動的に埋め合わせる。ただし失敗に誰も気づけないままだと、期限切れの
 * 車両がいつまでも解放されない事態になり得るため、1回だけ即時リトライし、
 * それでも失敗した場合は管理者へメール通知する（検知漏れの防止）。
 */
function triggerHoldExpiryCheck() {
  try {
    processExpiredHolds();
    return;
  } catch (e) {
    Utilities.sleep(2000);
  }
  try {
    processExpiredHolds();
  } catch (e2) {
    notifySystemError_('Hold期限切れ処理', e2);
  }
}
