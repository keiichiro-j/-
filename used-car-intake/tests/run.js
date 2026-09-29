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
const TODAY = date(2026, 9, 29);

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
const f = (value, extra) => Object.assign({ value: value, readable: value !== null, handwritten: false }, extra || {});

console.log('== 列定義 ==');
test('標準配置は A〜AC の29列で、AC列が仕入価格', () => {
  assert.strictEqual(S.FIELDS.length, 29);
  assert.strictEqual(S.FIELDS[28].label, '仕入価格');
  assert.strictEqual(S.columnLetter(29), 'AC');
});
test('columnLetter', () => {
  assert.strictEqual(S.columnLetter(1), 'A');
  assert.strictEqual(S.columnLetter(26), 'Z');
  assert.strictEqual(S.columnLetter(27), 'AA');
});
test('resolveColumns：別表記・全角括弧の揺れ・順不同でも特定できる', () => {
  const res = S.resolveColumns(['OCN', '仕入日', '車名', 'カラー', '担当者', '仕入区分', '登録番号(地域)', '備考']);
  assert.strictEqual(res.map.ocn, 0);
  assert.strictEqual(res.map.purchaseDate, 1);
  assert.strictEqual(res.map.carName, 2);
  assert.strictEqual(res.map.color, 3);
  assert.strictEqual(res.map.staff, 4);
  assert.strictEqual(res.map.category, 5);
  assert.strictEqual(res.map.plateRegion, 6);
  assert.deepStrictEqual(Array.from(res.unknown, (u) => u.label), ['備考']);
  assert.ok(res.missing.indexOf('chassisNumber') !== -1);
});
test('isStandardLayout', () => {
  assert.strictEqual(S.isStandardLayout(S.STANDARD_HEADERS.slice()), true);
  const swapped = S.STANDARD_HEADERS.slice();
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  assert.strictEqual(S.isStandardLayout(swapped), false);
});
test('buildArrayFormula：下取損は見出し行の ARRAYFORMULA（配列用の条件）', () => {
  const cols = S.resolveColumns(S.STANDARD_HEADERS.slice()).map;
  const formula = S.buildArrayFormula('tradeInLoss', cols);
  assert.strictEqual(formula, '={"下取損";ARRAYFORMULA(IF((W2:W="")+(V2:V=""),,W2:W-V2:V))}');
  assert.ok(!/OR\(/.test(formula));
});
test('buildArrayFormula：式が未確定（買取金額）・参照先の列が無い場合は null', () => {
  const cols = S.resolveColumns(S.STANDARD_HEADERS.slice()).map;
  assert.strictEqual(S.buildArrayFormula('buyPrice', cols), null);
  assert.strictEqual(S.buildArrayFormula('inspectionRemain', { inspectionRemain: 9 }), null);
});
test('取込待ちの見出しにマスタの手入力・計算式の列は含まれない', () => {
  ['tradeInLoss', 'buyPrice', 'inspectionRemain', 'status', 'saleDate', 'saleTo'].forEach((k) => {
    assert.strictEqual(S.STAGE_FIELD_KEYS.indexOf(k), -1, k);
  });
});

console.log('== 車台番号の補正 ==');
test('国産車の車台番号（ハイフンあり）を読み飛ばさない', () => {
  const r = S.normalizeChassisNumber('ZVW30-1234567');
  assert.strictEqual(r.value, 'ZVW30-1234567');
  assert.strictEqual(r.kind, 'domestic');
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.corrected, false);
});
test('国産車：連番部の O・I・S を数字に補正、全角・長音ハイフンも統一', () => {
  const r = S.normalizeChassisNumber('ＺＶＷ３０ー12O4S6I');
  assert.strictEqual(r.value, 'ZVW30-1204561');
  assert.strictEqual(r.corrected, true);
  assert.strictEqual(r.valid, true);
});
test('輸入車17桁：I・O・Q を 1・0・0 に補正', () => {
  const r = S.normalizeChassisNumber('WDD2130O42A12345Q');
  assert.strictEqual(r.value, 'WDD2130042A123450');
  assert.strictEqual(r.kind, 'import');
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.corrected, true);
});
test('形式不明（桁不足）は invalid', () => {
  const r = S.normalizeChassisNumber('WDD213');
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.kind, 'unknown');
});

console.log('== 登録番号 ==');
test('正常な登録番号', () => {
  const r = S.normalizePlate({ plateRegion: '品川', plateClass: '３３０', plateKana: 'サ', plateNumber: '12-34' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.values)), { plateRegion: '品川', plateClass: '330', plateKana: 'さ', plateNumber: '1234' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.flags)), {});
});
test('地域名の1文字違いは補正して要確認', () => {
  const r = S.normalizePlate({ plateRegion: '品用', plateClass: '300', plateKana: 'さ', plateNumber: '・・12' });
  assert.strictEqual(r.values.plateRegion, '品川');
  assert.strictEqual(r.values.plateNumber, '12');
  assert.deepStrictEqual(Array.from(r.flags.plateRegion), ['地域名要確認']);
});
test('分類番号4桁・ひらがな2文字・使われない「お」は形式不正', () => {
  const r = S.normalizePlate({ plateRegion: '横浜', plateClass: '3300', plateKana: 'さい', plateNumber: '1234' });
  assert.ok(r.flags.plateClass);
  assert.ok(r.flags.plateKana);
  const r2 = S.normalizePlate({ plateRegion: '横浜', plateClass: '300', plateKana: 'お', plateNumber: '1234' });
  assert.ok(r2.flags.plateKana);
});

console.log('== 日付・金額 ==');
test('和暦（令和・R表記・元年）と西暦', () => {
  assert.strictEqual(S.formatDateYmd(S.parseJapaneseDate('令和5年4月1日').date), '2023-04-01');
  assert.strictEqual(S.formatDateYmd(S.parseJapaneseDate('R5.4.1').date), '2023-04-01');
  assert.strictEqual(S.formatDateYmd(S.parseJapaneseDate('令和元年5月').date), '2019-05-01');
  assert.strictEqual(S.formatDateYmd(S.parseJapaneseDate('平成30年12月25日').date), '2018-12-25');
  assert.strictEqual(S.formatDateYmd(S.parseJapaneseDate('２０２４/１/３１').date), '2024-01-31');
});
test('年月のみは dayKnown=false、存在しない日付は null', () => {
  assert.strictEqual(S.parseJapaneseDate('令和2年3月').dayKnown, false);
  assert.strictEqual(S.parseJapaneseDate('2023/2/30'), null);
  assert.strictEqual(S.parseJapaneseDate('不明'), null);
});
test('日付の妥当性：初度登録日が未来・満了日が初度登録より前', () => {
  const flags = S.checkVehicleDates(date(2027, 1, 1), date(2026, 1, 1), TODAY);
  assert.ok(flags.firstRegDate.length === 1);
  assert.ok(flags.inspectionExpiry.some((x) => /初度登録日より前/.test(x)));
  const ok = S.checkVehicleDates(date(2020, 3, 1), date(2027, 3, 1), TODAY);
  assert.strictEqual(ok.firstRegDate.length + ok.inspectionExpiry.length, 0);
});
test('金額・走行距離の解釈', () => {
  assert.strictEqual(S.parseAmount('1,234,000円'), 1234000);
  assert.strictEqual(S.parseAmount('¥１２３万'), 1230000);
  assert.strictEqual(S.parseAmount('12.5万'), 125000);
  assert.strictEqual(S.parseAmount('123万4000'), 1234000);
  assert.strictEqual(S.parseAmount('約100'), null);
  assert.strictEqual(S.parseMileage('45,678km'), 45678);
  assert.strictEqual(S.parseMileage('1.2万km'), 12000);
});
test('区分の正規化', () => {
  assert.strictEqual(S.normalizeCategory('下取り'), '下取');
  assert.strictEqual(S.normalizeCategory('AA'), 'オークション');
  assert.strictEqual(S.normalizeCategory('買取'), '買取');
  assert.strictEqual(S.normalizeCategory('その他'), null);
});

console.log('== OCN ==');
test('次のOCNは既存の最大値と発行済み最大値の大きい方 + 1（NEW-乱数は無視）', () => {
  assert.strictEqual(S.nextOcnNumber(['120', '00121', 'NEW-8392'], '', 0), 122);
  assert.strictEqual(S.nextOcnNumber(['120'], '', '130'), 131);
  assert.strictEqual(S.nextOcnNumber(['AU-0005', 'AU-0007'], 'AU-', 0), 8);
});
test('formatOcn・ocnKey（桁揃えの有無を同一視）', () => {
  assert.strictEqual(S.formatOcn(8, 'AU-', 4), 'AU-0008');
  assert.strictEqual(S.formatOcn(123, '', 0), '123');
  assert.strictEqual(S.ocnKey('00123', ''), S.ocnKey(123, ''));
});

console.log('== Gemini 応答の解釈 ==');
test('コードフェンス付きJSON・値だけの項目も受け付ける', () => {
  const docs = S.parseGeminiDocuments('```json\n{"documents":[{"type":"査定書","fields":{"color":"白","mileage":{"value":null,"readable":false}}}]}\n```');
  assert.strictEqual(docs.length, 1);
  assert.strictEqual(docs[0].fields.color.value, '白');
  assert.strictEqual(docs[0].fields.color.readable, true);
  assert.strictEqual(docs[0].fields.mileage.readable, false);
});

console.log('== 取込レコードの組立 ==');
const appraisal = {
  type: '査定書',
  fields: {
    carName: f('Cクラス'), modelName: f('C200 アバンギャルド'), color: f('ポーラーホワイト'),
    mileage: f('45,678km'), recycleFee: f('18,560円'), appraisalPrice: f('2,350,000円'),
    chassisNumber: f('WDD2050O42F123456'), plateRegion: f('品川'), plateClass: f('330'), plateKana: f('さ'), plateNumber: f('12-34')
  }
};
const order = {
  type: '注文書',
  fields: {
    staff: f('山田', { handwritten: true }), category: f('下取', { handwritten: true }),
    tradeInPrice: f('2,000,000', { handwritten: true }), tradeInAllowance: f('2,300,000', { handwritten: true }),
    purchasePrice: f('2,000,000', { handwritten: true })
  }
};
const ocrText = 'Cクラス 走行 45,678 km リサイクル 18,560 査定価格 2,350,000 車台番号 WDD2050042F123456 品川 330 さ 12-34';

test('注文書＋査定書 → 仮登録。活字は査定書から、補正済みの車台番号で輸入車マスタへ', () => {
  const r = S.buildRecord([appraisal, order], { ocrText: ocrText, today: TODAY, lossThreshold: 1000000 });
  assert.strictEqual(r.kind, '仮登録');
  assert.strictEqual(r.fields.chassisNumber.value, 'WDD2050042F123456');
  assert.strictEqual(r.fields.mileage.value, 45678);
  assert.strictEqual(r.fields.appraisalPrice.value, 2350000);
  assert.strictEqual(r.targetSheet, '輸入車マスタ');
  assert.ok(r.warnings.some((w) => /車台番号を補正/.test(w)));
  assert.deepStrictEqual(Array.from(r.fields.appraisalPrice.flags), []);
});
test('手書き項目（担当・区分・金額）は必ず要確認', () => {
  const r = S.buildRecord([appraisal, order], { ocrText: ocrText, today: TODAY, lossThreshold: 1000000 });
  S.HANDWRITTEN_KEYS.forEach((k) => assert.ok(r.fields[k].flags.indexOf('手書き確認') !== -1, k));
  assert.strictEqual(r.fields.category.value, '下取');
  assert.notStrictEqual(r.confidence, '高');
});
test('2エンジン照合：OCRテキストに無い金額は OCR不一致', () => {
  const bad = JSON.parse(JSON.stringify(appraisal));
  bad.fields.appraisalPrice.value = '2,850,000円';
  const r = S.buildRecord([bad], { ocrText: ocrText, today: TODAY, lossThreshold: 0 });
  assert.ok(r.fields.appraisalPrice.flags.indexOf('OCR不一致') !== -1);
  assert.strictEqual(r.confidence, '低');
});
test('読めない項目は空欄＋読取不可（推測しない）', () => {
  const a = JSON.parse(JSON.stringify(appraisal));
  a.fields.color = { value: null, readable: false };
  const r = S.buildRecord([a], { ocrText: ocrText, today: TODAY, lossThreshold: 0 });
  assert.strictEqual(r.fields.color.value, '');
  assert.deepStrictEqual(Array.from(r.fields.color.flags), ['読取不可']);
});
test('書類間の突合：査定書と車検証の車台番号が違えば書類間不一致', () => {
  const cert = {
    type: '車検証',
    fields: {
      chassisNumber: f('WDD2050042F999999'), firstRegDate: f('令和2年3月'), inspectionExpiry: f('令和8年3月1日'),
      plateRegion: f('品川'), plateClass: f('330'), plateKana: f('さ'), plateNumber: f('12-34'),
      ownerName: f('株式会社ABCファイナンス'), ownerAddress: f('東京都港区1-2-3'), userName: f('山田太郎')
    }
  };
  const r = S.buildRecord([appraisal, cert], { ocrText: null, today: TODAY, lossThreshold: 0 });
  assert.ok(r.fields.chassisNumber.flags.indexOf('書類間不一致') !== -1);
  assert.strictEqual(r.fields.chassisNumber.value, 'WDD2050042F999999'); // 車検証を優先
  assert.strictEqual(r.fields.plateNumber.flags.indexOf('書類間不一致'), -1);
  assert.ok(r.agreements >= 4);
  assert.ok(r.warnings.some((w) => /所有権留保/.test(w)));
  assert.ok(r.warnings.some((w) => /Drive OCR/.test(w)));
});
test('書類間の突合：登録番号の地域名（日本語）の食い違いも検出する', () => {
  const cert = { type: '車検証', fields: { chassisNumber: f('WDD2050042F123456'), plateRegion: f('練馬'), plateClass: f('330'), plateKana: f('さ'), plateNumber: f('12-34') } };
  const r = S.buildRecord([appraisal, cert], { ocrText: null, today: TODAY, lossThreshold: 0 });
  assert.ok(r.fields.plateRegion.flags.indexOf('書類間不一致') !== -1);
  assert.strictEqual(r.fields.plateKana.flags.indexOf('書類間不一致'), -1);
});
test('車検証のみ → 本登録。国産車は国産車マスタ、日付はISO形式', () => {
  const cert = {
    type: '車検証',
    fields: {
      chassisNumber: f('ZVW30-1234567'), firstRegDate: f('平成27年6月'), inspectionExpiry: f('令和9年6月10日'),
      plateRegion: f('横浜'), plateClass: f('500'), plateKana: f('あ'), plateNumber: f('56-78'),
      ownerName: f('鈴木一郎'), ownerAddress: f('神奈川県横浜市中区1-1'), certFormat: f('券面')
    }
  };
  const r = S.buildRecord([cert], { ocrText: null, today: TODAY, lossThreshold: 0 });
  assert.strictEqual(r.kind, '本登録');
  assert.strictEqual(r.targetSheet, '国産車マスタ');
  assert.strictEqual(r.fields.firstRegDate.value, '2015-06-01');
  assert.strictEqual(r.fields.inspectionExpiry.value, '2027-06-10');
  assert.strictEqual(r.fields.supplier.value, '鈴木一郎');
  assert.ok(r.warnings.some((w) => /券面/.test(w)));
});
test('下取損が極端な値なら警告', () => {
  const o = JSON.parse(JSON.stringify(order));
  o.fields.tradeInAllowance.value = '4,500,000';
  const r = S.buildRecord([appraisal, o], { ocrText: ocrText, today: TODAY, lossThreshold: 1000000 });
  assert.ok(r.fields.tradeInAllowance.flags.indexOf('下取損警告') !== -1);
});
test('書類を判別できなければエラー', () => {
  const r = S.buildRecord([{ type: 'その他', fields: {} }], { ocrText: null, today: TODAY, lossThreshold: 0 });
  assert.ok(r.error);
});

console.log('== 精度テストの採点 ==');
test('judgeField：型ごとの比較（数値・日付・車台番号・登録番号）', () => {
  assert.strictEqual(S.judgeField('mileage', 45678, '45,678'), '一致');
  assert.strictEqual(S.judgeField('inspectionExpiry', '2027-06-10', date(2027, 6, 10)), '一致');
  assert.strictEqual(S.judgeField('firstRegDate', '2015-06-01', date(2015, 6, 15)), '一致'); // 初度登録は年月で比較
  assert.strictEqual(S.judgeField('chassisNumber', 'ZVW30-1234567', 'ZVW301234567'), '一致');
  assert.strictEqual(S.judgeField('plateNumber', '1234', '12-34'), '一致');
  assert.strictEqual(S.judgeField('plateNumber', '12', '・・12'), '一致');
  assert.strictEqual(S.judgeField('color', '白', '黒'), '不一致');
  assert.strictEqual(S.judgeField('color', '', '黒'), '読取不可');
  assert.strictEqual(S.judgeField('color', '白', ''), '正解なし');
});
test('summarizeAccuracy：正答率・要確認の割合・見逃し誤り・判定', () => {
  const details = [];
  for (let i = 0; i < 49; i++) details.push({ key: 'chassisNumber', extracted: 'A', truth: 'A', result: '一致', flagged: false });
  details.push({ key: 'chassisNumber', extracted: 'B', truth: 'A', result: '不一致', flagged: false });
  details.push({ key: 'color', extracted: '白', truth: '黒', result: '不一致', flagged: true });
  details.push({ key: 'color', extracted: '黒', truth: '黒', result: '一致', flagged: false });
  details.push({ key: 'staff', extracted: '山田', truth: '山田', result: '一致', flagged: true });
  details.push({ key: 'address', extracted: '', truth: '', result: '正解なし', flagged: false });
  const rows = S.summarizeAccuracy(details, { staff: 3 });
  const byKey = {};
  rows.forEach((r) => { byKey[r.key] = r; });
  assert.strictEqual(byKey.chassisNumber.rate, 0.98);
  assert.strictEqual(byKey.chassisNumber.silentErrors, 1);
  assert.ok(/自動反映/.test(byKey.chassisNumber.verdict));
  assert.strictEqual(byKey.color.rate, 0.5);
  assert.strictEqual(byKey.color.flaggedRate, 0.5);
  assert.ok(/全件確認/.test(byKey.color.verdict));
  assert.strictEqual(byKey.staff.kind, '手書き');
  assert.strictEqual(byKey.staff.corrections, 3);
  assert.ok(!byKey.address);
});

console.log('');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
