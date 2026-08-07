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

// 共通項目のセル位置（会社名・担当責任者は横幅いっぱいの結合セル、日付は「M/D」形式の単一セル）
var COMMON_CELLS = {
  company: 'E2',
  manager: 'E3',
  sendDate: 'E4',
  regDateCommon: 'E5' // 紙登録のみ使用
};

// 車両1台分のフィールド -> 列番号（テンプレートのセル位置。OSS/紙でずれる）
// 旧実装は実物の紙の依頼書に合わせて歯抜けの列番号だったが、実物が無いため連番に詰めている。
var VEHICLE_COLUMNS = {
  OSS: {
    indivRegDate: 3,  // C: 登録日
    userName: 4,      // D: 使用車名
    chassis: 5,       // E: 車台番号
    model: 6,         // F: 型式
    classNum: 7,       // G: 類別番号
    autoTax: 8,        // H: 自動車税
    envTax: 9,         // I: 環境性能割
    weightTax: 10,     // J: 重量税
    hopeNum: 11,       // K: 希望ナンバー
    yobi: 12,          // L: 予備検登録車
    honken: 13,        // M: 本検登録車
    shinsho: 14,       // N: 身障者減免車
    person: 15         // O: 担当者
  },
  PAPER: {
    userName: 3,       // C: 使用車名
    chassis: 4,        // D: 車台番号
    model: 5,          // E: 型式
    classNum: 6,        // F: 類別番号
    autoTax: 7,          // G: 自動車税
    envTax: 8,           // H: 環境性能割
    weightTax: 9,        // I: 重量税
    hopeNum: 10,         // J: 希望ナンバー
    yobi: 11,            // K: 予備検登録車
    honken: 12,          // L: 本検登録車
    shinsho: 13,         // M: 身障者減免車
    person: 14           // N: 担当者
  }
};

// 車両欄の列ごとの推奨幅(px)。SetupService.gs のテンプレート生成で使用する。
var FIELD_WIDTHS = {
  indivRegDate: 58,
  userName: 130,
  chassis: 72,
  model: 100,
  classNum: 100,
  autoTax: 68,
  envTax: 72,
  weightTax: 68,
  hopeNum: 56,
  yobi: 56,
  honken: 56,
  shinsho: 56,
  person: 74
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
