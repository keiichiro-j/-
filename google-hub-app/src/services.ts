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

  /** 同期対象カレンダーはログインアカウントに紐づくため選択式にせず、常にアカウントの全カレンダーを対象にする */
  export function listCalendarIds(): string[] {
    return listCalendars().map((c) => c.id);
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
      isRecurring: event.isRecurringEvent(),
    };
  }

  const RECURRENCE_FREQUENCIES: RecurrenceFrequency[] = ["daily", "weekly", "monthly", "yearly"];

  /** UIから渡された繰り返しルールを安全な値に補正する（純粋関数） */
  export function sanitizeRecurrenceRule(input: Partial<EventRecurrenceRule> | null | undefined): EventRecurrenceRule {
    const frequency: RecurrenceFrequency =
      input && RECURRENCE_FREQUENCIES.indexOf(input.frequency as RecurrenceFrequency) !== -1
        ? (input.frequency as RecurrenceFrequency)
        : "none";
    const rawInterval = input && input.interval != null ? Number(input.interval) : 1;
    const interval = isNaN(rawInterval) ? 1 : Math.min(99, Math.max(1, Math.floor(rawInterval)));
    const endType: RecurrenceEndType =
      input && (input.endType === "count" || input.endType === "until") ? input.endType : "never";
    const rawCount = input && input.count != null ? Number(input.count) : 10;
    const count = isNaN(rawCount) ? 10 : Math.min(365, Math.max(1, Math.floor(rawCount)));
    const until =
      input && typeof input.until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.until) ? input.until : null;
    // endType==="until"なのに終了日が無い(未入力・不正な形式)場合、無期限に繰り返してしまうと
    // 後から直せない(作成後のルール変更は非対応)ため、安全側の"never"には倒さず「終了しない」
    // として扱わずエラーにする方が親切だが、この関数は純粋な補正のみを担うため、
    // 呼び出し側(createEvent)で終了日の整合性チェックを行う前提とし、ここでは"never"にフォールバックする。
    const safeEndType: RecurrenceEndType = endType === "until" && !until ? "never" : endType;
    return { frequency, interval, endType: safeEndType, count, until };
  }

  /** 補正済みのEventRecurrenceRuleから、Calendar Service用のEventRecurrenceを組み立てる */
  function buildRecurrence(rule: EventRecurrenceRule): GoogleAppsScript.Calendar.EventRecurrence {
    const recurrence = CalendarApp.newRecurrence();
    let ruleBuilder: GoogleAppsScript.Calendar.RecurrenceRule;
    if (rule.frequency === "weekly") {
      ruleBuilder = recurrence.addWeeklyRule();
    } else if (rule.frequency === "monthly") {
      ruleBuilder = recurrence.addMonthlyRule();
    } else if (rule.frequency === "yearly") {
      ruleBuilder = recurrence.addYearlyRule();
    } else {
      ruleBuilder = recurrence.addDailyRule();
    }
    ruleBuilder.interval(rule.interval);
    if (rule.endType === "count") {
      ruleBuilder.times(rule.count);
    } else if (rule.endType === "until" && rule.until) {
      ruleBuilder.until(new Date(rule.until + "T23:59:59"));
    }
    return recurrence;
  }

  /**
   * 予定の種類(カテゴリ)をCalendarのイベントカラーとして設定する。空文字は「未設定」として何もしない。
   * CalendarEvent(単発の回)とCalendarEventSeries(繰り返し予定のシリーズ全体)のどちらも
   * setColor(color: string) を持つため、構造的部分型でどちらも受け取れるようにしている。
   */
  function applyCategoryColor(entity: { setColor(color: string): unknown }, categoryColorId: string): void {
    if (!categoryColorId) {
      return;
    }
    entity.setColor(categoryColorId);
  }

  /**
   * ゲスト一覧を目的の状態に同期する（差分だけadd/removeする）。CalendarEventとCalendarEventSeries
   * のどちらも同じ形のgetGuestList/addGuest/removeGuestを持つため、applyCategoryColor同様
   * 構造的部分型で共通化している。
   */
  function syncGuests(
    entity: {
      getGuestList(): GoogleAppsScript.Calendar.EventGuest[];
      addGuest(email: string): unknown;
      removeGuest(email: string): unknown;
    },
    guestsCsv: string
  ): void {
    const desiredGuests = parseGuestsCsv(guestsCsv);
    const currentGuests = entity.getGuestList().map((g) => g.getEmail());
    desiredGuests
      .filter((email) => currentGuests.indexOf(email) === -1)
      .forEach((email) => entity.addGuest(email));
    currentGuests
      .filter((email) => desiredGuests.indexOf(email) === -1)
      .forEach((email) => entity.removeGuest(email));
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
    categoryColorId: string,
    recurrenceRuleInput?: Partial<EventRecurrenceRule> | null
  ): CalendarEventItem {
    const calendar = resolveCalendar(calendarId);
    const guests = parseGuestsCsv(guestsCsv);
    const options: { [key: string]: any } = { description: description };
    if (guests.length > 0) {
      options.guests = guests.join(",");
    }

    const rule = sanitizeRecurrenceRule(recurrenceRuleInput);
    if (rule.endType === "until" && rule.until && rule.until < startIso.slice(0, 10)) {
      // 予定を作成する前（＝副作用が発生する前）に検証するため、ここで弾いても安全にエラーにできる
      throw new Error("繰り返しの終了日は開始日以降の日付にしてください");
    }

    let event: GoogleAppsScript.Calendar.CalendarEvent;
    if (rule.frequency === "none") {
      if (allDay) {
        event = calendar.createAllDayEvent(title, new Date(startIso), options);
      } else {
        event = calendar.createEvent(title, new Date(startIso), new Date(endIso), options);
      }
      applyCategoryColor(event, categoryColorId);
      return toItem(calendarId, event);
    }

    const recurrence = buildRecurrence(rule);
    const series = allDay
      ? calendar.createAllDayEventSeries(title, new Date(startIso), recurrence, options)
      : calendar.createEventSeries(title, new Date(startIso), new Date(endIso), recurrence, options);
    applyCategoryColor(series, categoryColorId);
    // getEventById()にシリーズのIDを渡すと、そのシリーズの最初の回のCalendarEventが返る
    // （Calendar Serviceの仕様）。以後の一覧表示・編集は通常の単発予定と同じCalendarEventとして扱う。
    const firstOccurrence = calendar.getEventById(series.getId());
    if (!firstOccurrence) {
      // この時点でシリーズ自体はすでにカレンダーへ作成済みなので、ここで例外を投げると
      // クライアントには失敗として見え、ユーザーが保存をやり直して重複シリーズを作りかねない。
      // 取得できた情報だけでCalendarEventItem相当を組み立てて返し、失敗として扱わないようにする
      // （実際の内容は次回の一覧再取得で正しく反映される）。
      return {
        id: series.getId(),
        calendarId: calendarId,
        title: title,
        start: startIso,
        end: allDay ? startIso : endIso,
        allDay: allDay,
        guests: guests,
        categoryColorId: categoryColorId,
        isRecurring: true,
      };
    }
    return toItem(calendarId, firstOccurrence);
  }

  export function updateEvent(
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
    const calendar = resolveCalendar(calendarId);
    const event = calendar.getEventById(eventId);
    if (!event) {
      throw new Error("予定が見つかりません: " + eventId);
    }

    if (scope === "series" && event.isRecurringEvent()) {
      // シリーズ全体への適用は、Calendar Serviceの制約上タイトル・メモ・種類(色)・ゲストのみに限る。
      // 開始/終了時刻はシリーズ全体をまとめて動かすAPIが無いため、この回だけの例外にするしかなく、
      // 「シリーズ全体」の意図と矛盾するため、時刻の変更は反映しない
      // （UI側もこのスコープを選ぶと開始/終了欄を編集不可にする）。
      const series = event.getEventSeries();
      series.setTitle(title);
      series.setDescription(description);
      applyCategoryColor(series, categoryColorId);
      syncGuests(series, guestsCsv);
      return toItem(calendarId, event);
    }

    event.setTitle(title);
    if (!event.isAllDayEvent()) {
      event.setTime(new Date(startIso), new Date(endIso));
    }
    event.setDescription(description);
    applyCategoryColor(event, categoryColorId);
    syncGuests(event, guestsCsv);

    return toItem(calendarId, event);
  }

  /**
   * 月表示カレンダーでのドラッグ&ドロップによる日付変更専用。updateEvent()と違い、
   * タイトル・説明・ゲスト・種類(色)には一切触れず時刻だけを付け替える。CalendarEventItemは
   * description を持たないため、もしupdateEvent()を流用すると説明欄が空文字で上書きされてしまう。
   */
  export function moveEventDate(
    calendarId: string,
    eventId: string,
    newStartIso: string,
    newEndIso: string
  ): CalendarEventItem {
    const calendar = resolveCalendar(calendarId);
    const event = calendar.getEventById(eventId);
    if (!event) {
      throw new Error("予定が見つかりません: " + eventId);
    }
    if (event.isAllDayEvent()) {
      event.setAllDayDate(new Date(newStartIso));
    } else {
      event.setTime(new Date(newStartIso), new Date(newEndIso));
    }
    return toItem(calendarId, event);
  }

  /**
   * scope==="series"かつ繰り返し予定の場合、シリーズ全体（過去の回を含む全ての回）を削除する。
   * Calendar Serviceには「この回より後だけ削除」に相当するAPIが無いため、Google Calendar UIの
   * 「今後の予定」に完全には対応していない点に注意（README参照）。
   */
  export function deleteEvent(calendarId: string, eventId: string, scope?: EventEditScope): void {
    const calendar = resolveCalendar(calendarId);
    const event = calendar.getEventById(eventId);
    if (!event) {
      return;
    }
    if (scope === "series" && event.isRecurringEvent()) {
      event.getEventSeries().deleteEventSeries();
    } else {
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

  const VALID_FOLDERS = ["inbox", "spam", "trash"];

  /** 取得元フォルダは受信トレイ/迷惑メール/ゴミ箱の3択（Gmail標準フォルダを直接見る） */
  function buildSearchQuery(folder: string): string {
    if (folder === "spam") {
      return "in:spam";
    }
    if (folder === "trash") {
      return "in:trash";
    }
    return "in:inbox";
  }

  function threadToSubjectItem(thread: GoogleAppsScript.Gmail.GmailThread): MailSubjectItem {
    const lastMessage = thread.getMessages()[thread.getMessageCount() - 1];
    return {
      threadId: thread.getId(),
      subject: thread.getFirstMessageSubject(),
      from: lastMessage.getFrom(),
      date: lastMessage.getDate().toISOString(),
      isUnread: thread.isUnread(),
    };
  }

  export function getRecentSubjects(count: number, folder?: string): MailSubjectItem[] {
    const safeCount = clampCount(count);
    const safeFolder = folder && VALID_FOLDERS.indexOf(folder) !== -1 ? folder : "inbox";
    const searchQuery = buildSearchQuery(safeFolder);
    const threads = GmailApp.search(searchQuery, 0, safeCount);
    return threads.map(threadToSubjectItem);
  }

  const SEARCH_RESULT_LIMIT = 30;

  /** メールタブの検索欄用。folder(受信トレイ/迷惑メール/ゴミ箱)の範囲内でGmail検索構文をそのまま使える */
  export function searchMails(query: string, folder?: string): MailSubjectItem[] {
    const trimmed = query.trim();
    if (!trimmed) {
      return getRecentSubjects(SEARCH_RESULT_LIMIT, folder);
    }
    const safeFolder = folder && VALID_FOLDERS.indexOf(folder) !== -1 ? folder : "inbox";
    const searchQuery = buildSearchQuery(safeFolder) + " " + trimmed;
    const threads = GmailApp.search(searchQuery, 0, SEARCH_RESULT_LIMIT);
    return threads.map(threadToSubjectItem);
  }

  /** タップされたメールの本文を取得する（スレッド内最新メッセージ）。添付ファイルはスレッド内の全メッセージ分をまとめる */
  export function getBody(threadId: string): MailBody {
    const thread = GmailApp.getThreadById(threadId);
    if (!thread) {
      throw new Error("メールが見つかりません: " + threadId);
    }
    const messages = thread.getMessages();
    const lastMessage = messages[messages.length - 1];
    const attachments: MailAttachmentItem[] = [];
    messages.forEach((message, messageIndex) => {
      message.getAttachments().forEach((attachment, attachmentIndex) => {
        attachments.push({
          id: messageIndex + ":" + attachmentIndex,
          name: attachment.getName(),
          contentType: attachment.getContentType(),
          sizeBytes: attachment.getSize(),
        });
      });
    });
    return {
      threadId: thread.getId(),
      from: lastMessage.getFrom(),
      to: lastMessage.getTo(),
      date: lastMessage.getDate().toISOString(),
      subject: thread.getFirstMessageSubject(),
      bodyPlain: lastMessage.getPlainBody(),
      attachments: attachments,
    };
  }

  function resolveAttachment(
    threadId: string,
    attachmentId: string
  ): GoogleAppsScript.Gmail.GmailAttachment {
    const thread = GmailApp.getThreadById(threadId);
    if (!thread) {
      throw new Error("メールが見つかりません: " + threadId);
    }
    const parts = attachmentId.split(":");
    const message = thread.getMessages()[Number(parts[0])];
    if (!message) {
      throw new Error("メッセージが見つかりません");
    }
    const attachment = message.getAttachments()[Number(parts[1])];
    if (!attachment) {
      throw new Error("添付ファイルが見つかりません: " + attachmentId);
    }
    return attachment;
  }

  /** 添付ファイルの実データをBase64で取得する（プレビュー・ダウンロード時に都度呼ぶ） */
  export function getAttachmentData(threadId: string, attachmentId: string): MailAttachmentData {
    const attachment = resolveAttachment(threadId, attachmentId);
    return {
      name: attachment.getName(),
      contentType: attachment.getContentType(),
      base64: Utilities.base64Encode(attachment.getBytes()),
    };
  }

  /**
   * 添付ファイルをDriveのマイドライブ直下へ保存する。ブラウザで直接プレビューできない種類
   * （Office文書・zip等）でも、Drive自体のプレビュー機能でそのまま内容を確認できるようにするため
   * （Gmail純正の「Driveに追加」相当の機能）。
   */
  export function saveAttachmentToDrive(threadId: string, attachmentId: string): DriveFileItem {
    const attachment = resolveAttachment(threadId, attachmentId);
    const file = DriveApp.getRootFolder().createFile(attachment.copyBlob());
    return {
      id: file.getId(),
      name: file.getName(),
      mimeType: file.getMimeType(),
      iconUrl: DriveService.iconUrlForMimeType(file.getMimeType(), false),
      thumbnailUrl: "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w200",
      url: file.getUrl(),
      lastUpdated: file.getLastUpdated().toISOString(),
      sizeBytes: file.getSize(),
      isFolder: false,
      sharingAccess: "UNKNOWN",
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
 * ファイル/フォルダの一覧・検索・並び替え・プレビュー・共有設定変更・移動・アップロード。
 * マイドライブに加えて共有ドライブの閲覧・アップロードにも対応するため、Advanced Drive
 * Service（Drive API v3、appsscript.jsonでenabledAdvancedServicesとして有効化）を使う。
 * 基本のDriveAppサービスは共有ドライブの列挙(フォルダの中身一覧・検索)を正式にサポートして
 * いないため、共有ドライブ対応にはこのAdvanced Serviceが必須となる。
 */
namespace DriveService {
  export type SortKey = "name" | "updated" | "size";

  const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
  const FILE_FIELDS = "id,name,mimeType,webViewLink,modifiedTime,size,parents";
  /** 型定義上はDrive Advanced Serviceが未定義の可能性を許容しているが、appsscript.jsonで
   *  有効化済みの前提のGAS実行環境では必ず存在するため、以降はこれ経由で参照する */
  const DriveApi = Drive as GoogleAppsScript.Drive;

  /** Google純正の「third-party icon」規則に沿ったアイコンURLを組み立てる（API呼び出し不要の純粋関数） */
  export function iconUrlForMimeType(mimeType: string, isFolder: boolean): string {
    if (isFolder) {
      return "https://drive-thirdparty.googleusercontent.com/16/type/application/vnd.google-apps.folder";
    }
    return "https://drive-thirdparty.googleusercontent.com/16/type/" + encodeURIComponent(mimeType);
  }

  /**
   * 一覧表示では共有設定(sharingAccess)を個別に取得しない（1件ごとに追加のAPI往復が発生し、
   * 一覧の読み込みが件数に比例して遅くなるため）。現状のUIは一覧上でsharingAccessを
   * 表示していないため、常に"UNKNOWN"を返す。個別ファイルの共有状態が必要になった場合は、
   * そのファイルに対してのみ取得すること。
   *
   * サムネイルは、閲覧者が対象ファイルにアクセス権を持つ場合にブラウザのGoogleセッションで
   * 直接読み込める"https://drive.google.com/thumbnail?id=..."のURLパターンをそのまま
   * 組み立てて返す（Advanced ServiceのthumbnailLinkは短期間で失効するURLのため使わない）。
   * サムネイルが生成されていないファイル種別ではその画像取得自体が失敗するため、
   * クライアント側でmimeTypeアイコンへフォールバックする前提。
   */
  function toItem(file: GoogleAppsScript.Drive_v3.Drive.V3.Schema.File): DriveFileItem {
    const mimeType = file.mimeType || "";
    const isFolder = mimeType === FOLDER_MIME_TYPE;
    const id = file.id || "";
    return {
      id: id,
      name: file.name || "",
      mimeType: mimeType,
      iconUrl: iconUrlForMimeType(mimeType, isFolder),
      thumbnailUrl: isFolder ? "" : "https://drive.google.com/thumbnail?id=" + id + "&sz=w200",
      url: file.webViewLink || "https://drive.google.com/file/d/" + id + "/view",
      lastUpdated: file.modifiedTime || new Date().toISOString(),
      sizeBytes: isFolder ? 0 : Number(file.size || "0"),
      isFolder: isFolder,
      sharingAccess: "UNKNOWN",
    };
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

  /** 共有ドライブ一覧（切り替えUI用）。ユーザーがアクセスできる共有ドライブをすべて返す */
  export function listSharedDrives(): DriveInfo[] {
    const drives: DriveInfo[] = [];
    let pageToken: string | undefined;
    do {
      const response: GoogleAppsScript.Drive_v3.Drive.V3.Schema.DriveList = DriveApi.Drives.list({
        pageSize: 100,
        pageToken: pageToken,
        fields: "nextPageToken, drives(id, name)",
      });
      (response.drives || []).forEach((d) => {
        drives.push({ id: d.id || "", name: d.name || "" });
      });
      pageToken = response.nextPageToken;
    } while (pageToken);
    return drives;
  }

  /** マイドライブ/共有ドライブいずれかの「ルート」に相当するフォルダIDを返す。
   *  共有ドライブ自体のIDは、そのままトップレベル項目の親IDとして使える。 */
  function resolveRootId(driveId: string): string {
    return driveId || DriveApp.getRootFolder().getId();
  }

  /**
   * フォルダ直下（未指定時はdriveIdのルート。driveIdが空文字ならマイドライブ直下）の一覧。
   * 特定の親フォルダIDを指定してのファイル列挙は、共有ドライブ上のフォルダでも
   * supportsAllDrives/includeItemsFromAllDrivesを付ければそのまま機能するため、
   * マイドライブ・共有ドライブを区別せず同じコードパスで扱える。
   */
  export function listFiles(
    folderId: string | null,
    driveId: string,
    sortKey: SortKey = "updated",
    ascending: boolean = false,
    limit: number = 100
  ): DriveFileItem[] {
    const parentId = folderId || resolveRootId(driveId);
    const items: DriveFileItem[] = [];
    let pageToken: string | undefined;
    do {
      const response: GoogleAppsScript.Drive_v3.Drive.V3.Schema.FileList = DriveApi.Files.list({
        q: "'" + parentId + "' in parents and trashed = false",
        fields: "nextPageToken, files(" + FILE_FIELDS + ")",
        pageSize: Math.min(100, limit - items.length),
        pageToken: pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      (response.files || []).forEach((f) => items.push(toItem(f)));
      pageToken = response.nextPageToken;
    } while (pageToken && items.length < limit);
    return sortItems(items, sortKey, ascending);
  }

  const SEARCH_FETCH_MULTIPLIER = 3;

  function escapeForDriveQuery(word: string): string {
    return word.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  /**
   * あいまい検索・全文検索対応: クエリを単語ごとに分割し、各単語について「ファイル名に含む」
   * または「本文(fullText)に含む」のいずれかを満たすファイルをOR条件で広く集める。
   * Drive API自体は真のあいまいマッチ(タイプミス許容等)をサポートしないため、
   * 一致語数・完全フレーズ一致でスコアリングして並び替えることで「あいまい検索」に近い
   * 体験にしている（rankByRelevance）。driveIdを指定すると、その共有ドライブの範囲内だけを
   * 検索する（corpora: "drive"）。空文字ならマイドライブの範囲内（corpora: "user"）。
   */
  export function searchFiles(query: string, driveId: string, limit: number = 50): DriveFileItem[] {
    const words = query.trim().split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      return [];
    }
    const clauses = words.map((w) => {
      const escaped = escapeForDriveQuery(w);
      return "(name contains '" + escaped + "' or fullText contains '" + escaped + "')";
    });
    const searchQuery = "(" + clauses.join(" or ") + ") and trashed = false";
    const optionalArgs: Record<string, any> = {
      q: searchQuery,
      fields: "files(" + FILE_FIELDS + ")",
      pageSize: Math.min(100, limit * SEARCH_FETCH_MULTIPLIER),
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    };
    if (driveId) {
      optionalArgs.corpora = "drive";
      optionalArgs.driveId = driveId;
    } else {
      optionalArgs.corpora = "user";
    }
    const response: GoogleAppsScript.Drive_v3.Drive.V3.Schema.FileList = DriveApi.Files.list(optionalArgs);
    const items = (response.files || []).map(toItem);
    return rankByRelevance(items, words).slice(0, limit);
  }

  /** ファイル名との一致度でスコアリングして並び替える（一致語数が多いほど、完全フレーズ一致ならさらに高スコア） */
  export function rankByRelevance(items: DriveFileItem[], words: string[]): DriveFileItem[] {
    const lowerWords = words.map((w) => w.toLowerCase());
    const phrase = lowerWords.join(" ");
    const scored = items.map((item) => {
      const lowerName = item.name.toLowerCase();
      let score = 0;
      lowerWords.forEach((w) => {
        if (lowerName.indexOf(w) !== -1) score += 10;
      });
      if (phrase.length > 0 && lowerName.indexOf(phrase) !== -1) score += 20;
      return { item: item, score: score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.item);
  }

  export function getPreviewUrl(fileId: string): string {
    return "https://drive.google.com/file/d/" + fileId + "/preview";
  }

  const ACCESS_ROLE_MAP: { [key: string]: string } = {
    VIEW: "reader",
    EDIT: "writer",
    COMMENT: "commenter",
  };

  function currentUserDomain(): string {
    const email = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || "";
    const at = email.indexOf("@");
    return at === -1 ? "" : email.slice(at + 1);
  }

  /**
   * DriveAppのsetSharing()のような「1回で置き換える」専用APIがAdvanced Serviceには無いため、
   * 既存の公開範囲(anyone/domain)の権限を削除してから、必要なら新しい権限を作り直す。
   * 個別ユーザー・グループへの共有(type: user/group)はこの一覧・削除の対象に含めないため、
   * 個別共有されたユーザーが意図せず外れることはない。
   */
  export function updateSharing(fileId: string, access: string, permission: string): DriveFileItem {
    const existing: GoogleAppsScript.Drive_v3.Drive.V3.Schema.PermissionList = DriveApi.Permissions.list(fileId, {
      fields: "permissions(id, type)",
      supportsAllDrives: true,
    });
    (existing.permissions || []).forEach((p) => {
      if (p.id && (p.type === "anyone" || p.type === "domain")) {
        DriveApi.Permissions.remove(fileId, p.id, { supportsAllDrives: true });
      }
    });

    if (access !== "PRIVATE") {
      const role = ACCESS_ROLE_MAP[permission];
      if (!role) {
        throw new Error("不正な共有設定です: access=" + access + ", permission=" + permission);
      }
      const resource: GoogleAppsScript.Drive_v3.Drive.V3.Schema.Permission = { role: role };
      if (access === "ANYONE") {
        resource.type = "anyone";
        resource.allowFileDiscovery = true;
      } else if (access === "ANYONE_WITH_LINK") {
        resource.type = "anyone";
        resource.allowFileDiscovery = false;
      } else if (access === "DOMAIN" || access === "DOMAIN_WITH_LINK") {
        resource.type = "domain";
        resource.domain = currentUserDomain();
        resource.allowFileDiscovery = access === "DOMAIN";
      } else {
        throw new Error("不正な共有設定です: access=" + access + ", permission=" + permission);
      }
      DriveApi.Permissions.create(resource, fileId, { supportsAllDrives: true });
    }

    const file = DriveApi.Files.get(fileId, { fields: FILE_FIELDS, supportsAllDrives: true });
    return toItem(file);
  }

  export function renameEntry(id: string, newName: string, isFolder: boolean): DriveFileItem {
    const trimmed = newName.trim();
    if (!trimmed) {
      throw new Error("新しい名前を入力してください");
    }
    // update(resource, fileId, optionalArgs)（メディア無しでの更新）は実際のAPIでは有効だが、
    // 型定義側にその組み合わせのオーバーロードが無いため、ここだけ型チェックを迂回している。
    const updated: GoogleAppsScript.Drive_v3.Drive.V3.Schema.File = (DriveApi.Files.update as any)(
      { name: trimmed },
      id,
      { fields: FILE_FIELDS, supportsAllDrives: true }
    );
    void isFolder; // フォルダ/ファイルいずれもFiles.updateで同じように扱えるため未使用
    return toItem(updated);
  }

  export function moveFile(fileId: string, destinationFolderId: string): DriveFileItem {
    const current = DriveApi.Files.get(fileId, { fields: "parents", supportsAllDrives: true });
    const previousParents = (current.parents || []).join(",");
    const updated: GoogleAppsScript.Drive_v3.Drive.V3.Schema.File = (DriveApi.Files.update as any)(
      {},
      fileId,
      {
        addParents: destinationFolderId,
        removeParents: previousParents,
        fields: FILE_FIELDS,
        supportsAllDrives: true,
      }
    );
    return toItem(updated);
  }

  /**
   * google.script.runは文字列引数のサイズに実用上の上限があるため(Base64化で元データの
   * 約1.33倍に膨らむことも踏まえ)、アップロード可能な1ファイルあたりのサイズを制限する。
   * ブラウザのドラッグ&ドロップ/ファイル選択からアップロードされたファイルをそのまま
   * 現在開いているフォルダ（未指定時はdriveIdのルート）に保存する。
   */
  const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

  export function uploadFile(
    folderId: string | null,
    driveId: string,
    fileName: string,
    mimeType: string,
    base64Data: string
  ): DriveFileItem {
    const trimmedName = fileName.trim();
    if (!trimmedName) {
      throw new Error("ファイル名を取得できませんでした");
    }
    const bytes = Utilities.base64Decode(base64Data);
    if (bytes.length > MAX_UPLOAD_BYTES) {
      throw new Error("ファイルサイズが大きすぎます（1ファイルあたり20MBまで）: " + trimmedName);
    }
    const blob = Utilities.newBlob(bytes, mimeType || "application/octet-stream", trimmedName);
    const parentId = folderId || resolveRootId(driveId);
    const created = DriveApi.Files.create({ name: trimmedName, parents: [parentId] }, blob, {
      fields: FILE_FIELDS,
      supportsAllDrives: true,
    });
    return toItem(created);
  }
}

/**
 * 4. スクリプト管理 / 11.2 自社アプリ台帳機能への応用
 * 自社GASアプリ等へのリンクをスプレッドシート台帳で管理する。
 * URLを貼り付けるだけで登録でき、名称はリンク先ページの<title>から自動取得する
 * （自動取得された名称は後から自由に変更できる。URL自体の変更は非対応で、誤登録は削除のみ可能）。
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

  /** 登録名称の変更。自動取得された<title>が実態と異なる/わかりにくい場合に手動で上書きできる */
  export function updateAppName(id: string, name: string): AppLedgerEntry {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("名称を入力してください");
    }
    const sheet = getOrCreateSheet();
    const rowIndex = findRowIndexById(sheet, id);
    if (rowIndex === -1) {
      throw new Error("台帳エントリが見つかりません: " + id);
    }
    sheet.getRange(rowIndex, 2).setValue(trimmed);
    const row = sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0];
    return rowToEntry(row);
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

/**
 * 通知機能。時限トリガーから毎日決まった時刻に、今日の予定と期限が近い(当日〜期限切れ)ToDoを
 * まとめてメールで送る。Google Chat連携は対象外のため、送信手段は既存のgmail.sendスコープで
 * 足りるGmailを使う。トリガーの作成・削除は全体設定の保存時（saveGlobalSettings）に同期する。
 */
namespace NotificationService {
  export const TRIGGER_HANDLER = "runDailyNotification";

  /** 全体設定のnotifyEnabled/notifyHourに合わせて、時限トリガーの有無・時刻を同期する */
  export function syncTrigger(settings: GlobalSettings): void {
    removeExistingTriggers();
    if (settings.notifyEnabled) {
      ScriptApp.newTrigger(TRIGGER_HANDLER).timeBased().everyDays(1).atHour(settings.notifyHour).create();
    }
  }

  function removeExistingTriggers(): void {
    ScriptApp.getProjectTriggers().forEach((trigger) => {
      if (trigger.getHandlerFunction() === TRIGGER_HANDLER) {
        ScriptApp.deleteTrigger(trigger);
      }
    });
  }

  function dayRange(date: Date): { start: Date; end: Date } {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
    return { start: start, end: end };
  }

  function todayKey(date: Date): string {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  function formatEventTime(iso: string): string {
    return Utilities.formatDate(new Date(iso), Session.getScriptTimeZone(), "HH:mm");
  }

  function buildDigestBody(events: CalendarEventItem[], todos: TodoItem[]): string {
    const lines: string[] = ["Google Hubからの通知です。", ""];
    if (events.length > 0) {
      lines.push("◆ 今日の予定");
      events.forEach((ev) => {
        const timeLabel = ev.allDay ? "終日" : formatEventTime(ev.start) + "〜" + formatEventTime(ev.end);
        lines.push("・" + timeLabel + " " + (ev.title || "(無題)"));
      });
      lines.push("");
    }
    if (todos.length > 0) {
      lines.push("◆ 期限のToDo（本日まで・期限切れ含む）");
      todos.forEach((t) => {
        lines.push("・" + t.text + (t.dueDate ? "（期限: " + t.dueDate + "）" : ""));
      });
      lines.push("");
    }
    if (events.length === 0 && todos.length === 0) {
      lines.push("本日の予定・期限のToDoはありません。");
    }
    return lines.join("\n");
  }

  /**
   * 今日の予定・期限が近い(当日〜期限切れ)ToDoをまとめてメール通知する（時限トリガーから呼ばれる）。
   * force=trueの場合、notifyEnabledの状態や「何もなければ送らない」の省略ロジックを無視して
   * 必ず送信する（設定画面の「テスト通知を送信」ボタン用）。
   */
  export function sendDailyDigest(force?: boolean): void {
    const globalSettings = GlobalSettingsService.getSettings();
    if (!force && !globalSettings.notifyEnabled) {
      return; // トリガーの削除漏れ等に対する保険
    }
    const now = new Date();
    const range = dayRange(now);
    const events = CalendarService.getEvents(
      CalendarService.listCalendarIds(),
      range.start.toISOString(),
      range.end.toISOString()
    );
    const key = todayKey(now);
    const todos = TodoService.list().filter((t) => !t.done && t.dueDate !== null && t.dueDate <= key);

    if (!force && events.length === 0 && todos.length === 0) {
      return; // 何も無ければ毎日空メールを送らない
    }

    const recipient = Session.getEffectiveUser().getEmail();
    if (!recipient) {
      return;
    }
    const subject = "【Google Hub】本日の予定・ToDo（" + Utilities.formatDate(now, Session.getScriptTimeZone(), "M/d") + "）";
    GmailApp.sendEmail(recipient, subject, buildDigestBody(events, todos));
  }
}
