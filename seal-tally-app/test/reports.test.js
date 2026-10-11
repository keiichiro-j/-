/**
 * test/reports.test.js
 * 帳票の組み立て（buildReportData_）の単体テスト。test/run.js から読み込まれる。
 */
'use strict';
module.exports = function (G, { test, eq, assert, run, rec }) {
  console.log('# 帳票');
  const HOL = { '2026-10-12': 'スポーツの日' };
  const records = run([
    rec({ id: 'F1', regDate: '2026-10-06', savedDate: '2026-10-06', num: '11-11', importedAt: '2026-10-06 15:00' }),
    rec({ id: 'F2', regDate: '2026-10-06', savedDate: '2026-10-06', num: '22-22', importedAt: '2026-10-06 09:00' }),
    rec({ id: 'M0001', regDate: '2026-10-06', num: '・・・1', inputType: '手入力', savedDate: '', importedAt: '2026-10-06 12:00' }),
    rec({ id: 'F3', regDate: '2026-10-07', savedDate: '2026-10-07', num: '33-33', nc: '中' }),
    rec({ id: 'F4', regDate: '2026-10-07', savedDate: '2026-10-07', num: '44-44', kana: 'お' }),          // 誤りの疑い
    rec({ id: 'F5', regDate: '2026-10-08', savedDate: '2026-10-08', num: '55-55', noSeal: true, noSealReason: 'x' }),
    rec({ id: 'F6', regDate: '2026-10-08', savedDate: '2026-10-08', area: '名古屋', num: '66-66' }),       // 愛知
    rec({ id: 'F7', regDate: '2026-10-08', savedDate: '2026-10-08', brand: 'B', num: '77-77' }),
    rec({ id: 'F8', regDate: '2026-09-30', savedDate: '2026-09-30', num: '88-88' })                       // 前月
  ]);
  const stock = [
    { id: 'R1', kind: '受入', date: '2026-10-01', unit: 'A', qty: 50, canceled: false },
    { id: 'R2', kind: '調整', date: '2026-10-07', unit: 'A', qty: 1, canceled: false },
    { id: 'R3', kind: '受入', date: '2026-10-02', unit: 'A', qty: 9, canceled: true },
    { id: 'R4', kind: '受入', date: '2026-09-01', unit: 'A', qty: 20, canceled: false }
  ];
  const ctx = { startMonth: '2026-09', startCarry: { A: 10, B: 5, AI: 0 }, closings: {}, stock, records };
  const d = G.buildReportData_('2026-10', records, ctx, HOL, false, { yearly: true });
  const sheet = (list, key) => list.find((s) => s.key === key);

  test('ファイル名・シート名', () => {
    eq(d.files, { detail: '封印明細書_2026', count: '封印台数集計書_2026', report: '封印報告書_2026' });
    assert.strictEqual(sheet(d.detail, 'A新').sheetName, '10月_ブランドA新車');
    assert.strictEqual(sheet(d.count, 'AI').sheetName, '10月_愛知');
    assert.strictEqual(G.buildReportData_('2026-10', records, ctx, HOL, false, { yearly: false }).detail[0].sheetName, '2026年10月_ブランドA新車');
  });
  test('明細書：1日〜月末の全日・曜日・祝日', () => {
    const a = sheet(d.detail, 'A新');
    assert.strictEqual(a.rows.length, 31);
    eq([a.rows[0].date, a.rows[0].dow], ['2026-10-01', '木']);
    eq([a.rows[11].dayType, a.rows[11].holiday], ['hol', 'スポーツの日']);
    eq([a.rows[2].dayType, a.rows[3].dayType, a.rows[4].dayType], ['sat', 'sun', '']);
  });
  test('明細書：同じ日の中は取込順（手入力は入力順）、表記は空白・ハイフン・中黒なし', () => {
    eq(sheet(d.detail, 'A新').rows[5].plates, ['岐阜303に2222', '岐阜303に1', '岐阜303に1111']);
  });
  test('明細書：正常だけを数え、未確定は pending、合計', () => {
    const a = sheet(d.detail, 'A新');
    eq([a.rows[6].count, a.rows[6].pending], [0, 1]);   // F4 は誤りの疑い（F3 は中古車シート）
    assert.strictEqual(a.rows[7].count, 0);             // F5 は封印なし
    assert.strictEqual(a.total, 3);
    assert.strictEqual(a.maxCols, 5);
    assert.strictEqual(sheet(d.detail, 'A中').total, 1);
    assert.strictEqual(sheet(d.detail, 'AI').total, 1);
    assert.strictEqual(sheet(d.detail, 'B新').total, 1);
  });
  test('台数集計書：前月繰越＋受入−調整−封印台数（取消は含めない）', () => {
    const c = sheet(d.count, 'A');
    // 9月：繰越10＋受入20−封印1（F8）＝29
    assert.strictEqual(c.carry, 29);
    eq([c.rows[0].received, c.rows[0].balance], [50, 79]);
    eq([c.rows[5].used, c.rows[5].balance], [3, 76]);
    eq([c.rows[6].adjusted, c.rows[6].used, c.rows[6].pending, c.rows[6].balance], [1, 1, 1, 74]);
    eq(c.totals, { received: 50, adjusted: 1, used: 4, left: 74 });
    assert.strictEqual(c.rows[30].balance, 74);
  });
  test('報告書：集計単位ごとの数字', () => {
    eq(d.report.map((r) => [r.key, r.carry, r.received, r.adjusted, r.used, r.left]),
      [['A', 29, 50, 1, 4, 74], ['B', 5, 0, 0, 1, 4], ['AI', 0, 0, 0, 1, -1]]);
    eq(sheet(d.count, 'AI').negativeDays, ['2026-10-08'].concat(G.monthDays_('2026-10').slice(8)));
  });
  test('締めを妨げる件数', () => {
    eq(d.blocking, { dup: 0, pend: 0, warn: 1, total: 1 });
    assert.strictEqual(d.closed, false);
  });
  test('締め済みの月は確定値を繰越に使う', () => {
    const c2 = Object.assign({}, ctx, { closings: { '2026-09': { A: { left: 40 } } } });
    assert.strictEqual(G.buildReportData_('2026-10', records, c2, HOL, false).report[0].carry, 40);
  });
  test('標準レイアウトの明細書：見出し2行＋31日＋合計', () => {
    const g = G.detailSheetGrid_(sheet(d.detail, 'A新'), d);
    assert.strictEqual(g.values.length, 34);
    eq(g.values[7].slice(0, 6), ['10/6', '火', 3, '岐阜303に2222', '岐阜303に1', '岐阜303に1111']);
    eq(g.values[33].slice(0, 3), ['合計', '', 3]);
    assert.strictEqual(g.colors[13][0], G.REPORT_COLORS_.hol);
  });
  test('標準レイアウトの台数集計書：繰越行と合計行、調整はマイナス表示', () => {
    const g = G.countSheetGrid_(sheet(d.count, 'A'), d);
    eq(g.values[2].slice(0, 6), ['前月からの繰越', '', '', '', '', 29]);
    eq(g.values[9].slice(2, 6), ['', -1, 1, 74]);
    eq(g.values[g.values.length - 1].slice(0, 6), ['合計', '', 50, -1, 4, 74]);
  });
  test('締めの可否：登録日のない未確定明細（候補にその月／候補なしで取込が翌月）も数える', () => {
    const list = run([
      rec({ id: 'P1', regDate: '', dateCandidates: ['2026-10-30', '2026-11-02'], importedAt: '2026-11-03 09:00' }),
      rec({ id: 'P2', regDate: '', dateCandidates: [], importedAt: '2026-11-02 09:00' }),
      rec({ id: 'P3', regDate: '', dateCandidates: ['2026-11-02'], importedAt: '2026-11-03 09:00' }),
      rec({ id: 'P4', regDate: '', dateCandidates: [], importedAt: '2026-12-01 09:00' })
    ]);
    eq(G.blockingCounts_(list, '2026-10'), { dup: 0, pend: 0, warn: 0, total: 0 });
    eq(G.closeBlockingCounts_(list, '2026-10'), { dup: 0, pend: 2, warn: 0, total: 2 });
  });
  test('帳票ファイル内のシート順：台数集計書・報告書はブランドA・ブランドB・愛知', () => {
    const k = (n, d) => G.reportSheetOrderKey_(n, d).idx;
    eq([k('10月_ブランドA', 'count'), k('10月_ブランドB', 'count'), k('10月_愛知', 'count')], [0, 1, 2]);
    eq([k('10月_ブランドA新車', 'detail'), k('10月_愛知', 'detail')], [0, 4]);
  });
};
