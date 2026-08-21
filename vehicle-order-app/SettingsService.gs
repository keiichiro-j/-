/**
 * SettingsService.gs
 * 3.6 設定機能（テーマ設定、Hold時／受注時のメール通知先設定）
 */

function getSettings() {
  var props = PropertiesService.getScriptProperties();
  return {
    themeColor: props.getProperty(PROP_KEYS.THEME_COLOR) || DEFAULT_THEME_COLOR,
    notifyHoldMailTo: props.getProperty(PROP_KEYS.NOTIFY_HOLD_MAIL_TO) || '',
    notifyOrderMailTo: props.getProperty(PROP_KEYS.NOTIFY_ORDER_MAIL_TO) || ''
  };
}

function saveSettings(settings) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_KEYS.THEME_COLOR, settings.themeColor || DEFAULT_THEME_COLOR);
  props.setProperty(PROP_KEYS.NOTIFY_HOLD_MAIL_TO, settings.notifyHoldMailTo || '');
  props.setProperty(PROP_KEYS.NOTIFY_ORDER_MAIL_TO, settings.notifyOrderMailTo || '');
  return getSettings();
}
