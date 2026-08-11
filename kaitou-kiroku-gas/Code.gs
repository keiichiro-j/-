/**
 * Code.gs
 * Webアプリのエントリポイント。
 * 紙の解答用紙の代わりとして使う、個人用の解答記録・自己採点アプリ（企画書 1.〜3.）。
 */

function doGet(e) {
  return HtmlService.createTemplateFromFile('html/Index')
    .evaluate()
    .setTitle('解答記録')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * HTMLファイル分割用インクルードヘルパー
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
