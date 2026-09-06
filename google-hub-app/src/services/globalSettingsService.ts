/**
 * 5.3 アプリ全域のデータ設定
 * 同期対象カレンダー・メール取得ラベル・通知ON/OFFなど、全ユーザー共通の設定。
 * スプレッドシート台帳が使えない/未初期化のケースに備え、
 * スクリプトプロパティ（PropertiesService.getScriptProperties）を正とする。
 */
namespace GlobalSettingsService {
  const PROPERTY_KEY = "GLOBAL_SETTINGS";

  const DEFAULT_SETTINGS: GlobalSettings = {
    syncCalendarIds: ["primary"],
    mailLabel: "INBOX",
    notifyEnabled: true,
  };

  export function getSettings(): GlobalSettings {
    const raw = PropertiesService.getScriptProperties().getProperty(PROPERTY_KEY);
    if (!raw) {
      return cloneDefaults();
    }
    try {
      const parsed = JSON.parse(raw) as Partial<GlobalSettings>;
      return sanitize(parsed);
    } catch (e) {
      return cloneDefaults();
    }
  }

  export function saveSettings(settings: Partial<GlobalSettings>): GlobalSettings {
    const sanitized = sanitize(settings);
    PropertiesService.getScriptProperties().setProperty(
      PROPERTY_KEY,
      JSON.stringify(sanitized)
    );
    return sanitized;
  }

  export function sanitize(input: Partial<GlobalSettings>): GlobalSettings {
    const syncCalendarIds =
      Array.isArray(input.syncCalendarIds) && input.syncCalendarIds.length > 0
        ? input.syncCalendarIds.filter((id) => typeof id === "string" && id.length > 0)
        : DEFAULT_SETTINGS.syncCalendarIds.slice();
    const mailLabel =
      typeof input.mailLabel === "string" && input.mailLabel.length > 0
        ? input.mailLabel
        : DEFAULT_SETTINGS.mailLabel;
    const notifyEnabled =
      typeof input.notifyEnabled === "boolean" ? input.notifyEnabled : DEFAULT_SETTINGS.notifyEnabled;

    return {
      syncCalendarIds: syncCalendarIds.length > 0 ? syncCalendarIds : DEFAULT_SETTINGS.syncCalendarIds.slice(),
      mailLabel: mailLabel,
      notifyEnabled: notifyEnabled,
    };
  }

  function cloneDefaults(): GlobalSettings {
    return {
      syncCalendarIds: DEFAULT_SETTINGS.syncCalendarIds.slice(),
      mailLabel: DEFAULT_SETTINGS.mailLabel,
      notifyEnabled: DEFAULT_SETTINGS.notifyEnabled,
    };
  }
}
