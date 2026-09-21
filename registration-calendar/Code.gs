const DEFAULT_ADMIN_EMAIL = "k-toda@gifuyanase.co.jp";

// ▼ 権限者（設定ページの「サイドパネルアイコン設定」「マイページ連携設定」を変更できるアカウント）一覧。
//   登録・編集はスプレッドシートを直接編集する運用に変わったため、ここはアプリの管理設定を
//   触れる人の一覧という意味になっている（＝スプレッドシートの編集権限そのものとは別物）。
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
  template.initialTheme = getUserTheme();
  template.initialSideIconUrl = getSideIconUrl();
  template.initialSideIconFolderId = getSideIconFolderId();
  template.linkedName = getMyLinkedName_(userEmail);

  return template.evaluate()
    .setTitle('登録カレンダー')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================================================
// ▼ マイページ連携設定・テーマ・サイドパネルアイコン
//   「マイページ連携設定」は、マイページを自分の担当分だけ表示するための
//   「氏名(フルネーム) ⇔ Googleアカウント」の対応表であり、上の権限者一覧(EDITOR_EMAILS)とは
//   別物。ここに登録しても設定ページの管理項目は操作できるようにならない。
// ============================================================
const THEME_KEYS = ['indigo', 'green', 'charcoal', 'amber', 'rose', 'teal', 'purple', 'slate'];
const MYPAGE_LINK_SHEET_NAME = 'settings_マイページ連携';

// ▼ サイドパネルアイコンの画像をアップロードして保存するGoogleドライブのフォルダID。
//   コードを直接編集する必要はなく、設定ページの「サイドパネルアイコン設定」から
//   Driveフォルダのリンクに含まれるIDを入力して保存できる（権限者のみ）。
function getSideIconFolderId() {
  return PropertiesService.getScriptProperties().getProperty('sideIconFolderId') || '';
}
function saveSideIconFolderId(folderId) {
  const userEmail = Session.getActiveUser().getEmail();
  if (!isEditorEmail_(userEmail)) {
    return { success: false, message: '権限者のみ変更できます。' };
  }
  const trimmed = String(folderId || '').trim();
  if (!trimmed) return { success: false, message: 'フォルダIDを入力してください。' };
  try {
    DriveApp.getFolderById(trimmed); // 存在・アクセス可否を軽く確認する
  } catch (e) {
    return { success: false, message: '指定されたフォルダにアクセスできません。IDを確認してください。' };
  }
  PropertiesService.getScriptProperties().setProperty('sideIconFolderId', trimmed);
  return { success: true };
}

function getOrCreateMypageLinkSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(MYPAGE_LINK_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(MYPAGE_LINK_SHEET_NAME);
    sheet.getRange(1, 1, 1, 2).setValues([['氏名(フルネーム)', 'Googleアカウント']]);
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#E8F0FE');
  }
  return sheet;
}

// ▼ 氏名⇔Googleアカウントの対応表を取得する（マイページ連携用）
function getMypageLinks() {
  const sheet = getOrCreateMypageLinkSheet_();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1)
    .filter(row => row[0] || row[1])
    .map(row => ({ name: String(row[0] || ''), email: String(row[1] || '') }));
}

// ▼ 対応表を丸ごと保存する（権限者のみ）
function saveMypageLinks(links) {
  const userEmail = Session.getActiveUser().getEmail();
  if (!isEditorEmail_(userEmail)) {
    return { success: false, message: '権限者のみ変更できます。' };
  }
  const sheet = getOrCreateMypageLinkSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 2).clearContent();
  }
  const rows = (links || []).filter(l => l && (l.name || l.email)).map(l => [l.name || '', l.email || '']);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  }
  return { success: true };
}

// ▼ 指定のGoogleアカウントに紐づく氏名を1件返す（無ければ空文字）
function getMyLinkedName_(email) {
  if (!email) return '';
  const target = String(email).trim().toLowerCase();
  const found = getMypageLinks().find(l => String(l.email).trim().toLowerCase() === target);
  return found ? found.name : '';
}

// ▼ テーマは個人ごとの見た目設定なので、アクセスしているGoogleアカウントごとに保存する
function getUserTheme() {
  return PropertiesService.getUserProperties().getProperty('theme') || 'indigo';
}
function saveUserTheme(themeKey) {
  if (THEME_KEYS.indexOf(themeKey) === -1) return { success: false, message: '不正なテーマです。' };
  PropertiesService.getUserProperties().setProperty('theme', themeKey);
  return { success: true };
}

// ▼ サイドパネルのアイコンは画像アップロード方式。全員共通の見た目設定で、権限者だけが変更できる。
//   画像自体はDrive上のファイルとして保存し、表示側はDriveのサムネイル配信URLを使うことで、
//   大きな画像をアップロードしてもアプリ側では常に一定サイズのアイコンとして表示される。
function getSideIconUrl() {
  const fileId = PropertiesService.getScriptProperties().getProperty('sideIconFileId');
  if (!fileId) return '';
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w200`;
}

function saveSideIconImage(base64Data, mimeType) {
  const userEmail = Session.getActiveUser().getEmail();
  if (!isEditorEmail_(userEmail)) {
    return { success: false, message: '権限者のみ変更できます。' };
  }
  const folderId = getSideIconFolderId();
  if (!folderId) {
    return { success: false, message: 'アイコン画像の保存先フォルダが未設定です。設定画面の「サイドパネルアイコン設定」で先にDriveフォルダIDを保存してください。' };
  }
  try {
    const folder = DriveApp.getFolderById(folderId);
    const bytes = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(bytes, mimeType, 'side-icon-' + new Date().getTime());

    // 古いアイコン画像が残っていれば削除してから新しいものを保存する
    const oldFileId = PropertiesService.getScriptProperties().getProperty('sideIconFileId');
    if (oldFileId) {
      try { DriveApp.getFileById(oldFileId).setTrashed(true); } catch (e) { /* 既に削除済みなら無視 */ }
    }

    const file = folder.createFile(blob);
    // アプリのアクセス範囲(ドメイン内)に合わせて、ドメイン内なら誰でも閲覧できるようにする
    file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    PropertiesService.getScriptProperties().setProperty('sideIconFileId', file.getId());
    return { success: true, url: `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w200` };
  } catch (e) {
    return { success: false, message: 'アップロードに失敗しました: ' + e.message };
  }
}

function resetSideIcon() {
  const userEmail = Session.getActiveUser().getEmail();
  if (!isEditorEmail_(userEmail)) {
    return { success: false, message: '権限者のみ変更できます。' };
  }
  const oldFileId = PropertiesService.getScriptProperties().getProperty('sideIconFileId');
  if (oldFileId) {
    try { DriveApp.getFileById(oldFileId).setTrashed(true); } catch (e) { /* 既に削除済みなら無視 */ }
  }
  PropertiesService.getScriptProperties().deleteProperty('sideIconFileId');
  return { success: true };
}

// ============================================================
// ▼ スプレッドシート側のテンプレート(見出し・注釈・入力規則・重複チェック)
//   登録データの入力はアプリからではなく、このスプレッドシートを直接編集して行う。
//   新しい月のシートを作るときは createNextMonthSheet() を、既存シートに最新のテンプレート
//   (注釈・入力規則・重複チェックの書式)を当て直したいときは refreshAllSheetTemplates() を
//   GASエディタの関数選択メニューから手動実行してください。
// ============================================================
const BRANCH_OPTIONS = ['岐阜', '大垣', '多治見', '高山', 'AAA', 'デモカー', 'その他'];
const OSS_OPTIONS = ['OSS', '紙登録'];
// ステータスの選択肢。「登録予定日確定」以外は、登録予定日が未定のものとして未定リストに表示される。
const STATUS_OPTIONS = ['登録書類到着待', '登録書類到着済', '登録予定日確定'];
const STATUS_CONFIRMED = '登録予定日確定';
// 旧仕様（IDや旧ステータス名があった頃）からのデータ移行期間中も、カレンダーに正しく
// 表示され続けるように、旧ステータス名も「確定」扱いとして読み替える。
const LEGACY_CONFIRMED_STATUSES = ['登録日確定'];

const HEADER_NOTES = {
  'ステータス': '次の3つから選択してください。\n・登録書類到着待\n・登録書類到着済\n・登録予定日確定\n\n「登録予定日確定」を選択すると、登録予定日を入力した日付でカレンダーに表示されます。それ以外は「未定リスト」に表示されます。',
  '登録予定日': 'ステータスが「登録予定日確定」の場合に入力してください（yyyy-mm-dd）。未定の間は空欄のままで構いません。',
  '拠点': '次から選択してください。\n岐阜 / 大垣 / 多治見 / 高山 / AAA / デモカー / その他',
  '担当者': 'フルネームで入力してください。「設定」画面の「マイページ連携設定」に登録されているフルネームと文字が完全に一致しないと、その担当者のマイページに反映されません（全角/半角や旧姓などの表記ゆれに注意）。',
  '車種': '自由入力です。',
  'OSS区分': '「OSS」または「紙登録」を選択してください。',
  '顧客名': 'このセルの背景色が薄いオレンジになっている場合、同じシート内に同姓同名の顧客が他にもいます。誤って重複登録していないか確認してください（同月に同名で2台登録される正当なケースもあるため、問題なければそのままで構いません）。',
  '備考': '任意入力です。',
  '車検証リンク': 'この列は自動反映されます。手動で入力しないでください（Google Drive内の車検証PDFフォルダを自動巡回し、顧客名が一致するPDFのリンクを自動で貼り付けます）。',
};

function columnToLetter_(col) {
  let letter = '';
  while (col > 0) {
    const rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

// ▼ 見出しの注釈・入力規則(プルダウン)・同姓同名の重複チェック書式を、指定シートへまとめて適用する。
//   何度実行しても安全（既存の規則を上書きするだけで、他の手動書式には影響しない）。
function applySheetGuidance_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return;
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const templateRowCount = 500; // 入力規則・重複チェックを適用しておく行数の目安

  headers.forEach((h, i) => {
    if (HEADER_NOTES[h]) sheet.getRange(1, i + 1).setNote(HEADER_NOTES[h]);
  });

  function applyDropdown_(headerName, options, allowInvalid) {
    const colIndex = headers.indexOf(headerName);
    if (colIndex === -1) return;
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(options, true)
      .setAllowInvalid(!!allowInvalid)
      .build();
    sheet.getRange(2, colIndex + 1, templateRowCount, 1).setDataValidation(rule);
  }
  applyDropdown_('ステータス', STATUS_OPTIONS, false);
  applyDropdown_('拠点', BRANCH_OPTIONS, true);
  applyDropdown_('OSS区分', OSS_OPTIONS, false);

  // 顧客名列: 同じシート内に同姓同名（完全一致）が2件以上あるセルを薄いオレンジで塗る
  const nameColIndex = headers.indexOf('顧客名');
  if (nameColIndex !== -1) {
    const colLetter = columnToLetter_(nameColIndex + 1);
    const range = sheet.getRange(2, nameColIndex + 1, templateRowCount, 1);
    const formula = `=AND($${colLetter}2<>"", COUNTIF($${colLetter}$2:$${colLetter}$${templateRowCount + 1}, $${colLetter}2) > 1)`;
    const dupeRule = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(formula)
      .setBackground('#FDE9CB')
      .setRanges([range])
      .build();
    const targetA1 = range.getA1Notation();
    const existingRules = sheet.getConditionalFormatRules().filter(r => {
      const ranges = r.getRanges();
      return !(ranges.length === 1 && ranges[0].getA1Notation() === targetA1);
    });
    existingRules.push(dupeRule);
    sheet.setConditionalFormatRules(existingRules);
  }
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
  const requiredHeaders = ['ステータス', '登録予定日', '拠点', '担当者', '車種', 'OSS区分', '顧客名', '備考', '車検証リンク'];

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    sheet.getRange(1, 1, 1, requiredHeaders.length).setFontWeight('bold').setBackground('#E8F0FE');
    sheet.setFrozenRows(1);
    applySheetGuidance_(sheet);
  }
  return sheet;
}

// ▼ 翌月分のシートを、見出し・注釈・入力規則つきであらかじめ作成する。
//   GASエディタの関数選択メニューからこの関数を選んで実行してください。
function createNextMonthSheet() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const sheetName = `db_登録データ_${next.getFullYear()}_${next.getMonth() + 1}月`;
  getOrCreateDatabaseSheet(sheetName);
}

// ▼ 既存の db_登録データ シートすべてに、最新の注釈・入力規則・重複チェック書式を当て直す。
//   仕様変更後や、シートをコピーして新しい月を作った直後などに手動実行してください。
function refreshAllSheetTemplates() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets().filter(s => s.getName().startsWith('db_登録データ'));
  sheets.forEach(sheet => applySheetGuidance_(sheet));
}

// ▼ セルの数式（=HYPERLINK(...) など）を保持したまま2次元配列を取得する。
//   getValues() だけを使って一部のセルだけ書き換えてから丸ごと setValues() すると、
//   数式が入っていた他のセルまで「計算結果の文字列」に置き換わって消えてしまう
//   （＝車検証リンクのHYPERLINKが壊れる）ため、シートへの書き戻しを伴う処理は必ずこちらを使う。
function getSheetDataPreservingFormulas_(sheet) {
  const range = sheet.getDataRange();
  const values = range.getValues();
  const formulas = range.getFormulas();
  return values.map((row, r) => row.map((val, c) => formulas[r][c] || val));
}

// ▼ 全ての月別シートからデータを結合してフロントへ送る
function getRegistrationData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets().filter(s => s.getName().startsWith('db_登録データ'));

    let allData = [];

    sheets.forEach(sheet => {
      const range = sheet.getDataRange();
      const data = range.getValues();
      const formulas = range.getFormulas(); // 数式も取得してHYPERLINK対策

      if (data.length > 1) {
        const headers = data[0];
        const rows = data.slice(1);
        const sheetData = rows
          .filter(row => row.some(cell => cell !== '' && cell !== null)) // 完全な空行は除外
          .map((row, rowIndex) => {
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
            // 旧ステータス名（登録日確定）が残っている行も、カレンダー上は確定扱いにする
            if (LEGACY_CONFIRMED_STATUSES.indexOf(obj['ステータス']) !== -1) {
              obj['ステータス'] = STATUS_CONFIRMED;
            }
            return obj;
          });
        allData = allData.concat(sheetData);
      }
    });
    return allData;
  } catch(e) {
    return [];
  }
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

// フォルダ名が「2026.08」のような年.月形式かどうか
const MONTH_FOLDER_PATTERN = /^\d{4}\.\d{2}$/;

// ▼ 登録予定日から、それが属する月フォルダ名（例: 2026.08）を求める
function getMonthFolderNameFromDate_(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ▼ 全シートを巡回してPDFリンクを書き込む。
//   ・ファイル名は正規化した顧客名と完全一致するものだけを対象にする（部分一致だと「山田高」と
//     「山田高市」のような別人を誤って同一視してしまうため）。
//   ・PDFは「2026.08」のような月フォルダに格納されている前提で、同姓同名が複数いる場合は
//     登録予定日が属する月フォルダのファイルを優先する。
//   ・既にリンク済みの行は上書きしない（誤マッチにより後から空欄に戻ってしまうのを防ぐため）。
function autoLinkVehicleInspectionPDF() {
  const rootFolderId = "1yED-JQK20jCBAOf_4v1jxlp6AN0rhNYC";
  const rootFolder = DriveApp.getFolderById(rootFolderId);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets().filter(s => s.getName().startsWith('db_登録データ'));

  if (sheets.length === 0) return;

  const pdfList = []; // { normalizedName, url, monthFolder(なければnull) }
  function collectPdfFiles(folder, monthFolder) {
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      const rawName = file.getName();
      if (rawName.toLowerCase().endsWith(".pdf")) {
        const fileName = rawName.replace(/\.pdf$/i, "");
        pdfList.push({
          normalizedName: normalizeCustomerName(fileName),
          url: file.getUrl(),
          monthFolder: monthFolder
        });
      }
    }
    const subFolders = folder.getFolders();
    while (subFolders.hasNext()) {
      const sub = subFolders.next();
      // 直下（またはその配下）が月フォルダに入ったら、そのフォルダ名を子階層にも引き継ぐ
      const nextMonthFolder = monthFolder || (MONTH_FOLDER_PATTERN.test(sub.getName()) ? sub.getName() : null);
      collectPdfFiles(sub, nextMonthFolder);
    }
  }
  collectPdfFiles(rootFolder, null);

  // 正規化した顧客名が完全一致する候補の中から、対象月のフォルダのものを優先して1件選ぶ。
  // 月フォルダで絞り込めず候補が複数残る場合は、誤リンクを避けるため空のままにする。
  function findMatchedUrl(normalizedCustomerName, targetMonthFolder) {
    const candidates = pdfList.filter(p => p.normalizedName === normalizedCustomerName);
    if (candidates.length === 0) return "";
    if (targetMonthFolder) {
      const sameMonth = candidates.find(p => p.monthFolder === targetMonthFolder);
      if (sameMonth) return sameMonth.url;
    }
    if (candidates.length === 1) return candidates[0].url;
    return "";
  }

  sheets.forEach(sheet => {
    // 数式（他行の車検証リンクのHYPERLINK）を保持したまま読む。マッチした行以外は
    // そのまま書き戻すため、getValues()だけだと他行のリンクが消えてしまう。
    const data = getSheetDataPreservingFormulas_(sheet);
    if (data.length <= 1) return;

    const nameColIndex = data[0].indexOf("顧客名");
    const linkColIndex = data[0].indexOf("車検証リンク");
    const dateColIndex = data[0].indexOf("登録予定日");
    if (nameColIndex === -1 || linkColIndex === -1) return;

    let sheetMatchCount = 0;
    for (let i = 1; i < data.length; i++) {
      const customerName = data[i][nameColIndex];
      if (customerName && !data[i][linkColIndex]) {
        const normalizedCustomerName = normalizeCustomerName(customerName);
        if (!normalizedCustomerName) continue;

        const targetMonthFolder = dateColIndex !== -1 ? getMonthFolderNameFromDate_(data[i][dateColIndex]) : null;
        const matchedUrl = findMatchedUrl(normalizedCustomerName, targetMonthFolder);

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

// ▼ autoLinkVehicleInspectionPDF を定期実行するトリガーを設置する。
//   GASエディタからこの関数を一度だけ手動実行してください（重複設置は防止済み）。
//   これにより、ドライブにPDFが追加されてから最大15分程度でカレンダー/リストに反映されます。
function setupPdfLinkTrigger() {
  const alreadyExists = ScriptApp.getProjectTriggers().some(
    t => t.getHandlerFunction() === 'autoLinkVehicleInspectionPDF'
  );
  if (alreadyExists) return;

  ScriptApp.newTrigger('autoLinkVehicleInspectionPDF')
    .timeBased()
    .everyMinutes(15)
    .create();
}
