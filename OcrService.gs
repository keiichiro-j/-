/**
 * OcrService.gs
 * PDF/画像ファイルからのテキスト抽出（OCR）共通処理。
 *
 * 既定実装は Drive の高度なサービス（Advanced Drive Service / Drive API v2）による
 * OCR変換（追加のAPIキー登録・課金設定不要、Google Workspaceアカウントでの利用を想定）。
 * このアカウントでOCR変換が使えない場合（個人Gmailアカウント等でのDrive側の制限で
 * 「OCR is not supported for files of type ...」エラーが出るケース）は、
 * ocrFileToTextViaOcrSpace_() または ocrFileToTextViaVisionApi_() へ切り替え可能。
 *
 * 事前準備（既定のDrive OCR方式）:
 *  - GASエディタの「サービス」から Drive API（v2）を追加する
 *  - GCP側で Drive API を有効化する
 */

/**
 * アップロード時にPDF/画像が自動でGoogleドキュメント等へ変換されないよう、
 * convert:false を明示してDriveにファイルを作成する。
 * （既定の folder.createFile(blob) だと、状況によりアップロード時点で
 *   自動変換され、その後のOCR変換が失敗することがあるための対策）
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
 * ファイルIDからOCRテキストを取得する（既定: Drive OCR変換方式）
 */
function ocrFileToText_(fileId) {
  return ocrFileToTextViaDrive_(fileId);
}

/**
 * Drive APIの「PDF/画像 → Googleドキュメント変換（OCR付き）」機能でOCRを行う。
 * 変換用の一時ドキュメントを作成し、テキストを取り出した後は削除する。
 * Google Workspaceアカウントでの利用を想定（個人Gmailアカウントでは
 * 「OCR is not supported for files of type ...」エラーで失敗する場合がある）。
 */
function ocrFileToTextViaDrive_(fileId) {
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
 * OCR.space の無料APIでOCRを行う（代替実装）。PDF・画像のどちらもそのまま渡せる。
 * 切り替えるには ocrFileToText_ の中身をこの関数の呼び出しに変更する。
 * 事前準備: https://ocr.space/ocrapi で無料APIキーを取得し、Script Propertiesに
 * OCR_SPACE_API_KEY として登録する。
 */
function ocrFileToTextViaOcrSpace_(fileId) {
  var apiKey = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.OCR_SPACE_API_KEY);
  if (!apiKey) throw new Error('OCR_SPACE_API_KEY が Script Properties に設定されていません');

  var blob = DriveApp.getFileById(fileId).getBlob();
  var mimeType = blob.getContentType() || 'application/pdf';
  var base64 = Utilities.base64Encode(blob.getBytes());

  var payload = {
    apikey: apiKey,
    language: 'jpn',
    OCREngine: '2',
    isOverlayRequired: 'false',
    base64Image: 'data:' + mimeType + ';base64,' + base64
  };
  if (mimeType.indexOf('pdf') !== -1) payload.filetype = 'PDF';

  var response = UrlFetchApp.fetch('https://api.ocr.space/parse/image', {
    method: 'post',
    payload: payload,
    muteHttpExceptions: true
  });
  var json = JSON.parse(response.getContentText());
  if (json.IsErroredOnProcessing) {
    var message = Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join(', ') : json.ErrorMessage;
    throw new Error('OCR.space エラー: ' + (message || '不明なエラー'));
  }
  var results = json.ParsedResults || [];
  return results.map(function (r) { return r.ParsedText || ''; }).join('\n');
}

/**
 * Cloud Vision API の files:annotate エンドポイントでOCRを行う（代替実装）。
 * GCPプロジェクトに課金設定が可能な場合、より高精度なこちらへ切り替えられる。
 * 切り替えるには ocrFileToText_ の中身をこの関数の呼び出しに変更する。
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
