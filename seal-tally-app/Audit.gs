/**
 * Audit.gs
 * 履歴シートへの記録と読み出し。履歴は追記のみで削除しない。
 */

/** トリガー実行中など、操作者を固定したいときに設定する（例：'システム'） */
var actorOverride_ = '';

/** 現在の利用者のメールアドレス（取れなければ空） */
function currentEmail_() {
  try { return String(Session.getActiveUser().getEmail() || ''); } catch (e) { return ''; }
}

/** 履歴・更新者に記録する操作者（トリガー時は 'システム'） */
function actor_() { return actorOverride_ || currentEmail_() || 'システム'; }

/** 履歴に書く値を文字列にする */
function auditStr_(v) {
  if (v === null || v === undefined) return '';
  if (v === true) return 'はい';
  if (v === false) return 'いいえ';
  if (Array.isArray(v)) return v.join(',');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * 履歴に1行記録する。
 * @param {string} action 操作（修正・除外・手入力・受入登録・設定変更・締め など）
 * @param {string} target 対象（管理ID・受入ID・設定キー・年月など）
 * @param {string} field 項目名（修正のとき）
 * @param {*} before 修正前
 * @param {*} after 修正後
 * @param {string} note 備考
 */
function audit_(action, target, field, before, after, note) {
  auditMany_([{ action: action, target: target, field: field, before: before, after: after, note: note }]);
}

/** 履歴に複数行をまとめて記録する（1回の setValues） */
function auditMany_(entries) {
  if (!entries || !entries.length) return;
  var sheet = getSheet_(SHEET.HISTORY);
  var props = sheetProps_(sheet, SHEET.HISTORY);
  var last = sheet.getLastRow();
  var seq = 0;
  if (last >= 2) {
    var col = Math.max(props.indexOf('seq'), 0) + 1;
    seq = Number(sheet.getRange(last, col).getValue()) || (last - 1);
  }
  var at = nowStr_();
  var by = actor_();
  appendRows_(SHEET.HISTORY, entries.map(function (e, i) {
    return {
      seq: seq + i + 1, at: at, by: by, action: e.action || '', target: e.target || '', field: e.field || '',
      before: auditStr_(e.before), after: auditStr_(e.after), note: e.note || ''
    };
  }));
}

/** メール → 名前 の対応（利用者シート） */
function userNameMap_() {
  var map = {};
  readAll_(SHEET.USERS).forEach(function (u) { if (u.email) map[String(u.email).toLowerCase()] = u.name || u.email; });
  return map;
}

/** 履歴1行を画面用の一文にする */
function historyText_(h) {
  if (h.field) {
    return h.field + '：' + (h.before === '' ? '（空）' : h.before) + ' → ' + (h.after === '' ? '（空）' : h.after) +
      (h.note ? '（' + h.note + '）' : '');
  }
  return h.action + (h.note ? '：' + h.note : '');
}

/**
 * 明細（または受入）の修正履歴を新しい順で返す。
 * @return {{at, by, text}[]}
 */
function historyFor_(id, rows) {
  var names = userNameMap_();
  return (rows || readAll_(SHEET.HISTORY))
    .filter(function (h) { return h.target === id; })
    .sort(function (a, b) { return (Number(b.seq) || 0) - (Number(a.seq) || 0); })
    .map(function (h) {
      return { at: h.at, by: names[String(h.by).toLowerCase()] || h.by, text: historyText_(h) };
    });
}

/** 設定の変更履歴として扱う操作 */
var SETTINGS_ACTIONS_ = ['設定変更', '地域名マスタ変更', '利用者変更', '初期セットアップ'];

/** 設定キーの表示名（DEFAULT_SETTINGS の内容欄） */
function settingLabel_(key) {
  var label = key;
  DEFAULT_SETTINGS.forEach(function (d) { if (d[0] === key) label = d[2]; });
  INPUT_FOLDERS.forEach(function (f) { if (f[0] === key) label = f[1] + 'の読み取りフォルダ'; });
  return label;
}

/**
 * 設定の変更履歴を新しい順で最大20件返す。
 * @return {{at, by, text}[]}
 */
function settingsHistory_(rows) {
  var names = userNameMap_();
  return (rows || readAll_(SHEET.HISTORY))
    .filter(function (h) { return SETTINGS_ACTIONS_.indexOf(h.action) >= 0; })
    .sort(function (a, b) { return (Number(b.seq) || 0) - (Number(a.seq) || 0); })
    .slice(0, 20)
    .map(function (h) {
      var text;
      if (h.action === '設定変更') {
        var label = settingLabel_(h.field);
        text = /^folder\./.test(h.field) ? label + 'を変更' :
          label + 'を ' + (h.before === '' ? '（空）' : h.before) + ' → ' + (h.after === '' ? '（空）' : h.after) + ' に変更';
      } else {
        text = h.action + (h.note ? '：' + h.note : '');
      }
      return { at: h.at, by: names[String(h.by).toLowerCase()] || h.by, text: text };
    });
}
