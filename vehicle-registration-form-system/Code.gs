/**
 * Code.gs
 * Webアプリのエントリポイント。
 */

function doGet() {
  var template = HtmlService.createTemplateFromFile('html/Index');
  // 起動画面(ローディング画面)の画像URLはページ生成時に埋め込む(google.script.runの
  // 往復を待たず、初回表示の瞬間から正しい画像を出すため)。
  template.loadingImageUrl = getLoadingImageUrl_();
  return template.evaluate()
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
