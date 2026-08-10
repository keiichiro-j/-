/**
 * SettingsService.gs
 * 「設定」画面向けの各種設定値の取得・保存(申請フォームの既定値)。
 */

var DEFAULT_FORM_VALUES_PROP_KEY = 'defaultFormValues';

/**
 * 申請フォームに自動入力する既定値(依頼会社名・担当責任者)を返す。未設定の項目は空文字。
 * @return {{company: string, manager: string}}
 */
function getDefaultFormValues_() {
  var raw = PropertiesService.getScriptProperties().getProperty(DEFAULT_FORM_VALUES_PROP_KEY);
  if (!raw) return { company: '', manager: '' };
  try {
    var parsed = JSON.parse(raw);
    return {
      company: typeof parsed.company === 'string' ? parsed.company : '',
      manager: typeof parsed.manager === 'string' ? parsed.manager : ''
    };
  } catch (e) {
    return { company: '', manager: '' };
  }
}

/**
 * 申請フォームの既定値を保存する(空欄の項目は「既定値なし」として保存される)。
 * @param {{company: string, manager: string}} values
 * @return {{company: string, manager: string}} 保存後の値(トリム済み)
 */
function saveDefaultFormValues_(values) {
  var trimmed = {
    company: String((values && values.company) || '').trim(),
    manager: String((values && values.manager) || '').trim()
  };
  PropertiesService.getScriptProperties().setProperty(DEFAULT_FORM_VALUES_PROP_KEY, JSON.stringify(trimmed));
  return trimmed;
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
