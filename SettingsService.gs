/**
 * SettingsService.gs
 * 「設定」画面で編集する項目（拠点／通知／OCRラベル／選択肢／テーマ）の読み書き。
 * すべて Script Properties に保存し、未設定時は Constants.gs や各Extractionサービスの
 * 既定値にフォールバックする（設定を一切いじらなくてもアプリは動作する）。
 */

// ===== 通知設定（Slack Webhook・車検満了通知メール宛先） =====
function getNotificationSettings() {
  var props = PropertiesService.getScriptProperties();
  return {
    slackWebhookUrl: props.getProperty(PROP_KEYS.SLACK_WEBHOOK_URL) || '',
    notifyMailTo: props.getProperty(PROP_KEYS.NOTIFY_MAIL_TO) || ''
  };
}

function saveNotificationSettings(settings) {
  settings = settings || {};
  var props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_KEYS.SLACK_WEBHOOK_URL, settings.slackWebhookUrl || '');
  props.setProperty(PROP_KEYS.NOTIFY_MAIL_TO, settings.notifyMailTo || '');
}

// ===== 選択肢設定（ステータス・仕入区分） =====
function getEffectiveStatusOptions() {
  var json = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.STATUS_OPTIONS_OVERRIDE);
  if (!json) return STATUS_OPTIONS;
  var list = JSON.parse(json);
  return (list && list.length) ? list : STATUS_OPTIONS;
}

function getEffectivePurchaseTypeOptions() {
  var json = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.PURCHASE_TYPE_OPTIONS_OVERRIDE);
  if (!json) return PURCHASE_TYPE_OPTIONS;
  var list = JSON.parse(json);
  return (list && list.length) ? list : PURCHASE_TYPE_OPTIONS;
}

function saveOptionSettings(settings) {
  settings = settings || {};
  var props = PropertiesService.getScriptProperties();
  if (settings.statusOptions && settings.statusOptions.length) {
    if (settings.statusOptions.indexOf(STATUS_SOLD) === -1 || settings.statusOptions.indexOf(STATUS_NAME_TRANSFERRED) === -1) {
      throw new Error('ステータスの選択肢には「' + STATUS_NAME_TRANSFERRED + '」「' + STATUS_SOLD + '」を含めてください（自動移動・通知機能で使用します）');
    }
    props.setProperty(PROP_KEYS.STATUS_OPTIONS_OVERRIDE, JSON.stringify(settings.statusOptions));
  }
  if (settings.purchaseTypeOptions && settings.purchaseTypeOptions.length) {
    props.setProperty(PROP_KEYS.PURCHASE_TYPE_OPTIONS_OVERRIDE, JSON.stringify(settings.purchaseTypeOptions));
  }
}

// ===== OCRラベル設定（注文書・査定書・車検証の抽出ラベル候補） =====
function getOcrLabelOverrides() {
  var json = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.OCR_LABEL_OVERRIDE);
  var override = json ? JSON.parse(json) : {};
  return {
    orderForm: mergeLabelMap_(ORDER_FORM_LABEL_MAP, override.orderForm),
    appraisal: mergeLabelMap_(APPRAISAL_LABEL_MAP, override.appraisal),
    inspection: mergeLabelMap_(INSPECTION_LABEL_MAP, override.inspection)
  };
}

function mergeLabelMap_(defaults, override) {
  if (!override) return defaults;
  var merged = {};
  Object.keys(defaults).forEach(function (key) {
    merged[key] = (override[key] && override[key].length) ? override[key] : defaults[key];
  });
  return merged;
}

function saveOcrLabelOverrides(overrideMaps) {
  PropertiesService.getScriptProperties().setProperty(PROP_KEYS.OCR_LABEL_OVERRIDE, JSON.stringify(overrideMaps || {}));
}

function getEffectiveOrderFormLabelMap_() { return getOcrLabelOverrides().orderForm; }
function getEffectiveAppraisalLabelMap_() { return getOcrLabelOverrides().appraisal; }
function getEffectiveInspectionLabelMap_() { return getOcrLabelOverrides().inspection; }

// ===== テーマ設定（アクセントカラー・ロゴ・アプリ名） =====
function getThemeSettings() {
  var json = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.THEME_CONFIG);
  var theme = json ? JSON.parse(json) : {};
  return {
    accentColor: theme.accentColor || '#111827',
    logoUrl: theme.logoUrl || '',
    loadingImageUrl: theme.loadingImageUrl || '',
    appTitle: theme.appTitle || '車両在庫管理',
    appSubtitle: theme.appSubtitle || '拠点切替・横断在庫管理、OCRによる入庫データ自動反映'
  };
}

function saveThemeSettings(theme) {
  theme = theme || {};
  PropertiesService.getScriptProperties().setProperty(PROP_KEYS.THEME_CONFIG, JSON.stringify({
    accentColor: theme.accentColor || '#111827',
    logoUrl: normalizeDriveImageUrl_(theme.logoUrl || ''),
    loadingImageUrl: normalizeDriveImageUrl_(theme.loadingImageUrl || ''),
    appTitle: theme.appTitle || '車両在庫管理',
    appSubtitle: theme.appSubtitle || ''
  }));
}

/**
 * Googleドライブの共有リンク（.../file/d/XXXX/view?usp=... 形式）を、
 * 画像として直接表示できる thumbnail URL に変換する（純粋関数）。
 * 既に thumbnail/uc 形式などの場合はそのまま返す。
 */
function normalizeDriveImageUrl_(url) {
  if (!url) return '';
  var trimmed = String(url).trim();
  var m = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1000';
  return trimmed;
}

// ===== 設定画面まとめ取得 =====
function getAppSettings() {
  return {
    companies: getCompanies(),
    notification: getNotificationSettings(),
    ocrLabels: getOcrLabelOverrides(),
    statusOptions: getEffectiveStatusOptions(),
    purchaseTypeOptions: getEffectivePurchaseTypeOptions(),
    theme: getThemeSettings()
  };
}
