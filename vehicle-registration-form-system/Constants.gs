/**
 * Constants.gs
 * 新車新規登録依頼書 発行システム 共通定数定義（SPEC.md 対応）
 */

var TIMEZONE = 'Asia/Tokyo';

var TYPE_OSS = 'OSS';
var TYPE_PAPER = '紙';
var TYPE_GYOSEI = '行政書士';

// 8行目から MAX_VEHICLES 台分 + その直後の合計行、というレイアウト。
// 印刷時に余白なく大きな文字で収まるよう15台に抑えている(以前は19台だった)。
var MAX_VEHICLES = 15;
var VEHICLE_START_ROW = 8;
var TOTAL_ROW = VEHICLE_START_ROW + MAX_VEHICLES; // 合計行(自動車税・環境性能割・重量税をSUMする)

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
//
// 【配置の考え方(業務フロー順)】
//   1〜2行目(タイトル行) : 担当責任者・依頼日(誰が・いつ依頼したか。タイトル右側にまとめる)
//   3行目               : 依頼事項(最重要・単独の大きな行)
//   4行目               : 顧客名・登録日(依頼事項の次に重要なので強調表示)
//   5行目               : 封印取付日・車両所在(現場作業で確認する情報)
//   6行目               : 依頼拠点・担当者(社内の事務情報なので最後)
var GYOSEI_CELLS = {
  gyoseiClass: 'B3',       // 依頼事項(他の項目より重要度が高いため、一番上に大きめで表示する)
  manager: 'E1',           // 担当責任者(タイトル行にまとめて表示)
  requestDate: 'E2',       // 依頼日(=申請フォームの「送付日」を流用。タイトル行にまとめて表示)
  customerName: 'B4',      // 顧客名(依頼事項の次に重要なので強調表示)
  regDate: 'E4',           // 登録日(同上)
  sealDate: 'B5',          // 封印取付日
  vehicleLocation: 'E5',   // 車両所在
  branch: 'B6',            // 依頼拠点
  salesPerson: 'E6'        // 担当者(担当セールス)
};

// 「顧客名」「登録日」を通常項目より目立たせるための背景色(依頼事項の青とは区別する)
var GYOSEI_EMPHASIS_FILL = '#FFF3CD';

// 行政書士依頼書の「依頼事項」の選択肢。
var GYOSEI_CLASS_OPTIONS = ['車庫証明申請から登録', '登録（車庫証明別途依頼済）'];

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
var GYOSEI_CHECKLIST_HEADER_ROW = 9; // 項目/チェック/備考の見出し行(依頼情報が4〜6行目の3行に収まった分、繰り上がっている)
var GYOSEI_CHECKLIST_START_ROW = 10; // 1項目目の行(以降1行につき1項目)
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
    hidaBadge: 'A1', // 飛騨登録バッジ(banner左上、通常は空欄)
    changeRequestBadge: 'K1' // 変更依頼バッジ(banner右端寄り、種別バッジのすぐ左。通常は空欄)
  },
  PAPER: {
    sendDate: 'B3',
    regDateCommon: 'E3',
    sendBatch: 'H3', // 「第」の値欄(数字のみ)。隣の固定「第」「便」と並べて「第１便」に見える
    company: 'L3',
    manager: 'L5',
    hidaBadge: 'A1', // 飛騨登録バッジ(banner左上、通常は空欄)
    changeRequestBadge: 'J1' // 変更依頼バッジ(banner右端寄り、種別バッジのすぐ左。通常は空欄)
  }
};

// 飛騨登録バッジの配色(通常は非表示。該当申請のときだけ目立つ色で塗る)
var HIDA_BADGE_COLOR = { bg: '#F9AB00', text: '#202124' }; // Google Yellow

// 変更依頼バッジの配色(通常は非表示。登録日・送付便を変更して再発行したPDFにだけ表示する)
var CHANGE_REQUEST_BADGE_LABEL = '変更依頼';
var CHANGE_REQUEST_BADGE_COLOR = { bg: '#D0342C', text: '#FFFFFF' }; // 朱色(警告色、飛騨登録の黄色と区別する)

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
// 見出しは折り返しなしの1行表示にしているため、「予備検登録車」「環境性能割」
// 「身障者減免車」等の5〜6文字の見出しが太字10ptでも見切れない幅を確保している。
// ただし列の合計幅はA4横1ページに収まる範囲に抑える必要があるため(広げすぎると
// 用紙からはみ出して横に見切れる)、見出しがぎりぎり収まる程度の控えめな値に
// とどめている(全体をむやみに広げず、MAX_VEHICLES削減で生まれた余白はscale=4の
// 自動拡大に委ねる)。
var FIELD_WIDTHS = {
  indivRegDate: 62,
  userName: 132,
  brand: 64,
  chassis: 64,
  model: 95,
  classNum: 95,
  autoTax: 68,
  envTax: 80,
  weightTax: 62,
  hopeNum: 92,
  yobi: 92,
  honken: 80,
  shinsho: 92,
  person: 70
};

var TAX_LABELS = {
  autoTax: '自動車税',
  envTax: '環境性能割',
  weightTax: '重量税'
};

// 数値項目のキー(ダッシュボード風に金額を右寄せするため、SetupService.gs で使用)
var NUMERIC_FIELD_KEYS = ['autoTax', 'envTax', 'weightTax'];

// 履歴タブ（月次）のヘッダー行。A〜Z の26列。
// 「飛騨登録」「送付書PDF」「状態」「取消日時」「変更依頼」は末尾に追記
// (既存タブの列インデックスをずらさないため)。
var HISTORY_HEADER_ROW = [
  '送信日時', 'submissionId', '種別', '依頼会社名', '担当責任者',
  '登録日', '送付日', '送付便', '車両No.', '使用者名', 'ブランド', '車台番号',
  '型式', '類別番号', '自動車税', '環境性能割', '重量税',
  '希望ナンバー', '予備検登録車', '本検登録車', '身障者減免車', '担当者', '飛騨登録',
  '依頼事項', '依頼拠点', '封印取付日', '車両所在',
  '送付書PDF', '状態', '取消日時', '変更依頼'
];

// 履歴の「状態」列の値
var SUBMISSION_STATUS_ACTIVE = '有効';
var SUBMISSION_STATUS_CANCELLED = '取消';
