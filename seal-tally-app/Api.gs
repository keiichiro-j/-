/**
 * Api.gs
 * 画面（google.script.run）から呼ぶ関数の窓口と権限確認。仕様は docs/API.md。
 * 全関数は { ok:true, data, message } または { ok:false, error } を返す（Date 型は返さない）。
 * 保存系はスクリプトロックの中で行い、締め済みの月の明細・受入調整はサーバー側で変更を拒否する。
 */

/* ================= 共通 ================= */

/** 例外をすべて捕まえて ok:false にする */
function withApi_(fn) {
  try {
    var r = fn();
    if (r && r.__api) return { ok: true, data: r.data, message: r.message || '' };
    return { ok: true, data: r, message: '' };
  } catch (e) {
    if (e && e.userMessage) return { ok: false, error: e.userMessage };
    console.error(e && e.stack || e);
    return { ok: false, error: '処理中にエラーが発生しました（' + (e && e.message || e) + '）' };
  }
}

/** data と画面に出す一言を返す */
function done_(data, message) { return { __api: true, data: data, message: message || '' }; }

/** スクリプトロックの中で実行する（30秒待っても取れなければ理由文で断る） */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) {
    throw userError_('ほかの処理（取込など）が実行中です。しばらくしてからもう一度お試しください');
  }
  try { return fn(); } finally { lock.releaseLock(); }
}

/**
 * 現在の利用者（利用者シートで判定）。一覧にない・役割が不明なら null。
 * @return {{email, name, role}|null}
 */
function currentUser_() {
  var email = currentEmail_().toLowerCase();
  if (!email) return null;
  var found = null;
  readAll_(SHEET.USERS).forEach(function (u) {
    if (String(u.email).trim().toLowerCase() !== email) return;
    if (u.role !== ROLE.ADMIN && u.role !== ROLE.EDITOR) return;
    found = { email: String(u.email).trim(), name: u.name || String(u.email).split('@')[0], role: u.role };
  });
  return found;
}

/**
 * 役割を確認する。role を省略すると利用者一覧にあれば誰でも可。
 * @param {string=} role ROLE.ADMIN | ROLE.EDITOR
 */
function requireRole_(role) {
  var u = currentUser_();
  if (!u) throw userError_('このアカウントには利用権限がありません');
  if (role === ROLE.ADMIN && u.role !== ROLE.ADMIN) throw userError_('この操作は管理者のみ行えます');
  return u;
}

/** 引数の年月（不正・省略なら今月） */
function monthArg_(month) { return isMonthStr_(month) ? month : thisMonth_(); }

/** 締め済みの月を変更しようとしたときの理由文 */
function lockedMsg_(month) {
  return monthLabelLong_(month) + 'は締め済みのため変更できません。修正には管理者による締め解除が必要です';
}

/** 明細を ID で探す */
function findRecord_(records, id) {
  for (var i = 0; i < records.length; i++) if (records[i].id === id) return records[i];
  throw userError_('その明細（' + id + '）は見つかりません');
}

/** 明細シートの1行を画面用（RecordView）にする */
function toView_(r, closed) {
  var v = {};
  Object.keys(r).forEach(function (k) { if (k !== '_row') v[k] = r[k]; });
  v.checks = r.checks || [];
  v.acked = r.acked || [];
  v.dateCandidates = r.dateCandidates || [];
  v.noSeal = !!r.noSeal;
  v.excluded = !!r.excluded;
  v.statusCode = statusCode_(r.status);
  v.month = monthOfRecord_(r);
  v.locked = !!(closed && closed[v.month]);
  return v;
}

/**
 * 変更のあとの共通処理：帳票の再生成（変更月のみ）と残数通知の判定。
 * 失敗しても保存は取り消さず、画面に出す一言を返す。
 */
function afterChange_(months, records) {
  var msgs = [];
  try { regenerateReports_(months, records ? { records: records } : null); } catch (e) {
    console.error(e && e.stack || e);
    msgs.push('帳票の再生成に失敗しました（' + (e && e.message || e) + '）');
  }
  try { checkLowStock_(records); } catch (e) {
    console.error(e && e.stack || e);
    msgs.push('残数通知の判定に失敗しました');
  }
  return msgs.join('／');
}

/** 明細シートの項目名（履歴用） */
function recordFieldLabel_(prop) {
  var label = prop;
  COLUMNS[SHEET.RECORDS].forEach(function (c) { if (c[0] === prop) label = c[1]; });
  return label;
}

/* ================= Payload ================= */

/** 画面全体の再描画用データ（API.md の Payload） */
function buildPayload_(month, user) {
  month = monthArg_(month);
  user = user || currentUser_();
  var s = getSettings_();
  var today = todayStr_();
  var start = startMonth_();
  var records = readAll_(SHEET.RECORDS);
  var closed = closedMonths_();
  var users = readAll_(SHEET.USERS);
  var names = {};
  users.forEach(function (u) { names[String(u.email).toLowerCase()] = u.name || u.email; });
  var history = readAll_(SHEET.HISTORY);

  // 選べる月：開始月〜今月＋明細がある月（新しい順）
  var mset = {};
  for (var m = start, guard = 0; m <= thisMonth_() && guard < 600; m = nextMonth_(m), guard++) mset[m] = true;
  records.forEach(function (r) { var mm = monthOfRecord_(r); if (isMonthStr_(mm)) mset[mm] = true; });
  mset[month] = true;
  var months = Object.keys(mset).sort().reverse();

  var statusOrder = { '重複': 0, '要確認': 1, '誤りの疑い': 2 };
  var review = records.filter(isBlocking_).sort(function (a, b) {
    return (statusOrder[a.status] - statusOrder[b.status]) ||
      (String(a.regDate || '9') < String(b.regDate || '9') ? -1 : String(a.regDate || '9') > String(b.regDate || '9') ? 1 : 0) ||
      byImportOrder_(a, b);
  });

  var ctx = stockCtx_(records);
  var sum = stockSummary_(month, ctx);
  var low = Number(s['notify.lowStock']);
  if (isNaN(low)) low = 10;
  var stock = {};
  UNITS.forEach(function (u) {
    var x = sum[u];
    stock[u] = {
      carry: x.carry, received: x.received, adjusted: x.adjusted, used: x.used, left: x.left,
      negativeDays: x.negativeDays,
      pending: records.filter(function (r) { return r.unit === u && monthOfRecord_(r) === month && isBlocking_(r); }).length,
      low: x.left < low
    };
  });
  var stockRows = ctx.stock.slice().sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (Number(String(b.id).slice(1)) || 0) - (Number(String(a.id).slice(1)) || 0);
  }).map(function (x) {
    return {
      id: x.id, kind: x.kind, date: x.date, unit: x.unit, qty: Number(x.qty) || 0, memo: x.memo, canceled: !!x.canceled,
      by: names[String(x.by).toLowerCase()] || x.by, at: x.at, locked: !!closed[String(x.date).slice(0, 7)]
    };
  });

  var folders = INPUT_FOLDERS.map(function (f) {
    var id = s[f[0]] || '';
    var info = id ? folderInfo_(id, false) : { ok: false, name: '', pending: 0 };
    return {
      key: f[0], label: f[1], brand: f[2], nc: f[3], id: id, url: id ? 'https://drive.google.com/drive/folders/' + id : '',
      name: info.name, ok: info.ok, pending: info.pending
    };
  });

  // 最近の取込ログ（明細・対象外・エラー）
  var log = [];
  records.forEach(function (r) {
    log.push({
      at: r.importedAt, fileName: r.inputType === '手入力' ? '（手入力）' : r.fileName, kind: 'record', recordId: r.id,
      status: r.status, statusCode: statusCode_(r.status), regDate: r.regDate, unit: r.unit, reason: ''
    });
  });
  var skiplog = readAll_(SHEET.SKIPLOG);
  skiplog.forEach(function (x) {
    log.push({
      at: x.at, fileName: x.fileName, kind: 'skip', recordId: '', status: '対象外', statusCode: 'skip',
      regDate: x.regDate, unit: '', reason: x.reason
    });
  });
  history.forEach(function (h) {
    if (h.action !== '取込エラー') return;
    log.push({ at: h.at, fileName: h.note, kind: 'error', recordId: '', status: 'エラー', statusCode: 'error', regDate: '', unit: '', reason: h.after });
  });
  log.sort(function (a, b) { return String(a.at) < String(b.at) ? 1 : String(a.at) > String(b.at) ? -1 : 0; });

  var carry = {};
  UNITS.forEach(function (u) { carry[u] = Number(s['start.carry.' + u]) || 0; });

  return {
    user: user ? { email: user.email, name: user.name, role: user.role } : null,
    today: today,
    month: month,
    months: months,
    records: records.filter(function (r) { return monthOfRecord_(r) === month; }).map(function (r) { return toView_(r, closed); }),
    review: review.map(function (r) { return toView_(r, closed); }),
    stock: stock,
    stockRows: stockRows,
    closings: closed,
    settings: {
      folders: folders,
      autoEnabled: s['auto.enabled'] !== false,
      intervalMin: Number(s['auto.intervalMin']) || 10,
      tolDays: isNaN(Number(s['check.dateToleranceDays'])) ? 7 : Number(s['check.dateToleranceDays']),
      useVin: s['check.useVin'] !== false,
      lowStock: low,
      closeRemind: s['notify.closeRemind'] !== false,
      notifyTo: String(s['notify.to'] || ''),
      startMonth: start,
      startCarry: carry,
      yearly: s['output.yearly'] !== false,
      appUrl: String(s['app.url'] || '')
    },
    areas: groupAreas_(getAreaMaster_()),
    recentLog: log.slice(0, 10),
    importStatus: {
      lastRun: String(s['import.lastRun'] || ''),
      pendingPdf: folders.reduce(function (a, f) { return a + (f.pending || 0); }, 0),
      skippedThisMonth: skiplog.filter(function (x) { return String(x.at).slice(0, 7) === month; }).length,
      nextClose: nextMonth_(thisMonth_()) + '-01'
    },
    users: users.map(function (u) { return { email: u.email, name: u.name, role: u.role }; }),
    settingsHistory: settingsHistory_(history),
    outputFiles: outputFilesFor_(month)
  };
}

/* ================= 明細 ================= */

/** 画面から変更できる明細の項目 */
var EDITABLE_FIELDS_ = ['area', 'cls', 'kana', 'num', 'regDate', 'brand', 'nc', 'noSeal', 'noSealReason', 'manualReason'];
/** 項目を変えたら「問題なし」を取り消す警告コード */
var ACK_RESET_ = { kana: ['kana'], cls: ['cls'], num: ['num'], regDate: ['closed', 'future', 'gap'] };

/** 画面の入力をそろえる（渡された項目だけ） */
function normalizeRecordInput_(p) {
  var str = function (x) { return String(x === null || x === undefined ? '' : x).trim(); };
  var nfkc = function (x) { var s = str(x); return s.normalize ? s.normalize('NFKC') : s; };
  var v = {};
  if ('area' in p) v.area = nfkc(p.area).replace(/\s+/g, '');
  if ('cls' in p) v.cls = nfkc(p.cls).replace(/\s+/g, '').toUpperCase();
  if ('kana' in p) v.kana = str(p.kana).replace(/\s+/g, '');
  if ('num' in p) { var n = nfkc(p.num).replace(/\s+/g, ''); v.num = n ? normalizeSerial_(n) : ''; }
  if ('regDate' in p) v.regDate = str(p.regDate).replace(/\//g, '-');
  if ('brand' in p) v.brand = str(p.brand);
  if ('nc' in p) v.nc = str(p.nc);
  if ('noSeal' in p) v.noSeal = isTrue_(p.noSeal) || p.noSeal === 1;
  if ('noSealReason' in p) v.noSealReason = str(p.noSealReason);
  if ('manualReason' in p) v.manualReason = str(p.manualReason);
  return v;
}

/** 明細の値の形式チェック。理由文の配列を返す */
function validateRecordValues_(r) {
  var errs = [];
  if (r.regDate && !isYmdStr_(r.regDate)) errs.push('登録日の形式が正しくありません（例：2026-10-09）');
  if (r.brand && ['A', 'B'].indexOf(r.brand) < 0) errs.push('ブランドは A または B を選んでください');
  if (r.nc && ['新', '中'].indexOf(r.nc) < 0) errs.push('新中は「新」または「中」を選んでください');
  if (r.kana && r.kana.length !== 1) errs.push('ひらがなは1文字で入力してください');
  if (r.cls && r.cls.length > 4) errs.push('分類番号は3桁以内で入力してください');
  if (r.num && r.num.length > 6) errs.push('一連番号の形式が正しくありません（例：12-34、・・・1）');
  if (r.noSeal && !r.noSealReason) errs.push('封印なしの理由を入力してください');
  if (r.inputType === '手入力' && !r.manualReason) errs.push('手入力の理由を選んでください');
  return errs;
}

/**
 * 明細を1件変更する共通処理（ロック・締めの確認・再判定・書き戻し・履歴・帳票）。
 * @param {string} id 管理ID
 * @param {function(Object, Object[]):{entries:Object[], message:string, noop:boolean}} mutator
 *   r を直接書き換え、履歴に書く行を返す（まだ書かない）
 */
function mutateRecord_(id, mutator) {
  return withLock_(function () {
    var records = readAll_(SHEET.RECORDS);
    var closed = closedMonths_();
    var r = findRecord_(records, id);
    var m0 = monthOfRecord_(r);
    if (closed[m0]) throw userError_(lockedMsg_(m0));
    var res = mutator(r, records) || {};
    if (res.noop) return { record: toView_(r, closed), message: res.message || '変更はありません' };
    var m1 = monthOfRecord_(r);
    if (closed[m1]) throw userError_(lockedMsg_(m1));
    r.updatedBy = actor_();
    r.updatedAt = nowStr_();
    var months = uniq_([m0, m1]);
    var dirty = {};
    dirty[r.id] = r;
    reevaluate_(records, months, closed).forEach(function (x) { dirty[x.id] = x; });
    updateRows_(SHEET.RECORDS, Object.keys(dirty).map(function (k) { return dirty[k]; }));
    auditMany_(res.entries || []);
    var msg = afterChange_(months, records);
    return { record: toView_(r, closed), message: [res.message, msg].filter(function (x) { return x; }).join('／') };
  });
}

/** 明細を1件取得する（詳細パネル用） */
function apiGetRecord(id) {
  return withApi_(function () {
    requireRole_();
    var r = findRecord_(readAll_(SHEET.RECORDS), id);
    return {
      record: toView_(r, closedMonths_()),
      history: historyFor_(id),
      previewUrl: r.fileId ? 'https://drive.google.com/file/d/' + r.fileId + '/preview' : null
    };
  });
}

/** 明細を修正する（修正前後を項目ごとに履歴へ） */
function apiSaveRecord(id, patch, month) {
  return withApi_(function () {
    var user = requireRole_(ROLE.EDITOR);
    var out = mutateRecord_(id, function (r) {
      var v = normalizeRecordInput_(patch || {});
      if (r.inputType !== '手入力') delete v.manualReason;
      var next = {};
      Object.keys(r).forEach(function (k) { next[k] = r[k]; });
      Object.keys(v).forEach(function (k) { next[k] = v[k]; });
      if (!next.noSeal) next.noSealReason = '';
      var errs = validateRecordValues_(next);
      if (errs.length) throw userError_(errs.join('\n'));
      var entries = [];
      EDITABLE_FIELDS_.forEach(function (k) {
        if (auditStr_(r[k]) === auditStr_(next[k])) return;
        entries.push({ action: '修正', target: r.id, field: recordFieldLabel_(k), before: r[k], after: next[k] });
        if (ACK_RESET_[k]) r.acked = (r.acked || []).filter(function (c) { return ACK_RESET_[k].indexOf(c) < 0; });
        r[k] = next[k];
      });
      if (!entries.length) return { noop: true };
      if (r.regDate && (r.dateCandidates || []).length) r.dateCandidates = [];
      var master = getAreaMaster_();
      var msg = '';
      if (autoExcludeIfOutOfScope_(r, master)) {
        entries.push({ action: '自動除外', target: r.id, field: '', before: '', after: '', note: r.excludeReason });
        msg = '集計対象外のナンバーのため、自動で除外にしました';
      }
      return { entries: entries, message: msg || '保存しました' };
    });
    return done_({ payload: buildPayload_(month, user), record: out.record }, out.message);
  });
}

/** 誤りの疑いを「問題なし」として確認する */
function apiAckCheck(id, code, month) {
  return withApi_(function () {
    var user = requireRole_(ROLE.EDITOR);
    var out = mutateRecord_(id, function (r) {
      var c = null;
      (r.checks || []).forEach(function (x) { if (x.code === code) c = x; });
      if (!c || c.level !== LEVEL.WARN) throw userError_('このチェックは「問題なし」にできません');
      if ((r.acked || []).indexOf(code) >= 0) return { noop: true, message: 'すでに確認済みです' };
      r.acked = (r.acked || []).concat([code]);
      return {
        entries: [{ action: '問題なしとして確認', target: r.id, field: '', before: '', after: code, note: c.title }],
        message: '問題なしとして確認しました'
      };
    });
    return done_({ payload: buildPayload_(month, user), record: out.record }, out.message);
  });
}

/** 明細を除外する（理由必須） */
function apiExclude(id, reason, month) {
  return withApi_(function () {
    var user = requireRole_(ROLE.EDITOR);
    reason = String(reason || '').trim();
    if (!reason) throw userError_('除外の理由を入力してください');
    var out = mutateRecord_(id, function (r) {
      if (r.excluded) return { noop: true, message: 'すでに除外されています' };
      r.excluded = true;
      r.excludeReason = reason;
      return { entries: [{ action: '除外', target: r.id, field: '', before: '', after: '', note: reason }], message: '除外しました' };
    });
    return done_({ payload: buildPayload_(month, user), record: out.record }, out.message);
  });
}

/** 除外を取り消す */
function apiRestore(id, month) {
  return withApi_(function () {
    var user = requireRole_(ROLE.EDITOR);
    var out = mutateRecord_(id, function (r) {
      if (!r.excluded) return { noop: true, message: '除外されていません' };
      if (r.brand && r.area && classifyUnit_(r.brand, r.area, getAreaMaster_()).result === 'skip') {
        throw userError_('集計対象外のナンバーのため除外を取り消せません。登録番号を修正してから取り消してください');
      }
      var before = r.excludeReason;
      r.excluded = false;
      r.excludeReason = '';
      return { entries: [{ action: '除外の取り消し', target: r.id, field: '', before: '', after: '', note: before }], message: '除外を取り消しました' };
    });
    return done_({ payload: buildPayload_(month, user), record: out.record }, out.message);
  });
}

/** 手入力で明細を追加する（M＋4桁、全項目必須） */
function apiAddManual(input, month) {
  return withApi_(function () {
    var user = requireRole_(ROLE.EDITOR);
    var v = normalizeRecordInput_(input || {});
    var labels = { area: '地域名', cls: '分類番号', kana: 'ひらがな', num: '一連番号', regDate: '封印した日', brand: 'ブランド', nc: '新中', manualReason: '手入力の理由' };
    var missing = Object.keys(labels).filter(function (k) { return !v[k]; }).map(function (k) { return labels[k]; });
    if (missing.length) throw userError_('次の項目を入力してください：' + missing.join('、'));
    v.inputType = '手入力';
    var errs = validateRecordValues_(v);
    if (errs.length) throw userError_(errs.join('\n'));
    var master = getAreaMaster_();
    var c = classifyUnit_(v.brand, v.area, master);
    if (c.result === 'skip') throw userError_('集計対象外のナンバーです（' + c.reason + '）');

    var record = withLock_(function () {
      var closed = closedMonths_();
      var m = v.regDate.slice(0, 7);
      if (closed[m]) throw userError_(lockedMsg_(m));
      var records = readAll_(SHEET.RECORDS);
      var now = nowStr_();
      var by = actor_();
      var r = {
        id: nextRecordId_('M', records), regDate: v.regDate, area: v.area, cls: v.cls, kana: v.kana, num: v.num,
        brand: v.brand, nc: v.nc, unit: '', vin: '', status: '', checks: [], acked: [], noSeal: false, noSealReason: '',
        inputType: '手入力', manualReason: v.manualReason, excluded: false, excludeReason: '', dateCandidates: [],
        fileId: '', fileName: '', savedDate: '', importedAt: now, updatedBy: by, updatedAt: now
      };
      records.push(r);
      var changed = reevaluate_(records, [m], closed);
      appendRows_(SHEET.RECORDS, [r]);
      updateRows_(SHEET.RECORDS, changed.filter(function (x) { return x !== r; }));
      audit_('手入力', r.id, '', '', '', platePrint_(r) + ' ' + r.regDate + ' ' + r.brand + r.nc + '（' + r.manualReason + '）');
      var msg = afterChange_([m], records);
      return { record: toView_(r, closed), message: msg };
    });
    return done_({ payload: buildPayload_(month, user), record: record.record },
      ['手入力で追加しました（' + record.record.id + '）', record.message].filter(function (x) { return x; }).join('／'));
  });
}

/* ================= 受入・調整 ================= */

/** 受入・調整を登録する */
function apiAddStock(input, month) {
  return withApi_(function () {
    var user = requireRole_(ROLE.EDITOR);
    var msg = withLock_(function () {
      var row = addStock_(input);
      return afterChange_([String(row.date).slice(0, 7)]);
    });
    return done_({ payload: buildPayload_(month, user) }, ['登録しました', msg].filter(function (x) { return x; }).join('／'));
  });
}

/** 受入・調整の取消 ⇔ 取消の取り消し */
function apiToggleStock(id, month) {
  return withApi_(function () {
    var user = requireRole_(ROLE.EDITOR);
    var res = withLock_(function () {
      var row = toggleStock_(id);
      return { row: row, msg: afterChange_([String(row.date).slice(0, 7)]) };
    });
    return done_({ payload: buildPayload_(month, user) },
      [res.row.canceled ? '取り消しました' : '取消を取り消しました', res.msg].filter(function (x) { return x; }).join('／'));
  });
}

/* ================= 帳票・締め ================= */

/** 帳票タブのプレビュー（ReportData） */
function apiGetReport(month) {
  return withApi_(function () {
    requireRole_();
    return reportDataFor_(monthArg_(month));
  });
}

/** 月を締める（管理者） */
function apiCloseMonth(month) {
  return withApi_(function () {
    var user = requireRole_(ROLE.ADMIN);
    if (!isMonthStr_(month)) throw userError_('年月の指定が正しくありません');
    var r = withLock_(function () { return closeMonth_(month); });
    if (!r.closed) {
      return done_({ closed: false, blocking: r.blocking },
        '確認が必要な明細が' + r.blocking.total + '件あるため締められません');
    }
    return done_({ closed: true, payload: buildPayload_(month, user) }, monthLabelLong_(month) + 'を締めました');
  });
}

/** 締めを解除する（管理者・理由必須） */
function apiReopenMonth(month, reason) {
  return withApi_(function () {
    var user = requireRole_(ROLE.ADMIN);
    if (!isMonthStr_(month)) throw userError_('年月の指定が正しくありません');
    withLock_(function () { reopenMonth_(month, reason); });
    return done_({ payload: buildPayload_(month, user) }, monthLabelLong_(month) + 'の締めを解除しました');
  });
}

/** 提出用に出力する（要確認が残っていれば ok:false） */
function apiExportSubmission(month) {
  return withApi_(function () {
    requireRole_(ROLE.EDITOR);
    if (!isMonthStr_(month)) throw userError_('年月の指定が正しくありません');
    var r = withLock_(function () { return exportSubmission_(month); });
    return done_(r, r.files.length + '件のPDFを「提出用/' + month + '」フォルダに保存しました');
  });
}

/* ================= 設定 ================= */

/** フォルダURLの確認（名前と未処理PDF件数） */
function apiCheckFolder(urlOrId) {
  return withApi_(function () {
    requireRole_(ROLE.ADMIN);
    var id = parseFolderId_(urlOrId);
    var info = id ? folderInfo_(id, true) : { ok: false };
    if (!info.ok) throw userError_('フォルダが見つからないか、権限がありません');
    return { id: id, url: 'https://drive.google.com/drive/folders/' + id, name: info.name, pending: info.pending };
  });
}

/** 0 以上の整数か */
function isNonNegInt_(v) { var n = Number(v); return String(v).trim() !== '' && n >= 0 && Math.floor(n) === n; }

/** 設定を保存する（フォルダはすべて確認し、1つでも失敗したら保存しない） */
function apiSaveSettings(input, month) {
  return withApi_(function () {
    var user = requireRole_(ROLE.ADMIN);
    input = input || {};
    var errs = [];
    var obj = {};
    var folders = input.folders || {};
    var seen = {};
    INPUT_FOLDERS.forEach(function (f) {
      if (!(f[0] in folders)) return;
      var raw = String(folders[f[0]] || '').trim();
      if (!raw) { obj[f[0]] = ''; return; }
      var id = parseFolderId_(raw);
      var info = id ? folderInfo_(id, true) : { ok: false };
      if (!info.ok) { errs.push(f[1] + '：フォルダが見つからないか、権限がありません'); return; }
      if (seen[id]) errs.push(f[1] + '：' + seen[id] + 'と同じフォルダは指定できません');
      seen[id] = f[1];
      obj[f[0]] = id;
    });
    if ('autoEnabled' in input) obj['auto.enabled'] = settingStr_(!!input.autoEnabled);
    if ('intervalMin' in input) {
      var iv = Number(input.intervalMin);
      if ([5, 10, 15, 30].indexOf(iv) < 0) errs.push('実行間隔は5・10・15・30分から選んでください');
      else obj['auto.intervalMin'] = String(iv);
    }
    if ('tolDays' in input) {
      if (!isNonNegInt_(input.tolDays) || Number(input.tolDays) < 1 || Number(input.tolDays) > 60) errs.push('日付の許容差は1〜60の整数で入力してください');
      else obj['check.dateToleranceDays'] = String(Number(input.tolDays));
    }
    if ('useVin' in input) obj['check.useVin'] = settingStr_(!!input.useVin);
    if ('lowStock' in input) {
      if (!isNonNegInt_(input.lowStock) || Number(input.lowStock) < 1 || Number(input.lowStock) > 1000) errs.push('残数通知のしきい値は1〜1000の整数で入力してください');
      else obj['notify.lowStock'] = String(Number(input.lowStock));
    }
    if ('closeRemind' in input) obj['notify.closeRemind'] = settingStr_(!!input.closeRemind);
    if ('notifyTo' in input) {
      var to = String(input.notifyTo || '').split(/[,、;\s]+/).filter(function (x) { return x; });
      var bad = to.filter(function (x) { return !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); });
      if (bad.length) errs.push('通知先のメールアドレスが正しくありません：' + bad.join('、'));
      else obj['notify.to'] = to.join(', ');
    }
    if (input.startCarry) {
      UNITS.forEach(function (u) {
        if (!(u in input.startCarry)) return;
        if (!isNonNegInt_(input.startCarry[u])) errs.push(UNIT_LABELS[u] + 'の繰越数は0以上の整数で入力してください');
        else obj['start.carry.' + u] = String(Number(input.startCarry[u]));
      });
    }
    if ('yearly' in input) obj['output.yearly'] = settingStr_(!!input.yearly);
    if ('appUrl' in input) {
      var url = String(input.appUrl || '').trim();
      if (url && !/^https:\/\//.test(url)) errs.push('WebアプリのURLは https:// から入力してください');
      else obj['app.url'] = url;
    }
    if (errs.length) throw userError_(errs.join('\n'));

    var msg = withLock_(function () {
      var changes = setSettings_(obj);
      if (!changes.length) return '変更はありません';
      auditMany_(changes.map(function (c) {
        return { action: '設定変更', target: c.key, field: c.key, before: c.before, after: c.after };
      }));
      var keys = changes.map(function (c) { return c.key; });
      var has = function (re) { return keys.some(function (k) { return re.test(k); }); };
      var notes = [];
      if (has(/^folder\./)) clearFolderCache_();
      if (has(/^auto\./)) {
        try { reinstallTriggers_(); } catch (e) { notes.push('トリガーの再設定に失敗しました（' + e.message + '）'); }
      }
      var closed = closedMonths_();
      var regen = [];
      var records = null;
      if (has(/^check\./)) {
        records = readAll_(SHEET.RECORDS);
        var ms = uniq_(records.map(monthOfRecord_));
        var changed = reevaluate_(records, ms, closed);
        updateRows_(SHEET.RECORDS, changed);
        regen = regen.concat(changed.map(monthOfRecord_));
      }
      if (has(/^start\.carry\./) || has(/^output\.yearly$/)) {
        for (var m = startMonth_(), g = 0; m <= thisMonth_() && g < 600; m = nextMonth_(m), g++) {
          if (!closed[m] || has(/^output\.yearly$/)) regen.push(m);
        }
      }
      if (regen.length || has(/^notify\.lowStock$/) || has(/^start\.carry\./)) {
        var am = afterChange_(uniq_(regen), records);
        if (am) notes.push(am);
      }
      return ['設定を保存しました'].concat(notes).join('／');
    });
    return done_({ payload: buildPayload_(month, user) }, msg);
  });
}

/** 地域名マスタを保存する */
function apiSaveAreas(areas, month) {
  return withApi_(function () {
    var user = requireRole_(ROLE.ADMIN);
    areas = areas || {};
    var kinds = [AREA_KIND.GIFU, AREA_KIND.AICHI, AREA_KIND.OTHER];
    var rows = [];
    var seen = {};
    var errs = [];
    kinds.forEach(function (k) {
      (areas[k] || []).forEach(function (a) {
        var name = String(a || '').trim();
        if (name.normalize) name = name.normalize('NFKC');
        name = name.replace(/\s+/g, '');
        if (!name) return;
        if (!/^[一-鿿々ぁ-ゖァ-ヺー]{1,6}$/.test(name)) { errs.push('「' + name + '」は地域名として使えません'); return; }
        if (seen[name]) { errs.push('「' + name + '」が「' + seen[name] + '」と「' + k + '」の両方にあります'); return; }
        seen[name] = k;
        rows.push({ area: name, kind: k });
      });
    });
    if (!rows.some(function (r) { return r.kind === AREA_KIND.GIFU; })) errs.push('岐阜県の地域名を1つ以上入れてください');
    if (errs.length) throw userError_(errs.join('\n'));

    var msg = withLock_(function () {
      var before = groupAreas_(getAreaMaster_());
      var after = {};
      kinds.forEach(function (k) { after[k] = rows.filter(function (r) { return r.kind === k; }).map(function (r) { return r.area; }); });
      var entries = [];
      kinds.forEach(function (k) {
        var b = before[k] || [];
        var added = after[k].filter(function (x) { return b.indexOf(x) < 0; });
        var removed = b.filter(function (x) { return after[k].indexOf(x) < 0; });
        if (!added.length && !removed.length) return;
        entries.push({
          action: '地域名マスタ変更', target: k, field: '', before: b.join('、'), after: after[k].join('、'),
          note: k + (added.length ? '：追加 ' + added.join('、') : '') + (removed.length ? '：削除 ' + removed.join('、') : '')
        });
      });
      if (!entries.length) return '変更はありません';
      writeRows_(SHEET.AREAS, rows);
      auditMany_(entries);

      // 締めていない月の明細を判定し直す（対象外になったものは自動除外）
      var master = getAreaMaster_();
      var closed = closedMonths_();
      var records = readAll_(SHEET.RECORDS);
      var dirty = {};
      var ex = [];
      records.forEach(function (r) {
        if (closed[monthOfRecord_(r)]) return;
        if (autoExcludeIfOutOfScope_(r, master)) {
          dirty[r.id] = r;
          ex.push({ action: '自動除外', target: r.id, field: '', before: '', after: '', note: r.excludeReason + '（地域名マスタの変更）' });
        }
      });
      var changed = reevaluate_(records, uniq_(records.map(monthOfRecord_)), closed);
      changed.forEach(function (r) { dirty[r.id] = r; });
      var list = Object.keys(dirty).map(function (k) { return dirty[k]; });
      updateRows_(SHEET.RECORDS, list);
      auditMany_(ex);
      var am = list.length ? afterChange_(uniq_(list.map(monthOfRecord_)), records) : '';
      return ['地域名マスタを保存しました' + (list.length ? '（' + list.length + '件の明細を判定し直しました）' : ''), am]
        .filter(function (x) { return x; }).join('／');
    });
    return done_({ payload: buildPayload_(month, user) }, msg);
  });
}

/** 利用者と権限を保存する（管理者が最低1人。自分を管理者から外すことはできない） */
function apiSaveUsers(users, month) {
  return withApi_(function () {
    var user = requireRole_(ROLE.ADMIN);
    var errs = [];
    var seen = {};
    var rows = [];
    (users || []).forEach(function (u) {
      var email = String(u && u.email || '').trim();
      if (!email) return;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { errs.push('メールアドレスが正しくありません：' + email); return; }
      if (seen[email.toLowerCase()]) { errs.push('同じメールアドレスが2回あります：' + email); return; }
      seen[email.toLowerCase()] = true;
      var role = String(u.role || '').trim();
      if (role !== ROLE.ADMIN && role !== ROLE.EDITOR) { errs.push(email + 'の役割は「管理者」か「編集者」を選んでください'); return; }
      rows.push({ email: email, name: String(u.name || '').trim() || email.split('@')[0], role: role });
    });
    if (!rows.some(function (r) { return r.role === ROLE.ADMIN; })) errs.push('管理者を1人以上指定してください');
    var me = rows.filter(function (r) { return r.email.toLowerCase() === user.email.toLowerCase(); })[0];
    if (!me || me.role !== ROLE.ADMIN) errs.push('自分自身を管理者から外すことはできません');
    if (errs.length) throw userError_(errs.join('\n'));

    var msg = withLock_(function () {
      var before = readAll_(SHEET.USERS);
      var bmap = {};
      before.forEach(function (u) { bmap[String(u.email).toLowerCase()] = u; });
      var notes = [];
      rows.forEach(function (r) {
        var b = bmap[r.email.toLowerCase()];
        if (!b) notes.push('追加 ' + r.email + '（' + r.role + '）');
        else if (b.role !== r.role) notes.push(r.email + ' の役割 ' + b.role + ' → ' + r.role);
        else if (b.name !== r.name) notes.push(r.email + ' の名前 ' + b.name + ' → ' + r.name);
        delete bmap[r.email.toLowerCase()];
      });
      Object.keys(bmap).forEach(function (k) { notes.push('削除 ' + bmap[k].email); });
      if (!notes.length) return '変更はありません';
      writeRows_(SHEET.USERS, rows);
      audit_('利用者変更', '', '', '', '', notes.join('、'));
      return '利用者を保存しました';
    });
    return done_({ payload: buildPayload_(month, user) }, msg);
  });
}

/* ================= 取込 ================= */

/** 今すぐ取込 */
function apiRunImportNow(month) {
  return withApi_(function () {
    var user = requireRole_(ROLE.EDITOR);
    var r = importNow_();
    if (r.busy) throw userError_('取込などの処理が実行中です。しばらくしてからもう一度お試しください');
    var result = { imported: r.imported, skipped: r.skipped, review: r.review, errors: r.errors, remaining: r.remaining };
    var msg = '取込 ' + r.imported + '件（うち要確認 ' + r.review + '件）・対象外 ' + r.skipped + '件' +
      (r.errors ? '・エラー ' + r.errors + '件' : '') + (r.remaining ? '・残り ' + r.remaining + '件は次回に取り込みます' : '');
    return done_({ payload: buildPayload_(month, user), result: result }, msg);
  });
}

/** 画面の初期表示 */
function apiBootstrap(month) {
  return withApi_(function () {
    var user = requireRole_();
    return buildPayload_(monthArg_(month), user);
  });
}
