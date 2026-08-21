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
 * 販売リスト（在庫）列定義（順序 = スプレッドシートの列順）。
 * 車両情報に加え、3.2 Hold（1st/2nd）管理項目を含む。
 */
var INVENTORY_COLUMNS = VEHICLE_COLUMNS.concat([
  { key: 'holdStatus', label: 'Holdステータス', type: 'select', options: [HOLD_STATUS.AVAILABLE, HOLD_STATUS.HOLD] },

  // Hold（1st）
  { key: 'holdStaff', label: 'Hold担当', type: 'text' },
  { key: 'holdCustomer', label: 'Hold顧客名', type: 'text' },
  { key: 'holdCreatedAt', label: 'Hold登録日時', type: 'datetime' },
  { key: 'holdExpiresAt', label: 'Hold期限', type: 'datetime' },

  // 2nd Hold
  { key: 'secondHoldStaff', label: '2nd Hold担当', type: 'text' },
  { key: 'secondHoldCustomer', label: '2nd Hold顧客名', type: 'text' },
  { key: 'secondHoldCreatedAt', label: '2nd Hold登録日時', type: 'datetime' },
  { key: 'secondHoldExpiresAt', label: '2nd Hold期限', type: 'datetime' }
]);

/**
 * 受注リスト列定義。車両情報に加え、販売拠点／担当／顧客名を保持する。
 */
var ORDER_COLUMNS = VEHICLE_COLUMNS.concat([
  { key: 'salesLocation', label: '販売拠点', type: 'text' },
  { key: 'staff', label: '担当', type: 'text' },
  { key: 'customer', label: '顧客名', type: 'text' },
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
