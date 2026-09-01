/**
 * PaidOptionService.gs
 * 有償OPマスタ（コード → 名称）の読み書きと照合（純粋関数＋シートCRUD）。
 *
 * 在庫リスト等の有償OP1〜7にはコードだけが入る運用を想定し、名称はマスタから
 * 解決する。アプリ画面ではコードをタップすると名称ポップアップを出す。
 * マスタの編集は設定タブ（管理者）または「有償OPマスタ」シートへの直接入力。
 */

function listPaidOptionMaster_() {
  return normalizePaidOptionMaster_(readAllRows_(getPaidOptionMasterSheet_(), PAID_OPTION_MASTER_COLUMNS, 'code'));
}

/**
 * 有償OPマスタを正規化する（純粋関数）。コード必須、名称は空でも残す
 * （未登録名称はポップアップで「マスタ未登録」と案内するため、コードだけ先に
 * 載せておく運用を許容する）。コードの重複（大文字小文字・前後空白違い）は
 * 先勝ち。最大 PAID_OPTION_MASTER_MAX 件。
 * @param {Array<Object>} list
 * @return {Array<{code: string, name: string}>}
 */
function normalizePaidOptionMaster_(list) {
  if (!Array.isArray(list)) return [];
  var seen = {};
  var result = [];
  list.forEach(function (entry) {
    var code = String((entry && entry.code) || '').trim();
    var name = String((entry && entry.name) || '').trim();
    if (!code) return;
    if (code.length > PAID_OPTION_CODE_MAX_LENGTH) {
      throw new Error('有償OPコードは' + PAID_OPTION_CODE_MAX_LENGTH + '文字以内で入力してください');
    }
    if (name.length > PAID_OPTION_NAME_MAX_LENGTH) {
      throw new Error('有償OP名称は' + PAID_OPTION_NAME_MAX_LENGTH + '文字以内で入力してください');
    }
    var key = code.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    result.push({ code: code, name: name });
  });
  if (result.length > PAID_OPTION_MASTER_MAX) {
    throw new Error('有償OPマスタは最大' + PAID_OPTION_MASTER_MAX + '件までです');
  }
  return result;
}

/**
 * コードから名称を引く（純粋関数）。大文字小文字・前後空白は無視。
 * 見つからなければ空文字。
 * @param {string} code
 * @param {Array<{code: string, name: string}>} master
 * @return {string}
 */
function lookupPaidOptionName_(code, master) {
  var needle = String(code || '').trim().toLowerCase();
  if (!needle) return '';
  var list = master || [];
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].code || '').trim().toLowerCase() === needle) {
      return String(list[i].name || '').trim();
    }
  }
  return '';
}

/**
 * 有償OPマスタを全置換する（設定タブからの保存）。管理者以外は Api.gs 側で拒否する。
 * @param {Array<Object>} list
 * @return {Array<{code: string, name: string}>}
 */
function replacePaidOptionMaster_(list) {
  var normalized = normalizePaidOptionMaster_(list);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getPaidOptionMasterSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      sheet.getRange(2, 1, lastRow - 1, PAID_OPTION_MASTER_COLUMNS.length).clearContent();
    }
    if (!normalized.length) return normalized;
    applyTextColumnFormat_(sheet, [paidOptionMasterColIndex1('code')]);
    var rows = normalized.map(function (entry) {
      return objectToRow_(entry, PAID_OPTION_MASTER_COLUMNS);
    });
    sheet.getRange(2, 1, rows.length, PAID_OPTION_MASTER_COLUMNS.length).setValues(rows);
    return normalized;
  } finally {
    lock.releaseLock();
  }
}
