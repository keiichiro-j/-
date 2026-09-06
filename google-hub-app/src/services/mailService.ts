/**
 * 4. Mail機能
 * 受信メールの件名一覧確認（ホーム画面に直近N件を表示）。
 * 読み取り専用スコープ（gmail.readonly）で完結させる。
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
}
