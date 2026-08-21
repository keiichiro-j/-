/**
 * Constants.gs
 * 車両受注アプリ 共通定数定義
 *
 * 既存の車両在庫管理アプリ・新車売上在庫管理システムとは独立したシステムとして構築する
 * （スプレッドシートも別建て）。列構成は実際の販売リスト／受注リストの項目に合わせている。
 */

// ===== シート名 =====
var SHEET_NAMES = {
  INVENTORY: '販売リスト',
  ORDERS: '受注リスト'
};

// ===== Hold 関連 =====
var HOLD_DURATION_MS = 72 * 60 * 60 * 1000; // Hold期間 72時間

var HOLD_STATUS = {
  AVAILABLE: 'available',
  HOLD: 'hold'
};

// ===== 選択肢 =====
var STEERING_OPTIONS = ['右', '左'];
var STOCK_DISCLOSURE_OPTIONS = ['開示', '非開示'];
var YES_NO_OPTIONS = ['あり', 'なし'];
var OSS_OPTIONS = ['可', '不可'];
var PAID_OPTION_SLOT_COUNT = 5; // 有償オプション（5マス分確保）

/**
 * 車両情報（販売リスト・受注リストで共通）の列定義。
 */
var VEHICLE_COLUMNS = [
  { key: 'carType', label: '車種', type: 'text', required: true },
  { key: 'model', label: 'モデル', type: 'text', required: true },
  { key: 'mp', label: 'MP', type: 'text' },
  { key: 'steering', label: 'ステア', type: 'select', options: STEERING_OPTIONS },
  { key: 'exteriorColor', label: '外装', type: 'text' },
  { key: 'interiorColor', label: '内装', type: 'text' }
].concat((function () {
  var slots = [];
  for (var i = 1; i <= PAID_OPTION_SLOT_COUNT; i++) {
    slots.push({ key: 'paidOption' + i, label: '有償オプション' + i, type: 'text' });
  }
  return slots;
})()).concat([
  { key: 'commission', label: 'コミッション', type: 'text', required: true },
  { key: 'arrivalExpectedDate', label: '入港予定日', type: 'date' },
  { key: 'vpc', label: 'VPC', type: 'text' },
  { key: 'stockDisclosure', label: '在庫開示', type: 'select', options: STOCK_DISCLOSURE_OPTIONS }
]);

var PAID_OPTION_KEYS = VEHICLE_COLUMNS
  .filter(function (c) { return /^paidOption\d+$/.test(c.key); })
  .map(function (c) { return c.key; });

/**
 * Hold（予約）・受注確定の共通入力項目。
 * 登録月／担当者／顧客／下取車の有無／OSS登録の可否／保険加入の有無。
 */
var HOLD_ORDER_INPUT_COLUMNS = [
  { key: 'registeredMonth', label: '登録月', type: 'text' },
  { key: 'staff', label: '担当者', type: 'text' },
  { key: 'customer', label: '顧客', type: 'text' },
  { key: 'tradeIn', label: '下取車の有無', type: 'select', options: YES_NO_OPTIONS },
  { key: 'oss', label: 'OSS登録の可否', type: 'select', options: OSS_OPTIONS },
  { key: 'insurance', label: '保険加入の有無', type: 'select', options: YES_NO_OPTIONS }
];

function prefixColumns_(columns, prefix, labelPrefix) {
  return columns.map(function (c) {
    var key = prefix + c.key.charAt(0).toUpperCase() + c.key.slice(1);
    var separator = /^[A-Za-z]/.test(c.label) ? ' ' : '';
    return Object.assign({}, c, { key: key, label: labelPrefix + separator + c.label });
  });
}

/**
 * 販売リスト（在庫）列定義（順序 = スプレッドシートの列順）。
 * 車両情報に加え、Hold（1st/2nd）の入力項目・登録日時・期限を含む。
 */
var INVENTORY_COLUMNS = VEHICLE_COLUMNS.concat([
  { key: 'holdStatus', label: 'Holdステータス', type: 'select', options: [HOLD_STATUS.AVAILABLE, HOLD_STATUS.HOLD] }
]).concat(prefixColumns_(HOLD_ORDER_INPUT_COLUMNS, 'hold', 'Hold')).concat([
  { key: 'holdCreatedAt', label: 'Hold登録日時', type: 'datetime' },
  { key: 'holdExpiresAt', label: 'Hold期限', type: 'datetime' }
]).concat(prefixColumns_(HOLD_ORDER_INPUT_COLUMNS, 'secondHold', '2nd Hold')).concat([
  { key: 'secondHoldCreatedAt', label: '2nd Hold登録日時', type: 'datetime' },
  { key: 'secondHoldExpiresAt', label: '2nd Hold期限', type: 'datetime' }
]);

/**
 * 受注リスト列定義。車両情報に加え、販売拠点と Hold・受注共通入力項目、
 * 受注確定日時を保持する。
 */
var ORDER_COLUMNS = VEHICLE_COLUMNS.concat([
  { key: 'salesLocation', label: '販売拠点', type: 'text' }
]).concat(HOLD_ORDER_INPUT_COLUMNS).concat([
  { key: 'orderedAt', label: '受注確定日時', type: 'datetime' }
]);

var INVENTORY_HEADER_ROW = INVENTORY_COLUMNS.map(function (c) { return c.label; });
var ORDER_HEADER_ROW = ORDER_COLUMNS.map(function (c) { return c.label; });

var INVENTORY_COL_INDEX = buildColIndex_(INVENTORY_COLUMNS);
var ORDER_COL_INDEX = buildColIndex_(ORDER_COLUMNS);

function buildColIndex_(columns) {
  var map = {};
  columns.forEach(function (c, i) { map[c.key] = i; }); // 0-indexed
  return map;
}

function inventoryColIndex1(key) {
  return INVENTORY_COL_INDEX[key] + 1; // 1-indexed（Range操作用）
}

function orderColIndex1(key) {
  return ORDER_COL_INDEX[key] + 1;
}

// ===== Script Properties キー（設定機能） =====
var PROP_KEYS = {
  THEME_COLOR: 'THEME_COLOR',
  NOTIFY_HOLD_MAIL_TO: 'NOTIFY_HOLD_MAIL_TO',
  NOTIFY_ORDER_MAIL_TO: 'NOTIFY_ORDER_MAIL_TO'
};

var DEFAULT_THEME_COLOR = '#1a73e8'; // Material Design Blue 600
