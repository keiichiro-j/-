/**
 * SettingsService.gs
 * 設定機能（テーマ設定、Hold時／受注時のメール通知先設定、担当者マスタ）
 */

function getSettings() {
  var props = PropertiesService.getScriptProperties();
  return {
    themeColor: props.getProperty(PROP_KEYS.THEME_COLOR) || DEFAULT_THEME_COLOR,
    notifyHoldMailTo: props.getProperty(PROP_KEYS.NOTIFY_HOLD_MAIL_TO) || '',
    notifyOrderMailTo: props.getProperty(PROP_KEYS.NOTIFY_ORDER_MAIL_TO) || '',
    staffList: getStaffList_()
  };
}

function saveSettings(settings) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_KEYS.THEME_COLOR, settings.themeColor || DEFAULT_THEME_COLOR);
  props.setProperty(PROP_KEYS.NOTIFY_HOLD_MAIL_TO, settings.notifyHoldMailTo || '');
  props.setProperty(PROP_KEYS.NOTIFY_ORDER_MAIL_TO, settings.notifyOrderMailTo || '');
  props.setProperty(PROP_KEYS.STAFF_LIST, JSON.stringify(normalizeStaffList_(settings.staffList)));
  return getSettings();
}

function getStaffList_() {
  var raw = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.STAFF_LIST);
  if (!raw) return [];
  try {
    var list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

/**
 * 担当者マスタの正規化（純粋関数）。
 * 空欄除去・重複除去のうえ、最大人数（STAFF_LIST_MAX）を超えていればエラー。
 */
function normalizeStaffList_(list) {
  list = Array.isArray(list) ? list : [];
  var seen = {};
  var result = [];
  list.forEach(function (name) {
    var trimmed = String(name || '').trim();
    if (!trimmed || seen[trimmed]) return;
    seen[trimmed] = true;
    result.push(trimmed);
  });
  if (result.length > STAFF_LIST_MAX) {
    throw new Error('担当者マスタは最大' + STAFF_LIST_MAX + '人までです（現在' + result.length + '人）');
  }
  return result;
}
