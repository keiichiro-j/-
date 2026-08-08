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
// A列・B列を空白マージンとして予約するのをやめ、A列から詰めて配置している。
var COMMON_CELLS = {
  company: 'C2',
  manager: 'C3',
  sendDate: 'C4',
  sendBatch: 'F4',
  regDateCommon: 'C5' // 紙登録のみ使用
};

// 送付便の選択肢（ドロップダウン）
var SEND_BATCH_OPTIONS = ['第１便', '第２便', '第３便'];

// 車両のブランド区分の選択肢（ドロップダウン。任意項目、未選択も許容する）
var BRAND_OPTIONS = ['MB', 'AU'];

// 車両1台分のフィールド -> 列番号（テンプレートのセル位置。OSS/紙でずれる）
// 旧実装は実物の紙の依頼書に合わせて歯抜けの列番号だったが、実物が無いため連番に詰めている。
// A列から詰めており、余白マージン列は設けていない。
var VEHICLE_COLUMNS = {
  OSS: {
    indivRegDate: 1,  // A: 登録日
    userName: 2,      // B: 使用車名
    brand: 3,          // C: ブランド(MB/AU)
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
  },
  PAPER: {
    userName: 1,       // A: 使用車名
    brand: 2,           // B: ブランド(MB/AU)
    chassis: 3,          // C: 車台番号
    model: 4,             // D: 型式
    classNum: 5,           // E: 類別番号
    autoTax: 6,             // F: 自動車税
    envTax: 7,               // G: 環境性能割
    weightTax: 8,             // H: 重量税
    hopeNum: 9,               // I: 希望ナンバー
    yobi: 10,                 // J: 予備検登録車
    honken: 11,               // K: 本検登録車
    shinsho: 12,              // L: 身障者減免車
    person: 13                // M: 担当者
  }
};

// 車両欄の列ごとの推奨幅(px)。SetupService.gs のテンプレート生成で使用する。
// 印刷時の見切れを避けるため、2列分の見出しラベルが入る列は少し広めに取っている。
var FIELD_WIDTHS = {
  indivRegDate: 62,
  userName: 132,
  brand: 56,
  chassis: 76,
  model: 102,
  classNum: 104,
  autoTax: 72,
  envTax: 76,
  weightTax: 72,
  hopeNum: 62,
  yobi: 62,
  honken: 62,
  shinsho: 62,
  person: 78
};

var TAX_LABELS = {
  autoTax: '自動車税',
  envTax: '環境性能割',
  weightTax: '重量税'
};

// 数値項目のキー(ダッシュボード風に金額を右寄せするため、SetupService.gs で使用)
var NUMERIC_FIELD_KEYS = ['autoTax', 'envTax', 'weightTax'];

// 履歴タブ（月次）のヘッダー行。A〜V の22列。
var HISTORY_HEADER_ROW = [
  '送信日時', 'submissionId', '種別', '依頼会社名', '担当責任者',
  '登録日', '送付日', '送付便', '車両No.', '使用車名', 'ブランド', '車台番号',
  '型式', '類別番号', '自動車税', '環境性能割', '重量税',
  '希望ナンバー', '予備検登録車', '本検登録車', '身障者減免車', '担当者'
];
