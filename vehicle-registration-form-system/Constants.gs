/**
 * Constants.gs
 * 新車新規登録依頼書 発行システム 共通定数定義（SPEC.md 対応）
 */

var TIMEZONE = 'Asia/Tokyo';

var TYPE_OSS = 'OSS';
var TYPE_PAPER = '紙';
var TYPE_GYOSEI = '行政書士';

// 8〜26行目の19台分 + 27行目の合計行、という実物サンプルのレイアウトに合わせている。
var MAX_VEHICLES = 19;
var VEHICLE_START_ROW = 8;
var TOTAL_ROW = 27; // 合計行(自動車税・環境性能割・重量税をSUMする)

// SPEC.md 8章「未確定事項」のうち、実装のために暫定で決めた値。
// 運用が固まったら見直す。
var SUGGESTION_MONTHS_BACK = 6; // サジェスト候補を収集する対象タブ数（直近何ヶ月分）
var PDF_ROOT_FOLDER_NAME = '依頼書PDF';
var HISTORY_PENDING_TAB_NAME = '登録日未定';

// テンプレートシート名（旧実装は末尾に不要な空白が入っており壊れやすかったため定数化）
var SHEET_NAMES = {
  OSS_TEMPLATE: '新車新規登録依頼書（書類送付書）OSS',
  PAPER_TEMPLATE: '新車新規登録依頼書（書類送付書）紙',
  GYOSEI_TEMPLATE: '行政書士依頼書' // SetupService.gs#buildGyoseiTemplateSheet_ が自動生成する
};

// 行政書士依頼書テンプレートのセル位置。OSS/紙と異なり車両テーブル形式ではなく、
// 1申請=1件(顧客名も1つ)の単票形式。SetupService.gs#buildGyoseiTemplateSheet_ の
// レイアウトと必ず一致させること。
//
// 【担当責任者 と 担当者 の違い】
//   担当責任者 = 申請フォームにログインしているアカウントの担当者(担当者マスタで紐付け。
//               新車登録のOSS/紙と共通のフィールドをそのまま流用する)
//   担当者     = 今回の案件を担当する営業(担当セールス)。行政書士登録でのみ入力する
//               独立した項目で、担当責任者とは別人のことが多い。
var GYOSEI_CELLS = {
  requestDate: 'B3',   // 依頼日(=申請フォームの「送付日」を流用)
  gyoseiClass: 'E3',   // 依頼事項
  branch: 'B4',        // 依頼拠点
  manager: 'E4',       // 担当責任者(ログインアカウントに紐づく。申請フォームの「担当責任者」を流用)
  salesPerson: 'B5',   // 担当者(担当セールス)
  customerName: 'E5',  // 顧客名
  regDate: 'B6',       // 登録日
  sealDate: 'E6',      // 封印取付日
  vehicleLocation: 'B7' // 車両所在
};

// 行政書士依頼書の「依頼事項」の選択肢。
var GYOSEI_CLASS_OPTIONS = ['車庫証明申請', '車庫証明申請から登録', '登録（車庫証明別途依頼済）'];

// 提出書類チェックリスト(SetupService.gs#buildGyoseiChecklistTable_ が1項目=1行のテーブルを
// 生成する)。各項目にチェック(✔)欄と備考欄を1つずつ持つ。key はフォームデータ
// (formData.gyoseiChecklist)・履歴記録には使わない内部識別子。
var GYOSEI_CHECKLIST_ITEMS = [
  { key: 'completionCert', label: '完成検査証' },
  { key: 'transferCert', label: '譲渡証明書' },
  { key: 'sealCert', label: '印鑑証明証' },
  { key: 'residentCert', label: '住民票' },
  { key: 'powerOfAttorney', label: '委任状' },
  { key: 'garageCert', label: '車庫証明書' },
  { key: 'insuranceCert', label: '自賠責保険証明書' },
  { key: 'plateReservation', label: '希望番号予約済証' }
];
var GYOSEI_CHECKLIST_HEADER_ROW = 10; // 項目/チェック/備考の見出し行(車両所在の行が増えた分、1行繰り下げ)
var GYOSEI_CHECKLIST_START_ROW = 11; // 1項目目の行(以降1行につき1項目)
var GYOSEI_CHECKLIST_CHECK_COL = 2;  // B列: チェック(✔)
var GYOSEI_CHECKLIST_REMARK_COL = 3; // C列(〜F列を結合): 備考
var CHECKBOX_MARK = '✔'; // チェックリストの「チェック済み」マーク

// 共通項目のセル位置。ユーザー提供のサンプルデザイン(Numbersファイル)に合わせた
// 「固定ラベル(左)+空欄の値欄(右)」方式。sendBatchには「第」を除いた数字部分だけを
// 書き込む(隣の固定「第」ラベル・固定「便」ラベルと並べて「第１便」に見えるようにする)。
// OSS/紙で列数(maxCol)が異なるため、セル位置は種別ごとに分けている。
// SetupService.gs の buildOssCommonFields_ / buildPaperCommonFields_ と必ず一致させること。
var COMMON_CELLS = {
  OSS: {
    sendDate: 'E3',
    sendBatch: 'H3', // 「第」の値欄(数字のみ)。隣の固定「第」「便」と並べて「第１便」に見える
    company: 'L3',
    manager: 'L5',
    hidaBadge: 'A1' // 飛騨登録バッジ(banner左上、通常は空欄)
  },
  PAPER: {
    sendDate: 'B3',
    regDateCommon: 'E3',
    sendBatch: 'H3', // 「第」の値欄(数字のみ)。隣の固定「第」「便」と並べて「第１便」に見える
    company: 'L3',
    manager: 'L5',
    hidaBadge: 'A1' // 飛騨登録バッジ(banner左上、通常は空欄)
  }
};

// 飛騨登録バッジの配色(通常は非表示。該当申請のときだけ目立つ色で塗る)
var HIDA_BADGE_COLOR = { bg: '#F9AB00', text: '#202124' }; // Google Yellow

// 送付便の選択肢（ドロップダウン）
var SEND_BATCH_OPTIONS = ['第１便', '第２便', '第３便'];

// 車両のブランド区分の選択肢(ドロップダウン。任意項目、未選択も許容する)は「設定」画面で
// 変更でき、実際に使われる値は BrandService.gs の getBrandOptions_() から取得する
// (未設定=初回起動時の初期値も BrandService.gs 側で持つ)。

// 車両1台分のフィールド -> 列番号（テンプレートのセル位置。OSS/紙でずれる）
// 旧実装は実物の紙の依頼書に合わせて歯抜けの列番号だったが、実物が無いため連番に詰めている。
// A列から詰めており、余白マージン列は設けていない。
var VEHICLE_COLUMNS = {
  OSS: {
    indivRegDate: 1,  // A: 登録日
    userName: 2,      // B: 使用者名
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
    userName: 1,       // A: 使用者名
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

// 履歴タブ（月次）のヘッダー行。A〜Z の26列。
// 「飛騨登録」「送付書PDF」「状態」「取消日時」は末尾に追記
// (既存タブの列インデックスをずらさないため)。
var HISTORY_HEADER_ROW = [
  '送信日時', 'submissionId', '種別', '依頼会社名', '担当責任者',
  '登録日', '送付日', '送付便', '車両No.', '使用者名', 'ブランド', '車台番号',
  '型式', '類別番号', '自動車税', '環境性能割', '重量税',
  '希望ナンバー', '予備検登録車', '本検登録車', '身障者減免車', '担当者', '飛騨登録',
  '依頼事項', '依頼拠点', '封印取付日', '車両所在',
  '送付書PDF', '状態', '取消日時'
];

// 履歴の「状態」列の値
var SUBMISSION_STATUS_ACTIVE = '有効';
var SUBMISSION_STATUS_CANCELLED = '取消';
