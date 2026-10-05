/**
 * Code.gs
 * Webアプリのエントリポイント。
 */

function doGet() {
  var template = HtmlService.createTemplateFromFile('html/Index');
  // 起動画面(ローディング画面)の画像URL、ブランドの選択肢はページ生成時に埋め込む
  // (google.script.runの往復を待たず、初回表示の瞬間から正しい内容を出すため。
  // 特にブランドは車両データの1行目を描画する時点で必要になる)。
  template.loadingImageUrl = getLoadingImageUrl_();
  template.brandOptionsJson = JSON.stringify(getBrandOptions_());
  template.companyOptionsJson = JSON.stringify(getCompanyOptions_());
  template.gyoseiChecklistItemsJson = JSON.stringify(GYOSEI_CHECKLIST_ITEMS);
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
