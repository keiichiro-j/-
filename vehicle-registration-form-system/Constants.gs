/**
 * Constants.gs
 * 新車新規登録依頼書 発行システム 共通定数定義（SPEC.md 対応）
 */

var TIMEZONE = 'Asia/Tokyo';

var TYPE_OSS = 'OSS';
var TYPE_PAPER = '紙';

var MAX_VEHICLES = 10;
var VEHICLE_START_ROW = 8;

// SPEC.md 8章「未確定事項」のうち、実装のために暫定で決めた値。
// 運用が固まったら見直す。
var SUGGESTION_MONTHS_BACK = 6; // サジェスト候補を収集する対象タブ数（直近何ヶ月分）
var PDF_ROOT_FOLDER_NAME = '依頼書PDF';
var HISTORY_PENDING_TAB_NAME = '登録日未定';

// テンプレートシート名（旧実装は末尾に不要な空白が入っており壊れやすかったため定数化）
var SHEET_NAMES = {
  OSS_TEMPLATE: '新車新規登録依頼書（書類送付書）OSS',
  PAPER_TEMPLATE: '新車新規登録依頼書（書類送付書）紙'
};

// 共通項目のセル位置
var COMMON_CELLS = {
  company: 'AE2',
  manager: 'AE3',
  sendDateMonth: 'AD5',
  sendDateDay: 'AE5',
  regDateCommonMonth: 'Q4',
  regDateCommonDay: 'V4'
};

// 車両1台分のフィールド -> 列番号（テンプレートのセル位置。OSS/紙でずれる）
var VEHICLE_COLUMNS = {
  OSS: {
    indivRegDate: 3,  // C: 登録日
    userName: 4,      // D: 使用車名
    chassis: 5,       // E: 車台番号
    model: 9,         // I: 型式
    classNum: 14,      // N: 類別番号
    autoTax: 18,       // R: 自動車税
    envTax: 22,        // V: 環境性能割
    weightTax: 27,     // AA: 重量税
    hopeNum: 31,       // AE: 希望ナンバー
    yobi: 32,          // AF: 予備検登録車
    honken: 33,        // AG: 本検登録車
    shinsho: 34,       // AH: 身障者減免車
    person: 35         // AI: 担当者
  },
  PAPER: {
    userName: 3,       // C: 使用車名
    chassis: 4,        // D: 車台番号
    model: 8,          // H: 型式
    classNum: 13,       // M: 類別番号
    autoTax: 17,        // Q: 自動車税
    envTax: 21,         // U: 環境性能割
    weightTax: 26,      // Z: 重量税
    hopeNum: 30,        // AD: 希望ナンバー
    yobi: 31,           // AE: 予備検登録車
    honken: 32,         // AF: 本検登録車
    shinsho: 33,        // AG: 身障者減免車
    person: 34          // AH: 担当者
  }
};

var TAX_LABELS = {
  autoTax: '自動車税',
  envTax: '環境性能割',
  weightTax: '重量税'
};

// 履歴タブ（月次）のヘッダー行。A〜T の20列。
var HISTORY_HEADER_ROW = [
  '送信日時', 'submissionId', '種別', '依頼会社名', '担当責任者',
  '登録日', '送付日', '車両No.', '使用車名', '車台番号',
  '型式', '類別番号', '自動車税', '環境性能割', '重量税',
  '希望ナンバー', '予備検登録車', '本検登録車', '身障者減免車', '担当者'
];
