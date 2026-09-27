/**
 * BrandService.gs
 * 車両データの「ブランド」区分(選択肢)の取得・保存。
 * 申請フォームの車両行・履歴確認の絞り込み・他システムへの連携(ブランド別の転記先)の
 * いずれからも、ここで保存された選択肢が使われる。
 */

var BRAND_OPTIONS_PROP_KEY = 'brandOptions';
var DEFAULT_BRAND_OPTIONS = ['MB', 'AU'];

/**
 * ブランドの選択肢を返す。未設定・不正なら初期値(DEFAULT_BRAND_OPTIONS)を返す。
 * @return {Array<string>}
 */
function getBrandOptions_() {
  var raw = PropertiesService.getScriptProperties().getProperty(BRAND_OPTIONS_PROP_KEY);
  if (!raw) return DEFAULT_BRAND_OPTIONS.slice();
  try {
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_BRAND_OPTIONS.slice();
    var cleaned = parsed.map(function (v) { return String(v || '').trim(); }).filter(function (v) { return v; });
    return cleaned.length ? cleaned : DEFAULT_BRAND_OPTIONS.slice();
  } catch (e) {
    return DEFAULT_BRAND_OPTIONS.slice();
  }
}

/**
 * 「設定」画面の保存ボタン用。空文字の行・重複は取り除いて保存する。1件も残らない場合はエラー
 * (ブランド無しの状態は許可しない。空にしたい場合は運用上使わない値を1つ残すなどで対応する)。
 * @param {Array<string>} brands
 * @return {Array<string>} 保存後の内容
 */
function saveBrandOptions_(brands) {
  var seen = {};
  var cleaned = [];
  (brands || []).forEach(function (v) {
    var trimmed = String(v || '').trim();
    if (!trimmed || seen[trimmed]) return;
    seen[trimmed] = true;
    cleaned.push(trimmed);
  });

  if (cleaned.length === 0) {
    throw new Error('ブランドは1つ以上登録してください');
  }

  PropertiesService.getScriptProperties().setProperty(BRAND_OPTIONS_PROP_KEY, JSON.stringify(cleaned));
  return cleaned;
}
