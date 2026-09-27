/**
 * ExternalSyncService.gs
 * 他システム(外部の管理用スプレッドシート)の登録データへ、本アプリで申請した内容のうち
 * 「登録日」「申請方法(OSS/紙登録)」だけを転記する。
 *
 * 転記先は「新車」用のタブ(例: "db_登録データ_2026_10月")。同じスプレッドシートに
 * 中古車用のタブ("db_登録データ_中古_2026_10月")もあるが、本アプリ(新車新規登録依頼書
 * 発行システム)が扱うのは新車のみのため、"中古" が付かないタブだけを対象にする。
 * タブは「登録日」の年月から自動で特定する(月ごとにタブが分かれているため)。
 *
 * 転記先シートの列構成(ユーザー提供の実物シートに合わせた固定レイアウト):
 *   B列: 登録予定日   F列: OSS区分   G列: 顧客名(=本アプリの「使用者名」とマッチングするキー)
 * 顧客名(G列)をキーに該当行を探し、見つかった行のB・F列だけを更新する
 * (行の新規作成は行わない。他システム側で事前に顧客の行が用意されている前提)。
 *
 * 未設定(スプレッドシートURL未登録)の場合は何もしない=機能OFFとして扱う。
 * 転記に失敗しても例外はここから投げるが、呼び出し側(Api.gs)で1台ごとにcatchし、
 * PDF発行・履歴記録という本アプリ側の主処理は失敗させない(警告としてまとめて返す)。
 */

var EXTERNAL_SYNC_SHEET_ID_PROP_KEY = 'externalSyncSheetId';
var EXTERNAL_SYNC_TAB_PREFIX = 'db_登録データ_'; // 中古車用は "db_登録データ_中古_..." で本アプリの対象外
var EXTERNAL_SYNC_HEADER_ROW = 1;
var EXTERNAL_SYNC_COLUMNS = {
  regDate: 2,       // B列: 登録予定日
  ossKind: 6,       // F列: OSS区分
  customerName: 7   // G列: 顧客名
};

/**
 * 「設定」画面用。転記先スプレッドシートのIDを返す(未設定なら空文字=機能OFF)。
 * @return {string}
 */
function getExternalSyncSheetId_() {
  return PropertiesService.getScriptProperties().getProperty(EXTERNAL_SYNC_SHEET_ID_PROP_KEY) || '';
}

/**
 * 「設定」画面の保存ボタン用。URLで貼り付けられてもIDだけを取り出して保存する。
 * 保存時にスプレッドシートを開けるか(共有設定・IDの正しさ)を確認する。
 * 空欄での保存は「転記しない」設定として許可する。
 * @param {string} idOrUrl
 * @return {string} 保存後のスプレッドシートID
 */
function saveExternalSyncSheetId_(idOrUrl) {
  var trimmed = String(idOrUrl || '').trim();
  var id = trimmed;
  var m = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(trimmed);
  if (m) id = m[1];

  if (id) {
    try {
      SpreadsheetApp.openById(id);
    } catch (e) {
      throw new Error('スプレッドシートを開けませんでした。URL・IDと共有設定(このアプリを使う人の閲覧・編集権限)をご確認ください。');
    }
  }

  PropertiesService.getScriptProperties().setProperty(EXTERNAL_SYNC_SHEET_ID_PROP_KEY, id);
  return id;
}

/**
 * 登録日から、転記先タブ名("db_登録データ_2026_10月"の形式)を組み立てる。
 * @param {Date} regDate
 * @return {string}
 */
function externalSyncTabName_(regDate) {
  var year = Utilities.formatDate(regDate, TIMEZONE, 'yyyy');
  var month = Utilities.formatDate(regDate, TIMEZONE, 'M'); // ゼロ埋めしない("10月"であって"010月"ではない)
  return EXTERNAL_SYNC_TAB_PREFIX + year + '_' + month + '月';
}

/**
 * 使用者名(=転記先の「顧客名」)をキーに該当行を探し、登録日・申請方法(OSS/紙登録)を転記する。
 * 転記先スプレッドシートが未設定の場合は何もしない。
 * タブが見つからない・該当する行が見つからない場合はエラーを投げる(呼び出し側でcatchする前提)。
 * @param {string} userName 使用者名(顧客名)
 * @param {Date} regDate 登録日(タブの年月の特定にも使う)
 * @param {string} typeLabel 転記する申請方法('OSS' または '紙登録')
 */
function syncRegistrationToExternalSheet_(userName, regDate, typeLabel) {
  var sheetId = getExternalSyncSheetId_();
  if (!sheetId) return; // 未設定 = 機能OFF

  var name = String(userName || '').trim();
  if (!name) return;

  var ss = SpreadsheetApp.openById(sheetId);
  var tabName = externalSyncTabName_(regDate);
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    throw new Error('転記先に「' + tabName + '」タブが見つかりませんでした');
  }

  var lastRow = sheet.getLastRow();
  if (lastRow <= EXTERNAL_SYNC_HEADER_ROW) {
    throw new Error('転記先「' + tabName + '」にデータ行がありません');
  }

  var nameRange = sheet.getRange(
    EXTERNAL_SYNC_HEADER_ROW + 1,
    EXTERNAL_SYNC_COLUMNS.customerName,
    lastRow - EXTERNAL_SYNC_HEADER_ROW,
    1
  );
  var names = nameRange.getValues();

  var matchedRow = -1;
  for (var i = 0; i < names.length; i++) {
    if (String(names[i][0] || '').trim() === name) {
      matchedRow = EXTERNAL_SYNC_HEADER_ROW + 1 + i;
      break;
    }
  }
  if (matchedRow === -1) {
    throw new Error('転記先「' + tabName + '」に使用者名「' + name + '」と一致する行が見つかりませんでした');
  }

  sheet.getRange(matchedRow, EXTERNAL_SYNC_COLUMNS.regDate).setValue(Utilities.formatDate(regDate, TIMEZONE, 'yyyy-MM-dd'));
  sheet.getRange(matchedRow, EXTERNAL_SYNC_COLUMNS.ossKind).setValue(typeLabel);
}
