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
 * ヘッダー(masthead)に表示するロゴ画像のURLを返す。未設定なら空文字(ロゴ非表示)。
 * @return {string}
 */
function getLogoUrl_() {
  return PropertiesService.getScriptProperties().getProperty(LOGO_URL_PROP_KEY) || '';
}

/**
 * 「設定」画面のロゴ画像URL保存用。http(s)で始まる形式のみ許可する。
 * 空欄での保存は「ロゴを表示しない」設定として許可する。
 * @param {string} url
 * @return {string} 保存後のURL(トリム済み)
 */
function saveLogoUrl_(url) {
  var trimmed = String(url || '').trim();
  if (trimmed && !/^https?:\/\//i.test(trimmed)) {
    throw new Error('ロゴ画像URLは http:// または https:// で始まる形式で入力してください');
  }
  PropertiesService.getScriptProperties().setProperty(LOGO_URL_PROP_KEY, trimmed);
  return trimmed;
}
