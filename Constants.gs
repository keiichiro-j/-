/**
 * Constants.gs
 * 車両在庫管理アプリ 共通定数定義
 *
 * ビジョン文書 5.2 の管理項目のうち「仕入区分」は No.10 / No.19 で重複記載されているため、
 * 本実装では 1 列に統合し、選択肢は No.19 の指定（買取／仕入／下取／オークション）を採用する。
 */

// ===== タブ（シート）名 =====
var TAB_NAMES = {
  IMPORTED: '輸入車',
  DOMESTIC: '国産車',
  SOLD: '販売済'
};

// 拠点切替表示・横断表示の対象となる「在庫」タブ（販売済は在庫から除外）
var STOCK_TAB_NAMES = [TAB_NAMES.IMPORTED, TAB_NAMES.DOMESTIC];
var ALL_TAB_NAMES = [TAB_NAMES.IMPORTED, TAB_NAMES.DOMESTIC, TAB_NAMES.SOLD];

// ===== ステータス =====
var STATUS_OPTIONS = [
  '書類待ち',
  '車庫証明申請中',
  '名義変更中',
  '名義変更済み',
  '抹消登録済み',
  '販売済み'
];
var STATUS_SOLD = '販売済み';
var STATUS_NAME_TRANSFERRED = '名義変更済み';

// ===== 仕入区分 =====
var PURCHASE_TYPE_OPTIONS = ['買取', '仕入', '下取', 'オークション'];

// ===== 車検満了日 通知しきい値（日数） =====
var EXPIRY_NOTICE_DAYS = [30, 7]; // 1ヶ月前・1週間前

/**
 * 列定義（順序 = スプレッドシートの列順）
 * key: プログラム内部で使用するキー
 * label: シートのヘッダー表記
 * type: 'text' | 'date' | 'number' | 'select' | 'link'
 */
var COLUMNS = [
  { key: 'ocn', label: 'OCN', type: 'text', required: true },
  { key: 'purchaseDate', label: '仕入日', type: 'date' },
  { key: 'carType', label: '車種', type: 'text', required: true },
  { key: 'model', label: 'モデル', type: 'text' },
  { key: 'chassisNumber', label: '車台番号', type: 'text', required: true },
  { key: 'firstRegistrationDate', label: '初年度登録', type: 'date' },
  { key: 'inspectionExpiryDate', label: '車検満了日', type: 'date' },
  { key: 'color', label: 'カラー', type: 'text' },
  { key: 'mileage', label: '走行距離', type: 'number' },
  { key: 'purchaseType', label: '仕入区分', type: 'select', options: PURCHASE_TYPE_OPTIONS },
  { key: 'staff', label: '担当者', type: 'text' },
  { key: 'supplier', label: '仕入先', type: 'text' },
  { key: 'address', label: '住所', type: 'text' },
  { key: 'plateRegion', label: '登録番号（地域）', type: 'text', required: true },
  { key: 'plateClass', label: '登録番号（分類番号）', type: 'text', required: true },
  { key: 'plateKana', label: '登録番号（ひらがな）', type: 'text', required: true },
  { key: 'plateNumber', label: '登録番号（一連番号）', type: 'text', required: true },
  { key: 'status', label: 'ステータス', type: 'select', options: STATUS_OPTIONS },
  { key: 'appraisalAmount', label: '査定額', type: 'number' },
  { key: 'purchaseAmount', label: '買取金額', type: 'number' },
  { key: 'tradeInLoss', label: '下取損', type: 'number' },
  { key: 'recycleFee', label: 'リサイクル金額', type: 'number' },
  { key: 'soldMonth', label: '販売年月', type: 'text' },
  { key: 'soldTo', label: '販売先', type: 'text' },
  { key: 'inspectionCertLink', label: '車検証リンク', type: 'link' },
  { key: 'ownCertLink', label: '自社名義車検証リンク', type: 'link' }
];

var HEADER_ROW = COLUMNS.map(function (c) { return c.label; });
var COL_INDEX = (function () {
  var map = {};
  COLUMNS.forEach(function (c, i) { map[c.key] = i; }); // 0-indexed
  return map;
})();

function colIndex1(key) {
  // 1-indexed（Range 操作用）
  return COL_INDEX[key] + 1;
}

// ===== Script Properties キー =====
var PROP_KEYS = {
  COMPANIES: 'COMPANIES_CONFIG', // JSON文字列: [{id,name,sheetId,pdfFolderId,appraisalFolderId}, ...]
  OCR_SPACE_API_KEY: 'OCR_SPACE_API_KEY',
  VISION_API_KEY: 'VISION_API_KEY',
  SLACK_WEBHOOK_URL: 'SLACK_WEBHOOK_URL',
  NOTIFY_MAIL_TO: 'NOTIFY_MAIL_TO',
  PROCESSED_PDF_IDS: 'PROCESSED_PDF_IDS_' // + companyId
};
