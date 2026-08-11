/**
 * OrderFormExtractionService.gs
 * 4.5 注文書連携による査定金額・購入者情報の取り込み機能
 *
 * 注文書OCRテキストから「査定金額」「購入者情報（使用者名・使用者住所）」を抽出する。
 * 買取金額・車両情報は査定書（AppraisalExtractionService.gs）から取得する。
 */

var ORDER_FORM_LABEL_MAP = {
  appraisalAmount: ['査定金額', '査定額'],
  supplier: ['使用者の氏名又は名称', '使用者名', '購入者名', '氏名'],
  address: ['使用者の住所', '住所']
};

/**
 * 注文書PDF（アップロード済みDriveファイル）を解析し、確認画面向けの下書きデータを返す。
 */
function extractOrderFormDraft(fileId) {
  var text = ocrFileToText_(fileId);
  var raw = extractByLabels_(text, ORDER_FORM_LABEL_MAP);
  return {
    appraisalAmount: toNumber_(raw.appraisalAmount),
    supplier: raw.supplier || '',
    address: raw.address || '',
    sourceFileId: fileId,
    rawText: text
  };
}
