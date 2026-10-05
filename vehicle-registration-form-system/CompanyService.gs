/**
 * CompanyService.gs
 * 申請フォームの「依頼会社名」の選択肢(ドロップダウン)の取得・保存。
 * 自由入力だと表記ゆれ(「株式会社」の有無など)が起きやすいため、BrandService.gsの
 * ブランド設定と同じ仕組みで、権限者が設定した選択肢からのみ選べるようにする。
 */

var COMPANY_OPTIONS_PROP_KEY = 'companyOptions';
var DEFAULT_COMPANY_OPTIONS = ['岐阜ヤナセ株式会社'];

/**
 * 依頼会社名の選択肢を返す。未設定・不正なら初期値(DEFAULT_COMPANY_OPTIONS)を返す。
 * @return {Array<string>}
 */
function getCompanyOptions_() {
  var raw = PropertiesService.getScriptProperties().getProperty(COMPANY_OPTIONS_PROP_KEY);
  if (!raw) return DEFAULT_COMPANY_OPTIONS.slice();
  try {
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_COMPANY_OPTIONS.slice();
    var cleaned = parsed.map(function (v) { return String(v || '').trim(); }).filter(function (v) { return v; });
    return cleaned.length ? cleaned : DEFAULT_COMPANY_OPTIONS.slice();
  } catch (e) {
    return DEFAULT_COMPANY_OPTIONS.slice();
  }
}

/**
 * 「設定」画面の保存ボタン用。空文字の行・重複は取り除いて保存する。1件も残らない場合はエラー。
 * @param {Array<string>} companies
 * @return {Array<string>} 保存後の内容
 */
function saveCompanyOptions_(companies) {
  var seen = {};
  var cleaned = [];
  (companies || []).forEach(function (v) {
    var trimmed = String(v || '').trim();
    if (!trimmed || seen[trimmed]) return;
    seen[trimmed] = true;
    cleaned.push(trimmed);
  });

  if (cleaned.length === 0) {
    throw new Error('依頼会社は1つ以上登録してください');
  }

  PropertiesService.getScriptProperties().setProperty(COMPANY_OPTIONS_PROP_KEY, JSON.stringify(cleaned));
  return cleaned;
}
