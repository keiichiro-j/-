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
