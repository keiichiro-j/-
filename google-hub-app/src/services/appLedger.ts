/**
 * 4. スクリプト管理 / 11.2 自社アプリ台帳機能への応用
 * 自社GASアプリの一覧（名称・URL・用途・更新日）をスプレッドシート台帳で管理し、
 * UrlFetchAppによる簡易死活監視（起動確認）を行う。
 */
namespace AppLedger {
  const LEDGER_ID_PROPERTY = "LEDGER_SPREADSHEET_ID";
  const SHEET_NAME = "Apps";
  const HEADERS = ["id", "name", "url", "description", "updatedAt", "lastCheckedAt", "status"];

  /** HTTPステータスコードから稼働状況を判定する（純粋関数） */
  export function statusFromHttpCode(code: number): AppStatus {
    if (code >= 200 && code < 400) {
      return "ok";
    }
    return "error";
  }

  function getOrCreateSpreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet {
    const props = PropertiesService.getScriptProperties();
    const existingId = props.getProperty(LEDGER_ID_PROPERTY);
    if (existingId) {
      try {
        return SpreadsheetApp.openById(existingId);
      } catch (e) {
        // 参照先が削除されている等の場合は作り直す
      }
    }
    const spreadsheet = SpreadsheetApp.create("GoogleHubApp_台帳");
    props.setProperty(LEDGER_ID_PROPERTY, spreadsheet.getId());
    return spreadsheet;
  }

  function getOrCreateSheet(): GoogleAppsScript.Spreadsheet.Sheet {
    const spreadsheet = getOrCreateSpreadsheet();
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = spreadsheet.getSheets()[0];
      sheet.setName(SHEET_NAME);
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
    }
    return sheet;
  }

  function rowToEntry(row: (string | number | boolean | Date)[]): AppLedgerEntry {
    return {
      id: String(row[0]),
      name: String(row[1]),
      url: String(row[2]),
      description: String(row[3]),
      updatedAt: toIso(row[4]),
      lastCheckedAt: row[5] ? toIso(row[5]) : null,
      status: (row[6] as AppStatus) || "unknown",
    };
  }

  function toIso(value: string | number | boolean | Date): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return String(value);
  }

  export function listApps(): AppLedgerEntry[] {
    const sheet = getOrCreateSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return [];
    }
    const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
    return values.filter((row) => row[0]).map(rowToEntry);
  }

  function findRowIndexById(sheet: GoogleAppsScript.Spreadsheet.Sheet, id: string): number {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return -1;
    }
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === id) {
        return i + 2; // 1-indexed + header row
      }
    }
    return -1;
  }

  export function addApp(name: string, url: string, description: string): AppLedgerEntry {
    const sheet = getOrCreateSheet();
    const id = Utilities.getUuid();
    const now = new Date().toISOString();
    sheet.appendRow([id, name, url, description, now, "", "unknown"]);
    return { id, name, url, description, updatedAt: now, lastCheckedAt: null, status: "unknown" };
  }

  export function updateApp(id: string, name: string, url: string, description: string): AppLedgerEntry {
    const sheet = getOrCreateSheet();
    const rowIndex = findRowIndexById(sheet, id);
    if (rowIndex === -1) {
      throw new Error("台帳エントリが見つかりません: " + id);
    }
    const now = new Date().toISOString();
    sheet.getRange(rowIndex, 2, 1, 3).setValues([[name, url, description]]);
    sheet.getRange(rowIndex, 5).setValue(now);
    const row = sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0];
    return rowToEntry(row);
  }

  export function deleteApp(id: string): void {
    const sheet = getOrCreateSheet();
    const rowIndex = findRowIndexById(sheet, id);
    if (rowIndex !== -1) {
      sheet.deleteRow(rowIndex);
    }
  }

  /** 対象アプリへ簡易ヘルスチェック(HTTPリクエスト)を行い、結果を台帳に反映する */
  export function checkApp(id: string): AppLedgerEntry {
    const sheet = getOrCreateSheet();
    const rowIndex = findRowIndexById(sheet, id);
    if (rowIndex === -1) {
      throw new Error("台帳エントリが見つかりません: " + id);
    }
    const url = String(sheet.getRange(rowIndex, 3).getValue());
    let status: AppStatus = "error";
    try {
      const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
      status = statusFromHttpCode(response.getResponseCode());
    } catch (e) {
      status = "error";
    }
    const now = new Date().toISOString();
    sheet.getRange(rowIndex, 6, 1, 2).setValues([[now, status]]);
    const row = sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0];
    return rowToEntry(row);
  }

  export function checkAllApps(): AppLedgerEntry[] {
    return listApps().map((entry) => {
      try {
        return checkApp(entry.id);
      } catch (e) {
        return entry;
      }
    });
  }
}
