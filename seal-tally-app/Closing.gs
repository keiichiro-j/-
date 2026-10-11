/**
 * Closing.gs
 * 月次締め・締め解除・締めリマインド、通知メールの共通処理。
 */

/**
 * 締め済みの月を返す（締め解除した月は含めない）。
 * @return {Object} {yyyy-MM: {closed:true, by, at}}
 */
function closedMonths_() {
  var out = {};
  readAll_(SHEET.CLOSING).forEach(function (c) {
    if (!c.closed || !isMonthStr_(c.month)) return;
    out[c.month] = { closed: true, by: c.by, at: c.at };
  });
  return out;
}

/**
 * 月を締める（ロックは呼び出し側で取る）。
 * 重複・要確認・誤りの疑いが1件でもあれば締めずに件数を返す。
 * @return {{closed:boolean, blocking?:Object}}
 */
function closeMonth_(month) {
  if (!isMonthStr_(month)) throw userError_('年月の指定が正しくありません');
  if (month >= thisMonth_()) throw userError_(monthLabelLong_(month) + 'はまだ終わっていないため締められません。翌月以降に締めてください');
  if (month < startMonth_()) throw userError_('稼働開始月より前の月は締められません');
  var closedNow = closedMonths_();
  if (closedNow[month]) throw userError_(monthLabelLong_(month) + 'はすでに締め済みです');
  var prev = prevMonth_(month);
  if (month > startMonth_() && !closedNow[prev]) throw userError_('先に' + monthLabelLong_(prev) + 'を締めてください');

  var records = readAll_(SHEET.RECORDS);
  // 締める前に最新の状態で判定し直す（日付が変わって未来日の警告が消える場合など）
  var changed = reevaluate_(records, [month], {});
  if (changed.length) updateRows_(SHEET.RECORDS, changed);
  var blocking = closeBlockingCounts_(records, month);
  if (blocking.total) return { closed: false, blocking: blocking };

  var sum = stockSummary_(month, stockCtx_(records));
  var by = actor_();
  var at = nowStr_();
  var rows = readAll_(SHEET.CLOSING);
  var updates = [];
  var adds = [];
  UNITS.forEach(function (u) {
    var m = sum[u];
    var row = null;
    rows.forEach(function (c) { if (c.month === month && c.unit === u) row = c; });
    var vals = {
      month: month, unit: u, carry: m.carry, received: m.received, adjusted: m.adjusted, used: m.used, left: m.left,
      closed: true, by: by, at: at
    };
    if (row) { Object.keys(vals).forEach(function (k) { row[k] = vals[k]; }); updates.push(row); }
    else adds.push(vals);
  });
  updateRows_(SHEET.CLOSING, updates);
  appendRows_(SHEET.CLOSING, adds);
  audit_('締め', month, '', '', '', UNITS.map(function (u) { return UNIT_SHORT[u] + ' 月末残数 ' + sum[u].left; }).join('、'));
  regenerateReports_([month], { records: records, force: true, exact: true });
  return { closed: true };
}

/**
 * 締めを解除する（ロックは呼び出し側で取る）。締めシートの行は残し、closed を FALSE にする。
 */
function reopenMonth_(month, reason) {
  reason = String(reason || '').trim();
  if (!reason) throw userError_('締め解除の理由を入力してください');
  var closed = closedMonths_();
  if (!closed[month]) throw userError_(monthLabelLong_(month) + 'は締められていません');
  var later = Object.keys(closed).filter(function (m) { return m > month; }).sort();
  if (later.length) throw userError_('先に' + monthLabelLong_(later[later.length - 1]) + 'の締めを解除してください');
  var rows = readAll_(SHEET.CLOSING).filter(function (c) { return c.month === month && c.closed; });
  rows.forEach(function (c) { c.closed = false; });
  updateRows_(SHEET.CLOSING, rows);
  audit_('締め解除', month, '', '', '', reason);
  // 締めている間に後から届いた明細（closedMonth チェック付き）もふつうの判定に戻す
  var records = readAll_(SHEET.RECORDS);
  var changed = reevaluate_(records, [month], {});
  if (changed.length) updateRows_(SHEET.RECORDS, changed);
  try { regenerateReports_([month], { records: records }); } catch (e) {
    console.error('締め解除後の帳票の再生成に失敗しました: ' + (e && e.stack || e));
  }
  return true;
}

/* ---------------- 通知 ---------------- */

/** 通知先（notify.to が空なら利用者シートの全メール） */
function notifyRecipients_() {
  var to = String(getSetting_('notify.to') || '').split(/[,、;\s]+/).filter(function (x) { return /@/.test(x); });
  if (to.length) return uniq_(to);
  return uniq_(readAll_(SHEET.USERS).map(function (u) { return String(u.email || '').trim(); })
    .filter(function (x) { return /@/.test(x); }));
}

/** 管理者のメール */
function adminEmails_() {
  return readAll_(SHEET.USERS).filter(function (u) { return u.role === ROLE.ADMIN && /@/.test(u.email); })
    .map(function (u) { return String(u.email).trim(); });
}

/** メールを送る（宛先が空なら送らない） */
function sendNotice_(to, subject, body) {
  if (!to || !to.length) { console.warn('通知先がありません: ' + subject); return; }
  MailApp.sendEmail({ to: to.join(','), subject: subject, body: body, name: APP_TITLE });
}

/**
 * 締めのリマインド（毎月1日9時のトリガー入口）。
 * notify.closeRemind が TRUE のとき、前月分の締めのお願い・要確認の残件数・アプリのURLを送る。
 */
function runCloseReminder() {
  guardEntry_();
  actorOverride_ = 'システム';
  try {
    if (getSetting_('notify.closeRemind') === false) return;
    var prev = prevMonth_(thisMonth_());
    if (prev < startMonth_() || closedMonths_()[prev]) return;
    var records = readAll_(SHEET.RECORDS);
    var b = closeBlockingCounts_(records, prev);
    var all = records.filter(isBlocking_).length;
    var url = appUrl_();
    var body = monthLabelLong_(prev) + '分の締めをお願いします。\n\n' +
      '■ ' + monthLabelLong_(prev) + 'の確認が必要な明細：' + b.total + '件（重複 ' + b.dup + '・要確認 ' + b.pend +
      '・誤りの疑い ' + b.warn + '）\n' +
      '■ 全期間の確認が必要な明細：' + all + '件\n\n' +
      (b.total ? '要確認タブで解消してから、帳票タブで「締める」を押してください。' : '帳票タブで「締める」を押してください（管理者）。') +
      (url ? '\n\nアプリ：' + url : '');
    sendNotice_(notifyRecipients_(), '【' + APP_TITLE + '】' + monthLabelLong_(prev) + '分の締めのお願い', body);
  } catch (e) {
    console.error('締めリマインドに失敗しました: ' + (e && e.stack || e));
  }
}
