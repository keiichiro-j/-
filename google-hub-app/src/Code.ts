/**
 * 7. システム構成 — HtmlServiceによるWebアプリのエントリポイント。
 * クライアント(google.script.run)から呼ばれるAPIは、この global scope の関数のみで構成する
 * （namespace内の関数は google.script.run から直接呼べないため）。
 */

function doGet(_e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.HTML.HtmlOutput {
  return HtmlService.createTemplateFromFile("html/Index")
    .evaluate()
    .setTitle("Google連携統合管理アプリ")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/** html/*.html 内から <?!= include('html/XXX'); ?> で他テンプレートを差し込むための共通ヘルパー */
function include(filename: string): string {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ---- ホーム画面初期データ ----

function getHomeData(): HomeData {
  const userSettings = UserSettingsService.getSettings();
  const globalSettings = GlobalSettingsService.getSettings();
  const now = new Date();
  const range = DateUtils.getMonthRange(now.getFullYear(), now.getMonth());

  const calendars = CalendarService.listCalendars();
  const events = CalendarService.getEvents(globalSettings.syncCalendarIds, range.startIso, range.endIso);
  const mails = MailService.getRecentSubjects(userSettings.mailCount, globalSettings.mailLabel);
  const apps = AppLedger.listApps();
  const theme = Theme.resolveTheme(userSettings.themeChoice);
  const currentUserEmail = getCurrentUserEmail();

  return { theme, userSettings, globalSettings, calendars, events, mails, apps, currentUserEmail };
}

function getCurrentUserEmail(): string {
  try {
    const email = Session.getActiveUser().getEmail();
    return email || "";
  } catch (e) {
    return "";
  }
}

/** 設定画面のテーマ選択肢（11色 + ランダムの合計12件） */
function listThemeChoices(): { id: string; name: string; hex: string | null }[] {
  return Theme.listChoices();
}

/** ヘッダー検索バー用: アプリ台帳とDriveを横断検索する */
function globalSearch(query: string): GlobalSearchResult {
  const trimmed = query.trim();
  if (!trimmed) {
    return { apps: [], files: [] };
  }
  const lower = trimmed.toLowerCase();
  const apps = AppLedger.listApps().filter(
    (app) => app.name.toLowerCase().indexOf(lower) !== -1 || app.description.toLowerCase().indexOf(lower) !== -1
  );
  const files = DriveService.searchFiles(trimmed, 10);
  return { apps, files };
}

// ---- 個人設定 / 全体設定 ----

function saveUserSettings(settings: Partial<UserSettings>): UserSettings {
  return UserSettingsService.saveSettings(settings);
}

function saveGlobalSettings(settings: Partial<GlobalSettings>): GlobalSettings {
  return GlobalSettingsService.saveSettings(settings);
}

function listCalendars(): CalendarInfo[] {
  return CalendarService.listCalendars();
}

function getCalendarEvents(calendarIds: string[], startIso: string, endIso: string): CalendarEventItem[] {
  return CalendarService.getEvents(calendarIds, startIso, endIso);
}

// ---- Calendar ----

function createCalendarEvent(
  calendarId: string,
  title: string,
  startIso: string,
  endIso: string,
  allDay: boolean,
  guestsCsv: string,
  description: string
): CalendarEventItem {
  return CalendarService.createEvent(calendarId, title, startIso, endIso, allDay, guestsCsv, description);
}

function updateCalendarEvent(
  calendarId: string,
  eventId: string,
  title: string,
  startIso: string,
  endIso: string,
  guestsCsv: string,
  description: string
): CalendarEventItem {
  return CalendarService.updateEvent(calendarId, eventId, title, startIso, endIso, guestsCsv, description);
}

function deleteCalendarEvent(calendarId: string, eventId: string): void {
  CalendarService.deleteEvent(calendarId, eventId);
}

// ---- Drive ----

function listDriveFiles(folderId: string | null, sortKey: DriveService.SortKey, ascending: boolean): DriveFileItem[] {
  return DriveService.listFiles(folderId, sortKey, ascending);
}

function searchDriveFiles(query: string): DriveFileItem[] {
  return DriveService.searchFiles(query);
}

function getDrivePreviewUrl(fileId: string): string {
  return DriveService.getPreviewUrl(fileId);
}

function updateDriveSharing(fileId: string, access: string, permission: string): DriveFileItem {
  return DriveService.updateSharing(fileId, access, permission);
}

function moveDriveFile(fileId: string, destinationFolderId: string): DriveFileItem {
  return DriveService.moveFile(fileId, destinationFolderId);
}

// ---- スクリプト/アプリ台帳 ----

function listApps(): AppLedgerEntry[] {
  return AppLedger.listApps();
}

function addApp(name: string, url: string, description: string): AppLedgerEntry {
  return AppLedger.addApp(name, url, description);
}

function updateApp(id: string, name: string, url: string, description: string): AppLedgerEntry {
  return AppLedger.updateApp(id, name, url, description);
}

function deleteApp(id: string): void {
  AppLedger.deleteApp(id);
}

function checkApp(id: string): AppLedgerEntry {
  return AppLedger.checkApp(id);
}

function checkAllApps(): AppLedgerEntry[] {
  return AppLedger.checkAllApps();
}
