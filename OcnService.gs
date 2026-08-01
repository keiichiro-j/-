/**
 * OcnService.gs
 * 4.5 OCN 自動採番（登録ボタン押下時にアプリが自動採番）
 *
 * OCN は "OCN" + 数字 の形式（例: OCN12345）。会社ごとに、全タブ（輸入車／国産車／販売済）
 * を走査して最大の連番を求め、+1 した値を採番する。LockService で採番の競合（複数担当者の
 * 同時登録）を防止する。
 */

var OCN_PREFIX = 'OCN';

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
    var next = maxSeq + 1;
    return OCN_PREFIX + String(next).padStart(5, '0');
  } finally {
    lock.releaseLock();
  }
}

/**
 * "OCN12345" -> 12345 のようにOCN文字列から連番部分を数値抽出する。
 * 不正な形式の場合は null を返す（純粋関数：テスト容易化のため GAS サービスに依存しない）。
 */
function parseOcnSequence(ocn) {
  if (!ocn) return null;
  var m = String(ocn).match(/^OCN0*([0-9]+)$/i);
  if (!m) return null;
  return parseInt(m[1], 10);
}
