/**
 * Code.gs
 * YANASE 中古車管理システム 刷新 フェーズ1（スキャン精度検証）
 *
 * AU・C7・MB の3社のスプレッドシートそれぞれに同じコードをコンテナバインドで入れ、
 * メニュー「★専用システム」→「初期セットアップ／設定変更」で会社ごとの設定を行う。
 *
 * 設計方針（企画書 第3章・第6章）
 *  - AIの読取結果はマスタに直接書かず、「取込待ち」シートで確認・承認してから転記する
 *  - 計算式の列（車検残・下取損・買取金額）にはコードから書き込まない
 *  - 列は見出し名で特定する（列位置の違い・列ずれに強くする）。全列一括書き込みはしない
 *  - Gemini APIキーはスクリプトプロパティに保存し、コードには書かない
 *  - 読めない項目は推測させず、空欄＋要確認で返させる
 *
 * 構成
 *   1. 定数・列定義
 *   2. メニュー・画面表示
 *   3. 設定（スクリプトプロパティ）
 *   4. 正規化・検証・補正（純粋関数：tests/run.js で単体テスト）
 *   5. 読取結果の組立（書類の突合・2エンジン照合）
 *   6. シート共通処理（見出しによる列解決）
 *   7. セットアップ
 *   8. 販売済みシートの列統一（移行ツール）
 *   9. 書類取込（Gemini・Drive OCR・2段階登録）
 *  10. 取込待ちシートと確認画面API
 *  11. マスタへの転記
 *  12. 精度テスト
 *  13. ログ
 */

// =====================================================================
// 1. 定数・列定義
// =====================================================================

var MENU_NAME = '★専用システム';

var SHEET = {
  IMPORT_MASTER: '輸入車マスタ',
  DOMESTIC_MASTER: '国産車マスタ',
  SOLD: '販売済み',
  STAGING: '取込待ち',
  ACCURACY: '精度テスト結果',
  LOG: 'ログ'
};
var MASTER_SHEETS = [SHEET.IMPORT_MASTER, SHEET.DOMESTIC_MASTER];
var VEHICLE_SHEETS = [SHEET.IMPORT_MASTER, SHEET.DOMESTIC_MASTER, SHEET.SOLD];

var STATUS_OPTIONS = ['書類待ち', '所有権解除済み', '車庫証明申請中', '名義変更中', '名義変更済み', '抹消登録済み', '販売済み'];
var CATEGORY_OPTIONS = ['買取', '仕入', '下取', 'オークション'];
var DEFAULT_STATUS = '書類待ち';

var DOC = { ORDER: '注文書', APPRAISAL: '査定書', CERT: '車検証', OTHER: 'その他' };

/**
 * マスタ・販売済みの列定義（順序 = A〜AC列の標準配置）。
 *  type   : text | date | number | chassis | select | link
 *  source : auto（採番・自動付与）| appraisal（査定書）| inspection（車検証）| order（注文書・手書き）
 *           | formula（スプレッドシートの計算式。コードから書き込まない）| manual（手入力）
 *  aliases: 既存シートの見出しの別表記（列の特定・販売済みの移行に使う）
 */
var FIELDS = [
  { key: 'purchaseDate', label: '仕入年月日', type: 'date', source: 'auto', aliases: ['仕入日', '仕入年月'] },
  { key: 'ocn', label: 'OCN', type: 'text', source: 'auto' },
  { key: 'carName', label: '車種', type: 'text', source: 'appraisal', aliases: ['車名'] },
  { key: 'modelName', label: 'モデル名', type: 'text', source: 'appraisal', aliases: ['モデル', 'グレード'] },
  { key: 'color', label: '色', type: 'text', source: 'appraisal', aliases: ['カラー', '車体色'] },
  { key: 'mileage', label: '走行距離', type: 'number', source: 'appraisal', aliases: ['走行'] },
  { key: 'chassisNumber', label: '車台番号', type: 'chassis', source: 'inspection', aliases: ['車体番号'] },
  { key: 'firstRegDate', label: '初度登録日', type: 'date', source: 'inspection', aliases: ['初度登録', '初年度登録', '初度登録年月'] },
  { key: 'inspectionExpiry', label: '車検満了日', type: 'date', source: 'inspection', aliases: ['車検満了', '車検有効期限'] },
  { key: 'inspectionRemain', label: '車検残', type: 'number', source: 'formula' },
  { key: 'plateRegion', label: '登録番号（地域）', type: 'text', source: 'inspection', aliases: ['地域', '登録番号地域名'] },
  { key: 'plateClass', label: '登録番号（分類番号）', type: 'text', source: 'inspection', aliases: ['分類番号', '登録番号（分類）'] },
  { key: 'plateKana', label: '登録番号（ひらがな）', type: 'text', source: 'inspection', aliases: ['ひらがな', '登録番号（かな）'] },
  { key: 'plateNumber', label: '登録番号（一連番号）', type: 'text', source: 'inspection', aliases: ['一連番号', '登録番号（番号）'] },
  { key: 'supplier', label: '仕入先', type: 'text', source: 'inspection', aliases: ['仕入先（所有者）', '所有者', '所有者名'] },
  { key: 'address', label: '住所', type: 'text', source: 'inspection', aliases: ['仕入先住所', '所有者住所'] },
  { key: 'staff', label: '担当', type: 'text', source: 'order', aliases: ['担当者'] },
  { key: 'category', label: '区分', type: 'select', options: CATEGORY_OPTIONS, source: 'order', aliases: ['仕入区分'] },
  { key: 'status', label: 'ステータス', type: 'select', options: STATUS_OPTIONS, source: 'manual' },
  { key: 'recycleFee', label: 'リサイクル', type: 'number', source: 'appraisal', aliases: ['リサイクル金額', 'リサイクル料', 'リサイクル預託金'] },
  { key: 'appraisalPrice', label: '査定価格', type: 'number', source: 'appraisal', aliases: ['査定額', '査定金額'] },
  { key: 'tradeInPrice', label: '下取価格', type: 'number', source: 'order', aliases: ['下取額'] },
  { key: 'tradeInAllowance', label: '下取充当額', type: 'number', source: 'order', aliases: ['充当額', '下取充当'] },
  { key: 'tradeInLoss', label: '下取損', type: 'number', source: 'formula' },
  { key: 'buyPrice', label: '買取金額', type: 'number', source: 'formula' },
  { key: 'saleDate', label: '売上日', type: 'date', source: 'manual', aliases: ['販売日', '売上年月日'] },
  { key: 'saleTo', label: '売上先', type: 'text', source: 'manual', aliases: ['販売先'] },
  { key: 'certLink', label: '車検証リンク', type: 'link', source: 'auto', aliases: ['車検証'] },
  { key: 'purchasePrice', label: '仕入価格', type: 'number', source: 'order', aliases: ['仕入金額'] }
];

var FIELD_BY_KEY = (function () {
  var map = {};
  FIELDS.forEach(function (f) { map[f.key] = f; });
  return map;
})();

var STANDARD_HEADERS = FIELDS.map(function (f) { return f.label; });

/**
 * 計算式の列の定義。見出し行に ARRAYFORMULA を1つ置く方式で使う。
 * {キー} は該当列の「2行目以降の範囲」（例：I2:I）に置き換わる。
 * null の列は式が未確定（企画書 第10章の確認事項）のため、セットアップでは設定しない。
 */
var FORMULA_DEFS = {
  inspectionRemain: 'IF({inspectionExpiry}="",,IF({inspectionExpiry}<TODAY(),0,DATEDIF(TODAY(),{inspectionExpiry},"M")))',
  tradeInLoss: 'IF(({tradeInAllowance}="")+({tradeInPrice}=""),,{tradeInAllowance}-{tradeInPrice})',
  buyPrice: null // 「買取金額」と「仕入価格」が同じ項目か確認後に定義する
};

/** 手書き（注文書由来）で、正答率にかかわらず人の承認が必須の項目 */
var HANDWRITTEN_KEYS = ['staff', 'category', 'tradeInPrice', 'tradeInAllowance', 'purchasePrice'];

/** 2エンジン照合（Gemini と Drive OCR）の対象にする重要項目 */
var OCR_CHECK_KEYS = ['chassisNumber', 'plateNumber', 'mileage', 'recycleFee', 'appraisalPrice',
  'tradeInPrice', 'tradeInAllowance', 'purchasePrice'];

/** 項目ごとの取得元（優先順）と、Geminiが返す書類内の項目名 */
var FIELD_SOURCES = {
  carName: [[DOC.APPRAISAL, 'carName'], [DOC.ORDER, 'carName']],
  modelName: [[DOC.APPRAISAL, 'modelName']],
  color: [[DOC.APPRAISAL, 'color']],
  mileage: [[DOC.APPRAISAL, 'mileage']],
  recycleFee: [[DOC.APPRAISAL, 'recycleFee']],
  appraisalPrice: [[DOC.APPRAISAL, 'appraisalPrice']],
  chassisNumber: [[DOC.CERT, 'chassisNumber'], [DOC.APPRAISAL, 'chassisNumber'], [DOC.ORDER, 'chassisNumber']],
  firstRegDate: [[DOC.CERT, 'firstRegDate']],
  inspectionExpiry: [[DOC.CERT, 'inspectionExpiry']],
  plateRegion: [[DOC.CERT, 'plateRegion'], [DOC.APPRAISAL, 'plateRegion']],
  plateClass: [[DOC.CERT, 'plateClass'], [DOC.APPRAISAL, 'plateClass']],
  plateKana: [[DOC.CERT, 'plateKana'], [DOC.APPRAISAL, 'plateKana']],
  plateNumber: [[DOC.CERT, 'plateNumber'], [DOC.APPRAISAL, 'plateNumber']],
  supplier: [[DOC.CERT, 'ownerName']],
  address: [[DOC.CERT, 'ownerAddress']],
  staff: [[DOC.ORDER, 'staff']],
  category: [[DOC.ORDER, 'category']],
  tradeInPrice: [[DOC.ORDER, 'tradeInPrice']],
  tradeInAllowance: [[DOC.ORDER, 'tradeInAllowance']],
  purchasePrice: [[DOC.ORDER, 'purchasePrice']]
};

/** 書類間で突合する項目（一致数で信頼度を判定） */
var CROSS_CHECK_KEYS = ['chassisNumber', 'plateRegion', 'plateClass', 'plateKana', 'plateNumber'];

/** 精度テストで書類種別ごとに採点する項目 */
var ACCURACY_KEYS_BY_DOC = {};
ACCURACY_KEYS_BY_DOC[DOC.APPRAISAL] = ['carName', 'modelName', 'color', 'mileage', 'recycleFee', 'appraisalPrice',
  'chassisNumber', 'plateRegion', 'plateClass', 'plateKana', 'plateNumber'];
ACCURACY_KEYS_BY_DOC[DOC.CERT] = ['chassisNumber', 'firstRegDate', 'inspectionExpiry',
  'plateRegion', 'plateClass', 'plateKana', 'plateNumber', 'supplier', 'address'];
ACCURACY_KEYS_BY_DOC[DOC.ORDER] = HANDWRITTEN_KEYS.slice();

/** 取込待ちシートの列 */
var STAGE_META_HEADERS = ['取込ID', '取込日時', '種別', '状態', '承認', '登録先', '対象OCN', '信頼度', '要確認項目', '警告'];
var STAGE_FIELD_KEYS = ['purchaseDate', 'carName', 'modelName', 'color', 'mileage', 'chassisNumber',
  'firstRegDate', 'inspectionExpiry', 'plateRegion', 'plateClass', 'plateKana', 'plateNumber',
  'supplier', 'address', 'staff', 'category', 'recycleFee', 'appraisalPrice',
  'tradeInPrice', 'tradeInAllowance', 'purchasePrice'];
var STAGE_TAIL_HEADERS = ['書類', 'ファイル', 'ファイルID', '処理メモ', '読取結果'];
var STAGE_HEADERS = STAGE_META_HEADERS
  .concat(STAGE_FIELD_KEYS.map(function (k) { return FIELD_BY_KEY[k].label; }))
  .concat(STAGE_TAIL_HEADERS);

var KIND = { PROVISIONAL: '仮登録', FINAL: '本登録', UNLINKED: '紐付け待ち' };
var STAGE_STATE = {
  NEW: '未確認', CHECK: '要確認', UNLINKED: '紐付け待ち', APPROVED: '承認済み',
  DONE: '転記済み', REJECTED: '却下', ERROR: 'エラー'
};
var STAGE_OPEN_STATES = [STAGE_STATE.NEW, STAGE_STATE.CHECK, STAGE_STATE.UNLINKED, STAGE_STATE.APPROVED, STAGE_STATE.ERROR];

var LOG_HEADERS = ['日時', '区分', '対象', '項目', '変更前／AI値', '変更後／確定値', '内容', '実行者'];

var ACCURACY_DETAIL_HEADERS = ['実行ID', 'ファイル名', 'ファイルID', '書類', '照合キー', '項目', '手書き', '読取値', '正解値', '判定', '要確認'];
var ACCURACY_DETAIL_COL = 13; // M列から明細
var ACCURACY_SUMMARY_HEADERS = ['項目', '種類', '件数', '一致', '正答率', '要確認に回った割合', '要確認なしの誤り', '確認で直した件数', '判定（案）', '誤りの例'];

var FLAG = {
  UNREADABLE: '読取不可',
  OCR_MISMATCH: 'OCR不一致',
  CROSS_MISMATCH: '書類間不一致',
  INVALID: '形式不正',
  DATE: '日付不正',
  REGION: '地域名要確認',
  HANDWRITTEN: '手書き確認',
  LOSS: '下取損警告',
  FALLBACK: '代替書類から取得'
};

var ACCURACY_TARGET = 0.98;

/** 自動車登録番号標の地域名（登録番号の照合に使う） */
var PLATE_REGIONS = [
  '札幌', '函館', '旭川', '室蘭', '苫小牧', '釧路', '知床', '帯広', '北見',
  '青森', '八戸', '弘前', '岩手', '盛岡', '平泉', '宮城', '仙台', '秋田', '山形', '庄内',
  '福島', '会津', '郡山', '白河', 'いわき',
  '水戸', '土浦', 'つくば', '宇都宮', '那須', 'とちぎ', '群馬', '前橋', '高崎',
  '大宮', '川口', '所沢', '川越', '熊谷', '春日部', '越谷',
  '千葉', '成田', '習志野', '市川', '船橋', '袖ケ浦', '市原', '野田', '柏', '松戸',
  '品川', '世田谷', '練馬', '杉並', '板橋', '足立', '江東', '葛飾', '八王子', '多摩', '府中', '日野',
  '横浜', '川崎', '相模', '湘南', '山梨', '富士山',
  '新潟', '長岡', '上越', '富山', '石川', '金沢', '福井', '長野', '松本', '諏訪',
  '岐阜', '飛騨', '静岡', '浜松', '沼津', '伊豆',
  '名古屋', '豊橋', '三河', '岡崎', '豊田', '尾張小牧', '一宮', '春日井',
  '三重', '鈴鹿', '四日市', '伊勢志摩', '伊賀',
  '滋賀', '京都', '大阪', 'なにわ', '和泉', '堺', '奈良', '飛鳥', '和歌山', '神戸', '姫路',
  '鳥取', '島根', '出雲', '岡山', '倉敷', '広島', '福山', '山口', '下関',
  '徳島', '香川', '高松', '愛媛', '高知',
  '福岡', '北九州', '久留米', '筑豊', '佐賀', '長崎', '佐世保', '熊本', '大分', '宮崎', '鹿児島', '奄美', '沖縄'
];

/** 登録番号のひらがなに使われない文字 */
var PLATE_KANA_EXCLUDED = ['お', 'し', 'へ', 'ん'];

var SUPPORTED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
var MAX_FILE_BYTES = 18 * 1024 * 1024;
var RUN_BUDGET_MS = 4.5 * 60 * 1000;

// =====================================================================
// 2. メニュー・画面表示
// =====================================================================

function onOpen() {
  SpreadsheetApp.getUi().createMenu(MENU_NAME)
    .addItem('初期セットアップ／設定変更', 'showSetup')
    .addSeparator()
    .addItem('受付フォルダの書類を今すぐ取込', 'showImport')
    .addItem('取込待ちの確認（サイドバー）', 'showReviewSidebar')
    .addItem('取込待ちの確認（大画面）', 'showReviewDialog')
    .addItem('承認済みをマスタへ転記', 'transferApprovedFromMenu')
    .addItem('エラーフォルダの書類を受付に戻す', 'restoreErrorFilesFromMenu')
    .addSeparator()
    .addItem('精度テストを実行', 'showAccuracyTest')
    .addItem('販売済みシートの列統一（移行ツール）', 'migrateSoldSheetFromMenu')
    .addToUi();
}

function showSetup() {
  var html = HtmlService.createHtmlOutputFromFile('Setup').setWidth(560).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, '初期セットアップ／設定変更');
}

function showImport() {
  showImportDialog_('import', '受付フォルダの書類を取込');
}

function showAccuracyTest() {
  showImportDialog_('test', '精度テスト');
}

function showImportDialog_(mode, title) {
  var template = HtmlService.createTemplateFromFile('Import');
  template.mode = mode;
  var html = template.evaluate().setWidth(720).setHeight(640);
  SpreadsheetApp.getUi().showModelessDialog(html, title);
}

function showReviewSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Review').setTitle('取込待ちの確認');
  SpreadsheetApp.getUi().showSidebar(html);
}

function showReviewDialog() {
  var html = HtmlService.createHtmlOutputFromFile('Review').setWidth(1200).setHeight(780);
  SpreadsheetApp.getUi().showModelessDialog(html, '取込待ちの確認');
}

function transferApprovedFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var result = transferApproved();
  ui.alert('マスタへの転記', result.message, ui.ButtonSet.OK);
}

// =====================================================================
// 3. 設定（スクリプトプロパティ）
// =====================================================================

var PROP = {
  COMPANY: 'COMPANY_NAME',
  GEMINI_KEY: 'GEMINI_API_KEY',
  GEMINI_MODEL: 'GEMINI_MODEL',
  FOLDER_ROOT: 'FOLDER_ROOT',
  FOLDER_INBOX: 'FOLDER_INBOX',
  FOLDER_DONE: 'FOLDER_DONE',
  FOLDER_ERROR: 'FOLDER_ERROR',
  FOLDER_CERT: 'FOLDER_CERT',
  TRIGGER_MINUTES: 'TRIGGER_MINUTES',
  OCN_PREFIX: 'OCN_PREFIX',
  OCN_DIGITS: 'OCN_DIGITS',
  OCN_LAST: 'OCN_LAST_ISSUED',
  LOSS_THRESHOLD: 'TRADEIN_LOSS_THRESHOLD',
  USE_DRIVE_OCR: 'USE_DRIVE_OCR',
  GEMINI_INTERVAL: 'GEMINI_MIN_INTERVAL_SEC',
  GEMINI_LAST_CALL: 'GEMINI_LAST_CALL_MS'
};

var SETTING_DEFAULTS = {
  GEMINI_MODEL: 'gemini-2.5-flash',
  TRIGGER_MINUTES: '15',
  OCN_PREFIX: '',
  OCN_DIGITS: '0',
  TRADEIN_LOSS_THRESHOLD: '1000000',
  USE_DRIVE_OCR: 'true',
  GEMINI_MIN_INTERVAL_SEC: '7' // 無料枠（1分あたり約10回）に収まる間隔
};

function getSettings_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  function get(key) {
    var v = props[key];
    return (v === undefined || v === null || v === '') ? (SETTING_DEFAULTS[key] || '') : v;
  }
  return {
    company: get(PROP.COMPANY),
    geminiKey: get(PROP.GEMINI_KEY),
    geminiModel: get(PROP.GEMINI_MODEL),
    folderRoot: get(PROP.FOLDER_ROOT),
    folderInbox: get(PROP.FOLDER_INBOX),
    folderDone: get(PROP.FOLDER_DONE),
    folderError: get(PROP.FOLDER_ERROR),
    folderCert: get(PROP.FOLDER_CERT),
    triggerMinutes: Number(get(PROP.TRIGGER_MINUTES)) || 0,
    ocnPrefix: get(PROP.OCN_PREFIX),
    ocnDigits: Number(get(PROP.OCN_DIGITS)) || 0,
    lossThreshold: Number(get(PROP.LOSS_THRESHOLD)) || 0,
    useDriveOcr: get(PROP.USE_DRIVE_OCR) !== 'false',
    geminiIntervalSec: Math.max(0, Number(get(PROP.GEMINI_INTERVAL)) || 0)
  };
}

function requireSettings_(settings) {
  var missing = [];
  if (!settings.geminiKey) missing.push('Gemini APIキー');
  if (!settings.folderInbox) missing.push('受付フォルダ');
  if (!settings.folderDone) missing.push('処理済みフォルダ');
  if (!settings.folderError) missing.push('エラーフォルダ');
  if (!settings.folderCert) missing.push('車検証保管フォルダ');
  if (missing.length) {
    throw new Error('初期セットアップが完了していません（未設定：' + missing.join('、') + '）。メニュー「' + MENU_NAME + '」→「初期セットアップ／設定変更」を実行してください。');
  }
}

// =====================================================================
// 4. 正規化・検証・補正（純粋関数）
// =====================================================================

/** 全角英数記号を半角に、各種ハイフン・長音を「-」に揃える */
function toHalfWidth(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/　/g, ' ')
    .replace(/[‐‑‒–—―−ｰ]/g, '-');
}

function isBlank(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function katakanaToHiragana(s) {
  return String(s).replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); });
}

/**
 * 車台番号の正規化と文字ルールによる補正。
 *  - 輸入車（17桁・ハイフンなし）：規格上 I・O・Q を使わないため 1・0・0 に補正
 *  - 国産車（型式部-連番）：ハイフン後の連番は数字のみとして補正（O→0、I→1 等）
 * @return {{value:string, kind:string, valid:boolean, corrected:boolean, original:string}}
 */
function normalizeChassisNumber(raw) {
  var original = isBlank(raw) ? '' : String(raw);
  var s = toHalfWidth(original).toUpperCase().replace(/\s+/g, '').replace(/ー/g, '-');
  if (!s) return { value: '', kind: 'unknown', valid: false, corrected: false, original: original };

  if (s.indexOf('-') === -1 && s.length === 17 && /^[A-Z0-9]+$/.test(s)) {
    var vin = s.replace(/I/g, '1').replace(/[OQ]/g, '0');
    return {
      value: vin, kind: 'import', valid: /^[A-HJ-NPR-Z0-9]{17}$/.test(vin),
      corrected: vin !== s, original: original
    };
  }

  var m = s.match(/^([A-Z0-9]+)-([A-Z0-9|]+)$/);
  if (m) {
    var serial = m[2]
      .replace(/[ODQ]/g, '0').replace(/[IL|]/g, '1').replace(/Z/g, '2')
      .replace(/S/g, '5').replace(/B/g, '8').replace(/G/g, '6');
    var value = m[1] + '-' + serial;
    return {
      value: value, kind: 'domestic', valid: /^\d{4,8}$/.test(serial),
      corrected: value !== s, original: original
    };
  }
  return { value: s, kind: 'unknown', valid: false, corrected: false, original: original };
}

/** 比較用の車台番号（ハイフン・空白を除き、紛らわしい文字を寄せる） */
function chassisCompareKey(v) {
  return toHalfWidth(v).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[OQ]/g, '0').replace(/I/g, '1');
}

function levenshtein(a, b) {
  a = String(a); b = String(b);
  var prev = [];
  for (var j = 0; j <= b.length; j++) prev[j] = j;
  for (var i = 1; i <= a.length; i++) {
    var cur = [i];
    for (var k = 1; k <= b.length; k++) {
      cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + (a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * 登録番号（4分割）の正規化と検証。
 *  - 地域名：一覧と照合。1文字違いで候補が1つだけなら補正し、要確認にする
 *  - 分類番号：3桁以内
 *  - ひらがな：1文字（カタカナはひらがなへ）
 *  - 一連番号：数字1〜4桁（「・」「-」は除く）
 * @return {{values:Object, flags:Object, notes:Array<string>}}
 */
function normalizePlate(parts, regions) {
  regions = regions || PLATE_REGIONS;
  var values = {}, flags = {}, notes = [];
  function flag(key, f) { (flags[key] = flags[key] || []).push(f); }

  var region = toHalfWidth(parts.plateRegion).replace(/\s+/g, '');
  if (region) {
    if (regions.indexOf(region) === -1) {
      var candidates = regions.filter(function (r) { return levenshtein(r, region) <= 1; });
      if (candidates.length === 1) {
        notes.push('地域名を補正：' + region + '→' + candidates[0]);
        region = candidates[0];
      }
      flag('plateRegion', FLAG.REGION);
    }
  }
  values.plateRegion = region;

  var cls = toHalfWidth(parts.plateClass).toUpperCase().replace(/\s+/g, '').replace(/O/g, '0').replace(/I/g, '1');
  if (cls && !/^[0-9][0-9A-Z]{0,2}$/.test(cls)) flag('plateClass', FLAG.INVALID);
  values.plateClass = cls;

  var kana = katakanaToHiragana(toHalfWidth(parts.plateKana).replace(/\s+/g, ''));
  if (kana && (!/^[ぁ-ゖ]$/.test(kana) || PLATE_KANA_EXCLUDED.indexOf(kana) !== -1)) flag('plateKana', FLAG.INVALID);
  values.plateKana = kana;

  var num = toHalfWidth(parts.plateNumber).toUpperCase().replace(/[\s・･.\-]/g, '')
    .replace(/[OD]/g, '0').replace(/[IL]/g, '1');
  if (num && !/^\d{1,4}$/.test(num)) flag('plateNumber', FLAG.INVALID);
  values.plateNumber = num;

  return { values: values, flags: flags, notes: notes };
}

var ERA_BASE = { '令和': 2018, 'R': 2018, '平成': 1988, 'H': 1988, '昭和': 1925, 'S': 1925 };

/**
 * 和暦・西暦の日付文字列を解釈する。年月のみの表記（初度登録年月）は1日とする。
 * @return {{date:Date, dayKnown:boolean}|null}
 */
function parseJapaneseDate(raw) {
  if (raw instanceof Date && !isNaN(raw.getTime())) return { date: raw, dayKnown: true };
  if (isBlank(raw)) return null;
  var s = toHalfWidth(raw).toUpperCase().replace(/\s+/g, '');
  var y, mo, d, m;
  m = s.match(/^(令和|平成|昭和|R|H|S)(元|\d{1,2})[年.\/\-](\d{1,2})月?(?:[.\/\-]?(\d{1,2})日?)?$/);
  if (m) {
    y = ERA_BASE[m[1]] + (m[2] === '元' ? 1 : Number(m[2]));
    mo = Number(m[3]); d = m[4] ? Number(m[4]) : null;
  } else {
    m = s.match(/^(\d{4})[年.\/\-](\d{1,2})月?(?:[.\/\-]?(\d{1,2})日?)?$/);
    if (!m) return null;
    y = Number(m[1]); mo = Number(m[2]); d = m[3] ? Number(m[3]) : null;
  }
  if (mo < 1 || mo > 12 || (d !== null && (d < 1 || d > 31))) return null;
  var date = new Date(y, mo - 1, d || 1);
  if (date.getMonth() !== mo - 1) return null; // 2月30日など
  return { date: date, dayKnown: d !== null };
}

/** 日付の妥当性チェック（初度登録日が未来でないか等） */
function checkVehicleDates(firstReg, expiry, today) {
  var flags = { firstRegDate: [], inspectionExpiry: [] };
  if (firstReg) {
    if (firstReg.getTime() > today.getTime()) flags.firstRegDate.push(FLAG.DATE + '（未来の日付）');
    if (firstReg.getFullYear() < 1950) flags.firstRegDate.push(FLAG.DATE + '（古すぎる）');
  }
  if (expiry) {
    if (firstReg && expiry.getTime() <= firstReg.getTime()) flags.inspectionExpiry.push(FLAG.DATE + '（初度登録日より前）');
    var limit = new Date(today.getFullYear() + 3, today.getMonth() + 1, today.getDate());
    if (expiry.getTime() > limit.getTime()) flags.inspectionExpiry.push(FLAG.DATE + '（3年以上先）');
  }
  return flags;
}

/** 金額の解釈（「1,234,000円」「123万円」「12.5万」等）。解釈できなければ null */
function parseAmount(raw) {
  if (typeof raw === 'number') return raw;
  if (isBlank(raw)) return null;
  var s = toHalfWidth(raw).replace(/[\s,，¥￥円]|税込|税抜/g, '');
  var m = s.match(/^(-?\d+(?:\.\d+)?)万(\d{0,4})$/);
  if (m) return Math.round(Number(m[1]) * 10000) + (m[2] ? Number(m[2]) : 0);
  if (/^-?\d+$/.test(s)) return Number(s);
  return null;
}

/** 走行距離の解釈（「12,345km」「1.2万km」等） */
function parseMileage(raw) {
  if (typeof raw === 'number') return raw;
  if (isBlank(raw)) return null;
  var s = toHalfWidth(raw).replace(/km|KM|Km|キロ|ｋｍ/g, '');
  return parseAmount(s);
}

/** 区分の正規化（選択肢に合わないものは null） */
function normalizeCategory(raw) {
  if (isBlank(raw)) return null;
  var s = toHalfWidth(raw).replace(/\s+/g, '');
  if (CATEGORY_OPTIONS.indexOf(s) !== -1) return s;
  if (/オークション|AA|オートオークション/.test(s)) return 'オークション';
  if (/下取/.test(s)) return '下取';
  if (/買取/.test(s)) return '買取';
  if (/仕入/.test(s)) return '仕入';
  return null;
}

/** OCR照合用の正規化（英数字のみ・紛らわしい文字を寄せる） */
function ocrCompareKey(s) {
  return toHalfWidth(s).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[OQD]/g, '0').replace(/[IL]/g, '1');
}

/** 値（または候補のいずれか）が OCR テキスト中に現れるか */
function ocrContains(ocrKey, candidates) {
  return candidates.some(function (c) {
    var k = ocrCompareKey(c);
    return k.length > 0 && ocrKey.indexOf(k) !== -1;
  });
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

function formatDateYmd(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/** 'yyyy-MM-dd' 文字列を Date に（シート書込み用） */
function ymdToDate(s) {
  if (s instanceof Date) return s;
  var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

// ----- OCN -----

/** OCN から連番部分を取り出す（接頭辞付きにも対応）。取り出せなければ null */
function parseOcnNumber(ocn, prefix) {
  if (isBlank(ocn)) return null;
  var s = toHalfWidth(ocn).trim();
  if (prefix && s.indexOf(prefix) === 0) s = s.substring(prefix.length);
  if (!/^\d+$/.test(s)) return null;
  return Number(s);
}

function formatOcn(n, prefix, digits) {
  var s = String(n);
  while (digits && s.length < digits) s = '0' + s;
  return (prefix || '') + s;
}

/** OCN の照合キー（「00123」と数値の 123 を同じものとして扱う） */
function ocnKey(ocn, prefix) {
  var n = parseOcnNumber(ocn, prefix);
  return n !== null ? '#' + n : toHalfWidth(ocn).trim();
}

/** 既存OCN・発行済み最大値から次のOCNを決める（「NEW-乱数」は使わない） */
function nextOcnNumber(existingOcns, prefix, lastIssued) {
  var max = Number(lastIssued) || 0;
  existingOcns.forEach(function (o) {
    var n = parseOcnNumber(o, prefix);
    if (n !== null && n > max) max = n;
  });
  return max + 1;
}

// ----- 列 -----

function normalizeHeader(label) {
  return toHalfWidth(label).replace(/[\s()（）［］\[\]・]/g, '');
}

/**
 * 見出し行から各項目の列位置を特定する（見出し名 → 別表記の順）。
 * @return {{map:Object, missing:Array<string>, unknown:Array<{index:number,label:string}>}}
 */
function resolveColumns(headers) {
  var normalized = headers.map(normalizeHeader);
  var map = {}, used = {};
  FIELDS.forEach(function (f) {
    var idx = normalized.indexOf(normalizeHeader(f.label));
    if (idx !== -1 && !used[idx]) { map[f.key] = idx; used[idx] = true; }
  });
  FIELDS.forEach(function (f) {
    if (map[f.key] !== undefined || !f.aliases) return;
    for (var i = 0; i < f.aliases.length; i++) {
      var idx = normalized.indexOf(normalizeHeader(f.aliases[i]));
      if (idx !== -1 && !used[idx]) { map[f.key] = idx; used[idx] = true; return; }
    }
  });
  var missing = FIELDS.filter(function (f) { return map[f.key] === undefined; }).map(function (f) { return f.key; });
  var unknown = [];
  headers.forEach(function (h, i) { if (!used[i] && !isBlank(h)) unknown.push({ index: i, label: String(h) }); });
  return { map: map, missing: missing, unknown: unknown };
}

/** 列が標準配置（A〜AC）どおりか */
function isStandardLayout(headers) {
  var res = resolveColumns(headers);
  return FIELDS.every(function (f, i) { return res.map[f.key] === i; });
}

/** 1始まりの列番号 → 列記号（1→A, 29→AC） */
function columnLetter(n) {
  var s = '';
  while (n > 0) {
    var r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * 見出し行に置く ARRAYFORMULA を組み立てる。参照先の列が無い場合は null。
 * 例：={"下取損";ARRAYFORMULA(IF((W2:W="")+(V2:V=""),,W2:W-V2:V))}
 */
function buildArrayFormula(key, colMap) {
  var def = FORMULA_DEFS[key];
  if (!def) return null;
  var ok = true;
  var expr = def.replace(/\{(\w+)\}/g, function (_, ref) {
    if (colMap[ref] === undefined) { ok = false; return ''; }
    var letter = columnLetter(colMap[ref] + 1);
    return letter + '2:' + letter;
  });
  if (!ok) return null;
  return '={"' + FIELD_BY_KEY[key].label.replace(/"/g, '""') + '";ARRAYFORMULA(' + expr + ')}';
}

// =====================================================================
// 5. 読取結果の組立（書類の突合・2エンジン照合）
// =====================================================================

/**
 * Gemini の読取結果（書類ごと）から1台分の取込レコードを組み立てる。
 * 取得元の優先順（活字の書類優先）・補正・書類間突合・OCR照合・妥当性チェックを行う。
 *
 * @param {Array<{type:string, fields:Object}>} docs
 * @param {{ocrText:string|null, today:Date, lossThreshold:number, regions?:Array<string>}} ctx
 * @return {{kind:string|null, fields:Object, warnings:Array<string>, docTypes:Array<string>,
 *           confidence:string, flaggedKeys:Array<string>, targetSheet:string, error?:string}}
 */
function buildRecord(docs, ctx) {
  var byType = {};
  (docs || []).forEach(function (d) {
    if (!d || !d.type) return;
    (byType[d.type] = byType[d.type] || []).push(d);
  });
  var docTypes = Object.keys(byType).filter(function (t) { return t !== DOC.OTHER; });
  var record = { kind: null, fields: {}, warnings: [], docTypes: docTypes, confidence: '', flaggedKeys: [], targetSheet: '' };

  if (byType[DOC.ORDER] || byType[DOC.APPRAISAL]) record.kind = KIND.PROVISIONAL;
  else if (byType[DOC.CERT]) record.kind = KIND.FINAL;
  else {
    record.error = '書類の種類（注文書・査定書・車検証）を判別できませんでした';
    return record;
  }

  function docField(type, name) {
    var list = byType[type] || [];
    for (var i = 0; i < list.length; i++) {
      var f = list[i].fields && list[i].fields[name];
      if (f && (!isBlank(f.value) || f.readable === false)) return f;
    }
    return null;
  }
  function addFlag(key, flag) {
    var f = record.fields[key];
    if (!f) return;
    if (f.flags.indexOf(flag) === -1) f.flags.push(flag);
  }

  // --- 取得元の優先順で値を選ぶ ---
  Object.keys(FIELD_SOURCES).forEach(function (key) {
    var sources = FIELD_SOURCES[key];
    var chosen = null, unreadableSeen = false;
    for (var i = 0; i < sources.length; i++) {
      if (!byType[sources[i][0]]) continue;
      var f = docField(sources[i][0], sources[i][1]);
      if (!f) continue;
      if (isBlank(f.value)) { unreadableSeen = true; continue; }
      chosen = { raw: String(f.value), source: sources[i][0], handwritten: !!f.handwritten, partial: f.readable === false, fallback: i > 0 };
      break;
    }
    var entry = { value: '', raw: '', source: '', flags: [] };
    if (chosen) {
      entry.raw = chosen.raw;
      entry.value = chosen.raw.trim();
      entry.source = chosen.source;
      if (chosen.partial) entry.flags.push(FLAG.UNREADABLE);
      if (chosen.handwritten) entry.flags.push(FLAG.HANDWRITTEN);
      if (chosen.fallback && chosen.source === DOC.ORDER) entry.flags.push(FLAG.FALLBACK);
    } else if (unreadableSeen) {
      entry.flags.push(FLAG.UNREADABLE);
    }
    if (HANDWRITTEN_KEYS.indexOf(key) !== -1 && byType[DOC.ORDER] && entry.flags.indexOf(FLAG.HANDWRITTEN) === -1) {
      entry.flags.push(FLAG.HANDWRITTEN);
    }
    record.fields[key] = entry;
  });

  // --- 型ごとの正規化・補正 ---
  var chassis = record.fields.chassisNumber;
  var chassisInfo = normalizeChassisNumber(chassis.value);
  if (chassis.value) {
    if (chassisInfo.corrected) record.warnings.push('車台番号を補正：' + chassis.value + '→' + chassisInfo.value);
    chassis.value = chassisInfo.value;
    if (!chassisInfo.valid) addFlag('chassisNumber', FLAG.INVALID);
  }

  var plate = normalizePlate({
    plateRegion: record.fields.plateRegion.value, plateClass: record.fields.plateClass.value,
    plateKana: record.fields.plateKana.value, plateNumber: record.fields.plateNumber.value
  }, ctx.regions);
  Object.keys(plate.values).forEach(function (k) {
    record.fields[k].value = plate.values[k];
    (plate.flags[k] || []).forEach(function (f) { addFlag(k, f); });
  });
  record.warnings = record.warnings.concat(plate.notes);

  ['mileage', 'recycleFee', 'appraisalPrice', 'tradeInPrice', 'tradeInAllowance', 'purchasePrice'].forEach(function (k) {
    var f = record.fields[k];
    if (!f.value) return;
    var n = k === 'mileage' ? parseMileage(f.value) : parseAmount(f.value);
    if (n === null) addFlag(k, FLAG.INVALID);
    else f.value = n;
  });

  var dates = {};
  ['firstRegDate', 'inspectionExpiry'].forEach(function (k) {
    var f = record.fields[k];
    if (!f.value) return;
    var p = parseJapaneseDate(f.value);
    if (!p) { addFlag(k, FLAG.INVALID); return; }
    dates[k] = p.date;
    f.value = formatDateYmd(p.date);
  });
  var dateFlags = checkVehicleDates(dates.firstRegDate, dates.inspectionExpiry, ctx.today);
  Object.keys(dateFlags).forEach(function (k) { dateFlags[k].forEach(function (f) { addFlag(k, f); }); });

  if (record.fields.category.value) {
    var cat = normalizeCategory(record.fields.category.value);
    if (cat) record.fields.category.value = cat;
    else addFlag('category', FLAG.INVALID);
  }
  ['carName', 'modelName', 'color', 'supplier', 'address', 'staff'].forEach(function (k) {
    var f = record.fields[k];
    if (typeof f.value === 'string') f.value = f.value.replace(/\s+/g, ' ').trim();
  });

  // --- 書類間の突合（車台番号・登録番号） ---
  var agreements = 0;
  CROSS_CHECK_KEYS.forEach(function (key) {
    var seen = [];
    FIELD_SOURCES[key].forEach(function (src) {
      if (!byType[src[0]]) return;
      var f = docField(src[0], src[1]);
      if (!f || isBlank(f.value)) return;
      var v = key === 'chassisNumber' ? chassisCompareKey(normalizeChassisNumber(f.value).value)
        : compareKey(key, normalizePlate(singlePlatePart_(key, f.value), ctx.regions).values[key]);
      if (v) seen.push({ doc: src[0], value: v, raw: String(f.value) });
    });
    if (seen.length < 2) return;
    var distinct = seen.filter(function (s, i) { return seen.map(function (x) { return x.value; }).indexOf(s.value) === i; });
    if (distinct.length > 1) {
      addFlag(key, FLAG.CROSS_MISMATCH);
      record.warnings.push(FIELD_BY_KEY[key].label + 'が書類間で不一致：' + seen.map(function (s) { return s.doc + '「' + s.raw + '」'; }).join(' / '));
    } else {
      agreements++;
    }
  });

  // --- 2エンジン照合（Drive OCR のテキストに同じ値が現れるか） ---
  var ocrAvailable = typeof ctx.ocrText === 'string' && ctx.ocrText.length > 0;
  if (ocrAvailable) {
    var ocrKey = ocrCompareKey(ctx.ocrText);
    OCR_CHECK_KEYS.forEach(function (key) {
      var f = record.fields[key];
      if (isBlank(f.value) && f.value !== 0) return;
      var candidates = [String(f.value)];
      if (f.raw) candidates.push(f.raw);
      if (!ocrContains(ocrKey, candidates)) addFlag(key, FLAG.OCR_MISMATCH);
    });
  } else {
    record.warnings.push('Drive OCR による照合ができませんでした（Geminiの結果のみ）');
  }

  // --- 計算による矛盾検出（下取損） ---
  var price = record.fields.tradeInPrice.value, allowance = record.fields.tradeInAllowance.value;
  if (typeof price === 'number' && typeof allowance === 'number' && ctx.lossThreshold > 0) {
    var loss = allowance - price;
    if (Math.abs(loss) > ctx.lossThreshold) {
      addFlag('tradeInPrice', FLAG.LOSS);
      addFlag('tradeInAllowance', FLAG.LOSS);
      record.warnings.push('下取損が極端な値です：' + loss.toLocaleString() + '円');
    }
  }

  // --- 車検証の注意事項 ---
  var cert = (byType[DOC.CERT] || [])[0];
  if (cert && cert.fields) {
    var fmt = cert.fields.certFormat && cert.fields.certFormat.value;
    if (fmt && String(fmt).indexOf('券面') !== -1) {
      record.warnings.push('電子車検証の券面です。満了日・所有者住所は「自動車検査証記録事項」をスキャンしてください');
    }
    var owner = cert.fields.ownerName && cert.fields.ownerName.value;
    var user = cert.fields.userName && cert.fields.userName.value;
    if (!isBlank(owner) && !isBlank(user) && String(owner).replace(/\s/g, '') !== String(user).replace(/\s/g, '')) {
      record.warnings.push('所有者と使用者が異なります（所有権留保の可能性）：所有者「' + owner + '」／使用者「' + user + '」');
    }
  }

  // --- 登録先・信頼度 ---
  if (chassisInfo.kind === 'import') record.targetSheet = SHEET.IMPORT_MASTER;
  else if (chassisInfo.kind === 'domestic') record.targetSheet = SHEET.DOMESTIC_MASTER;

  var flagged = [], hardFlagged = false;
  Object.keys(record.fields).forEach(function (k) {
    var f = record.fields[k];
    if (!f.flags.length) return;
    flagged.push(k);
    if (f.flags.some(function (x) { return x !== FLAG.HANDWRITTEN; })) hardFlagged = true;
  });
  record.flaggedKeys = flagged;
  if (hardFlagged) record.confidence = '低';
  else if (flagged.length || !ocrAvailable || agreements === 0) record.confidence = '中';
  else record.confidence = '高';
  record.agreements = agreements;
  return record;
}

function singlePlatePart_(key, value) {
  var parts = { plateRegion: '', plateClass: '', plateKana: '', plateNumber: '' };
  parts[key] = value;
  return parts;
}

// ----- 精度テストの採点 -----

/** 比較用に値を正規化する（精度テスト・修正検出で使う） */
function compareKey(key, value) {
  if (value === null || value === undefined || value === '') return '';
  var f = FIELD_BY_KEY[key];
  var type = f ? f.type : 'text';
  if (type === 'date') {
    var p = parseJapaneseDate(value instanceof Date ? value : String(value).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3'));
    if (!p) return toHalfWidth(value).replace(/\s/g, '');
    var ymd = formatDateYmd(p.date);
    return key === 'firstRegDate' ? ymd.substring(0, 7) : ymd; // 初度登録は年月で比較
  }
  if (type === 'number') {
    var n = key === 'mileage' ? parseMileage(value) : parseAmount(value);
    return n === null ? toHalfWidth(value).replace(/\s/g, '') : String(n);
  }
  if (type === 'chassis') return chassisCompareKey(value);
  if (key === 'plateNumber') return toHalfWidth(value).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (key === 'plateKana') return katakanaToHiragana(toHalfWidth(value).replace(/\s/g, ''));
  return toHalfWidth(value).toUpperCase().replace(/[\s\-]/g, '');
}

/** @return {'一致'|'不一致'|'読取不可'|'正解なし'} */
function judgeField(key, extracted, truth) {
  var t = compareKey(key, truth);
  if (!t) return '正解なし';
  var e = compareKey(key, extracted);
  if (!e) return '読取不可';
  return e === t ? '一致' : '不一致';
}

/**
 * 精度テストの明細から項目別の集計を作る。
 * @param {Array<{key:string, handwritten:boolean, extracted:*, truth:*, result:string, flagged:boolean}>} details
 * @param {Object} correctionCounts 項目キー → 確認で直した件数
 */
function summarizeAccuracy(details, correctionCounts) {
  var byKey = {};
  details.forEach(function (d) {
    if (d.result === '正解なし') return;
    var s = byKey[d.key] = byKey[d.key] || { key: d.key, total: 0, match: 0, flagged: 0, silentErrors: 0, examples: [] };
    s.total++;
    if (d.result === '一致') s.match++;
    if (d.flagged) s.flagged++;
    if (d.result !== '一致') {
      if (!d.flagged) s.silentErrors++;
      if (s.examples.length < 3) s.examples.push('「' + (d.extracted === '' ? '(空欄)' : d.extracted) + '」→正「' + d.truth + '」');
    }
  });
  return FIELDS.filter(function (f) { return byKey[f.key]; }).map(function (f) {
    var s = byKey[f.key];
    var handwritten = HANDWRITTEN_KEYS.indexOf(f.key) !== -1;
    var rate = s.total ? s.match / s.total : 0;
    var verdict;
    if (handwritten) verdict = rate >= 0.5 ? 'AIが下書きし、人が必ず承認' : '下書きが役に立たない水準なら手入力に戻す';
    else verdict = rate >= ACCURACY_TARGET ? '自動反映（疑わしいものだけ確認）' : '全件確認、または原因を改善して再テスト';
    return {
      key: f.key, label: f.label, kind: handwritten ? '手書き' : '活字',
      total: s.total, match: s.match, rate: rate,
      flaggedRate: s.total ? s.flagged / s.total : 0,
      silentErrors: s.silentErrors,
      corrections: (correctionCounts && correctionCounts[f.key]) || 0,
      verdict: verdict, examples: s.examples.join(' ／ ')
    };
  });
}

// =====================================================================
// 6. シート共通処理（見出しによる列解決）
// =====================================================================

function getHeaders_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
}

function getVehicleColumns_(sheet) {
  return resolveColumns(getHeaders_(sheet));
}

/** データが入っている最終行（OCN・車台番号・車種のいずれかが入っている行） */
function lastDataRow_(sheet, colMap) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  var keys = ['ocn', 'chassisNumber', 'carName'].filter(function (k) { return colMap[k] !== undefined; });
  if (!keys.length) return lastRow;
  var last = 1;
  keys.forEach(function (k) {
    var values = sheet.getRange(2, colMap[k] + 1, lastRow - 1, 1).getValues();
    for (var i = values.length - 1; i >= 0; i--) {
      if (!isBlank(values[i][0])) { last = Math.max(last, i + 2); break; }
    }
  });
  return last;
}

/**
 * 車両シート（輸入車・国産車・販売済み）の全データを読み、OCN・車台番号・登録番号で引ける索引を作る。
 */
function buildVehicleIndex_(ss, settings) {
  var index = {
    byOcn: {}, byChassis: {}, byPlate: {}, ocns: [],
    findOcn: function (ocn) { return isBlank(ocn) ? null : (this.byOcn[ocnKey(ocn, settings.ocnPrefix)] || null); }
  };
  VEHICLE_SHEETS.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;
    var cols = getVehicleColumns_(sheet).map;
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    values.forEach(function (row, i) {
      var rec = { sheet: name, row: i + 2, values: {} };
      FIELDS.forEach(function (f) { if (cols[f.key] !== undefined) rec.values[f.key] = row[cols[f.key]]; });
      var ocn = isBlank(rec.values.ocn) ? '' : toHalfWidth(rec.values.ocn).trim();
      if (!ocn && isBlank(rec.values.chassisNumber)) return;
      if (ocn) { index.byOcn[ocnKey(ocn, settings.ocnPrefix)] = rec; index.ocns.push(ocn); }
      var ck = chassisCompareKey(rec.values.chassisNumber);
      if (ck) index.byChassis[ck] = rec;
      var pk = plateKey_(rec.values);
      if (pk) index.byPlate[pk] = rec;
    });
  });
  return index;
}

function plateKey_(v) {
  if (isBlank(v.plateNumber) || isBlank(v.plateRegion)) return '';
  return [compareKey('plateRegion', v.plateRegion), compareKey('plateClass', v.plateClass),
    compareKey('plateKana', v.plateKana), compareKey('plateNumber', v.plateNumber)].join('|');
}

/** 書き込み先の行がシートの最大行を超える場合に行を足す */
function ensureRows_(sheet, lastNeededRow) {
  var max = sheet.getMaxRows();
  if (lastNeededRow > max) sheet.insertRowsAfter(max, lastNeededRow - max + 50);
}

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function timestamp_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmm');
}

// =====================================================================
// 7. セットアップ
// =====================================================================

/** セットアップ画面の初期表示用（APIキーは値を返さない） */
function getSetupState() {
  var s = getSettings_();
  return {
    company: s.company,
    hasGeminiKey: !!s.geminiKey,
    geminiModel: s.geminiModel,
    folderRoot: s.folderRoot,
    folderInbox: s.folderInbox,
    folderDone: s.folderDone,
    folderError: s.folderError,
    folderCert: s.folderCert,
    triggerMinutes: s.triggerMinutes,
    ocnPrefix: s.ocnPrefix,
    ocnDigits: s.ocnDigits,
    lossThreshold: s.lossThreshold,
    useDriveOcr: s.useDriveOcr,
    geminiIntervalSec: s.geminiIntervalSec,
    spreadsheetName: getSpreadsheet_().getName()
  };
}

/**
 * セットアップの実行。既存シート・既存データは上書きせず、不足分だけを追加する。
 * @param {Object} form Setup.html の入力値
 * @return {{ok:boolean, report:Array<string>}}
 */
function runSetup(form) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('他の処理が実行中です。しばらくしてから再実行してください。');
  var report = [];
  try {
    var ss = getSpreadsheet_();
    var props = PropertiesService.getScriptProperties();

    // --- バックアップ（既存シートがある場合） ---
    var hasExisting = VEHICLE_SHEETS.some(function (n) { return !!ss.getSheetByName(n); });
    if (form.backup !== false && hasExisting) {
      var copy = DriveApp.getFileById(ss.getId()).makeCopy(ss.getName() + '_バックアップ_' + timestamp_());
      report.push('バックアップを作成しました：' + copy.getName());
    }

    // --- 設定の保存 ---
    if (isBlank(form.company)) throw new Error('会社名を入力してください');
    var values = {};
    values[PROP.COMPANY] = String(form.company).trim();
    values[PROP.GEMINI_MODEL] = String(form.geminiModel || SETTING_DEFAULTS.GEMINI_MODEL).trim();
    values[PROP.TRIGGER_MINUTES] = String(Number(form.triggerMinutes) || 0);
    values[PROP.OCN_PREFIX] = String(form.ocnPrefix || '').trim();
    values[PROP.OCN_DIGITS] = String(Number(form.ocnDigits) || 0);
    values[PROP.LOSS_THRESHOLD] = String(Number(form.lossThreshold) || 0);
    values[PROP.USE_DRIVE_OCR] = form.useDriveOcr === false ? 'false' : 'true';
    if (form.geminiIntervalSec !== undefined && form.geminiIntervalSec !== '') values[PROP.GEMINI_INTERVAL] = String(Math.max(0, Number(form.geminiIntervalSec) || 0));
    if (!isBlank(form.geminiKey)) {
      values[PROP.GEMINI_KEY] = String(form.geminiKey).trim();
      report.push('Gemini APIキーをスクリプトプロパティに保存しました');
    }
    props.setProperties(values);

    // --- フォルダ ---
    setupFolders_(form, report);

    // --- シート ---
    VEHICLE_SHEETS.forEach(function (name) {
      var sheet = ensureVehicleSheet_(ss, name, report);
      applyVehicleSheetStandards_(sheet, report);
    });
    setupStagingSheet_(ss, report);
    ensureSimpleSheet_(ss, SHEET.ACCURACY, ['精度テスト結果'], report);
    ensureSimpleSheet_(ss, SHEET.LOG, LOG_HEADERS, report);

    // --- OCNの発行済み最大値を初期化 ---
    if (!props.getProperty(PROP.OCN_LAST)) {
      var settings = getSettings_();
      var idx = buildVehicleIndex_(ss, settings);
      var max = nextOcnNumber(idx.ocns, settings.ocnPrefix, 0) - 1;
      props.setProperty(PROP.OCN_LAST, String(max));
      report.push('OCNの採番を初期化しました（次の番号：' + formatOcn(max + 1, settings.ocnPrefix, settings.ocnDigits) + '）');
    }

    // --- トリガー ---
    setupTrigger_(Number(form.triggerMinutes) || 0, report);

    appendLog_('セットアップ', ss.getName(), '', '', '', report.join(' / '));
    return { ok: true, report: report };
  } finally {
    lock.releaseLock();
  }
}

function setupFolders_(form, report) {
  var props = PropertiesService.getScriptProperties();
  var company = String(form.company).trim();
  var defs = [
    { prop: PROP.FOLDER_INBOX, input: form.folderInbox, name: '受付' },
    { prop: PROP.FOLDER_DONE, input: form.folderDone, name: '処理済み' },
    { prop: PROP.FOLDER_ERROR, input: form.folderError, name: 'エラー' },
    { prop: PROP.FOLDER_CERT, input: form.folderCert, name: '車検証保管' }
  ];
  var root = null;
  function getRoot() {
    if (root) return root;
    var rootId = extractDriveId_(form.folderRoot) || props.getProperty(PROP.FOLDER_ROOT);
    if (rootId) {
      root = DriveApp.getFolderById(rootId);
    } else {
      root = DriveApp.createFolder('中古車書類_' + company);
      report.push('ドライブにフォルダを作成しました：' + root.getName());
    }
    props.setProperty(PROP.FOLDER_ROOT, root.getId());
    return root;
  }
  defs.forEach(function (d) {
    var id = extractDriveId_(d.input) || props.getProperty(d.prop);
    if (id) {
      var folder = DriveApp.getFolderById(id); // 存在確認（無ければ例外）
      props.setProperty(d.prop, folder.getId());
      return;
    }
    var parent = getRoot();
    var it = parent.getFoldersByName(d.name);
    var created = it.hasNext() ? it.next() : parent.createFolder(d.name);
    props.setProperty(d.prop, created.getId());
    report.push('フォルダ「' + d.name + '」を設定しました');
  });
}

/** フォルダURL・ID のどちらでも受け付ける */
function extractDriveId_(input) {
  if (isBlank(input)) return '';
  var s = String(input).trim();
  var m = s.match(/\/folders\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/) || s.match(/\/d\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : s;
}

function ensureVehicleSheet_(ss, name, report) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, STANDARD_HEADERS.length).setValues([STANDARD_HEADERS]);
    sheet.setFrozenRows(1);
    report.push('シート「' + name + '」を作成しました（A〜AC列）');
    return sheet;
  }
  var headers = getHeaders_(sheet);
  if (!headers.some(function (h) { return !isBlank(h); })) {
    sheet.getRange(1, 1, 1, STANDARD_HEADERS.length).setValues([STANDARD_HEADERS]);
    sheet.setFrozenRows(1);
    report.push('シート「' + name + '」に見出し行を設定しました');
    return sheet;
  }
  var res = resolveColumns(headers);
  if (name === SHEET.SOLD && !isStandardLayout(headers)) {
    report.push('「販売済み」の列配置がマスタと異なります。メニュー「販売済みシートの列統一（移行ツール）」を実行してください');
    return sheet;
  }
  if (res.missing.length) {
    var labels = res.missing.map(function (k) { return FIELD_BY_KEY[k].label; });
    sheet.getRange(1, headers.length + 1, 1, labels.length).setValues([labels]);
    report.push('「' + name + '」に不足していた列を右端に追加しました：' + labels.join('、'));
  }
  return sheet;
}

/** プルダウン・保護・計算式の列を整える（既存の値・式は上書きしない） */
function applyVehicleSheetStandards_(sheet, report) {
  var headers = getHeaders_(sheet);
  var res = resolveColumns(headers);
  var cols = res.map;
  var maxRows = Math.max(sheet.getMaxRows() - 1, 1);

  [['status', STATUS_OPTIONS], ['category', CATEGORY_OPTIONS]].forEach(function (pair) {
    var c = cols[pair[0]];
    if (c === undefined) return;
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(pair[1], true).setAllowInvalid(true).build();
    sheet.getRange(2, c + 1, maxRows, 1).setDataValidation(rule);
    if (sheet.getLastRow() >= 2) {
      var vals = sheet.getRange(2, c + 1, sheet.getLastRow() - 1, 1).getValues();
      var outside = vals.filter(function (r) { return !isBlank(r[0]) && pair[1].indexOf(String(r[0])) === -1; }).length;
      if (outside) report.push('「' + sheet.getName() + '」の' + FIELD_BY_KEY[pair[0]].label + 'に選択肢外の値が' + outside + '件あります（値はそのまま残しています）');
    }
  });

  // 見出し行と OCN 列の保護（警告のみ。誤編集の防止が目的）
  var existing = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).map(function (p) { return p.getDescription(); });
  if (existing.indexOf('見出し行の保護') === -1) {
    sheet.getRange(1, 1, 1, sheet.getMaxColumns()).protect().setDescription('見出し行の保護').setWarningOnly(true);
  }
  if (cols.ocn !== undefined && existing.indexOf('OCNの保護') === -1) {
    sheet.getRange(2, cols.ocn + 1, maxRows, 1).protect().setDescription('OCNの保護').setWarningOnly(true);
    sheet.getRange(2, cols.ocn + 1, maxRows, 1).setNumberFormat('@');
  }

  // 計算式の列：見出し行に ARRAYFORMULA を1つ置く方式へ（既存の式・値は上書きしない）
  FIELDS.filter(function (f) { return f.source === 'formula'; }).forEach(function (f) {
    var c = cols[f.key];
    if (c === undefined) return;
    var label = '「' + sheet.getName() + '」の' + f.label + '：';
    var header = sheet.getRange(1, c + 1);
    if (header.getFormula()) return;
    var formula = buildArrayFormula(f.key, cols);
    if (!formula) { report.push(label + '計算式が未確定のため設定していません（企画書 第10章の確認事項）'); return; }
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var range = sheet.getRange(2, c + 1, lastRow - 1, 1);
      if (range.getFormulas().some(function (r) { return r[0]; })) {
        report.push(label + '各行に既存の式があるため切替していません（新しい行には上の行の式を引き継ぎます）');
        return;
      }
      if (range.getValues().some(function (r) { return !isBlank(r[0]); })) {
        report.push(label + '値が入力済みのため切替していません');
        return;
      }
    }
    header.setFormula(formula);
    report.push(label + '見出し行に ARRAYFORMULA を設定しました');
  });
}

function setupStagingSheet_(ss, report) {
  var sheet = ss.getSheetByName(SHEET.STAGING);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET.STAGING);
    sheet.getRange(1, 1, 1, STAGE_HEADERS.length).setValues([STAGE_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(4);
    report.push('シート「' + SHEET.STAGING + '」を作成しました');
  } else {
    var headers = getHeaders_(sheet);
    var missing = STAGE_HEADERS.filter(function (h) { return headers.indexOf(h) === -1; });
    if (missing.length) {
      sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
      report.push('「' + SHEET.STAGING + '」に不足していた列を追加しました：' + missing.join('、'));
    }
  }
  var cols = stagingColumns_(sheet);
  var rows = Math.max(sheet.getMaxRows() - 1, 1);
  // insertCheckboxes() は既存の値をすべて未チェックに戻すため、入力規則だけを設定する
  sheet.getRange(2, cols['承認'] + 1, rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  sheet.getRange(2, cols['登録先'] + 1, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(MASTER_SHEETS, true).setAllowInvalid(true).build());
  sheet.getRange(2, cols['対象OCN'] + 1, rows, 1).setNumberFormat('@');
  sheet.getRange(2, cols[FIELD_BY_KEY.category.label] + 1, rows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CATEGORY_OPTIONS, true).setAllowInvalid(true).build());
  ['plateClass', 'plateNumber', 'chassisNumber'].forEach(function (k) {
    sheet.getRange(2, cols[FIELD_BY_KEY[k].label] + 1, rows, 1).setNumberFormat('@');
  });
  sheet.hideColumns(cols['読取結果'] + 1);
  sheet.hideColumns(cols['ファイルID'] + 1);
}

function ensureSimpleSheet_(ss, name, headers, report) {
  var sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(name);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  report.push('シート「' + name + '」を作成しました');
  return sheet;
}

function setupTrigger_(minutes, report) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'scheduledImport') ScriptApp.deleteTrigger(t);
  });
  if (!minutes) { report.push('取込の定期実行：なし（手動取込のみ）'); return; }
  var builder = ScriptApp.newTrigger('scheduledImport').timeBased();
  if (minutes >= 60) builder.everyHours(Math.round(minutes / 60));
  else builder.everyMinutes([1, 5, 10, 15, 30].filter(function (m) { return m <= minutes; }).pop() || 5);
  builder.create();
  report.push('取込の定期実行トリガーを設定しました（' + minutes + '分ごと）');
}

// =====================================================================
// 8. 販売済みシートの列統一（移行ツール）
// =====================================================================

function migrateSoldSheetFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET.SOLD);
  if (!sheet) { ui.alert('「' + SHEET.SOLD + '」シートがありません。先に初期セットアップを実行してください。'); return; }
  var plan = planSoldMigration_(getHeaders_(sheet));
  if (plan.alreadyStandard) { ui.alert('「' + SHEET.SOLD + '」は既にマスタと同じ列構成（A〜AC）です。'); return; }
  var answer = ui.alert('販売済みシートの列統一',
    '次の対応で列を並べ替えます。移行前のシートはバックアップとして残します。\n\n' + plan.description + '\n\n実行しますか？',
    ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) return;
  var result = migrateSoldSheet_();
  ui.alert('販売済みシートの列統一', result.join('\n'), ui.ButtonSet.OK);
}

/** 移行計画（標準の各列 ← 現行のどの列か） */
function planSoldMigration_(headers) {
  var res = resolveColumns(headers);
  var lines = FIELDS.map(function (f, i) {
    var src = res.map[f.key];
    var note = f.source === 'formula' && FORMULA_DEFS[f.key] ? '（計算式で再計算）' : '';
    return columnLetter(i + 1) + ' ' + f.label + ' ← ' + (src === undefined ? '（該当なし・空欄）' : columnLetter(src + 1) + '「' + headers[src] + '」') + note;
  });
  if (res.unknown.length) {
    lines.push('標準にない列（AD列以降に残します）：' + res.unknown.map(function (u) { return columnLetter(u.index + 1) + '「' + u.label + '」'; }).join('、'));
  }
  return { alreadyStandard: isStandardLayout(headers), description: lines.join('\n'), resolved: res };
}

function migrateSoldSheet_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('他の処理が実行中です');
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(SHEET.SOLD);
    var headers = getHeaders_(sheet);
    var plan = planSoldMigration_(headers);
    var res = plan.resolved;
    var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();

    var backup = sheet.copyTo(ss).setName(SHEET.SOLD + '_移行前_' + timestamp_());
    var data = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
    var linkCol = res.map.certLink;
    var links = (lastRow >= 2 && linkCol !== undefined) ? sheet.getRange(2, linkCol + 1, lastRow - 1, 1).getRichTextValues() : [];

    var outHeaders = STANDARD_HEADERS.concat(res.unknown.map(function (u) { return u.label; }));
    var out = [], outLinks = [];
    data.forEach(function (row, r) {
      if (row.every(function (v) { return isBlank(v); })) return;
      var newRow = FIELDS.map(function (f) {
        if (f.source === 'formula' && FORMULA_DEFS[f.key]) return ''; // 見出しの ARRAYFORMULA で再計算
        var src = res.map[f.key];
        return src === undefined ? '' : row[src];
      });
      res.unknown.forEach(function (u) { newRow.push(row[u.index]); });
      out.push(newRow);
      outLinks.push(links[r] ? links[r][0] : null);
    });

    sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) { p.remove(); });
    sheet.clear();
    sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).clearDataValidations();
    sheet.getRange(1, 1, 1, outHeaders.length).setValues([outHeaders]);
    sheet.setFrozenRows(1);
    if (out.length) {
      sheet.getRange(2, 1, out.length, outHeaders.length).setValues(out);
      var linkIdx = FIELD_BY_KEY.certLink ? STANDARD_HEADERS.indexOf(FIELD_BY_KEY.certLink.label) : -1;
      if (linkIdx !== -1 && outLinks.some(function (l) { return l && l.getLinkUrl(); })) {
        sheet.getRange(2, linkIdx + 1, outLinks.length, 1).setRichTextValues(outLinks.map(function (l, i) {
          return [l || SpreadsheetApp.newRichTextValue().setText(String(out[i][linkIdx] || '')).build()];
        }));
      }
    }
    var report = ['バックアップ：「' + backup.getName() + '」', out.length + '行を標準の列構成（A〜AC）へ移行しました'];
    applyVehicleSheetStandards_(sheet, report);
    appendLog_('移行', SHEET.SOLD, '', headers.join(','), outHeaders.join(','), report.join(' / '));
    return report;
  } finally {
    lock.releaseLock();
  }
}

// =====================================================================
// 9. 書類取込（Gemini・Drive OCR・2段階登録）
// =====================================================================

/** 時間主導トリガーから呼ばれる定期取込 */
function scheduledImport() {
  var started = Date.now();
  var settings = getSettings_();
  try {
    requireSettings_(settings);
  } catch (e) {
    console.warn(e.message);
    return;
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // 前回の取込が実行中
  try {
    var files = listInboxFiles_(settings);
    for (var i = 0; i < files.length; i++) {
      if (Date.now() - started > RUN_BUDGET_MS) break;
      var result = processInboxFileSafely_(files[i], settings);
      if (result.quota) break; // 上限に達したら残りは次回の実行で取り込む
    }
  } finally {
    lock.releaseLock();
  }
}

/** Import.html：受付フォルダのファイル一覧 */
function getInboxFiles() {
  var settings = getSettings_();
  requireSettings_(settings);
  return listInboxFiles_(settings).map(function (f) { return { id: f.getId(), name: f.getName() }; });
}

/** Import.html：1ファイルずつ取込（画面側でループして進捗を表示） */
function importFileNow(fileId) {
  var settings = getSettings_();
  requireSettings_(settings);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(120000)) throw new Error('他の取込処理が実行中です。しばらくしてから再実行してください。');
  try {
    var file = DriveApp.getFileById(fileId);
    if (!isInFolder_(file, settings.folderInbox)) return { ok: false, skipped: true, message: '受付フォルダに無いためスキップ（処理済み）' };
    return processInboxFileSafely_(file, settings);
  } finally {
    lock.releaseLock();
  }
}

function listInboxFiles_(settings) {
  var it = DriveApp.getFolderById(settings.folderInbox).getFiles();
  var files = [];
  while (it.hasNext()) files.push(it.next());
  files.sort(function (a, b) { return a.getDateCreated().getTime() - b.getDateCreated().getTime(); });
  return files;
}

function isInFolder_(file, folderId) {
  var parents = file.getParents();
  while (parents.hasNext()) if (parents.next().getId() === folderId) return true;
  return false;
}

function processInboxFileSafely_(file, settings) {
  var name = file.getName();
  try {
    var result = processInboxFile_(file, settings);
    appendLog_('取込', name, result.kind, '', result.ocn || '', result.message);
    return { ok: true, message: name + '：' + result.message };
  } catch (e) {
    if (e.quota) {
      // 書類の問題ではないので受付フォルダに残し、上限が戻ったら再取込する
      appendLog_('API上限', name, '取込', '', '', e.message);
      return { ok: false, quota: true, message: name + '：' + e.message + '（書類は受付フォルダに残しています）' };
    }
    try { file.moveTo(DriveApp.getFolderById(settings.folderError)); } catch (moveErr) { console.error(moveErr); }
    appendLog_('エラー', name, '取込', '', '', e.message);
    return { ok: false, message: name + '：エラー（' + e.message + '）→ エラーフォルダへ移動しました' };
  }
}

/** メニュー：エラーフォルダの書類を受付フォルダに戻す（API上限などで移された書類の再取込用） */
function restoreErrorFilesFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var settings = getSettings_();
  requireSettings_(settings);
  var it = DriveApp.getFolderById(settings.folderError).getFiles();
  var files = [];
  while (it.hasNext()) files.push(it.next());
  if (!files.length) { ui.alert('エラーフォルダに書類はありません。'); return; }
  var answer = ui.alert('エラーフォルダの書類を受付に戻す',
    files.length + '件を受付フォルダに戻します。次の取込で再度読み取ります。よろしいですか？\n\n' +
    files.slice(0, 10).map(function (f) { return '・' + f.getName(); }).join('\n') + (files.length > 10 ? '\n…ほか' + (files.length - 10) + '件' : ''),
    ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) return;
  var inbox = DriveApp.getFolderById(settings.folderInbox);
  files.forEach(function (f) { f.moveTo(inbox); });
  appendLog_('再取込', 'エラーフォルダ', '', '', files.length + '件', '受付フォルダに戻しました');
  ui.alert(files.length + '件を受付フォルダに戻しました。');
}

/**
 * 1ファイルの取込。
 *  - 注文書＋査定書 → 仮登録（OCN・仕入年月日を採番）
 *  - 車検証 → 本登録（該当する仮登録・マスタ行を探す。無ければ紐付け待ち）
 * マスタには書かず、取込待ちシートに1行追加する。
 */
function processInboxFile_(file, settings) {
  var extraction = extractFromFile_(file, settings);
  var record = buildRecord(extraction.docs, {
    ocrText: extraction.ocrText, today: new Date(), lossThreshold: settings.lossThreshold
  });
  if (record.error) throw new Error(record.error);

  var ss = getSpreadsheet_();
  var stage = { kind: record.kind, targetOcn: '', targetSheet: record.targetSheet, notes: [] };
  var destination;

  if (record.kind === KIND.PROVISIONAL) {
    stage.targetOcn = reserveOcn_(ss, settings);
    record.fields.purchaseDate = { value: formatDateYmd(new Date()), raw: '', source: '自動', flags: [] };
    if (!stage.targetSheet) stage.notes.push('登録先（輸入車／国産車）を選んでください');
    destination = record.docTypes.indexOf(DOC.CERT) !== -1 ? settings.folderCert : settings.folderDone;
  } else {
    var match = findVehicleForCert_(ss, settings, record);
    if (match) {
      stage.targetOcn = match.ocn;
      stage.targetSheet = match.sheet || stage.targetSheet;
      stage.notes.push('紐付け：' + match.via);
      (match.mismatches || []).forEach(function (m) {
        var f = record.fields[m.key];
        if (f.flags.indexOf(FLAG.CROSS_MISMATCH) === -1) f.flags.push(FLAG.CROSS_MISMATCH);
        if (record.flaggedKeys.indexOf(m.key) === -1) record.flaggedKeys.push(m.key);
        record.warnings.push(m.message);
        record.confidence = '低';
      });
      if (!(match.mismatches || []).length) record.agreements++;
    } else {
      stage.kind = KIND.UNLINKED;
      stage.notes.push('該当する仮登録が見つかりません。対象OCNを入力して紐付けてください');
    }
    destination = settings.folderCert;
  }

  appendStagingRow_(ss, record, stage, file, extraction);
  // 取込待ちに記録できてから受付フォルダの外へ移す（途中で失敗しても書類を見失わない）
  if (record.kind === KIND.PROVISIONAL) file.setName(stage.targetOcn + '_' + file.getName());
  file.moveTo(DriveApp.getFolderById(destination));
  return {
    kind: stage.kind, ocn: stage.targetOcn,
    message: stage.kind + (stage.targetOcn ? '（OCN ' + stage.targetOcn + '）' : '') + '・信頼度' + record.confidence +
      (record.flaggedKeys.length ? '・要確認' + record.flaggedKeys.length + '項目' : '')
  };
}

/**
 * Gemini と Drive OCR で同じファイルを読む（副作用なし。精度テストでも使う）。
 * @return {{docs:Array, ocrText:string|null, model:string}}
 */
function extractFromFile_(file, settings) {
  var blob = file.getBlob();
  var mime = blob.getContentType();
  if (SUPPORTED_MIME_TYPES.indexOf(mime) === -1) throw new Error('対応していないファイル形式です（' + mime + '）。PDF・JPEG・PNGでスキャンしてください');
  if (blob.getBytes().length > MAX_FILE_BYTES) throw new Error('ファイルが大きすぎます（18MBまで）');

  var docs = callGemini_(blob, settings);
  var ocrText = null;
  if (settings.useDriveOcr) {
    try {
      ocrText = driveOcrText_(file);
    } catch (e) {
      console.warn('Drive OCR 失敗: ' + e.message);
    }
  }
  return { docs: docs, ocrText: ocrText, model: settings.geminiModel };
}

var GEMINI_PROMPT = [
  'あなたは中古車販売店の書類読み取り担当です。添付ファイル（1〜複数ページ）に含まれる書類を判別し、記載内容を読み取ってJSONで返してください。',
  '',
  '## 書類の種類（type）',
  '- "注文書"：車両の注文書・下取／買取の注文書（手書きを含む）',
  '- "査定書"：査定書・査定表（活字）',
  '- "車検証"：自動車検査証、または自動車検査証記録事項',
  '- "その他"：上記以外',
  '1つのファイルに複数の書類が含まれることがあります。書類ごとに documents の要素を分けてください。同じ書類が複数ページにまたがる場合は1つにまとめてください。',
  '',
  '## 厳守事項',
  '- 書類に書かれている文字をそのまま転記してください。推測・補完・計算・言い換えは禁止です。',
  '- 読めない・かすれている・記載がない項目は value を null、readable を false にしてください。',
  '- 1文字でも自信がない場合は readable を false にし、読めた範囲だけを value に入れてください。',
  '- 手書きで記入されている項目は handwritten を true にしてください。',
  '- 車台番号にハイフンが含まれていても、それは車台番号です（国産車の例：ZVW30-1234567）。型式（例：DAA-ZVW30）とは別の欄です。必ず「車台番号」欄の値を chassisNumber に入れてください。',
  '- 輸入車の車台番号は17桁の英数字です（例：WDD2130042A123456）。',
  '- 日付は書類の表記のまま返してください（例：令和5年4月1日、R5.4.1、2023/4/1）。',
  '- 金額・走行距離は書類の表記のまま（単位・カンマを含めて）返してください。',
  '- 登録番号（ナンバー）は地域名・分類番号・ひらがな・一連番号の4つに分けてください（例：品川 / 330 / さ / 12-34）。',
  '',
  '## 書類ごとの項目（fields のキー）',
  '注文書: staff(担当者), category(区分：買取・仕入・下取・オークションのいずれかの記載), customerName(お客様名), tradeInPrice(下取価格), tradeInAllowance(下取充当額), purchasePrice(仕入価格・買取価格), carName(車種), chassisNumber(車台番号)',
  '査定書: carName(車種・車名), modelName(モデル名・グレード), color(色), mileage(走行距離), recycleFee(リサイクル預託金), appraisalPrice(査定価格), chassisNumber(車台番号), plateRegion, plateClass, plateKana, plateNumber',
  '車検証: chassisNumber(車台番号), modelCode(型式), makerName(車名), firstRegDate(初度登録年月), inspectionExpiry(有効期間の満了する日), plateRegion, plateClass, plateKana, plateNumber, ownerName(所有者の氏名又は名称), ownerAddress(所有者の住所), userName(使用者の氏名又は名称), userAddress(使用者の住所), certFormat("券面" または "記録事項" または "従来型")',
  '',
  '## 出力形式（JSONのみ。説明文は不要）',
  '{"documents":[{"type":"査定書","pages":[1],"fields":{"carName":{"value":"...","readable":true,"handwritten":false}}}]}'
].join('\n');

function callGemini_(blob, settings) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(settings.geminiModel) + ':generateContent';
  var payload = {
    contents: [{
      role: 'user',
      parts: [
        { text: GEMINI_PROMPT },
        { inline_data: { mime_type: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) } }
      ]
    }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' }
  };
  var options = {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-goog-api-key': settings.geminiKey },
    payload: JSON.stringify(payload)
  };
  var serverErrorWaits = [2000, 4000, 8000];
  var quotaRetries = 0;
  for (var attempt = 0; ; attempt++) {
    waitForGeminiSlot_(settings);
    var res = UrlFetchApp.fetch(url, options);
    var code = res.getResponseCode();
    if (code === 200) {
      var body = JSON.parse(res.getContentText());
      var parts = (((body.candidates || [])[0] || {}).content || {}).parts || [];
      var text = parts.map(function (p) { return p.text || ''; }).join('');
      return parseGeminiDocuments(text);
    }
    if (code === 429) {
      var info = parseGeminiQuotaError(res.getContentText(), settings.geminiModel);
      // 1分あたりの上限だけは、指示された待ち時間（60秒まで）を空けて2回まで再試行する
      if (info.scope === 'minute' && quotaRetries < 2 && info.retryDelaySec <= 60) {
        quotaRetries++;
        Utilities.sleep((info.retryDelaySec + 2) * 1000);
        continue;
      }
      var err = new Error(info.message);
      err.quota = true;
      err.scope = info.scope;
      throw err;
    }
    if (code >= 500 && attempt < serverErrorWaits.length) {
      Utilities.sleep(serverErrorWaits[attempt]);
      continue;
    }
    throw new Error('Gemini API エラー（HTTP ' + code + '）：' + res.getContentText().substring(0, 300));
  }
}

/** 前回の呼び出しから設定の間隔（秒）が空くまで待つ（手動取込・定期取込・精度テストで共通） */
function waitForGeminiSlot_(settings) {
  var intervalMs = (settings.geminiIntervalSec || 0) * 1000;
  var props = PropertiesService.getScriptProperties();
  if (intervalMs > 0) {
    var last = Number(props.getProperty(PROP.GEMINI_LAST_CALL)) || 0;
    var wait = last + intervalMs - Date.now();
    if (wait > 0) Utilities.sleep(Math.min(wait, intervalMs));
  }
  props.setProperty(PROP.GEMINI_LAST_CALL, String(Date.now()));
}

/**
 * Gemini の 429 応答を読み、上限の種類と日本語の説明を返す。
 * @return {{scope:'minute'|'day'|'zero'|'unknown', retryDelaySec:number, limit:(number|null), metric:string, message:string}}
 */
function parseGeminiQuotaError(text, model) {
  var body = {};
  try { body = JSON.parse(text) || {}; } catch (e) { body = {}; }
  var err = body.error || {};
  var raw = String(err.message || text || '');
  var details = err.details || [];
  var retryDelaySec = 0, violations = [];
  details.forEach(function (d) {
    var type = String(d['@type'] || '');
    if (/RetryInfo$/.test(type) && d.retryDelay) retryDelaySec = parseFloat(String(d.retryDelay)) || 0;
    if (/QuotaFailure$/.test(type)) {
      (d.violations || []).forEach(function (v) {
        violations.push({
          id: String(v.quotaId || '') + ' ' + String(v.quotaMetric || ''),
          metric: String(v.quotaMetric || ''),
          limit: (v.quotaValue === undefined || v.quotaValue === '') ? null : Number(v.quotaValue)
        });
      });
    }
  });
  if (!retryDelaySec) {
    var r = raw.match(/retry in ([\d.]+)s/i);
    if (r) retryDelaySec = parseFloat(r[1]);
  }
  if (!violations.length) {
    // details が無い応答は本文の「metric: … limit: …」から読む
    var re = /metric:\s*([^\s,]+)[^\n]*?limit:\s*(\d+)/g, m;
    while ((m = re.exec(raw))) violations.push({ id: m[1], metric: m[1], limit: Number(m[2]) });
  }

  // 複数の上限に同時に当たった場合は、回復に時間がかかる方を優先する
  var pick = function (test) { return violations.filter(test)[0]; };
  var hit = pick(function (v) { return v.limit === 0; });
  var scope = hit ? 'zero' : 'unknown';
  if (!hit) { hit = pick(function (v) { return /PerDay|per_day|daily/i.test(v.id); }); if (hit) scope = 'day'; }
  if (!hit) { hit = pick(function (v) { return /PerMinute|per_minute/i.test(v.id); }); if (hit) scope = 'minute'; }
  if (!hit && retryDelaySec > 0 && retryDelaySec <= 120) scope = 'minute';
  hit = hit || violations[0] || { metric: '', limit: null };
  var metric = hit.metric, limit = hit.limit;

  var message;
  if (scope === 'zero') {
    message = 'Gemini APIの上限：このAPIキーのプロジェクトでは、モデル「' + model + '」の無料枠がありません（上限0）。' +
      'Google AI Studio で課金（従量課金）を有効にするか、セットアップでモデルを「gemini-2.5-flash-lite」などに変更してください';
  } else if (scope === 'day') {
    message = 'Gemini APIの上限：モデル「' + model + '」の1日あたりの上限に達しました。上限は日本時間の16〜17時ごろに戻ります。' +
      '件数が多い場合は課金を有効にしてください';
  } else if (scope === 'minute') {
    message = 'Gemini APIの上限：1分あたりの上限に達しました。少し待ってから再実行してください（セットアップの「Gemini呼び出し間隔」を長くすると起きにくくなります）';
  } else {
    message = 'Gemini APIの上限に達しました（詳細：' + raw.substring(0, 200) + '）';
  }
  if (metric) message += '［' + metric + (limit !== null ? '・上限' + limit : '') + '］';
  return { scope: scope, retryDelaySec: retryDelaySec, limit: limit, metric: metric, message: message };
}

/** Gemini の応答テキスト（JSON）を書類の配列にする */
function parseGeminiDocuments(text) {
  var s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  var parsed;
  try {
    parsed = JSON.parse(s);
  } catch (e) {
    var m = s.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Gemini の応答を解釈できませんでした');
    parsed = JSON.parse(m[0]);
  }
  var docs = Array.isArray(parsed) ? parsed : (parsed.documents || []);
  return docs.map(function (d) {
    var fields = {};
    Object.keys(d.fields || {}).forEach(function (k) {
      var f = d.fields[k];
      if (f === null || typeof f !== 'object') f = { value: f, readable: !isBlank(f) };
      fields[k] = {
        value: isBlank(f.value) ? null : f.value,
        readable: f.readable !== false && !isBlank(f.value),
        handwritten: !!f.handwritten
      };
    });
    return { type: String(d.type || DOC.OTHER).trim(), pages: d.pages || [], fields: fields };
  });
}

/**
 * Google ドライブ標準の OCR（Googleドキュメントへの変換）でテキストを取り出す。
 * 一時ドキュメントは読み取り後に削除する。
 */
function driveOcrText_(file) {
  var token = ScriptApp.getOAuthToken();
  var headers = { Authorization: 'Bearer ' + token };
  var copyRes = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + file.getId() + '/copy?ocrLanguage=ja&supportsAllDrives=true&fields=id', {
    method: 'post', contentType: 'application/json', headers: headers, muteHttpExceptions: true,
    payload: JSON.stringify({ name: 'tmp_ocr_' + file.getName(), mimeType: 'application/vnd.google-apps.document' })
  });
  if (copyRes.getResponseCode() !== 200) throw new Error('OCR変換に失敗（HTTP ' + copyRes.getResponseCode() + '）');
  var docId = JSON.parse(copyRes.getContentText()).id;
  try {
    var textRes = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + docId + '/export?mimeType=text/plain', {
      headers: headers, muteHttpExceptions: true
    });
    if (textRes.getResponseCode() !== 200) throw new Error('OCRテキストの取得に失敗（HTTP ' + textRes.getResponseCode() + '）');
    return textRes.getContentText();
  } finally {
    UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + docId + '?supportsAllDrives=true', {
      method: 'delete', headers: headers, muteHttpExceptions: true
    });
  }
}

/** OCN を1つ予約する（マスタ・販売済み・取込待ちの最大値と発行済み最大値の大きい方 + 1） */
function reserveOcn_(ss, settings) {
  var props = PropertiesService.getScriptProperties();
  var existing = buildVehicleIndex_(ss, settings).ocns;
  var staging = readStaging_(ss);
  staging.rows.forEach(function (r) { if (!isBlank(r.meta['対象OCN'])) existing.push(String(r.meta['対象OCN'])); });
  var n = nextOcnNumber(existing, settings.ocnPrefix, props.getProperty(PROP.OCN_LAST));
  props.setProperty(PROP.OCN_LAST, String(n));
  return formatOcn(n, settings.ocnPrefix, settings.ocnDigits);
}

/**
 * 車検証に該当する車両を探す（車台番号 → 登録番号の順）。
 * マスタ・販売済みに加え、未転記の仮登録行も対象にする。
 */
function findVehicleForCert_(ss, settings, record) {
  var chassisKey = chassisCompareKey(record.fields.chassisNumber.value);
  var plateK = plateKey_({
    plateRegion: record.fields.plateRegion.value, plateClass: record.fields.plateClass.value,
    plateKana: record.fields.plateKana.value, plateNumber: record.fields.plateNumber.value
  });
  var index = buildVehicleIndex_(ss, settings);
  var candidates = [];
  var staging = readStaging_(ss);
  staging.rows.forEach(function (r) {
    if (r.meta['種別'] !== KIND.PROVISIONAL || r.meta['状態'] === STAGE_STATE.REJECTED || r.meta['状態'] === STAGE_STATE.DONE) return;
    candidates.push({ ocn: String(r.meta['対象OCN']), sheet: r.meta['登録先'], values: r.fields, via: '取込待ちの仮登録' });
  });

  function mismatchesOf(values) {
    var list = [];
    var mk = chassisCompareKey(values.chassisNumber);
    if (chassisKey && mk && mk !== chassisKey) {
      list.push({ key: 'chassisNumber', message: '車台番号が仮登録と不一致：車検証「' + record.fields.chassisNumber.value + '」／登録済み「' + values.chassisNumber + '」' });
    }
    var pk = plateKey_(values);
    if (plateK && pk && pk !== plateK) {
      list.push({ key: 'plateNumber', message: '登録番号が仮登録と不一致' });
    }
    return list;
  }

  if (chassisKey) {
    if (index.byChassis[chassisKey]) {
      var rec = index.byChassis[chassisKey];
      return { ocn: String(rec.values.ocn), sheet: rec.sheet, via: rec.sheet + '（車台番号一致）', mismatches: mismatchesOf(rec.values) };
    }
    for (var i = 0; i < candidates.length; i++) {
      if (chassisCompareKey(candidates[i].values.chassisNumber) === chassisKey) {
        return { ocn: candidates[i].ocn, sheet: candidates[i].sheet, via: candidates[i].via + '（車台番号一致）', mismatches: mismatchesOf(candidates[i].values) };
      }
    }
  }
  if (plateK) {
    if (index.byPlate[plateK]) {
      var p = index.byPlate[plateK];
      return { ocn: String(p.values.ocn), sheet: p.sheet, via: p.sheet + '（登録番号一致）', mismatches: mismatchesOf(p.values) };
    }
    for (var j = 0; j < candidates.length; j++) {
      if (plateKey_(candidates[j].values) === plateK) {
        return { ocn: candidates[j].ocn, sheet: candidates[j].sheet, via: candidates[j].via + '（登録番号一致）', mismatches: mismatchesOf(candidates[j].values) };
      }
    }
  }
  return null;
}

// =====================================================================
// 10. 取込待ちシートと確認画面API
// =====================================================================

function getStagingSheet_(ss) {
  var sheet = (ss || getSpreadsheet_()).getSheetByName(SHEET.STAGING);
  if (!sheet) throw new Error('「' + SHEET.STAGING + '」シートがありません。初期セットアップを実行してください。');
  return sheet;
}

/** 取込待ちの見出し → 列番号（0始まり） */
function stagingColumns_(sheet) {
  var headers = getHeaders_(sheet);
  var map = {};
  headers.forEach(function (h, i) { if (map[h] === undefined) map[h] = i; });
  STAGE_HEADERS.forEach(function (h) {
    if (map[h] === undefined) throw new Error('「' + SHEET.STAGING + '」に列「' + h + '」がありません。初期セットアップを再実行してください。');
  });
  return map;
}

/** 取込待ちシート全体を読む */
function readStaging_(ss) {
  var sheet = getStagingSheet_(ss);
  var cols = stagingColumns_(sheet);
  var lastRow = sheet.getLastRow();
  var rows = [];
  if (lastRow >= 2) {
    var values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    values.forEach(function (row, i) {
      if (isBlank(row[cols['取込ID']])) return;
      var meta = {}, fields = {};
      STAGE_META_HEADERS.concat(STAGE_TAIL_HEADERS).forEach(function (h) { meta[h] = row[cols[h]]; });
      STAGE_FIELD_KEYS.forEach(function (k) { fields[k] = row[cols[FIELD_BY_KEY[k].label]]; });
      rows.push({ row: i + 2, meta: meta, fields: fields });
    });
  }
  return { sheet: sheet, cols: cols, rows: rows };
}

function appendStagingRow_(ss, record, stage, file, extraction) {
  var sheet = getStagingSheet_(ss);
  var cols = stagingColumns_(sheet);
  var width = sheet.getLastColumn();
  var row = [];
  for (var i = 0; i < width; i++) row.push('');

  var flaggedLabels = record.flaggedKeys.map(function (k) {
    return FIELD_BY_KEY[k].label + '（' + record.fields[k].flags.join('・') + '）';
  });
  var state = stage.kind === KIND.UNLINKED ? STAGE_STATE.UNLINKED : (record.flaggedKeys.length ? STAGE_STATE.CHECK : STAGE_STATE.NEW);
  var id = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyMMddHHmmss') + '-' + Math.floor(Math.random() * 900 + 100);

  row[cols['取込ID']] = id;
  row[cols['取込日時']] = new Date();
  row[cols['種別']] = stage.kind;
  row[cols['状態']] = state;
  row[cols['承認']] = false;
  row[cols['登録先']] = stage.targetSheet || '';
  row[cols['対象OCN']] = stage.targetOcn || '';
  row[cols['信頼度']] = record.confidence;
  row[cols['要確認項目']] = flaggedLabels.join('\n');
  row[cols['警告']] = record.warnings.join('\n');
  STAGE_FIELD_KEYS.forEach(function (k) {
    var f = record.fields[k];
    if (!f || (isBlank(f.value) && f.value !== 0)) return;
    row[cols[FIELD_BY_KEY[k].label]] = FIELD_BY_KEY[k].type === 'date' ? (ymdToDate(f.value) || f.value) : f.value;
  });
  row[cols['書類']] = record.docTypes.join('・');
  row[cols['ファイル']] = file.getUrl();
  row[cols['ファイルID']] = file.getId();
  row[cols['処理メモ']] = stage.notes.join('\n');
  var snapshot = { fields: {}, docs: record.docTypes, ocr: !!extraction.ocrText, model: extraction.model };
  Object.keys(record.fields).forEach(function (k) {
    snapshot.fields[k] = { v: record.fields[k].value, f: record.fields[k].flags, s: record.fields[k].source };
  });
  row[cols['読取結果']] = JSON.stringify(snapshot);

  var rowIndex = sheet.getLastRow() + 1;
  ensureRows_(sheet, rowIndex);
  sheet.getRange(rowIndex, 1, 1, width).setValues([row]);
  sheet.getRange(rowIndex, cols['承認'] + 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  record.flaggedKeys.forEach(function (k) {
    if (STAGE_FIELD_KEYS.indexOf(k) !== -1) sheet.getRange(rowIndex, cols[FIELD_BY_KEY[k].label] + 1).setBackground('#fff2cc');
  });
  return id;
}

/** 確認画面：確認対象（未完了）の行の一覧 */
function getReviewQueue() {
  var staging = readStaging_();
  var activeId = null;
  var active = SpreadsheetApp.getActiveSheet();
  if (active && active.getName() === SHEET.STAGING) {
    var r = active.getActiveRange() ? active.getActiveRange().getRow() : 0;
    staging.rows.forEach(function (x) { if (x.row === r) activeId = String(x.meta['取込ID']); });
  }
  var queue = staging.rows.filter(function (x) {
    return STAGE_OPEN_STATES.indexOf(String(x.meta['状態'])) !== -1 && x.meta['承認'] !== true;
  }).map(function (x) {
    return { id: String(x.meta['取込ID']), kind: x.meta['種別'], state: x.meta['状態'], ocn: String(x.meta['対象OCN'] || ''), carName: String(x.fields.carName || '') };
  });
  return { queue: queue, activeId: activeId };
}

/** 確認画面：1行分の内容（スキャン画像のプレビューURL・読取結果・要確認項目） */
function getReviewItem(id) {
  var staging = readStaging_();
  var item = findStagingRow_(staging, id);
  var snapshot = parseSnapshot_(item.meta['読取結果']);
  var fileId = String(item.meta['ファイルID'] || '');
  return {
    id: String(item.meta['取込ID']),
    row: item.row,
    kind: item.meta['種別'],
    state: item.meta['状態'],
    approved: item.meta['承認'] === true,
    targetSheet: item.meta['登録先'] || '',
    targetOcn: String(item.meta['対象OCN'] || ''),
    confidence: item.meta['信頼度'],
    warnings: String(item.meta['警告'] || ''),
    notes: String(item.meta['処理メモ'] || ''),
    docs: item.meta['書類'],
    fileUrl: item.meta['ファイル'],
    previewUrl: fileId ? 'https://drive.google.com/file/d/' + fileId + '/preview' : '',
    masterSheets: MASTER_SHEETS,
    fields: STAGE_FIELD_KEYS.map(function (k) {
      var f = FIELD_BY_KEY[k];
      var snap = snapshot.fields[k] || {};
      var v = item.fields[k];
      return {
        key: k, label: f.label, type: f.type, options: f.options || null,
        value: v instanceof Date ? formatDateYmd(v) : (isBlank(v) ? '' : String(v)),
        aiValue: isBlank(snap.v) ? '' : String(snap.v),
        flags: snap.f || [],
        source: snap.s || '',
        handwritten: HANDWRITTEN_KEYS.indexOf(k) !== -1
      };
    })
  };
}

/**
 * 確認画面：保存・承認・却下。
 * @param {string} id 取込ID
 * @param {{fields:Object, targetSheet:string, targetOcn:string}} payload
 * @param {'save'|'approve'|'reject'} action
 */
function saveReviewItem(id, payload, action) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('他の処理が実行中です');
  try {
    var staging = readStaging_();
    var item = findStagingRow_(staging, id);
    var sheet = staging.sheet, cols = staging.cols, row = item.row;
    if (String(item.meta['状態']) === STAGE_STATE.DONE) throw new Error('この行は転記済みのため変更できません');

    STAGE_FIELD_KEYS.forEach(function (k) {
      if (!payload.fields || !(k in payload.fields)) return;
      var value = toSheetValue_(k, payload.fields[k]);
      var cell = sheet.getRange(row, cols[FIELD_BY_KEY[k].label] + 1);
      var current = cell.getValue();
      if (compareKey(k, current) !== compareKey(k, value)) cell.setValue(value);
    });
    if (payload.targetSheet !== undefined) sheet.getRange(row, cols['登録先'] + 1).setValue(payload.targetSheet);
    if (payload.targetOcn !== undefined) sheet.getRange(row, cols['対象OCN'] + 1).setValue(String(payload.targetOcn).trim());

    if (action === 'approve') {
      var kind = item.meta['種別'];
      if ((kind === KIND.UNLINKED || kind === KIND.FINAL) && isBlank(payload.targetOcn)) throw new Error('対象OCNを入力してください');
      if (kind === KIND.PROVISIONAL && MASTER_SHEETS.indexOf(payload.targetSheet) === -1) throw new Error('登録先（輸入車マスタ／国産車マスタ）を選んでください');
      sheet.getRange(row, cols['承認'] + 1).setValue(true);
      sheet.getRange(row, cols['状態'] + 1).setValue(STAGE_STATE.APPROVED);
    } else if (action === 'reject') {
      sheet.getRange(row, cols['承認'] + 1).setValue(false);
      sheet.getRange(row, cols['状態'] + 1).setValue(STAGE_STATE.REJECTED);
      appendLog_('却下', String(item.meta['ファイル'] || ''), '', '', '', '取込ID ' + id);
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function findStagingRow_(staging, id) {
  for (var i = 0; i < staging.rows.length; i++) {
    if (String(staging.rows[i].meta['取込ID']) === String(id)) return staging.rows[i];
  }
  throw new Error('取込ID ' + id + ' が見つかりません');
}

function parseSnapshot_(json) {
  try { return JSON.parse(json || '{}') || { fields: {} }; } catch (e) { return { fields: {} }; }
}

/** 画面の入力値（文字列）をシートに書く値に変換する */
function toSheetValue_(key, input) {
  if (isBlank(input)) return '';
  var f = FIELD_BY_KEY[key];
  if (f.type === 'date') {
    var d = ymdToDate(input) || (parseJapaneseDate(input) || {}).date;
    if (!d) throw new Error(f.label + 'の日付を解釈できません：' + input);
    return d;
  }
  if (f.type === 'number') {
    var n = key === 'mileage' ? parseMileage(input) : parseAmount(input);
    if (n === null) throw new Error(f.label + 'は数値で入力してください：' + input);
    return n;
  }
  if (f.type === 'select' && f.options && f.options.indexOf(String(input)) === -1) {
    throw new Error(f.label + 'は選択肢（' + f.options.join('／') + '）から選んでください');
  }
  if (f.type === 'chassis') return normalizeChassisNumber(input).value;
  return String(input).trim();
}

// =====================================================================
// 11. マスタへの転記
// =====================================================================

/**
 * 承認済み（承認にチェック）の取込待ち行をマスタへ転記する。
 * 仮登録 → 新しい行を追加、本登録・紐付け待ち → 対象OCNの行に車検証の項目を反映。
 * 計算式の列・式が入っているセルには書き込まない。
 */
function transferApproved() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) throw new Error('他の処理が実行中です');
  try {
    var ss = getSpreadsheet_();
    var settings = getSettings_();
    var staging = readStaging_(ss);
    var targets = staging.rows.filter(function (r) {
      var st = String(r.meta['状態']);
      return r.meta['承認'] === true && st !== STAGE_STATE.DONE && st !== STAGE_STATE.REJECTED;
    });
    if (!targets.length) return { ok: true, done: 0, failed: 0, message: '転記対象（承認にチェックがあり未転記の行）はありません' };

    // 仮登録を先に（同じ回の本登録が参照できるように）
    targets.sort(function (a, b) { return (a.meta['種別'] === KIND.PROVISIONAL ? 0 : 1) - (b.meta['種別'] === KIND.PROVISIONAL ? 0 : 1); });

    var done = 0, messages = [];
    targets.forEach(function (item) {
      var cell = function (h) { return staging.sheet.getRange(item.row, staging.cols[h] + 1); };
      try {
        var result = item.meta['種別'] === KIND.PROVISIONAL
          ? insertProvisional_(ss, settings, item)
          : applyCertificate_(ss, settings, item);
        logCorrections_(item);
        cell('状態').setValue(STAGE_STATE.DONE);
        cell('処理メモ').setValue(appendLine_(item.meta['処理メモ'], result));
        appendLog_('転記', String(item.meta['対象OCN'] || ''), item.meta['種別'], '', '', result);
        done++;
      } catch (e) {
        cell('状態').setValue(STAGE_STATE.ERROR);
        cell('承認').setValue(false);
        cell('処理メモ').setValue(appendLine_(item.meta['処理メモ'], '転記エラー：' + e.message));
        appendLog_('エラー', String(item.meta['対象OCN'] || ''), '転記', '', '', e.message);
        messages.push('取込ID ' + item.meta['取込ID'] + '：' + e.message);
      }
    });
    var failed = targets.length - done;
    return {
      ok: failed === 0, done: done, failed: failed,
      message: done + '件を転記しました' + (failed ? '。' + failed + '件はエラー（取込待ちの処理メモを確認してください）\n' + messages.join('\n') : '')
    };
  } finally {
    lock.releaseLock();
  }
}

function appendLine_(base, line) {
  return isBlank(base) ? line : String(base) + '\n' + line;
}

/** 仮登録：マスタに新しい行を追加する */
function insertProvisional_(ss, settings, item) {
  var sheetName = String(item.meta['登録先'] || '');
  if (MASTER_SHEETS.indexOf(sheetName) === -1) throw new Error('登録先（輸入車マスタ／国産車マスタ）が未選択です');
  var ocn = String(item.meta['対象OCN'] || '').trim();
  if (!ocn) throw new Error('OCNがありません');

  var index = buildVehicleIndex_(ss, settings);
  if (index.findOcn(ocn)) throw new Error('OCN ' + ocn + ' は既に「' + index.findOcn(ocn).sheet + '」にあります');
  var ck = chassisCompareKey(item.fields.chassisNumber);
  if (ck && index.byChassis[ck]) throw new Error('車台番号が「' + index.byChassis[ck].sheet + '」のOCN ' + index.byChassis[ck].values.ocn + ' と重複しています');

  var sheet = ss.getSheetByName(sheetName);
  var cols = getVehicleColumns_(sheet).map;
  if (cols.ocn === undefined) throw new Error('「' + sheetName + '」にOCN列が見つかりません');
  var row = lastDataRow_(sheet, cols) + 1;
  ensureRows_(sheet, row);

  copyRowFormulas_(sheet, cols, row);
  var values = {};
  STAGE_FIELD_KEYS.forEach(function (k) { values[k] = item.fields[k]; });
  values.ocn = ocn;
  values.status = DEFAULT_STATUS;
  var written = writeVehicleCells_(sheet, cols, row, values);
  if (item.meta['書類'] && String(item.meta['書類']).indexOf(DOC.CERT) !== -1) {
    attachCertificate_(sheet, cols, row, ocn, item, settings);
  }
  return sheetName + ' ' + row + '行目に追加（OCN ' + ocn + '・' + written + '項目）';
}

/** 本登録：対象OCNの行に車検証の項目を反映し、車検証ファイルを改名してリンクを付ける */
function applyCertificate_(ss, settings, item) {
  var ocn = String(item.meta['対象OCN'] || '').trim();
  if (!ocn) throw new Error('対象OCNが未入力です（紐付け待ち）');
  var index = buildVehicleIndex_(ss, settings);
  var target = index.findOcn(ocn);
  if (!target) throw new Error('OCN ' + ocn + ' がマスタにありません（仮登録が未転記の可能性があります）');

  var sheet = ss.getSheetByName(target.sheet);
  var cols = getVehicleColumns_(sheet).map;
  var certKeys = ['chassisNumber', 'firstRegDate', 'inspectionExpiry', 'plateRegion', 'plateClass', 'plateKana', 'plateNumber', 'supplier', 'address'];
  var values = {}, changes = [];
  certKeys.forEach(function (k) {
    var v = item.fields[k];
    if (isBlank(v)) return;
    var current = target.values[k];
    if (!isBlank(current) && compareKey(k, current) !== compareKey(k, v)) {
      changes.push({ key: k, before: current, after: v });
    }
    values[k] = v;
  });
  var written = writeVehicleCells_(sheet, cols, target.row, values);
  changes.forEach(function (c) {
    appendLog_('マスタ値更新', ocn, FIELD_BY_KEY[c.key].label, displayValue_(c.before), displayValue_(c.after), '車検証の値で更新');
  });
  attachCertificate_(sheet, cols, target.row, ocn, item, settings);
  return target.sheet + ' ' + target.row + '行目（OCN ' + ocn + '）に車検証の' + written + '項目を反映';
}

/** 計算式の列・式の入ったセルを避けて、指定の項目だけを書き込む */
function writeVehicleCells_(sheet, cols, row, values) {
  var written = 0;
  Object.keys(values).forEach(function (k) {
    var f = FIELD_BY_KEY[k];
    if (!f || f.source === 'formula' || cols[k] === undefined) return;
    var v = values[k];
    if (isBlank(v) && v !== 0) return;
    var cell = sheet.getRange(row, cols[k] + 1);
    if (cell.getFormula()) return;
    if (k === 'ocn' || k === 'plateClass' || k === 'plateNumber' || k === 'chassisNumber') {
      cell.setNumberFormat('@');
      v = String(v);
    }
    cell.setValue(v);
    written++;
  });
  return written;
}

/** 行ごとに式を入れている既存シート向け：上の行の式を新しい行へ引き継ぐ */
function copyRowFormulas_(sheet, cols, row) {
  if (row <= 2) return;
  FIELDS.filter(function (f) { return f.source === 'formula' && cols[f.key] !== undefined; }).forEach(function (f) {
    var c = cols[f.key] + 1;
    if (sheet.getRange(1, c).getFormula()) return; // 見出しの ARRAYFORMULA 方式
    var above = sheet.getRange(row - 1, c);
    if (above.getFormula()) above.copyTo(sheet.getRange(row, c), SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
  });
}

/** 車検証ファイルを OCN 形式に改名し、車検証保管フォルダへ置いてリンクを付ける */
function attachCertificate_(sheet, cols, row, ocn, item, settings) {
  var fileId = String(item.meta['ファイルID'] || '');
  if (!fileId || cols.certLink === undefined) return;
  var file = DriveApp.getFileById(fileId);
  var folder = DriveApp.getFolderById(settings.folderCert);
  var ext = (file.getName().match(/\.[A-Za-z0-9]+$/) || ['.pdf'])[0];
  var name = ocn + ext, n = 2;
  while (folder.getFilesByName(name).hasNext() && !isSameFileName_(folder, name, fileId)) name = ocn + '_' + (n++) + ext;
  file.setName(name);
  if (!isInFolder_(file, settings.folderCert)) file.moveTo(folder);
  var link = SpreadsheetApp.newRichTextValue().setText(name).setLinkUrl(file.getUrl()).build();
  sheet.getRange(row, cols.certLink + 1).setRichTextValue(link);
}

function isSameFileName_(folder, name, fileId) {
  var it = folder.getFilesByName(name);
  while (it.hasNext()) if (it.next().getId() !== fileId) return false;
  return true;
}

/** AIの読取値と確定値の差分を「確認修正」としてログに残す（精度改善・手書き項目の集計に使う） */
function logCorrections_(item) {
  var snapshot = parseSnapshot_(item.meta['読取結果']);
  var rows = [];
  STAGE_FIELD_KEYS.forEach(function (k) {
    if (k === 'purchaseDate') return;
    var ai = snapshot.fields[k] ? snapshot.fields[k].v : '';
    var final = item.fields[k];
    if (compareKey(k, ai) === compareKey(k, final)) return;
    rows.push(['確認修正', String(item.meta['対象OCN'] || item.meta['取込ID']), FIELD_BY_KEY[k].label, displayValue_(ai), displayValue_(final), (snapshot.fields[k] && snapshot.fields[k].s) || '']);
  });
  if (rows.length) appendLogRows_(rows);
}

function displayValue_(v) {
  if (v instanceof Date) return formatDateYmd(v);
  return isBlank(v) ? '' : String(v);
}

// =====================================================================
// 12. 精度テスト（本番のマスタには一切書き込まない）
// =====================================================================

/** 精度テストの既定の対象フォルダ（処理済み・車検証保管） */
function getAccuracyTestDefaults() {
  var s = getSettings_();
  return { folderIds: [s.folderDone, s.folderCert].filter(function (x) { return x; }).join('\n'), count: 40 };
}

/**
 * 精度テストの開始：結果シートを初期化し、対象ファイルを選ぶ。
 * @param {string} folderText フォルダID/URL（改行・カンマ区切り）
 * @param {number} count 対象件数（30〜50台分を想定）
 */
function startAccuracyTest(folderText, count) {
  var settings = getSettings_();
  if (!settings.geminiKey) throw new Error('Gemini APIキーが未設定です。初期セットアップを実行してください。');
  var ids = String(folderText || '').split(/[\s,、]+/).map(extractDriveId_).filter(function (x) { return x; });
  if (!ids.length) throw new Error('対象フォルダを指定してください');
  var files = [];
  ids.forEach(function (id) {
    var it = DriveApp.getFolderById(id).getFiles();
    while (it.hasNext()) {
      var f = it.next();
      if (SUPPORTED_MIME_TYPES.indexOf(f.getMimeType()) !== -1) files.push({ id: f.getId(), name: f.getName(), updated: f.getLastUpdated().getTime() });
    }
  });
  files.sort(function (a, b) { return b.updated - a.updated; });
  files = files.slice(0, Math.max(1, Number(count) || 40));

  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET.ACCURACY) || ss.insertSheet(SHEET.ACCURACY);
  sheet.clear();
  var runId = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd-HHmmss');
  sheet.getRange(1, 1).setValue('精度テスト結果').setFontWeight('bold');
  sheet.getRange(2, 1, 1, 2).setValues([['実行ID', runId]]);
  sheet.getRange(1, ACCURACY_DETAIL_COL, 1, ACCURACY_DETAIL_HEADERS.length).setValues([ACCURACY_DETAIL_HEADERS]).setFontWeight('bold');
  appendLog_('精度テスト', runId, '開始', '', files.length + '件', ids.join(','));
  return { runId: runId, files: files.map(function (f) { return { id: f.id, name: f.name }; }) };
}

/** 精度テスト：1ファイル分の読取と採点（ファイルの移動・改名もしない） */
function runAccuracyTestFile(runId, fileId) {
  var settings = getSettings_();
  var ss = getSpreadsheet_();
  var file = DriveApp.getFileById(fileId);
  var extraction;
  try {
    extraction = extractFromFile_(file, settings);
  } catch (e) {
    if (e.quota) return { ok: false, quota: true, message: file.getName() + '：' + e.message }; // 採点に含めない
    appendAccuracyRows_(ss, [[runId, file.getName(), fileId, '', '', '(読取エラー)', '', e.message, '', '読取不可', '']]);
    return { ok: false, message: file.getName() + '：' + e.message };
  }
  var record = buildRecord(extraction.docs, { ocrText: extraction.ocrText, today: new Date(), lossThreshold: settings.lossThreshold });
  if (record.error) {
    appendAccuracyRows_(ss, [[runId, file.getName(), fileId, '', '', '(判別不可)', '', record.error, '', '読取不可', '']]);
    return { ok: false, message: file.getName() + '：' + record.error };
  }

  var index = buildVehicleIndex_(ss, settings);
  var truth = null, via = '';
  var ocnMatch = file.getName().match(new RegExp('^' + escapeRegExp_(settings.ocnPrefix) + '(\\d+)'));
  if (ocnMatch) {
    truth = index.findOcn(settings.ocnPrefix + ocnMatch[1]);
    if (truth) via = 'OCN ' + truth.values.ocn;
  }
  if (!truth) {
    var ck = chassisCompareKey(record.fields.chassisNumber.value);
    if (ck && index.byChassis[ck]) { truth = index.byChassis[ck]; via = '車台番号'; }
  }
  if (!truth) {
    appendAccuracyRows_(ss, [[runId, file.getName(), fileId, record.docTypes.join('・'), '(照合先なし)', '', '', '', '', '正解なし', '']]);
    return { ok: false, message: file.getName() + '：管理表に照合できる行がありません（OCN・車台番号）' };
  }

  var keys = [];
  record.docTypes.forEach(function (t) {
    (ACCURACY_KEYS_BY_DOC[t] || []).forEach(function (k) { if (keys.indexOf(k) === -1) keys.push(k); });
  });
  var rows = keys.map(function (k) {
    var f = record.fields[k];
    var result = judgeField(k, f.value, truth.values[k]);
    // 照合キーに使った項目は、正解が自明なので採点しない
    if (via === '車台番号' && k === 'chassisNumber') result = '正解なし';
    return [runId, file.getName(), fileId, record.docTypes.join('・'), via, FIELD_BY_KEY[k].label,
      HANDWRITTEN_KEYS.indexOf(k) !== -1 ? '手書き' : '', displayValue_(f.value), displayValue_(truth.values[k]),
      result, f.flags.length ? f.flags.join('・') : ''];
  });
  appendAccuracyRows_(ss, rows);
  var matched = rows.filter(function (r) { return r[9] === '一致'; }).length;
  var judged = rows.filter(function (r) { return r[9] !== '正解なし'; }).length;
  return { ok: true, message: file.getName() + '：' + matched + '/' + judged + '項目一致（' + via + 'で照合）' };
}

function escapeRegExp_(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function appendAccuracyRows_(ss, rows) {
  if (!rows.length) return;
  var sheet = ss.getSheetByName(SHEET.ACCURACY);
  var col = sheet.getRange(1, ACCURACY_DETAIL_COL, Math.max(sheet.getLastRow(), 1), 1).getValues();
  var last = 1;
  for (var i = col.length - 1; i >= 0; i--) if (!isBlank(col[i][0])) { last = i + 1; break; }
  ensureRows_(sheet, last + rows.length);
  sheet.getRange(last + 1, ACCURACY_DETAIL_COL, rows.length, ACCURACY_DETAIL_HEADERS.length).setValues(rows);
}

/** 精度テストの集計：項目別の正答率・要確認の割合・誤りの例・確認で直した件数 */
function finalizeAccuracyTest(runId) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET.ACCURACY);
  var lastRow = sheet.getLastRow();
  var details = [];
  if (lastRow >= 2) {
    sheet.getRange(2, ACCURACY_DETAIL_COL, lastRow - 1, ACCURACY_DETAIL_HEADERS.length).getValues().forEach(function (r) {
      if (String(r[0]) !== String(runId)) return;
      var key = keyByLabel_(r[5]);
      if (!key) return;
      details.push({ key: key, extracted: r[7], truth: r[8], result: r[9], flagged: !isBlank(r[10]) });
    });
  }
  var summary = summarizeAccuracy(details, countCorrections_(ss));
  var files = {};
  if (lastRow >= 2) sheet.getRange(2, ACCURACY_DETAIL_COL, lastRow - 1, 3).getValues().forEach(function (r) { if (String(r[0]) === String(runId)) files[r[2]] = true; });

  sheet.getRange(3, 1, 1, 4).setValues([['対象ファイル数', Object.keys(files).length, '集計日時', new Date()]]);
  sheet.getRange(5, 1, 1, ACCURACY_SUMMARY_HEADERS.length).setValues([ACCURACY_SUMMARY_HEADERS]).setFontWeight('bold');
  if (summary.length) {
    var out = summary.map(function (s) {
      return [s.label, s.kind, s.total, s.match, s.rate, s.flaggedRate, s.silentErrors, s.corrections, s.verdict, s.examples];
    });
    sheet.getRange(6, 1, out.length, ACCURACY_SUMMARY_HEADERS.length).setValues(out);
    sheet.getRange(6, 5, out.length, 2).setNumberFormat('0.0%');
    out.forEach(function (r, i) {
      var ok = r[1] === '活字' ? r[4] >= ACCURACY_TARGET : true;
      sheet.getRange(6 + i, 5).setBackground(r[1] === '活字' ? (ok ? '#d9ead3' : '#f4cccc') : '#fff2cc');
    });
  }
  appendLog_('精度テスト', runId, '集計', '', '', summary.length + '項目');
  return summary;
}

function keyByLabel_(label) {
  for (var i = 0; i < FIELDS.length; i++) if (FIELDS[i].label === label) return FIELDS[i].key;
  return null;
}

/** ログの「確認修正」を項目別に数える */
function countCorrections_(ss) {
  var sheet = ss.getSheetByName(SHEET.LOG);
  var counts = {};
  if (!sheet || sheet.getLastRow() < 2) return counts;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues().forEach(function (r) {
    if (r[1] !== '確認修正') return;
    var key = keyByLabel_(r[3]);
    if (key) counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

// =====================================================================
// 13. ログ
// =====================================================================

function appendLog_(kind, target, item, before, after, message) {
  appendLogRows_([[kind, target, item, before, after, message]]);
}

/** rows: [区分, 対象, 項目, 変更前, 変更後, 内容] の配列 */
function appendLogRows_(rows) {
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(SHEET.LOG);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET.LOG);
      sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    var user = '';
    try { user = Session.getActiveUser().getEmail(); } catch (e) { user = ''; }
    var now = new Date();
    var out = rows.map(function (r) {
      return [now].concat(r.map(function (v) { return String(v === null || v === undefined ? '' : v).substring(0, 5000); })).concat([user]);
    });
    var start = sheet.getLastRow() + 1;
    ensureRows_(sheet, start + out.length - 1);
    sheet.getRange(start, 1, out.length, LOG_HEADERS.length).setValues(out);
  } catch (e) {
    console.error('ログ書き込み失敗: ' + e.message);
  }
  rows.forEach(function (r) { console.log(r.join(' | ')); });
}
