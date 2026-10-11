/**
 * Extract.gs
 * 記録事項PDFのテキストから登録番号・登録日・車台番号を取り出す純粋関数。
 * GAS のサービスに依存しないため Node.js で単体テストできる（test/run.js）。
 */

var HYPHENS_ = '‐‑‒–—―−ー－ｰ-';
var DOTS_ = '･・·•‧∙⋅';
var KANJI_ = '一-鿿々';

/**
 * テキストを正規化する。
 * - NFKC で全角英数字を半角に
 * - 数字の間のハイフン類を "-" に、中黒類を "・" に
 * 戻り値: { text: 正規化後, compact: さらに空白をすべて除いたもの }
 */
function normalizeText_(raw) {
  var s = String(raw || '');
  if (s.normalize) s = s.normalize('NFKC');
  s = s.replace(new RegExp('[' + DOTS_ + ']', 'g'), '・');
  s = s.replace(new RegExp('(\\d)\\s*[' + HYPHENS_ + ']\\s*(?=\\d)', 'g'), '$1-');
  s = s.replace(/[　\t\r\f\v]/g, ' ');
  // ひらがなの直後で数字の前にある「.」（「…」「‥」の NFKC 後を含む）は一連番号の「・」とみなす
  s = s.replace(/([\u3041-\u3096]\s*)((?:[.・]\s*){1,3})(?=\d)/g, function (m, a, b) {
    return a + b.replace(/\./g, '・');
  });
  var compact = s.replace(/\s+/g, '');
  // 空白を除いたことで新たに数字の間に並んだハイフン類もそろえる
  compact = compact.replace(new RegExp('(\\d)[' + HYPHENS_ + '](?=\\d)', 'g'), '$1-');
  return { text: s, compact: compact };
}

function escapeRegExp_(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** 一連番号を保存形式にそろえる（"1213"→"12-13"、"1"→"・・・1"） */
function normalizeSerial_(raw) {
  var s = String(raw || '').replace(/\s+/g, '').replace(new RegExp('[' + DOTS_ + '.]', 'g'), '・');
  s = s.replace(new RegExp('[' + HYPHENS_ + ']', 'g'), '-');
  if (/^\d{2}-\d{2}$/.test(s)) return s;
  if (s.indexOf('-') >= 0) return s;   // 「2桁-2桁」でないハイフン入りはそのまま残し、形式チェックで警告にする
  var digits = s.replace(/[・-]/g, '');
  if (/^\d{4}$/.test(digits) && s.indexOf('・') < 0) return digits.slice(0, 2) + '-' + digits.slice(2);
  if (/^\d{1,3}$/.test(digits)) return new Array(4 - digits.length + 1).join('・') + digits;
  return s;
}

/** 帳票用の登録番号表記（空白・ハイフン・「・」を除く）。例：岐阜303に1213、岐阜303に1 */
function platePrint_(r) {
  return String(r.area || '') + String(r.cls || '') + String(r.kana || '') +
    String(r.num || '').replace(/[-・\s]/g, '');
}

/** 登録番号4項目の照合キー */
function plateKey_(r) {
  return [r.area, r.cls, r.kana, r.num].map(function (x) { return String(x || ''); }).join('|');
}

/**
 * 登録番号の後半（分類番号・ひらがな・一連番号）の正規表現の文字列。
 * spaced=true は各部の間の空白を許す（空白入りテキスト用）。
 * 一連番号の直後に数字やハイフンが続くものは一致させない。
 */
function plateTail_(spaced) {
  var sp = spaced ? '\\s*' : '';
  return '([0-9A-Z]{1,4})' + sp + '([ぁ-ゖ])' + sp +
    '((?:・' + sp + '){1,3}\\d{1,3}|\\d{2}' + sp + '-' + sp + '\\d{2}|\\d{1,4})(?![\\d-])';
}

function knownAreaPattern_(areaNames) {
  var names = (areaNames || []).slice().sort(function (a, b) { return b.length - a.length; });
  return names.length ? '(' + names.map(escapeRegExp_).join('|') + ')' : null;
}

function toPlate_(m) {
  return { area: m[1], cls: m[2].replace(/\s+/g, ''), kana: m[3], num: normalizeSerial_(m[4]) };
}

/** 空白入りテキストでの一致の直後に「空白＋数字」が続く（文字間に空白が入った疑い） */
function suspiciousTail_(str, m) {
  return /^\s+\d/.test(str.slice(m.index + m[0].length));
}

/**
 * 空白入りテキストと空白なしテキストの両方で最初の一致を探す。
 * 空白入りで一致し、その直後が怪しくなければそれを、そうでなければ空白なしの一致を使う。
 */
function firstPlateMatch_(spacedWin, compactWin, areaPat) {
  var sp = new RegExp(areaPat + '\\s*' + plateTail_(true)).exec(spacedWin);
  if (sp && !suspiciousTail_(spacedWin, sp)) return sp;
  var cp = new RegExp(areaPat + plateTail_(false)).exec(compactWin);
  return cp || sp;
}

/** 空白を除いた文字列と、その各文字の元の位置 */
function compactMap_(text) {
  var chars = [];
  var map = [];
  for (var i = 0; i < text.length; i++) {
    if (!/\s/.test(text.charAt(i))) { chars.push(text.charAt(i)); map.push(i); }
  }
  return { compact: chars.join(''), map: map };
}

/**
 * 登録番号を抽出する。
 * @param {string} raw 変換テキスト
 * @param {string[]} areaNames 地域名マスタのすべての地域名
 * @return {{plate: Object|null, candidates: Object[], via: string}}
 */
function extractPlate_(raw, areaNames) {
  var n = normalizeText_(raw);
  var cm = compactMap_(n.text);
  var known = knownAreaPattern_(areaNames);
  var label = '自動車登録番号';

  // 1) ラベルの直後
  var li = cm.compact.indexOf(label);
  if (li >= 0) {
    var cStart = li + label.length;
    var cWin = cm.compact.slice(cStart, cStart + 160).replace(/^又は車両番号/, '');
    var tStart = cStart < cm.map.length ? cm.map[cStart] : n.text.length;
    var tWin = n.text.slice(tStart, tStart + 240).replace(/^\s*又\s*は\s*車\s*両\s*番\s*号/, '');
    if (known) {
      var mk = firstPlateMatch_(tWin, cWin, known);
      if (mk) return { plate: toPlate_(mk), candidates: [toPlate_(mk)], via: 'label' };
    }
    // マスタにない地域名（読み取り違いの可能性）も拾って要確認にする
    var mg = firstPlateMatch_(tWin, cWin, '([' + KANJI_ + ']{1,4})');
    if (mg) {
      var p = toPlate_(mg);
      p.area = guessUnknownArea_(p.area, areaNames);
      return { plate: p, candidates: [p], via: 'label-unknown-area' };
    }
  }

  // 2) テキスト全体から（地域名マスタにあるものだけ）
  if (!known) return { plate: null, candidates: [], via: 'none' };
  var found = {};
  var list = [];
  var add = function (m) {
    var pl = toPlate_(m);
    var k = plateKey_(pl);
    if (!found[k]) { found[k] = true; list.push(pl); }
  };
  var m;
  var suspicious = [];
  var reS = new RegExp(known + '\\s*' + plateTail_(true), 'g');
  while ((m = reS.exec(n.text)) !== null) {
    if (suspiciousTail_(n.text, m)) suspicious.push(m); else add(m);
  }
  var reC = new RegExp(known + plateTail_(false), 'g');
  var compactHits = 0;
  while ((m = reC.exec(cm.compact)) !== null) { add(m); compactHits++; }
  if (!compactHits) suspicious.forEach(add);
  return { plate: list.length === 1 ? list[0] : null, candidates: list, via: 'scan' };
}

/** マスタにない地域名の漢字列から、地域名らしい部分を取り出す */
function guessUnknownArea_(run, areaNames) {
  if (run.length <= 2) return run;
  for (var len = 2; len <= run.length; len++) {
    var tail = run.slice(run.length - len);
    if (findSimilarArea_(tail, areaNames || [])) return tail;
  }
  return run.slice(run.length - 2);
}

/** 1文字違いの地域名を探す（同じ文字数のみ） */
function findSimilarArea_(area, names) {
  var a = String(area || '');
  for (var i = 0; i < names.length; i++) {
    var b = names[i];
    if (b === a || b.length !== a.length) continue;
    var diff = 0;
    for (var j = 0; j < a.length; j++) if (a.charAt(j) !== b.charAt(j)) diff++;
    if (diff === 1) return b;
  }
  return null;
}

/* ---------------- 日付 ---------------- */

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

/** 年月日（数値）を "yyyy-MM-dd" に。実在しない日付は null */
function ymd_(y, m, d) {
  var dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return y + '-' + pad2_(m) + '-' + pad2_(d);
}

/** 和暦・西暦の「年月日」をすべて拾う（「年月」だけのものは拾わない） */
function findDates_(compact) {
  var out = [];
  var re = /(令和|平成|(?=\d{4}年))(元|\d{1,4})年(\d{1,2})月(\d{1,2})日/g;
  var m;
  while ((m = re.exec(compact)) !== null) {
    var y = m[2] === '元' ? 1 : parseInt(m[2], 10);
    if (m[1] === '令和') y += 2018;
    else if (m[1] === '平成') y += 1988;
    else if (y < 1900) continue;
    var d = ymd_(y, parseInt(m[3], 10), parseInt(m[4], 10));
    if (d) out.push({ date: d, index: m.index });
  }
  return out;
}

function daysBetween_(a, b) {
  return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
}

/**
 * 登録日を抽出する。
 * @param {string} raw 変換テキスト
 * @param {{today:string, created:string, toleranceDays:number}} opt
 *   today/created は "yyyy-MM-dd"。created はPDFの作成日（保存日）
 * @return {{date:string|null, candidates:string[], via:string}}
 */
function extractRegDate_(raw, opt) {
  opt = opt || {};
  var n = normalizeText_(raw);
  var c = n.compact;
  var label = '登録年月日';
  var li = c.indexOf(label);
  if (li >= 0) {
    // ラベル直後の日付は未来でも採る（未来日はチェックで「誤りの疑い」にする）。
    // ただし「有効期間の満了する日」のラベルより後は窓に含めない
    var win = c.slice(li + label.length, li + label.length + 120);
    var stop = win.indexOf('有効期間');
    if (stop >= 0) win = win.slice(0, stop);
    var after = findDates_(win);
    if (after.length) return { date: after[0].date, candidates: [after[0].date], via: 'label' };
  }
  var all = findDates_(c).map(function (x) { return x.date; });
  var uniq = all.filter(function (d, i) { return all.indexOf(d) === i; });
  if (opt.today) uniq = uniq.filter(function (d) { return d <= opt.today; });
  if (!uniq.length) return { date: null, candidates: [], via: 'none' };
  if (uniq.length === 1) return { date: uniq[0], candidates: uniq, via: 'scan' };
  var base = opt.created || opt.today;
  if (!base) return { date: null, candidates: uniq, via: 'ambiguous' };
  uniq.sort(function (a, b) { return Math.abs(daysBetween_(a, base)) - Math.abs(daysBetween_(b, base)); });
  var tol = opt.toleranceDays == null ? 7 : Number(opt.toleranceDays);
  var spread = uniq.some(function (d) { return Math.abs(daysBetween_(d, uniq[0])) > tol; });
  if (!spread) return { date: uniq[0], candidates: uniq, via: 'scan-nearest' };
  return { date: null, candidates: uniq.slice(0, 5), via: 'ambiguous' };
}

/** 車台番号を抽出する。取れなければ空文字 */
function extractVin_(raw) {
  var c = normalizeText_(raw).compact;
  var li = c.indexOf('車台番号');
  if (li < 0) return '';
  var win = c.slice(li + 4, li + 4 + 80);
  var re = /[A-Z0-9]+(?:-[A-Z0-9]+)*/g;
  var m;
  while ((m = re.exec(win)) !== null) {
    if (/[A-Z]/.test(m[0]) && m[0].length >= 6) return m[0];
  }
  return '';
}

/**
 * PDFテキストから抽出結果をまとめて返す。
 * @return {{plate:Object|null, plateCandidates:Object[], regDate:string|null,
 *   dateCandidates:string[], vin:string}}
 */
function extractAll_(raw, areaNames, opt) {
  var p = extractPlate_(raw, areaNames);
  var d = extractRegDate_(raw, opt);
  return {
    plate: p.plate, plateCandidates: p.candidates, plateVia: p.via,
    regDate: d.date, dateCandidates: d.date ? [] : d.candidates, dateVia: d.via,
    vin: extractVin_(raw)
  };
}
