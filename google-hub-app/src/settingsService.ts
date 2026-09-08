/**
 * 個人設定・全体設定・日付ユーティリティをまとめたファイル。
 * 以前は services/userSettingsService.ts / globalSettingsService.ts / dateUtils.ts に
 * 分かれていたが、ファイル数を抑えるためこの1ファイルに集約している。
 */

/**
 * 5.2 ホーム画面のカスタマイズ機能
 * ウィジェット（カレンダー/今日の予定/メール/アプリリンク集/ToDoリスト）の配置・サイズ・表示可否、
 * メール表示件数、テーマ選択を PropertiesService(User) に保存する。
 */
namespace UserSettingsService {
  const PROPERTY_KEY = "USER_SETTINGS";

  const ALL_WIDGET_IDS: WidgetId[] = ["calendar", "today", "mail", "links", "todo"];
  const VALID_COLUMNS: WidgetColumn[] = ["main", "side"];
  const VALID_SIZES: WidgetSize[] = ["small", "medium", "large"];

  const DEFAULT_WIDGETS: WidgetConfig[] = [
    { id: "calendar", column: "main", size: "large", visible: true },
    { id: "today", column: "side", size: "small", visible: true },
    { id: "mail", column: "side", size: "medium", visible: true },
    { id: "links", column: "side", size: "medium", visible: true },
    { id: "todo", column: "side", size: "small", visible: true },
  ];

  // カスタムナビ項目に選べるアイコンの候補（Assets.html内の<symbol id="icon-XXX">のXXX部分）。
  // クライアント側(JavaScript.htmlのNAV_ICON_CHOICES)にも同じ一覧を静的に持たせており、
  // アイコン選択のためだけにサーバー往復を発生させないようにしている。
  const VALID_NAV_ICONS = [
    "link", "home", "folder", "mail", "bell", "check",
    "flag", "tag", "archive", "hub", "share", "grid",
  ];
  const DEFAULT_NAV_ICON = "link";

  const MAX_CUSTOM_NAV_ITEMS = 12;
  const MAX_PINNED_FOLDERS = 20;
  const VALID_DRIVE_VIEW_MODES: DriveViewMode[] = ["list", "grid"];
  const VALID_CALENDAR_VIEW_MODES: CalendarViewMode[] = ["month", "week", "day"];
  const VALID_DARK_MODES: DarkMode[] = ["system", "light", "dark"];

  const DEFAULT_SETTINGS: UserSettings = {
    widgets: DEFAULT_WIDGETS,
    mailCount: 5,
    themeChoice: Theme.RANDOM_CHOICE_ID,
    customNavItems: [],
    driveViewMode: "list",
    pinnedFolders: [],
    calendarViewMode: "month",
    darkMode: "system",
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
      driveViewMode: settings.driveViewMode !== undefined ? settings.driveViewMode : current.driveViewMode,
      pinnedFolders: settings.pinnedFolders !== undefined ? settings.pinnedFolders : current.pinnedFolders,
      calendarViewMode: settings.calendarViewMode !== undefined ? settings.calendarViewMode : current.calendarViewMode,
      darkMode: settings.darkMode !== undefined ? settings.darkMode : current.darkMode,
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
      const icon = typeof item.icon === "string" && VALID_NAV_ICONS.indexOf(item.icon) !== -1 ? item.icon : DEFAULT_NAV_ICON;
      result.push({ id: id, label: label, url: url, icon: icon });
    });
    return result;
  }

  /** ピン留めフォルダを検証・補完する（不正な項目は除外、最大件数で切り詰め） */
  export function sanitizePinnedFolders(input: unknown): PinnedFolder[] {
    if (!Array.isArray(input)) {
      return [];
    }
    const result: PinnedFolder[] = [];
    const seen: { [key: string]: boolean } = {};
    input.forEach((raw) => {
      if (result.length >= MAX_PINNED_FOLDERS || !raw || typeof raw !== "object") {
        return;
      }
      const item = raw as Partial<PinnedFolder>;
      const id = typeof item.id === "string" ? item.id.trim() : "";
      const name = typeof item.name === "string" ? item.name.trim() : "";
      if (!id || !name || seen[id]) {
        return;
      }
      seen[id] = true;
      result.push({ id: id, name: name });
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
    const pinnedFolders = sanitizePinnedFolders(input.pinnedFolders);

    const driveViewMode =
      typeof input.driveViewMode === "string" && VALID_DRIVE_VIEW_MODES.indexOf(input.driveViewMode as DriveViewMode) !== -1
        ? (input.driveViewMode as DriveViewMode)
        : DEFAULT_SETTINGS.driveViewMode;

    const calendarViewMode =
      typeof input.calendarViewMode === "string" &&
      VALID_CALENDAR_VIEW_MODES.indexOf(input.calendarViewMode as CalendarViewMode) !== -1
        ? (input.calendarViewMode as CalendarViewMode)
        : DEFAULT_SETTINGS.calendarViewMode;

    const darkMode =
      typeof input.darkMode === "string" && VALID_DARK_MODES.indexOf(input.darkMode as DarkMode) !== -1
        ? (input.darkMode as DarkMode)
        : DEFAULT_SETTINGS.darkMode;

    return {
      widgets: widgets,
      mailCount: mailCount,
      themeChoice: themeChoice,
      customNavItems: customNavItems,
      driveViewMode: driveViewMode,
      pinnedFolders: pinnedFolders,
      calendarViewMode: calendarViewMode,
      darkMode: darkMode,
    };
  }

  function cloneDefaults(): UserSettings {
    return {
      widgets: DEFAULT_WIDGETS.map((w) => ({ id: w.id, column: w.column, size: w.size, visible: w.visible })),
      mailCount: DEFAULT_SETTINGS.mailCount,
      themeChoice: DEFAULT_SETTINGS.themeChoice,
      customNavItems: [],
      driveViewMode: DEFAULT_SETTINGS.driveViewMode,
      pinnedFolders: [],
      calendarViewMode: DEFAULT_SETTINGS.calendarViewMode,
      darkMode: DEFAULT_SETTINGS.darkMode,
    };
  }
}

/**
 * 5.3 アプリ全域のデータ設定
 * 同期対象カレンダー・メール取得ラベル・通知ON/OFFなど、全ユーザー共通の設定。
 * スプレッドシート台帳が使えない/未初期化のケースに備え、
 * スクリプトプロパティ（PropertiesService.getScriptProperties）を正とする。
 */
namespace GlobalSettingsService {
  const PROPERTY_KEY = "GLOBAL_SETTINGS";

  const DEFAULT_SETTINGS: GlobalSettings = {
    notifyEnabled: true,
    notifyHour: 8,
  };

  function clampHour(value: unknown): number {
    const n = typeof value === "number" && !isNaN(value) ? Math.floor(value) : DEFAULT_SETTINGS.notifyHour;
    return Math.max(0, Math.min(23, n));
  }

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
    const notifyEnabled =
      typeof input.notifyEnabled === "boolean" ? input.notifyEnabled : DEFAULT_SETTINGS.notifyEnabled;
    const notifyHour = clampHour(input.notifyHour);

    return {
      notifyEnabled: notifyEnabled,
      notifyHour: notifyHour,
    };
  }

  function cloneDefaults(): GlobalSettings {
    return {
      notifyEnabled: DEFAULT_SETTINGS.notifyEnabled,
      notifyHour: DEFAULT_SETTINGS.notifyHour,
    };
  }
}

/** ミニカレンダー表示用の日付計算ユーティリティ（外部サービス非依存の純粋関数） */
namespace DateUtils {
  export interface MonthRange {
    startIso: string;
    endIso: string;
  }

  /** 指定年月（month は 0=1月 ... 11=12月）の月初〜翌月初のISO範囲を返す */
  export function getMonthRange(year: number, month: number): MonthRange {
    const start = new Date(year, month, 1, 0, 0, 0, 0);
    const end = new Date(year, month + 1, 1, 0, 0, 0, 0);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }
}
