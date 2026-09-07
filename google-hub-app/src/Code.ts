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

/** 予定作成/編集モーダルの「予定の種類」選択肢 */
function listEventCategories(): EventCategory.Category[] {
  return EventCategory.CATEGORIES;
}

/** ヘッダー検索バー用: アプリ台帳とDriveを横断検索する */
function globalSearch(query: string): GlobalSearchResult {
  const trimmed = query.trim();
  if (!trimmed) {
    return { apps: [], files: [] };
  }
  const lower = trimmed.toLowerCase();
  const apps = AppLedger.listApps().filter((app) => app.name.toLowerCase().indexOf(lower) !== -1);
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

/** 指定月の各日の祝日名・六曜（簡易近似）をまとめて返す（ミニカレンダーの背景色/ラベル表示用） */
function getCalendarDayInfo(year: number, month: number): DayInfo[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const result: DayInfo[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    result.push({
      day: day,
      holidayName: JapaneseHoliday.nameFor(date),
      rokuyo: RokuyoService.forDate(date),
    });
  }
  return result;
}

// ---- Calendar ----

function createCalendarEvent(
  calendarId: string,
  title: string,
  startIso: string,
  endIso: string,
  allDay: boolean,
  guestsCsv: string,
  description: string,
  categoryColorId: string
): CalendarEventItem {
  return CalendarService.createEvent(
    calendarId,
    title,
    startIso,
    endIso,
    allDay,
    guestsCsv,
    description,
    categoryColorId
  );
}

function updateCalendarEvent(
  calendarId: string,
  eventId: string,
  title: string,
  startIso: string,
  endIso: string,
  guestsCsv: string,
  description: string,
  categoryColorId: string
): CalendarEventItem {
  return CalendarService.updateEvent(
    calendarId,
    eventId,
    title,
    startIso,
    endIso,
    guestsCsv,
    description,
    categoryColorId
  );
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

function renameDriveEntry(id: string, newName: string, isFolder: boolean): DriveFileItem {
  return DriveService.renameEntry(id, newName, isFolder);
}

function moveDriveFile(fileId: string, destinationFolderId: string): DriveFileItem {
  return DriveService.moveFile(fileId, destinationFolderId);
}

// ---- スクリプト/アプリ台帳 ----

function listApps(): AppLedgerEntry[] {
  return AppLedger.listApps();
}

/** リンクを貼り付けるだけで登録する（名称はリンク先ページの<title>から自動取得、編集機能はない） */
function addApp(url: string): AppLedgerEntry {
  return AppLedger.addApp(url);
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

// ---- Mail: 本文閲覧・新規作成 ----

function getMailBody(threadId: string): MailBody {
  return MailService.getBody(threadId);
}

/** メール一覧のみを再取得する軽量エンドポイント（更新ボタン用。ホーム全体の再読込より高速） */
function getRecentMails(): MailSubjectItem[] {
  const userSettings = UserSettingsService.getSettings();
  const globalSettings = GlobalSettingsService.getSettings();
  return MailService.getRecentSubjects(userSettings.mailCount, globalSettings.mailLabel);
}

function markMailRead(threadId: string): void {
  MailService.markRead(threadId);
}

function replyMail(threadId: string, body: string): void {
  MailService.reply(threadId, body);
}

function sendMail(to: string, subject: string, body: string): void {
  MailService.send(to, subject, body);
}
