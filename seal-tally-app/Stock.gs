/**
 * Stock.gs
 * 受入・調整、繰越、残数、残数通知。
 * 前半は純粋関数（単体テスト対象）、後半は GAS のサービスを使う処理。
 */

/* ================= 純粋関数 ================= */

function nextMonth_(ym) {
  var p = ym.split('-').map(Number);
  var y = p[0], m = p[1] + 1;
  if (m > 12) { m = 1; y++; }
  return y + '-' + pad2_(m);
}
function prevMonth_(ym) {
  var p = ym.split('-').map(Number);
  var y = p[0], m = p[1] - 1;
  if (m < 1) { m = 12; y--; }
  return y + '-' + pad2_(m);
}
function daysInMonth_(ym) {
  var p = ym.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
}
function monthDays_(ym) {
  var out = [];
  for (var d = 1, n = daysInMonth_(ym); d <= n; d++) out.push(ym + '-' + pad2_(d));
  return out;
}

/** 有効な受入・調整だけを返す */
function activeStock_(stock, unit) {
  return stock.filter(function (x) { return !isTrue_(x.canceled) && x.unit === unit; });
}

function isTrue_(v) { return v === true || v === 'TRUE' || v === 'true'; }

/**
 * ある集計単位・月の日ごとの動きを計算する。
 * @param {string} unit
 * @param {string} month "yyyy-MM"
 * @param {number} carry 前月からの繰越
 * @param {Object[]} stock 受入調整の行（{kind:'受入'|'調整', date, unit, qty, canceled}）
 * @param {Object[]} records 明細
 * @return {{carry, received, adjusted, used, left, days:Object[], negativeDays:string[]}}
 */
function monthMovement_(unit, month, carry, stock, records) {
  var st = activeStock_(stock, unit).filter(function (x) { return String(x.date).slice(0, 7) === month; });
  var used = {};
  records.forEach(function (r) {
    if (r.unit === unit && countsAsSealed_(r) && String(r.regDate).slice(0, 7) === month) {
      used[r.regDate] = (used[r.regDate] || 0) + 1;
    }
  });
  var bal = Number(carry) || 0;
  var tr = 0, ta = 0, tu = 0;
  var negative = [];
  var days = monthDays_(month).map(function (d) {
    var rcv = 0, adj = 0;
    st.forEach(function (x) {
      if (String(x.date).slice(0, 10) !== d) return;
      if (x.kind === '調整') adj += Number(x.qty) || 0; else rcv += Number(x.qty) || 0;
    });
    var u = used[d] || 0;
    bal += rcv - adj - u;
    tr += rcv; ta += adj; tu += u;
    if (bal < 0) negative.push(d);
    return { date: d, received: rcv, adjusted: adj, used: u, balance: bal };
  });
  return { carry: Number(carry) || 0, received: tr, adjusted: ta, used: tu, left: bal, days: days, negativeDays: negative };
}

/**
 * 月初の繰越を求める。
 * 開始月は start.carry、締め済みの月の翌月は締めの確定値、それ以外は前月から計算する。
 * @param {Object} ctx {startMonth, startCarry:{A,B,AI}, closings:{'yyyy-MM':{A:{left},...}}, stock, records}
 */
function carryFor_(unit, month, ctx) {
  if (month <= ctx.startMonth) return Number(ctx.startCarry[unit]) || 0;
  var m = ctx.startMonth;
  var carry = Number(ctx.startCarry[unit]) || 0;
  while (m < month) {
    var closed = ctx.closings && ctx.closings[m] && ctx.closings[m][unit];
    if (closed && closed.left !== '' && closed.left != null) {
      carry = Number(closed.left);
    } else {
      carry = monthMovement_(unit, m, carry, ctx.stock, ctx.records).left;
    }
    m = nextMonth_(m);
  }
  return carry;
}

/** ある月の集計単位ごとの集計 {A:{carry,received,adjusted,used,left,days,negativeDays}, ...} */
function stockSummary_(month, ctx) {
  var out = {};
  UNITS.forEach(function (u) {
    out[u] = monthMovement_(u, month, carryFor_(u, month, ctx), ctx.stock, ctx.records);
  });
  return out;
}

/**
 * 残数通知の判定。しきい値を下回った時点で1回だけ送り、回復したらフラグを戻す。
 * @return {{send:boolean, flag:boolean}}
 */
function lowStockDecision_(left, threshold, sentFlag) {
  var low = Number(left) < Number(threshold);
  return { send: low && !sentFlag, flag: low };
}

/** 受入・調整の入力チェック。エラーなら理由文の配列 */
function validateStockInput_(input, closedMonths) {
  var errs = [];
  if (input.kind !== '受入' && input.kind !== '調整') errs.push('種類を選んでください');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date || ''))) errs.push('日付を入力してください');
  if (UNITS.indexOf(input.unit) < 0) errs.push('集計単位を選んでください');
  var q = Number(input.qty);
  if (!(q >= 1) || Math.floor(q) !== q) errs.push('個数は1以上の整数で入力してください');
  if (input.kind === '調整' && !String(input.memo || '').trim()) errs.push('調整のときはメモ（理由）を入力してください');
  if (input.date && closedMonths && closedMonths[String(input.date).slice(0, 7)]) errs.push('締め済みの月には登録できません');
  return errs;
}

/* ================= GAS 処理 ================= */

/**
 * 残数計算用の ctx を作る（startMonth/startCarry/closings/stock/records）。
 * closings は締め済み（closed=TRUE）の行だけを {yyyy-MM: {A:{left}, ...}} にまとめる。
 * @param {Object[]=} records 読み込み済みの明細
 */
function stockCtx_(records) {
  var s = getSettings_();
  var closings = {};
  readAll_(SHEET.CLOSING).forEach(function (c) {
    if (!c.closed || !c.month || !c.unit) return;
    (closings[c.month] = closings[c.month] || {})[c.unit] = { left: c.left };
  });
  var carry = {};
  UNITS.forEach(function (u) { carry[u] = Number(s['start.carry.' + u]) || 0; });
  return {
    startMonth: startMonth_(),
    startCarry: carry,
    closings: closings,
    stock: readAll_(SHEET.STOCK),
    records: records || readAll_(SHEET.RECORDS)
  };
}

/**
 * 受入・調整を登録する（ロックは呼び出し側で取る）。
 * @param {{kind, date, unit, qty, memo}} input
 * @return {Object} 追加した行
 */
function addStock_(input) {
  input = input || {};
  var clean = {
    kind: String(input.kind || ''), date: String(input.date || '').trim(), unit: String(input.unit || ''),
    qty: Number(input.qty), memo: String(input.memo || '').trim()
  };
  var errs = validateStockInput_(clean, closedMonths_());
  if (!errs.length && !isYmdStr_(clean.date)) errs.push('日付を正しく入力してください');
  if (!errs.length && clean.date.slice(0, 7) < startMonth_()) errs.push('稼働開始月より前の日付は登録できません');
  if (errs.length) throw userError_(errs.join('\n'));
  var rows = readAll_(SHEET.STOCK);
  var row = {
    id: nextStockId_(rows), kind: clean.kind, date: clean.date, unit: clean.unit, qty: clean.qty,
    memo: clean.memo, canceled: false, by: actor_(), at: nowStr_()
  };
  appendRows_(SHEET.STOCK, [row]);
  audit_(clean.kind + '登録', row.id, '', '', '',
    UNIT_LABELS[clean.unit] + ' ' + clean.date + ' ' + (clean.kind === '調整' ? '−' : '+') + clean.qty + '個' +
    (clean.memo ? '（' + clean.memo + '）' : ''));
  return row;
}

/**
 * 受入・調整の取消 ⇔ 取消の取り消し（ロックは呼び出し側で取る）。
 * @return {Object} 更新後の行
 */
function toggleStock_(id) {
  var rows = readAll_(SHEET.STOCK);
  var row = null;
  rows.forEach(function (x) { if (x.id === id) row = x; });
  if (!row) throw userError_('その受入・調整の記録は見つかりません');
  if (closedMonths_()[String(row.date).slice(0, 7)]) throw userError_('締め済みの月の受入・調整は変更できません');
  var before = row.canceled;
  row.canceled = !row.canceled;
  updateRows_(SHEET.STOCK, [row]);
  audit_(row.canceled ? row.kind + 'の取消' : '取消の取り消し', row.id, '取消', before, row.canceled,
    UNIT_LABELS[row.unit] + ' ' + row.date + ' ' + row.qty + '個');
  return row;
}

/** 集計単位の直近の受入日（取消を除く。無ければ空） */
function lastReceiptDate_(stock, unit) {
  var last = '';
  activeStock_(stock, unit).forEach(function (x) {
    if (x.kind !== '調整' && String(x.date) > last) last = String(x.date);
  });
  return last;
}

/**
 * 残数通知の判定と送信。しきい値を下回った時点で1回だけ送り、
 * 回復したら送信済みフラグ（notify.lowSent.*）を戻す。
 * @param {Object[]=} records 読み込み済みの明細
 */
function checkLowStock_(records) {
  var month = thisMonth_();
  if (month < startMonth_()) return;
  var s = getSettings_();
  var ctx = stockCtx_(records);
  var sum = stockSummary_(month, ctx);
  var th = Number(s['notify.lowStock']);
  if (isNaN(th)) th = 10;
  var updates = {};
  var toSend = [];
  UNITS.forEach(function (u) {
    var key = 'notify.lowSent.' + u;
    var sent = isTrue_(s[key]);
    var d = lowStockDecision_(sum[u].left, th, sent);
    if (d.send) toSend.push(u);
    else if (d.flag !== sent) updates[key] = d.flag ? 'TRUE' : 'FALSE';
  });
  if (toSend.length) {
    var lines = toSend.map(function (u) {
      var last = lastReceiptDate_(ctx.stock, u);
      return '・' + UNIT_LABELS[u] + '：現在の残数 ' + sum[u].left + '個（直近の受入日：' +
        (last ? wareki_(last) : 'なし') + '）';
    });
    var body = '封印の残数が ' + th + '個 を下回りました。\n\n' + lines.join('\n') +
      '\n\n支局からの受入を手配してください。受入後はアプリの「受入・調整」で登録してください。' +
      (s['app.url'] ? '\n\nアプリ：' + s['app.url'] : '');
    try {
      sendNotice_(notifyRecipients_(), '【' + APP_TITLE + '】封印の残数が少なくなっています', body);
      toSend.forEach(function (u) { updates['notify.lowSent.' + u] = 'TRUE'; });
    } catch (e) {
      console.error('残数通知の送信に失敗しました: ' + e);
    }
  }
  if (Object.keys(updates).length) setSettings_(updates);
}
