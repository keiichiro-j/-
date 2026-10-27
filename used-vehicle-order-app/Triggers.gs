/**
 * Triggers.gs
 * インストール型トリガー（時間主導型）のセットアップ。
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

  ScriptApp.newTrigger('triggerSoldCarTrackingMigration')
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

/**
 * migrateSoldCarTrackingToOrders_()も5分おきに繰り返し実行される冪等な処理
 * （対象はコミッション単位で一意に特定し、移動済みの行は次回の走査対象から
 * 自然に外れる）のため、triggerHoldExpiryCheckと同じ考え方で1回だけ即時
 * リトライし、それでも失敗した場合は管理者へメール通知する。
 */
function triggerSoldCarTrackingMigration() {
  try {
    migrateSoldCarTrackingToOrders_();
    return;
  } catch (e) {
    Utilities.sleep(2000);
  }
  try {
    migrateSoldCarTrackingToOrders_();
  } catch (e2) {
    notifySystemError_('デモカー・サービス代車リストの販売済み自動移動', e2);
  }
}
