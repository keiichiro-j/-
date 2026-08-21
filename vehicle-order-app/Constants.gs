/**
 * Constants.gs
 * 車両受注アプリ 共通定数定義
 *
 * 企画書 5. のとおり、既存の車両在庫管理アプリ・新車売上在庫管理システムとは
 * 独立したシステムとして構築する（スプレッドシートも別建て）。
 */

// ===== シート名 =====
var SHEET_NAMES = {
  INVENTORY: '在庫',
  ORDERS: '受注リスト'
};

// ===== Hold 関連 =====
var HOLD_DURATION_MS = 72 * 60 * 60 * 1000; // Hold期間 72時間（3.2）

var HOLD_STATUS = {
  AVAILABLE: 'available',
  HOLD: 'hold'
};

// ===== 選択肢 =====
var STEERING_POSITION_OPTIONS = ['右', '左'];
var YES_NO_OPTIONS = ['あり', 'なし'];
var OSS_OPTIONS = ['可', '不可'];

/**
 * 在庫シート 列定義（順序 = スプレッドシートの列順）
 * 3.1・3.4 の在庫掲示・入力項目、3.2 の Hold（1st/2nd）管理項目を含む。
 */
var INVENTORY_COLUMNS = [
  { key: 'commission', label: 'コミッション（車両特定番号）', type: 'text', required: true },
  { key: 'arrivalMonth', label: '販売可能月（入港月）', type: 'text' },
  { key: 'model', label: 'モデル', type: 'text', required: true },
  { key: 'exteriorColor', label: 'カラー（外装）', type: 'text' },
  { key: 'interiorColor', label: 'カラー（内装）', type: 'text' },
  { key: 'steeringPosition', label: 'ハンドル位置', type: 'select', options: STEERING_POSITION_OPTIONS },
  { key: 'options', label: 'オプション', type: 'text' },
  { key: 'holdStatus', label: 'Holdステータス', type: 'select', options: [HOLD_STATUS.AVAILABLE, HOLD_STATUS.HOLD] },

  // Hold（1st）
  { key: 'holdRegisteredMonth', label: 'Hold登録月', type: 'text' },
  { key: 'holdStaff', label: 'Hold担当者', type: 'text' },
  { key: 'holdCustomer', label: 'Hold顧客', type: 'text' },
  { key: 'holdTradeIn', label: 'Hold下取車の有無', type: 'select', options: YES_NO_OPTIONS },
  { key: 'holdOss', label: 'Hold OSS登録の可否', type: 'select', options: OSS_OPTIONS },
  { key: 'holdInsurance', label: 'Hold保険加入の有無', type: 'select', options: YES_NO_OPTIONS },
  { key: 'holdCreatedAt', label: 'Hold登録日時', type: 'datetime' },
  { key: 'holdExpiresAt', label: 'Hold期限', type: 'datetime' },

  // 2nd Hold
  { key: 'secondHoldRegisteredMonth', label: '2nd Hold登録月', type: 'text' },
  { key: 'secondHoldStaff', label: '2nd Hold担当者', type: 'text' },
  { key: 'secondHoldCustomer', label: '2nd Hold顧客', type: 'text' },
  { key: 'secondHoldTradeIn', label: '2nd Hold下取車の有無', type: 'select', options: YES_NO_OPTIONS },
  { key: 'secondHoldOss', label: '2nd Hold OSS登録の可否', type: 'select', options: OSS_OPTIONS },
  { key: 'secondHoldInsurance', label: '2nd Hold保険加入の有無', type: 'select', options: YES_NO_OPTIONS },
  { key: 'secondHoldCreatedAt', label: '2nd Hold登録日時', type: 'datetime' },
  { key: 'secondHoldExpiresAt', label: '2nd Hold期限', type: 'datetime' }
];

/**
 * 受注リスト 列定義（3.3・3.4）。車両情報＋顧客情報を転記して保持する。
 */
var ORDER_COLUMNS = [
  { key: 'commission', label: 'コミッション（車両特定番号）', type: 'text', required: true },
  { key: 'arrivalMonth', label: '販売可能月（入港月）', type: 'text' },
  { key: 'model', label: 'モデル', type: 'text', required: true },
  { key: 'exteriorColor', label: 'カラー（外装）', type: 'text' },
  { key: 'interiorColor', label: 'カラー（内装）', type: 'text' },
  { key: 'steeringPosition', label: 'ハンドル位置', type: 'select', options: STEERING_POSITION_OPTIONS },
  { key: 'options', label: 'オプション', type: 'text' },
  { key: 'orderRegisteredMonth', label: '登録月', type: 'text' },
  { key: 'staff', label: '担当者', type: 'text' },
  { key: 'customer', label: '顧客', type: 'text' },
  { key: 'tradeIn', label: '下取車の有無', type: 'select', options: YES_NO_OPTIONS },
  { key: 'oss', label: 'OSS登録の可否', type: 'select', options: OSS_OPTIONS },
  { key: 'insurance', label: '保険加入の有無', type: 'select', options: YES_NO_OPTIONS },
  { key: 'orderedAt', label: '受注確定日時', type: 'datetime' }
];

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

// ===== Script Properties キー（3.6 設定機能） =====
var PROP_KEYS = {
  THEME_COLOR: 'THEME_COLOR',
  NOTIFY_HOLD_MAIL_TO: 'NOTIFY_HOLD_MAIL_TO',
  NOTIFY_ORDER_MAIL_TO: 'NOTIFY_ORDER_MAIL_TO'
};

var DEFAULT_THEME_COLOR = '#1a73e8'; // Material Design Blue 600
