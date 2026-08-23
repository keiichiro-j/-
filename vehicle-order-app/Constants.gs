/**
 * Constants.gs
 * 販売可能リスト 共通定数定義
 *
 * スプレッドシートは3タブ構成：
 *   在庫リスト … 車両情報＋Holdステータスのみ
 *   Holdリスト … Hold（1st/2nd）の入力項目・開始日時・期限（車両情報とは別テーブル）
 *   受注リスト … 受注確定時に転記される車両情報＋入力項目
 */

// ===== シート名 =====
var SHEET_NAMES = {
  INVENTORY: '在庫リスト',
  HOLDS: 'Holdリスト',
  ORDERS: '受注リスト',
  AUDIT_LOG: '変更履歴'
};

// ===== Hold 関連 =====
var HOLD_DURATION_MS = 72 * 60 * 60 * 1000; // Hold期間 72時間

var HOLD_STATUS = {
  AVAILABLE: 'available',
  HOLD: 'hold'
};

var HOLD_RANK = {
  FIRST: '1st',
  SECOND: '2nd'
};

// ===== 選択肢 =====
var STEERING_OPTIONS = ['右', '左'];
var STOCK_DISCLOSURE_OPTIONS = ['開示', '非開示'];
var YES_NO_OPTIONS = ['あり', 'なし'];
var OSS_OPTIONS = ['可', '不可'];
var PAYMENT_METHOD_OPTIONS = ['現金', 'ローン'];
var PAID_OPTION_SLOT_COUNT = 7; // 有償オプション（7マス分確保）
var STAFF_LIST_MAX = 30; // 担当者マスタの最大登録人数
var MODEL_PHOTOS_MAX = 30; // ホーム画面のモデル写真の最大登録数

/**
 * 車両情報（在庫リスト・受注リストで共通）の列定義。
 * 「可能月」（入港予定日とVPCの間）は、当月と一致する車両を
 * 「当月登録可能車両」として画面上で強調表示するために使う（JavaScript.html参照）。
 */
var VEHICLE_COLUMNS = [
  { key: 'model', label: 'モデル', type: 'text', required: true },
  { key: 'mp', label: 'MP', type: 'text' },
  { key: 'steering', label: 'ステア', type: 'select', options: STEERING_OPTIONS },
  { key: 'exteriorColor', label: '外装', type: 'text' },
  { key: 'interiorColor', label: '内装', type: 'text' }
].concat((function () {
  var slots = [];
  for (var i = 1; i <= PAID_OPTION_SLOT_COUNT; i++) {
    slots.push({ key: 'paidOption' + i, label: '有償OP' + i, type: 'text' });
  }
  return slots;
})()).concat([
  { key: 'commission', label: 'コミッション', type: 'text', required: true },
  { key: 'arrivalExpectedDate', label: '入港予定日', type: 'date' },
  { key: 'registrableMonth', label: '可能月', type: 'text' }, // 例: 2026-08（月の書式で入力）
  { key: 'vpc', label: 'VPC', type: 'text' },
  { key: 'stockDisclosure', label: '在庫開示', type: 'select', options: STOCK_DISCLOSURE_OPTIONS }
]);

var PAID_OPTION_KEYS = VEHICLE_COLUMNS
  .filter(function (c) { return /^paidOption\d+$/.test(c.key); })
  .map(function (c) { return c.key; });

/**
 * Hold（予約）・受注確定の共通入力項目。
 * 販売拠点／リード番号／登録月／担当者／顧客／下取車の有無／OSS登録の可否／保険加入の有無。
 * すべて必須（Hold登録・受注確定は全項目入力しないと進められない）。
 * 販売拠点はHold登録時、担当者マスタに登録された担当者本人の拠点名から自動的に
 * 入力される（編集可。JavaScript.html の currentStaffLocation_ 参照）。
 */
var HOLD_ORDER_INPUT_COLUMNS = [
  { key: 'salesLocation', label: '販売拠点', type: 'text', required: true },
  { key: 'leadNumber', label: 'リード番号', type: 'text', required: true },
  { key: 'registeredMonth', label: '登録月', type: 'text', required: true },
  { key: 'staff', label: '担当者', type: 'text', required: true }, // 担当者マスタから選択（SettingsService参照）
  { key: 'customer', label: '顧客', type: 'text', required: true },
  { key: 'tradeIn', label: '下取車の有無', type: 'select', options: YES_NO_OPTIONS, required: true },
  { key: 'oss', label: 'OSS登録の可否', type: 'select', options: OSS_OPTIONS, required: true },
  { key: 'insurance', label: '保険加入の有無', type: 'select', options: YES_NO_OPTIONS, required: true },
  { key: 'paymentMethod', label: '支払方法', type: 'select', options: PAYMENT_METHOD_OPTIONS, required: true }
];

/**
 * 在庫リスト列定義（順序 = スプレッドシートの列順）。
 * 車両情報＋Holdステータスのみ。Holdの詳細はHoldリストで別管理する。
 */
var INVENTORY_COLUMNS = VEHICLE_COLUMNS.concat([
  { key: 'holdStatus', label: 'Holdステータス', type: 'select', options: [HOLD_STATUS.AVAILABLE, HOLD_STATUS.HOLD] }
]);

/**
 * Holdリスト列定義。1台の車両につき 1st Hold・2nd Hold それぞれ1行（最大2行）。
 * commission + rank で一意に特定する。
 */
var HOLD_COLUMNS = [
  { key: 'commission', label: 'コミッション', type: 'text', required: true },
  { key: 'rank', label: '順番', type: 'select', options: [HOLD_RANK.FIRST, HOLD_RANK.SECOND], required: true }
].concat(HOLD_ORDER_INPUT_COLUMNS).concat([
  // 担当者メール（staffEmail）は表示名「担当者」ではなく、ログイン中のGoogleアカウントの
  // メールアドレスで本人確認を行うための識別キー（canConfirmOrder_ / canCancelHold_ /
  // canRegisterSecondHold_ 参照）。「担当者」名は表示用の別名に過ぎず編集され得るため、
  // 権限判定には必ずこちらを使う。
  { key: 'staffEmail', label: '担当者メール', type: 'text' },
  { key: 'createdAt', label: '開始日時', type: 'datetime' },
  { key: 'expiresAt', label: '期限', type: 'datetime' },
  // Hold登録者本人のGoogleカレンダーに作成した期限リマインドイベントのID。
  // Hold解除・受注確定時に、このIDを使って該当イベントを削除する（CalendarService.gs参照）。
  { key: 'calendarEventId', label: 'カレンダーイベントID', type: 'text' }
]);

/**
 * 受注リスト列定義。車両情報＋Hold・受注共通入力項目（販売拠点を含む）＋受注確定日時。
 */
var ORDER_COLUMNS = VEHICLE_COLUMNS.concat(HOLD_ORDER_INPUT_COLUMNS).concat([
  { key: 'staffEmail', label: '担当者メール', type: 'text' },
  { key: 'orderedAt', label: '受注確定日時', type: 'datetime' }
]);

/**
 * 変更履歴（監査ログ）列定義。Hold登録・2nd Hold登録・Hold解除（手動・自動）・
 * 受注確定のたびに1行追記する。「誰が・いつ・何を」の記録専用で、更新・削除は行わない
 * （AuditLogService.gs参照）。
 */
var AUDIT_LOG_COLUMNS = [
  { key: 'timestamp', label: '日時', type: 'datetime' },
  { key: 'action', label: '操作', type: 'text' },
  { key: 'commission', label: 'コミッション', type: 'text' },
  { key: 'model', label: 'モデル', type: 'text' },
  { key: 'staffName', label: '担当者', type: 'text' },
  { key: 'staffEmail', label: '担当者メール', type: 'text' },
  { key: 'detail', label: '詳細', type: 'text' }
];

var INVENTORY_HEADER_ROW = INVENTORY_COLUMNS.map(function (c) { return c.label; });
var HOLD_HEADER_ROW = HOLD_COLUMNS.map(function (c) { return c.label; });
var ORDER_HEADER_ROW = ORDER_COLUMNS.map(function (c) { return c.label; });
var AUDIT_LOG_HEADER_ROW = AUDIT_LOG_COLUMNS.map(function (c) { return c.label; });

var INVENTORY_COL_INDEX = buildColIndex_(INVENTORY_COLUMNS);
var HOLD_COL_INDEX = buildColIndex_(HOLD_COLUMNS);
var ORDER_COL_INDEX = buildColIndex_(ORDER_COLUMNS);
var AUDIT_LOG_COL_INDEX = buildColIndex_(AUDIT_LOG_COLUMNS);

function buildColIndex_(columns) {
  var map = {};
  columns.forEach(function (c, i) { map[c.key] = i; }); // 0-indexed
  return map;
}

function inventoryColIndex1(key) {
  return INVENTORY_COL_INDEX[key] + 1; // 1-indexed（Range操作用）
}

function holdColIndex1(key) {
  return HOLD_COL_INDEX[key] + 1;
}

function orderColIndex1(key) {
  return ORDER_COL_INDEX[key] + 1;
}

function auditLogColIndex1(key) {
  return AUDIT_LOG_COL_INDEX[key] + 1;
}

// ===== Script Properties キー（設定機能） =====
var PROP_KEYS = {
  THEME_COLOR: 'THEME_COLOR',
  TEXT_COLOR: 'TEXT_COLOR',
  LOGO_URL: 'LOGO_URL',
  NOTIFY_HOLD_MAIL_TO: 'NOTIFY_HOLD_MAIL_TO',
  NOTIFY_ORDER_MAIL_TO: 'NOTIFY_ORDER_MAIL_TO',
  NOTIFY_ERROR_MAIL_TO: 'NOTIFY_ERROR_MAIL_TO',
  STAFF_LIST: 'STAFF_LIST',
  MODEL_PHOTOS: 'MODEL_PHOTOS'
};

var DEFAULT_THEME_COLOR = '#3870b0'; // ラグジュアリーブラック配色のスチールブルーアクセント（白文字とのコントラスト比4.5:1以上を確保）
var DEFAULT_TEXT_COLOR = '#f2f1ed'; // 基本の文字色（黒基調の背景に合わせた明るいオフホワイト）

// ロゴ（画像URL、またはアップロード時のdata URL）の最大文字数。
// Script Propertiesは1プロパティあたり9KB（=9216文字程度）が上限のため、
// 余裕を持ってこの文字数を超える場合は保存時にエラーにする（SettingsService.gs参照）。
var LOGO_URL_MAX_LENGTH = 9000;

// モデル写真1件あたりのURLの最大文字数（署名付きURL等、長めの共有リンクにも
// 対応できるようある程度余裕を持たせている。data URLではなく外部URLの利用を
// 前提とする。SettingsService.gs参照）。
var MODEL_PHOTO_URL_MAX_LENGTH = 1500;

// モデル写真設定全体（JSON化した状態）の最大文字数。最大MODEL_PHOTOS_MAX件分の
// URLをまとめて1つのScript Propertyへ保存するため、1件あたりの上限だけでは
// 「件数×上限文字数」が実際の保存上限（1プロパティあたり9KB＝9216文字程度）を
// 超えてしまう可能性がある。そのため合計文字数についても余裕を持った上限で
// 別途チェックする（SettingsService.gs参照）。
var MODEL_PHOTOS_TOTAL_MAX_LENGTH = 8000;
