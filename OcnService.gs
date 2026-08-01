/**
 * OcnService.gs
 * 4.5 OCN 自動採番（登録ボタン押下時にアプリが自動採番）
 *
 * OCN は数字のみ（プレフィックスなし）。会社ごとに、全タブ（輸入車／国産車／販売済）を
 * 走査して既存OCNの最大値を求め、+1 した値を採番する。LockService で採番の競合
 * （複数担当者の同時登録）を防止する。
 */

function generateNextOcn(companyId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var maxSeq = 0;
    ALL_TAB_NAMES.forEach(function (tabName) {
      var sheet = getOrCreateSheet(companyId, tabName);
      readAllRows_(sheet).forEach(function (row) {
        var seq = parseOcnSequence(row.ocn);
        if (seq !== null && seq > maxSeq) maxSeq = seq;
      });
    });
    return String(maxSeq + 1);
  } finally {
    lock.releaseLock();
  }
}

/**
 * OCN文字列（数字のみ、先頭ゼロ許容）を連番の数値へ変換する。
 * 不正な形式の場合は null を返す（純粋関数：テスト容易化のため GAS サービスに依存しない）。
 */
function parseOcnSequence(ocn) {
  if (!ocn) return null;
  var m = String(ocn).trim().match(/^([0-9]+)$/);
  if (!m) return null;
  return parseInt(m[1], 10);
}
