/**
 * InspectionExtractionService.gs
 * 4.6 車検証読み取りによる車検満了日・登録番号の反映機能（任意ステップ）
 *
 * 購入者情報（使用者名・住所）は注文書から取得するため、車検証からは
 * 「有効期間の満了する日（車検満了日）」と「登録番号（ナンバープレート）」のみを抽出する。
 * 抽出に失敗した項目は空欄のまま返し、担当者が手入力で補完する。
 */

var INSPECTION_LABEL_MAP = {
  inspectionExpiryDateRaw: ['有効期間の満了する日', '車検満了日', '有効期間満了日']
};

/**
 * 車検証PDF（前所有者名義）を解析し、確認画面向けの下書き（車検満了日・登録番号）を返す。
 */
function extractInspectionCertDraft(fileId) {
  var text = ocrFileToText_(fileId);
  var raw = extractByLabels_(text, getEffectiveInspectionLabelMap_());
  var plate = extractRegistrationPlate_(text);

  var draft = {
    inspectionExpiryDate: formatYearMonthDay_(raw.inspectionExpiryDateRaw),
    sourceFileId: fileId,
    rawText: text
  };
  if (plate) {
    draft.plateRegion = plate.plateRegion;
    draft.plateClass = plate.plateClass;
    draft.plateKana = plate.plateKana;
    draft.plateNumber = plate.plateNumber;
  }
  return draft;
}
