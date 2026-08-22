/**
 * Code.gs
 * Webアプリのエントリポイント。
 */

function doGet(e) {
  return HtmlService.createTemplateFromFile('html/Index')
    .evaluate()
    .setTitle('販売可能リスト')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * HTMLファイル分割用インクルードヘルパー
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
