/**
 * tests/run.js
 * Code.gs 中の純粋関数（スプレッドシート・ドライブ・Gemini に依存しないロジック）を
 * Node.js の vm サンドボックスへ読み込んで単体テストする。外部ライブラリ非依存。
 * 実行: npm test / node tests/run.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), sandbox, { filename: 'Code.gs' });
const S = sandbox;

// サンドボックス内の Date（instanceof 判定をサンドボックス側と揃える）
const date = (y, m, d) => vm.runInContext(`new Date(${y}, ${m - 1}, ${d})`, sandbox);
const ymd = (d) => d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
const TODAY = date(2026, 9, 29);
const plain = (x) => JSON.parse(JSON.stringify(x));

// 設定シートの初期値から選択肢を組み立てる（readLists_ と同じ形）
const LISTS = {
  category: S.CATEGORY_OPTIONS.map((v) => ({ value: v, aliases: [] })),
  status: S.STATUS_OPTIONS.map((v) => ({ value: v, aliases: [] }))
};
Object.keys(S.DEFAULT_LISTS).forEach((k) => {
  LISTS[k] = S.DEFAULT_LISTS[k].map((e) => ({ value: S.normalizeKanaText(e[0]), aliases: (e[1] || '').split(',').filter((a) => a) }));
});
LISTS.staff = [{ value: '山田', aliases: [] }, { value: '佐藤', aliases: [] }];
const F = (key) => S.FIELD_BY_KEY[key];

let pass = 0;
let fail = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log('  ok - ' + name);
  } catch (e) {
    fail++;
    console.error('  NG - ' + name);
    console.error('       ' + e.message);
  }
}

console.log('== 列定義（企画書 第4章）==');
test('A〜AC の29列。企画書どおりの位置', () => {
  assert.strictEqual(S.FIELDS.length, 29);
  const col = (label) => S.columnLetter(S.STANDARD_HEADERS.indexOf(label) + 1);
  assert.strictEqual(col('仕入年月日'), 'A');
  assert.strictEqual(col('OCN'), 'B');
  assert.strictEqual(col('車種'), 'C');
  assert.strictEqual(col('車台番号'), 'E');
  assert.strictEqual(col('車検残'), 'H');
  assert.strictEqual(col('走行距離'), 'I');
  assert.strictEqual(col('色'), 'J');
  assert.strictEqual(col('本人確認方法'), 'O');
  assert.strictEqual(col('登録番号（地域）'), 'P');
  assert.strictEqual(col('ステータス'), 'T');
  assert.strictEqual(col('車検証'), 'W');
  assert.strictEqual(col('下取充当額'), 'X');
  assert.strictEqual(col('査定価格'), 'AA');
  assert.strictEqual(col('下取損'), 'AB');
  assert.strictEqual(col('仕入価格（買取金額）'), 'AC');
});
test('計算式の列は車検残・下取損・仕入価格の3つ', () => {
  assert.deepStrictEqual(Array.from(S.FIELDS.filter((f) => f.type === 'formula'), (f) => f.key), ['inspectionRemain', 'tradeInLoss', 'purchasePrice']);
});
test('resolveColumns：旧見出し・別表記・順不同・半角カナの見出しでも特定', () => {
  const res = S.resolveColumns(['OCN', '仕入日', 'メーカー', 'カラー', '担当者', '仕入区分', '登録番号(地域)', '買取金額', '車検証ﾘﾝｸ', '備考']);
  assert.strictEqual(res.map.ocn, 0);
  assert.strictEqual(res.map.purchaseDate, 1);
  assert.strictEqual(res.map.maker, 2);
  assert.strictEqual(res.map.color, 3);
  assert.strictEqual(res.map.staff, 4);
  assert.strictEqual(res.map.category, 5);
  assert.strictEqual(res.map.plateRegion, 6);
  assert.strictEqual(res.map.purchasePrice, 7);
  assert.strictEqual(res.map.certLink, 8);
  assert.deepStrictEqual(Array.from(res.unknown, (u) => u.label), ['備考']);
});
test('isStandardLayout', () => {
  assert.strictEqual(S.isStandardLayout(S.STANDARD_HEADERS.slice()), true);
  const swapped = S.STANDARD_HEADERS.slice();
  [swapped[3], swapped[4]] = [swapped[4], swapped[3]];
  assert.strictEqual(S.isStandardLayout(swapped), false);
});
test('buildArrayFormula：車検残・下取損は見出し行の ARRAYFORMULA、仕入価格は未確定で null', () => {
  const cols = S.resolveColumns(S.STANDARD_HEADERS.slice()).map;
  assert.strictEqual(S.buildArrayFormula('tradeInLoss', cols), '={"下取損";ARRAYFORMULA(IF((X2:X="")+(Z2:Z=""),,X2:X-Z2:Z))}');
  assert.strictEqual(S.buildArrayFormula('inspectionRemain', cols),
    '={"車検残";ARRAYFORMULA(IFERROR(IF(G2:G="",,IF(G2:G<=TODAY(),"満了",G2:G-TODAY())),""))}');
  assert.deepStrictEqual(Array.from(S.FORCED_FORMULA_KEYS), ['inspectionRemain']);
  assert.strictEqual(S.buildArrayFormula('purchasePrice', cols), null);
});

console.log('== 自動整形（企画書 第5章）==');
test('全角カナ → 半角カナ（濁点・半濁点・長音・中点）', () => {
  assert.strictEqual(S.toHalfKana('メルセデス・ベンツ'), 'ﾒﾙｾﾃﾞｽ･ﾍﾞﾝﾂ');
  assert.strictEqual(S.toHalfKana('ポルシェ'), 'ﾎﾟﾙｼｪ');
  assert.strictEqual(S.toHalfKana('ヴィッツ'), 'ｳﾞｨｯﾂ');
  assert.strictEqual(S.toHalfKana('スーパー'), 'ｽｰﾊﾟｰ');
  assert.strictEqual(S.toHalfKana('やなせ商事'), 'やなせ商事');
});
test('半角カナ → 全角カタカナ（登録番号のひらがな用）', () => {
  assert.strictEqual(S.toFullKatakana('ﾎﾟﾙｼｪ'), 'ポルシェ');
  assert.strictEqual(S.normalizePlateKana('ｻ'), 'さ');
  assert.strictEqual(S.normalizePlateKana('ﾊﾟ'), 'ぱ');
  assert.strictEqual(S.normalizePlateKana('ワ'), 'わ');
});
test('KANA_FULL と KANA_HALF の対応数が一致', () => {
  assert.strictEqual(S.KANA_FULL.length, S.KANA_HALF.length);
});
test('モデル名・仕入先：全角英数・カナを半角に、前後の空白を削除', () => {
  assert.strictEqual(S.normalizeKanaText('　Ｃ２００　アバンギャルド　'), 'C200 ｱﾊﾞﾝｷﾞｬﾙﾄﾞ');
  assert.strictEqual(S.normalizeKanaText('カブシキガイシャ　ヤナセ'), 'ｶﾌﾞｼｷｶﾞｲｼｬ ﾔﾅｾ');
});
test('住所：英数字だけ半角、番地の「ー」は「-」', () => {
  assert.strictEqual(S.normalizeAddress('東京都港区芝浦１ー２ー３　ヤナセビル５Ｆ'), '東京都港区芝浦1-2-3 ヤナセビル5F');
});
test('車台番号：大文字化・半角化、ハイフンは残す（文字の補正はしない）', () => {
  assert.strictEqual(S.normalizeChassisInput('ｚｖｗ３０ー１２３４５６７'), 'ZVW30-1234567');
  assert.strictEqual(S.normalizeChassisInput('wdd 2050042f123456'), 'WDD2050042F123456');
});
test('和暦・西暦 → 日付', () => {
  assert.strictEqual(ymd(S.parseJapaneseDate('R5.6.1')), '2023/6/1');
  assert.strictEqual(ymd(S.parseJapaneseDate('令和5年6月1日')), '2023/6/1');
  assert.strictEqual(ymd(S.parseJapaneseDate('令和元年5月')), '2019/5/1');
  assert.strictEqual(ymd(S.parseJapaneseDate('H30/12/25')), '2018/12/25');
  assert.strictEqual(ymd(S.parseJapaneseDate('２０２４．１．３１')), '2024/1/31');
  assert.strictEqual(ymd(S.parseJapaneseDate('20230401')), '2023/4/1');
  assert.strictEqual(S.parseJapaneseDate('2023/2/30'), null);
  assert.strictEqual(S.parseJapaneseDate('不明'), null);
});
test('走行距離・金額の「km」「円」「,」を外して数値化', () => {
  assert.strictEqual(S.parseMileage('12,345km'), 12345);
  assert.strictEqual(S.parseMileage('１．２万ｋｍ'), 12000);
  assert.strictEqual(S.parseAmount('1,234,000円'), 1234000);
  assert.strictEqual(S.parseAmount('¥123万'), 1230000);
  assert.strictEqual(S.parseAmount('約100'), null);
});
test('normalizeCellValue：列の種類ごとの整形', () => {
  assert.strictEqual(ymd(S.normalizeCellValue(F('inspectionExpiry'), 'R2.3.10', LISTS).value), '2020/3/10');
  assert.strictEqual(S.normalizeCellValue(F('mileage'), '45,678km', LISTS).value, 45678);
  assert.strictEqual(S.normalizeCellValue(F('appraisalPrice'), '2,350,000円', LISTS).value, 2350000);
  assert.strictEqual(S.normalizeCellValue(F('ocn'), '００１２３', LISTS).value, 123);
  assert.strictEqual(S.normalizeCellValue(F('plateNumber'), '１２－３４', LISTS).value, '1234');
  assert.strictEqual(S.normalizeCellValue(F('plateNumber'), '・・１２', LISTS).value, '12');
  assert.strictEqual(S.normalizeCellValue(F('plateClass'), '３３０', LISTS).value, '330');
  assert.strictEqual(S.normalizeCellValue(F('plateKana'), 'サ', LISTS).value, 'さ');
  assert.strictEqual(S.normalizeCellValue(F('supplier'), 'ヤマダ　タロウ', LISTS).value, 'ﾔﾏﾀﾞ ﾀﾛｳ');
});
test('normalizeCellValue：値が正しい書式なら changed=false', () => {
  assert.strictEqual(S.normalizeCellValue(F('mileage'), 45678, LISTS).changed, false);
  assert.strictEqual(S.normalizeCellValue(F('firstRegDate'), date(2020, 3, 1), LISTS).changed, false);
  assert.strictEqual(S.normalizeCellValue(F('modelName'), 'C200', LISTS).changed, false);
  assert.strictEqual(S.normalizeCellValue(F('modelName'), '', LISTS).changed, false);
});
test('normalizeCellValue：直せない値は error、計算式・リンクの列は触らない', () => {
  assert.strictEqual(S.normalizeCellValue(F('inspectionExpiry'), '去年', LISTS).error, '日付として読めません');
  assert.strictEqual(S.normalizeCellValue(F('mileage'), '不明', LISTS).error, '数値として読めません');
  assert.strictEqual(S.normalizeCellValue(F('ocn'), 'NEW-8392', LISTS).error, 'OCNが数値ではありません');
  assert.strictEqual(S.normalizeCellValue(F('tradeInLoss'), '１００', LISTS).changed, false);
  assert.strictEqual(S.normalizeCellValue(F('certLink'), '車検証リンク', LISTS).changed, false);
});

console.log('== プルダウン ==');
test('メーカー：表記ゆれを選択肢へ（別名・部分一致・半角カナ）', () => {
  assert.strictEqual(S.normalizeCellValue(F('maker'), 'メルセデス・ベンツ', LISTS).value, 'MB');
  assert.strictEqual(S.normalizeCellValue(F('maker'), 'ポルシェ', LISTS).value, 'ﾎﾟﾙｼｪ');
  assert.strictEqual(S.normalizeCellValue(F('maker'), 'ｂｍｗ', LISTS).value, 'BMW');
  assert.strictEqual(S.normalizeCellValue(F('maker'), 'BMW MINI', LISTS).value, 'MINI'); // 最長一致
  assert.strictEqual(S.normalizeCellValue(F('maker'), 'フォルクスワーゲン', LISTS).value, 'VW');
});
test('色：色名を10色へ（ダークブルー→紺、パールホワイト→白）', () => {
  assert.strictEqual(S.normalizeCellValue(F('color'), 'ダークブルー', LISTS).value, '紺');
  assert.strictEqual(S.normalizeCellValue(F('color'), 'ポーラーホワイト', LISTS).value, '白');
  assert.strictEqual(S.normalizeCellValue(F('color'), 'シルバー', LISTS).value, '灰');
});
test('担当者・区分・ステータスは完全一致のみ。選択肢外は outOfList', () => {
  assert.strictEqual(S.normalizeCellValue(F('staff'), '山田', LISTS).outOfList, undefined);
  const r = S.normalizeCellValue(F('staff'), '山田太郎', LISTS);
  assert.strictEqual(r.value, '山田太郎');
  assert.strictEqual(r.outOfList, true);
  assert.strictEqual(S.normalizeCellValue(F('category'), '下取', LISTS).outOfList, undefined);
  assert.strictEqual(S.normalizeCellValue(F('status'), '名変中', LISTS).outOfList, true);
});
test('地域名：一覧と照合', () => {
  assert.strictEqual(S.normalizeCellValue(F('plateRegion'), '品川', LISTS).outOfList, undefined);
  assert.strictEqual(S.normalizeCellValue(F('plateRegion'), '品用', LISTS).outOfList, true);
});
test('suggestListValue：置き換え候補（よく似た選択肢）', () => {
  assert.strictEqual(S.suggestListValue('品用', LISTS.region, false), '品川');
  assert.strictEqual(S.suggestListValue('名変中', LISTS.status, false), '');
  assert.strictEqual(S.suggestListValue('ﾍﾞﾝﾂ', LISTS.maker, true), 'MB');
});

console.log('== 入力チェック（条件付き書式）==');
test('3シート横断の車台番号・登録番号の重複、形式違い、日付の矛盾、満了間近', () => {
  const std = S.resolveColumns(S.STANDARD_HEADERS.slice()).map;
  const maps = { '輸入車マスタ': std, '国産車マスタ': std, '販売済み': std };
  const rules = S.buildCheckRules('輸入車マスタ', maps, 30);
  const notes = rules.map((r) => r.note);
  ['車台番号の重複（3シート横断）', '車台番号の形式違い', '登録番号4項目の重複', '分類番号の形式違い', '一連番号の形式違い',
    '初度登録日が未来', '車検満了日が初度登録日以前', '車検満了が近い車両'].forEach((n) => assert.ok(notes.indexOf(n) !== -1, n));
  const dup = rules[0].formula;
  assert.ok(dup.indexOf('INDIRECT("\'国産車マスタ\'!E2:E")') !== -1);
  assert.ok(dup.indexOf('INDIRECT("\'販売済み\'!E2:E")') !== -1);
  rules.forEach((r) => assert.ok(r.formula.indexOf(S.CF_MARKER) !== -1));
  // 販売済みシートには満了間近の強調を付けない
  assert.ok(S.buildCheckRules('販売済み', maps, 30).every((r) => !r.wholeRow));
});
test('車台番号の形式規則は輸入車17桁・国産車（ハイフンあり）を正とする', () => {
  const re = /^([A-HJ-NPR-Z0-9]{17}|[A-Z0-9]+-[0-9]{4,8})$/;
  assert.ok(re.test('WDD2050042F123456'));
  assert.ok(re.test('ZVW30-1234567'));
  assert.ok(!re.test('WDD2050O42F123456'));
  assert.ok(!re.test('ZVW30'));
});

console.log('== OCN ==');
test('会社単位の連番（最大値と発行済み最大値の大きい方 + 1、NEW-乱数は無視）', () => {
  assert.strictEqual(S.nextOcnNumber([120, '00121', 'NEW-8392'], 0), 122);
  assert.strictEqual(S.nextOcnNumber([120], '130'), 131);
  assert.strictEqual(S.nextOcnNumber([], 0), 1);
});
test('車検証ファイル名から OCN', () => {
  assert.strictEqual(S.ocnFromFileName('12345.pdf'), 12345);
  assert.strictEqual(S.ocnFromFileName('12345_自社名義.pdf'), 12345);
  assert.strictEqual(S.ocnFromFileName('scan_001.pdf'), null);
});

console.log('== 表示形式（西暦・区切り・km）==');
test('日付の列はすべて西暦 yyyy/MM/dd、初度登録は yyyy/MM（和暦の表示形式を上書き）', () => {
  assert.strictEqual(S.numberFormatFor(F('firstRegDate')), 'yyyy/MM');
  assert.strictEqual(S.numberFormatFor(F('inspectionRemain')), '0"日"');
  assert.strictEqual(S.numberFormatFor(F('saleDate')), 'yyyy"年"MM"月"');
  ['purchaseDate', 'inspectionExpiry'].forEach((k) => assert.strictEqual(S.numberFormatFor(F(k)), 'yyyy/MM/dd', k));
  assert.ok(!/[ge]/.test(S.DATE_FORMAT)); // 和暦の書式記号（g・e）を含まない
});
test('走行距離は区切り＋km、金額は区切り、分類番号・一連番号・車台番号は文字列', () => {
  assert.strictEqual(S.numberFormatFor(F('mileage')), '#,##0"km"');
  ['tradeInAllowance', 'recycleFee', 'tradeInPrice', 'appraisalPrice'].forEach((k) => assert.strictEqual(S.numberFormatFor(F(k)), '#,##0', k));
  ['chassisNumber', 'plateClass', 'plateNumber'].forEach((k) => assert.strictEqual(S.numberFormatFor(F(k)), '@', k));
  assert.strictEqual(S.numberFormatFor(F('tradeInLoss')), '#,##0');
  assert.strictEqual(S.numberFormatFor(F('modelName')), null);
});
test('走行距離：数字だけ入れても、文字で入れても数値になる（表示は書式で 12,345km）', () => {
  assert.strictEqual(S.normalizeCellValue(F('mileage'), 12345, LISTS).value, 12345);
  assert.strictEqual(S.normalizeCellValue(F('mileage'), '１２３４５', LISTS).value, 12345);
  assert.strictEqual(S.normalizeCellValue(F('mileage'), '12,345 km', LISTS).value, 12345);
});
test('売上日：年月だけ（2026年9月・R8.9・2026/9/15 → 月の1日）', () => {
  assert.strictEqual(ymd(S.normalizeCellValue(F('saleDate'), '2026年9月', LISTS).value), '2026/9/1');
  assert.strictEqual(ymd(S.normalizeCellValue(F('saleDate'), 'R8.9', LISTS).value), '2026/9/1');
  assert.strictEqual(ymd(S.normalizeCellValue(F('saleDate'), date(2026, 9, 15), LISTS).value), '2026/9/1');
});
test('車検満了日：和暦の文字 → 日付（西暦で表示される）', () => {
  assert.strictEqual(ymd(S.normalizeCellValue(F('inspectionExpiry'), 'R8.3.1', LISTS).value), '2026/3/1');
});
test('初度登録日：年月だけ（和暦・2020/3・202003 → 月の1日の日付。日付があっても1日にそろえる）', () => {
  assert.strictEqual(ymd(S.normalizeCellValue(F('firstRegDate'), '平成27年6月', LISTS).value), '2015/6/1');
  assert.strictEqual(ymd(S.normalizeCellValue(F('firstRegDate'), 'R2.3', LISTS).value), '2020/3/1');
  assert.strictEqual(ymd(S.normalizeCellValue(F('firstRegDate'), '2020/3', LISTS).value), '2020/3/1');
  assert.strictEqual(ymd(S.normalizeCellValue(F('firstRegDate'), '202003', LISTS).value), '2020/3/1');
  assert.strictEqual(ymd(S.normalizeCellValue(F('firstRegDate'), 202003, LISTS).value), '2020/3/1');
  const withDay = S.normalizeCellValue(F('firstRegDate'), date(2020, 3, 15), LISTS);
  assert.strictEqual(ymd(withDay.value), '2020/3/1');
  assert.strictEqual(withDay.changed, true);
  assert.strictEqual(S.normalizeCellValue(F('firstRegDate'), date(2020, 3, 1), LISTS).changed, false);
  assert.strictEqual(S.normalizeCellValue(F('firstRegDate'), '去年', LISTS).error, '年月として読めません');
});

console.log('== プルダウン選択肢（設定アプリ）==');
test('parseListText：1行1つ、半角カナ化、重複・空行を除く、別名つき', () => {
  const e = S.parseListText('MB: メルセデス,ベンツ\nポルシェ\n\nMB\n  VW : フォルクスワーゲン ', true);
  assert.deepStrictEqual(plain(e), [
    { value: 'MB', aliases: ['メルセデス', 'ベンツ'] }, { value: 'ﾎﾟﾙｼｪ', aliases: [] }, { value: 'VW', aliases: ['フォルクスワーゲン'] }]);
  const noAlias = S.parseListText('運転免許証: 原本', false);
  assert.strictEqual(noAlias[0].value, '運転免許証: 原本');
});
test('既定の選択肢は半角カナ済み・地域名は全国分', () => {
  const makers = S.defaultListEntries('maker').map((e) => e.value);
  assert.ok(makers.indexOf('ﾎﾟﾙｼｪ') !== -1 && makers.indexOf('MB') !== -1);
  assert.strictEqual(S.defaultListEntries('region').length, S.PLATE_REGIONS.length);
  assert.strictEqual(S.defaultListEntries('staff').length, 0);
});

console.log('== 見た目（プルダウンの色・見出し）==');
test('プルダウンの色：ステータス5種・区分4種・色は実際の色、ほかの選択式は淡い色', () => {
  const std = S.resolveColumns(S.STANDARD_HEADERS.slice()).map;
  const rules = S.buildChipRules(std, ['黒', '白', '灰', '赤', '紺', '青', '緑', '黄', '茶', 'その他']);
  const by = (col) => rules.filter((r) => r.columns[0] === col);
  assert.strictEqual(by('T').length, 5);
  assert.strictEqual(by('K').length, 4);
  assert.strictEqual(by('J').length, 9); // 「その他」は色なし
  const black = by('J').find((r) => r.formula.indexOf('"黒"') !== -1);
  assert.strictEqual(black.color, '#262626');
  assert.strictEqual(black.fg, '#ffffff');
  assert.strictEqual(rules.find((r) => r.formula.indexOf('$T2="書類待ち"') !== -1).color, S.STATUS_COLORS['書類待ち'].bg);
  ['C', 'L', 'O', 'P'].forEach((c) => assert.strictEqual(by(c).length, 1, c));
  rules.forEach((r) => assert.ok(r.formula.indexOf(S.CF_MARKER) !== -1));
});
test('全ステータスに色がある・全列に見出しグループと列幅がある', () => {
  S.STATUS_OPTIONS.forEach((st) => assert.ok(S.STATUS_COLORS[st], st));
  S.CATEGORY_OPTIONS.forEach((c) => assert.ok(S.CATEGORY_COLORS[c], c));
  S.FIELDS.forEach((f) => {
    assert.notStrictEqual(S.headerColorFor(f.key), S.HEADER_OTHER_COLOR, f.key);
    assert.ok(S.COLUMN_WIDTHS[f.key] > 0, f.key);
  });
  assert.strictEqual(S.headerColorFor('unknown'), S.HEADER_OTHER_COLOR);
});
test('列の横位置：数値は右、日付・選択肢は中央、文字は左', () => {
  assert.strictEqual(S.alignmentFor(F('mileage')), 'right');
  assert.strictEqual(S.alignmentFor(F('inspectionExpiry')), 'center');
  assert.strictEqual(S.alignmentFor(F('status')), 'center');
  assert.strictEqual(S.alignmentFor(F('supplier')), 'left');
});

console.log('== ダッシュボード ==');
const stdCols = S.resolveColumns(S.STANDARD_HEADERS.slice()).map;
const masters = { '輸入車マスタ': stdCols, '国産車マスタ': stdCols };
test('ステータスは5つ、名義変更前は3つ（所有権解除済み・抹消登録済みは削除）', () => {
  assert.deepStrictEqual(Array.from(S.STATUS_OPTIONS), ['書類待ち', '車庫証明申請中', '名義変更中', '名義変更済み', '販売済み']);
  assert.deepStrictEqual(Array.from(S.PRE_TRANSFER_STATUSES), ['書類待ち', '車庫証明申請中', '名義変更中']);
  assert.strictEqual(S.normalizeCellValue(F('status'), '抹消登録済み', LISTS).outOfList, true);
});
test('車検証リンクが入ったら名義変更済み（名義変更前・空欄だけ。販売済みなどは変えない）', () => {
  ['書類待ち', '車庫証明申請中', '名義変更中', '', null].forEach((st) => assert.strictEqual(S.statusAfterCertLink(st), '名義変更済み', String(st)));
  ['名義変更済み', '販売済み', '抹消登録済み'].forEach((st) => assert.strictEqual(S.statusAfterCertLink(st), null, st));
});
test('ステータスごとの台数は2つのマスタの合計', () => {
  assert.strictEqual(S.buildStatusCountFormula(masters, '書類待ち'),
    "=COUNTIF('輸入車マスタ'!T2:T,\"書類待ち\")+COUNTIF('国産車マスタ'!T2:T,\"書類待ち\")");
  assert.strictEqual(S.buildStockCountFormula(masters), "=COUNTA('輸入車マスタ'!B2:B)+COUNTA('国産車マスタ'!B2:B)");
  assert.ok(S.buildExpiryCountFormula(masters, 30).indexOf('"<="&TODAY()+30') !== -1);
  assert.ok(S.buildExpiryCountFormula(masters, null).indexOf('"<="&TODAY())') !== -1);
});
test('該当車両の一覧：2つのマスタを縦につなぎ、対象ステータスだけを流れ順→仕入が古い順', () => {
  const f = S.buildDashboardListFormula(masters, S.PRE_TRANSFER_STATUSES);
  assert.ok(f.indexOf("VSTACK(HSTACK('輸入車マスタ'!T2:T,'輸入車マスタ'!A2:A,'輸入車マスタ'!B2:B,IF('輸入車マスタ'!T2:T=\"\",\"\",\"輸入車\")") !== -1);
  assert.ok(f.indexOf("HSTACK('国産車マスタ'!T2:T") !== -1);
  assert.ok(f.indexOf('t,{"書類待ち";"車庫証明申請中";"名義変更中"}') !== -1);
  assert.ok(f.indexOf('SORT(f,MATCH(INDEX(f,,1),t,0),TRUE,INDEX(f,,2),TRUE)') !== -1);
  assert.ok(f.indexOf('IF(ISNUMBER(INDEX(s,,2)),TODAY()-INDEX(s,,2),"")') !== -1);
  assert.ok(f.indexOf('CHOOSECOLS(s,2,3,4,5,6,7,8,9,10,11)') !== -1);
  assert.ok(/"該当する車両はありません"\)$/.test(f));
  // 括弧の対応
  let depth = 0;
  for (const ch of f.replace(/"[^"]*"/g, '')) { if (ch === '(') depth++; if (ch === ')') depth--; assert.ok(depth >= 0); }
  assert.strictEqual(depth, 0);
});
test('一覧：列が無いシートは空欄で埋め、ステータス列が無ければ対象外', () => {
  const partial = Object.assign({}, stdCols); delete partial.staff;
  const f = S.buildDashboardListFormula({ '輸入車マスタ': partial }, ['書類待ち']);
  assert.ok(f.indexOf('IF(\'輸入車マスタ\'!T2:T="","","")') !== -1);
  const noStatus = Object.assign({}, stdCols); delete noStatus.status;
  assert.strictEqual(S.buildDashboardListFormula({ '輸入車マスタ': noStatus }, ['書類待ち']), '="ステータスの列が見つかりません"');
});

console.log('');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
