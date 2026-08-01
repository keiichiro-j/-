/**
 * InspectionExtractionService.gs
 * 4.6 車検証読み取りによる顧客・住所反映機能
 *
 * 購入時点の車検証（前所有者名義）から「所有者」「使用者の住所」等のラベルを目印に
 * 顧客名・住所を抽出する。抽出に失敗した場合は空欄のまま返し、担当者が手入力で補完する。
 */

var INSPECTION_LABEL_MAP = {
  supplier: ['所有者の氏名又は名称', '使用者の氏名又は名称', '所有者氏名', '所有者'],
  address: ['使用者の住所', '所有者の住所', '住所']
};

/**
 * 車検証PDF（前所有者名義）を解析し、確認画面向けの下書き（顧客名・住所）を返す。
 * 顧客名は「仕入先」欄への自動反映を想定（呼び出し側の確認画面でマージする）。
 */
function extractInspectionCertDraft(fileId) {
  var text = ocrFileToText_(fileId);
  var raw = extractByLabels_(text, INSPECTION_LABEL_MAP);
  return {
    supplier: raw.supplier || '',
    address: raw.address || '',
    sourceFileId: fileId,
    rawText: text
  };
}
