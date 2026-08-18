/**
 * Code.gs
 * Webアプリのエントリポイント。
 * スプシへの直接入力は廃止し、本Webアプリを唯一の操作画面とする（ビジョン 3・8）。
 */

function doGet(e) {
  return HtmlService.createTemplateFromFile('html/Index')
    .evaluate()
    .setTitle('車両台帳')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * HTMLファイル分割用インクルードヘルパー
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
