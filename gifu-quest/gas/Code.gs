// ぎふクエスト：GAS Webアプリの入口。ゲームの処理はすべてブラウザで行う。
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('ぎふクエスト 〜六つの宝珠〜')
    .addMetaTag('viewport', 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 将来の拡張：別の端末でも続きができるように UserProperties にも保存する（必須ではない）
function saveProgress(json) {
  if (typeof json !== 'string' || json.length > 9000) throw new Error('invalid save');
  PropertiesService.getUserProperties().setProperty('gq2_save', json);
  return true;
}
function loadProgress() {
  return PropertiesService.getUserProperties().getProperty('gq2_save');
}
