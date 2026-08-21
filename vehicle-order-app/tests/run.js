/**
 * tests/run.js
 * GAS ファイル（.gs）中の純粋関数（スプレッドシート/Drive等の外部サービスに依存しない
 * ロジック）を Node.js 上の vm サンドボックスへ読み込み、単体テストする。
 * 外部ライブラリ非依存。実行: npm test / node tests/run.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const sandbox = {
  // SheetService.gs の rowToObject_ が日時変換に使うGASサービスの最小スタブ
  Utilities: {
    formatDate: (date) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }
  },
  Session: { getScriptTimeZone: () => 'Asia/Tokyo' }
};
vm.createContext(sandbox);

// Constants.gs -> HoldService.gs / SearchService.gs / SheetService.gs の順で依存関係あり
const FILES = ['Constants.gs', 'HoldService.gs', 'SearchService.gs', 'SheetService.gs'];

FILES.forEach((file) => {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  vm.runInContext(code, sandbox, { filename: file });
});

// vm のサンドボックスは独立したレルムを持つため、テスト側（外のNode）で作った
// `new Date(...)` はサンドボックス内の `instanceof Date` では別物と判定されてしまう。
// サンドボックス自身のDateで生成するヘルパーをサンドボックス内に定義しておく。
vm.runInContext(
  'function makeTestDate(y, mo, d, h, mi, s) { return new Date(y, mo, d, h || 0, mi || 0, s || 0); }',
  sandbox
);

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

console.log('== HoldService: canRegisterHold_ / canRegisterSecondHold_ ==');
test('在庫あり車両にはHold登録可', () => {
  assert.strictEqual(sandbox.canRegisterHold_({ holdStatus: 'available' }).ok, true);
});
test('Hold中の車両には1st Hold登録不可', () => {
  assert.strictEqual(sandbox.canRegisterHold_({ holdStatus: 'hold' }).ok, false);
});
test('存在しない車両にはHold登録不可', () => {
  assert.strictEqual(sandbox.canRegisterHold_(null).ok, false);
});
test('Hold中で2nd Hold未登録なら2nd Hold登録可', () => {
  assert.strictEqual(sandbox.canRegisterSecondHold_({ holdStatus: 'hold', secondHoldCustomer: null }).ok, true);
});
test('在庫あり車両には2nd Hold登録不可', () => {
  assert.strictEqual(sandbox.canRegisterSecondHold_({ holdStatus: 'available' }).ok, false);
});
test('2nd Hold登録済みなら3人目のHoldは不可', () => {
  assert.strictEqual(sandbox.canRegisterSecondHold_({ holdStatus: 'hold', secondHoldCustomer: '顧客B' }).ok, false);
});

console.log('== HoldService: decideExpiryAction_ ==');
test('在庫あり車両は対象外', () => {
  assert.strictEqual(sandbox.decideExpiryAction_({ holdStatus: 'available' }, Date.now()), 'none');
});
test('Hold期限前は対象外', () => {
  const now = 1000;
  assert.strictEqual(sandbox.decideExpiryAction_({ holdStatus: 'hold', holdExpiresAt: 2000 }, now), 'none');
});
test('Hold期限経過・2nd Holdなしは解放', () => {
  const now = 3000;
  assert.strictEqual(sandbox.decideExpiryAction_({ holdStatus: 'hold', holdExpiresAt: 2000 }, now), 'release');
});
test('Hold期限経過・2nd Holdありは昇格', () => {
  const now = 3000;
  assert.strictEqual(
    sandbox.decideExpiryAction_({ holdStatus: 'hold', holdExpiresAt: 2000, secondHoldCustomer: '顧客B' }, now),
    'promote'
  );
});

console.log('== HoldService: buildPromotedHoldPatch_ / buildReleasedHoldPatch_ ==');
test('2nd Holdの入力項目一式が1st Holdへ昇格し、新たな72時間が付与される', () => {
  const now = 10_000;
  const vehicle = {
    secondHoldRegisteredMonth: '2026-08', secondHoldStaff: '鈴木', secondHoldCustomer: '顧客B',
    secondHoldTradeIn: 'あり', secondHoldOss: '可', secondHoldInsurance: 'なし'
  };
  const patch = sandbox.buildPromotedHoldPatch_(vehicle, now);
  assert.strictEqual(patch.holdRegisteredMonth, '2026-08');
  assert.strictEqual(patch.holdCustomer, '顧客B');
  assert.strictEqual(patch.holdStaff, '鈴木');
  assert.strictEqual(patch.holdTradeIn, 'あり');
  assert.strictEqual(patch.holdOss, '可');
  assert.strictEqual(patch.holdInsurance, 'なし');
  assert.strictEqual(patch.holdCreatedAt, now);
  assert.strictEqual(patch.holdExpiresAt, now + sandbox.HOLD_DURATION_MS);
  assert.strictEqual(patch.secondHoldCustomer, null);
  assert.strictEqual(patch.secondHoldTradeIn, null);
});
test('解放時はステータスがavailableに戻り、Hold入力項目一式がクリアされる', () => {
  const patch = sandbox.buildReleasedHoldPatch_();
  assert.strictEqual(patch.holdStatus, 'available');
  assert.strictEqual(patch.holdCustomer, null);
  assert.strictEqual(patch.holdRegisteredMonth, null);
  assert.strictEqual(patch.holdTradeIn, null);
  assert.strictEqual(patch.holdOss, null);
  assert.strictEqual(patch.holdInsurance, null);
});

console.log('== SearchService: searchInventory / searchOrders ==');
const vehicles = [
  { commission: 'C001', carType: '車種X', model: 'モデルA', holdStatus: 'available' },
  { commission: 'C002', carType: '車種Y', model: 'モデルB', holdStatus: 'hold' }
];
test('キーワードでモデル検索がヒットする', () => {
  assert.strictEqual(sandbox.searchInventory(vehicles, { keyword: 'モデルA' }).length, 1);
});
test('キーワードでコミッション検索がヒットする', () => {
  assert.strictEqual(sandbox.searchInventory(vehicles, { keyword: 'C002' }).length, 1);
});
test('キーワードで車種検索がヒットする', () => {
  assert.strictEqual(sandbox.searchInventory(vehicles, { keyword: '車種X' }).length, 1);
});
test('includeHold=falseでHold済み車両が除外される', () => {
  const result = sandbox.searchInventory(vehicles, { includeHold: false });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].commission, 'C001');
});
test('無関係なキーワードはヒットしない', () => {
  assert.strictEqual(sandbox.searchInventory(vehicles, { keyword: '該当なし' }).length, 0);
});

const orders = [
  { commission: 'C001', model: 'モデルA', customer: '山田太郎', staff: '佐藤' },
  { commission: 'C002', model: 'モデルB', customer: '田中花子', staff: '鈴木' }
];
test('顧客名で受注検索がヒットする', () => {
  assert.strictEqual(sandbox.searchOrders(orders, { keyword: '山田太郎' }).length, 1);
});
test('担当者名で受注検索がヒットする', () => {
  assert.strictEqual(sandbox.searchOrders(orders, { keyword: '鈴木' }).length, 1);
});

console.log('== SearchService: groupByField_ ==');
test('モデルごとにグループ化される', () => {
  const groups = sandbox.groupByField_(vehicles, 'model');
  assert.strictEqual(groups.length, 2);
  assert.strictEqual(groups[0].items.length, 1);
});
test('未設定の項目は「未設定」グループの末尾へ回る', () => {
  const groups = sandbox.groupByField_(
    [{ arrivalExpectedDate: '2026-09-01' }, { arrivalExpectedDate: '' }],
    'arrivalExpectedDate'
  );
  assert.strictEqual(groups[groups.length - 1].key, '未設定');
});

console.log('== SheetService: rowToObject_ / objectToRow_（Date値の安全な変換） ==');
test('date型セルが実際にはDateで返ってきても yyyy-MM-dd 文字列に変換される', () => {
  const columns = [{ key: 'commission', label: 'コミッション', type: 'text' }, { key: 'arrivalExpectedDate', label: '入港予定日', type: 'date' }];
  const row = ['C-9001', sandbox.makeTestDate(2026, 8, 15)]; // 2026-09-15（Google Sheetsが自動でDate化した想定）
  const obj = sandbox.rowToObject_(row, columns, 2);
  assert.strictEqual(obj.arrivalExpectedDate, '2026-09-15');
});
test('datetime型セルのDateはこれまで通りエポックミリ秒に変換される', () => {
  const columns = [{ key: 'holdExpiresAt', label: 'Hold期限', type: 'datetime' }];
  const d = sandbox.makeTestDate(2026, 7, 24, 10, 0, 0);
  const obj = sandbox.rowToObject_([d], columns, 2);
  assert.strictEqual(obj.holdExpiresAt, d.getTime());
});
test('文字列やnullはそのまま（Dateでなければ変換しない）', () => {
  const columns = [{ key: 'model', label: 'モデル', type: 'text' }, { key: 'vpc', label: 'VPC', type: 'text' }];
  const obj = sandbox.rowToObject_(['Cクラス', ''], columns, 2);
  assert.strictEqual(obj.model, 'Cクラス');
  assert.strictEqual(obj.vpc, null);
});
test('objectToRow_はdatetime型の数値をDateへ戻すが、date型の文字列はそのまま書き込む', () => {
  const columns = [
    { key: 'arrivalExpectedDate', label: '入港予定日', type: 'date' },
    { key: 'holdExpiresAt', label: 'Hold期限', type: 'datetime' }
  ];
  const now = Date.now();
  const row = sandbox.objectToRow_({ arrivalExpectedDate: '2026-09-15', holdExpiresAt: now }, columns);
  assert.strictEqual(row[0], '2026-09-15');
  // vm サンドボックスは別レルムのため instanceof Date は使えない（Object.prototype.toString で判定）
  assert.strictEqual(Object.prototype.toString.call(row[1]), '[object Date]');
  assert.strictEqual(row[1].getTime(), now);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
