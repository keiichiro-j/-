/**
 * Repo.gs
 * 管理用スプレッドシートの読み書き（行⇔オブジェクト変換、一括読み込み・一括書き込み）、
 * 採番、日時の文字列化、祝日の取得。
 * シートはすべて getValues / setValues でまとめて読み書きし、セル単位のループはしない。
 */

var TZ_ = 'Asia/Tokyo';

/** 列の種類（COLUMNS のプロパティ名） */
var DATE_COLS_ = ['regDate', 'date', 'savedDate'];
var DATETIME_COLS_ = ['at', 'importedAt', 'updatedAt'];
var BOOL_COLS_ = ['noSeal', 'excluded', 'canceled', 'closed'];
var NUM_COLS_ = ['qty', 'carry', 'received', 'adjusted', 'used', 'left', 'seq'];
var JSON_COLS_ = ['checks'];
var LIST_COLS_ = ['acked', 'dateCandidates'];

/* ---------------- 日時・共通 ---------------- */

/** Date を指定書式の文字列に */
function fmtDate_(d, pattern) { return Utilities.formatDate(d, TZ_, pattern); }
/** 現在日時 "yyyy-MM-dd HH:mm" */
function nowStr_() { return fmtDate_(new Date(), 'yyyy-MM-dd HH:mm'); }
/** 今日 "yyyy-MM-dd" */
function todayStr_() { return fmtDate_(new Date(), 'yyyy-MM-dd'); }
/** 今月 "yyyy-MM" */
function thisMonth_() { return fmtDate_(new Date(), 'yyyy-MM'); }
/** "yyyy-MM" の形式か */
function isMonthStr_(m) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || '')); }
/** "yyyy-MM-dd" の形式で実在する日付か */
function isYmdStr_(d) {
  var m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return !!m && !!ymd_(Number(m[1]), Number(m[2]), Number(m[3]));
}
/** 稼働開始月（設定が日付に化けていても "yyyy-MM" にそろえる） */
function startMonth_() {
  var v = String(getSetting_('start.month') || '').slice(0, 7);
  return isMonthStr_(v) ? v : '2026-10';
}

/** WebアプリのURL（app.url が空ならデプロイのURL。取れなければ空） */
function appUrl_() {
  var url = String(getSetting_('app.url') || '').trim();
  if (url) return url;
  try { return String(ScriptApp.getService().getUrl() || ''); } catch (e) { return ''; }
}

/** 利用者に見せる理由文つきの例外を作る（Api の withApi_ がそのまま画面に返す） */
function userError_(msg) {
  var e = new Error(msg);
  e.userMessage = msg;
  return e;
}

/** 配列の重複を除く */
function uniq_(list) {
  return list.filter(function (x, i) { return list.indexOf(x) === i; });
}

/* ---------------- シート ---------------- */

/** 管理用スプレッドシート（バインド前提） */
function getSs_() { return SpreadsheetApp.getActiveSpreadsheet(); }

/**
 * シートを返す。無ければ作成して見出し行を書く。
 * データ列は文字列書式（@）にして、日付や「12-13」が日付に変換されないようにする。
 */
function getSheet_(name) {
  var ss = getSs_();
  var sheet = ss.getSheetByName(name);
  var cols = COLUMNS[name];
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (cols) {
      sheet.getRange(1, 1, sheet.getMaxRows(), cols.length).setNumberFormat('@');
      sheet.getRange(1, 1, 1, cols.length)
        .setValues([cols.map(function (c) { return c[1]; })])
        .setFontWeight('bold').setBackground('#E2F0E9');
      sheet.setFrozenRows(1);
    }
  } else if (cols && sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, sheet.getMaxRows(), cols.length).setNumberFormat('@');
    sheet.getRange(1, 1, 1, cols.length).setValues([cols.map(function (c) { return c[1]; })]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** 見出し行からプロパティ名の並びを作る（不明な見出しは null） */
function headerProps_(name, header) {
  var cols = COLUMNS[name] || [];
  var byLabel = {};
  cols.forEach(function (c) { byLabel[c[1]] = c[0]; byLabel[c[0]] = c[0]; });
  var props = header.map(function (h) { return byLabel[String(h).trim()] || null; });
  if (!props.some(function (p) { return p; })) return cols.map(function (c) { return c[0]; });
  return props;
}

/** シートの見出し行を読み、プロパティ名の並びを返す */
function sheetProps_(sheet, name) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  return headerProps_(name, header);
}

/** セルの値 → オブジェクトの値 */
function fromCell_(prop, v) {
  if (BOOL_COLS_.indexOf(prop) >= 0) return isTrue_(v) || v === 1;
  if (NUM_COLS_.indexOf(prop) >= 0) {
    if (v === '' || v === null || v === undefined) return '';
    var n = Number(v);
    return isNaN(n) ? '' : n;
  }
  if (JSON_COLS_.indexOf(prop) >= 0) {
    if (Array.isArray(v)) return v;
    if (!v) return [];
    try { var p = JSON.parse(String(v)); return Array.isArray(p) ? p : []; } catch (e) { return []; }
  }
  if (LIST_COLS_.indexOf(prop) >= 0) {
    if (Array.isArray(v)) return v;
    return String(v || '').split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x; });
  }
  if (v instanceof Date) {
    if (DATE_COLS_.indexOf(prop) >= 0) return fmtDate_(v, 'yyyy-MM-dd');
    if (DATETIME_COLS_.indexOf(prop) >= 0) return fmtDate_(v, 'yyyy-MM-dd HH:mm');
    if (prop === 'month') return fmtDate_(v, 'yyyy-MM');
    var hm = fmtDate_(v, 'HH:mm');
    return fmtDate_(v, hm === '00:00' ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm');
  }
  if (v === null || v === undefined) return '';
  return String(v);
}

/** オブジェクトの値 → セルの値 */
function toCell_(prop, v) {
  if (v === null || v === undefined) return '';
  if (JSON_COLS_.indexOf(prop) >= 0) return typeof v === 'string' ? v : JSON.stringify(v);
  if (LIST_COLS_.indexOf(prop) >= 0) return Array.isArray(v) ? v.join(',') : String(v);
  if (BOOL_COLS_.indexOf(prop) >= 0) return isTrue_(v) ? 'TRUE' : 'FALSE';
  if (v instanceof Date) {
    return fmtDate_(v, DATE_COLS_.indexOf(prop) >= 0 ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm');
  }
  return v;
}

/** 項目の初期値 */
function emptyOf_(prop) {
  if (BOOL_COLS_.indexOf(prop) >= 0) return false;
  if (JSON_COLS_.indexOf(prop) >= 0 || LIST_COLS_.indexOf(prop) >= 0) return [];
  return '';
}

/**
 * シートの全行をオブジェクトの配列で返す（行番号 _row 付き）。
 * Date は 登録日/日付/保存日 → "yyyy-MM-dd"、日時 → "yyyy-MM-dd HH:mm" に文字列化する。
 */
function readAll_(name) {
  var sheet = getSheet_(name);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var props = headerProps_(name, values[0]);
  var cols = COLUMNS[name] || [];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var empty = true;
    for (var j = 0; j < row.length; j++) { if (row[j] !== '' && row[j] !== null) { empty = false; break; } }
    if (empty) continue;
    var o = { _row: i + 1 };
    cols.forEach(function (c) { o[c[0]] = emptyOf_(c[0]); });
    for (var k = 0; k < props.length; k++) {
      if (props[k]) o[props[k]] = fromCell_(props[k], row[k]);
    }
    out.push(o);
  }
  return out;
}

/** オブジェクト → 行の配列（base があれば不明な列はその値を残す） */
function objToRow_(props, o, base) {
  return props.map(function (p, i) {
    if (!p) return base ? base[i] : '';
    return toCell_(p, o[p]);
  });
}

/** シートの行数が足りなければ増やす */
function ensureRows_(sheet, lastRowNeeded) {
  var max = sheet.getMaxRows();
  if (max < lastRowNeeded) sheet.insertRowsAfter(max, lastRowNeeded - max + 100);
}

/** 行を末尾に追加する（1回の setValues）。各オブジェクトに _row を付ける */
function appendRows_(name, objs) {
  if (!objs || !objs.length) return objs;
  var sheet = getSheet_(name);
  var props = sheetProps_(sheet, name);
  var start = sheet.getLastRow() + 1;
  var rows = objs.map(function (o) { return objToRow_(props, o, null); });
  ensureRows_(sheet, start + rows.length - 1);
  var range = sheet.getRange(start, 1, rows.length, props.length);
  range.setNumberFormat('@');
  range.setValues(rows);
  objs.forEach(function (o, i) { o._row = start + i; });
  return objs;
}

/**
 * _row を持つオブジェクトの行を書き換える。
 * 近い行どうしをまとめて、まとまりごとに1回の getValues / setValues で書く。
 */
function updateRows_(name, objs) {
  var list = (objs || []).filter(function (o) { return o && o._row >= 2; })
    .sort(function (a, b) { return a._row - b._row; });
  if (!list.length) return;
  var sheet = getSheet_(name);
  var props = sheetProps_(sheet, name);
  var blocks = [];
  list.forEach(function (o) {
    var last = blocks[blocks.length - 1];
    if (last && o._row - last.to <= 20) { last.items.push(o); last.to = o._row; }
    else blocks.push({ from: o._row, to: o._row, items: [o] });
  });
  blocks.forEach(function (b) {
    var range = sheet.getRange(b.from, 1, b.to - b.from + 1, props.length);
    var values = range.getValues();
    b.items.forEach(function (o) { values[o._row - b.from] = objToRow_(props, o, values[o._row - b.from]); });
    range.setNumberFormat('@');
    range.setValues(values);
  });
}

/** データ行をすべて書き直す（地域名マスタ・利用者のような小さな表用） */
function writeRows_(name, objs) {
  var sheet = getSheet_(name);
  var props = sheetProps_(sheet, name);
  var last = sheet.getLastRow();
  if (last >= 2) sheet.getRange(2, 1, last - 1, Math.max(props.length, sheet.getLastColumn())).clearContent();
  if (!objs.length) return;
  var rows = objs.map(function (o) { return objToRow_(props, o, null); });
  ensureRows_(sheet, rows.length + 1);
  var range = sheet.getRange(2, 1, rows.length, props.length);
  range.setNumberFormat('@');
  range.setValues(rows);
  objs.forEach(function (o, i) { o._row = i + 2; });
}

/* ---------------- 採番 ---------------- */

/**
 * 明細の管理IDを採番する（自動取込 F＋5桁、手入力 M＋4桁）。
 * @param {string} prefix 'F' | 'M'
 * @param {Object[]=} records 読み込み済みの明細（同じ実行内で続けて採番するときに渡す）
 */
function nextRecordId_(prefix, records) {
  var list = records || readAll_(SHEET.RECORDS);
  var width = prefix === 'F' ? 5 : 4;
  var re = new RegExp('^' + prefix + '(\\d+)$');
  var max = 0;
  list.forEach(function (r) {
    var m = String(r.id || '').match(re);
    if (m) max = Math.max(max, Number(m[1]));
  });
  var n = String(max + 1);
  while (n.length < width) n = '0' + n;
  return prefix + n;
}

/** 受入IDを採番する（R＋連番） */
function nextStockId_(rows) {
  var max = 0;
  (rows || readAll_(SHEET.STOCK)).forEach(function (x) {
    var m = String(x.id || '').match(/^R(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return 'R' + (max + 1);
}

/* ---------------- 祝日 ---------------- */

/**
 * 祝日を {yyyy-MM-dd: 名前} で返す。Googleカレンダー「日本の祝日」から月単位で取得し、
 * CacheService に6時間キャッシュする。取得に失敗したときは {} を返す。
 */
function getHolidays_(fromYmd, toYmd) {
  var out = {};
  try {
    var cache = CacheService.getScriptCache();
    var m = String(fromYmd).slice(0, 7);
    var last = String(toYmd).slice(0, 7);
    var guard = 0;
    while (m <= last && guard++ < 60) {
      var key = 'holidays_' + m;
      var hit = cache.get(key);
      var map = hit ? JSON.parse(hit) : fetchHolidaysOfMonth_(m);
      if (!hit) cache.put(key, JSON.stringify(map), 21600);
      Object.keys(map).forEach(function (d) { if (d >= fromYmd && d <= toYmd) out[d] = map[d]; });
      m = nextMonth_(m);
    }
  } catch (e) {
    console.warn('祝日を取得できませんでした: ' + e);
    return {};
  }
  return out;
}

/** 祝日として扱うタイトル（「日本の祝日」カレンダーの節分・七夕などの行事は除く） */
var HOLIDAY_NAMES_ = ['元日', '成人の日', '建国記念の日', '天皇誕生日', '春分の日', '昭和の日', '憲法記念日', 'みどりの日',
  'こどもの日', '海の日', '山の日', '敬老の日', '秋分の日', 'スポーツの日', '文化の日', '勤労感謝の日', '振替休日', '国民の休日'];

/**
 * カレンダーのイベントが祝日か。
 * 説明欄に「祝日」があれば祝日（一度きりの祝日も含む）。説明欄が空なら、タイトルが既知の祝日名か「休日」を含むもの。
 * 説明欄が「祝日」以外（節分・七夕などの行事）は除く。
 */
function isHolidayEvent_(title, desc) {
  var d = String(desc || '').trim();
  if (d) return d.indexOf('祝日') >= 0;
  var t = String(title || '');
  return t.indexOf('休日') >= 0 || HOLIDAY_NAMES_.some(function (n) { return t.indexOf(n) >= 0; });
}

/** カレンダーから1か月分の祝日を取る */
function fetchHolidaysOfMonth_(ym) {
  var cal = CalendarApp.getCalendarById(HOLIDAY_CALENDAR_ID);
  if (!cal) throw new Error('祝日カレンダーを開けません');
  var p = ym.split('-').map(Number);
  var events = cal.getEvents(new Date(p[0], p[1] - 1, 1), new Date(p[0], p[1], 1));
  var map = {};
  events.forEach(function (ev) {
    if (!isHolidayEvent_(ev.getTitle(), ev.getDescription())) return;
    map[fmtDate_(ev.getStartTime(), 'yyyy-MM-dd')] = ev.getTitle();
  });
  return map;
}

/** 指定した各月の祝日をまとめて返す（変な年の月は飛ばす） */
function holidaysForMonths_(months) {
  var out = {};
  var limit = (Number(thisMonth_().slice(0, 4)) + 2) + '-12';
  uniq_(months || []).forEach(function (m) {
    if (!isMonthStr_(m) || m < '2019-05' || m > limit) return;
    var h = getHolidays_(m + '-01', m + '-' + pad2_(daysInMonth_(m)));
    Object.keys(h).forEach(function (d) { out[d] = h[d]; });
  });
  return out;
}

/**
 * Rules の evaluateRecords_ に渡す ctx を作る。
 * @param {string[]} months 判定する年月（祝日はこの月の分を取得する）
 */
function evalCtx_(months) {
  var s = getSettings_();
  var tol = Number(s['check.dateToleranceDays']);
  return {
    today: todayStr_(),
    tol: isNaN(tol) ? 7 : tol,
    holidays: holidaysForMonths_(months),
    master: getAreaMaster_(),
    useVin: s['check.useVin'] !== false
  };
}

/** ctx の祝日に月を足す（取込中に新しい月が出てきたとき） */
function ensureCtxMonths_(ctx, months) {
  ctx.loadedMonths_ = ctx.loadedMonths_ || {};
  var need = months.filter(function (m) { return !ctx.loadedMonths_[m]; });
  if (!need.length) return;
  var h = holidaysForMonths_(need);
  Object.keys(h).forEach(function (d) { ctx.holidays[d] = h[d]; });
  need.forEach(function (m) { ctx.loadedMonths_[m] = true; });
}

/**
 * 明細を再判定する（締め済みの月は対象にしない）。
 * @return {Object[]} 変わった明細
 */
function reevaluate_(records, months, closed) {
  var target = uniq_(months).filter(function (m) { return m && !(closed && closed[m]); });
  if (!target.length) return [];
  var ctx = evalCtx_(target);
  return evaluateRecords_(records, ctx, target);
}
