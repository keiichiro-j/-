/**
 * 5.2 ホーム画面のカスタマイズ機能
 * ウィジェット（カレンダー/今日の予定/メール/アプリリンク集）の配置・サイズ・表示可否、
 * メール表示件数、テーマ選択を PropertiesService(User) に保存する。
 */
namespace UserSettingsService {
  const PROPERTY_KEY = "USER_SETTINGS";

  const ALL_WIDGET_IDS: WidgetId[] = ["calendar", "today", "mail", "links"];
  const VALID_COLUMNS: WidgetColumn[] = ["main", "side"];
  const VALID_SIZES: WidgetSize[] = ["small", "medium", "large"];

  const DEFAULT_WIDGETS: WidgetConfig[] = [
    { id: "calendar", column: "main", size: "large", visible: true },
    { id: "today", column: "side", size: "small", visible: true },
    { id: "mail", column: "side", size: "medium", visible: true },
    { id: "links", column: "side", size: "medium", visible: true },
  ];

  const MAX_CUSTOM_NAV_ITEMS = 12;

  const DEFAULT_SETTINGS: UserSettings = {
    widgets: DEFAULT_WIDGETS,
    mailCount: 5,
    themeChoice: Theme.RANDOM_CHOICE_ID,
    customNavItems: [],
  };

  function defaultWidget(id: WidgetId): WidgetConfig {
    const found = DEFAULT_WIDGETS.filter((w) => w.id === id)[0];
    return { id: found.id, column: found.column, size: found.size, visible: found.visible };
  }

  export function getSettings(): UserSettings {
    const raw = PropertiesService.getUserProperties().getProperty(PROPERTY_KEY);
    if (!raw) {
      return cloneDefaults();
    }
    try {
      const parsed = JSON.parse(raw) as Partial<UserSettings>;
      return sanitize(parsed);
    } catch (e) {
      return cloneDefaults();
    }
  }

  /** 保存済みの設定に、渡された項目だけを上書きしてから保存する（他の項目が消えないようにする） */
  export function saveSettings(settings: Partial<UserSettings>): UserSettings {
    const current = getSettings();
    const merged: Partial<UserSettings> = {
      widgets: settings.widgets !== undefined ? settings.widgets : current.widgets,
      mailCount: settings.mailCount !== undefined ? settings.mailCount : current.mailCount,
      themeChoice: settings.themeChoice !== undefined ? settings.themeChoice : current.themeChoice,
      customNavItems: settings.customNavItems !== undefined ? settings.customNavItems : current.customNavItems,
    };
    const sanitized = sanitize(merged);
    PropertiesService.getUserProperties().setProperty(
      PROPERTY_KEY,
      JSON.stringify(sanitized)
    );
    return sanitized;
  }

  /** ウィジェット設定を検証・補完する（不正な値はデフォルトへ、欠けているウィジェットは末尾に補完） */
  export function sanitizeWidgets(input: unknown): WidgetConfig[] {
    const result: WidgetConfig[] = [];
    const seen: { [key: string]: boolean } = {};

    if (Array.isArray(input)) {
      input.forEach((raw) => {
        if (!raw || typeof raw !== "object") {
          return;
        }
        const w = raw as Partial<WidgetConfig>;
        if (!w.id || ALL_WIDGET_IDS.indexOf(w.id) === -1 || seen[w.id]) {
          return;
        }
        seen[w.id] = true;
        const fallback = defaultWidget(w.id);
        result.push({
          id: w.id,
          column: w.column && VALID_COLUMNS.indexOf(w.column) !== -1 ? w.column : fallback.column,
          size: w.size && VALID_SIZES.indexOf(w.size) !== -1 ? w.size : fallback.size,
          visible: typeof w.visible === "boolean" ? w.visible : fallback.visible,
        });
      });
    }

    ALL_WIDGET_IDS.filter((id) => !seen[id]).forEach((id) => result.push(defaultWidget(id)));
    return result;
  }

  /** 個人用カスタムナビ項目を検証・補完する（不正な項目は除外、IDが無ければ発行、最大件数で切り詰め） */
  export function sanitizeCustomNavItems(input: unknown): CustomNavItem[] {
    if (!Array.isArray(input)) {
      return [];
    }
    const result: CustomNavItem[] = [];
    input.forEach((raw) => {
      if (result.length >= MAX_CUSTOM_NAV_ITEMS || !raw || typeof raw !== "object") {
        return;
      }
      const item = raw as Partial<CustomNavItem>;
      const label = typeof item.label === "string" ? item.label.trim() : "";
      const url = typeof item.url === "string" ? item.url.trim() : "";
      if (!label || !AppLedger.isValidHttpUrl(url)) {
        return;
      }
      const id = typeof item.id === "string" && item.id ? item.id : Utilities.getUuid();
      result.push({ id: id, label: label, url: url });
    });
    return result;
  }

  export function sanitize(input: Partial<UserSettings>): UserSettings {
    const widgets = sanitizeWidgets(input.widgets);
    const mailCountRaw = typeof input.mailCount === "number" ? input.mailCount : DEFAULT_SETTINGS.mailCount;
    const mailCount = Math.min(20, Math.max(1, Math.floor(mailCountRaw)));

    const validThemeChoices = Theme.PALETTE_11.map((c) => c.name).concat([Theme.RANDOM_CHOICE_ID]);
    const themeChoice =
      typeof input.themeChoice === "string" && validThemeChoices.indexOf(input.themeChoice) !== -1
        ? input.themeChoice
        : DEFAULT_SETTINGS.themeChoice;

    const customNavItems = sanitizeCustomNavItems(input.customNavItems);

    return {
      widgets: widgets,
      mailCount: mailCount,
      themeChoice: themeChoice,
      customNavItems: customNavItems,
    };
  }

  function cloneDefaults(): UserSettings {
    return {
      widgets: DEFAULT_WIDGETS.map((w) => ({ id: w.id, column: w.column, size: w.size, visible: w.visible })),
      mailCount: DEFAULT_SETTINGS.mailCount,
      themeChoice: DEFAULT_SETTINGS.themeChoice,
      customNavItems: [],
    };
  }
}
