/**
 * Code.gs
 * Webアプリのエントリポイント。
 * スプシへの直接入力は廃止し、本Webアプリを唯一の操作画面とする（ビジョン 3・8）。
 */

function doGet(e) {
  var template = HtmlService.createTemplateFromFile('html/Index');
  template.theme = getThemeSettings(); // 起動画面（ローディング画面）の画像をサーバー側で先に埋め込む
  return template.evaluate()
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
