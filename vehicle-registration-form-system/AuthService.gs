/**
 * AuthService.gs
 * 「権限者」(設定画面の大部分を閲覧・変更できるユーザー)の管理。
 *
 * 権限者は、この配列に直接Googleアカウントのメールアドレスを追加/削除することで編集する
 * (設定画面などUI経由では変更できない設計にしている。誰でも自分を権限者に追加できてしまう
 * と権限を分ける意味が無くなるため)。複数人を権限者にする場合は、配列にメールアドレスを
 * 追加していってください(1行に1件、カンマ区切り)。
 */
var AUTHORIZED_ADMIN_EMAILS_ = [
  // 例: 'toda@example.com',
];

/**
 * ログイン中のGoogleアカウントが権限者かどうかを返す。
 * @return {boolean}
 */
function isAuthorizedAdmin_() {
  var email = getCurrentUserEmail_();
  if (!email) return false;
  var normalized = email.trim().toLowerCase();
  return AUTHORIZED_ADMIN_EMAILS_.some(function (adminEmail) {
    return String(adminEmail || '').trim().toLowerCase() === normalized;
  });
}

/**
 * 権限者専用の操作(設定の保存系API)の先頭で呼び出す。権限者でなければ例外を投げる。
 */
function assertAuthorizedAdmin_() {
  if (!isAuthorizedAdmin_()) {
    throw new Error('この操作を行う権限がありません。');
  }
}
