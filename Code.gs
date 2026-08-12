/**
 * Code.gs
 * Webアプリのエントリポイント。
 * スプシへの直接入力は廃止し、本Webアプリを唯一の操作画面とする（ビジョン 3・8）。
 * ?page=schedule で登録スケジュール管理画面を出し分ける。
 */

function doGet(e) {
  var page = e && e.parameter && e.parameter.page;

  if (page === 'schedule') {
    return HtmlService.createTemplateFromFile('html/ScheduleIndex')
      .evaluate()
      .setTitle('登録スケジュール管理')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService.createTemplateFromFile('html/Index')
    .evaluate()
    .setTitle('車両在庫管理')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * HTMLファイル分割用インクルードヘルパー
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
