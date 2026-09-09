const DEFAULT_ADMIN_EMAIL = "k-toda@gifuyanase.co.jp";

// ▼ 編集を許可するGoogleアカウント一覧
//   ここに登録されたアカウントでアクセスした人だけが登録・編集できます。
//   追加/削除したい場合はこの配列にメールアドレスを追記・削除してください（要デプロイ更新）。
const EDITOR_EMAILS = [
  DEFAULT_ADMIN_EMAIL,
];

function isEditorEmail_(email) {
  if (!email) return false;
  const target = String(email).trim().toLowerCase();
  return EDITOR_EMAILS.some(e => String(e).trim().toLowerCase() === target);
}

function doGet() {
  const userEmail = Session.getActiveUser().getEmail();
  const isEditor = isEditorEmail_(userEmail);

  const template = HtmlService.createTemplateFromFile('Index');
  template.isEditor = isEditor;
  template.userEmail = userEmail;

  return template.evaluate()
    .setTitle('登録カレンダー')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ▼ 日付からシート名を生成（例：db_登録データ_2026_8月）
function getSheetNameFromDate(dateStr) {
  if (!dateStr) return 'db_登録データ_未定';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'db_登録データ_未定';
  return `db_登録データ_${d.getFullYear()}_${d.getMonth() + 1}月`;
}

function getOrCreateDatabaseSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  const requiredHeaders = ['ID', 'ステータス', '登録予定日', '拠点', '担当者', '車種', 'OSS区分', '顧客名', '備考', '車検証リンク'];

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    sheet.getRange(1, 1, 1, requiredHeaders.length).setFontWeight('bold').setBackground('#E8F0FE');
  }
  return sheet;
}

// ▼ 全ての月別シートからデータを結合してフロントへ送る
function getRegistrationData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    let allData = [];

    sheets.forEach(sheet => {
      if (sheet.getName().startsWith('db_登録データ')) {
        const range = sheet.getDataRange();
        const data = range.getValues();
        const formulas = range.getFormulas(); // 数式も取得してHYPERLINK対策

        if (data.length > 1) {
          const headers = data[0];
          const rows = data.slice(1);
          const sheetData = rows.map((row, rowIndex) => {
            let obj = {};
            headers.forEach((header, index) => {
              let val = row[index];
              const formula = formulas[rowIndex + 1][index];

              // HYPERLINK関数の場合は中のURLだけを抽出する
              if (formula && String(formula).toUpperCase().startsWith('=HYPERLINK')) {
                const match = formula.match(/=HYPERLINK\("([^"]+)"/i);
                if (match) {
                  val = match[1];
                }
              } else if (val instanceof Date) {
                val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
              }

              obj[header] = val;
            });
            return obj;
          });
          allData = allData.concat(sheetData);
        }
      }
    });
    return allData;
  } catch(e) {
    return [];
  }
}

// ▼ 保存処理（月が変わった場合のシート間引っ越し対応）
// 編集権限はアクセス中のGoogleアカウントが EDITOR_EMAILS に含まれるかどうかで判定する。
function saveRecord(record) {
  const userEmail = Session.getActiveUser().getEmail();
  if (!isEditorEmail_(userEmail)) {
    return { success: false, message: `編集権限がありません。（現在のアカウント: ${userEmail || '不明'}）\n担当者用のGoogleアカウントでアクセスしてください。` };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheetName = getSheetNameFromDate(record.登録予定日);
  const targetSheet = getOrCreateDatabaseSheet(targetSheetName);
  const headers = targetSheet.getRange(1, 1, 1, targetSheet.getLastColumn()).getValues()[0];

  let existingRowData = [];
  let foundSheet = null;
  let foundRowIndex = -1;

  if (record.ID) {
    const sheets = ss.getSheets();
    for (let s = 0; s < sheets.length; s++) {
      const sheet = sheets[s];
      if (sheet.getName().startsWith('db_登録データ')) {
        const data = sheet.getDataRange().getValues();
        if (data.length <= 1) continue;
        const idIndex = data[0].indexOf('ID');
        for (let i = 1; i < data.length; i++) {
          if (data[i][idIndex] == record.ID) {
            foundSheet = sheet;
            foundRowIndex = i + 1;
            existingRowData = data[i];
            break;
          }
        }
        if (foundSheet) break;
      }
    }
  } else {
    record.ID = 'ID-' + new Date().getTime();
  }

  const rowData = headers.map((header, index) => {
    if (record.hasOwnProperty(header)) {
      let value = record[header] || '';

      // ヘッダー名が「車検証リンク」で、かつ値が空でない場合にHYPERLINK化する
      if (header === '車検証リンク' && value !== '') {
        if (!String(value).startsWith('=')) {
          value = `=HYPERLINK("${value}", "車検証リンク")`;
        }
      }

      return value;
    } else {
      return (existingRowData.length > index && existingRowData[index] !== undefined) ? existingRowData[index] : '';
    }
  });

  if (foundSheet && foundRowIndex > 0) {
    if (foundSheet.getName() === targetSheetName) {
      foundSheet.getRange(foundRowIndex, 1, 1, rowData.length).setValues([rowData]);
    } else {
      foundSheet.deleteRow(foundRowIndex);
      targetSheet.appendRow(rowData);
    }
  } else {
    targetSheet.appendRow(rowData);
  }

  return { success: true };
}

function normalizeCustomerName(name) {
  if (!name) return "";
  let str = String(name);
  str = str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(s) {
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
  });
  str = str.replace(/[\s ]+/g, "");
  str = str.replace(/㈱|\(株\)|（株）|株式会社/g, "株式会社");
  str = str.replace(/㈲|\(有\)|（有）|有限会社/g, "有限会社");
  return str;
}

// ▼ 全シートを巡回してPDFリンクを書き込む（部分一致）
function autoLinkVehicleInspectionPDF() {
  const rootFolderId = "1yED-JQK20jCBAOf_4v1jxlp6AN0rhNYC";
  const rootFolder = DriveApp.getFolderById(rootFolderId);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets().filter(s => s.getName().startsWith('db_登録データ'));

  if (sheets.length === 0) return;

  const pdfList = [];
  function getAllPdfFiles(folder) {
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      const rawName = file.getName();
      if (rawName.toLowerCase().endsWith(".pdf")) {
        const fileName = rawName.replace(/\.pdf$/i, "");
        pdfList.push({
          normalizedName: normalizeCustomerName(fileName),
          url: file.getUrl()
        });
      }
    }
    const subFolders = folder.getFolders();
    while (subFolders.hasNext()) {
      getAllPdfFiles(subFolders.next());
    }
  }

  getAllPdfFiles(rootFolder);

  sheets.forEach(sheet => {
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;

    const nameColIndex = data[0].indexOf("顧客名");
    const linkColIndex = data[0].indexOf("車検証リンク");
    if (nameColIndex === -1 || linkColIndex === -1) return;

    let sheetMatchCount = 0;
    for (let i = 1; i < data.length; i++) {
      const customerName = data[i][nameColIndex];
      if (customerName) {
        const normalizedCustomerName = normalizeCustomerName(customerName);
        if (!normalizedCustomerName) continue;

        let matchedUrl = "";
        for (let j = 0; j < pdfList.length; j++) {
          if (pdfList[j].normalizedName.indexOf(normalizedCustomerName) !== -1) {
            matchedUrl = pdfList[j].url;
            break;
          }
        }

        if (matchedUrl) {
          // 生のURLではなくHYPERLINK関数で書き込む
          data[i][linkColIndex] = `=HYPERLINK("${matchedUrl}", "車検証リンク")`;
          sheetMatchCount++;
        }
      }
    }
    if (sheetMatchCount > 0) {
      sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
    }
  });
}
