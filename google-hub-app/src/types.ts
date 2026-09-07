/** アプリ全体で共有する型定義（グローバルスコープ／モジュール分割なし） */

/** ホーム画面に配置できるウィジェット（パーツ）の種類 */
type WidgetId = "calendar" | "today" | "mail" | "links";

/** ウィジェットの配置先。main=中央のメインエリア、side=右サイドバー */
type WidgetColumn = "main" | "side";

/** ウィジェットの大きさ（他ウィジェットとの高さ比率。小=1:中=2:大=3） */
type WidgetSize = "small" | "medium" | "large";

interface WidgetConfig {
  id: WidgetId;
  column: WidgetColumn;
  size: WidgetSize;
  visible: boolean;
}

interface ThemeColor {
  name: string;
  hex: string;
}

interface AppliedTheme {
  name: string;
  hex: string;
  textColor: "#1a1a1a" | "#ffffff";
}

interface UserSettings {
  /** ホーム画面のウィジェット配置・サイズ・表示可否。配列の並び順が各カラム内の表示順になる */
  widgets: WidgetConfig[];
  mailCount: number;
  /** テーマ配色パレット(Theme.PALETTE_11)のいずれかの name、または "random" */
  themeChoice: string;
}

interface GlobalSettings {
  syncCalendarIds: string[];
  mailLabel: string;
  notifyEnabled: boolean;
}

interface CalendarEventItem {
  id: string;
  calendarId: string;
  title: string;
  start: string; // ISO8601
  end: string; // ISO8601
  allDay: boolean;
  guests: string[];
  /** 予定の種類（EventCategory.CATEGORIES の id = Calendarの colorId）。未設定は空文字 */
  categoryColorId: string;
}

interface CalendarInfo {
  id: string;
  name: string;
}

interface MailSubjectItem {
  threadId: string;
  subject: string;
  from: string;
  date: string; // ISO8601
  isUnread: boolean;
}

interface MailBody {
  threadId: string;
  from: string;
  to: string;
  date: string; // ISO8601
  subject: string;
  bodyPlain: string;
}

interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  iconUrl: string;
  thumbnailUrl: string;
  url: string;
  lastUpdated: string; // ISO8601
  sizeBytes: number;
  isFolder: boolean;
  sharingAccess: string;
}

type AppStatus = "ok" | "error" | "unknown";

interface AppLedgerEntry {
  id: string;
  /** リンク先ページの <title> から自動取得した名称（手動編集は不可） */
  name: string;
  url: string;
  addedAt: string; // ISO8601
  lastCheckedAt: string | null; // ISO8601
  status: AppStatus;
}

interface GlobalSearchResult {
  apps: AppLedgerEntry[];
  files: DriveFileItem[];
}

interface HomeData {
  theme: AppliedTheme;
  userSettings: UserSettings;
  globalSettings: GlobalSettings;
  calendars: CalendarInfo[];
  events: CalendarEventItem[];
  mails: MailSubjectItem[];
  apps: AppLedgerEntry[];
  currentUserEmail: string;
}
