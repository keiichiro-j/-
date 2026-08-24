/**
 * Code.gs
 * Webアプリのエントリポイント。
 */

function doGet(e) {
  return HtmlService.createTemplateFromFile('html/Index')
    .evaluate()
    .setTitle('販売可能リスト')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    // 他サイトのiframeにこのアプリを埋め込まれてクリックジャッキングの
    // 踏み台にされないよう、既定のDEFAULT（同一オリジンのみiframe許可）のままにする。
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * HTMLファイル分割用インクルードヘルパー
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
