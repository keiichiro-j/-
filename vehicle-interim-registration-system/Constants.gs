/**
 * Constants.gs
 * 中間登録書類送付書 発行システム 共通定数定義。
 *
 * 元データ(岐阜県自動車登録代行センターの中間登録書類送付書、8シート)を分析した結果、
 * 実体は「登録証明・その他」「名義変更」「抹消」「番号変更」の4ファミリーであり、
 * 名義変更・抹消はそれぞれバリエーションフラグ(飛騨/軽自動車/複合・単純)違いに過ぎない
 * と判断した(既存の「新車新規登録依頼書 発行システム」のOSS/紙・飛騨登録トグルと同じ考え方)。
 *
 * 【8シート → 4ファミリーの対応】
 *   登録証明・その他                     → DOC_TYPE_CERTIFICATE
 *   名義変更 / 名義変更 飛騨 / 名義変更　軽 → DOC_TYPE_TRANSFER (isHida / isKei フラグ)
 *   複合抹消 / 単純抹消 / 抹消 軽          → DOC_TYPE_CANCELLATION (cancelKind / isKei フラグ)
 *   番号変更                             → DOC_TYPE_PLATE_CHANGE
 *
 * テンプレートシートの物理的な列位置(VEHICLE_COLUMNS 等)は、SetupService.gs で
 * テンプレートシートを自動生成するタイミングで、このファイルに追記する
 * (新車新規登録依頼書システムと同じく、実物のテンプレートが手元にないため
 * セル位置は生成時に決め、生成後に見た目を見ながら調整する方針)。
 */

var TIMEZONE = 'Asia/Tokyo';

// ---------- 書類種別(4ファミリー) ----------

var DOC_TYPE_CERTIFICATE = 'certificate';   // 登録証明・その他
var DOC_TYPE_TRANSFER = 'transfer';         // 名義変更
var DOC_TYPE_CANCELLATION = 'cancellation'; // 抹消
var DOC_TYPE_PLATE_CHANGE = 'plateChange';  // 番号変更

var DOC_TYPE_OPTIONS = [DOC_TYPE_CERTIFICATE, DOC_TYPE_TRANSFER, DOC_TYPE_CANCELLATION, DOC_TYPE_PLATE_CHANGE];

var DOC_TYPE_LABELS = {
  certificate: '登録証明・その他',
  transfer: '名義変更',
  cancellation: '抹消',
  plateChange: '番号変更'
};

// 書類ごとの依頼書タイトル(PDFのバナーに印字する。元データの1行目の文言をそのまま使う)。
var DOC_TYPE_TITLES = {
  certificate: '中間登録書類送付書（登録証明・その他用）',
  transfer: '中間登録書類送付書（名義変更用）',
  cancellation: '中間登録書類送付書（抹消用）',
  plateChange: '中間登録　番号変更のみ（移転、変更なし）登録依頼書'
};

// 発行元(元データのヘッダーにある固定文言)
var ISSUER_NAME = '岐阜県自動車登録代行センター';

// ---------- 名義変更: バリエーションフラグ ----------

var TRANSFER_REGION_STANDARD = 'standard'; // 通常
var TRANSFER_REGION_HIDA = 'hida';         // 飛騨(名義変更 飛騨シート)

// ---------- 抹消: バリエーションフラグ ----------

var CANCELLATION_KIND_COMPOUND = 'compound'; // 複合抹消
var CANCELLATION_KIND_SIMPLE = 'simple';     // 単純抹消

var CANCELLATION_KIND_LABELS = {
  compound: '複合抹消',
  simple: '単純抹消'
};

// ---------- 登録区分の選択肢(1台につき1つ選ぶ、既存システムの希望ナンバー等と同じ択一形式) ----------

// 名義変更の登録区分(元データ 名義変更シート 11行目)
var TRANSFER_CLASS_OPTIONS = ['T移転', 'W移転', '移転', '変更', '選択'];

// 名義変更の「記載変更・更正」(元データの注記:「どちらかを〇で囲って下さい」= 択一)
var TRANSFER_CORRECTION_OPTIONS = ['記載変更', '更正'];

// 抹消の登録区分(元データ 複合抹消/単純抹消シート、共通)
var CANCELLATION_CLASS_OPTIONS = ['T移転抹消', 'W移転抹消', '移転抹消', '変更抹消', '抹消', '永久抹消', '届け出', '払出', '先方'];

// 登録証明・その他の登録区分(元データ 8行目、3択)
var CERTIFICATE_CLASS_OPTIONS = ['登録証明', '詳細証明', '再交付'];

// ---------- 車両欄の最大行数(元データの通し番号の上限に合わせる) ----------

var MAX_ROWS = {
  certificate: 15,
  transfer: 20,
  cancellation: 20,
  plateChange: 5
};

// ---------- 送付便の選択肢(既存システムと共通) ----------

var SEND_BATCH_OPTIONS = ['第１便', '第２便', '第３便'];

// ---------- 履歴タブ(月次)のヘッダー行 ----------
// 4ファミリーぶんの項目を1つの表にまとめる(既存システムのHISTORY_HEADER_ROWと同じ考え方)。
// 該当しない項目は空欄になる(例: plateChangeの行にはtransferClassは入らない)。
// 「送付書PDF」「状態」「取消日時」は末尾に置き、将来の列追加時も既存タブの列インデックスが
// ずれないようにする。
var HISTORY_HEADER_ROW = [
  '送信日時', 'submissionId', '書類種別', 'バリエーション', '依頼会社名', '担当責任者',
  '登録日', '送付日', '送付便', '車両No.',
  '登録番号', '車台番号', '旧登録番号', '新登録番号',
  '登録区分', '記載変更・更正',
  '印紙', 'ナンバー代', '代書料', '環境性能割', '軽手数料', '代行料',
  '備考',
  '送付書PDF', '状態', '取消日時'
];

// 履歴の「状態」列の値(既存システムと共通)
var SUBMISSION_STATUS_ACTIVE = '有効';
var SUBMISSION_STATUS_CANCELLED = '取消';

// PDF保存先のドライブフォルダ名・「登録日未定」タブ名(既存システムと共通の考え方)
var PDF_ROOT_FOLDER_NAME = '中間登録書類送付書PDF';
var HISTORY_PENDING_TAB_NAME = '登録日未定';

// サジェスト収集の対象タブ数(直近何ヶ月分)
var SUGGESTION_MONTHS_BACK = 6;
