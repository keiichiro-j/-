/**
 * Triggers.gs
 * インストール型（時間主導型）トリガーのセットアップ。
 * GASエディタから setupTimeDrivenTriggers_() を一度だけ手動実行する。
 */

function setupTimeDrivenTriggers_() {
  deleteAllTriggers_();

  // 4.1 車検証PDFフォルダの定期監視（30分おき）
  ScriptApp.newTrigger('triggerPdfSync')
    .timeBased()
    .everyMinutes(30)
    .create();

  // 4.4 車検満了日チェック（毎日 8:00）
  ScriptApp.newTrigger('triggerExpiryCheck')
    .timeBased()
    .atHour(8)
    .everyDays(1)
    .create();
}

function deleteAllTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    ScriptApp.deleteTrigger(t);
  });
}

function triggerPdfSync() {
  syncInspectionCertLinksAllCompanies();
}

function triggerExpiryCheck() {
  checkInspectionExpiryAndNotify();
}
