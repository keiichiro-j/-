/**
 * OcrService.gs
 * PDF/画像ファイルからのテキスト抽出（OCR）共通処理。
 *
 * 実装は Cloud Vision API（files:annotate エンドポイント）を使用する。
 * このエンドポイントはPDF（先頭5ページまで）・画像のどちらも直接渡せるため、
 * Drive側の「アップロード時OCR変換」の裏技（環境によって失敗することがある）には
 * 依存しない。
 *
 * 事前準備:
 *  - GASエディタの「プロジェクトの設定」からGCPプロジェクト番号を確認（無ければ既定のものでよい）
 *  - Google Cloud Console で対象GCPプロジェクトの「Cloud Vision API」を有効化する
 *  - 同コンソールの「APIとサービス」→「認証情報」でAPIキーを発行する
 *  - GASエディタの「スクリプト プロパティ」に VISION_API_KEY として登録する
 */

/**
 * アップロード時にPDF/画像が自動でGoogleドキュメント等へ変換されないよう、
 * convert:false を明示してDriveにファイルを作成する。
 */
function createDriveFileNoConvert_(folder, blob, fileName) {
  var resource = {
    title: fileName,
    mimeType: blob.getContentType(),
    parents: [{ id: folder.getId() }]
  };
  var created = Drive.Files.insert(resource, blob, { convert: false, ocr: false });
  return DriveApp.getFileById(created.id);
}

/**
 * ファイルIDからOCRテキストを取得する（Cloud Vision API使用）
 */
function ocrFileToText_(fileId) {
  return ocrFileToTextViaVisionApi_(fileId);
}

/**
 * Cloud Vision API の files:annotate エンドポイントでOCRを行う。
 * PDF（先頭5ページまで）・画像のどちらもそのまま渡せる。
 */
function ocrFileToTextViaVisionApi_(fileId) {
  var apiKey = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.VISION_API_KEY);
  if (!apiKey) throw new Error('VISION_API_KEY が Script Properties に設定されていません');

  var blob = DriveApp.getFileById(fileId).getBlob();
  var base64 = Utilities.base64Encode(blob.getBytes());
  var mimeType = blob.getContentType() || 'application/pdf';

  var payload = {
    requests: [{
      inputConfig: { content: base64, mimeType: mimeType },
      features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
      pages: [1, 2, 3, 4, 5],
      imageContext: { languageHints: ['ja'] }
    }]
  };
  var response = UrlFetchApp.fetch(
    'https://vision.googleapis.com/v1/files:annotate?key=' + apiKey,
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );
  var json = JSON.parse(response.getContentText());
  if (json.error) {
    throw new Error('Vision API エラー: ' + json.error.message);
  }
  var pageResponses = json.responses && json.responses[0] && json.responses[0].responses;
  if (!pageResponses || pageResponses.length === 0) return '';
  return pageResponses
    .map(function (r) { return r.fullTextAnnotation ? r.fullTextAnnotation.text : ''; })
    .filter(Boolean)
    .join('\n');
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
