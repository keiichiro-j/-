/** アプリ全体で共有する型定義（グローバルスコープ／モジュール分割なし） */

/** ホーム画面に配置できるウィジェット（パーツ）の種類 */
type WidgetId = "calendar" | "today" | "mail" | "links" | "todo";

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

/** 個人がコントロールパネルに自由に追加できるカスタムショートカット（タップで指定URLへ移動） */
interface CustomNavItem {
  id: string;
  label: string;
  url: string;
}

/** ToDoの優先度 */
type TodoPriority = "low" | "medium" | "high";

/** ToDoリストの1項目 */
interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: string; // ISO8601
  /** 期限日（YYYY-MM-DD）。未設定は null */
  dueDate: string | null;
  priority: TodoPriority;
}

/** Driveのファイル一覧の表示形式 */
type DriveViewMode = "list" | "grid";

/** カレンダーの表示形式 */
type CalendarViewMode = "month" | "week" | "day";

/** 表示モード（配色）。system=OS/ブラウザの設定に追従 */
type DarkMode = "system" | "light" | "dark";

/** よく使うフォルダのピン留め */
interface PinnedFolder {
  id: string;
  name: string;
}

/** ミニカレンダーの日付セル1つ分の付加情報（祝日名・六曜） */
interface DayInfo {
  day: number;
  /** 祝日名。祝日でなければ null */
  holidayName: string | null;
  /** 六曜（簡易近似）。先勝/友引/先負/仏滅/大安/赤口 のいずれか */
  rokuyo: string;
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
  /** 個人用カスタムナビ項目（コントロールパネルにボタンとして追加表示） */
  customNavItems: CustomNavItem[];
  /** Driveタブの一覧表示形式（リスト/グリッド）。切替時に自動保存される */
  driveViewMode: DriveViewMode;
  /** よく使うフォルダのピン留め（Driveタブ上部にショートカット表示） */
  pinnedFolders: PinnedFolder[];
  /** カレンダーの表示形式（月/週/日）。切替時に自動保存される */
  calendarViewMode: CalendarViewMode;
  /** 表示モード（配色）。切替時に自動保存・即時反映される */
  darkMode: DarkMode;
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
  /** 分類用のタグ（自由記述、登録後に追加・編集可能） */
  tags: string[];
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
  todos: TodoItem[];
  currentUserEmail: string;
}
