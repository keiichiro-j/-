/**
 * Rules.gs
 * 集計単位の判定、チェック、状態の決定（純粋関数）。
 */

var BAD_KANA = ['お', 'し', 'へ', 'ん'];
var WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * ブランドと地域名から集計単位を決める。
 * @param {string} brand 'A' | 'B'
 * @param {string} area 地域名
 * @param {Object} master {地域名: '岐阜'|'愛知'|'対象外'}
 * @return {{unit:string, result:'target'|'skip'|'review', reason:string}}
 */
function classifyUnit_(brand, area, master) {
  var kind = master[area];
  if (!brand) return { unit: '', result: 'review', reason: 'ブランドが決まっていません' };
  if (!area) return { unit: '', result: 'review', reason: '地域名が読み取れません' };
  if (!kind) return { unit: '', result: 'review', reason: '地域名がマスタにありません' };
  if (kind === AREA_KIND.GIFU) return { unit: brand === 'A' ? 'A' : 'B', result: 'target', reason: '' };
  if (kind === AREA_KIND.AICHI) {
    if (brand === 'A') return { unit: 'AI', result: 'target', reason: '' };
    return { unit: '', result: 'skip', reason: 'ブランドBの愛知ナンバー（封印委託なし）' };
  }
  return {
    unit: '', result: 'skip',
    reason: brand === 'A' ? 'ブランドAの岐阜・愛知以外のナンバー' : 'ブランドBの岐阜以外のナンバー'
  };
}

/** 明細の属する年月（登録日がなければ取込日時の年月） */
function monthOfRecord_(r) {
  if (r.regDate) return String(r.regDate).slice(0, 7);
  return String(r.importedAt || '').slice(0, 7);
}

function dowOf_(ymd) { return new Date(ymd + 'T00:00:00Z').getUTCDay(); }

/** "2026-10-09" → "令和8年10月9日" */
function wareki_(ymd) {
  var p = String(ymd).split('-').map(Number);
  var y = p[0] - 2018;
  return '令和' + (y === 1 ? '元' : y) + '年' + p[1] + '月' + p[2] + '日';
}
function md_(ymd) { var p = String(ymd).split('-').map(Number); return p[1] + '/' + p[2]; }

function isClsValid_(cls) { return /^[1-9][0-9A-Z]{0,2}$/.test(String(cls || '')); }
function isNumValid_(num) {
  var s = String(num || '');
  if (/^[1-9]\d-\d{2}$/.test(s)) return true;
  var m = s.match(/^(・{1,3})([1-9]\d{0,2})$/);
  return !!m && m[1].length + m[2].length === 4;
}
function isKanaValid_(kana) { return /^[ぁ-ゖ]$/.test(String(kana || '')); }

function isActive_(r) { return !r.excluded && !r.noSeal; }
function hasPlate_(r) { return !!(r.area && r.cls && r.kana && r.num); }

/**
 * 1件の明細のチェックを行う（重複・過去月の判定に必要な情報は ctx で渡す）。
 * @param {Object} r 明細
 * @param {Object} ctx {today, tol, holidays:{ymd:名前}, master, useVin,
 *   sameMonth: 同じ月の明細の配列, past: plateKey→[{regDate}] 過去月の索引}
 * @return {Object[]} [{code, level, title, msg}]
 */
function checkRecord_(r, ctx) {
  var out = [];
  var add = function (code, level, title, msg) { out.push({ code: code, level: level, title: title, msg: msg }); };
  var names = Object.keys(ctx.master || {});

  if (!hasPlate_(r)) {
    add('plate', LEVEL.PEND, '登録番号を読み取れません',
      '記録事項から登録番号を1つに決められませんでした。PDFを見て4項目を入力してください。');
  }
  if (r.area && !ctx.master[r.area]) {
    var near = findSimilarArea_(r.area, names);
    add('area', LEVEL.PEND, '地域名を判定できません',
      '「' + r.area + '」は地域名マスタにないため、集計単位を決められません。' +
      (near ? '「' + near + '」の読み取り違いではありませんか？' : ''));
  }
  if (!r.regDate) {
    var c = r.dateCandidates || [];
    add('date', LEVEL.PEND, '登録日を1つに決められません',
      c.length ? '登録日の候補が' + c.length + '件見つかりました（' + c.map(md_).join('、') +
        '）。PDFを見て正しい日付を選んでください。' : '記録事項から登録日を読み取れませんでした。PDFを見て入力してください。');
  }
  if (!r.brand || !r.nc) {
    add('brand', LEVEL.PEND, 'ブランド・新中が決まっていません', 'ブランドと新車・中古車を選んでください。');
  }

  if (isActive_(r) && r.regDate && hasPlate_(r)) {
    var key = plateKey_(r);
    var others = (ctx.sameMonth || []).filter(function (x) {
      return x !== r && x.id !== r.id && isActive_(x) && x.regDate && hasPlate_(x) && plateKey_(x) === key;
    });
    if (others.length) {
      var sameVin = ctx.useVin !== false && r.vin && others.some(function (x) { return x.vin && x.vin === r.vin; });
      add('dup', LEVEL.DUP, '同じ月に同じ登録番号があります',
        others.map(function (x) { return md_(x.regDate) + ' ' + (x.inputType === '手入力' ? '手入力' : '取込') + '分（' + x.id + '）'; }).join('、') +
        'と重複しています。' + (sameVin ? '車台番号も同じため、同じPDFの二重取込の可能性が高いです。' :
          (ctx.useVin !== false ? '車台番号は異なります。' : '')));
    }
    var past = ((ctx.past || {})[key] || []).filter(function (x) { return x.regDate < r.regDate; });
    if (past.length) {
      add('past', LEVEL.INFO, '過去の月にも同じ登録番号があります',
        md_(past[past.length - 1].regDate) + ' に登録済みです。変更登録などで正しい場合もあります（参考）。');
    }
  }

  if (r.kana && (!isKanaValid_(r.kana) || BAD_KANA.indexOf(r.kana) >= 0)) {
    add('kana', LEVEL.WARN, '登録番号に使えないひらがなです',
      '「' + r.kana + '」は登録番号に使用されません。読み取りや入力の誤りの可能性があります。');
  }
  if (r.cls && !isClsValid_(r.cls)) {
    add('cls', LEVEL.WARN, '分類番号の形式が正しくありません',
      '「' + r.cls + '」は分類番号の形式（1〜3桁、英字を含む場合あり）に合いません。');
  }
  if (r.num && !isNumValid_(r.num)) {
    add('num', LEVEL.WARN, '一連番号の形式が正しくありません',
      '「' + r.num + '」は一連番号の形式（例：12-34、・・・1）に合いません。');
  }
  if (r.regDate) {
    var hol = (ctx.holidays || {})[r.regDate];
    var w = dowOf_(r.regDate);
    if (ctx.today && r.regDate > ctx.today) {
      add('future', LEVEL.WARN, '登録日が未来の日付です', wareki_(r.regDate) + ' は今日より後の日付です。');
    } else if (w === 0 || w === 6 || hol) {
      add('closed', LEVEL.WARN, '登録日が閉庁日です',
        wareki_(r.regDate) + '（' + WEEKDAYS[w] + (hol ? '・' + hol : '') + '）は支局の閉庁日です。');
    }
    if (r.inputType !== '手入力' && r.savedDate) {
      var gap = Math.abs(daysBetween_(String(r.savedDate).slice(0, 10), r.regDate));
      var tol = ctx.tol == null ? 7 : Number(ctx.tol);
      if (gap > tol) {
        add('gap', LEVEL.WARN, '保存日と登録日が離れています',
          'PDFの保存日と登録日が' + gap + '日離れています（許容差：' + tol + '日）。');
      }
    }
  }
  return out;
}

/** チェック結果と各フラグから状態を決める */
function statusOf_(r, checks) {
  if (r.excluded) return STATUS.EXCLUDED;
  if (r.noSeal) return STATUS.NOSEAL;
  var acked = r.acked || [];
  if (checks.some(function (c) { return c.level === LEVEL.DUP; })) return STATUS.DUP;
  if (checks.some(function (c) { return c.level === LEVEL.PEND; })) return STATUS.PEND;
  if (checks.some(function (c) { return c.level === LEVEL.WARN && acked.indexOf(c.code) < 0; })) return STATUS.WARN;
  return STATUS.OK;
}

/** 過去月の索引を作る（plateKey → [{regDate}] を登録日順で） */
function buildPastIndex_(records) {
  var idx = {};
  records.forEach(function (r) {
    if (!isActive_(r) || !r.regDate || !hasPlate_(r)) return;
    (idx[plateKey_(r)] = idx[plateKey_(r)] || []).push({ regDate: r.regDate, id: r.id });
  });
  Object.keys(idx).forEach(function (k) { idx[k].sort(function (a, b) { return a.regDate < b.regDate ? -1 : 1; }); });
  return idx;
}

/**
 * 明細すべての集計単位・チェック・状態を計算し直す（records を直接更新する）。
 * @param {Object[]} records 全明細
 * @param {Object} ctx {today, tol, holidays, master, useVin}
 * @param {string[]=} months 再計算する年月（省略時はすべて）
 * @return {Object[]} 状態・チェック・集計単位が変わった明細
 */
function evaluateRecords_(records, ctx, months) {
  var byMonth = {};
  records.forEach(function (r) { (byMonth[monthOfRecord_(r)] = byMonth[monthOfRecord_(r)] || []).push(r); });
  var target = months || Object.keys(byMonth);
  var changed = [];
  target.forEach(function (m) {
    var list = byMonth[m] || [];
    var past = buildPastIndex_(records.filter(function (x) { return x.regDate && monthOfRecord_(x) < m; }));
    var c = { today: ctx.today, tol: ctx.tol, holidays: ctx.holidays, master: ctx.master, useVin: ctx.useVin, sameMonth: list, past: past };
    list.forEach(function (r) {
      var unit = r.brand && r.area ? classifyUnit_(r.brand, r.area, ctx.master).unit : '';
      var checks = checkRecord_(r, c);
      var status = statusOf_(r, checks);
      var before = JSON.stringify([r.unit || '', r.status || '', r.checks || []]);
      r.unit = unit;
      r.checks = checks;
      r.status = status;
      if (before !== JSON.stringify([r.unit, r.status, r.checks])) changed.push(r);
    });
  });
  return changed;
}

/**
 * 修正の結果、マスタにある対象外の地域名になった場合は自動で除外にする。
 * @return {boolean} 除外にしたら true
 */
function autoExcludeIfOutOfScope_(r, master) {
  if (r.excluded || !r.brand || !r.area || !master[r.area]) return false;
  if (classifyUnit_(r.brand, r.area, master).result !== 'skip') return false;
  r.excluded = true;
  r.excludeReason = '集計対象外のナンバー';
  return true;
}

/** 画面向けの状態コード */
function statusCode_(status) { return STATUS_CODE[status] || 'pend'; }

/** 明細を集計対象（正常）として数えるか */
function countsAsSealed_(r) { return r.status === STATUS.OK && !!r.unit && !!r.regDate; }
