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

// Constants.gs -> HoldService.gs / SearchService.gs / SheetService.gs / SettingsService.gs /
// AuditLogService.gs / IntegrityService.gs の順で依存関係あり
const FILES = [
  'Constants.gs', 'HoldService.gs', 'SearchService.gs', 'SheetService.gs', 'SettingsService.gs',
  'AuditLogService.gs', 'IntegrityService.gs'
];

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

console.log('== HoldService: emailsMatch_（前後の空白・大文字小文字の違いを無視して同一人物と判定） ==');
test('大文字小文字が異なっても同一人物と判定する', () => {
  assert.strictEqual(sandbox.emailsMatch_('Sato@Example.com', 'sato@example.com'), true);
});
test('前後に空白があっても同一人物と判定する（スプレッドシート側での手動編集等を想定）', () => {
  assert.strictEqual(sandbox.emailsMatch_(' sato@example.com ', 'sato@example.com'), true);
});
test('実際に異なるメールアドレスは同一人物と判定しない', () => {
  assert.strictEqual(sandbox.emailsMatch_('sato@example.com', 'suzuki@example.com'), false);
});
test('片方が空・未指定の場合は同一人物と判定しない', () => {
  assert.strictEqual(sandbox.emailsMatch_('', 'sato@example.com'), false);
  assert.strictEqual(sandbox.emailsMatch_(null, 'sato@example.com'), false);
  assert.strictEqual(sandbox.emailsMatch_(undefined, undefined), false);
});

console.log('== HoldService: canRegisterHold_ ==');
test('在庫あり車両にはHold登録可', () => {
  assert.strictEqual(sandbox.canRegisterHold_({ holdStatus: 'available' }).ok, true);
});
test('Hold中の車両にはHold登録不可', () => {
  assert.strictEqual(sandbox.canRegisterHold_({ holdStatus: 'hold' }).ok, false);
});
test('存在しない車両にはHold登録不可', () => {
  assert.strictEqual(sandbox.canRegisterHold_(null).ok, false);
});
test('holdStatusが空欄（スプレッドシートへ直接貼り付けた行）でもHold登録可', () => {
  assert.strictEqual(sandbox.canRegisterHold_({ holdStatus: '' }).ok, true);
  assert.strictEqual(sandbox.canRegisterHold_({ holdStatus: undefined }).ok, true);
});

console.log('== HoldService: canConfirmOrder_（Hold担当者のみ受注確定可・メールアドレスで判定） ==');
test('Holdが入っていない車両は誰でも受注確定できる', () => {
  const result = sandbox.canConfirmOrder_({ holdStatus: 'available' }, null, 'sato@example.com');
  assert.strictEqual(result.ok, true);
});
test('Hold中の車両はHold担当者本人（同じメールアドレス）なら受注確定できる', () => {
  const result = sandbox.canConfirmOrder_({ holdStatus: 'hold' }, { staff: '佐藤', staffEmail: 'sato@example.com' }, 'sato@example.com');
  assert.strictEqual(result.ok, true);
});
test('Hold中の車両はHold担当者以外（メールアドレスが異なる）だと受注確定できない', () => {
  const result = sandbox.canConfirmOrder_({ holdStatus: 'hold' }, { staff: '佐藤', staffEmail: 'sato@example.com' }, 'suzuki@example.com');
  assert.strictEqual(result.ok, false);
});
test('Holdリストのstaffemail列に前後の空白・大文字小文字の違いがあってもHold担当者本人なら受注確定できる（実際に報告された不具合: rowToObject_はセルの値をtrim・小文字化せずそのまま返すため、スプレッドシート側での手動編集等で表記ゆれが生じても本人が受注確定できなくなってはいけない）', () => {
  const result = sandbox.canConfirmOrder_({ holdStatus: 'hold' }, { staff: '戸田', staffEmail: ' Toda@Example.com ' }, 'toda@example.com');
  assert.strictEqual(result.ok, true);
});
test('Hold中なのにHold情報が取得できない場合は安全側に倒して受注確定できない（データ不整合対策）', () => {
  const result = sandbox.canConfirmOrder_({ holdStatus: 'hold' }, null, 'sato@example.com');
  assert.strictEqual(result.ok, false);
});

console.log('== HoldService: canCancelHold_ / decideCancelAction_（Hold解除・メールアドレスで判定） ==');
test('Holdを行った本人（同じメールアドレス）なら解除できる。表示名が異なっていても影響しない', () => {
  const result = sandbox.canCancelHold_({ staff: '佐藤（旧姓）', staffEmail: 'sato@example.com' }, 'sato@example.com');
  assert.strictEqual(result.ok, true);
});
test('Holdを行った本人以外（メールアドレスが異なる）は解除できない', () => {
  const result = sandbox.canCancelHold_({ staff: '佐藤', staffEmail: 'sato@example.com' }, 'suzuki@example.com');
  assert.strictEqual(result.ok, false);
  assert.ok(result.reason.includes('佐藤'));
});
test('Holdリストのstaffemail列に前後の空白・大文字小文字の違いがあっても本人なら解除できる', () => {
  const result = sandbox.canCancelHold_({ staff: '戸田', staffEmail: ' Toda@Example.com ' }, 'toda@example.com');
  assert.strictEqual(result.ok, true);
});
test('該当のHold行がなければ解除できない', () => {
  const result = sandbox.canCancelHold_(null, 'sato@example.com');
  assert.strictEqual(result.ok, false);
});

console.log('== HoldService: validateRequiredInfo_（全項目入力チェック） ==');
const fullInfo = {
  salesLocation: '東京本店', leadNumber: 'L-001', registeredMonth: '2026-08', staff: '佐藤', staffEmail: 'sato@example.com', customer: '山田太郎',
  tradeIn: 'あり', oss: '可', insurance: 'あり', paymentMethod: '現金'
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
test('支払方法が未入力だとNG', () => {
  const info = Object.assign({}, fullInfo, { paymentMethod: '' });
  const result = sandbox.validateRequiredInfo_(sandbox.HOLD_ORDER_INPUT_COLUMNS, info);
  assert.strictEqual(result.ok, false);
  assert.ok(result.reason.includes('支払方法'));
});
test('販売拠点が未入力だとNG（Hold登録時にも必須）', () => {
  const info = Object.assign({}, fullInfo, { salesLocation: '' });
  const result = sandbox.validateRequiredInfo_(sandbox.HOLD_ORDER_INPUT_COLUMNS, info);
  assert.strictEqual(result.ok, false);
  assert.ok(result.reason.includes('販売拠点'));
});
test('複数項目が未入力だとすべて列挙される', () => {
  const result = sandbox.validateRequiredInfo_(sandbox.HOLD_ORDER_INPUT_COLUMNS, {});
  assert.strictEqual(result.ok, false);
  assert.ok(result.reason.includes('リード番号'));
  assert.ok(result.reason.includes('顧客'));
});

console.log('== HoldService: normalizeLeadNumber_（リード番号は「L-」＋数字で固定） ==');
test('数字のみ入力すると「L-」が付与される', () => {
  assert.strictEqual(sandbox.normalizeLeadNumber_('12345678'), 'L-12345678');
});
test('すでに「L-」が付いていればそのまま（二重に付与されない）', () => {
  assert.strictEqual(sandbox.normalizeLeadNumber_('L-12345678'), 'L-12345678');
});
test('先頭0を含む数字でも保持される', () => {
  assert.strictEqual(sandbox.normalizeLeadNumber_('00012345'), 'L-00012345');
});
test('数字以外の文字は取り除かれる', () => {
  assert.strictEqual(sandbox.normalizeLeadNumber_('l-123-456'), 'L-123456');
});
test('数字が1つも無ければエラー', () => {
  assert.throws(() => sandbox.normalizeLeadNumber_('L-'), /数字/);
  assert.throws(() => sandbox.normalizeLeadNumber_(''), /数字/);
  assert.throws(() => sandbox.normalizeLeadNumber_(null), /数字/);
});

console.log('== HoldService: decideExpiryAction_ ==');
test('在庫あり車両は対象外', () => {
  assert.strictEqual(sandbox.decideExpiryAction_({ holdStatus: 'available' }, Date.now()), 'none');
});
test('Hold期限前は対象外', () => {
  const now = 1000;
  assert.strictEqual(sandbox.decideExpiryAction_({ holdStatus: 'hold', expiresAt: 2000 }, now), 'none');
});
test('Hold期限経過は解放', () => {
  const now = 3000;
  assert.strictEqual(sandbox.decideExpiryAction_({ holdStatus: 'hold', expiresAt: 2000 }, now), 'release');
});

console.log('== HoldService: buildHoldRecord_ / attachHoldInfo_ ==');
test('buildHoldRecord_ が入力項目一式を1行分のレコードに詰める（担当者メールも含む）', () => {
  const record = sandbox.buildHoldRecord_('C-001', sandbox.HOLD_RANK.FIRST, fullInfo, 1000, 1000 + sandbox.HOLD_DURATION_MS);
  assert.strictEqual(record.commission, 'C-001');
  assert.strictEqual(record.rank, '1st');
  assert.strictEqual(record.salesLocation, '東京本店');
  assert.strictEqual(record.leadNumber, 'L-001');
  assert.strictEqual(record.staffEmail, 'sato@example.com');
  assert.strictEqual(record.createdAt, 1000);
  assert.strictEqual(record.expiresAt, 1000 + sandbox.HOLD_DURATION_MS);
});
test('applyHoldFieldsToVehicle_ はHold行がない場合すべてnullを設定する', () => {
  const vehicle = { commission: 'C-999' };
  sandbox.applyHoldFieldsToVehicle_(vehicle, null, 'hold');
  assert.strictEqual(vehicle.holdStaff, null);
  assert.strictEqual(vehicle.holdStaffEmail, null);
  assert.strictEqual(vehicle.holdLeadNumber, null);
  assert.strictEqual(vehicle.holdCreatedAt, null);
});
test('applyHoldFieldsToVehicle_ はHold行があればプレフィックス付きで値を反映する（担当者メールも含む）', () => {
  const vehicle = { commission: 'C-998' };
  const holdRow = Object.assign({ createdAt: 1000, expiresAt: 2000 }, fullInfo);
  sandbox.applyHoldFieldsToVehicle_(vehicle, holdRow, 'hold');
  assert.strictEqual(vehicle.holdStaff, '佐藤');
  assert.strictEqual(vehicle.holdStaffEmail, 'sato@example.com');
  assert.strictEqual(vehicle.holdLeadNumber, 'L-001');
  assert.strictEqual(vehicle.holdExpiresAt, 2000);
});
test('applyHoldFieldsToVehicle_ はholdType未設定のHold行を通常のHold（normal）として反映する', () => {
  const vehicle = { commission: 'C-997' };
  const holdRow = Object.assign({ createdAt: 1000, expiresAt: 2000 }, fullInfo);
  sandbox.applyHoldFieldsToVehicle_(vehicle, holdRow, 'hold');
  assert.strictEqual(vehicle.holdHoldType, 'normal');
  assert.strictEqual(vehicle.holdSalesStore, undefined);
});
test('applyHoldFieldsToVehicle_ は業販HOLDのholdType・salesStoreも反映する', () => {
  const vehicle = { commission: 'C-996' };
  const wholesaleRow = Object.assign({ createdAt: 1000, expiresAt: null, holdType: 'wholesale', salesStore: '横浜店' }, fullInfo);
  sandbox.applyHoldFieldsToVehicle_(vehicle, wholesaleRow, 'hold');
  assert.strictEqual(vehicle.holdHoldType, 'wholesale');
  assert.strictEqual(vehicle.holdSalesStore, '横浜店');
});

console.log('== HoldService: normalizeHoldType_（業販HOLDは管理者権限を持つ担当者のみ） ==');
const ADMIN_EMAIL = sandbox.SYSTEM_ADMIN_EMAILS[0];
test('未指定は通常のHold（normal）になる（誰でも可）', () => {
  assert.strictEqual(sandbox.normalizeHoldType_(undefined, 'other@example.com'), 'normal');
  assert.strictEqual(sandbox.normalizeHoldType_('normal', 'other@example.com'), 'normal');
});
test('管理者は業販HOLDを指定できる', () => {
  assert.strictEqual(sandbox.normalizeHoldType_('wholesale', ADMIN_EMAIL), 'wholesale');
});
test('非管理者が業販HOLDを指定しようとするとエラー', () => {
  assert.throws(() => sandbox.normalizeHoldType_('wholesale', 'other@example.com'), /管理者権限/);
});
test('不正なHold種別はエラー', () => {
  assert.throws(() => sandbox.normalizeHoldType_('bogus', ADMIN_EMAIL), /不正なHold種別/);
});

console.log('== HoldService: buildHoldRecord_（holdType・salesStore対応） ==');
test('holdType省略時はnormalになり、salesStoreは空文字になる', () => {
  const record = sandbox.buildHoldRecord_('C-101', sandbox.HOLD_RANK.FIRST, fullInfo, 1000, 1000 + sandbox.HOLD_DURATION_MS);
  assert.strictEqual(record.holdType, 'normal');
  assert.strictEqual(record.salesStore, '');
});
test('holdType・salesStoreを指定すると反映される（業販HOLDは期限がnullでも組み立てられる）', () => {
  const wholesaleRecord = sandbox.buildHoldRecord_(
    'C-103', sandbox.HOLD_RANK.FIRST,
    { staffEmail: 'admin@example.com', salesStore: '横浜店' }, 1000, null, 'wholesale'
  );
  assert.strictEqual(wholesaleRecord.holdType, 'wholesale');
  assert.strictEqual(wholesaleRecord.expiresAt, null);
  assert.strictEqual(wholesaleRecord.salesStore, '横浜店');
});

console.log('== SearchService: searchInventory / searchOrders ==');
const vehicles = [
  { commission: 'C001', model: 'モデルA', holdStatus: 'available' },
  { commission: 'C002', model: 'モデルB', holdStatus: 'hold' }
];
test('キーワードでモデル検索がヒットする', () => {
  assert.strictEqual(sandbox.searchInventory(vehicles, { keyword: 'モデルA' }).length, 1);
});
test('キーワードでコミッション検索がヒットする', () => {
  assert.strictEqual(sandbox.searchInventory(vehicles, { keyword: 'C002' }).length, 1);
});
test('キーワードで車台番号下４桁検索がヒットする', () => {
  const withChassis = [{ commission: 'C003', model: 'モデルC', chassisNumberLast4: '4567', holdStatus: 'available' }];
  assert.strictEqual(sandbox.searchInventory(withChassis, { keyword: '4567' }).length, 1);
});
test('includeHold=falseでHold済み車両が除外される', () => {
  const result = sandbox.searchInventory(vehicles, { includeHold: false });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].commission, 'C001');
});
test('無関係なキーワードはヒットしない', () => {
  assert.strictEqual(sandbox.searchInventory(vehicles, { keyword: '該当なし' }).length, 0);
});

const gradeVehicles = [
  { commission: 'G001', model: 'C63', holdStatus: 'available' },
  { commission: 'G002', model: 'C43T', holdStatus: 'available' },
  { commission: 'G003', model: 'C200', holdStatus: 'available' },
  { commission: 'G004', model: 'CLA250', holdStatus: 'available' },
  { commission: 'G005', model: 'GLC300', holdStatus: 'available' }
];
test('アルファベットのみのキーワード「C」はモデル先頭が完全一致する車両のみヒットする', () => {
  const result = sandbox.searchInventory(gradeVehicles, { keyword: 'C' });
  const models = result.map((v) => v.model).sort();
  assert.deepStrictEqual(models, ['C200', 'C43T', 'C63']);
});
test('アルファベットのみのキーワード「C」は「CLA」「GLC」にはヒットしない', () => {
  const result = sandbox.searchInventory(gradeVehicles, { keyword: 'C' });
  assert.ok(!result.some((v) => v.model === 'CLA250'));
  assert.ok(!result.some((v) => v.model === 'GLC300'));
});
test('数字を含むキーワードはモデルの部分一致にフォールバックする', () => {
  assert.strictEqual(sandbox.searchInventory(gradeVehicles, { keyword: 'C63' }).length, 1);
});

const orders = [
  { commission: 'C001', model: 'モデルA', customer: '山田太郎', staff: '佐藤', salesLocation: '東京本店' },
  { commission: 'C002', model: 'モデルB', customer: '田中花子', staff: '鈴木', salesLocation: '大阪支店' }
];
test('自由検索（キーワード）で顧客名がヒットする', () => {
  assert.strictEqual(sandbox.searchOrders(orders, { keyword: '山田太郎' }).length, 1);
});
test('自由検索（キーワード）で担当者名がヒットする', () => {
  assert.strictEqual(sandbox.searchOrders(orders, { keyword: '鈴木' }).length, 1);
});
test('自由検索（キーワード）で販売拠点もヒットする', () => {
  assert.strictEqual(sandbox.searchOrders(orders, { keyword: '大阪' }).length, 1);
});
test('拠点ごとの検索（部分一致）で絞り込める', () => {
  const result = sandbox.searchOrders(orders, { salesLocation: '東京' });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].commission, 'C001');
});
test('担当者ごとの検索（完全一致）で絞り込める', () => {
  const result = sandbox.searchOrders(orders, { staff: '鈴木' });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].commission, 'C002');
});
test('拠点・担当者の検索は組み合わせて絞り込める（両方一致する行のみ）', () => {
  assert.strictEqual(sandbox.searchOrders(orders, { salesLocation: '東京', staff: '鈴木' }).length, 0);
  assert.strictEqual(sandbox.searchOrders(orders, { salesLocation: '東京', staff: '佐藤' }).length, 1);
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

console.log('== SheetService: holdMatchesCommission_（コミッションの型不一致対策） ==');
test('文字列同士なら一致する', () => {
  assert.strictEqual(sandbox.holdMatchesCommission_({ commission: 'C-2001' }, 'C-2001'), true);
});
test('スプレッドシートが数値として保持したコミッションでも一致する（受注確定・2nd Holdの不具合の原因だった箇所）', () => {
  // 数字のみのコミッション（例: "2001"）はGoogleスプレッドシートに貼り付けると
  // 自動的にNumber型のセルになることがある。Holdリスト側がNumber、
  // 呼び出し元（在庫リスト）から渡ってくる commission がStringだと、
  // 厳密等価（===）ではHold行が見つからず、受注確定の担当者チェックが
  // 素通りしてしまったり、2nd Hold登録が「Hold情報が見つかりません」と
  // 誤ってエラーになっていた。
  assert.strictEqual(sandbox.holdMatchesCommission_({ commission: 2001 }, '2001'), true);
  assert.strictEqual(sandbox.holdMatchesCommission_({ commission: '2001' }, 2001), true);
});
test('本当に異なるコミッションは一致しない', () => {
  assert.strictEqual(sandbox.holdMatchesCommission_({ commission: 'C-2001' }, 'C-2002'), false);
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

console.log('== SettingsService: normalizeStaffList_（担当者マスタ最大30人・{name,email,location}形式） ==');
test('名前・メールがともに空、メール重複は除去される', () => {
  const list = sandbox.normalizeStaffList_([
    { name: '佐藤', email: 'sato@example.com', location: '東京本店' },
    { name: '', email: '' },
    { name: '佐藤(重複)', email: 'Sato@Example.com' }, // 大文字小文字違いも同一メールとして扱う
    { name: '鈴木', email: '' }, // メール未入力は除去
    { name: ' 伊藤 ', email: ' ito@example.com ', location: ' 大阪支店 ' }
  ]);
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].name, '佐藤');
  assert.strictEqual(list[0].email, 'sato@example.com');
  assert.strictEqual(list[0].location, '東京本店');
  assert.strictEqual(list[1].name, '伊藤');
  assert.strictEqual(list[1].email, 'ito@example.com');
  assert.strictEqual(list[1].location, '大阪支店');
});
test('拠点名は未入力でも登録できる（空文字のまま保持）', () => {
  const list = sandbox.normalizeStaffList_([{ name: '高橋', email: 'takahashi@example.com' }]);
  assert.strictEqual(list[0].location, '');
});
test('30人まではそのまま登録できる', () => {
  const list = Array.from({ length: 30 }, (_, i) => ({ name: 'スタッフ' + i, email: 'staff' + i + '@example.com' }));
  assert.strictEqual(sandbox.normalizeStaffList_(list).length, 30);
});
test('31人以上はエラーになる', () => {
  const list = Array.from({ length: 31 }, (_, i) => ({ name: 'スタッフ' + i, email: 'staff' + i + '@example.com' }));
  assert.throws(() => sandbox.normalizeStaffList_(list), /最大30人/);
});
test('配列以外が渡されても空配列として扱われる', () => {
  assert.strictEqual(sandbox.normalizeStaffList_(null).length, 0);
  assert.strictEqual(sandbox.normalizeStaffList_(undefined).length, 0);
});

console.log('== SettingsService: normalizeMailList_（メール通知先1項目分・最大20件、順序を保った配列） ==');
test('空文字・重複（大文字小文字違い含む）は除去され、順序は保たれる', () => {
  const list = sandbox.normalizeMailList_([
    ' sato@example.com ',
    '',
    'Sato@Example.com', // 大文字小文字違いも同一とみなし除去
    'ito@example.com',
    null
  ]);
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0], 'sato@example.com');
  assert.strictEqual(list[1], 'ito@example.com');
});
test('20件まではそのまま登録できる', () => {
  const list = Array.from({ length: 20 }, (_, i) => 'staff' + i + '@example.com');
  assert.strictEqual(sandbox.normalizeMailList_(list).length, 20);
});
test('21件以上はエラーになる', () => {
  const list = Array.from({ length: 21 }, (_, i) => 'staff' + i + '@example.com');
  assert.throws(() => sandbox.normalizeMailList_(list), /最大20件/);
});
test('254文字を超えるメールアドレスはエラーになる', () => {
  const longEmail = 'a'.repeat(250) + '@example.com';
  assert.throws(() => sandbox.normalizeMailList_([longEmail]), /長すぎます/);
});
test('配列以外が渡されても空配列として扱われる', () => {
  assert.strictEqual(sandbox.normalizeMailList_(null).length, 0);
  assert.strictEqual(sandbox.normalizeMailList_(undefined).length, 0);
});

console.log('== SettingsService: resolveStaffNameByEmail_（ログインメールから担当者名を解決） ==');
const staffListWithEmails = [
  { name: '佐藤', email: 'sato@example.com' },
  { name: '鈴木', email: 'suzuki@example.com' }
];
test('メールアドレスが一致する担当者名を返す', () => {
  assert.strictEqual(sandbox.resolveStaffNameByEmail_(staffListWithEmails, 'sato@example.com'), '佐藤');
});
test('大文字小文字を無視して一致する', () => {
  assert.strictEqual(sandbox.resolveStaffNameByEmail_(staffListWithEmails, 'SATO@EXAMPLE.COM'), '佐藤');
});
test('一致する担当者がいなければnull', () => {
  assert.strictEqual(sandbox.resolveStaffNameByEmail_(staffListWithEmails, 'unknown@example.com'), null);
});
test('メールアドレスが空ならnull', () => {
  assert.strictEqual(sandbox.resolveStaffNameByEmail_(staffListWithEmails, ''), null);
  assert.strictEqual(sandbox.resolveStaffNameByEmail_(staffListWithEmails, null), null);
});

console.log('== SettingsService: findStaffByEmail_（担当者本体を検索。拠点名の自動反映に使う） ==');
const staffListWithLocations = [
  { name: '佐藤', email: 'sato@example.com', location: '東京本店' },
  { name: '鈴木', email: 'suzuki@example.com', location: '' }
];
test('メールアドレスが一致する担当者（拠点名を含む）を返す', () => {
  const match = sandbox.findStaffByEmail_(staffListWithLocations, 'sato@example.com');
  assert.strictEqual(match.name, '佐藤');
  assert.strictEqual(match.location, '東京本店');
});
test('拠点名が未登録の担当者は空文字のまま返る', () => {
  const match = sandbox.findStaffByEmail_(staffListWithLocations, 'suzuki@example.com');
  assert.strictEqual(match.location, '');
});
test('一致する担当者がいなければnull', () => {
  assert.strictEqual(sandbox.findStaffByEmail_(staffListWithLocations, 'unknown@example.com'), null);
});

console.log('== SettingsService: validateLogoUrl_（ロゴ設定値の検証） ==');
test('通常のURLはそのまま返る', () => {
  assert.strictEqual(sandbox.validateLogoUrl_('https://example.com/logo.png'), 'https://example.com/logo.png');
});
test('前後の空白はトリムされる', () => {
  assert.strictEqual(sandbox.validateLogoUrl_('  https://example.com/logo.png  '), 'https://example.com/logo.png');
});
test('空文字・未指定は空文字のまま', () => {
  assert.strictEqual(sandbox.validateLogoUrl_(''), '');
  assert.strictEqual(sandbox.validateLogoUrl_(undefined), '');
});
test('上限文字数を超えるとエラー', () => {
  const tooLong = 'https://example.com/' + 'a'.repeat(1500) + '.png';
  assert.throws(() => sandbox.validateLogoUrl_(tooLong), /長すぎます/);
});
test('ドライブの共有リンクは直接画像URLに変換される', () => {
  const shared = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567/view?usp=sharing';
  assert.strictEqual(
    sandbox.validateLogoUrl_(shared),
    'https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567=w' + sandbox.LOGO_DISPLAY_WIDTH
  );
});
test('ドライブIDのみの入力も直接画像URLに変換される', () => {
  assert.strictEqual(
    sandbox.validateLogoUrl_('1AbCdEfGhIjKlMnOpQrStUvWxYz1234567'),
    'https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567=w' + sandbox.LOGO_DISPLAY_WIDTH
  );
});

console.log('== SettingsService: validateAppTitle_（アプリタイトル設定値の検証） ==');
test('通常の文字列はそのまま返る', () => {
  assert.strictEqual(sandbox.validateAppTitle_('販売可能リスト（本社）'), '販売可能リスト（本社）');
});
test('前後の空白はトリムされる', () => {
  assert.strictEqual(sandbox.validateAppTitle_('  販売可能リスト  '), '販売可能リスト');
});
test('空文字・未指定は空文字のまま（既定値へのフォールバックはcurrentAppTitle_側で行う）', () => {
  assert.strictEqual(sandbox.validateAppTitle_(''), '');
  assert.strictEqual(sandbox.validateAppTitle_(undefined), '');
});
test('上限文字数を超えるとエラー', () => {
  const tooLong = 'あ'.repeat(sandbox.APP_TITLE_MAX_LENGTH + 1);
  assert.throws(() => sandbox.validateAppTitle_(tooLong), /長すぎます/);
});

console.log('== SettingsService: validateSpreadsheetTitle_（スプレッドシート自体のタイトルの検証） ==');
test('通常の文字列はそのまま返る', () => {
  assert.strictEqual(sandbox.validateSpreadsheetTitle_('販売可能リスト在庫管理（本社）'), '販売可能リスト在庫管理（本社）');
});
test('前後の空白はトリムされる', () => {
  assert.strictEqual(sandbox.validateSpreadsheetTitle_('  在庫管理  '), '在庫管理');
});
test('空文字・未指定はエラー（ドライブのファイル名を空にはできない）', () => {
  assert.throws(() => sandbox.validateSpreadsheetTitle_(''), /入力してください/);
  assert.throws(() => sandbox.validateSpreadsheetTitle_(undefined), /入力してください/);
  assert.throws(() => sandbox.validateSpreadsheetTitle_('   '), /入力してください/);
});
test('上限文字数を超えるとエラー', () => {
  const tooLong = 'あ'.repeat(sandbox.SPREADSHEET_TITLE_MAX_LENGTH + 1);
  assert.throws(() => sandbox.validateSpreadsheetTitle_(tooLong), /長すぎます/);
});

console.log('== SettingsService: validateChatWebhookUrl_（Google Chat通知先Webhook URLの検証） ==');
test('httpsから始まるURLはそのまま返る', () => {
  assert.strictEqual(
    sandbox.validateChatWebhookUrl_('https://chat.googleapis.com/v1/spaces/AAA/messages?key=xxx'),
    'https://chat.googleapis.com/v1/spaces/AAA/messages?key=xxx'
  );
});
test('前後の空白はトリムされる', () => {
  assert.strictEqual(sandbox.validateChatWebhookUrl_('  https://example.com/webhook  '), 'https://example.com/webhook');
});
test('空文字・未指定は空文字のまま（Google Chat通知はスキップされる）', () => {
  assert.strictEqual(sandbox.validateChatWebhookUrl_(''), '');
  assert.strictEqual(sandbox.validateChatWebhookUrl_(undefined), '');
});
test('httpsで始まらない場合はエラー', () => {
  assert.throws(() => sandbox.validateChatWebhookUrl_('http://example.com/webhook'), /https:\/\//);
  assert.throws(() => sandbox.validateChatWebhookUrl_('chat.googleapis.com/xxx'), /https:\/\//);
});
test('上限文字数を超えるとエラー', () => {
  const tooLong = 'https://example.com/' + 'a'.repeat(CHAT_WEBHOOK_URL_MAX_LENGTH_FOR_TEST());
  assert.throws(() => sandbox.validateChatWebhookUrl_(tooLong), /長すぎます/);
});
function CHAT_WEBHOOK_URL_MAX_LENGTH_FOR_TEST() { return sandbox.CHAT_WEBHOOK_URL_MAX_LENGTH + 10; }

console.log('== SettingsService: isSystemAdmin_（システムマスタへのアクセス可否。SYSTEM_ADMIN_EMAILSのみで判定） ==');
test('SYSTEM_ADMIN_EMAILSに含まれるメールアドレスはtrue（大文字小文字を無視）', () => {
  assert.strictEqual(sandbox.isSystemAdmin_('jimny.girl.2000@gmail.com'), true);
  assert.strictEqual(sandbox.isSystemAdmin_('Jimny.Girl.2000@Gmail.com'), true);
});
test('含まれないメールアドレス・空はfalse', () => {
  assert.strictEqual(sandbox.isSystemAdmin_('other@example.com'), false);
  assert.strictEqual(sandbox.isSystemAdmin_(''), false);
  assert.strictEqual(sandbox.isSystemAdmin_(null), false);
});

console.log('== SettingsService: normalizeThemeKey_（着せ替えプリセットキーの検証） ==');
test('THEME_PRESETSに存在するキーはそのまま返る', () => {
  assert.strictEqual(sandbox.normalizeThemeKey_('wine'), 'wine');
});
test('THEME_PRESETSは11種類（メルセデス・ベンツのボディカラー名）ある', () => {
  assert.strictEqual(sandbox.THEME_PRESETS.length, 11);
});
test('各プリセットはsidebarColorを持つ（サイドバーの色とセットで切り替わる）', () => {
  sandbox.THEME_PRESETS.forEach((p) => {
    assert.match(p.sidebarColor, /^#[0-9a-f]{6}$/i);
  });
});
test('RANDOM_THEME_KEY（ランダム・ログインのたび変化）はそのまま有効なキーとして返る', () => {
  assert.strictEqual(sandbox.normalizeThemeKey_(sandbox.RANDOM_THEME_KEY), sandbox.RANDOM_THEME_KEY);
});
test('存在しないキー・未指定はDEFAULT_THEME_KEYにフォールバックする', () => {
  assert.strictEqual(sandbox.normalizeThemeKey_('no-such-key'), sandbox.DEFAULT_THEME_KEY);
  assert.strictEqual(sandbox.normalizeThemeKey_(undefined), sandbox.DEFAULT_THEME_KEY);
  assert.strictEqual(sandbox.normalizeThemeKey_('#3870b0'), sandbox.DEFAULT_THEME_KEY);
});

console.log('== SettingsService: normalizeCelebrationVariants_（Hold/受注確定の演出バリエーション検証） ==');
test('CELEBRATION_VARIANT_OPTIONSに存在する値はそのまま返る', () => {
  const result = sandbox.normalizeCelebrationVariants_({ hold: 'B', order: 'A' });
  assert.strictEqual(result.hold, 'B');
  assert.strictEqual(result.order, 'A');
});
test('存在しない値・未指定はDEFAULT_CELEBRATION_VARIANTSにフォールバックする', () => {
  const result = sandbox.normalizeCelebrationVariants_({ hold: 'Z', order: undefined });
  assert.deepStrictEqual(result, sandbox.DEFAULT_CELEBRATION_VARIANTS);
});
test('未指定（undefined）を渡してもエラーにならずすべて既定値になる', () => {
  const result = sandbox.normalizeCelebrationVariants_(undefined);
  assert.deepStrictEqual(result, sandbox.DEFAULT_CELEBRATION_VARIANTS);
});
test('D（最も派手な演出）はhold/orderいずれも有効な値として通る', () => {
  const result = sandbox.normalizeCelebrationVariants_({ hold: 'D', order: 'D' });
  assert.strictEqual(result.hold, 'D');
  assert.strictEqual(result.order, 'D');
});
test('CELEBRATION_VARIANT_LABELSはhold/orderのすべてにDのラベルを持つ', () => {
  ['hold', 'order'].forEach((key) => {
    assert.strictEqual(typeof sandbox.CELEBRATION_VARIANT_LABELS[key].D, 'string');
    assert.ok(sandbox.CELEBRATION_VARIANT_LABELS[key].D.length > 0);
  });
});

console.log('== SettingsService: redactSystemMasterSettings_（非管理者にはメール通知・担当者を送らない） ==');
test('管理者にはそのまま返る', () => {
  const settings = { themeKey: 'steel', notifyHoldMailTo: 'a@example.com', staffList: [{ name: '佐藤' }] };
  const result = sandbox.redactSystemMasterSettings_(settings, true);
  assert.strictEqual(result.notifyHoldMailTo, 'a@example.com');
  assert.strictEqual(result.staffList.length, 1);
});
test('非管理者には通知先・担当者が空になる（テーマ・ロゴ・演出バリエーション・アプリタイトルはそのまま）', () => {
  const settings = {
    themeKey: 'wine', logoUrl: 'https://logo.png', appTitle: '販売可能リスト（本社）',
    notifyHoldMailTo: ['a@example.com'], notifyOrderMailTo: ['b@example.com'], notifyErrorMailTo: ['c@example.com'],
    notifyChatWebhookUrl: 'https://chat.googleapis.com/v1/spaces/AAA/messages?key=xxx',
    staffList: [{ name: '佐藤' }],
    celebrationVariants: { hold: 'B', order: 'C' }
  };
  const result = sandbox.redactSystemMasterSettings_(settings, false);
  assert.strictEqual(result.themeKey, 'wine');
  assert.strictEqual(result.logoUrl, 'https://logo.png');
  assert.strictEqual(result.appTitle, '販売可能リスト（本社）');
  assert.strictEqual(result.notifyHoldMailTo.length, 0);
  assert.strictEqual(result.notifyOrderMailTo.length, 0);
  assert.strictEqual(result.notifyErrorMailTo.length, 0);
  assert.strictEqual(result.notifyChatWebhookUrl, '');
  assert.strictEqual(result.staffList.length, 0);
  assert.deepStrictEqual(result.celebrationVariants, { hold: 'B', order: 'C' });
});

console.log('== SettingsService: applySystemMasterGuard_（非管理者による保存時、ロゴ・通知先・担当者は既存値を維持） ==');
test('管理者からの保存はそのまま反映される', () => {
  const incoming = { themeKey: 'petrol', logoUrl: 'https://new-logo.png', notifyHoldMailTo: 'new@example.com', staffList: [{ name: '新規' }] };
  const current = { notifyHoldMailTo: 'old@example.com', staffList: [{ name: '旧' }] };
  const result = sandbox.applySystemMasterGuard_(incoming, current, true);
  assert.strictEqual(result.notifyHoldMailTo, 'new@example.com');
  assert.strictEqual(result.staffList[0].name, '新規');
  assert.strictEqual(result.logoUrl, 'https://new-logo.png');
});
test('非管理者からの保存は、ロゴ・アプリタイトル・通知先・担当者が既存値のまま維持される（テーマは反映される）', () => {
  const incoming = {
    themeKey: 'amber', logoUrl: 'https://tampered-logo.png', appTitle: '改ざんタイトル',
    notifyHoldMailTo: 'tampered@example.com', notifyOrderMailTo: '', notifyErrorMailTo: '',
    notifyChatWebhookUrl: 'https://tampered-webhook.example.com',
    staffList: []
  };
  const current = {
    logoUrl: 'https://real-logo.png', appTitle: '本物のタイトル',
    notifyHoldMailTo: 'real@example.com', notifyOrderMailTo: 'real2@example.com', notifyErrorMailTo: 'real3@example.com',
    notifyChatWebhookUrl: 'https://chat.googleapis.com/v1/spaces/REAL/messages?key=xxx',
    staffList: [{ name: '本物の担当者', email: 'staff@example.com' }],
    celebrationVariants: { hold: 'A', order: 'A' }
  };
  const result = sandbox.applySystemMasterGuard_(incoming, current, false);
  assert.strictEqual(result.themeKey, 'amber');
  assert.strictEqual(result.logoUrl, 'https://real-logo.png');
  assert.strictEqual(result.appTitle, '本物のタイトル');
  assert.strictEqual(result.notifyHoldMailTo, 'real@example.com');
  assert.strictEqual(result.notifyOrderMailTo, 'real2@example.com');
  assert.strictEqual(result.notifyErrorMailTo, 'real3@example.com');
  assert.strictEqual(result.notifyChatWebhookUrl, 'https://chat.googleapis.com/v1/spaces/REAL/messages?key=xxx');
  assert.strictEqual(result.staffList.length, 1);
  assert.strictEqual(result.staffList[0].name, '本物の担当者');
  assert.deepStrictEqual(result.celebrationVariants, { hold: 'A', order: 'A' });
});

console.log('== AuditLogService: buildAuditLogEntry_（変更履歴1行分の組み立て） ==');
test('通常操作は担当者名・メールがそのまま記録される', () => {
  const staff = { name: '佐藤', email: 'sato@example.com' };
  const entry = sandbox.buildAuditLogEntry_('Hold登録', 'C-001', 'A4', staff, 'リード番号 L-0001', 1700000000000);
  assert.strictEqual(entry.timestamp, 1700000000000);
  assert.strictEqual(entry.action, 'Hold登録');
  assert.strictEqual(entry.commission, 'C-001');
  assert.strictEqual(entry.model, 'A4');
  assert.strictEqual(entry.staffName, '佐藤');
  assert.strictEqual(entry.staffEmail, 'sato@example.com');
  assert.strictEqual(entry.detail, 'リード番号 L-0001');
});
test('staffがnull（時間主導トリガーによる自動処理）の場合はシステム表記になる', () => {
  const entry = sandbox.buildAuditLogEntry_('Hold自動解放', 'C-002', 'A6', null, '期限切れ', 1700000000000);
  assert.strictEqual(entry.staffName, 'システム（自動処理）');
  assert.strictEqual(entry.staffEmail, '');
});
test('commission・detailが未指定でも空文字で埋まる', () => {
  const entry = sandbox.buildAuditLogEntry_('受注確定', undefined, 'Q5', { name: '鈴木', email: 'suzuki@example.com' }, undefined, 1700000000000);
  assert.strictEqual(entry.commission, '');
  assert.strictEqual(entry.detail, '');
});

console.log('== IntegrityService: checkInventoryIntegrity_（在庫データの整合性チェック） ==');
test('問題のないデータは空配列を返す', () => {
  const vehicles = [
    { ocn: 'O-001', commission: 'C-001', model: 'A4', holdStatus: 'available' },
    { ocn: 'O-002', commission: 'C-002', model: 'A6', holdStatus: 'hold' },
    { ocn: 'O-003', commission: 'C-003', model: 'Q5', holdStatus: '' }
  ];
  assert.strictEqual(sandbox.checkInventoryIntegrity_(vehicles).length, 0);
});
test('ＯＣＮが重複している行を検出する', () => {
  const vehicles = [
    { ocn: 'O-001', commission: 'C-001', model: 'A4', holdStatus: 'available' },
    { ocn: 'O-001', commission: 'C-002', model: 'A4 (別グレード)', holdStatus: 'available' }
  ];
  const issues = sandbox.checkInventoryIntegrity_(vehicles);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].type, 'duplicateOcn');
  assert.strictEqual(issues[0].ocn, 'O-001');
});
test('コミッションが重複している行は検出しない（コミッションは任意入力で重複し得るため）', () => {
  const vehicles = [
    { ocn: 'O-001', commission: 'C-001', model: 'A4', holdStatus: 'available' },
    { ocn: 'O-002', commission: 'C-001', model: 'A4 (別グレード)', holdStatus: 'available' }
  ];
  assert.strictEqual(sandbox.checkInventoryIntegrity_(vehicles).length, 0);
});
test('登録番号（地域＋分類番号＋ひらがな＋一連番号）が重複している行を検出する', () => {
  const vehicles = [
    { ocn: 'O-001', commission: 'C-001', model: 'A4', holdStatus: 'available', plateRegion: '岐阜', plateClass: '300', plateKana: 'あ', plateNumber: '1111' },
    { ocn: 'O-002', commission: 'C-002', model: 'A4 (別グレード)', holdStatus: 'available', plateRegion: '岐阜', plateClass: '300', plateKana: 'あ', plateNumber: '1111' }
  ];
  const issues = sandbox.checkInventoryIntegrity_(vehicles);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].type, 'duplicatePlateNumber');
  assert.ok(issues[0].message.indexOf('岐阜 300 あ 1111') !== -1);
});
test('登録番号が空欄（4マスすべて未入力）の行同士は重複扱いにしない', () => {
  const vehicles = [
    { ocn: 'O-001', commission: 'C-001', model: 'A4', holdStatus: 'available' },
    { ocn: 'O-002', commission: 'C-002', model: 'A6', holdStatus: 'available' }
  ];
  assert.strictEqual(sandbox.checkInventoryIntegrity_(vehicles).length, 0);
});
test('モデル名が空欄の行を検出する', () => {
  const vehicles = [{ ocn: 'O-001', commission: 'C-001', model: '', holdStatus: 'available' }];
  const issues = sandbox.checkInventoryIntegrity_(vehicles);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].type, 'missingModel');
});
test('不明なHoldステータスの行を検出する（例: 削除済みのdemo_reservedが残った行）', () => {
  const vehicles = [{ ocn: 'O-001', commission: 'C-001', model: 'A4', holdStatus: 'demo_reserved' }];
  const issues = sandbox.checkInventoryIntegrity_(vehicles);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].type, 'unknownHoldStatus');
});
test('holdStatusが空欄・未設定は不整合として扱わない', () => {
  const vehicles = [
    { ocn: 'O-001', commission: 'C-001', model: 'A4', holdStatus: '' },
    { ocn: 'O-002', commission: 'C-002', model: 'A6', holdStatus: null },
    { ocn: 'O-003', commission: 'C-003', model: 'Q5' }
  ];
  assert.strictEqual(sandbox.checkInventoryIntegrity_(vehicles).length, 0);
});
test('複数の問題は種類ごとにすべて列挙される', () => {
  const vehicles = [
    { ocn: 'O-001', commission: 'C-001', model: 'A4', holdStatus: 'available', plateRegion: '岐阜', plateClass: '300', plateKana: 'あ', plateNumber: '1111' },
    { ocn: 'O-001', commission: 'C-002', model: 'A4', holdStatus: 'available', plateRegion: '岐阜', plateClass: '300', plateKana: 'あ', plateNumber: '1111' },
    { ocn: 'O-002', commission: 'C-003', model: '', holdStatus: 'unknown_status' }
  ];
  const issues = sandbox.checkInventoryIntegrity_(vehicles);
  assert.strictEqual(issues.length, 4);
  const types = [];
  for (let i = 0; i < issues.length; i++) types.push(issues[i].type);
  assert.strictEqual(types.sort().join(','), 'duplicateOcn,duplicatePlateNumber,missingModel,unknownHoldStatus');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
