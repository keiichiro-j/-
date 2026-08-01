/**
 * PdfLinkService.gs
 * 4.1 車検証証PDFリンク自動反映機能
 * 4.7 自社名義変更後の車検証リンク機能（同じ仕組みを拡張して対応）
 *
 * ファイル名規則:
 *   前所有者名義（購入時）: "OCN12345.pdf"          -> inspectionCertLink 列
 *   自社名義（名義変更後）: "OCN12345_自社名義.pdf" -> ownCertLink 列
 */

var OWN_NAME_SUFFIX = '_自社名義';

/**
 * ファイル名から OCN と種別（前所有者名義／自社名義）を抽出する純粋関数。
 * マッチしない場合は null。
 */
function parseInspectionCertFileName(fileName) {
  var base = String(fileName).replace(/\.[^.]+$/, ''); // 拡張子除去
  var ownMatch = base.match(/^(OCN0*[0-9]+)_自社名義$/i);
  if (ownMatch) {
    return { ocn: normalizeOcn_(ownMatch[1]), kind: 'own' };
  }
  var normalMatch = base.match(/^(OCN0*[0-9]+)$/i);
  if (normalMatch) {
    return { ocn: normalizeOcn_(normalMatch[1]), kind: 'prev' };
  }
  return null;
}

function normalizeOcn_(raw) {
  var m = String(raw).match(/^OCN0*([0-9]+)$/i);
  if (!m) return raw;
  return OCN_PREFIX + String(parseInt(m[1], 10)).padStart(5, '0');
}

/**
 * 指定会社のPDF保管フォルダを走査し、未処理PDFを該当車両行にリンクする。
 * 時間主導型トリガー、または手動実行ボタンから呼び出す想定。
 */
function syncInspectionCertLinks(companyId) {
  var company = getCompanyById(companyId);
  var folder = DriveApp.getFolderById(company.pdfFolderId);
  var processedIds = getProcessedPdfIds_(companyId);
  var unmatched = [];
  var linkedCount = 0;

  var files = folder.getFilesByType(MimeType.PDF);
  while (files.hasNext()) {
    var file = files.next();
    var fileId = file.getId();
    if (processedIds[fileId]) continue; // 重複処理防止

    var parsed = parseInspectionCertFileName(file.getName());
    if (!parsed) {
      unmatched.push({ fileId: fileId, fileName: file.getName(), reason: 'ファイル名がOCN形式ではありません', checkedAt: new Date() });
      continue;
    }

    var target = locateVehicleByOcn_(parsed.ocn);
    if (!target) {
      unmatched.push({ fileId: fileId, fileName: file.getName(), reason: '該当するOCNの車両が見つかりません（' + parsed.ocn + '）', checkedAt: new Date() });
      continue;
    }

    var linkKey = parsed.kind === 'own' ? 'ownCertLink' : 'inspectionCertLink';
    var sheet = getOrCreateSheet(target.companyId, target.tabName);
    setCellValue_(sheet, target.rowNumber, linkKey, file.getUrl());
    processedIds[fileId] = true;
    linkedCount++;
  }

  saveProcessedPdfIds_(companyId, processedIds);
  if (unmatched.length > 0) appendUnmatchedLog_(companyId, unmatched);

  return { linkedCount: linkedCount, unmatchedCount: unmatched.length };
}

function syncInspectionCertLinksAllCompanies() {
  return getCompanies().map(function (company) {
    return { companyId: company.id, result: syncInspectionCertLinks(company.id) };
  });
}

/**
 * 会社内の全タブから OCN で車両を検索する
 */
function locateVehicleByOcn_(ocn) {
  var companyId = null;
  var found = null;
  getCompanies().some(function (company) {
    return ALL_TAB_NAMES.some(function (tabName) {
      var v = findVehicle(company.id, tabName, ocn);
      if (v) {
        found = v;
        companyId = company.id;
        return true;
      }
      return false;
    });
  });
  return found;
}

function getProcessedPdfIds_(companyId) {
  var json = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.PROCESSED_PDF_IDS + companyId);
  return json ? JSON.parse(json) : {};
}

function saveProcessedPdfIds_(companyId, map) {
  PropertiesService.getScriptProperties().setProperty(PROP_KEYS.PROCESSED_PDF_IDS + companyId, JSON.stringify(map));
}

/**
 * 未紐付けPDF一覧を「未紐付けPDF一覧」シートに追記する（人手確認用）
 */
function appendUnmatchedLog_(companyId, unmatched) {
  var ss = openCompanySpreadsheet(companyId);
  var sheet = ss.getSheetByName('未紐付けPDF一覧');
  if (!sheet) {
    sheet = ss.insertSheet('未紐付けPDF一覧');
    sheet.getRange(1, 1, 1, 4).setValues([['検知日時', 'ファイル名', 'ファイルID', '理由']]);
    sheet.setFrozenRows(1);
  }
  var rows = unmatched.map(function (u) {
    return [u.checkedAt, u.fileName, u.fileId, u.reason];
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
}
