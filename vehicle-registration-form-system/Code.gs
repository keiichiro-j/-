/**
 * Code.gs
 * Webアプリのエントリポイント。
 */

function doGet() {
  return HtmlService.createTemplateFromFile('html/Index')
    .evaluate()
    .setTitle('新車新規登録依頼書 発行システム')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * HTMLファイル分割用インクルードヘルパー
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
