/**
 * Google純正サービス(Calendar/Gmail/Drive)へのアクセスと、自社アプリ台帳・ToDoリストといった
 * 「タブ単位の機能」をまとめたファイル。以前は services/calendarService.ts のように
 * 1機能=1ファイルへ分割していたが、ファイル数を抑えるため主要5機能をこの1ファイルに集約している
 * （設定系は settingsService.ts 側にまとめている）。
 */

/**
 * 4. Calendar機能
 * 予定の作成・編集・削除／ゲスト招待、複数カレンダー統合表示。
 */
namespace CalendarService {
  /** "a@example.com, b@example.com" のようなCSV文字列を整形済みメール配列に変換する（純粋関数） */
  export function parseGuestsCsv(csv: string): string[] {
    if (!csv) {
      return [];
    }
    const seen: { [key: string]: boolean } = {};
    const result: string[] = [];
    csv.split(",").forEach((raw) => {
      const email = raw.trim();
      if (email.length > 0 && !seen[email]) {
        seen[email] = true;
        result.push(email);
      }
    });
    return result;
  }

  export function listCalendars(): CalendarInfo[] {
    return CalendarApp.getAllCalendars().map((cal) => ({
      id: cal.getId(),
      name: cal.getName(),
    }));
  }

  function resolveCalendar(calendarId: string): GoogleAppsScript.Calendar.Calendar {
    if (calendarId === "primary") {
      return CalendarApp.getDefaultCalendar();
    }
    return CalendarApp.getCalendarById(calendarId);
  }

  function toItem(calendarId: string, event: GoogleAppsScript.Calendar.CalendarEvent): CalendarEventItem {
    return {
      id: event.getId(),
      calendarId: calendarId,
      title: event.getTitle(),
      start: event.getStartTime().toISOString(),
      end: event.getEndTime().toISOString(),
      allDay: event.isAllDayEvent(),
      guests: event.getGuestList().map((g) => g.getEmail()),
      categoryColorId: event.getColor() || "",
    };
  }

  /** 予定の種類(カテゴリ)をCalendarのイベントカラーとして設定する。空文字は「未設定」として何もしない */
  function applyCategoryColor(event: GoogleAppsScript.Calendar.CalendarEvent, categoryColorId: string): void {
    if (!categoryColorId) {
      return;
    }
    event.setColor(categoryColorId);
  }

  /** 複数カレンダーの予定を期間指定でまとめて取得し、開始時刻順に整列する */
  export function getEvents(calendarIds: string[], startIso: string, endIso: string): CalendarEventItem[] {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const items: CalendarEventItem[] = [];
    calendarIds.forEach((calendarId) => {
      const calendar = resolveCalendar(calendarId);
      if (!calendar) {
        return;
      }
      calendar.getEvents(start, end).forEach((event) => {
        items.push(toItem(calendarId, event));
      });
    });
    return items.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  }

  export function createEvent(
    calendarId: string,
    title: string,
    startIso: string,
    endIso: string,
    allDay: boolean,
    guestsCsv: string,
    description: string,
    categoryColorId: string
  ): CalendarEventItem {
    const calendar = resolveCalendar(calendarId);
    const guests = parseGuestsCsv(guestsCsv);
    const options: { [key: string]: any } = { description: description };
    if (guests.length > 0) {
      options.guests = guests.join(",");
    }

    let event: GoogleAppsScript.Calendar.CalendarEvent;
    if (allDay) {
      event = calendar.createAllDayEvent(title, new Date(startIso), options);
    } else {
      event = calendar.createEvent(title, new Date(startIso), new Date(endIso), options);
    }
    applyCategoryColor(event, categoryColorId);
    return toItem(calendarId, event);
  }

  export function updateEvent(
    calendarId: string,
    eventId: string,
    title: string,
    startIso: string,
    endIso: string,
    guestsCsv: string,
    description: string,
    categoryColorId: string
  ): CalendarEventItem {
    const calendar = resolveCalendar(calendarId);
    const event = calendar.getEventById(eventId);
    if (!event) {
      throw new Error("予定が見つかりません: " + eventId);
    }
    event.setTitle(title);
    if (!event.isAllDayEvent()) {
      event.setTime(new Date(startIso), new Date(endIso));
    }
    event.setDescription(description);
    applyCategoryColor(event, categoryColorId);

    const desiredGuests = parseGuestsCsv(guestsCsv);
    const currentGuests = event.getGuestList().map((g) => g.getEmail());
    desiredGuests
      .filter((email) => currentGuests.indexOf(email) === -1)
      .forEach((email) => event.addGuest(email));
    currentGuests
      .filter((email) => desiredGuests.indexOf(email) === -1)
      .forEach((email) => event.removeGuest(email));

    return toItem(calendarId, event);
  }

  export function deleteEvent(calendarId: string, eventId: string): void {
    const calendar = resolveCalendar(calendarId);
    const event = calendar.getEventById(eventId);
    if (event) {
      event.deleteEvent();
    }
  }
}

/**
 * 4. Mail機能
 * 受信メールの件名一覧確認（ホーム画面に直近N件を表示）／本文閲覧／既読化／返信／新規作成・送信。
 * 既読化・返信のため gmail.modify（読み書き）と、送信のみ gmail.send を使用する。
 */
namespace MailService {
  const MAX_COUNT = 20;

  /** UIから渡された件数を安全な範囲(1〜MAX_COUNT)に丸める（純粋関数） */
  export function clampCount(count: number): number {
    if (typeof count !== "number" || isNaN(count)) {
      return 5;
    }
    return Math.min(MAX_COUNT, Math.max(1, Math.floor(count)));
  }

  export function getRecentSubjects(count: number, label: string): MailSubjectItem[] {
    const safeCount = clampCount(count);
    const searchQuery = label && label !== "INBOX" ? "label:" + label : "in:inbox";
    const threads = GmailApp.search(searchQuery, 0, safeCount);

    return threads.map((thread) => {
      const lastMessage = thread.getMessages()[thread.getMessageCount() - 1];
      return {
        threadId: thread.getId(),
        subject: thread.getFirstMessageSubject(),
        from: lastMessage.getFrom(),
        date: lastMessage.getDate().toISOString(),
        isUnread: thread.isUnread(),
      };
    });
  }

  /** タップされたメールの本文を取得する（スレッド内最新メッセージ） */
  export function getBody(threadId: string): MailBody {
    const thread = GmailApp.getThreadById(threadId);
    if (!thread) {
      throw new Error("メールが見つかりません: " + threadId);
    }
    const messages = thread.getMessages();
    const lastMessage = messages[messages.length - 1];
    return {
      threadId: thread.getId(),
      from: lastMessage.getFrom(),
      to: lastMessage.getTo(),
      date: lastMessage.getDate().toISOString(),
      subject: thread.getFirstMessageSubject(),
      bodyPlain: lastMessage.getPlainBody(),
    };
  }

  /** タップして本文を開いたメールを既読にする（一覧の未読表示・件数バッジにも反映） */
  export function markRead(threadId: string): void {
    const thread = GmailApp.getThreadById(threadId);
    if (thread) {
      thread.markRead();
    }
  }

  /** メールタブでの複数選択操作: 選択したスレッドをまとめて既読にする */
  export function markReadBulk(threadIds: string[]): void {
    threadIds.forEach((threadId) => markRead(threadId));
  }

  /** メールタブでの複数選択操作: 選択したスレッドをまとめてアーカイブする（受信トレイから外す） */
  export function archiveBulk(threadIds: string[]): void {
    threadIds.forEach((threadId) => {
      const thread = GmailApp.getThreadById(threadId);
      if (thread) {
        thread.moveToArchive();
      }
    });
  }

  /** 開いているスレッドへの返信（宛先・件名(Re:)はGmailThread.reply()が自動的に設定する） */
  export function reply(threadId: string, body: string): void {
    const thread = GmailApp.getThreadById(threadId);
    if (!thread) {
      throw new Error("メールが見つかりません: " + threadId);
    }
    if (!body || !body.trim()) {
      throw new Error("返信内容を入力してください");
    }
    thread.reply(body);
  }

  /** メールタブからの新規メール作成・送信 */
  export function send(to: string, subject: string, body: string): void {
    if (!to || !to.trim()) {
      throw new Error("宛先を入力してください");
    }
    GmailApp.sendEmail(to.trim(), subject, body);
  }
}

/**
 * 4. Drive機能
 * ファイル/フォルダの一覧・検索・並び替え・プレビュー・共有設定変更・移動。
 * Advanced Drive Service は使わず、DriveApp のみで完結させる（有効化不要・スコープ最小化）。
 */
namespace DriveService {
  export type SortKey = "name" | "updated" | "size";

  const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

  /** Google純正の「third-party icon」規則に沿ったアイコンURLを組み立てる（API呼び出し不要の純粋関数） */
  export function iconUrlForMimeType(mimeType: string, isFolder: boolean): string {
    if (isFolder) {
      return "https://drive-thirdparty.googleusercontent.com/16/type/application/vnd.google-apps.folder";
    }
    return "https://drive-thirdparty.googleusercontent.com/16/type/" + encodeURIComponent(mimeType);
  }

  interface DriveEntryLike {
    getId(): string;
    getName(): string;
    getUrl(): string;
    getLastUpdated(): GoogleAppsScript.Base.Date;
    getSize(): number;
  }

  /**
   * 一覧表示では entry.getSharingAccess() を呼ばない（呼ぶとファイル/フォルダ1件ごとに
   * 追加のDrive API往復が発生し、一覧の読み込みが件数に比例して遅くなるため）。
   * 現状のUIは一覧上でsharingAccessを表示していないため、常に"UNKNOWN"を返す。
   * 個別ファイルの共有状態が必要になった場合は、そのファイルに対してのみ取得すること。
   *
   * サムネイルは Advanced Drive Service（要有効化）を使わず、閲覧者が対象ファイルに
   * アクセス権を持つ場合にブラウザのGoogleセッションで直接読み込める
   * "https://drive.google.com/thumbnail?id=..." のURLパターンをそのまま組み立てて返す。
   * サムネイルが生成されていないファイル種別ではその画像取得自体が失敗するため、
   * クライアント側でmimeTypeアイコンへフォールバックする前提。
   */
  function toItem(entry: DriveEntryLike, mimeType: string, isFolder: boolean): DriveFileItem {
    return {
      id: entry.getId(),
      name: entry.getName(),
      mimeType: mimeType,
      iconUrl: iconUrlForMimeType(mimeType, isFolder),
      thumbnailUrl: isFolder ? "" : "https://drive.google.com/thumbnail?id=" + entry.getId() + "&sz=w200",
      url: entry.getUrl(),
      lastUpdated: entry.getLastUpdated().toISOString(),
      sizeBytes: isFolder ? 0 : entry.getSize(),
      isFolder: isFolder,
      sharingAccess: "UNKNOWN",
    };
  }

  function fileToItem(file: GoogleAppsScript.Drive.File): DriveFileItem {
    return toItem(file, file.getMimeType(), false);
  }

  function folderToItem(folder: GoogleAppsScript.Drive.Folder): DriveFileItem {
    return toItem(folder, FOLDER_MIME_TYPE, true);
  }

  export function sortItems(items: DriveFileItem[], sortKey: SortKey, ascending: boolean): DriveFileItem[] {
    const sorted = items.slice().sort((a, b) => {
      let compared = 0;
      if (sortKey === "name") {
        compared = a.name.localeCompare(b.name, "ja");
      } else if (sortKey === "updated") {
        compared = a.lastUpdated < b.lastUpdated ? -1 : a.lastUpdated > b.lastUpdated ? 1 : 0;
      } else if (sortKey === "size") {
        compared = a.sizeBytes - b.sizeBytes;
      }
      return ascending ? compared : -compared;
    });
    return sorted;
  }

  /** フォルダ直下（未指定時はマイドライブ直下）の一覧。フォルダ優先で返す */
  export function listFiles(
    folderId: string | null,
    sortKey: SortKey = "updated",
    ascending: boolean = false,
    limit: number = 100
  ): DriveFileItem[] {
    const folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
    const items: DriveFileItem[] = [];

    const folderIterator = folder.getFolders();
    while (folderIterator.hasNext() && items.length < limit) {
      items.push(folderToItem(folderIterator.next()));
    }
    const fileIterator = folder.getFiles();
    while (fileIterator.hasNext() && items.length < limit) {
      items.push(fileToItem(fileIterator.next()));
    }
    return sortItems(items, sortKey, ascending);
  }

  export function searchFiles(query: string, limit: number = 50): DriveFileItem[] {
    const escaped = query.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const searchQuery = "title contains '" + escaped + "' and trashed = false";
    const iterator = DriveApp.searchFiles(searchQuery);
    const items: DriveFileItem[] = [];
    while (iterator.hasNext() && items.length < limit) {
      items.push(fileToItem(iterator.next()));
    }
    return items;
  }

  export function getPreviewUrl(fileId: string): string {
    const file = DriveApp.getFileById(fileId);
    return "https://drive.google.com/file/d/" + file.getId() + "/preview";
  }

  const ACCESS_MAP: { [key: string]: GoogleAppsScript.Drive.Access } = {
    ANYONE: DriveApp.Access.ANYONE,
    ANYONE_WITH_LINK: DriveApp.Access.ANYONE_WITH_LINK,
    DOMAIN: DriveApp.Access.DOMAIN,
    DOMAIN_WITH_LINK: DriveApp.Access.DOMAIN_WITH_LINK,
    PRIVATE: DriveApp.Access.PRIVATE,
  };

  const PERMISSION_MAP: { [key: string]: GoogleAppsScript.Drive.Permission } = {
    VIEW: DriveApp.Permission.VIEW,
    EDIT: DriveApp.Permission.EDIT,
    COMMENT: DriveApp.Permission.COMMENT,
    NONE: DriveApp.Permission.NONE,
  };

  export function updateSharing(fileId: string, access: string, permission: string): DriveFileItem {
    const file = DriveApp.getFileById(fileId);
    const accessEnum = ACCESS_MAP[access];
    const permissionEnum = PERMISSION_MAP[permission];
    if (!accessEnum || !permissionEnum) {
      throw new Error("不正な共有設定です: access=" + access + ", permission=" + permission);
    }
    file.setSharing(accessEnum, permissionEnum);
    return fileToItem(file);
  }

  export function renameEntry(id: string, newName: string, isFolder: boolean): DriveFileItem {
    const trimmed = newName.trim();
    if (!trimmed) {
      throw new Error("新しい名前を入力してください");
    }
    if (isFolder) {
      const folder = DriveApp.getFolderById(id);
      folder.setName(trimmed);
      return folderToItem(folder);
    }
    const file = DriveApp.getFileById(id);
    file.setName(trimmed);
    return fileToItem(file);
  }

  export function moveFile(fileId: string, destinationFolderId: string): DriveFileItem {
    const file = DriveApp.getFileById(fileId);
    const destination = DriveApp.getFolderById(destinationFolderId);
    const parents = file.getParents();
    while (parents.hasNext()) {
      const parent = parents.next();
      parent.removeFile(file);
    }
    destination.addFile(file);
    return fileToItem(file);
  }
}

/**
 * 4. スクリプト管理 / 11.2 自社アプリ台帳機能への応用
 * 自社GASアプリ等へのリンクをスプレッドシート台帳で管理する。
 * URLを貼り付けるだけで登録でき、名称はリンク先ページの<title>から自動取得する
 * （台帳の内容を後から書き換える「編集」機能は持たせない。誤登録は削除のみ可能）。
 * UrlFetchAppによる簡易死活監視（起動確認）も行う。
 */
namespace AppLedger {
  const LEDGER_ID_PROPERTY = "LEDGER_SPREADSHEET_ID";
  const SHEET_NAME = "Apps";
  const HEADERS = ["id", "name", "url", "addedAt", "lastCheckedAt", "status", "tags"];
  const MAX_TAGS = 10;

  /** HTTPステータスコードから稼働状況を判定する（純粋関数） */
  export function statusFromHttpCode(code: number): AppStatus {
    if (code >= 200 && code < 400) {
      return "ok";
    }
    return "error";
  }

  /** http/https のURLとして最低限妥当かを判定する（純粋関数） */
  export function isValidHttpUrl(url: string): boolean {
    return /^https?:\/\/.+/i.test(url.trim());
  }

  /** HTMLソースから<title>の中身を抜き出す（純粋関数）。見つからなければnull */
  export function extractTitle(html: string): string | null {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!match) {
      return null;
    }
    const decoded = match[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    return decoded.length > 0 ? decoded : null;
  }

  /** リンク先ページを取得し、<title>を名称として使う。取得できない場合はURLをそのまま名称にする */
  function resolveNameFromUrl(url: string): string {
    try {
      const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
      const title = extractTitle(response.getContentText());
      return title || url;
    } catch (e) {
      return url;
    }
  }

  function getOrCreateSpreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet {
    const props = PropertiesService.getScriptProperties();
    const existingId = props.getProperty(LEDGER_ID_PROPERTY);
    if (existingId) {
      try {
        return SpreadsheetApp.openById(existingId);
      } catch (e) {
        // 参照先が削除されている等の場合は作り直す
      }
    }
    const spreadsheet = SpreadsheetApp.create("GoogleHubApp_台帳");
    props.setProperty(LEDGER_ID_PROPERTY, spreadsheet.getId());
    return spreadsheet;
  }

  function getOrCreateSheet(): GoogleAppsScript.Spreadsheet.Sheet {
    const spreadsheet = getOrCreateSpreadsheet();
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = spreadsheet.getSheets()[0];
      sheet.setName(SHEET_NAME);
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
    } else if (String(sheet.getRange(1, HEADERS.length).getValue()) !== "tags") {
      // 既存の台帳（tags列導入前に作成されたシート）にはヘッダーだけ追記する。
      // データ列自体は listApps() 側で不足分を空文字として扱うため、後方互換のために必要な補正はこれだけでよい。
      sheet.getRange(1, HEADERS.length).setValue("tags");
    }
    return sheet;
  }

  function parseTags(value: string | number | boolean | Date | undefined): string[] {
    if (!value) {
      return [];
    }
    return String(value)
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .slice(0, MAX_TAGS);
  }

  function rowToEntry(row: (string | number | boolean | Date)[]): AppLedgerEntry {
    return {
      id: String(row[0]),
      name: String(row[1]),
      url: String(row[2]),
      addedAt: toIso(row[3]),
      lastCheckedAt: row[4] ? toIso(row[4]) : null,
      status: (row[5] as AppStatus) || "unknown",
      tags: parseTags(row[6]),
    };
  }

  function toIso(value: string | number | boolean | Date): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return String(value);
  }

  export function listApps(): AppLedgerEntry[] {
    const sheet = getOrCreateSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return [];
    }
    const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
    return values.filter((row) => row[0]).map(rowToEntry);
  }

  function findRowIndexById(sheet: GoogleAppsScript.Spreadsheet.Sheet, id: string): number {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return -1;
    }
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === id) {
        return i + 2; // 1-indexed + header row
      }
    }
    return -1;
  }

  /** URLを貼り付けるだけで登録する。名称はリンク先の<title>から自動取得する */
  export function addApp(url: string): AppLedgerEntry {
    const trimmedUrl = url.trim();
    if (!isValidHttpUrl(trimmedUrl)) {
      throw new Error("http:// または https:// で始まる正しいURLを入力してください");
    }
    const sheet = getOrCreateSheet();
    const id = Utilities.getUuid();
    const now = new Date().toISOString();
    const name = resolveNameFromUrl(trimmedUrl);
    sheet.appendRow([id, name, trimmedUrl, now, "", "unknown", ""]);
    return { id, name, url: trimmedUrl, addedAt: now, lastCheckedAt: null, status: "unknown", tags: [] };
  }

  export function deleteApp(id: string): void {
    const sheet = getOrCreateSheet();
    const rowIndex = findRowIndexById(sheet, id);
    if (rowIndex !== -1) {
      sheet.deleteRow(rowIndex);
    }
  }

  /** 分類用タグの追加・編集（名称やURLとは異なり、後から自由に付け替えられる） */
  export function updateAppTags(id: string, tags: string[]): AppLedgerEntry {
    const sheet = getOrCreateSheet();
    const rowIndex = findRowIndexById(sheet, id);
    if (rowIndex === -1) {
      throw new Error("台帳エントリが見つかりません: " + id);
    }
    const cleaned = Array.isArray(tags)
      ? tags.map((t) => String(t).trim()).filter((t) => t.length > 0).slice(0, MAX_TAGS)
      : [];
    sheet.getRange(rowIndex, 7).setValue(cleaned.join(", "));
    const row = sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0];
    return rowToEntry(row);
  }

  /** 対象アプリへ簡易ヘルスチェック(HTTPリクエスト)を行い、結果を台帳に反映する */
  export function checkApp(id: string): AppLedgerEntry {
    const sheet = getOrCreateSheet();
    const rowIndex = findRowIndexById(sheet, id);
    if (rowIndex === -1) {
      throw new Error("台帳エントリが見つかりません: " + id);
    }
    const url = String(sheet.getRange(rowIndex, 3).getValue());
    let status: AppStatus = "error";
    try {
      const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
      status = statusFromHttpCode(response.getResponseCode());
    } catch (e) {
      status = "error";
    }
    const now = new Date().toISOString();
    sheet.getRange(rowIndex, 5, 1, 2).setValues([[now, status]]);
    const row = sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0];
    return rowToEntry(row);
  }

  export function checkAllApps(): AppLedgerEntry[] {
    return listApps().map((entry) => {
      try {
        return checkApp(entry.id);
      } catch (e) {
        return entry;
      }
    });
  }
}

/**
 * ToDoリスト機能。個人のPropertiesServiceに配列のまま保存する簡易実装
 * （一般的なToDoリストと同等の仕様: 追加・完了切替・削除・完了済み一括削除に加え、
 * 期限日・優先度を付けられる）。
 */
namespace TodoService {
  const PROPERTY_KEY = "TODO_ITEMS";
  const MAX_ITEMS = 200;
  const VALID_PRIORITIES: TodoPriority[] = ["low", "medium", "high"];
  const DUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  function sanitizeDueDate(dueDate: string | null | undefined): string | null {
    return typeof dueDate === "string" && DUE_DATE_PATTERN.test(dueDate) ? dueDate : null;
  }

  function sanitizePriority(priority: string | null | undefined): TodoPriority {
    return VALID_PRIORITIES.indexOf(priority as TodoPriority) !== -1 ? (priority as TodoPriority) : "medium";
  }

  /** 期限日・優先度が導入される前に保存された項目にも欠けているフィールドを補う */
  function normalize(item: Partial<TodoItem>): TodoItem {
    return {
      id: item.id || Utilities.getUuid(),
      text: item.text || "",
      done: !!item.done,
      createdAt: item.createdAt || new Date().toISOString(),
      dueDate: sanitizeDueDate(item.dueDate),
      priority: sanitizePriority(item.priority),
    };
  }

  function getAll(): TodoItem[] {
    const raw = PropertiesService.getUserProperties().getProperty(PROPERTY_KEY);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(normalize) : [];
    } catch (e) {
      return [];
    }
  }

  function saveAll(items: TodoItem[]): TodoItem[] {
    PropertiesService.getUserProperties().setProperty(PROPERTY_KEY, JSON.stringify(items));
    return items;
  }

  export function list(): TodoItem[] {
    return getAll();
  }

  export function add(text: string, dueDate?: string | null, priority?: string | null): TodoItem[] {
    const trimmed = (text || "").trim();
    if (!trimmed) {
      throw new Error("内容を入力してください");
    }
    const items = getAll();
    if (items.length >= MAX_ITEMS) {
      throw new Error("登録できる件数の上限(" + MAX_ITEMS + "件)に達しています");
    }
    items.push({
      id: Utilities.getUuid(),
      text: trimmed,
      done: false,
      createdAt: new Date().toISOString(),
      dueDate: sanitizeDueDate(dueDate),
      priority: sanitizePriority(priority),
    });
    return saveAll(items);
  }

  export function toggle(id: string): TodoItem[] {
    const items = getAll();
    const item = items.filter((t) => t.id === id)[0];
    if (item) {
      item.done = !item.done;
    }
    return saveAll(items);
  }

  export function remove(id: string): TodoItem[] {
    return saveAll(getAll().filter((t) => t.id !== id));
  }

  export function clearDone(): TodoItem[] {
    return saveAll(getAll().filter((t) => !t.done));
  }
}
