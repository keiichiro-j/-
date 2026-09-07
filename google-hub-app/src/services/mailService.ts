/**
 * 4. Mail機能
 * 受信メールの件名一覧確認（ホーム画面に直近N件を表示）／本文閲覧／新規作成・送信。
 * 閲覧は gmail.readonly、送信のみ gmail.send を使用する。
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

  /** メールタブからの新規メール作成・送信 */
  export function send(to: string, subject: string, body: string): void {
    if (!to || !to.trim()) {
      throw new Error("宛先を入力してください");
    }
    GmailApp.sendEmail(to.trim(), subject, body);
  }
}
