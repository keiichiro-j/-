/**
 * Triggers.gs
 * インストール型（時間主導型）トリガーのセットアップ。
 * GASエディタから setupTimeDrivenTriggers_() を一度だけ手動実行する。
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
}

function deleteAllTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    ScriptApp.deleteTrigger(t);
  });
}

function triggerHoldExpiryCheck() {
  processExpiredHolds();
}
