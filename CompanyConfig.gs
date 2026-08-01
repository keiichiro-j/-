/**
 * CompanyConfig.gs
 * 3社（拠点）分のスプレッドシートID・ドライブフォルダIDを Script Properties で管理する。
 *
 * 初回セットアップ時に setupCompanies_() を GAS エディタから手動実行するか、
 * 値を書き換えて一度だけ実行することで登録する。
 */

/**
 * 会社設定の取得
 * @return {Array<{id:string,name:string,sheetId:string,pdfFolderId:string,appraisalFolderId:string}>}
 */
function getCompanies() {
  var json = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.COMPANIES);
  if (!json) return [];
  return JSON.parse(json);
}

function getCompanyById(companyId) {
  var company = getCompanies().filter(function (c) { return c.id === companyId; })[0];
  if (!company) throw new Error('未登録の拠点IDです: ' + companyId);
  return company;
}

function saveCompanies(companies) {
  PropertiesService.getScriptProperties().setProperty(PROP_KEYS.COMPANIES, JSON.stringify(companies));
}

/**
 * 初回セットアップ用サンプル。実際のスプレッドシートID・フォルダIDに書き換えて
 * GAS エディタから一度だけ実行する。
 */
function setupCompanies_() {
  var companies = [
    {
      id: 'A',
      name: 'A社',
      sheetId: 'REPLACE_WITH_A社_SPREADSHEET_ID',
      pdfFolderId: 'REPLACE_WITH_A社_車検証PDFフォルダID',
      appraisalFolderId: 'REPLACE_WITH_A社_査定書PDFフォルダID'
    },
    {
      id: 'B',
      name: 'B社',
      sheetId: 'REPLACE_WITH_B社_SPREADSHEET_ID',
      pdfFolderId: 'REPLACE_WITH_B社_車検証PDFフォルダID',
      appraisalFolderId: 'REPLACE_WITH_B社_査定書PDFフォルダID'
    },
    {
      id: 'C',
      name: 'C社',
      sheetId: 'REPLACE_WITH_C社_SPREADSHEET_ID',
      pdfFolderId: 'REPLACE_WITH_C社_車検証PDFフォルダID',
      appraisalFolderId: 'REPLACE_WITH_C社_査定書PDFフォルダID'
    }
  ];
  saveCompanies(companies);
}

/**
 * 会社IDから該当スプレッドシートを開く
 */
function openCompanySpreadsheet(companyId) {
  var company = getCompanyById(companyId);
  return SpreadsheetApp.openById(company.sheetId);
}

/**
 * 指定タブ（シート）を取得。存在しなければヘッダー付きで新規作成する。
 */
function getOrCreateSheet(companyId, tabName) {
  var ss = openCompanySpreadsheet(companyId);
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    sheet.getRange(1, 1, 1, HEADER_ROW.length).setValues([HEADER_ROW]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}
