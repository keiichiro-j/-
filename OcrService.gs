/**
 * OcrService.gs
 * PDF/画像ファイルからのテキスト抽出（OCR）共通処理。
 *
 * 既定実装は Drive の高度なサービス（Advanced Drive Service / Drive API v2）による
 * OCR変換（追加のAPIキー・課金設定なしでGASから利用可能）。
 * より高い読み取り精度が必要な場合は ocrFileToTextViaVisionApi_() へ切り替え可能
 * （要 Script Properties への VISION_API_KEY 設定、Cloud Vision API 有効化）。
 *
 * 事前準備:
 *  - GASエディタの「サービス」から Drive API（v2）を追加する
 *  - GCP側で Drive API を有効化する
 */

/**
 * ファイルIDからOCRテキストを取得する（既定: Drive OCR変換方式）
 */
function ocrFileToText_(fileId) {
  var blob = DriveApp.getFileById(fileId).getBlob();
  var resource = {
    title: 'ocr_tmp_' + fileId + '_' + new Date().getTime(),
    mimeType: MimeType.GOOGLE_DOCS
  };
  var tempFile = Drive.Files.insert(resource, blob, { ocr: true, ocrLanguage: 'ja' });
  try {
    var doc = DocumentApp.openById(tempFile.id);
    return doc.getBody().getText();
  } finally {
    DriveApp.getFileById(tempFile.id).setTrashed(true);
  }
}

/**
 * Cloud Vision API（DOCUMENT_TEXT_DETECTION）を使ったOCR代替実装。
 * 画像（JPEG/PNG）向け。PDFを直接渡す場合は事前にページを画像化する必要がある点に注意。
 */
function ocrFileToTextViaVisionApi_(fileId) {
  var apiKey = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.VISION_API_KEY);
  if (!apiKey) throw new Error('VISION_API_KEY が Script Properties に設定されていません');

  var blob = DriveApp.getFileById(fileId).getBlob();
  var base64 = Utilities.base64Encode(blob.getBytes());
  var payload = {
    requests: [{
      image: { content: base64 },
      features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
      imageContext: { languageHints: ['ja'] }
    }]
  };
  var response = UrlFetchApp.fetch(
    'https://vision.googleapis.com/v1/images:annotate?key=' + apiKey,
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );
  var json = JSON.parse(response.getContentText());
  var annotation = json.responses && json.responses[0] && json.responses[0].fullTextAnnotation;
  return annotation ? annotation.text : '';
}

/**
 * OCRテキストからラベル文字列を目印に値を抽出する汎用テンプレート抽出関数（純粋関数）。
 *
 * @param {string} text OCR結果の全文テキスト
 * @param {Object<string,string[]>} labelMap フィールドキー -> ラベル候補文字列配列
 * @return {Object<string,string>} フィールドキー -> 抽出値（見つからない場合はキー自体が存在しない）
 */
function extractByLabels_(text, labelMap) {
  var result = {};
  if (!text) return result;
  var normalized = String(text).replace(/\r\n/g, '\n');

  Object.keys(labelMap).forEach(function (fieldKey) {
    var labels = labelMap[fieldKey];
    for (var i = 0; i < labels.length; i++) {
      var label = labels[i];
      // ラベルの直後（同一行内、コロン有無どちらも許容）に続く値を1行分抽出する
      var escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = new RegExp(escaped + '\\s*[:：]?\\s*([^\\n]+)');
      var m = normalized.match(re);
      if (m && m[1] && m[1].trim()) {
        result[fieldKey] = m[1].trim();
        break;
      }
    }
  });
  return result;
}
