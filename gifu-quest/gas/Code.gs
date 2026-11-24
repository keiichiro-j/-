// ぎふクエスト 〜六つの宝珠〜：GAS Webアプリの入口
// ゲームの処理はすべてブラウザで行う（index.html の中）。セーブは遊ぶ人の端末のブラウザ内に保存される。
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('ぎふクエスト 〜六つの宝珠〜')
    .addMetaTag('viewport', 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
