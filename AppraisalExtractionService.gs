/**
 * AppraisalExtractionService.gs
 * 4.5 査定書連携による買取金額・車両情報の取り込み機能
 *
 * 査定額・購入者情報（使用者名・住所）は注文書（OrderFormExtractionService.gs）から取得するため、
 * 査定書からは「買取金額」と「車両情報」のみを抽出する。抽出後は以下の業務ルールで正規化する。
 *  - 車種: メーカー名を半角カタカナに変換。独系（メルセデス・ベンツ/アウディ/フォルクスワーゲン）は MB/AU/VW と表記。
 *  - モデル: 独系の場合「Aクラス180」→「A18」のようにクラス名+先頭2桁に短縮。
 *  - 初年度登録: 元号表記・西暦表記いずれも「yyyy/MM」形式に正規化。
 *  - カラー: 色名を漢字一文字に正規化（例: ブラック→黒）。
 *  - 走行距離: 「00,000km」形式の文字列に整形。
 *  - 仕入区分: 査定書から取り込んだ場合は既定値「下取」とする（担当者が確認画面で変更可）。
 *
 * 下取損（買取金額－査定額）は、注文書（査定額）と査定書（買取金額）の両方が
 * 確認画面に揃った時点で計算する（Api.gs の api_registerVehicle / api_updateVehicle 参照）。
 */

var APPRAISAL_LABEL_MAP = {
  carType: ['車種', 'メーカー'],
  model: ['モデル', '型式'],
  chassisNumber: ['車台番号', '車台No', '車台No.'],
  firstRegistrationDate: ['初年度登録', '初度登録年月', '初度登録'],
  color: ['カラー', '色'],
  mileage: ['走行距離', '走行'],
  purchaseAmount: ['買取金額', '買取価格'],
  recycleFee: ['リサイクル金額', 'リサイクル料金', 'リサイクル預託金'],
  staff: ['査定担当者', '担当者', '鑑定士', '査定士']
};

/**
 * 査定書PDF（アップロード済みDriveファイル）を解析し、確認画面向けの下書きデータを返す。
 * 抽出結果はそのまま登録せず、必ず確認画面を経由する（4.5 要件）。
 */
function extractAppraisalDraft(fileId) {
  var text = ocrFileToText_(fileId);
  var raw = extractByLabels_(text, getEffectiveAppraisalLabelMap_());
  return normalizeAppraisalDraft_(raw, fileId, text);
}

/**
 * OCR生テキストから抽出した文字列を、業務ルールに沿った表記へ正規化する（純粋関数）。
 */
function normalizeAppraisalDraft_(raw, fileId, rawText) {
  var carType = normalizeCarType_(raw.carType);
  var draft = {
    carType: carType,
    model: normalizeModel_(carType, raw.model),
    chassisNumber: raw.chassisNumber ? raw.chassisNumber.replace(/\s/g, '') : '',
    firstRegistrationDate: formatYearMonth_(raw.firstRegistrationDate),
    color: normalizeColor_(raw.color),
    mileage: formatMileage_(raw.mileage),
    purchaseAmount: toNumber_(raw.purchaseAmount),
    recycleFee: toNumber_(raw.recycleFee),
    purchaseType: '下取', // 査定書から取り込んだ場合の既定値（確認画面で変更可）
    staff: raw.staff || ''
  };
  if (fileId !== undefined) draft.sourceFileId = fileId;
  if (rawText !== undefined) draft.rawText = rawText;
  return draft;
}

/**
 * 下取損 = 買取金額 － 査定額
 */
function calcTradeInLoss(appraisalAmount, purchaseAmount) {
  if (typeof appraisalAmount !== 'number' || typeof purchaseAmount !== 'number') return null;
  if (isNaN(appraisalAmount) || isNaN(purchaseAmount)) return null;
  return purchaseAmount - appraisalAmount;
}

function toNumber_(str) {
  if (str === undefined || str === null || str === '') return null;
  var n = Number(String(str).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
}

// ===== 車種（メーカー名）正規化 =====
var GERMAN_MAKER_ABBR_ = {
  'メルセデス・ベンツ': 'MB',
  'メルセデスベンツ': 'MB',
  'メルセデス': 'MB',
  'ベンツ': 'MB',
  'アウディ': 'AU',
  'フォルクスワーゲン': 'VW'
};

function normalizeCarType_(raw) {
  if (!raw) return '';
  var trimmed = String(raw).trim();
  if (GERMAN_MAKER_ABBR_[trimmed]) return GERMAN_MAKER_ABBR_[trimmed];
  var keys = Object.keys(GERMAN_MAKER_ABBR_);
  for (var i = 0; i < keys.length; i++) {
    if (trimmed.indexOf(keys[i]) !== -1) return GERMAN_MAKER_ABBR_[keys[i]];
  }
  return toHalfWidthKatakana_(trimmed);
}

// ===== モデル正規化（独系のみクラス名+先頭2桁へ短縮） =====
function normalizeModel_(carTypeAbbr, rawModel) {
  if (!rawModel) return '';
  var trimmed = String(rawModel).trim();
  if (carTypeAbbr === 'MB' || carTypeAbbr === 'AU') {
    var m = trimmed.match(/^([A-Za-z])\s*(?:クラス)?\s*([0-9]+)/);
    if (m) {
      return m[1].toUpperCase() + m[2].substring(0, 2);
    }
  }
  return trimmed;
}

// ===== カラー正規化（漢字一文字） =====
var COLOR_KANJI_MAP_ = {
  'ブラックマイカ': '黒', 'ブラック': '黒', '黒': '黒',
  'パールホワイト': '白', 'ホワイトパール': '白', 'ホワイト': '白', '白': '白',
  'シルバー': '銀', '銀': '銀',
  'グレー': '灰', 'グレイ': '灰', '灰': '灰',
  'レッド': '赤', '赤': '赤',
  'ネイビー': '紺', '紺': '紺',
  'ブルー': '青', '青': '青',
  'グリーン': '緑', '緑': '緑',
  'イエロー': '黄', '黄': '黄',
  'ベージュ': '茶', 'ブラウン': '茶', '茶': '茶',
  'オレンジ': '橙', '橙': '橙',
  'パープル': '紫', '紫': '紫',
  'ゴールド': '金', '金': '金'
};

function normalizeColor_(raw) {
  if (!raw) return '';
  var trimmed = String(raw).trim();
  if (COLOR_KANJI_MAP_[trimmed]) return COLOR_KANJI_MAP_[trimmed];
  var keys = Object.keys(COLOR_KANJI_MAP_).sort(function (a, b) { return b.length - a.length; });
  for (var i = 0; i < keys.length; i++) {
    if (trimmed.indexOf(keys[i]) !== -1) return COLOR_KANJI_MAP_[keys[i]];
  }
  return trimmed;
}

// ===== 走行距離フォーマット（00,000km） =====
function formatMileage_(raw) {
  var n = toNumber_(raw);
  if (n === null) return '';
  var rounded = Math.round(n);
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + 'km';
}

// ===== 全角カタカナ→半角カタカナ変換 =====
var KATAKANA_HALF_WIDTH_MAP_ = {
  'ア':'ｱ','イ':'ｲ','ウ':'ｳ','エ':'ｴ','オ':'ｵ',
  'カ':'ｶ','キ':'ｷ','ク':'ｸ','ケ':'ｹ','コ':'ｺ',
  'サ':'ｻ','シ':'ｼ','ス':'ｽ','セ':'ｾ','ソ':'ｿ',
  'タ':'ﾀ','チ':'ﾁ','ツ':'ﾂ','テ':'ﾃ','ト':'ﾄ',
  'ナ':'ﾅ','ニ':'ﾆ','ヌ':'ﾇ','ネ':'ﾈ','ノ':'ﾉ',
  'ハ':'ﾊ','ヒ':'ﾋ','フ':'ﾌ','ヘ':'ﾍ','ホ':'ﾎ',
  'マ':'ﾏ','ミ':'ﾐ','ム':'ﾑ','メ':'ﾒ','モ':'ﾓ',
  'ヤ':'ﾔ','ユ':'ﾕ','ヨ':'ﾖ',
  'ラ':'ﾗ','リ':'ﾘ','ル':'ﾙ','レ':'ﾚ','ロ':'ﾛ',
  'ワ':'ﾜ','ヲ':'ｦ','ン':'ﾝ',
  'ガ':'ｶﾞ','ギ':'ｷﾞ','グ':'ｸﾞ','ゲ':'ｹﾞ','ゴ':'ｺﾞ',
  'ザ':'ｻﾞ','ジ':'ｼﾞ','ズ':'ｽﾞ','ゼ':'ｾﾞ','ゾ':'ｿﾞ',
  'ダ':'ﾀﾞ','ヂ':'ﾁﾞ','ヅ':'ﾂﾞ','デ':'ﾃﾞ','ド':'ﾄﾞ',
  'バ':'ﾊﾞ','ビ':'ﾋﾞ','ブ':'ﾌﾞ','ベ':'ﾍﾞ','ボ':'ﾎﾞ',
  'パ':'ﾊﾟ','ピ':'ﾋﾟ','プ':'ﾌﾟ','ペ':'ﾍﾟ','ポ':'ﾎﾟ',
  'ヴ':'ｳﾞ','ッ':'ｯ','ャ':'ｬ','ュ':'ｭ','ョ':'ｮ',
  'ー':'ｰ','・':'･','ァ':'ｧ','ィ':'ｨ','ゥ':'ｩ','ェ':'ｪ','ォ':'ｫ'
};

function toHalfWidthKatakana_(str) {
  var result = '';
  for (var i = 0; i < str.length; i++) {
    var ch = str.charAt(i);
    result += KATAKANA_HALF_WIDTH_MAP_[ch] !== undefined ? KATAKANA_HALF_WIDTH_MAP_[ch] : ch;
  }
  return result;
}

/**
 * 登録確定時に、査定書PDF自体を「OCN+番号」のファイル名でドライブの所定フォルダへ保存する。
 */
function saveAppraisalPdfWithOcn_(companyId, sourceFileId, ocn) {
  var company = getCompanyById(companyId);
  var folder = DriveApp.getFolderById(company.appraisalFolderId);
  var sourceFile = DriveApp.getFileById(sourceFileId);
  var copy = sourceFile.makeCopy(ocn + '.pdf', folder);
  return copy.getUrl();
}
