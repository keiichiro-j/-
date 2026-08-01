/**
 * AppraisalExtractionService.gs
 * 4.5 査定書連携による仕入情報取り込み機能
 *
 * 査定書は「決まった査定システムから出力されるフォーマット固定のPDF」を前提とし、
 * ラベル文字列を目印にしたテンプレート抽出を行う。実サンプル未確認のため、ラベル候補は
 * 複数パターンを許容できるよう配列で保持している（11. 今後の検討事項）。
 */

var APPRAISAL_LABEL_MAP = {
  carType: ['車種'],
  model: ['モデル', '型式'],
  chassisNumber: ['車台番号', '車台No', '車台No.'],
  firstRegistrationDate: ['初年度登録', '初度登録年月', '初度登録'],
  color: ['カラー', '色'],
  mileage: ['走行距離', '走行'],
  appraisalAmount: ['査定額', '査定金額'],
  purchaseAmount: ['買取金額', '買取価格'],
  recycleFee: ['リサイクル金額', 'リサイクル料金', 'リサイクル預託金']
};

/**
 * 査定書PDF（アップロード済みDriveファイル）を解析し、確認画面向けの下書きデータを返す。
 * 抽出結果はそのまま登録せず、必ず確認画面を経由する（4.5 要件）。
 */
function extractAppraisalDraft(fileId) {
  var text = ocrFileToText_(fileId);
  var raw = extractByLabels_(text, APPRAISAL_LABEL_MAP);
  return normalizeAppraisalDraft_(raw, fileId, text);
}

/**
 * OCR生テキストから抽出した文字列を、数値/日付等の型へ整形し、下取損を自動計算する（純粋関数）。
 */
function normalizeAppraisalDraft_(raw, fileId, rawText) {
  var draft = {
    carType: raw.carType || '',
    model: raw.model || '',
    chassisNumber: raw.chassisNumber ? raw.chassisNumber.replace(/\s/g, '') : '',
    firstRegistrationDate: raw.firstRegistrationDate || '',
    color: raw.color || '',
    mileage: toNumber_(raw.mileage),
    appraisalAmount: toNumber_(raw.appraisalAmount),
    purchaseAmount: toNumber_(raw.purchaseAmount),
    recycleFee: toNumber_(raw.recycleFee)
  };
  draft.tradeInLoss = calcTradeInLoss(draft.appraisalAmount, draft.purchaseAmount);
  if (fileId !== undefined) draft.sourceFileId = fileId;
  if (rawText !== undefined) draft.rawText = rawText;
  return draft;
}

/**
 * 下取損 = 査定額 − 買取金額（4.5）
 */
function calcTradeInLoss(appraisalAmount, purchaseAmount) {
  if (typeof appraisalAmount !== 'number' || typeof purchaseAmount !== 'number') return null;
  if (isNaN(appraisalAmount) || isNaN(purchaseAmount)) return null;
  return appraisalAmount - purchaseAmount;
}

function toNumber_(str) {
  if (str === undefined || str === null || str === '') return null;
  var n = Number(String(str).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
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
