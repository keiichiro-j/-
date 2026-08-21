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

// Constants.gs -> HoldService.gs / SearchService.gs / SheetService.gs / SettingsService.gs の順で依存関係あり
const FILES = ['Constants.gs', 'HoldService.gs', 'SearchService.gs', 'SheetService.gs', 'SettingsService.gs'];

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
  assert.strictEqual(sandbox.canRegisterSecondHold_({ holdStatus: 'hold' }, false).ok, true);
});
test('在庫あり車両には2nd Hold登録不可', () => {
  assert.strictEqual(sandbox.canRegisterSecondHold_({ holdStatus: 'available' }, false).ok, false);
});
test('2nd Hold登録済みなら3人目のHoldは不可', () => {
  assert.strictEqual(sandbox.canRegisterSecondHold_({ holdStatus: 'hold' }, true).ok, false);
});

console.log('== HoldService: canConfirmOrder_（Hold担当者のみ受注確定可） ==');
test('Holdが入っていない車両は誰でも受注確定できる', () => {
  const result = sandbox.canConfirmOrder_({ holdStatus: 'available' }, null, '佐藤');
  assert.strictEqual(result.ok, true);
});
test('Hold中の車両はHold担当者本人なら受注確定できる', () => {
  const result = sandbox.canConfirmOrder_({ holdStatus: 'hold' }, { staff: '佐藤' }, '佐藤');
  assert.strictEqual(result.ok, true);
});
test('Hold中の車両はHold担当者以外だと受注確定できない', () => {
  const result = sandbox.canConfirmOrder_({ holdStatus: 'hold' }, { staff: '佐藤' }, '鈴木');
  assert.strictEqual(result.ok, false);
});

console.log('== HoldService: validateRequiredInfo_（全項目入力チェック） ==');
const fullInfo = {
  leadNumber: 'L-001', registeredMonth: '2026-08', staff: '佐藤', customer: '山田太郎',
  tradeIn: 'あり', oss: '可', insurance: 'あり'
};
test('全項目入力済みならOK', () => {
  assert.strictEqual(sandbox.validateRequiredInfo_(sandbox.HOLD_ORDER_INPUT_COLUMNS, fullInfo).ok, true);
});
test('リード番号が未入力だとNG', () => {
  const info = Object.assign({}, fullInfo, { leadNumber: '' });
  const result = sandbox.validateRequiredInfo_(sandbox.HOLD_ORDER_INPUT_COLUMNS, info);
  assert.strictEqual(result.ok, false);
  assert.ok(result.reason.includes('リード番号'));
});
test('複数項目が未入力だとすべて列挙される', () => {
  const result = sandbox.validateRequiredInfo_(sandbox.HOLD_ORDER_INPUT_COLUMNS, {});
  assert.strictEqual(result.ok, false);
  assert.ok(result.reason.includes('リード番号'));
  assert.ok(result.reason.includes('顧客'));
});

console.log('== HoldService: decideExpiryAction_ ==');
test('在庫あり車両は対象外', () => {
  assert.strictEqual(sandbox.decideExpiryAction_({ holdStatus: 'available' }, Date.now()), 'none');
});
test('Hold期限前は対象外', () => {
  const now = 1000;
  assert.strictEqual(sandbox.decideExpiryAction_({ holdStatus: 'hold', expiresAt: 2000, hasSecondHold: false }, now), 'none');
});
test('Hold期限経過・2nd Holdなしは解放', () => {
  const now = 3000;
  assert.strictEqual(sandbox.decideExpiryAction_({ holdStatus: 'hold', expiresAt: 2000, hasSecondHold: false }, now), 'release');
});
test('Hold期限経過・2nd Holdありは昇格', () => {
  const now = 3000;
  assert.strictEqual(
    sandbox.decideExpiryAction_({ holdStatus: 'hold', expiresAt: 2000, hasSecondHold: true }, now),
    'promote'
  );
});

console.log('== HoldService: buildHoldRecord_ / attachHoldInfo_（2nd Holdは1st Hold終了時から起算） ==');
test('buildHoldRecord_ が入力項目一式を1行分のレコードに詰める', () => {
  const record = sandbox.buildHoldRecord_('C-001', sandbox.HOLD_RANK.FIRST, fullInfo, 1000, 1000 + sandbox.HOLD_DURATION_MS);
  assert.strictEqual(record.commission, 'C-001');
  assert.strictEqual(record.rank, '1st');
  assert.strictEqual(record.leadNumber, 'L-001');
  assert.strictEqual(record.createdAt, 1000);
  assert.strictEqual(record.expiresAt, 1000 + sandbox.HOLD_DURATION_MS);
});
test('2nd Holdの開始・期限は1st Holdの期限を起点に組み立てられる想定になっている', () => {
  // registerSecondHold の実装方針の確認: createdAt = 1st Holdのexpiresat, expiresAt = createdAt + 72h
  const firstHoldExpiresAt = 5_000_000;
  const secondCreatedAt = firstHoldExpiresAt;
  const secondExpiresAt = secondCreatedAt + sandbox.HOLD_DURATION_MS;
  const record = sandbox.buildHoldRecord_('C-002', sandbox.HOLD_RANK.SECOND, fullInfo, secondCreatedAt, secondExpiresAt);
  assert.strictEqual(record.createdAt, firstHoldExpiresAt);
  assert.strictEqual(record.expiresAt, firstHoldExpiresAt + sandbox.HOLD_DURATION_MS);
});
test('applyHoldFieldsToVehicle_ はHold行がない場合すべてnullを設定する', () => {
  const vehicle = { commission: 'C-999' };
  sandbox.applyHoldFieldsToVehicle_(vehicle, null, 'hold');
  assert.strictEqual(vehicle.holdStaff, null);
  assert.strictEqual(vehicle.holdLeadNumber, null);
  assert.strictEqual(vehicle.holdCreatedAt, null);
});
test('applyHoldFieldsToVehicle_ はHold行があればプレフィックス付きで値を反映する', () => {
  const vehicle = { commission: 'C-998' };
  const holdRow = Object.assign({ createdAt: 1000, expiresAt: 2000 }, fullInfo);
  sandbox.applyHoldFieldsToVehicle_(vehicle, holdRow, 'hold');
  assert.strictEqual(vehicle.holdStaff, '佐藤');
  assert.strictEqual(vehicle.holdLeadNumber, 'L-001');
  assert.strictEqual(vehicle.holdExpiresAt, 2000);
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

console.log('== SettingsService: normalizeStaffList_（担当者マスタ最大30人） ==');
test('空欄・重複は除去される', () => {
  const list = sandbox.normalizeStaffList_(['佐藤', '', '佐藤', ' 鈴木 ']);
  // vm サンドボックスは別レルムのため配列は deepStrictEqual では不一致になる（[...] で外側のレルムへ複製）
  assert.deepStrictEqual([...list], ['佐藤', '鈴木']);
});
test('30人まではそのまま登録できる', () => {
  const list = Array.from({ length: 30 }, (_, i) => 'スタッフ' + i);
  assert.strictEqual(sandbox.normalizeStaffList_(list).length, 30);
});
test('31人以上はエラーになる', () => {
  const list = Array.from({ length: 31 }, (_, i) => 'スタッフ' + i);
  assert.throws(() => sandbox.normalizeStaffList_(list), /最大30人/);
});
test('配列以外が渡されても空配列として扱われる', () => {
  assert.strictEqual(sandbox.normalizeStaffList_(null).length, 0);
  assert.strictEqual(sandbox.normalizeStaffList_(undefined).length, 0);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
