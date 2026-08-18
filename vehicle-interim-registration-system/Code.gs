/**
 * Code.gs
 * Webアプリのエントリポイント。
 */

function doGet() {
  var template = HtmlService.createTemplateFromFile('html/Index');
  return template.evaluate()
    .setTitle('中間登録書類送付書 発行システム')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * HTMLファイル分割用インクルードヘルパー
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
