/**
 * PdfReportService.gs
 * 10.4 期間指定PDF帳票出力機能
 *
 * 生データのCSVではなく、A4横（収まらない場合は複数ページに自動分割）に最適化した
 * PDF帳票として出力する。一時的なスプレッドシートに整形済みデータを書き込み、
 * Google スプレッドシートのPDFエクスポート機能（size=A4, portrait=false, fitw=true 等）
 * を利用して見た目の整ったPDFを生成したのち、一時ファイルは削除する。
 */

function exportVehiclesToPdf(vehicles, dateFrom, dateTo, reportTitle) {
  var filtered = vehicles.filter(function (v) {
    if (!v.purchaseDate) return false;
    if (dateFrom && v.purchaseDate < dateFrom) return false;
    if (dateTo && v.purchaseDate > dateTo) return false;
    return true;
  });
  return buildPdfReport_(filtered, reportTitle || '車両在庫データ');
}

function buildPdfReport_(vehicles, reportTitle) {
  var tempSs = SpreadsheetApp.create('_pdf_tmp_' + new Date().getTime());
  try {
    var sheet = tempSs.getSheets()[0];
    writeReportContent_(sheet, vehicles, reportTitle);
    SpreadsheetApp.flush();
    var pdfBlob = exportSheetAsA4LandscapePdf_(tempSs, sheet);
    return {
      base64: Utilities.base64Encode(pdfBlob.getBytes()),
      fileName: 'vehicles_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm') + '.pdf'
    };
  } finally {
    DriveApp.getFileById(tempSs.getId()).setTrashed(true);
  }
}

function writeReportContent_(sheet, vehicles, reportTitle) {
  var header = ['拠点', 'タブ'].concat(HEADER_ROW);
  var colCount = header.length;
  var generatedAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  var subtitleText = '出力日時: ' + generatedAt + '　件数: ' + vehicles.length + '件';

  // タイトル行（帳票名。下に太いブランドカラーの罫線を引いて見出しを強調）
  sheet.getRange(1, 1, 1, colCount).merge()
    .setValue(reportTitle)
    .setFontWeight('bold')
    .setFontSize(14)
    .setFontColor('#1a56db')
    .setHorizontalAlignment('left')
    .setBorder(false, false, true, false, false, false, '#1a56db', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.setRowHeight(1, 26);

  // サブタイトル行（出力日時・件数）
  sheet.getRange(2, 1, 1, colCount).merge()
    .setValue(subtitleText)
    .setFontSize(9)
    .setFontColor('#6b7280')
    .setHorizontalAlignment('left');
  sheet.setRowHeight(2, 16);

  // ヘッダー行（ブランドカラー背景に白文字）
  sheet.getRange(3, 1, 1, colCount)
    .setValues([header])
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#1a56db')
    .setFontSize(8)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, '#ffffff', SpreadsheetApp.BorderStyle.SOLID);

  if (vehicles.length > 0) {
    var rows = vehicles.map(function (v) {
      return [v.companyId || '', v.tabName || ''].concat(
        COLUMNS.map(function (col) {
          var val = v[col.key];
          return val === undefined || val === null ? '' : val;
        })
      );
    });
    var dataRange = sheet.getRange(4, 1, rows.length, colCount);
    dataRange.setValues(rows);
    dataRange.setFontSize(8);
    dataRange.setVerticalAlignment('middle');
    dataRange.setBorder(true, true, true, true, true, true, '#e2e8f0', SpreadsheetApp.BorderStyle.SOLID);

    // 1行おきに薄い縞模様を付け、横に長い表でも視線が追いやすいようにする
    var backgrounds = rows.map(function (_, i) {
      var color = (i % 2 === 0) ? '#ffffff' : '#f5f7fb';
      var rowColors = [];
      for (var c = 0; c < colCount; c++) rowColors.push(color);
      return rowColors;
    });
    dataRange.setBackgrounds(backgrounds);
  }

  sheet.setFrozenRows(3); // 印刷時、タイトル・サブタイトル・ヘッダー行をページ毎に繰り返す(fzr=true)
  sheet.autoResizeColumns(1, colCount);
}

/**
 * 一時スプレッドシートをA4横・幅に合わせて縮小したPDFとしてエクスポートする。
 */
function exportSheetAsA4LandscapePdf_(spreadsheet, sheet) {
  var baseUrl = spreadsheet.getUrl().replace(/edit.*$/, '');
  var url = baseUrl + 'export?' + [
    'format=pdf',
    'size=A4',
    'portrait=false',       // 横向き
    'fitw=true',            // ページ幅に合わせて縮小
    'top_margin=0.4',
    'bottom_margin=0.4',
    'left_margin=0.3',
    'right_margin=0.3',
    'sheetnames=false',
    'printtitle=false',
    'pagenumbers=true',
    'gridlines=false',
    'fzr=true',             // 固定行（タイトル・ヘッダー）を各ページで繰り返す
    'horizontal_alignment=CENTER',
    'vertical_alignment=TOP',
    'gid=' + sheet.getSheetId()
  ].join('&');

  var response = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  return response.getBlob().setName('report.pdf');
}
