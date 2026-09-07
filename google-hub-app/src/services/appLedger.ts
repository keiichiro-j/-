/**
 * 4. スクリプト管理 / 11.2 自社アプリ台帳機能への応用
 * 自社GASアプリ等へのリンクをスプレッドシート台帳で管理する。
 * URLを貼り付けるだけで登録でき、名称はリンク先ページの<title>から自動取得する
 * （台帳の内容を後から書き換える「編集」機能は持たせない。誤登録は削除のみ可能）。
 * UrlFetchAppによる簡易死活監視（起動確認）も行う。
 */
namespace AppLedger {
  const LEDGER_ID_PROPERTY = "LEDGER_SPREADSHEET_ID";
  const SHEET_NAME = "Apps";
  const HEADERS = ["id", "name", "url", "addedAt", "lastCheckedAt", "status"];

  /** HTTPステータスコードから稼働状況を判定する（純粋関数） */
  export function statusFromHttpCode(code: number): AppStatus {
    if (code >= 200 && code < 400) {
      return "ok";
    }
    return "error";
  }

  /** http/https のURLとして最低限妥当かを判定する（純粋関数） */
  export function isValidHttpUrl(url: string): boolean {
    return /^https?:\/\/.+/i.test(url.trim());
  }

  /** HTMLソースから<title>の中身を抜き出す（純粋関数）。見つからなければnull */
  export function extractTitle(html: string): string | null {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!match) {
      return null;
    }
    const decoded = match[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    return decoded.length > 0 ? decoded : null;
  }

  /** リンク先ページを取得し、<title>を名称として使う。取得できない場合はURLをそのまま名称にする */
  function resolveNameFromUrl(url: string): string {
    try {
      const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
      const title = extractTitle(response.getContentText());
      return title || url;
    } catch (e) {
      return url;
    }
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
      addedAt: toIso(row[3]),
      lastCheckedAt: row[4] ? toIso(row[4]) : null,
      status: (row[5] as AppStatus) || "unknown",
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

  /** URLを貼り付けるだけで登録する。名称はリンク先の<title>から自動取得する */
  export function addApp(url: string): AppLedgerEntry {
    const trimmedUrl = url.trim();
    if (!isValidHttpUrl(trimmedUrl)) {
      throw new Error("http:// または https:// で始まる正しいURLを入力してください");
    }
    const sheet = getOrCreateSheet();
    const id = Utilities.getUuid();
    const now = new Date().toISOString();
    const name = resolveNameFromUrl(trimmedUrl);
    sheet.appendRow([id, name, trimmedUrl, now, "", "unknown"]);
    return { id, name, url: trimmedUrl, addedAt: now, lastCheckedAt: null, status: "unknown" };
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
    sheet.getRange(rowIndex, 5, 1, 2).setValues([[now, status]]);
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
