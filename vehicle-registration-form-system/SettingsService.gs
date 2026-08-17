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

var LOADING_IMAGE_URL_PROP_KEY = 'loadingImageUrl';
var LOADING_IMAGE_FILE_ID_PROP_KEY = 'loadingImageFileId';
var LOADING_IMAGE_MAX_BYTES_ = 5 * 1024 * 1024;

/**
 * 起動画面(ローディング画面)に表示する画像のURLを返す。未設定なら空文字(画像なし)。
 * @return {string}
 */
function getLoadingImageUrl_() {
  return PropertiesService.getScriptProperties().getProperty(LOADING_IMAGE_URL_PROP_KEY) || '';
}

/**
 * 設定画面から選択された画像ファイル(base64)をGoogleドライブへアップロードし、
 * 起動画面用の表示URLとして保存する。以前アップロードした画像があればゴミ箱へ移動する。
 * @param {string} base64Data 画像データ(data:URLのヘッダー部分を除いたbase64文字列)
 * @param {string} mimeType 画像のMIMEタイプ(例: image/png)
 * @param {string} fileName 元のファイル名
 * @return {string} 保存後の表示用URL
 */
function saveLoadingImage_(base64Data, mimeType, fileName) {
  if (!base64Data) {
    throw new Error('画像を選択してください');
  }
  if (!/^image\//i.test(mimeType || '')) {
    throw new Error('画像ファイルを選択してください');
  }

  // data:URLのbase64部分以外(改行・空白・"data:...;base64,"の取り残しなど)が
  // 紛れ込んでいると Utilities.base64Decode がGASの汎用エラー(「引数が無効です」)を
  // 投げ、原因が分かりにくいため、ここで取り除いてから渡す。
  var cleanedBase64 = String(base64Data).replace(/^data:[^,]*,/, '').replace(/\s+/g, '');

  var bytes;
  try {
    bytes = Utilities.base64Decode(cleanedBase64);
  } catch (e) {
    throw new Error('画像データを読み取れませんでした。別の画像でお試しください。(' + e.message + ')');
  }

  if (bytes.length > LOADING_IMAGE_MAX_BYTES_) {
    throw new Error('画像サイズが大きすぎます(5MB以内にしてください)');
  }

  var url;
  var file;
  try {
    // ファイル名に改行や制御文字が含まれると newBlob が失敗することがあるため、安全な文字だけに絞る。
    var safeName = String(fileName || 'loading-image').replace(/[\r\n\t]/g, ' ').trim() || 'loading-image';
    var blob = Utilities.newBlob(bytes, mimeType, safeName);
    file = DriveApp.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    url = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000';
  } catch (e) {
    throw new Error('Googleドライブへの保存に失敗しました。(' + e.message + ')');
  }

  var props = PropertiesService.getScriptProperties();
  var prevFileId = props.getProperty(LOADING_IMAGE_FILE_ID_PROP_KEY);
  props.setProperty(LOADING_IMAGE_URL_PROP_KEY, url);
  props.setProperty(LOADING_IMAGE_FILE_ID_PROP_KEY, file.getId());
  removeLoadingImageFile_(prevFileId);

  return url;
}

/**
 * 起動画面用に設定されている画像を削除し、「画像なし」の状態に戻す。
 */
function clearLoadingImage_() {
  var props = PropertiesService.getScriptProperties();
  var prevFileId = props.getProperty(LOADING_IMAGE_FILE_ID_PROP_KEY);
  removeLoadingImageFile_(prevFileId);
  props.deleteProperty(LOADING_IMAGE_URL_PROP_KEY);
  props.deleteProperty(LOADING_IMAGE_FILE_ID_PROP_KEY);
}

// 差し替え・削除時に以前のドライブファイルをゴミ箱へ移動する(既に削除済みなどのエラーは無視する)。
function removeLoadingImageFile_(fileId) {
  if (!fileId) return;
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (e) {
    // 既に手動で削除されている場合などは無視する
  }
}
