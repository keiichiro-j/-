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
test('1st Holdの担当者メールに大文字小文字・前後の空白の違いがあっても同一人物として2nd Hold登録不可にする（スプレッドシート側での手動編集等による表記ゆれ対策）', () => {
  const result = sandbox.canRegisterSecondHold_({ holdStatus: 'hold' }, false, ' Sato@Example.com ', 'sato@example.com');
  assert.strictEqual(result.ok, false);
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

console.log('== SettingsService: normalizeModelPhotoUrl_（Googleドライブの共有リンク→直接画像URLへの変換） ==');
test('/file/d/{ID}/view形式の共有リンクを直接画像URLに変換する', () => {
  const url = sandbox.normalizeModelPhotoUrl_('https://drive.google.com/file/d/1AbC-xyz_123/view?usp=sharing');
  assert.strictEqual(url, 'https://lh3.googleusercontent.com/d/1AbC-xyz_123=w1000');
});
test('open?id={ID}形式の共有リンクを直接画像URLに変換する', () => {
  const url = sandbox.normalizeModelPhotoUrl_('https://drive.google.com/open?id=1AbC-xyz_123');
  assert.strictEqual(url, 'https://lh3.googleusercontent.com/d/1AbC-xyz_123=w1000');
});
test('uc?id={ID}&export=download形式の共有リンクも変換する', () => {
  const url = sandbox.normalizeModelPhotoUrl_('https://drive.google.com/uc?id=1AbC-xyz_123&export=download');
  assert.strictEqual(url, 'https://lh3.googleusercontent.com/d/1AbC-xyz_123=w1000');
});
test('ドライブ以外のURL（他の画像ホスティングサービス等）はそのまま返る', () => {
  assert.strictEqual(sandbox.normalizeModelPhotoUrl_('https://example.com/c.jpg'), 'https://example.com/c.jpg');
});
test('既に変換済みのURL（lh3.googleusercontent.com）はそのまま返る', () => {
  const url = 'https://lh3.googleusercontent.com/d/1AbC-xyz_123=w1000';
  assert.strictEqual(sandbox.normalizeModelPhotoUrl_(url), url);
});
test('前後の空白は無視される', () => {
  const url = sandbox.normalizeModelPhotoUrl_('  https://drive.google.com/file/d/1AbC-xyz_123/view?usp=sharing  ');
  assert.strictEqual(url, 'https://lh3.googleusercontent.com/d/1AbC-xyz_123=w1000');
});
test('空文字・未指定はそのまま返る', () => {
  assert.strictEqual(sandbox.normalizeModelPhotoUrl_(''), '');
  assert.strictEqual(sandbox.normalizeModelPhotoUrl_(null), '');
  assert.strictEqual(sandbox.normalizeModelPhotoUrl_(undefined), '');
});
test('ドライブのドメインでもファイルIDを抽出できない形式はそのまま返る', () => {
  const url = 'https://drive.google.com/drive/folders/1AbC-xyz_123';
  assert.strictEqual(sandbox.normalizeModelPhotoUrl_(url), url);
});

console.log('== SettingsService: normalizeModelPhotos_（ホーム画面のモデル写真最大40件・{model,photoUrl,grades}形式） ==');
test('モデル名・写真URLがともに入力されている行のみ残り、モデル名重複は除去される', () => {
  const list = sandbox.normalizeModelPhotos_([
    { model: 'Cクラス', photoUrl: 'https://example.com/c.jpg' },
    { model: '', photoUrl: 'https://example.com/empty-model.jpg' }, // モデル名未入力は除去
    { model: 'Eクラス', photoUrl: '' }, // 写真URL未入力は除去
    { model: 'Cクラス', photoUrl: 'https://example.com/c-dup.jpg' }, // モデル名重複は除去（先勝ち）
    { model: ' 3シリーズ ', photoUrl: ' https://example.com/3.jpg ' }
  ]);
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].model, 'Cクラス');
  assert.strictEqual(list[0].photoUrl, 'https://example.com/c.jpg');
  assert.strictEqual(list[1].model, '3シリーズ');
  assert.strictEqual(list[1].photoUrl, 'https://example.com/3.jpg');
});
test('写真URLにGoogleドライブの共有リンクを指定すると、直接画像URLに変換されて保存される', () => {
  const list = sandbox.normalizeModelPhotos_([
    { model: 'Aクラス', photoUrl: 'https://drive.google.com/file/d/1AbC-xyz_123/view?usp=sharing' }
  ]);
  assert.strictEqual(list[0].photoUrl, 'https://lh3.googleusercontent.com/d/1AbC-xyz_123=w1000');
});
test('40件まではそのまま登録できる', () => {
  const list = Array.from({ length: 40 }, (_, i) => ({ model: 'モデル' + i, photoUrl: 'https://example.com/' + i + '.jpg' }));
  assert.strictEqual(sandbox.normalizeModelPhotos_(list).length, 40);
});
test('41件以上はエラーになる', () => {
  const list = Array.from({ length: 41 }, (_, i) => ({ model: 'モデル' + i, photoUrl: 'https://example.com/' + i + '.jpg' }));
  assert.throws(() => sandbox.normalizeModelPhotos_(list), /最大40件/);
});
test('写真URLが長すぎる場合はエラーになる（data URL直接貼り付け対策）', () => {
  const list = [{ model: 'Cクラス', photoUrl: 'x'.repeat(1501) }];
  assert.throws(() => sandbox.normalizeModelPhotos_(list), /長すぎます/);
});
test('1件あたりは上限内でも、合計文字数が大きすぎる場合はエラーになる', () => {
  // 30件 × 1500文字（1件あたりの上限ぎりぎり）はいずれも単体では通るが、
  // 合計するとScript Propertiesの実際の保存上限を超えるため弾かれる
  const list = Array.from({ length: 30 }, (_, i) => ({
    model: 'モデル' + i,
    photoUrl: 'https://example.com/' + 'a'.repeat(1450) + i
  }));
  assert.throws(() => sandbox.normalizeModelPhotos_(list), /大きすぎて保存できません/);
});
test('配列以外が渡されても空配列として扱われる', () => {
  assert.strictEqual(sandbox.normalizeModelPhotos_(null).length, 0);
  assert.strictEqual(sandbox.normalizeModelPhotos_(undefined).length, 0);
});
test('グレード一覧は空文字除去・重複除去のうえ配列で返る（在庫リストのモデル列と一致させる用途）', () => {
  const list = sandbox.normalizeModelPhotos_([
    { model: 'Aクラス', photoUrl: 'https://example.com/a.jpg', grades: ['A180', ' A200 ', '', 'A180', 'A35'] }
  ]);
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].grades.length, 3);
  assert.strictEqual(list[0].grades[0], 'A180');
  assert.strictEqual(list[0].grades[1], 'A200');
  assert.strictEqual(list[0].grades[2], 'A35');
});
test('グレード未設定の場合は空配列になる（従来のモデル名直接照合にフォールバック）', () => {
  const list = sandbox.normalizeModelPhotos_([{ model: 'クラウン', photoUrl: 'https://example.com/crown.jpg' }]);
  assert.strictEqual(list[0].grades.length, 0);
});
test('グレードが21件以上はエラーになる', () => {
  const grades = Array.from({ length: 21 }, (_, i) => 'G' + i);
  const list = [{ model: 'Aクラス', photoUrl: 'https://example.com/a.jpg', grades: grades }];
  assert.throws(() => sandbox.normalizeModelPhotos_(list), /グレードは最大20件/);
});
test('グレード名が長すぎる場合はエラーになる', () => {
  const list = [{ model: 'Aクラス', photoUrl: 'https://example.com/a.jpg', grades: ['x'.repeat(31)] }];
  assert.throws(() => sandbox.normalizeModelPhotos_(list), /長すぎます/);
});
test('ボディタイプはMODEL_BODY_TYPE_OPTIONSに含まれる値ならそのまま保持される', () => {
  const list = sandbox.normalizeModelPhotos_([{ model: 'Cクラス', photoUrl: 'https://example.com/c.jpg', bodyType: 'Sedan' }]);
  assert.strictEqual(list[0].bodyType, 'Sedan');
});
test('ボディタイプが未設定・不正な値の場合は空文字にフォールバックする（エラーにはしない）', () => {
  const list = sandbox.normalizeModelPhotos_([
    { model: 'Cクラス', photoUrl: 'https://example.com/c.jpg' },
    { model: 'Eクラス', photoUrl: 'https://example.com/e.jpg', bodyType: '' },
    { model: 'Aクラス', photoUrl: 'https://example.com/a.jpg', bodyType: 'ハッチバック' } // 選択肢に無い値
  ]);
  assert.strictEqual(list[0].bodyType, '');
  assert.strictEqual(list[1].bodyType, '');
  assert.strictEqual(list[2].bodyType, '');
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
test('存在しないキー・未指定はDEFAULT_THEME_KEYにフォールバックする', () => {
  assert.strictEqual(sandbox.normalizeThemeKey_('no-such-key'), sandbox.DEFAULT_THEME_KEY);
  assert.strictEqual(sandbox.normalizeThemeKey_(undefined), sandbox.DEFAULT_THEME_KEY);
  assert.strictEqual(sandbox.normalizeThemeKey_('#3870b0'), sandbox.DEFAULT_THEME_KEY);
});

console.log('== SettingsService: redactSystemMasterSettings_（非管理者にはメール通知・担当者を送らない） ==');
test('管理者にはそのまま返る', () => {
  const settings = { themeKey: 'steel', notifyHoldMailTo: 'a@example.com', staffList: [{ name: '佐藤' }] };
  const result = sandbox.redactSystemMasterSettings_(settings, true);
  assert.strictEqual(result.notifyHoldMailTo, 'a@example.com');
  assert.strictEqual(result.staffList.length, 1);
});
test('非管理者には通知先・担当者が空になる（テーマ・ロゴ・モデル写真はそのまま）', () => {
  const settings = {
    themeKey: 'wine', logoUrl: 'https://logo.png',
    notifyHoldMailTo: ['a@example.com'], notifyOrderMailTo: ['b@example.com'], notifyErrorMailTo: ['c@example.com'],
    staffList: [{ name: '佐藤' }], modelPhotos: [{ model: 'Cクラス' }]
  };
  const result = sandbox.redactSystemMasterSettings_(settings, false);
  assert.strictEqual(result.themeKey, 'wine');
  assert.strictEqual(result.logoUrl, 'https://logo.png');
  assert.strictEqual(result.modelPhotos.length, 1);
  assert.strictEqual(result.notifyHoldMailTo.length, 0);
  assert.strictEqual(result.notifyOrderMailTo.length, 0);
  assert.strictEqual(result.notifyErrorMailTo.length, 0);
  assert.strictEqual(result.staffList.length, 0);
});

console.log('== SettingsService: applySystemMasterGuard_（非管理者による保存時、ロゴ・モデル写真・通知先・担当者は既存値を維持） ==');
test('管理者からの保存はそのまま反映される', () => {
  const incoming = { themeKey: 'petrol', logoUrl: 'https://new-logo.png', notifyHoldMailTo: 'new@example.com', staffList: [{ name: '新規' }], modelPhotos: [{ model: '新モデル' }] };
  const current = { notifyHoldMailTo: 'old@example.com', staffList: [{ name: '旧' }] };
  const result = sandbox.applySystemMasterGuard_(incoming, current, true);
  assert.strictEqual(result.notifyHoldMailTo, 'new@example.com');
  assert.strictEqual(result.staffList[0].name, '新規');
  assert.strictEqual(result.logoUrl, 'https://new-logo.png');
});
test('非管理者からの保存は、ロゴ・モデル写真・通知先・担当者が既存値のまま維持される（テーマは反映される）', () => {
  const incoming = {
    themeKey: 'amber', logoUrl: 'https://tampered-logo.png',
    notifyHoldMailTo: 'tampered@example.com', notifyOrderMailTo: '', notifyErrorMailTo: '',
    staffList: [], modelPhotos: [{ model: 'Eクラス' }]
  };
  const current = {
    logoUrl: 'https://real-logo.png',
    notifyHoldMailTo: 'real@example.com', notifyOrderMailTo: 'real2@example.com', notifyErrorMailTo: 'real3@example.com',
    staffList: [{ name: '本物の担当者', email: 'staff@example.com' }],
    modelPhotos: [{ model: '本物のモデル' }]
  };
  const result = sandbox.applySystemMasterGuard_(incoming, current, false);
  assert.strictEqual(result.themeKey, 'amber');
  assert.strictEqual(result.logoUrl, 'https://real-logo.png');
  assert.strictEqual(result.modelPhotos.length, 1);
  assert.strictEqual(result.modelPhotos[0].model, '本物のモデル');
  assert.strictEqual(result.notifyHoldMailTo, 'real@example.com');
  assert.strictEqual(result.notifyOrderMailTo, 'real2@example.com');
  assert.strictEqual(result.notifyErrorMailTo, 'real3@example.com');
  assert.strictEqual(result.staffList.length, 1);
  assert.strictEqual(result.staffList[0].name, '本物の担当者');
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
    { commission: 'C-001', model: 'A4', holdStatus: 'available' },
    { commission: 'C-002', model: 'A6', holdStatus: 'hold' },
    { commission: 'C-003', model: 'Q5', holdStatus: '' }
  ];
  assert.strictEqual(sandbox.checkInventoryIntegrity_(vehicles).length, 0);
});
test('コミッションが重複している行を検出する', () => {
  const vehicles = [
    { commission: 'C-001', model: 'A4', holdStatus: 'available' },
    { commission: 'C-001', model: 'A4 (別グレード)', holdStatus: 'available' }
  ];
  const issues = sandbox.checkInventoryIntegrity_(vehicles);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].type, 'duplicateCommission');
  assert.strictEqual(issues[0].commission, 'C-001');
});
test('モデル名が空欄の行を検出する', () => {
  const vehicles = [{ commission: 'C-001', model: '', holdStatus: 'available' }];
  const issues = sandbox.checkInventoryIntegrity_(vehicles);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].type, 'missingModel');
});
test('不明なHoldステータスの行を検出する（例: 削除済みのdemo_reservedが残った行）', () => {
  const vehicles = [{ commission: 'C-001', model: 'A4', holdStatus: 'demo_reserved' }];
  const issues = sandbox.checkInventoryIntegrity_(vehicles);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].type, 'unknownHoldStatus');
});
test('holdStatusが空欄・未設定は不整合として扱わない', () => {
  const vehicles = [
    { commission: 'C-001', model: 'A4', holdStatus: '' },
    { commission: 'C-002', model: 'A6', holdStatus: null },
    { commission: 'C-003', model: 'Q5' }
  ];
  assert.strictEqual(sandbox.checkInventoryIntegrity_(vehicles).length, 0);
});
test('複数の問題は種類ごとにすべて列挙される', () => {
  const vehicles = [
    { commission: 'C-001', model: 'A4', holdStatus: 'available' },
    { commission: 'C-001', model: 'A4', holdStatus: 'available' },
    { commission: 'C-002', model: '', holdStatus: 'unknown_status' }
  ];
  const issues = sandbox.checkInventoryIntegrity_(vehicles);
  assert.strictEqual(issues.length, 3);
  const types = [];
  for (let i = 0; i < issues.length; i++) types.push(issues[i].type);
  assert.strictEqual(types.sort().join(','), 'duplicateCommission,missingModel,unknownHoldStatus');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
