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
test('holdStatusが空欄（スプレッドシートへ直接貼り付けた行）でもHold登録可', () => {
  assert.strictEqual(sandbox.canRegisterHold_({ holdStatus: '' }).ok, true);
  assert.strictEqual(sandbox.canRegisterHold_({ holdStatus: undefined }).ok, true);
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
test('1st Holdと異なる担当者（メールアドレスが異なる）なら2nd Hold登録可', () => {
  const result = sandbox.canRegisterSecondHold_({ holdStatus: 'hold' }, false, 'sato@example.com', 'suzuki@example.com');
  assert.strictEqual(result.ok, true);
});
test('1st Holdと同じ担当者（メールアドレスが同じ）は2nd Hold登録不可', () => {
  const result = sandbox.canRegisterSecondHold_({ holdStatus: 'hold' }, false, 'sato@example.com', 'sato@example.com');
  assert.strictEqual(result.ok, false);
  assert.ok(result.reason.includes('同じ担当者'));
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
test('該当のHold行がなければ解除できない', () => {
  const result = sandbox.canCancelHold_(null, 'sato@example.com');
  assert.strictEqual(result.ok, false);
});
test('2nd Holdを解除する場合はremoveSecond', () => {
  assert.strictEqual(sandbox.decideCancelAction_(sandbox.HOLD_RANK.SECOND, true), 'removeSecond');
  assert.strictEqual(sandbox.decideCancelAction_(sandbox.HOLD_RANK.SECOND, false), 'removeSecond');
});
test('1st Holdを解除する場合、2nd Holdがあれば繰り上げ(promote)、なければ解放(release)', () => {
  assert.strictEqual(sandbox.decideCancelAction_(sandbox.HOLD_RANK.FIRST, true), 'promote');
  assert.strictEqual(sandbox.decideCancelAction_(sandbox.HOLD_RANK.FIRST, false), 'release');
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
test('includeHold=falseでHold済み車両が除外される', () => {
  const result = sandbox.searchInventory(vehicles, { includeHold: false });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].commission, 'C001');
});
test('無関係なキーワードはヒットしない', () => {
  assert.strictEqual(sandbox.searchInventory(vehicles, { keyword: '該当なし' }).length, 0);
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
  const tooLong = 'data:image/png;base64,' + 'A'.repeat(9000);
  assert.throws(() => sandbox.validateLogoUrl_(tooLong), /大きすぎます/);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
