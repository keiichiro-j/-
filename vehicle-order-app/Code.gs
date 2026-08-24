/**
 * Code.gs
 * Webアプリのエントリポイント。
 */

function doGet(e) {
  return HtmlService.createTemplateFromFile('html/Index')
    .evaluate()
    .setTitle('販売可能リスト')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    // Googleサイトへの埋め込みで利用するためALLOWALLにしている。DEFAULT
    // （同一オリジンのみiframe許可）にすると、Googleサイト側のページに埋め込んだ
    // 枠が読み込めず空白になってしまう（Googleサイトは別オリジンのiframeとして
    // 読み込むため）。ALLOWALLはGoogleサイト以外の任意のサイトからの埋め込みも
    // 許可してしまうためクリックジャッキングの踏み台になり得るが、Hold登録・
    // 解除・受注確定はいずれもSession.getActiveUser()でサーバー側から操作者本人の
    // アカウントとして検証されるため（Api.gs, HoldService.gs, OrderService.gs参照）、
    // 悪用されても「操作者本人のアカウントとしての誤操作」に留まり、他人へのなりすまし
    // はできない。Googleサイトへの埋め込みが不要になった場合はDEFAULTに戻すこと。
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * HTMLファイル分割用インクルードヘルパー
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
