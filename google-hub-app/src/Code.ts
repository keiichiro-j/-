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

  // 当月の予定(events)はここでは取得しない。呼び出し側(JavaScript.htmlのloadHome())が
  // 直後に必ずloadCalendarForCurrentMode()/loadTodayEvents()で改めてCalendarEventsを取得して
  // ミニカレンダー・今日の予定を描画するため、ここで取得しても使われない
  // (以前はここでも取得しており、Calendar APIの往復とレスポンスサイズが無駄になっていた)。
  const calendars = CalendarService.listCalendars();
  const mails = MailService.getRecentSubjects(userSettings.mailCount);
  const apps = AppLedger.listApps();
  const todos = TodoService.list();
  const theme = Theme.resolveTheme(userSettings.themeChoice);
  const currentUserEmail = getCurrentUserEmail();

  return { theme, userSettings, globalSettings, calendars, mails, apps, todos, currentUserEmail };
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

/** ヘッダー検索バー用: アプリ台帳・Drive・予定・ToDo・メールを横断検索する */
function globalSearch(query: string): GlobalSearchResult {
  const trimmed = query.trim();
  if (!trimmed) {
    return { apps: [], files: [], events: [], todos: [], mails: [] };
  }
  const lower = trimmed.toLowerCase();
  const apps = AppLedger.listApps().filter((app) => app.name.toLowerCase().indexOf(lower) !== -1);
  const files = DriveService.searchFiles(trimmed, "", 10);
  const events = CalendarService.searchEvents(trimmed, 10);
  const todos = TodoService.list()
    .filter((t) => t.text.toLowerCase().indexOf(lower) !== -1)
    .slice(0, 10);
  const mails = MailService.searchMails(trimmed).slice(0, 10);
  return { apps, files, events, todos, mails };
}

// ---- 個人設定 / 全体設定 ----

function saveUserSettings(settings: Partial<UserSettings>): UserSettings {
  return UserSettingsService.saveSettings(settings);
}

/**
 * テーマ配色スウォッチのクリック専用の軽量エンドポイント。saveUserSettings()に任せると
 * 呼び出し側はホーム全体(getHomeData()相当のCalendar/Gmail/Sheets往復)を再取得しないと
 * 反映後のテーマ(hex/textColor)を得られず、配色を変えるだけの操作にしては重すぎるため、
 * 保存と同時にThemeService側で解決済みのAppliedThemeを直接返す。
 */
function saveThemeChoice(themeChoice: string): AppliedTheme {
  UserSettingsService.saveSettings({ themeChoice: themeChoice });
  return Theme.resolveTheme(themeChoice);
}

function saveGlobalSettings(settings: Partial<GlobalSettings>): GlobalSettings {
  const saved = GlobalSettingsService.saveSettings(settings);
  NotificationService.syncTrigger(saved);
  return saved;
}

/** 通知の時限トリガーから呼ばれるハンドラ本体（google.script.runからは呼ばない） */
function runDailyNotification(): void {
  NotificationService.sendDailyDigest();
}

/** 設定画面の「テスト通知を送信」ボタン用。notifyEnabledの状態に関わらず必ず送信する */
function sendTestNotification(): void {
  NotificationService.sendDailyDigest(true);
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
  categoryColorId: string,
  recurrenceRule?: Partial<EventRecurrenceRule> | null
): CalendarEventItem {
  return CalendarService.createEvent(
    calendarId,
    title,
    startIso,
    endIso,
    allDay,
    guestsCsv,
    description,
    categoryColorId,
    recurrenceRule
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
  categoryColorId: string,
  scope?: EventEditScope
): CalendarEventItem {
  return CalendarService.updateEvent(
    calendarId,
    eventId,
    title,
    startIso,
    endIso,
    guestsCsv,
    description,
    categoryColorId,
    scope
  );
}

function deleteCalendarEvent(calendarId: string, eventId: string, scope?: EventEditScope): void {
  CalendarService.deleteEvent(calendarId, eventId, scope);
}

/** 月表示カレンダーでのドラッグ&ドロップによる日付変更（時刻のみ更新、他の項目は変更しない） */
function moveCalendarEventDate(
  calendarId: string,
  eventId: string,
  newStartIso: string,
  newEndIso: string
): CalendarEventItem {
  return CalendarService.moveEventDate(calendarId, eventId, newStartIso, newEndIso);
}

// ---- Drive ----

function listDriveFiles(
  folderId: string | null,
  driveId: string,
  sortKey: DriveService.SortKey,
  ascending: boolean
): DriveFileItem[] {
  return DriveService.listFiles(folderId, driveId, sortKey, ascending);
}

function searchDriveFiles(query: string, driveId: string): DriveFileItem[] {
  return DriveService.searchFiles(query, driveId);
}

/** 共有ドライブの一覧（Driveタブのドライブ切替セレクタ用） */
function listSharedDrives(): DriveInfo[] {
  return DriveService.listSharedDrives();
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

/** ドラッグ&ドロップ／ファイル選択でのアップロード用。base64Dataはdata:URLのカンマ以降のみを渡す */
function uploadDriveFile(
  folderId: string | null,
  driveId: string,
  fileName: string,
  mimeType: string,
  base64Data: string
): DriveFileItem {
  return DriveService.uploadFile(folderId, driveId, fileName, mimeType, base64Data);
}

/** 新規フォルダ・新規ドキュメント/スプレッドシート/スライドの作成。kindは"folder"|"document"|"spreadsheet"|"presentation" */
function createDriveEntry(folderId: string | null, driveId: string, name: string, kind: string): DriveFileItem {
  return DriveService.createEntry(folderId, driveId, name, kind);
}

function trashDriveFile(fileId: string): void {
  DriveService.trashFile(fileId);
}

/** Driveタブの複数選択操作: まとめて移動する */
function bulkMoveDriveFiles(fileIds: string[], destinationFolderId: string): DriveBulkResult {
  return DriveService.bulkMoveFiles(fileIds, destinationFolderId);
}

/** Driveタブの複数選択操作: まとめて共有設定を変更する */
function bulkUpdateDriveSharing(fileIds: string[], access: string, permission: string): DriveBulkResult {
  return DriveService.bulkUpdateSharing(fileIds, access, permission);
}

/** Driveタブの複数選択操作: まとめてゴミ箱へ移動する */
function bulkTrashDriveFiles(fileIds: string[]): DriveBulkDeleteResult {
  return DriveService.bulkTrashFiles(fileIds);
}

// ---- スクリプト/アプリ台帳 ----

function listApps(): AppLedgerEntry[] {
  return AppLedger.listApps();
}

/** リンクを登録する。nameを指定すればその名称を、省略時はリンク先ページの<title>を自動取得する（後から変更も可） */
function addApp(url: string, name?: string): AppLedgerEntry {
  return AppLedger.addApp(url, name);
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

/** 登録名称の変更（自動取得された<title>が実態と異なる/わかりにくい場合の手動上書き用） */
function updateAppName(id: string, name: string): AppLedgerEntry {
  return AppLedger.updateAppName(id, name);
}

/** アプリリンク集タブでのドラッグ&ドロップによる並び替え。orderedIdsは新しい表示順のID一覧 */
function reorderApps(orderedIds: string[]): AppLedgerEntry[] {
  return AppLedger.reorderApps(orderedIds);
}

// ---- Mail: 本文閲覧・新規作成 ----

function getMailBody(threadId: string): MailBody {
  return MailService.getBody(threadId);
}

/**
 * メール一覧のみを再取得する軽量エンドポイント（更新ボタン用。ホーム全体の再読込より高速）。
 * folderを指定すると、既定の受信トレイの代わりにGmailの迷惑メール(spam)・ゴミ箱(trash)
 * フォルダを直接見る。メールタブのフォルダ切替専用で、ホーム画面のメールウィジェットは
 * 常に既定(受信トレイ)のまま。
 */
function getRecentMails(folder?: string): MailSubjectItem[] {
  const userSettings = UserSettingsService.getSettings();
  return MailService.getRecentSubjects(userSettings.mailCount, folder);
}

/** メールタブの検索欄用。folderの範囲内でGmail検索構文（差出人・キーワード等）がそのまま使える */
function searchMail(query: string, folder?: string): MailSubjectItem[] {
  return MailService.searchMails(query, folder);
}

/** 添付ファイルの実データ(Base64)を取得する。プレビュー・ダウンロード時に都度呼ぶ軽量API */
function getMailAttachmentData(threadId: string, attachmentId: string): MailAttachmentData {
  return MailService.getAttachmentData(threadId, attachmentId);
}

/** 添付ファイルをマイドライブ直下へ保存する（ブラウザで直接プレビューできない種類向けの代替手段） */
function saveMailAttachmentToDrive(threadId: string, attachmentId: string): DriveFileItem {
  return MailService.saveAttachmentToDrive(threadId, attachmentId);
}

function markMailRead(threadId: string): void {
  MailService.markRead(threadId);
}

/** メールタブでの複数選択操作: まとめて既読にする */
function markMailReadBulk(threadIds: string[]): void {
  MailService.markReadBulk(threadIds);
}

/** メールタブでの複数選択操作: まとめてアーカイブする */
function archiveMailBulk(threadIds: string[]): void {
  MailService.archiveBulk(threadIds);
}

function replyMail(threadId: string, body: string): void {
  MailService.reply(threadId, body);
}

function sendMail(to: string, subject: string, body: string): void {
  MailService.send(to, subject, body);
}

// ---- ToDoリスト ----

function listTodos(): TodoItem[] {
  return TodoService.list();
}

function addTodo(text: string, dueDate: string | null, priority: string): TodoItem[] {
  return TodoService.add(text, dueDate, priority);
}

function toggleTodo(id: string): TodoItem[] {
  return TodoService.toggle(id);
}

function deleteTodo(id: string): TodoItem[] {
  return TodoService.remove(id);
}

function clearDoneTodos(): TodoItem[] {
  return TodoService.clearDone();
}
