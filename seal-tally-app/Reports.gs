/**
 * Reports.gs
 * 明細書・台数集計書・報告書の組み立て（純粋関数）と、シートへの書き込み・テンプレート差し込み・提出用PDF出力。
 * 前半の純粋関数は GAS のサービスに触れないため Node.js の単体テスト（test/reports.test.js）から読み込む。
 */

/* ================= 純粋関数 ================= */

/** 帳票の色 */
var REPORT_COLORS_ = {
  title: '#FFFFFF', header: '#E2F0E9', sat: '#EAF1FA', sun: '#F9E8E6', hol: '#F9E8E6',
  carry: '#F2F5F4', total: '#E9EEEC', plain: '#FFFFFF'
};
var TEMPLATE_SHEET_NAME_ = 'テンプレート';

/** "2026-10" → "10月" */
function monthLabel_(month) { return Number(String(month).slice(5, 7)) + '月'; }
/** "2026-10" → "2026年10月" */
function monthLabelLong_(month) { return String(month).slice(0, 4) + '年' + monthLabel_(month); }

/**
 * 帳票シート名。年ごとのファイルなら「10月_ブランドA新車」、
 * 1ファイルに全期間を入れる設定（output.yearly=FALSE）なら「2026年10月_ブランドA新車」。
 */
function reportSheetName_(month, label, yearly) {
  return (yearly === false ? String(month).slice(0, 4) + '年' : '') + monthLabel_(month) + '_' + label;
}

/** 帳票ファイル名（例：封印明細書_2026） */
function reportFileName_(docKey, month, yearly) {
  var p = DOC_TYPES[docKey].filePrefix;
  return yearly === false ? p : p + '_' + String(month).slice(0, 4);
}

/** 日の種類：祝日 'hol'、日曜 'sun'、土曜 'sat'、平日 '' */
function dayTypeOf_(ymd, holidays) {
  if (holidays && holidays[ymd]) return 'hol';
  var w = dowOf_(ymd);
  return w === 0 ? 'sun' : w === 6 ? 'sat' : '';
}

/** 締めを妨げる状態か */
function isBlocking_(r) { return BLOCKING_STATUSES.indexOf(r.status) >= 0; }

/** その月の締めを妨げる明細の件数 {dup, pend, warn, total} */
function blockingCounts_(records, month) {
  var b = { dup: 0, pend: 0, warn: 0, total: 0 };
  records.forEach(function (r) {
    if (monthOfRecord_(r) !== month) return;
    if (r.status === STATUS.DUP) b.dup++;
    else if (r.status === STATUS.PEND) b.pend++;
    else if (r.status === STATUS.WARN) b.warn++;
    else return;
    b.total++;
  });
  return b;
}

/** 明細書のシート定義 [キー, 表示名, 集計単位, 新中] に明細が当てはまるか */
function matchesDetailSheet_(r, def) {
  return r.unit === def[2] && (def[3] === '' || r.nc === def[3]);
}

/** 取込順（同じ日の中の並び）：取込日時 → 管理ID */
function byImportOrder_(a, b) {
  var x = String(a.importedAt || ''), y = String(b.importedAt || '');
  if (x !== y) return x < y ? -1 : 1;
  return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
}

/**
 * 帳票の中身を組み立てる（画面のプレビューとシート書き込みの共通元）。
 * @param {string} month "yyyy-MM"
 * @param {Object[]} records 判定済みの全明細
 * @param {Object} stockCtx stockCtx_() の戻り値（records はこの関数の引数で置き換える）
 * @param {Object} holidays {yyyy-MM-dd: 祝日名}
 * @param {boolean} closedFlag 締め済みか
 * @param {{yearly:boolean}=} opts
 * @return {Object} API.md の ReportData
 */
function buildReportData_(month, records, stockCtx, holidays, closedFlag, opts) {
  opts = opts || {};
  holidays = holidays || {};
  var yearly = opts.yearly !== false;
  var ctx = {};
  Object.keys(stockCtx || {}).forEach(function (k) { ctx[k] = stockCtx[k]; });
  ctx.records = records;
  ctx.stock = ctx.stock || [];
  ctx.closings = ctx.closings || {};
  ctx.startCarry = ctx.startCarry || {};
  ctx.startMonth = ctx.startMonth || month;
  var days = monthDays_(month);
  var inMonth = records.filter(function (r) { return r.regDate && String(r.regDate).slice(0, 7) === month; });
  var dayInfo = function (d) {
    return { date: d, dow: WEEKDAYS[dowOf_(d)], dayType: dayTypeOf_(d, holidays), holiday: holidays[d] || '' };
  };

  var detail = DETAIL_SHEETS.map(function (def) {
    var mine = inMonth.filter(function (r) { return matchesDetailSheet_(r, def); });
    var total = 0;
    var maxCount = 0;
    var rows = days.map(function (d) {
      var ok = mine.filter(function (r) { return r.regDate === d && countsAsSealed_(r); }).sort(byImportOrder_);
      var pending = mine.filter(function (r) { return r.regDate === d && isBlocking_(r); }).length;
      total += ok.length;
      maxCount = Math.max(maxCount, ok.length);
      var row = dayInfo(d);
      row.count = ok.length;
      row.pending = pending;
      row.plates = ok.map(platePrint_);
      return row;
    });
    return {
      key: def[0], label: def[1], unit: def[2], nc: def[3], sheetName: reportSheetName_(month, def[1], yearly),
      rows: rows, total: total, maxCols: Math.max(5, maxCount)
    };
  });

  var mv = {};
  UNIT_SHEETS.forEach(function (def) {
    mv[def[2]] = monthMovement_(def[2], month, carryFor_(def[2], month, ctx), ctx.stock, records);
  });

  var count = UNIT_SHEETS.map(function (def) {
    var u = def[2];
    var m = mv[u];
    var rows = m.days.map(function (x) {
      var row = dayInfo(x.date);
      row.received = x.received;
      row.adjusted = x.adjusted;
      row.used = x.used;
      row.pending = inMonth.filter(function (r) { return r.unit === u && r.regDate === x.date && isBlocking_(r); }).length;
      row.balance = x.balance;
      return row;
    });
    return {
      key: def[0], label: def[1], unit: u, sheetName: reportSheetName_(month, def[1], yearly), carry: m.carry,
      rows: rows, totals: { received: m.received, adjusted: m.adjusted, used: m.used, left: m.left },
      negativeDays: m.negativeDays
    };
  });

  var report = UNIT_SHEETS.map(function (def) {
    var m = mv[def[2]];
    return {
      key: def[0], label: def[1], unit: def[2], sheetName: reportSheetName_(month, def[1], yearly),
      carry: m.carry, received: m.received, adjusted: m.adjusted, used: m.used, left: m.left
    };
  });

  return {
    month: month,
    closed: !!closedFlag,
    blocking: blockingCounts_(records, month),
    files: {
      detail: reportFileName_('detail', month, yearly),
      count: reportFileName_('count', month, yearly),
      report: reportFileName_('report', month, yearly)
    },
    detail: detail,
    count: count,
    report: report
  };
}

/** 日付の表示 "10/1" */
function reportDay_(ymd) { return md_(ymd); }

/** 曜日の表示（祝日なら名前も） */
function reportDow_(row) { return row.dow + (row.holiday ? '・' + row.holiday : ''); }

/** 行の背景色 */
function reportRowColor_(dayType) { return REPORT_COLORS_[dayType] || REPORT_COLORS_.plain; }

/** 長さをそろえた行（足りない分は空文字） */
function padRow_(row, width) {
  var r = row.slice(0, width);
  while (r.length < width) r.push('');
  return r;
}

/** 締め前の注意書き */
function pendingNote_(data) {
  if (data.closed) return '締め済み';
  return data.blocking.total ? '※未確定 ' + data.blocking.total + '件あり（確定後に反映されます）' : '';
}

/**
 * 標準レイアウトの明細書シートの中身（値・背景色）を作る。
 * @return {{values:Array[], colors:Array[], width:number, headerRows:number}}
 */
function detailSheetGrid_(sec, data) {
  var width = 3 + sec.maxCols;
  var values = [];
  var colors = [];
  var push = function (row, color) { values.push(padRow_(row, width)); colors.push(padRow_([], width).map(function () { return color; })); };
  push(['封印明細書', monthLabelLong_(data.month) + '　' + sec.label, '', pendingNote_(data)], REPORT_COLORS_.title);
  var head = ['日付', '曜日', '件数'];
  for (var i = 1; i <= sec.maxCols; i++) head.push(i);
  push(head, REPORT_COLORS_.header);
  sec.rows.forEach(function (r) {
    push([reportDay_(r.date), reportDow_(r), r.count].concat(r.plates), reportRowColor_(r.dayType));
  });
  push(['合計', '', sec.total], REPORT_COLORS_.total);
  return { values: values, colors: colors, width: width, headerRows: 2 };
}

/** 標準レイアウトの台数集計書シートの中身 */
function countSheetGrid_(sec, data) {
  var width = 7;
  var values = [];
  var colors = [];
  var push = function (row, color) { values.push(padRow_(row, width)); colors.push(padRow_([], width).map(function () { return color; })); };
  push(['封印台数集計書', monthLabelLong_(data.month) + '　' + sec.label, '', pendingNote_(data)], REPORT_COLORS_.title);
  push(['日付', '曜日', '受入数', '調整', '封印台数', '残数', '備考'], REPORT_COLORS_.header);
  push(['前月からの繰越', '', '', '', '', sec.carry, ''], REPORT_COLORS_.carry);
  sec.rows.forEach(function (r) {
    var notes = [];
    if (r.balance < 0) notes.push('残数がマイナス（受入の入力漏れの可能性）');
    if (r.pending) notes.push('未確定 ' + r.pending + '件');
    push([reportDay_(r.date), reportDow_(r), r.received || '', r.adjusted ? -r.adjusted : '', r.used || '', r.balance,
      notes.join('／')], reportRowColor_(r.dayType));
  });
  push(['合計', '', sec.totals.received, sec.totals.adjusted ? -sec.totals.adjusted : 0, sec.totals.used, sec.totals.left, ''],
    REPORT_COLORS_.total);
  return { values: values, colors: colors, width: width, headerRows: 3 };
}

/** 標準レイアウトの報告書シートの中身 */
function reportSheetGrid_(sec, data) {
  var width = 2;
  var values = [
    ['封印報告書', pendingNote_(data)],
    ['集計単位', UNIT_LABELS[sec.unit]],
    ['年月', monthLabelLong_(data.month)],
    ['前月からの繰越', sec.carry],
    ['当月の受入数', sec.received],
    ['調整（破損・書き損じ・返納）', sec.adjusted ? -sec.adjusted : 0],
    ['当月の封印台数（新中共通）', sec.used],
    ['月末の残数', sec.left]
  ];
  var colors = values.map(function (r, i) {
    var c = i === 0 ? REPORT_COLORS_.title : i === 7 ? REPORT_COLORS_.total : REPORT_COLORS_.plain;
    return [i === 0 ? c : REPORT_COLORS_.header, c];
  });
  return { values: values, colors: colors, width: width, headerRows: 1 };
}

/** layout.* 設定の JSON を読む（空・不正なら null） */
function parseLayout_(raw) {
  var s = String(raw || '').trim();
  if (!s) return null;
  try { var o = JSON.parse(s); return o && typeof o === 'object' ? o : null; } catch (e) { return null; }
}

/** 列の指定（"D" または 4）を列番号に */
function colNum_(c) {
  if (typeof c === 'number') return c;
  var s = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^\d+$/.test(s)) return Number(s);
  var n = 0;
  for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n;
}

/* ================= GAS 処理 ================= */

/** 帳票ファイルのIDを設定から読む（年ごとなら JSON {"2026":"id"}） */
function reportFileIdMap_(docKey) {
  var raw = String(getSetting_(DOC_TYPES[docKey].settingKey) || '').trim();
  if (!raw) return {};
  if (raw.charAt(0) === '{') {
    try { var o = JSON.parse(raw); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
  }
  return { all: raw };
}

/** 帳票ファイルのID（無ければ空） */
function reportFileId_(docKey, month, yearly) {
  var map = reportFileIdMap_(docKey);
  return (yearly === false ? map.all : map[String(month).slice(0, 4)]) || '';
}

/**
 * 帳票ファイルを開く。無ければ create=true のときアプリ用フォルダ（folder.root）配下に作る。
 * @return {Spreadsheet|null}
 */
function reportSpreadsheet_(docKey, month, yearly, create) {
  var id = reportFileId_(docKey, month, yearly);
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { console.warn('帳票ファイルを開けません: ' + id); }
  }
  if (!create) return null;
  var ss = SpreadsheetApp.create(reportFileName_(docKey, month, yearly));
  try { DriveApp.getFileById(ss.getId()).moveTo(rootFolder_()); } catch (e) { console.warn('帳票ファイルを移動できません: ' + e); }
  var map = reportFileIdMap_(docKey);
  var obj = {};
  if (yearly === false) obj[DOC_TYPES[docKey].settingKey] = ss.getId();
  else {
    delete map.all;
    map[String(month).slice(0, 4)] = ss.getId();
    obj[DOC_TYPES[docKey].settingKey] = JSON.stringify(map);
  }
  setSettings_(obj);
  return ss;
}

/** 帳票シートを保護する（スクリプト実行者＝所有者以外は編集不可） */
function protectReportSheet_(sh) {
  if (sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) return;
  var p = sh.protect().setDescription('帳票（自動生成）：直接編集はできません');
  p.removeEditors(p.getEditors());
  if (p.canDomainEdit()) p.setDomainEdit(false);
}

/** シート名から並び順のキーを作る（新しい月が左、同じ月はシート定義順） */
function reportSheetOrderKey_(name) {
  var m = String(name).match(/^(?:(\d{4})年)?(\d{1,2})月_(.+)$/);
  if (!m) return null;
  var labels = DETAIL_SHEETS.map(function (d) { return d[1]; }).concat(UNIT_SHEETS.map(function (d) { return d[1]; }));
  var idx = labels.indexOf(m[3]);
  return { ym: (m[1] || '0000') + '-' + pad2_(Number(m[2])), idx: idx < 0 ? 99 : idx };
}

/** 帳票ファイルのシートを「新しい月が左端」に並べ直す */
function orderReportSheets_(ss) {
  var sheets = ss.getSheets();
  var keyed = sheets.map(function (sh, i) { return { sh: sh, key: reportSheetOrderKey_(sh.getName()), i: i }; });
  keyed.sort(function (a, b) {
    if (a.key && !b.key) return -1;
    if (!a.key && b.key) return 1;
    if (!a.key && !b.key) return a.i - b.i;
    if (a.key.ym !== b.key.ym) return a.key.ym > b.key.ym ? -1 : 1;
    return a.key.idx - b.key.idx;
  });
  keyed.forEach(function (k, pos) {
    if (k.sh.getIndex() !== pos + 1) {
      ss.setActiveSheet(k.sh);
      ss.moveActiveSheet(pos + 1);
    }
  });
}

/** 新規ファイルに最初からある空のシートを消す */
function removeDefaultSheets_(ss) {
  ss.getSheets().forEach(function (sh) {
    if (ss.getSheets().length > 1 && /^(シート|Sheet)\d+$/.test(sh.getName()) && sh.getLastRow() === 0) ss.deleteSheet(sh);
  });
}

/** 標準レイアウトでシートに書く（毎回クリアして書き直す） */
function writeStandardSheet_(sh, docKey, sec, data) {
  var g = docKey === 'detail' ? detailSheetGrid_(sec, data) : docKey === 'count' ? countSheetGrid_(sec, data) : reportSheetGrid_(sec, data);
  var rows = g.values.length;
  sh.clear();
  if (sh.getMaxColumns() < g.width) sh.insertColumnsAfter(sh.getMaxColumns(), g.width - sh.getMaxColumns());
  if (sh.getMaxRows() < rows) sh.insertRowsAfter(sh.getMaxRows(), rows - sh.getMaxRows());
  sh.getRange(1, 1, rows, 2).setNumberFormat('@');
  var range = sh.getRange(1, 1, rows, g.width);
  range.setValues(g.values);
  range.setBackgrounds(g.colors);
  sh.getRange(1, 1, 1, g.width).setFontWeight('bold');
  if (docKey !== 'report') sh.getRange(2, 1, 1, g.width).setFontWeight('bold');
  sh.getRange(rows, 1, 1, g.width).setFontWeight('bold');
  if (docKey === 'detail') {
    sh.setFrozenRows(2);
    sh.setFrozenColumns(3);
    sh.setColumnWidths(1, 3, 56);
    if (sec.maxCols) sh.setColumnWidths(4, sec.maxCols, 120);
  } else if (docKey === 'count') {
    sh.setFrozenRows(3);
    sh.setColumnWidths(1, 6, 72);
    sh.setColumnWidth(7, 280);
    // 残数がマイナスの行は赤字にする
    var fonts = g.values.map(function (r, i) {
      return r.map(function (v, j) { return j === 5 && i >= 2 && typeof v === 'number' && v < 0 ? '#C0392F' : '#17201C'; });
    });
    range.setFontColors(fonts);
  } else {
    sh.setColumnWidth(1, 240);
    sh.setColumnWidth(2, 180);
  }
}

/**
 * テンプレートの複製に値を差し込む（最低限の実装）。差し込み位置は layout.* の JSON。
 * 明細書：{monthCell, titleCell, startRow, dateCol, dowCol, countCol, plateCol, maxPerRow, totalCell}
 * 台数集計書：{monthCell, titleCell, carryCell, startRow, dateCol, dowCol, receivedCol, adjustedCol, usedCol, balanceCol,
 *   totalRow}
 * 報告書：{monthCell, unitCell, carryCell, receivedCell, adjustedCell, usedCell, leftCell}
 * 1行に入りきらない登録番号（maxPerRow 超え）は、暫定で最後のセルを「ほかn件」にする（扱いはレイアウト受領時に決める）。
 */
function fillTemplateSheet_(sh, docKey, sec, data, layout) {
  var put = function (a1, v) { if (a1) sh.getRange(a1).setValue(v); };
  var col = function (c, rows) {
    if (!c || !layout.startRow) return;
    sh.getRange(Number(layout.startRow), colNum_(c), rows.length, 1).setValues(rows.map(function (v) { return [v]; }));
  };
  put(layout.monthCell, monthLabelLong_(data.month));
  put(layout.titleCell, sec.label);
  put(layout.unitCell, UNIT_LABELS[sec.unit]);
  if (docKey === 'detail') {
    col(layout.dateCol, sec.rows.map(function (r) { return reportDay_(r.date); }));
    col(layout.dowCol, sec.rows.map(reportDow_));
    col(layout.countCol, sec.rows.map(function (r) { return r.count; }));
    if (layout.plateCol && layout.startRow) {
      var per = Number(layout.maxPerRow) || sec.maxCols;
      var grid = sec.rows.map(function (r) {
        var p = r.plates.slice(0, per);
        if (r.plates.length > per) p[per - 1] = 'ほか' + (r.plates.length - per + 1) + '件';
        return padRow_(p, per);
      });
      sh.getRange(Number(layout.startRow), colNum_(layout.plateCol), grid.length, per).setValues(grid);
    }
    put(layout.totalCell, sec.total);
  } else if (docKey === 'count') {
    put(layout.carryCell, sec.carry);
    col(layout.dateCol, sec.rows.map(function (r) { return reportDay_(r.date); }));
    col(layout.dowCol, sec.rows.map(reportDow_));
    col(layout.receivedCol, sec.rows.map(function (r) { return r.received || ''; }));
    col(layout.adjustedCol, sec.rows.map(function (r) { return r.adjusted ? -r.adjusted : ''; }));
    col(layout.usedCol, sec.rows.map(function (r) { return r.used || ''; }));
    col(layout.balanceCol, sec.rows.map(function (r) { return r.balance; }));
    if (layout.totalRow) {
      var tr = Number(layout.totalRow);
      var t = sec.totals;
      [[layout.receivedCol, t.received], [layout.adjustedCol, t.adjusted ? -t.adjusted : 0], [layout.usedCol, t.used],
        [layout.balanceCol, t.left]].forEach(function (x) { if (x[0]) sh.getRange(tr, colNum_(x[0])).setValue(x[1]); });
    }
  } else {
    put(layout.carryCell, sec.carry);
    put(layout.receivedCell, sec.received);
    put(layout.adjustedCell, sec.adjusted ? -sec.adjusted : 0);
    put(layout.usedCell, sec.used);
    put(layout.leftCell, sec.left);
  }
}

/**
 * 1つの帳票ファイルに、その月のシートを書く。
 * @param {boolean} create シートが無いときに作るか（その月に明細・受入がまだ無ければ作らない）
 */
function writeReportDoc_(ss, docKey, data, create) {
  var layout = parseLayout_(getSetting_('layout.' + docKey));
  var tpl = layout ? ss.getSheetByName(TEMPLATE_SHEET_NAME_) : null;
  var inserted = false;
  data[docKey].forEach(function (sec) {
    var sh = ss.getSheetByName(sec.sheetName);
    if (!sh && !create) return;
    if (tpl) {
      if (sh) ss.deleteSheet(sh);
      sh = tpl.copyTo(ss).setName(sec.sheetName);
      if (sh.isSheetHidden()) sh.showSheet();
      fillTemplateSheet_(sh, docKey, sec, data, layout);
      inserted = true;
    } else {
      if (!sh) { sh = ss.insertSheet(sec.sheetName, 0); inserted = true; }
      writeStandardSheet_(sh, docKey, sec, data);
    }
    protectReportSheet_(sh);
  });
  if (inserted) {
    removeDefaultSheets_(ss);
    orderReportSheets_(ss);
  }
}

/**
 * 指定した月の帳票（3ファイル・各月のシート）を作り直す。
 * @param {string[]} months "yyyy-MM" の配列
 * @param {{records:Object[]}=} pre 読み込み済みの明細（同じ実行内で読み直さないため）
 */
function regenerateReports_(months, pre) {
  var start = startMonth_();
  var list = uniq_(months || []).filter(function (m) { return isMonthStr_(m) && m >= start; }).sort();
  if (!list.length) return;
  var yearly = getSetting_('output.yearly') !== false;
  var records = (pre && pre.records) || readAll_(SHEET.RECORDS);
  var ctx = stockCtx_(records);
  var closed = closedMonths_();
  list.forEach(function (month) {
    var hasData = records.some(function (r) { return monthOfRecord_(r) === month; }) ||
      ctx.stock.some(function (x) { return String(x.date).slice(0, 7) === month; });
    var holidays = getHolidays_(month + '-01', month + '-' + pad2_(daysInMonth_(month)));
    var data = buildReportData_(month, records, ctx, holidays, !!closed[month], { yearly: yearly });
    Object.keys(DOC_TYPES).forEach(function (docKey) {
      var ss = reportSpreadsheet_(docKey, month, yearly, hasData);
      if (ss) writeReportDoc_(ss, docKey, data, hasData);
    });
  });
}

/** 帳票タブのプレビュー用データ */
function reportDataFor_(month, records) {
  records = records || readAll_(SHEET.RECORDS);
  var holidays = getHolidays_(month + '-01', month + '-' + pad2_(daysInMonth_(month)));
  return buildReportData_(month, records, stockCtx_(records), holidays, !!closedMonths_()[month],
    { yearly: getSetting_('output.yearly') !== false });
}

/** 画面の「出力ファイル」欄（未作成なら null）。ファイルを開かずに設定のIDから作る */
function outputFilesFor_(month) {
  var yearly = getSetting_('output.yearly') !== false;
  var out = {};
  Object.keys(DOC_TYPES).forEach(function (docKey) {
    var id = reportFileId_(docKey, month, yearly);
    out[docKey] = id ? { name: reportFileName_(docKey, month, yearly), url: 'https://docs.google.com/spreadsheets/d/' + id + '/edit' } : null;
  });
  return out;
}

/**
 * 提出用の出力：当月の帳票シートを1シート1つのPDFにして「提出用/yyyy-MM」フォルダへ保存する。
 * 要確認（重複・要確認・誤りの疑い）が残っている月は出力しない。
 * @return {{folderUrl:string, files:{name,url}[]}}
 */
function exportSubmission_(month) {
  var records = readAll_(SHEET.RECORDS);
  var b = blockingCounts_(records, month);
  if (b.total) {
    throw userError_('確認が必要な明細が' + b.total + '件残っているため出力できません（重複 ' + b.dup + '・要確認 ' + b.pend +
      '・誤りの疑い ' + b.warn + '）。要確認タブで解消してください。');
  }
  regenerateReports_([month], { records: records });
  var yearly = getSetting_('output.yearly') !== false;
  var data = reportDataFor_(month, records);
  var folders = ensureOutputFolders_();
  var dest = getOrCreateSubFolder_(folders.submit, month);
  var token = ScriptApp.getOAuthToken();
  var files = [];
  Object.keys(DOC_TYPES).forEach(function (docKey) {
    var ss = reportSpreadsheet_(docKey, month, yearly, false);
    if (!ss) return;
    data[docKey].forEach(function (sec) {
      var sh = ss.getSheetByName(sec.sheetName);
      if (!sh) return;
      var url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=pdf&gid=' + sh.getSheetId() +
        '&portrait=false&size=A4&fitw=true&gridlines=false&sheetnames=false&printtitle=false';
      var res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) {
        throw userError_('PDFを作成できませんでした（' + sec.sheetName + '、コード ' + res.getResponseCode() + '）。少し待ってからもう一度お試しください。');
      }
      var name = DOC_TYPES[docKey].filePrefix + '_' + month + '_' + sec.label + '.pdf';
      var old = dest.getFilesByName(name);
      while (old.hasNext()) old.next().setTrashed(true);
      var file = dest.createFile(res.getBlob().setName(name));
      files.push({ name: name, url: file.getUrl() });
      Utilities.sleep(300);
    });
  });
  audit_('提出用に出力', month, '', '', '', files.length + 'ファイル');
  return { folderUrl: dest.getUrl(), files: files };
}
