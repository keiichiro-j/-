/**
 * test/ui/fake-gas.js
 * ローカル確認用の google.script.run のフェイク。
 * docs/API.md の全関数をメモリ上のサンプルデータで実装する（判定は簡易版。本物は Rules.gs / Stock.gs）。
 *
 * URL パラメータ
 *   ?role=editor  … 編集者としてログインした状態にする（既定は管理者）
 *   ?delay=800    … 応答までの待ち時間（ミリ秒。既定 250）
 *   ?fail=apiGetReport … 指定した関数を通信エラー（withFailureHandler）にする
 */
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search);
  var DELAY = +(qs.get('delay') || 250);
  var FAIL = qs.get('fail') || '';
  var TODAY = '2026-10-11';
  var HOLI = { '2026-09-21': '敬老の日', '2026-09-22': '国民の休日', '2026-09-23': '秋分の日', '2026-10-12': 'スポーツの日', '2026-11-03': '文化の日', '2026-11-23': '勤労感謝の日' };
  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  var UNITS = ['A', 'B', 'AI'];
  var UNIT_LABELS = { A: 'ブランドA（岐阜）', B: 'ブランドB（岐阜）', AI: 'ブランドA（愛知）' };
  var DETAIL_SHEETS = [['A新', 'ブランドA新車', 'A', '新'], ['A中', 'ブランドA中古車', 'A', '中'], ['B新', 'ブランドB新車', 'B', '新'], ['B中', 'ブランドB中古車', 'B', '中'], ['AI', '愛知', 'AI', '']];
  var UNIT_SHEETS = [['A', 'ブランドA', 'A'], ['B', 'ブランドB', 'B'], ['AI', '愛知', 'AI']];
  var BAD_KANA = ['お', 'し', 'へ', 'ん'];
  var STATUS_CODE = { '正常': 'ok', '重複': 'err', '誤りの疑い': 'warn', '要確認': 'pend', '封印なし': 'ns', '除外': 'ex' };
  var BLOCKING = ['重複', '要確認', '誤りの疑い'];

  /* ---------- 状態 ---------- */
  var USERS = [
    { email: 'kanri@example.jp', name: '管理者', role: '管理者' },
    { email: 'tanto-a@example.jp', name: '担当者A', role: '編集者' },
    { email: 'tanto-b@example.jp', name: '担当者B', role: '編集者' },
    { email: 'tanto-c@example.jp', name: '担当者C', role: '編集者' }
  ];
  var ME = qs.get('role') === 'editor' ? USERS[1] : USERS[0];
  var AREAS = {
    '岐阜': ['岐阜', '飛騨'],
    '愛知': ['名古屋', '尾張小牧', '一宮', '春日井', '三河', '岡崎', '豊田', '豊橋'],
    '対象外': ['三重', '鈴鹿', '四日市', '浜松', '静岡', '沼津', '福井', '長野', '松本', '滋賀', '大阪', '品川']
  };
  var SET = {
    folders: [
      ['folder.A新', 'ブランドA・新車', 'A', '新', '1aB3xK9brandAshinsha'],
      ['folder.A中', 'ブランドA・中古車', 'A', '中', '7Qe2Lm4brandAchuko0'],
      ['folder.B新', 'ブランドB・新車', 'B', '新', '3Zt8Pw1brandBshinsha'],
      ['folder.B中', 'ブランドB・中古車', 'B', '中', '9Kd5Hs6brandBchuko0']
    ].map(function (f) {
      return { key: f[0], label: f[1], brand: f[2], nc: f[3], id: f[4], url: 'https://drive.google.com/drive/folders/' + f[4], name: f[1].replace('・', '_') + '_記録事項', ok: true, pending: 0 };
    }),
    autoEnabled: true, intervalMin: 10, tolDays: 7, useVin: true, lowStock: 10, closeRemind: true, notifyTo: '',
    startMonth: '2026-09', startCarry: { A: 30, B: 20, AI: 10 }, yearly: true, appUrl: 'https://script.google.com/a/macros/example.jp/s/FAKE/exec'
  };
  var CLOSINGS = { '2026-09': { closed: true, by: '管理者', at: '2026-10-01 09:30' } };
  var SETTINGS_HISTORY = [
    { at: '2026-10-01 09:02', by: '管理者', text: '自動実行の間隔を 15分 → 10分 に変更' },
    { at: '2026-09-28 17:40', by: '管理者', text: 'ブランドA中古車の読み取りフォルダを変更' }
  ];
  var OUTPUT = {
    detail: { name: '封印明細書_2026', url: 'https://docs.google.com/spreadsheets/d/FAKE-detail' },
    count: { name: '封印台数集計書_2026', url: 'https://docs.google.com/spreadsheets/d/FAKE-count' },
    report: null
  };
  var REC = [], STOCK = [], LOG = [], HIST = {};
  var seq = 0, mseq = 0, rseq = 0;
  var lastRun = '2026-10-10 16:02';

  /* ---------- ユーティリティ ---------- */
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var dow = function (d) { return new Date(d + 'T00:00:00Z').getUTCDay(); };
  var md = function (d) { var p = d.split('-'); return (+p[1]) + '/' + (+p[2]); };
  var wareki = function (d) { var p = d.split('-').map(Number); return '令和' + (p[0] - 2018) + '年' + p[1] + '月' + p[2] + '日'; };
  var now = function () { var d = new Date(); return TODAY + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  var daysIn = function (m) { var p = m.split('-').map(Number); return new Date(Date.UTC(p[0], p[1], 0)).getUTCDate(); };
  var monthDays = function (m) { var a = []; for (var d = 1; d <= daysIn(m); d++) a.push(m + '-' + pad(d)); return a; };
  var prevMonth = function (m) { var p = m.split('-').map(Number); var d = new Date(Date.UTC(p[0], p[1] - 2, 1)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1); };
  var monthOf = function (r) { return r.regDate ? r.regDate.slice(0, 7) : String(r.savedDate || r.importedAt || '').slice(0, 7); };
  var isClosed = function (m) { return !!(CLOSINGS[m] && CLOSINGS[m].closed); };
  var kindOf = function (area) { for (var k in AREAS) if (AREAS[k].indexOf(area) >= 0) return k; return null; };
  var allAreas = function () { return [].concat(AREAS['岐阜'], AREAS['愛知'], AREAS['対象外']); };
  var plateKey = function (r) { return [r.area, r.cls, r.kana, r.num].join('|'); };
  var platePrint = function (r) { return r.area + r.cls + r.kana + String(r.num).replace(/[-・]/g, '').replace(/^0+/, ''); };
  var hasPlate = function (r) { return !!(r.area && r.cls && r.kana && r.num); };
  var active = function (r) { return !r.excluded && !r.noSeal; };
  var dayType = function (d) { return HOLI[d] ? 'hol' : dow(d) === 0 ? 'sun' : dow(d) === 6 ? 'sat' : ''; };
  function unitOf(brand, area) {
    var k = kindOf(area); if (!brand || !k) return '';
    if (k === '岐阜') return brand === 'B' ? 'B' : 'A';
    if (k === '愛知' && brand === 'A') return 'AI';
    return '';
  }
  function addHist(id, by, text) { (HIST[id] = HIST[id] || []).unshift({ at: now(), by: by, text: text }); }

  /* ---------- サンプルデータ ---------- */
  var s0 = 20261011; var rnd = function () { s0 = (s0 * 1103515245 + 12345) % 2147483648; return s0 / 2147483648; };
  var pick = function (a) { return a[Math.floor(rnd() * a.length)]; };
  var KANA = 'さすせそたちつてとなにぬねのはひふほまみむめもやゆよらりるろ'.split('');
  function mkNum() { if (rnd() < 0.7) { var n = String(Math.floor(rnd() * 9000) + 1000); return n.slice(0, 2) + '-' + n.slice(2); } var s = String(Math.floor(rnd() * 999) + 1); return '・'.repeat(4 - s.length) + s; }
  function mkVin() { return pick(['ZVW', 'MXAA', 'GR', 'NHP', 'AYH', 'RP', 'GP']) + pick(['30', '52', '5', '10', '80']) + '-' + (Math.floor(rnd() * 9000000) + 1000000); }
  function add(date, o) {
    o = o || {};
    seq++;
    var u = o.u || (rnd() < 0.5 ? 'A' : rnd() < 0.6 ? 'B' : 'AI');
    var brand = u === 'B' ? 'B' : 'A';
    var nc = o.nc || (rnd() < 0.6 ? '新' : '中');
    var imp = o.importedAt || ((date || '2026-10-10') + ' ' + pad(9 + Math.floor(rnd() * 8)) + ':' + pad(Math.floor(rnd() * 60)));
    var r = {
      id: 'F' + String(seq).padStart(5, '0'), regDate: date || '', area: u === 'AI' ? pick(AREAS['愛知']) : pick(['岐阜', '岐阜', '岐阜', '飛騨']),
      cls: pick(['300', '330', '500', '530', '580', '310', '503', '3A0']), kana: pick(KANA), num: mkNum(), brand: brand, nc: nc, vin: mkVin(),
      unit: '', status: '', checks: [], acked: [], noSeal: false, noSealReason: '', inputType: '自動', manualReason: '',
      excluded: false, excludeReason: '', dateCandidates: [], fileId: 'file' + seq, fileName: 'ブランド' + brand + '_' + (nc === '新' ? '新車' : '中古車') + '/記録事項_' + seq + '.pdf',
      savedDate: imp.slice(0, 10), importedAt: imp, updatedBy: '', updatedAt: ''
    };
    delete o.u;
    Object.keys(o).forEach(function (k) { r[k] = o[k]; });
    if (r.inputType === '手入力') { r.fileId = ''; r.fileName = ''; }
    REC.push(r);
    LOG.push({ at: r.importedAt, fileName: r.fileName || '（手入力）', kind: 'record', recordId: r.id });
    return r;
  }
  function fill(m, maxDay) {
    for (var d = 1; d <= maxDay; d++) {
      var ds = m + '-' + pad(d); if (dayType(ds)) continue;
      var n = 3 + Math.floor(rnd() * 5); for (var i = 0; i < n; i++) add(ds);
    }
  }
  fill('2026-09', 30);
  var sept = REC.filter(function (r) { return r.brand === 'A' && r.area === '岐阜'; })[0];
  fill('2026-10', 9);
  add('2026-10-06', { u: 'A', area: '岐阜', cls: '300', kana: 'さ', num: '12-34', vin: 'ZVW30-5123456', nc: '新', importedAt: '2026-10-06 10:12' });
  add('2026-10-08', { u: 'A', area: '岐阜', cls: '300', kana: 'さ', num: '12-34', vin: 'ZVW30-5123456', nc: '新', importedAt: '2026-10-08 15:40' });
  add('2026-10-07', { u: 'A', area: '岐卓', cls: '500', kana: 'た', num: '45-67', nc: '中', importedAt: '2026-10-07 11:05' });
  add('2026-10-09', { u: 'AI', area: '名古屋', cls: '330', kana: 'お', num: '80-01', nc: '新', importedAt: '2026-10-09 13:22' });
  add('2026-10-03', { u: 'B', area: '飛騨', cls: '530', kana: 'ね', num: '・・77', nc: '中', importedAt: '2026-10-05 09:31' });
  add('2026-10-09', { u: 'AI', area: '豊田', cls: '5000', kana: 'ゆ', num: '23-45', nc: '中', importedAt: '2026-10-09 16:02' });
  add(null, { u: 'A', area: '岐阜', cls: '300', kana: 'ま', num: '31-08', nc: '新', importedAt: '2026-10-10 09:14', dateCandidates: ['2026-10-09', '2026-10-02'] });
  add('2026-10-08', { u: 'A', area: '岐阜', cls: '500', kana: 'ち', num: '66-10', nc: '中', importedAt: '2026-10-08 14:30', noSeal: true, noSealReason: '番号変更なしのため封印不要' });
  add('2026-10-05', { u: 'B', area: '岐阜', cls: '330', kana: 'せ', num: '・・・8', nc: '中', inputType: '手入力', manualReason: '再封印', importedAt: '2026-10-05 15:10' });
  add('2026-10-09', { u: 'A', area: sept.area, cls: sept.cls, kana: sept.kana, num: sept.num, nc: '中', importedAt: '2026-10-09 10:48' });
  add('2026-10-02', { u: 'A', area: '岐阜', cls: '300', kana: 'に', num: '<b>x</b>', nc: '新', importedAt: '2026-10-02 11:11' }); // XSS 確認用
  LOG.push({ at: '2026-10-10 15:40', fileName: 'ブランドB_新車/記録事項_901.pdf', kind: 'skip', regDate: '2026-10-09', reason: 'ブランドBの愛知ナンバー（封印委託なし）' });
  LOG.push({ at: '2026-10-07 16:20', fileName: 'ブランドA_中古車/記録事項_902.pdf', kind: 'skip', regDate: '2026-10-07', reason: 'ブランドAの岐阜・愛知以外のナンバー' });
  LOG.push({ at: '2026-10-10 16:02', fileName: 'ブランドA_新車/scan_0001.pdf', kind: 'error', reason: 'PDFから文字を読み取れません（画像のみのPDF）' });
  HIST['F00003'] = [{ at: '2026-09-03 10:00', by: '担当者A', text: '一連番号 12-30 → 12-38' }];

  STOCK = [
    { id: 'S1', kind: '受入', date: '2026-09-01', unit: 'A', qty: 100, memo: '', canceled: false, by: '管理者', at: '2026-09-01 10:02' },
    { id: 'S2', kind: '受入', date: '2026-09-02', unit: 'B', qty: 60, memo: '', canceled: false, by: '管理者', at: '2026-09-02 09:40' },
    { id: 'S3', kind: '受入', date: '2026-09-10', unit: 'AI', qty: 30, memo: '', canceled: false, by: '担当者A', at: '2026-09-10 13:15' },
    { id: 'S4', kind: '受入', date: '2026-10-01', unit: 'A', qty: 60, memo: '', canceled: false, by: '担当者A', at: '2026-10-01 09:20' },
    { id: 'S5', kind: '受入', date: '2026-10-05', unit: 'B', qty: 40, memo: '', canceled: false, by: '担当者B', at: '2026-10-05 10:45' },
    { id: 'S6', kind: '調整', date: '2026-10-07', unit: 'AI', qty: 2, memo: '取付時に破損', canceled: false, by: '担当者B', at: '2026-10-07 16:05' }
  ];
  rseq = 6;

  /* ---------- 判定（簡易） ---------- */
  function near(area) {
    return allAreas().filter(function (a) { return a.length === area.length && a.split('').filter(function (c, i) { return c === area[i]; }).length >= a.length - 1; })[0];
  }
  function evaluate() {
    var byMonth = {};
    REC.forEach(function (r) { r.unit = unitOf(r.brand, r.area); (byMonth[monthOf(r)] = byMonth[monthOf(r)] || []).push(r); });
    REC.forEach(function (r) {
      var out = [], add = function (code, level, title, msg) { out.push({ code: code, level: level, title: title, msg: msg }); };
      if (!hasPlate(r)) add('plate', 'pend', '登録番号を読み取れません', 'PDFを見て4項目を入力してください。');
      if (r.area && !kindOf(r.area)) { var n = near(r.area); add('area', 'pend', '地域名を判定できません', '「' + r.area + '」は地域名マスタにないため、集計単位を決められません。' + (n ? '「' + n + '」の読み取り違いではありませんか？' : '')); }
      if (!r.regDate) add('date', 'pend', '登録日を1つに決められません', (r.dateCandidates || []).length ? '登録日の候補が' + r.dateCandidates.length + '件見つかりました（' + r.dateCandidates.map(md).join('、') + '）。PDFを見て正しい日付を選んでください。' : '登録日を読み取れませんでした。');
      if (!r.brand || !r.nc) add('brand', 'pend', 'ブランド・新中が決まっていません', 'ブランドと新車・中古車を選んでください。');
      if (active(r) && r.regDate && hasPlate(r)) {
        var others = (byMonth[monthOf(r)] || []).filter(function (x) { return x !== r && active(x) && x.regDate && plateKey(x) === plateKey(r); });
        if (others.length) {
          var same = SET.useVin && r.vin && others.some(function (x) { return x.vin === r.vin; });
          add('dup', 'err', '同じ月に同じ登録番号があります', others.map(function (x) { return md(x.regDate) + ' ' + (x.inputType === '手入力' ? '手入力' : '取込') + '分（' + x.id + '）'; }).join('、') + 'と重複しています。' + (same ? '車台番号も同じため、同じPDFの二重取込の可能性が高いです。' : '車台番号は異なります。'));
        }
        var past = REC.filter(function (x) { return x !== r && x.regDate && x.regDate < r.regDate && monthOf(x) !== monthOf(r) && plateKey(x) === plateKey(r); });
        if (past.length) add('past', 'info', '過去の月にも同じ登録番号があります', md(past[0].regDate) + ' に登録済みです。変更登録などで正しい場合もあります（参考）。');
      }
      if (r.kana && (BAD_KANA.indexOf(r.kana) >= 0 || !/^[ぁ-ゖ]$/.test(r.kana))) add('kana', 'warn', '登録番号に使えないひらがなです', '「' + r.kana + '」は登録番号に使用されません。読み取りや入力の誤りの可能性があります。');
      if (r.cls && !/^[1-9][0-9A-Z]{0,2}$/.test(r.cls)) add('cls', 'warn', '分類番号の形式が正しくありません', '「' + r.cls + '」は分類番号の形式（1〜3桁、英字を含む場合あり）に合いません。');
      if (r.num && !/^(・{1,3}\d{1,3}|\d{2}-\d{2})$/.test(r.num)) add('num', 'warn', '一連番号の形式が正しくありません', '「' + r.num + '」は一連番号の形式（例：12-34、・・・1）に合いません。');
      if (r.regDate) {
        if (r.regDate > TODAY) add('future', 'warn', '登録日が未来の日付です', wareki(r.regDate) + ' は今日より後の日付です。');
        else if (dayType(r.regDate)) add('closed', 'warn', '登録日が閉庁日です', wareki(r.regDate) + '（' + WD[dow(r.regDate)] + (HOLI[r.regDate] ? '・' + HOLI[r.regDate] : '') + '）は支局の閉庁日です。');
        if (r.inputType !== '手入力' && r.savedDate) {
          var gap = Math.abs(Math.round((Date.parse(r.savedDate) - Date.parse(r.regDate)) / 864e5));
          if (gap > SET.tolDays) add('gap', 'warn', '保存日と登録日が離れています', 'PDFの保存日と登録日が' + gap + '日離れています（許容差：' + SET.tolDays + '日）。');
        }
      }
      r.checks = out;
      r.status = r.excluded ? '除外' : r.noSeal ? '封印なし' : out.some(function (c) { return c.level === 'err'; }) ? '重複' :
        out.some(function (c) { return c.level === 'pend'; }) ? '要確認' :
          out.some(function (c) { return c.level === 'warn' && r.acked.indexOf(c.code) < 0; }) ? '誤りの疑い' : '正常';
    });
  }
  function view(r) {
    var v = JSON.parse(JSON.stringify(r));
    v.statusCode = STATUS_CODE[r.status] || 'pend'; v.month = monthOf(r); v.locked = isClosed(v.month);
    return v;
  }

  /* ---------- 残数 ---------- */
  var sealed = function (r) { return r.status === '正常' && r.unit && r.regDate; };
  function sumStock(kind, u, pred) { return STOCK.filter(function (x) { return !x.canceled && x.kind === kind && x.unit === u && pred(x.date); }).reduce(function (a, x) { return a + x.qty; }, 0); }
  function usedOn(u, pred) { return REC.filter(function (r) { return sealed(r) && r.unit === u && pred(r.regDate); }).length; }
  function carry(u, m) {
    if (m <= SET.startMonth) return SET.startCarry[u] || 0;
    var p = prevMonth(m), inM = function (d) { return d.slice(0, 7) === p; };
    return carry(u, p) + sumStock('受入', u, inM) - sumStock('調整', u, inM) - usedOn(u, inM);
  }
  function stockSum(u, m) {
    var c = carry(u, m), inM = function (d) { return d.slice(0, 7) === m; };
    var rcv = sumStock('受入', u, inM), adj = sumStock('調整', u, inM), used = usedOn(u, inM), left = c + rcv - adj - used;
    var bal = c, neg = [];
    monthDays(m).forEach(function (d) { var on = function (x) { return x === d; }; bal += sumStock('受入', u, on) - sumStock('調整', u, on) - usedOn(u, on); if (bal < 0) neg.push(d); });
    var pend = REC.filter(function (r) { return r.unit === u && monthOf(r) === m && BLOCKING.indexOf(r.status) >= 0; }).length;
    return { carry: c, received: rcv, adjusted: adj, used: used, left: left, negativeDays: neg, pending: pend, low: left < SET.lowStock };
  }

  /* ---------- Payload ---------- */
  function months() { var a = [], m = TODAY.slice(0, 7); while (m >= SET.startMonth) { a.push(m); m = prevMonth(m); } return a; }
  function payload(month) {
    month = month || TODAY.slice(0, 7);
    evaluate();
    var stock = {}; UNITS.forEach(function (u) { stock[u] = stockSum(u, month); });
    var recentLog = LOG.slice().sort(function (a, b) { return b.at.localeCompare(a.at); }).slice(0, 10).map(function (l) {
      if (l.kind !== 'record') return l;
      var r = REC.filter(function (x) { return x.id === l.recordId; })[0];
      return r ? { at: l.at, fileName: l.fileName, kind: 'record', recordId: r.id, status: r.status, statusCode: STATUS_CODE[r.status], regDate: r.regDate, unit: r.unit, reason: '' } : l;
    });
    return {
      user: { email: ME.email, name: ME.name, role: ME.role }, today: TODAY, month: month, months: months(),
      records: REC.filter(function (r) { return monthOf(r) === month; }).map(view),
      review: REC.filter(function (r) { return BLOCKING.indexOf(r.status) >= 0; }).map(view),
      stock: stock,
      stockRows: STOCK.slice().sort(function (a, b) { return b.date.localeCompare(a.date) || b.id.localeCompare(a.id); }).map(function (x) { var v = JSON.parse(JSON.stringify(x)); v.locked = isClosed(x.date.slice(0, 7)); return v; }),
      closings: JSON.parse(JSON.stringify(CLOSINGS)),
      settings: JSON.parse(JSON.stringify(SET)),
      areas: JSON.parse(JSON.stringify(AREAS)),
      recentLog: recentLog,
      importStatus: { lastRun: lastRun, pendingPdf: 0, skippedThisMonth: LOG.filter(function (l) { return l.kind === 'skip' && l.at.slice(0, 7) === TODAY.slice(0, 7); }).length, nextClose: '2026-11-01' },
      users: JSON.parse(JSON.stringify(USERS)),
      settingsHistory: SETTINGS_HISTORY.slice(0, 20),
      outputFiles: JSON.parse(JSON.stringify(OUTPUT))
    };
  }
  function blocking(m) {
    evaluate();
    var rs = REC.filter(function (r) { return monthOf(r) === m; });
    var c = function (s) { return rs.filter(function (r) { return r.status === s; }).length; };
    var b = { dup: c('重複'), pend: c('要確認'), warn: c('誤りの疑い') }; b.total = b.dup + b.pend + b.warn; return b;
  }

  /* ---------- API ---------- */
  function fail(msg) { var e = new Error(msg); e.userFacing = true; throw e; }
  function needAdmin() { if (ME.role !== '管理者') fail('この操作は管理者のみ行えます'); }
  function findRec(id) { var r = REC.filter(function (x) { return x.id === id; })[0]; if (!r) fail('データが見つかりません（' + id + '）'); return r; }
  function notLocked(r) { evaluate(); if (isClosed(monthOf(r))) fail('締め済みの月のため修正できません'); }
  var LABEL = { area: '地域名', cls: '分類番号', kana: 'ひらがな', num: '一連番号', regDate: '登録日', brand: 'ブランド', nc: '新中', noSeal: '封印なし', noSealReason: '封印なし理由', manualReason: '手入力理由' };
  function autoExclude(r) {
    var k = kindOf(r.area);
    if (!r.excluded && r.brand && k && !unitOf(r.brand, r.area)) { r.excluded = true; r.excludeReason = '集計対象外のナンバー'; addHist(r.id, 'システム', '集計対象外のナンバーのため除外'); }
  }

  var API = {
    apiBootstrap: function (month) { return { ok: true, data: payload(month) }; },
    apiGetRecord: function (id) {
      evaluate(); var r = findRec(id);
      return { ok: true, data: { record: view(r), history: (HIST[id] || []).slice(), previewUrl: r.fileId ? 'data:text/html;charset=utf-8,' + encodeURIComponent('<body style="font:14px sans-serif;display:grid;place-items:center;height:90vh;color:#555;background:#fafafa"><div style="text-align:center"><b>記録事項PDFのプレビュー（フェイク）</b><br>' + r.fileName.replace(/[<>&]/g, '') + '<br>本番では https://drive.google.com/file/d/&lt;id&gt;/preview を表示</div></body>') : null } };
    },
    apiSaveRecord: function (id, patch, month) {
      var r = findRec(id); notLocked(r);
      if (patch.noSeal && !patch.noSealReason) fail('封印を払い出していない理由を入力してください');
      var ch = [];
      Object.keys(LABEL).forEach(function (k) {
        if (!(k in patch)) return;
        var b = r[k], a = patch[k];
        if (String(b == null ? '' : b) !== String(a == null ? '' : a)) { ch.push(LABEL[k] + ' ' + (b === '' || b == null ? '（空）' : String(b)) + ' → ' + (a === '' ? '（空）' : String(a))); r[k] = a; }
      });
      if (!ch.length) return { ok: true, data: { payload: payload(month), record: view(r) }, message: '変更はありません' };
      r.updatedBy = ME.name; r.updatedAt = now();
      addHist(id, ME.name, ch.join('、'));
      autoExclude(r);
      var p = payload(month);
      return { ok: true, data: { payload: p, record: view(r) } };
    },
    apiAckCheck: function (id, code, month) {
      var r = findRec(id); notLocked(r);
      if (r.acked.indexOf(code) < 0) r.acked.push(code);
      var c = r.checks.filter(function (x) { return x.code === code; })[0];
      addHist(id, ME.name, '「' + (c ? c.title : code) + '」を問題なしとして確認');
      var p = payload(month); return { ok: true, data: { payload: p, record: view(r) } };
    },
    apiExclude: function (id, reason, month) {
      var r = findRec(id); notLocked(r);
      if (!String(reason || '').trim()) fail('除外する理由を入力してください');
      r.excluded = true; r.excludeReason = reason; addHist(id, ME.name, '除外（理由：' + reason + '）');
      var p = payload(month); return { ok: true, data: { payload: p, record: view(r) } };
    },
    apiRestore: function (id, month) {
      var r = findRec(id); notLocked(r);
      r.excluded = false; r.excludeReason = ''; addHist(id, ME.name, '除外を取り消し');
      var p = payload(month); return { ok: true, data: { payload: p, record: view(r) } };
    },
    apiAddManual: function (input, month) {
      var miss = ['area', 'cls', 'kana', 'num', 'regDate', 'brand', 'nc', 'manualReason'].filter(function (k) { return !input[k]; });
      if (miss.length) fail('入力が足りません：' + miss.map(function (k) { return LABEL[k]; }).join('、'));
      if (isClosed(input.regDate.slice(0, 7))) fail('締め済みの月には追加できません');
      mseq++;
      var r = {
        id: 'M' + String(mseq).padStart(4, '0'), regDate: input.regDate, area: input.area, cls: input.cls, kana: input.kana, num: input.num, brand: input.brand, nc: input.nc, vin: '',
        unit: '', status: '', checks: [], acked: [], noSeal: false, noSealReason: '', inputType: '手入力', manualReason: input.manualReason, excluded: false, excludeReason: '',
        dateCandidates: [], fileId: '', fileName: '', savedDate: TODAY, importedAt: now(), updatedBy: ME.name, updatedAt: now()
      };
      REC.push(r); addHist(r.id, ME.name, '手入力で追加（' + input.manualReason + '）'); autoExclude(r);
      var p = payload(month); return { ok: true, data: { payload: p, record: view(r) } };
    },
    apiAddStock: function (input, month) {
      if (['受入', '調整'].indexOf(input.kind) < 0) fail('種類が正しくありません');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || '')) fail('日付を入力してください');
      if (!(Number.isInteger(input.qty) && input.qty >= 1)) fail('個数は1以上の整数で入力してください');
      if (input.kind === '調整' && !String(input.memo || '').trim()) fail('調整のときはメモが必須です');
      if (isClosed(input.date.slice(0, 7))) fail('締め済みの月には登録できません');
      rseq++;
      STOCK.push({ id: 'S' + rseq, kind: input.kind, date: input.date, unit: input.unit, qty: input.qty, memo: input.memo || '', canceled: false, by: ME.name, at: now() });
      return { ok: true, data: { payload: payload(month) } };
    },
    apiToggleStock: function (id, month) {
      var x = STOCK.filter(function (s) { return s.id === id; })[0]; if (!x) fail('記録が見つかりません');
      if (isClosed(x.date.slice(0, 7))) fail('締め済みの月の記録は変更できません');
      x.canceled = !x.canceled;
      return { ok: true, data: { payload: payload(month) } };
    },
    apiGetReport: function (month) {
      evaluate();
      var m = month, ml = (+m.slice(5)) + '月_', days = monthDays(m), y = m.slice(0, 4);
      var dayBase = function (d) { return { date: d, dow: WD[dow(d)], dayType: dayType(d), holiday: HOLI[d] || '' }; };
      var detail = DETAIL_SHEETS.map(function (s) {
        var match = function (r) { return r.unit === s[2] && (s[3] === '' || r.nc === s[3]); };
        var rows = days.map(function (d) {
          var ok = REC.filter(function (r) { return r.regDate === d && sealed(r) && match(r); }).sort(function (a, b) { return a.importedAt.localeCompare(b.importedAt); });
          var pend = REC.filter(function (r) { return r.regDate === d && BLOCKING.indexOf(r.status) >= 0 && match(r); }).length;
          var o = dayBase(d); o.count = ok.length; o.pending = pend; o.plates = ok.map(platePrint); return o;
        });
        return { key: s[0], label: s[1], unit: s[2], sheetName: ml + s[1], rows: rows, total: rows.reduce(function (a, r) { return a + r.count; }, 0), maxCols: Math.max.apply(null, rows.map(function (r) { return r.plates.length; }).concat([0])) };
      });
      var count = UNIT_SHEETS.map(function (s) {
        var u = s[2], c = carry(u, m), bal = c, t = { received: 0, adjusted: 0, used: 0, left: 0 };
        var rows = days.map(function (d) {
          var on = function (x) { return x === d; };
          var o = dayBase(d); o.received = sumStock('受入', u, on); o.adjusted = sumStock('調整', u, on); o.used = usedOn(u, on);
          o.pending = REC.filter(function (r) { return r.regDate === d && r.unit === u && BLOCKING.indexOf(r.status) >= 0; }).length;
          bal += o.received - o.adjusted - o.used; o.balance = bal;
          t.received += o.received; t.adjusted += o.adjusted; t.used += o.used; return o;
        });
        t.left = bal;
        return { key: s[0], label: s[1], unit: u, sheetName: ml + s[1], carry: c, rows: rows, totals: t };
      });
      var report = UNIT_SHEETS.map(function (s) { var x = stockSum(s[2], m); return { key: s[0], label: s[1], unit: s[2], sheetName: ml + s[1], carry: x.carry, received: x.received, adjusted: x.adjusted, used: x.used, left: x.left }; });
      return { ok: true, data: { month: m, closed: isClosed(m), blocking: blocking(m), files: { detail: '封印明細書_' + y, count: '封印台数集計書_' + y, report: '封印報告書_' + y }, detail: detail, count: count, report: report } };
    },
    apiCloseMonth: function (month) {
      needAdmin();
      if (isClosed(month)) fail('この月はすでに締め済みです');
      var b = blocking(month);
      if (b.total) return { ok: true, data: { closed: false, blocking: b } };
      CLOSINGS[month] = { closed: true, by: ME.name, at: now() };
      return { ok: true, data: { closed: true, payload: payload(month) } };
    },
    apiReopenMonth: function (month, reason) {
      needAdmin();
      if (!String(reason || '').trim()) fail('締め解除の理由を入力してください');
      if (!isClosed(month)) fail('この月は締められていません');
      delete CLOSINGS[month];
      return { ok: true, data: { payload: payload(month) } };
    },
    apiExportSubmission: function (month) {
      var b = blocking(month);
      if (b.total) fail('確認が必要なデータが ' + b.total + ' 件残っているため出力できません。要確認タブで解消してください。');
      var y = month.slice(0, 4), ml = (+month.slice(5)) + '月';
      return { ok: true, data: { folderUrl: 'https://drive.google.com/drive/folders/FAKE-submit-' + month, files: [{ name: '封印明細書_' + y + '_' + ml + '.pdf', url: 'https://drive.google.com/file/d/FAKE1/view' }, { name: '封印台数集計書_' + y + '_' + ml + '.pdf', url: 'https://drive.google.com/file/d/FAKE2/view' }, { name: '封印報告書_' + y + '_' + ml + '.pdf', url: 'https://drive.google.com/file/d/FAKE3/view' }] } };
    },
    apiCheckFolder: function (urlOrId) {
      needAdmin();
      var s = String(urlOrId || '').trim();
      var m = s.match(/\/folders\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/);
      var id = m ? m[1] : (/^[A-Za-z0-9_-]{10,}$/.test(s) ? s : '');
      if (!id) fail('フォルダが見つかりません。GoogleドライブでフォルダのURLをコピーして貼り付けてください（drive.google.com/drive/folders/… の形式）。');
      if (/ng/i.test(id)) fail('このフォルダを開く権限がありません。フォルダの共有設定を確認してください。');
      return { ok: true, data: { id: id, url: 'https://drive.google.com/drive/folders/' + id, name: '確認済みフォルダ_' + id.slice(0, 6), pending: id.length % 4 } };
    },
    apiSaveSettings: function (input, month) {
      needAdmin();
      var h = function (t) { SETTINGS_HISTORY.unshift({ at: now(), by: ME.name, text: t }); };
      SET.folders.forEach(function (f) {
        var v = String((input.folders || {})[f.key] || '').trim(); if (!v || v === f.url || v === f.id) return;
        var m = v.match(/\/folders\/([A-Za-z0-9_-]+)/); var id = m ? m[1] : v;
        f.id = id; f.url = 'https://drive.google.com/drive/folders/' + id; f.name = '確認済みフォルダ_' + id.slice(0, 6); f.ok = true; h(f.label + 'の読み取りフォルダを変更');
      });
      [['autoEnabled', '自動実行'], ['intervalMin', '自動実行の間隔'], ['tolDays', '日付の許容差'], ['useVin', '車台番号の利用'], ['lowStock', '残数の通知ライン'], ['closeRemind', '締めリマインド'], ['notifyTo', '通知先'], ['yearly', '年ごとの帳票ファイル']].forEach(function (k) {
        if (k[0] in input && String(input[k[0]]) !== String(SET[k[0]])) { h(k[1] + 'を ' + SET[k[0]] + ' → ' + input[k[0]] + ' に変更'); SET[k[0]] = input[k[0]]; }
      });
      UNITS.forEach(function (u) { var v = (input.startCarry || {})[u]; if (v != null && +v !== SET.startCarry[u]) { h(UNIT_LABELS[u] + 'の開始月繰越を ' + SET.startCarry[u] + ' → ' + v + ' に変更'); SET.startCarry[u] = +v; } });
      return { ok: true, data: { payload: payload(month) } };
    },
    apiSaveAreas: function (areas, month) {
      needAdmin();
      ['岐阜', '愛知', '対象外'].forEach(function (k) { AREAS[k] = (areas[k] || []).map(String); });
      SETTINGS_HISTORY.unshift({ at: now(), by: ME.name, text: '地域名マスタを変更' });
      return { ok: true, data: { payload: payload(month) } };
    },
    apiSaveUsers: function (users, month) {
      needAdmin();
      if (!users.some(function (u) { return u.role === '管理者'; })) fail('管理者を最低1人残してください');
      USERS = users.map(function (u) { return { email: u.email, name: u.name, role: u.role }; });
      SETTINGS_HISTORY.unshift({ at: now(), by: ME.name, text: '利用者を変更（' + USERS.length + '名）' });
      return { ok: true, data: { payload: payload(month) } };
    },
    apiRunImportNow: function (month) {
      var r = add('2026-10-09', { u: 'B', nc: '新', importedAt: now() });
      LOG.push({ at: now(), fileName: 'ブランドA_新車/記録事項_903.pdf', kind: 'skip', reason: 'ブランドAの岐阜・愛知以外のナンバー' });
      lastRun = now();
      var p = payload(month);
      return { ok: true, data: { payload: p, result: { imported: 1, skipped: 1, review: BLOCKING.indexOf(r.status) >= 0 ? 1 : 0, errors: 0, remaining: 0 } } };
    }
  };

  /* ---------- google.script.run ---------- */
  function wrap(fn, args) {
    try { return fn.apply(null, args); }
    catch (e) { return { ok: false, error: e.userFacing ? e.message : 'サーバーでエラーが発生しました：' + e.message }; }
  }
  function runner(onOk, onErr) {
    var r = {
      withSuccessHandler: function (h) { return runner(h, onErr); },
      withFailureHandler: function (h) { return runner(onOk, h); },
      withUserObject: function () { return r; }
    };
    Object.keys(API).forEach(function (name) {
      r[name] = function () {
        var args = JSON.parse(JSON.stringify(Array.prototype.slice.call(arguments)));
        window.__fakeCalls = (window.__fakeCalls || []).concat([{ name: name, args: args }]);
        setTimeout(function () {
          if (FAIL === name) { if (onErr) onErr(new Error('ScriptError: 疑似的な通信エラー')); return; }
          var res = JSON.parse(JSON.stringify(wrap(API[name], args)));
          if (onOk) onOk(res);
        }, DELAY);
      };
    });
    return r;
  }
  window.google = window.google || {};
  window.google.script = { run: runner(null, null) };
  window.__fake = { API: API, REC: REC, setRole: function (role) { ME = role === 'editor' ? USERS[1] : USERS[0]; } };
})();
