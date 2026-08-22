/**
 * AuditLogService.gs
 * 変更履歴（監査ログ）機能
 *
 * Hold登録・2nd Hold登録・Hold解除（手動・自動）・受注確定のたびに、
 * 「変更履歴」シートへ1行追記する（更新・削除は行わない）。
 * スプレッドシートの行を直接見れば、誰が・いつ・何をしたかを後から追跡できる。
 * アプリ側に専用の閲覧画面は設けず、シートを直接確認する運用とする。
 */

function getAuditLogSheet_() {
  return getOrCreateSheet_(SHEET_NAMES.AUDIT_LOG, AUDIT_LOG_HEADER_ROW, [auditLogColIndex1('commission')]);
}

/**
 * 変更履歴の1行分のレコードを組み立てる（純粋関数）。
 * staff が null の場合（時間主導トリガーによる自動処理など、ログイン中の担当者が
 * 存在しない操作）は、担当者欄に「システム（自動処理）」と記録する。
 * @param {string} action 例: 'Hold登録', '受注確定'
 * @param {string} commission
 * @param {string} model
 * @param {{name: string, email: string}|null} staff
 * @param {string} detail 操作の補足（リード番号・解除理由など）
 * @param {number} now エポックミリ秒
 */
function buildAuditLogEntry_(action, commission, model, staff, detail, now) {
  return {
    timestamp: now,
    action: action,
    commission: commission || '',
    model: model || '',
    staffName: staff ? staff.name : 'システム（自動処理）',
    staffEmail: staff ? staff.email : '',
    detail: detail || ''
  };
}

function appendAuditLog_(entry) {
  var sheet = getAuditLogSheet_();
  var newRow = sheet.getLastRow() + 1;
  // 他シートのappendRow系書き込みと同様、コミッションの先頭0が消えないよう
  // 書き込み直前に対象セルの書式をテキストへ明示的に設定する。
  sheet.getRange(newRow, auditLogColIndex1('commission'), 1, 1).setNumberFormat('@');
  sheet.getRange(newRow, 1, 1, AUDIT_LOG_COLUMNS.length).setValues([objectToRow_(entry, AUDIT_LOG_COLUMNS)]);
}
