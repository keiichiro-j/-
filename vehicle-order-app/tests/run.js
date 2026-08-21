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
const sandbox = {};
vm.createContext(sandbox);

// Constants.gs -> HoldService.gs / SearchService.gs の順で依存関係あり
const FILES = ['Constants.gs', 'HoldService.gs', 'SearchService.gs'];

FILES.forEach((file) => {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  vm.runInContext(code, sandbox, { filename: file });
});

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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
