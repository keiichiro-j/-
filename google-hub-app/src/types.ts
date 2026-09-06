/** アプリ全体で共有する型定義（グローバルスコープ／モジュール分割なし） */

type CardId = "calendar" | "mail" | "links";

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
  cardOrder: CardId[];
  mailCount: number;
  visibleCards: CardId[];
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
  name: string;
  url: string;
  description: string;
  updatedAt: string; // ISO8601
  lastCheckedAt: string | null; // ISO8601
  status: AppStatus;
}

interface HomeData {
  theme: AppliedTheme;
  userSettings: UserSettings;
  globalSettings: GlobalSettings;
  calendars: CalendarInfo[];
  events: CalendarEventItem[];
  mails: MailSubjectItem[];
  apps: AppLedgerEntry[];
}
