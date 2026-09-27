/**
 * SettingsService.gs
 * 「設定」画面向けの各種設定値の取得・保存。
 */

var THEME_PREFERENCE_PROP_KEY = 'themePreference';
var THEME_OPTIONS = ['mono', 'sand', 'forest', 'rose', 'dark', 'navy', 'amber', 'teal'];

/**
 * ログイン中のGoogleアカウントに紐づくテーマの好みを返す(未設定・不正なら空文字)。
 * PropertiesService.getUserProperties() は実行ユーザーごとに独立したストレージなので、
 * 同じアプリを複数人で使っても他人の設定を読み書きすることはない。
 * @return {string}
 */
function getThemePreference_() {
  var value = PropertiesService.getUserProperties().getProperty(THEME_PREFERENCE_PROP_KEY) || '';
  return THEME_OPTIONS.indexOf(value) !== -1 ? value : '';
}

/**
 * 「設定」画面のテーマ選択用。ログイン中のGoogleアカウントに紐づけて保存する。
 * @param {string} theme THEME_OPTIONSのいずれか
 * @return {string} 保存したテーマ
 */
function saveThemePreference_(theme) {
  if (THEME_OPTIONS.indexOf(theme) === -1) {
    throw new Error('不正なテーマです: ' + theme);
  }
  PropertiesService.getUserProperties().setProperty(THEME_PREFERENCE_PROP_KEY, theme);
  return theme;
}

var LOGO_URL_PROP_KEY = 'logoUrl';

/**
 * Googleドライブの「共有」から取得した閲覧用URL(.../file/d/<ID>/view?... や
 * .../open?id=<ID>)は画像そのものではなくビューアー画面のURLのため、<img>タグでは表示できない。
 * ファイルIDを取り出し、画像として直接表示できるサムネイルURLに変換する。
 * 該当しないURL(既に直接画像URLの場合や他サービスのURL)はそのまま返す。
 * @param {string} url
 * @return {string}
 */
function normalizeDriveImageUrl_(url) {
  var trimmed = String(url || '').trim();
  var m = /^https?:\/\/drive\.google\.com\/file\/d\/([^\/]+)/i.exec(trimmed)
    || /^https?:\/\/drive\.google\.com\/open\?id=([^&]+)/i.exec(trimmed);
  return m ? 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1000' : trimmed;
}

/**
 * ヘッダー(masthead)に表示するロゴ画像のURLを返す。未設定なら空文字(ロゴ非表示)。
 * @return {string}
 */
function getLogoUrl_() {
  return PropertiesService.getScriptProperties().getProperty(LOGO_URL_PROP_KEY) || '';
}

/**
 * 「設定」画面のロゴ画像URL保存用。Googleドライブの共有リンクは表示用URLへ自動変換した上で、
 * http(s)で始まる形式のみ許可する。空欄での保存は「ロゴを表示しない」設定として許可する。
 * @param {string} url
 * @return {string} 保存後のURL(変換・トリム済み)
 */
function saveLogoUrl_(url) {
  var trimmed = normalizeDriveImageUrl_(url);
  if (trimmed && !/^https?:\/\//i.test(trimmed)) {
    throw new Error('ロゴ画像URLは http:// または https:// で始まる形式で入力してください');
  }
  PropertiesService.getScriptProperties().setProperty(LOGO_URL_PROP_KEY, trimmed);
  return trimmed;
}

var LOADING_IMAGE_URL_PROP_KEY = 'loadingImageUrl';

/**
 * 起動画面(ローディング画面)に表示する画像のURLを返す。未設定なら空文字(画像なし)。
 * @return {string}
 */
function getLoadingImageUrl_() {
  return PropertiesService.getScriptProperties().getProperty(LOADING_IMAGE_URL_PROP_KEY) || '';
}

/**
 * 「設定」画面の起動画面(ローディング画面)画像URL保存用。ロゴ画像URLと同じ方式で、
 * Googleドライブの共有リンクは表示用URLへ自動変換した上で、http(s)で始まる形式のみ許可する。
 * (以前はアプリ内から直接ファイルをアップロードする方式だったが、組織のドライブ共有ポリシーに
 * よっては setSharing がブロックされ保存に失敗するケースがあったため、ロゴ画像と同じ
 * 「ユーザー自身がドライブにアップロードし、共有リンクを貼り付ける」方式に変更した。)
 * 空欄での保存は「画像を表示しない」設定として許可する。
 * @param {string} url
 * @return {string} 保存後のURL(変換・トリム済み)
 */
function saveLoadingImageUrl_(url) {
  var trimmed = normalizeDriveImageUrl_(url);
  if (trimmed && !/^https?:\/\//i.test(trimmed)) {
    throw new Error('起動画面の画像URLは http:// または https:// で始まる形式で入力してください');
  }
  PropertiesService.getScriptProperties().setProperty(LOADING_IMAGE_URL_PROP_KEY, trimmed);
  return trimmed;
}

var STAFF_MASTER_PROP_KEY = 'staffMaster';

/**
 * 担当者マスタ(担当者名 <-> Googleアカウントの対応表)を返す。未設定・不正なら空配列。
 * @return {Array<{name: string, email: string}>}
 */
function getStaffMaster_() {
  var raw = PropertiesService.getScriptProperties().getProperty(STAFF_MASTER_PROP_KEY);
  if (!raw) return [];
  try {
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(function (row) {
        return {
          name: typeof row.name === 'string' ? row.name.trim() : '',
          email: typeof row.email === 'string' ? row.email.trim().toLowerCase() : ''
        };
      })
      .filter(function (row) { return row.name && row.email; });
  } catch (e) {
    return [];
  }
}

/**
 * 「設定」画面の担当者マスタ保存ボタン用。担当者名・Googleアカウントのどちらも
 * 空の行は無視して保存する。片方だけ入力されている行や、メール形式が不正な行はエラーにする。
 * @param {Array<{name: string, email: string}>} rows
 * @return {Array<{name: string, email: string}>} 保存後の内容(トリム済み)
 */
function saveStaffMaster_(rows) {
  var cleaned = (rows || [])
    .map(function (row) {
      return {
        name: String((row && row.name) || '').trim(),
        email: String((row && row.email) || '').trim().toLowerCase()
      };
    })
    .filter(function (row) { return row.name || row.email; });

  cleaned.forEach(function (row) {
    if (!row.name || !row.email) {
      throw new Error('担当者名・Googleアカウントは両方入力してください(' + (row.name || row.email) + ')');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      throw new Error('Googleアカウントの形式が正しくありません: ' + row.email);
    }
  });

  PropertiesService.getScriptProperties().setProperty(STAFF_MASTER_PROP_KEY, JSON.stringify(cleaned));
  return cleaned;
}

/**
 * 現在ログイン中のユーザーのGoogleアカウントを担当者マスタと照合し、一致する担当者名を返す。
 * アカウントが取得できない場合・マスタに登録がない場合は空文字(呼び出し側で既定値や手入力に
 * フォールバックする)。Webアプリの公開設定が「アクセスしたユーザーとして実行」でないと、
 * 常に空文字(または実行者自身のアカウント)になる点に注意。
 * @return {string}
 */
/**
 * 現在ログイン中のユーザーのGoogleアカウント(メールアドレス)を返す。取得できない場合は空文字。
 * Webアプリの公開設定が「アクセスしたユーザーとして実行」でないと、常に空文字(または
 * 実行者自身のアカウント)になる点に注意。
 * @return {string}
 */
function getCurrentUserEmail_() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (e) {
    return '';
  }
}

function getManagerForCurrentUser_() {
  var email = getCurrentUserEmail_();
  if (!email) return '';
  email = email.trim().toLowerCase();

  var match = getStaffMaster_().filter(function (row) { return row.email === email; })[0];
  // 担当者マスタに未登録でも、ログインユーザーが担当責任者になるようメールアドレス自体を
  // フォールバックとして返す(空欄のままにしない)。
  return match ? match.name : email;
}
