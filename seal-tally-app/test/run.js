/**
 * test/run.js
 * 抽出・判定・残数計算の単体テスト（Node.js、追加依存なし）。
 * 実行: npm test（seal-tally-app ディレクトリで）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const sandbox = { console };
vm.createContext(sandbox);
['Config.gs', 'Extract.gs', 'Rules.gs', 'Stock.gs'].concat(
  fs.existsSync(path.join(ROOT, 'Reports.gs')) ? ['Reports.gs'] : []
).forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
});
const G = sandbox;

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok - ' + name); }
  catch (e) { fail++; console.log('  NG - ' + name + '\n      ' + (e && e.message)); }
}
const eq = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);

const AREAS = [].concat(G.DEFAULT_AREAS['岐阜'], G.DEFAULT_AREAS['愛知'], G.DEFAULT_AREAS['対象外']);
const MASTER = {};
Object.keys(G.DEFAULT_AREAS).forEach((k) => G.DEFAULT_AREAS[k].forEach((a) => { MASTER[a] = k; }));

const sample = (plateLine, extra) => [
  '自動車検査証記録事項',
  '自動車登録番号又は車両番号 ' + plateLine,
  '登録年月日/交付年月日 令和8年10月9日',
  '初度登録年月 令和3年4月',
  '車台番号 ZVW30-5123456',
  '有効期間の満了する日 令和11年10月8日',
  extra || ''
].join('\n');

console.log('# 登録番号');
const plateCases = [
  ['岐阜 303 に 12-13', { area: '岐阜', cls: '303', kana: 'に', num: '12-13' }],
  ['岐阜303に1213', { area: '岐阜', cls: '303', kana: 'に', num: '12-13' }],
  ['名古屋 500 あ ・・・1', { area: '名古屋', cls: '500', kana: 'あ', num: '・・・1' }],
  ['尾張小牧 3A0 さ 45-67', { area: '尾張小牧', cls: '3A0', kana: 'さ', num: '45-67' }],
  ['岐阜　３０３　に　１２－１３', { area: '岐阜', cls: '303', kana: 'に', num: '12-13' }],
  ['岐 阜 3 0 3 に 1 2 - 1 3', { area: '岐阜', cls: '303', kana: 'に', num: '12-13' }],
  ['岐阜 303 に 1 2 1 3', { area: '岐阜', cls: '303', kana: 'に', num: '12-13' }],
  ['飛騨 500 ね ･･77', { area: '飛騨', cls: '500', kana: 'ね', num: '・・77' }],
  ['岐阜 303 に 12ー13', { area: '岐阜', cls: '303', kana: 'に', num: '12-13' }]
];
plateCases.forEach(([line, want]) => {
  test('抽出: ' + line, () => eq(G.extractPlate_(sample(line), AREAS).plate, want));
});
test('抽出: 一連番号の直後に日付が続いても混ざらない', () => {
  const t = '自動車登録番号 岐阜 303 に 1213 2026年10月9日';
  eq(G.extractPlate_(t, AREAS).plate, { area: '岐阜', cls: '303', kana: 'に', num: '12-13' });
});
test('抽出: ラベルなしでも全体から1件なら採用', () => {
  eq(G.extractPlate_('番号 岐阜 303 に 12-13 その他', AREAS).plate, { area: '岐阜', cls: '303', kana: 'に', num: '12-13' });
});
test('抽出: ラベルなしで候補2件は決めない', () => {
  const r = G.extractPlate_('岐阜 303 に 12-13 と 岐阜 500 さ 45-67', AREAS);
  assert.strictEqual(r.plate, null); assert.strictEqual(r.candidates.length, 2);
});
test('抽出: 候補0件', () => assert.strictEqual(G.extractPlate_('なにもない', AREAS).plate, null));
test('抽出: マスタにない地域名もラベル直後なら拾う', () => {
  const r = G.extractPlate_(sample('岐卓 500 た 45-67'), AREAS);
  eq(r.plate, { area: '岐卓', cls: '500', kana: 'た', num: '45-67' });
});
test('抽出: ラベルの後に別ラベルが並ぶ表形式', () => {
  const t = '自動車登録番号又は車両番号 登録年月日/交付年月日 初度登録年月\n岐阜 303 に 12-13 令和8年10月9日 令和3年4月';
  eq(G.extractPlate_(t, AREAS).plate, { area: '岐阜', cls: '303', kana: 'に', num: '12-13' });
});

test('抽出: 「・・・1」がピリオド・三点リーダーで読まれた場合', () => {
  eq(G.extractPlate_(sample('名古屋 500 あ ...1'), AREAS).plate.num, '・・・1');
  eq(G.extractPlate_(sample('名古屋 500 あ …1'), AREAS).plate.num, '・・・1');
  eq(G.extractPlate_(sample('名古屋 500 あ ‥12'), AREAS).plate.num, '・・12');
});

console.log('# 帳票表記');
test('「・・・1」→「岐阜303に1」', () => assert.strictEqual(G.platePrint_({ area: '岐阜', cls: '303', kana: 'に', num: '・・・1' }), '岐阜303に1'));
test('「12-13」→「岐阜303に1213」', () => assert.strictEqual(G.platePrint_({ area: '岐阜', cls: '303', kana: 'に', num: '12-13' }), '岐阜303に1213'));

console.log('# 登録日');
const OPT = { today: '2026-10-11', created: '2026-10-09', toleranceDays: 7 };
test('ラベルあり', () => eq(G.extractRegDate_(sample('岐阜303に1213'), OPT).date, '2026-10-09'));
test('令和元年', () => eq(G.extractRegDate_('登録年月日 令和元年5月7日', OPT).date, '2019-05-07'));
test('全角数字', () => eq(G.extractRegDate_('登録年月日 令和８年１０月９日', OPT).date, '2026-10-09'));
test('ラベルなし：初度登録年月（年月のみ）と満了日を除外', () => {
  const t = '初度登録年月 令和3年4月 令和8年10月8日 有効期間 令和11年10月7日';
  eq(G.extractRegDate_(t, OPT).date, '2026-10-08');
});
test('ラベルなし：候補が2つ残り許容差超え→決めない', () => {
  const r = G.extractRegDate_('令和8年10月9日 令和8年9月2日', OPT);
  assert.strictEqual(r.date, null); eq(r.candidates, ['2026-10-09', '2026-09-02']);
});
test('ラベルなし：候補2つでも許容差内なら近い方', () => {
  eq(G.extractRegDate_('令和8年10月9日 令和8年10月6日', OPT).date, '2026-10-09');
});
test('空白が入った日付', () => eq(G.extractRegDate_('登 録 年 月 日 令 和 8 年 1 0 月 9 日', OPT).date, '2026-10-09'));
test('ラベル直後でも未来の日付（満了日）は採らない', () => {
  eq(G.extractRegDate_('登録年月日/交付年月日 有効期間の満了する日 令和11年10月8日 令和8年10月9日', OPT).date, '2026-10-09');
});
test('和暦表示（平成・令和元年）', () => {
  eq([G.wareki_('2019-04-30'), G.wareki_('2019-05-01')], ['平成31年4月30日', '令和元年5月1日']);
});
test('車台番号', () => assert.strictEqual(G.extractVin_(sample('岐阜303に1213')), 'ZVW30-5123456'));

console.log('# 振り分け');
const cu = (b, a) => G.classifyUnit_(b, a, MASTER);
test('A×岐阜', () => eq([cu('A', '岐阜').unit, cu('A', '岐阜').result], ['A', 'target']));
test('A×愛知', () => eq([cu('A', '名古屋').unit, cu('A', '名古屋').result], ['AI', 'target']));
test('A×三重（対象外）', () => assert.strictEqual(cu('A', '三重').result, 'skip'));
test('B×岐阜', () => eq([cu('B', '飛騨').unit, cu('B', '飛騨').result], ['B', 'target']));
test('B×名古屋（対象外）', () => assert.strictEqual(cu('B', '名古屋').result, 'skip'));
test('マスタにない地域名（要確認）', () => assert.strictEqual(cu('A', '岐卓').result, 'review'));

console.log('# チェックと状態');
const CTX = { today: '2026-10-11', tol: 7, holidays: { '2026-10-12': 'スポーツの日', '2026-09-21': '敬老の日' }, master: MASTER, useVin: true };
const rec = (o) => Object.assign({ id: 'F' + Math.random(), regDate: '2026-10-08', area: '岐阜', cls: '303', kana: 'に', num: '12-13',
  brand: 'A', nc: '新', vin: 'V-1', inputType: '自動', savedDate: '2026-10-09', importedAt: '2026-10-09 10:00', acked: [] }, o);
const run = (list) => { G.evaluateRecords_(list, CTX); return list; };
test('正常', () => { const [r] = run([rec({})]); assert.strictEqual(r.status, '正常'); assert.strictEqual(r.unit, 'A'); });
test('同月の重複（車台番号同じ）', () => {
  const l = run([rec({ id: 'F1' }), rec({ id: 'F2', regDate: '2026-10-07' })]);
  assert.strictEqual(l[0].status, '重複'); assert.ok(/二重取込/.test(l[0].checks[0].msg));
});
test('同月の重複（車台番号違う）', () => {
  const l = run([rec({ id: 'F1' }), rec({ id: 'F2', vin: 'V-2' })]);
  assert.strictEqual(l[1].status, '重複'); assert.ok(/車台番号は異なります/.test(l[1].checks[0].msg));
});
test('片方を除外すれば重複は解消', () => {
  const l = run([rec({ id: 'F1' }), rec({ id: 'F2', excluded: true, excludeReason: 'x' })]);
  eq([l[0].status, l[1].status], ['正常', '除外']);
});
test('別の月なら参考のみ（状態に影響しない）', () => {
  const l = run([rec({ id: 'F1', regDate: '2026-09-08', savedDate: '2026-09-08' }), rec({ id: 'F2' })]);
  assert.strictEqual(l[1].status, '正常'); assert.ok(l[1].checks.some((c) => c.code === 'past'));
});
test('使えないひらがな', () => assert.strictEqual(run([rec({ kana: 'お' })])[0].status, '誤りの疑い'));
test('問題なしで確認済み→正常', () => assert.strictEqual(run([rec({ kana: 'お', acked: ['kana'] })])[0].status, '正常'));
test('土曜日', () => assert.ok(run([rec({ regDate: '2026-10-10', savedDate: '2026-10-10' })])[0].checks.some((c) => c.code === 'closed')));
test('祝日', () => assert.ok(/敬老の日/.test(run([rec({ regDate: '2026-09-21', savedDate: '2026-09-21' })])[0].checks.map((c) => c.msg).join())));
test('未来日', () => assert.ok(run([rec({ regDate: '2026-10-14', savedDate: '2026-10-14' })])[0].checks.some((c) => c.code === 'future')));
test('許容差超え', () => assert.ok(run([rec({ savedDate: '2026-10-20' })])[0].checks.some((c) => c.code === 'gap')));
test('手入力は許容差を見ない', () => assert.strictEqual(run([rec({ inputType: '手入力', savedDate: '' })])[0].status, '正常'));
test('分類番号・一連番号の形式', () => {
  const r = run([rec({ cls: '5000', num: '1-234' })])[0];
  eq(r.checks.map((c) => c.code).sort(), ['cls', 'num']);
});
test('登録日未確定は要確認', () => assert.strictEqual(run([rec({ regDate: '', dateCandidates: ['2026-10-09', '2026-10-02'] })])[0].status, '要確認'));
test('マスタにない地域名は要確認＋候補', () => {
  const r = run([rec({ area: '岐卓' })])[0];
  assert.strictEqual(r.status, '要確認'); assert.ok(/岐阜/.test(r.checks[0].msg));
});
test('重複は要確認より優先', () => {
  const l = run([rec({ id: 'F1', kana: 'お' }), rec({ id: 'F2', kana: 'お' })]);
  assert.strictEqual(l[0].status, '重複');
});
test('封印なしは重複判定の対象外', () => {
  const l = run([rec({ id: 'F1' }), rec({ id: 'F2', noSeal: true, noSealReason: 'x' })]);
  eq([l[0].status, l[1].status], ['正常', '封印なし']);
});
test('修正で対象外の地域名になったら自動除外', () => {
  const r = rec({ area: '三重' });
  assert.ok(G.autoExcludeIfOutOfScope_(r, MASTER)); assert.strictEqual(r.excludeReason, '集計対象外のナンバー');
});

console.log('# 残数');
const stock = [
  { kind: '受入', date: '2026-10-01', unit: 'A', qty: 60, canceled: false },
  { kind: '調整', date: '2026-10-07', unit: 'A', qty: 2, canceled: false },
  { kind: '受入', date: '2026-10-08', unit: 'A', qty: 99, canceled: true }
];
const recs = run([
  rec({ id: 'F1', regDate: '2026-10-06', savedDate: '2026-10-06' }),
  rec({ id: 'F2', regDate: '2026-10-06', savedDate: '2026-10-06', num: '22-22' }),
  rec({ id: 'F3', regDate: '2026-10-07', savedDate: '2026-10-07', num: '33-33', noSeal: true }),
  rec({ id: 'F4', regDate: '2026-10-07', savedDate: '2026-10-07', num: '44-44', excluded: true }),
  rec({ id: 'F5', regDate: '2026-10-07', savedDate: '2026-10-07', num: '55-55', kana: 'お' })
]);
const ctxS = { startMonth: '2026-10', startCarry: { A: 30, B: 0, AI: 0 }, closings: {}, stock, records: recs };
test('繰越＋受入−調整−封印台数（取消・封印なし・除外・未確定は数えない）', () => {
  const s = G.stockSummary_('2026-10', ctxS).A;
  eq([s.carry, s.received, s.adjusted, s.used, s.left], [30, 60, 2, 2, 86]);
});
test('翌月の繰越は前月から計算', () => assert.strictEqual(G.carryFor_('A', '2026-11', ctxS), 86));
test('締め済みの月は確定値を使う', () => {
  const c = Object.assign({}, ctxS, { closings: { '2026-10': { A: { left: 80 } } } });
  assert.strictEqual(G.carryFor_('A', '2026-12', c), 80);
});
test('残数マイナスの日を検出', () => {
  const s = G.monthMovement_('A', '2026-10', 0, [], recs);
  eq(s.negativeDays.slice(0, 1), ['2026-10-06']);
});
test('しきい値の通知は1回だけ', () => {
  let flag = false, sent = 0;
  [12, 9, 8, 7].forEach((v) => { const d = G.lowStockDecision_(v, 10, flag); if (d.send) sent++; flag = d.flag; });
  assert.strictEqual(sent, 1);
  [50, 9].forEach((v) => { const d = G.lowStockDecision_(v, 10, flag); if (d.send) sent++; flag = d.flag; });
  assert.strictEqual(sent, 2);
});
test('受入・調整の入力チェック', () => {
  eq(G.validateStockInput_({ kind: '調整', date: '2026-10-01', unit: 'A', qty: 0, memo: '' }, {}).length, 2);
  eq(G.validateStockInput_({ kind: '受入', date: '2026-09-01', unit: 'A', qty: 5 }, { '2026-09': true }), ['締め済みの月には登録できません']);
});

if (fs.existsSync(path.join(__dirname, 'reports.test.js'))) require('./reports.test.js')(G, { test, eq, assert, run, rec });

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
