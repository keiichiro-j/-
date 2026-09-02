/**
 * CalendarService.gs
 * Hold期限のGoogleカレンダー連携
 *
 * Hold登録・2nd Hold登録は、担当者本人がWebアプリを操作するその場で実行される
 * （requireCurrentStaff_参照）。デプロイ設定「実行するユーザー: アプリにアクセスする
 * ユーザー」（appsscript.json の executeAs: USER_ACCESSING）により、この処理は
 * 常に「今アプリを操作している担当者本人」として実行されるため、
 * CalendarApp.getDefaultCalendar() は自動的にその担当者自身のカレンダーを指す。
 * メールアドレスを指定して他人のカレンダーを直接操作しているわけではない
 * （担当者間でカレンダーを共有する設定は不要）。
 *
 * 制約: Hold期限切れの自動処理（processExpiredHolds、時間主導トリガー）は
 * 特定の担当者としてではなくスクリプト実行者として動くため、他の担当者の
 * カレンダーへは書き込めない。そのため、期限切れによる自動解放・自動昇格時には
 * カレンダーイベントの作成・削除は行わない（期限が来て役目を終えたイベントが
 * 本人のカレンダーにそのまま残るのみで、実害はない）。
 * 同様に、Hold中の車両を受注確定した場合に削除できるのは受注確定を行った本人
 * （＝1st Hold担当者。canConfirmOrder_により1st Hold担当者以外は受注確定できない）の
 * イベントのみで、2nd Holdが同時に存在した場合その担当者のイベントは削除できない
 * （README「Googleカレンダー連携」の項を参照）。
 */

/**
 * Hold期限のリマインドイベントを、現在実行中のユーザー（担当者本人）の
 * デフォルトカレンダーに作成する。カレンダー操作に失敗しても、Hold登録処理
 * 自体は失敗させない（あくまで補助的な通知機能のため、安全側でもみ消す）。
 * @param {string} commission
 * @param {string} model
 * @param {number} expiresAt エポックミリ秒
 * @return {string} 作成できた場合はイベントID、失敗した場合は空文字
 */
function createHoldCalendarEvent_(commission, model, expiresAt) {
  try {
    var start = new Date(expiresAt);
    var end = new Date(expiresAt + 30 * 60 * 1000);
    var event = CalendarApp.getDefaultCalendar().createEvent(
      '【Hold期限】' + model + '（' + commission + '）',
      start,
      end,
      { description: 'コミッション: ' + commission + '\nモデル: ' + model + '\n販売可能リストで登録したHoldの期限です。' }
    );
    event.addPopupReminder(180); // 期限の3時間前にも通知する
    return event.getId();
  } catch (e) {
    return '';
  }
}

/**
 * 指定したイベントIDのカレンダーイベントを、現在実行中のユーザーのデフォルト
 * カレンダーから削除する。イベントIDが空、またはイベントが既に存在しない・
 * 削除に失敗した場合も、呼び出し元の処理を止めないよう静かに無視する。
 * @param {string} eventId
 */
function deleteHoldCalendarEvent_(eventId) {
  if (!eventId) return;
  try {
    var event = CalendarApp.getDefaultCalendar().getEventById(eventId);
    if (event) event.deleteEvent();
  } catch (e) {
    // カレンダー操作の失敗は無視する（本体の処理を優先する）。
  }
}
