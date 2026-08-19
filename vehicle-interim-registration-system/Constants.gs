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
 * 送付日・送付便・登録日は(新車システムのOSSと異なり)申請共通の1項目として扱う
 * (ユーザー指示: 「送付日、登録日、便の設定です」)。飛騨登録は新車システムと同じ
 * トグルスイッチとして扱い、名義変更のときのバリエーション表示に反映する。
 *
 * 【印刷フォーマットは元データにできるだけ近づける】
 * 元の中間登録書類送付書(Numbersファイル)を再解析した結果、次の2点が視覚的な特徴だった:
 *   1. 登録区分などの選択項目は、選択肢の数だけ列を用意する「チェックボックス形式」
 *      (該当する列に〇を記入)であり、1列の選択式セルではなかった。
 *   2. 「送付日・送付便」と「依頼会社名」、「登録日」と「担当者名」がそれぞれ
 *      横並びで同じ行にまとまっていた(縦に積んだレイアウトではなかった)。
 * 入力フォーム自体は(デジタル化に合わせて)単一選択のままにしつつ、PDF出力側の
 * テンプレートはこの2点を再現し、選択された項目の列に〇を印字する。
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

// テンプレートシート名
var SHEET_NAMES = {
  certificate: '中間登録書類送付書（登録証明・その他）',
  transfer: '中間登録書類送付書（名義変更）',
  cancellation: '中間登録書類送付書（抹消）',
  plateChange: '中間登録書類送付書（番号変更）'
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

// ---------- 登録区分などの選択肢(1件につき1つ選ぶ、択一形式。印刷時はこの並び順でチェックボックス列になる) ----------

// 名義変更の登録区分(元データ 名義変更シート。「払出」「先方」を含め7択)
var TRANSFER_CLASS_OPTIONS = ['T移転', 'W移転', '移転', '変更', '選択', '払出', '先方'];

// 名義変更の「記載変更・更正」(元データの注記:「どちらかを〇で囲って下さい」。任意項目)
var TRANSFER_CORRECTION_OPTIONS = ['記載変更', '更正'];

// 抹消の登録区分(元データ 複合抹消/単純抹消シート、共通、9択)
var CANCELLATION_CLASS_OPTIONS = ['T移転抹消', 'W移転抹消', '移転抹消', '変更抹消', '抹消', '永久抹消', '届け出', '払出', '先方'];

// 登録証明・その他の登録区分(元データ、3択)
var CERTIFICATE_CLASS_OPTIONS = ['登録証明', '詳細証明', '再交付'];

// ---------- 送付便の選択肢(既存システムと共通) ----------

var SEND_BATCH_OPTIONS = ['第１便', '第２便', '第３便'];

// ---------- 飛騨登録バッジの配色(新車システムと同じ考え方) ----------

var HIDA_BADGE_COLOR = { bg: '#F9AB00', text: '#202124' };

// 軽自動車バッジの配色。実際の軽自動車ナンバープレート(黄色地に黒文字)に合わせてあり、
// 一目で軽自動車の申請だとわかるようにしている(飛騨登録がONのときはそちらの色を優先する)。
var KEI_BADGE_COLOR = { bg: '#FFD400', text: '#1A1A1A' };

// チェックボックス列に選択済みを示す記号(既存の新車システムの「〇」選択欄と統一)
var CHECKBOX_MARK = '〇';

// ==================== テンプレートシートの物理レイアウト ====================

var COMMON_CELLS = {
  titleRow: 1,           // 依頼書タイトル
  issuerRow: 2,           // 発行元(左) + バリエーション表示(右端セル)
  variantBadgeRow: 2,
  sendRow: 4,               // 送付日・送付便(左) + 依頼会社名(右) ※元データと同じく横並び1行
  regRow: 5,                 // 登録日(左) + 担当者名(右) ※横並び1行
  tableHeaderRow: 7,           // 明細欄の項目見出し行(登録区分などはここにグループ見出し)
  checkboxOptionRow: 8,          // チェックボックス項目の選択肢見出し行
  vehicleStartRow: 9               // 明細の1行目
};

// 明細欄の最大行数(元データの通し番号の上限に合わせる)
var MAX_ROWS = {
  certificate: 15,
  transfer: 20,
  cancellation: 20,
  plateChange: 5
};

// 合計行を持つファミリー(手数料を SUM する。元データで「合計」行があるのは名義変更・抹消のみ)
var HAS_TOTAL_ROW = {
  certificate: false,
  transfer: true,
  cancellation: true,
  plateChange: false
};

// 合計行の行番号(vehicleStartRow + MAX_ROWS[type])
function totalRowOf_(docType) {
  return COMMON_CELLS.vehicleStartRow + MAX_ROWS[docType];
}

// ---------- 明細欄の項目定義(印刷時の左→右の並び順) ----------
// チェックボックス形式にする項目(登録区分など)は CHECKBOX_OPTIONS に選択肢配列を登録すると、
// 選択肢の数だけ自動的に列を割り当てる(buildVehicleColumns_ 参照)。
var FIELD_ORDER = {
  certificate: ['regNumber', 'regClass', 'remarks'],
  transfer: ['regNumber', 'chassis', 'transferClass', 'correction', 'stamp', 'plateFee', 'agencyFee', 'envTax', 'keiFee', 'remarks'],
  cancellation: ['regNumber', 'chassis', 'cancelClass', 'stamp', 'agencyFee', 'keiFee', 'remarks'],
  plateChange: ['oldRegNumber', 'chassis', 'newRegNumber', 'agencyFee', 'stamp']
};

var CHECKBOX_OPTIONS = {
  regClass: CERTIFICATE_CLASS_OPTIONS,
  transferClass: TRANSFER_CLASS_OPTIONS,
  correction: TRANSFER_CORRECTION_OPTIONS,
  cancelClass: CANCELLATION_CLASS_OPTIONS
};

/**
 * FIELD_ORDER[docType] から、各項目の開始列・使用列数(チェックボックス項目は選択肢の数、
 * それ以外は1列)・明細欄全体の最終列を計算する。1列目は全ファミリー共通で「番号」。
 */
function buildVehicleColumnLayout_(docType) {
  var columns = {};
  var spans = {};
  var col = 2;
  FIELD_ORDER[docType].forEach(function (key) {
    var options = CHECKBOX_OPTIONS[key];
    var span = options ? options.length : 1;
    columns[key] = col;
    spans[key] = span;
    col += span;
  });
  return { columns: columns, spans: spans, maxCol: col - 1 };
}

// 車両(明細行)1件分のフィールド → 列番号・使用列数・ファミリーごとの最終列(いずれも起動時に算出)
var VEHICLE_COLUMNS = {};
var FIELD_SPANS = {};
var VEHICLE_MAX_COL = {};
DOC_TYPE_OPTIONS.forEach(function (docType) {
  var layout = buildVehicleColumnLayout_(docType);
  VEHICLE_COLUMNS[docType] = layout.columns;
  FIELD_SPANS[docType] = layout.spans;
  VEHICLE_MAX_COL[docType] = layout.maxCol;
});

/**
 * 共通項目バナー(送付日・送付便+依頼会社名、登録日+担当者名)の列split位置を計算する。
 * 1列目=左ラベル、左値をできるだけ均等割りした残り半分の起点に右ラベル、その後ろが右値。
 * ファミリーごとに明細欄の幅(maxCol)が大きく異なる(登録証明6列〜名義変更18列)ため、
 * 固定列ではなく比率で割り付ける。
 */
function bannerSplit_(maxCol) {
  var leftValueSpan = Math.max(1, Math.ceil((maxCol - 2) / 2));
  var rightLabelCol = 2 + leftValueSpan;
  var rightValueCol = rightLabelCol + 1;
  var rightValueSpan = Math.max(1, maxCol - rightValueCol + 1);
  return {
    leftValueCol: 2,
    leftValueSpan: leftValueSpan,
    rightLabelCol: rightLabelCol,
    rightValueCol: rightValueCol,
    rightValueSpan: rightValueSpan
  };
}

// 手数料など、合計行でSUMする数値項目(HAS_TOTAL_ROWがtrueのファミリーのみ使う。いずれもチェックボックス項目ではない)
var NUMERIC_FIELD_KEYS = {
  transfer: ['stamp', 'plateFee', 'agencyFee', 'envTax', 'keiFee'],
  cancellation: ['stamp', 'agencyFee', 'keiFee']
};

// 車両明細見出しラベル(テンプレート生成・PDF印字用。チェックボックス項目はグループ見出しとして使う)
var FIELD_LABELS = {
  certificate: { regNumber: '登録番号', regClass: '登録区分', remarks: '備考' },
  transfer: {
    regNumber: '登録番号', chassis: '車台番号\n(下4桁)', transferClass: '登録区分',
    correction: '記載変更\n・更正', stamp: '印紙', plateFee: 'ナンバー代', agencyFee: '代書料',
    envTax: '環境性能割', keiFee: '軽手数料', remarks: '備考'
  },
  cancellation: {
    regNumber: '登録番号', chassis: '車台番号\n(下4桁)', cancelClass: '登録区分',
    stamp: '印紙', agencyFee: '代書料', keiFee: '軽手数料', remarks: '備考\n(移動報告番号)'
  },
  plateChange: {
    oldRegNumber: '旧登録番号', chassis: '下4桁', newRegNumber: '新登録番号',
    agencyFee: '代行料', stamp: '印紙'
  }
};

// 車両明細の列幅(px、SetupService.gsのテンプレート生成で使用。チェックボックス項目は
// SetupService.gsのCHECKBOX_COL_WIDTHで別途一律の幅を設定するためここには含めない)
// 見出し・データとも折り返しで収まる最小限の幅にとどめ、A4横1枚(fitw=true)に収まる
// ようにしてある(名義変更・抹消は登録区分のチェックボックス列数が多く、幅が最も厳しい)。
var FIELD_WIDTHS = {
  regNumber: 100, chassis: 78, stamp: 62, plateFee: 74, agencyFee: 74, envTax: 80, keiFee: 74,
  remarks: 150, oldRegNumber: 100, newRegNumber: 100
};

// 番号変更のみ、代行料・印紙に既定値がある(元データ: 550円 / 無料)
var PLATE_CHANGE_DEFAULT_AGENCY_FEE = '550円';
var PLATE_CHANGE_DEFAULT_STAMP = '無料';

// 番号変更の必要書類(元データの注記。PDF下部に印字する固定テキスト)
var PLATE_CHANGE_REQUIRED_DOCS = [
  '必要書類',
  'ナンバー、車検証、所有者委任状、希望番号予約証（希望番号のみ）',
  '※ナンバー盗難の場合別途書類必要'
];

// 名義変更・抹消の注記(元データの脚注)
var TRANSFER_NOTES = ['（注）車台番号の下4桁は必ず記入して下さい。'];
var CANCELLATION_NOTES = ['（注）車台番号の下4桁は必ず記入して下さい。'];

// ---------- 履歴タブ(月次)のヘッダー行 ----------
// 4ファミリーぶんの項目を1つの表にまとめる(既存システムのHISTORY_HEADER_ROWと同じ考え方)。
// 該当しない項目は空欄になる(例: plateChangeの行にはtransferClassは入らない)。
// 「送付書PDF」「状態」「取消日時」は末尾に置き、将来の列追加時も既存タブの列インデックスが
// ずれないようにする。
var HISTORY_HEADER_ROW = [
  '送信日時', 'submissionId', '書類種別', 'バリエーション', '依頼会社名', '担当責任者',
  '登録日', '送付日', '送付便', '明細No.',
  '登録番号', '車台番号', '旧登録番号', '新登録番号',
  '登録区分', '記載変更・更正',
  '印紙', 'ナンバー代', '代書料', '環境性能割', '軽手数料', '代行料',
  '備考', '飛騨登録',
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
