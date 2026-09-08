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
  /** 毎日メールで通知するかどうか（今日の予定・期限が近い/期限切れのToDo） */
  notifyEnabled: boolean;
  /** 通知メールを送る時刻（0〜23時、スクリプトのタイムゾーン基準） */
  notifyHour: number;
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
  /** この予定が繰り返し予定(シリーズ)の1回かどうか。単発予定は常にfalse */
  isRecurring: boolean;
}

/** 繰り返し予定の頻度。"none"は単発（繰り返さない）を表す */
type RecurrenceFrequency = "none" | "daily" | "weekly" | "monthly" | "yearly";

/** 繰り返しの終了条件 */
type RecurrenceEndType = "never" | "count" | "until";

/**
 * 繰り返し予定のルール。予定の新規作成時にのみ指定できる（作成後のルール変更＝繰り返し間隔や
 * 終了条件の変更は本アプリでは非対応。Google Calendar自体は対応しているが、シリーズの
 * 作り直しが必要になり編集フローが複雑化するため、企画のスコープでは見送っている）。
 */
interface EventRecurrenceRule {
  frequency: RecurrenceFrequency;
  /** 何回ごとに繰り返すか（1〜99） */
  interval: number;
  endType: RecurrenceEndType;
  /** endType==="count"のときの回数（1〜365） */
  count: number;
  /** endType==="until"のときの終了日(YYYY-MM-DD)。それ以外はnull */
  until: string | null;
}

/**
 * 繰り返し予定の編集・削除の適用範囲。単発予定では常に"single"と同じ扱いになる。
 * "series"は「このシリーズ全体（過去の回を含む）」を意味し、Google Calendar UIにある
 * 「今後の予定」（このシリーズを分割して以降の回だけ変更する）は、Calendar Serviceの
 * API制約により本アプリでは提供していない。
 */
type EventEditScope = "single" | "series";

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

/** メール本文中の添付ファイル1件分のメタ情報。idは"<メッセージ番号>:<添付番号>"形式の参照キー */
interface MailAttachmentItem {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
}

/** 添付ファイルの実データ（Base64）。プレビュー/ダウンロード時にのみ都度取得する */
interface MailAttachmentData {
  name: string;
  contentType: string;
  base64: string;
}

interface MailBody {
  threadId: string;
  from: string;
  to: string;
  date: string; // ISO8601
  subject: string;
  bodyPlain: string;
  attachments: MailAttachmentItem[];
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

/** 共有ドライブ1件分の情報。クライアント側では空文字IDを「マイドライブ」として扱う */
interface DriveInfo {
  id: string;
  name: string;
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
