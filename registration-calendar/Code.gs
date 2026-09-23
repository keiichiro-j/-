const DEFAULT_ADMIN_EMAIL = "k-toda@gifuyanase.co.jp";

// ▼ 権限者（設定ページの各種管理項目を変更できるアカウント）一覧。
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

// ============================================================
// ▼ スプレッドシート画面のカスタムメニュー（メニューバーの「ヘルプ」の横に追加される）
//   スプレッドシートを開くたびに自動実行される。新車・中古車それぞれのシート操作を分けて置く。
// ============================================================
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('シート設定')
    .addItem('新車: 翌月のシートを作成', 'menuCreateNextMonthSheetNewCar_')
    .addItem('中古車: 翌月のシートを作成', 'menuCreateNextMonthSheetUsedCar_')
    .addSeparator()
    .addItem('新車・中古車 全シートにテンプレートを再適用', 'menuRefreshAllSheetTemplates_')
    .addSeparator()
    .addItem('車検証PDF自動リンクの定期実行を設定', 'menuSetupPdfLinkTrigger_')
    .addItem('登録予定日確定時のカレンダー自動反映を設定', 'menuSetupCalendarSyncTrigger_')
    .addToUi();
}
function menuCreateNextMonthSheetNewCar_() {
  createNextMonthSheet('新車');
  SpreadsheetApp.getUi().alert('新車の翌月シートを作成しました（既にあれば変更ありません）。');
}
function menuCreateNextMonthSheetUsedCar_() {
  createNextMonthSheetUsedCar();
  SpreadsheetApp.getUi().alert('中古車の翌月シートを作成しました（既にあれば変更ありません）。');
}
function menuRefreshAllSheetTemplates_() {
  refreshAllSheetTemplates();
  SpreadsheetApp.getUi().alert('新車・中古車の全シートにテンプレート（注釈・入力規則・警告表示）を再適用しました。');
}
function menuSetupPdfLinkTrigger_() {
  setupPdfLinkTrigger();
  SpreadsheetApp.getUi().alert('車検証PDF自動リンクの定期実行トリガーを設定しました（既に設定済みの場合は変更ありません）。');
}
function menuSetupCalendarSyncTrigger_() {
  setupCalendarSyncTrigger();
  SpreadsheetApp.getUi().alert('登録予定日確定時のカレンダー自動反映トリガーを設定しました（既に設定済みの場合は変更ありません）。\n反映先は担当者マスタに登録済みのアカウントのみで、かつ各担当者がこのトリガーの実行アカウントにカレンダーの変更権限を共有している必要があります。');
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
  const linkedInfo = getMyLinkedInfo_(userEmail);
  template.linkedName = linkedInfo.name;
  template.linkedCarType = linkedInfo.carType;
  template.initialAnnouncementsNew = getAnnouncements('新車');
  template.initialAnnouncementsUsed = getAnnouncements('中古車');
  template.initialPdfFolderNew = getPdfFolderId('新車');
  template.initialPdfFolderUsed = getPdfFolderId('中古車');

  return template.evaluate()
    .setTitle('登録カレンダー')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================================================
// ▼ 車両区分（新車・中古車）
//   新車・中古車は、それぞれ別のスプレッドシート群（db_登録データ_... / db_登録データ_中古_...）
//   と、別の車検証保管フォルダを持つ。カレンダー・未定リストもこの区分ごとに独立して表示される。
// ============================================================
const CAR_TYPES = ['新車', '中古車'];
const NEW_CAR_SHEET_PREFIX = 'db_登録データ_';
const USED_CAR_SHEET_PREFIX = 'db_登録データ_中古_';

function sheetPrefixForCarType_(carType) {
  return carType === '中古車' ? USED_CAR_SHEET_PREFIX : NEW_CAR_SHEET_PREFIX;
}
// ▼ 車両区分に応じた db_登録データ シート一覧を返す。
//   「新車」は中古車用プレフィックスを含まないシートのみに絞り込む（中古車用プレフィックスは
//   新車用プレフィックスで始まるため、単純な startsWith だけでは新車に混ざってしまう）。
function getDbSheetsForCarType_(carType) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (carType === '中古車') {
    return ss.getSheets().filter(s => s.getName().startsWith(USED_CAR_SHEET_PREFIX));
  }
  return ss.getSheets().filter(s => s.getName().startsWith(NEW_CAR_SHEET_PREFIX) && !s.getName().startsWith(USED_CAR_SHEET_PREFIX));
}

// ============================================================
// ▼ マイページ連携設定（担当者マスタ）・テーマ・サイドパネルアイコン・お知らせ
//   「担当者マスタ」は、マイページを自分の担当分だけ表示するための
//   「氏名(フルネーム) ⇔ Googleアカウント ⇔ 拠点」の対応表であり、上の権限者一覧(EDITOR_EMAILS)とは
//   別物。ここに登録しても設定ページの管理項目は操作できるようにならない。
// ============================================================
const THEME_KEYS = ['indigo', 'green', 'charcoal', 'amber', 'rose', 'teal', 'purple', 'slate', 'navy', 'terracotta'];
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

// ▼ 車検証PDFの保管フォルダID（新車・中古車それぞれ）。
//   設定ページの「車検証ファイル設定」から、コードを編集せずに保存できる（権限者のみ）。
//   「新車」は移行期間中、未設定であればこれまでハードコードしていたフォルダIDにフォールバックする。
const PDF_FOLDER_PROP_PREFIX = 'pdfFolderId_';
const DEFAULT_NEW_CAR_PDF_FOLDER_ID = '1yED-JQK20jCBAOf_4v1jxlp6AN0rhNYC';

function getPdfFolderId(carType) {
  const stored = PropertiesService.getScriptProperties().getProperty(PDF_FOLDER_PROP_PREFIX + carType);
  if (stored) return stored;
  if (carType === '新車') return DEFAULT_NEW_CAR_PDF_FOLDER_ID;
  return '';
}
function savePdfFolderId(carType, folderId) {
  const userEmail = Session.getActiveUser().getEmail();
  if (!isEditorEmail_(userEmail)) {
    return { success: false, message: '権限者のみ変更できます。' };
  }
  if (CAR_TYPES.indexOf(carType) === -1) return { success: false, message: '不正な車両区分です。' };
  const trimmed = String(folderId || '').trim();
  if (!trimmed) return { success: false, message: 'フォルダIDを入力してください。' };
  try {
    DriveApp.getFolderById(trimmed);
  } catch (e) {
    return { success: false, message: '指定されたフォルダにアクセスできません。IDを確認してください。' };
  }
  PropertiesService.getScriptProperties().setProperty(PDF_FOLDER_PROP_PREFIX + carType, trimmed);
  return { success: true };
}

// ▼ 画面上部に表示する「お知らせ」。新車・中古車それぞれ別に設定でき、権限者のみ編集できる。
const ANNOUNCEMENTS_PROP_PREFIX = 'announcements_';
function getAnnouncements(carType) {
  const type = CAR_TYPES.indexOf(carType) !== -1 ? carType : '新車';
  const raw = PropertiesService.getScriptProperties().getProperty(ANNOUNCEMENTS_PROP_PREFIX + type);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}
// ▼ 文字色として保存してよい値か（HTML属性に埋め込むため、#RRGGBB形式のみ許可する）
function isValidHexColor_(color) {
  return /^#[0-9A-Fa-f]{6}$/.test(String(color || ''));
}
function saveAnnouncements(carType, list) {
  const userEmail = Session.getActiveUser().getEmail();
  if (!isEditorEmail_(userEmail)) {
    return { success: false, message: '権限者のみ変更できます。' };
  }
  if (CAR_TYPES.indexOf(carType) === -1) return { success: false, message: '不正な車両区分です。' };
  const cleaned = (list || [])
    .filter(a => a && String(a.text || '').trim())
    .map(a => {
      const item = { text: String(a.text).trim() };
      if (isValidHexColor_(a.color)) item.color = String(a.color);
      return item;
    })
    .slice(0, 20);
  PropertiesService.getScriptProperties().setProperty(ANNOUNCEMENTS_PROP_PREFIX + carType, JSON.stringify(cleaned));
  return { success: true };
}

// ▼ カレンダー設定（書類提出締切日などの日付ごとの案内）。車両区分・年・月ごとに最大10件まで。
const CALENDAR_NOTICE_MAX = 10;
function calendarNoticeKey_(carType, year, month) {
  return 'calNotices_' + carType + '_' + year + '-' + (Number(month) + 1);
}
function getCalendarNotices(carType, year, month) {
  const raw = PropertiesService.getScriptProperties().getProperty(calendarNoticeKey_(carType, year, month));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}
function saveCalendarNotices(carType, year, month, notices) {
  const userEmail = Session.getActiveUser().getEmail();
  if (!isEditorEmail_(userEmail)) {
    return { success: false, message: '権限者のみ変更できます。' };
  }
  if (CAR_TYPES.indexOf(carType) === -1) return { success: false, message: '不正な車両区分です。' };
  const cleaned = (notices || [])
    .filter(n => n && n.date && String(n.text || '').trim())
    .map(n => {
      const item = { date: String(n.date), text: String(n.text).trim() };
      if (isValidHexColor_(n.color)) item.color = String(n.color);
      return item;
    })
    .slice(0, CALENDAR_NOTICE_MAX);
  PropertiesService.getScriptProperties().setProperty(calendarNoticeKey_(carType, year, month), JSON.stringify(cleaned));
  return { success: true };
}

const MYPAGE_LINK_HEADERS = ['氏名(フルネーム)', 'Googleアカウント', '拠点', '担当車両区分'];

function getOrCreateMypageLinkSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(MYPAGE_LINK_SHEET_NAME);
  const colCount = MYPAGE_LINK_HEADERS.length;
  if (!sheet) {
    sheet = ss.insertSheet(MYPAGE_LINK_SHEET_NAME);
    sheet.getRange(1, 1, 1, colCount).setValues([MYPAGE_LINK_HEADERS]);
    sheet.getRange(1, 1, 1, colCount).setFontWeight('bold').setBackground('#E8F0FE');
  } else if (sheet.getLastColumn() < colCount) {
    // 旧バージョン（列が少ないシート）に不足している見出し列を追い足す
    for (let c = sheet.getLastColumn() + 1; c <= colCount; c++) {
      sheet.getRange(1, c).setValue(MYPAGE_LINK_HEADERS[c - 1]);
      sheet.getRange(1, c).setFontWeight('bold').setBackground('#E8F0FE');
    }
  }
  // 担当車両区分列に入力規則(プルダウン)を付けておく（空欄＝未設定も許可）
  const carTypeColIndex = MYPAGE_LINK_HEADERS.indexOf('担当車両区分') + 1;
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(CAR_TYPES, true).setAllowInvalid(true).build();
  sheet.getRange(2, carTypeColIndex, 500, 1).setDataValidation(rule);
  return sheet;
}

// ▼ 氏名⇔Googleアカウント⇔拠点⇔担当車両区分の対応表（担当者マスタ）を取得する
function getMypageLinks() {
  const sheet = getOrCreateMypageLinkSheet_();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1)
    .filter(row => row[0] || row[1])
    .map(row => ({
      name: String(row[0] || ''),
      email: String(row[1] || ''),
      branch: String(row[2] || ''),
      carType: String(row[3] || ''),
      isEditor: isEditorEmail_(row[1]),
    }));
}

// ▼ 対応表を丸ごと保存する（権限者のみ）
function saveMypageLinks(links) {
  const userEmail = Session.getActiveUser().getEmail();
  if (!isEditorEmail_(userEmail)) {
    return { success: false, message: '権限者のみ変更できます。' };
  }
  const sheet = getOrCreateMypageLinkSheet_();
  const colCount = MYPAGE_LINK_HEADERS.length;
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, colCount).clearContent();
  }
  const rows = (links || []).filter(l => l && (l.name || l.email)).map(l => [l.name || '', l.email || '', l.branch || '', l.carType || '']);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, colCount).setValues(rows);
  }
  return { success: true };
}

// ▼ 指定のGoogleアカウントに紐づく氏名・担当車両区分を返す（無ければ空文字）
function getMyLinkedInfo_(email) {
  if (!email) return { name: '', carType: '' };
  const target = String(email).trim().toLowerCase();
  const found = getMypageLinks().find(l => String(l.email).trim().toLowerCase() === target);
  return found ? { name: found.name, carType: found.carType || '' } : { name: '', carType: '' };
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
// ▼ スプレッドシート側のテンプレート(見出し・注釈・入力規則・重複/担当者マスタ照合チェック)
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
  '担当者': 'フルネームで入力してください。設定画面の「担当者マスタ」に登録されているフルネームと文字が完全に一致しないと、その担当者のマイページに反映されません（全角/半角や旧姓などの表記ゆれに注意）。このセルの背景色が薄い赤になっている場合、担当者マスタに登録のない名前が入力されています。',
  '車種': '自由入力です。',
  'OSS区分': '「OSS」または「紙登録」を選択してください。',
  '顧客名': 'このセルの背景色が薄いオレンジになっている場合、同じシート内に同姓同名の顧客が他にもいます。誤って重複登録していないか確認してください（同月に同名で2台登録される正当なケースもあるため、問題なければそのままで構いません）。',
  '備考': '任意入力です。',
  '車検証リンク': 'この列は自動反映されます。手動で入力しないでください（Google Drive内の車検証PDFフォルダを自動巡回し、顧客名が一致するPDFのリンクを自動で貼り付けます）。',
  '登録カレンダー反映': 'この列は自動反映されます。手動で入力しないでください（ステータスが「登録予定日確定」になった行について、担当者マスタで紐づいたGoogleアカウントのカレンダーに顧客名・車種・登録方法を自動反映した記録用です）。',
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

// ▼ 「同じシート内の指定列で、値が重複/条件に一致するセルを強調表示する」条件付き書式を適用する
//   共通ヘルパー。顧客名の重複チェックと、担当者マスタ未登録チェックの両方で使う。
function applyColumnHighlight_(sheet, headers, headerName, templateRowCount, formulaFn, bgColor) {
  const colIndex = headers.indexOf(headerName);
  if (colIndex === -1) return;
  const colLetter = columnToLetter_(colIndex + 1);
  const range = sheet.getRange(2, colIndex + 1, templateRowCount, 1);
  const formula = formulaFn(colLetter, templateRowCount);
  const rule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(formula)
    .setBackground(bgColor)
    .setRanges([range])
    .build();
  const targetA1 = range.getA1Notation();
  const existingRules = sheet.getConditionalFormatRules().filter(r => {
    const ranges = r.getRanges();
    return !(ranges.length === 1 && ranges[0].getA1Notation() === targetA1);
  });
  existingRules.push(rule);
  sheet.setConditionalFormatRules(existingRules);
}

// ▼ 見出しの注釈・入力規則(プルダウン)・重複チェック/担当者マスタ照合の書式を、指定シートへまとめて適用する。
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
  applyColumnHighlight_(sheet, headers, '顧客名', templateRowCount, (colLetter) => {
    return `=AND($${colLetter}2<>"", COUNTIF($${colLetter}$2:$${colLetter}$${templateRowCount + 1}, $${colLetter}2) > 1)`;
  }, '#FDE9CB');

  // 担当者マスタ(settings_マイページ連携シート)に登録のない担当者名を薄い赤で塗る
  getOrCreateMypageLinkSheet_(); // 参照先シートが存在することを保証しておく
  applyColumnHighlight_(sheet, headers, '担当者', templateRowCount, (colLetter) => {
    return `=AND($${colLetter}2<>"", COUNTIF('${MYPAGE_LINK_SHEET_NAME}'!$A:$A, $${colLetter}2)=0)`;
  }, '#FCEAE8');
}

// ▼ 日付・車両区分からシート名を生成（例：db_登録データ_2026_8月 / db_登録データ_中古_2026_8月）
function getSheetNameFromDate(dateStr, carType) {
  const prefix = sheetPrefixForCarType_(carType);
  if (!dateStr) return prefix + '未定';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return prefix + '未定';
  return `${prefix}${d.getFullYear()}_${d.getMonth() + 1}月`;
}

function getOrCreateDatabaseSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  const requiredHeaders = ['ステータス', '登録予定日', '拠点', '担当者', '車種', 'OSS区分', '顧客名', '備考', '車検証リンク', '登録カレンダー反映'];

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
//   GASエディタの関数選択メニューから、新車は createNextMonthSheet()、
//   中古車は createNextMonthSheetUsedCar() を選んで実行してください。
function createNextMonthSheet(carType) {
  const type = CAR_TYPES.indexOf(carType) !== -1 ? carType : '新車';
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const sheetName = `${sheetPrefixForCarType_(type)}${next.getFullYear()}_${next.getMonth() + 1}月`;
  getOrCreateDatabaseSheet(sheetName);
}
function createNextMonthSheetUsedCar() {
  createNextMonthSheet('中古車');
}

// ▼ 既存の db_登録データ シート(新車・中古車とも)すべてに、最新の注釈・入力規則・重複/担当者マスタ
//   チェック書式を当て直す。仕様変更後や、シートをコピーして新しい月を作った直後などに手動実行してください。
function refreshAllSheetTemplates() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets().filter(s => s.getName().startsWith(NEW_CAR_SHEET_PREFIX));
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

// ▼ シート名（例: "db_登録データ_2026_9月"）から年・月を抽出する。
//   月次シートでなければ（＝「未定」シートなど）nullを返す。
//   月はJSのDate.getMonth()と揃えるため0始まりで返す。
function parseSheetMonth_(sheetName) {
  const match = String(sheetName).match(/_(\d{4})_(\d{1,2})月$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1 };
}

// ▼ 指定した車両区分の月別シートからデータを結合してフロントへ送る
function getRegistrationData(carType) {
  try {
    const type = CAR_TYPES.indexOf(carType) !== -1 ? carType : '新車';
    const sheets = getDbSheetsForCarType_(type);

    let allData = [];

    sheets.forEach(sheet => {
      const sheetMonth = parseSheetMonth_(sheet.getName());
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
            obj['車両区分'] = type;
            obj['_sheetYear'] = sheetMonth ? sheetMonth.year : null;
            obj['_sheetMonth'] = sheetMonth ? sheetMonth.month : null;
            return obj;
          });
        allData = allData.concat(sheetData);
      }
    });
    return allData;
  } catch(e) {
    Logger.log('getRegistrationData failed for carType=%s: %s', carType, e && e.stack ? e.stack : e);
    return [];
  }
}

// ▼ マイページは新車・中古車を横断して表示するため、両方の車両区分をまとめて返す。
function getAllRegistrationData() {
  let all = [];
  CAR_TYPES.forEach(t => { all = all.concat(getRegistrationData(t)); });
  return all;
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

// ▼ フォルダ名が「2026.08」「2026.8」のような年.月形式かどうかを判定し、
//   月の0埋め有無に関わらず比較できるよう "2026-8" のような正規化キーを返す（該当しなければnull）。
function normalizeMonthFolderKey_(name) {
  const m = /^(\d{4})\.(\d{1,2})$/.exec(String(name).trim());
  if (!m) return null;
  const year = m[1];
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12) return null;
  return `${year}-${month}`;
}

// ▼ 登録予定日から、それが属する月フォルダの正規化キー（例: "2026-8"）を求める
function getMonthFolderKeyFromDate_(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${d.getMonth() + 1}`;
}

// ▼ 指定した車両区分の全シートを巡回してPDFリンクを書き込む。
//   ・rootFolderId 配下は何階層でも再帰的に探索する（サブフォルダの深さは問わない）。
//   ・ファイル名は正規化した顧客名と完全一致するものだけを対象にする（部分一致だと「山田高」と
//     「山田高市」のような別人を誤って同一視してしまうため）。
//   ・PDFは「2026.08」または「2026.8」のような月フォルダに格納されている前提で、同姓同名が
//     複数いる場合は登録予定日が属する月フォルダのファイルを優先する。
//   ・既にリンク済みの行は上書きしない（誤マッチにより後から空欄に戻ってしまうのを防ぐため）。
function autoLinkVehicleInspectionPDF_(carType) {
  const rootFolderId = getPdfFolderId(carType);
  if (!rootFolderId) return; // 未設定の車両区分は何もしない

  let rootFolder;
  try {
    rootFolder = DriveApp.getFolderById(rootFolderId);
  } catch (e) {
    return; // 設定されたIDにアクセスできない場合は何もしない
  }

  const sheets = getDbSheetsForCarType_(carType);
  if (sheets.length === 0) return;

  const pdfList = []; // { normalizedName, url, monthFolderKey(なければnull) }
  function collectPdfFiles(folder, monthFolderKey) {
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      const rawName = file.getName();
      if (rawName.toLowerCase().endsWith(".pdf")) {
        const fileName = rawName.replace(/\.pdf$/i, "");
        pdfList.push({
          normalizedName: normalizeCustomerName(fileName),
          url: file.getUrl(),
          monthFolderKey: monthFolderKey
        });
      }
    }
    const subFolders = folder.getFolders();
    while (subFolders.hasNext()) {
      const sub = subFolders.next();
      // 直下（またはその配下）が月フォルダに入ったら、そのキーを子階層にも引き継ぐ
      const nextMonthFolderKey = monthFolderKey || normalizeMonthFolderKey_(sub.getName());
      collectPdfFiles(sub, nextMonthFolderKey);
    }
  }
  collectPdfFiles(rootFolder, null);

  // 正規化した顧客名が完全一致する候補の中から、対象月のフォルダのものを優先して1件選ぶ。
  // 月フォルダで絞り込めず候補が複数残る場合は、誤リンクを避けるため空のままにする。
  function findMatchedUrl(normalizedCustomerName, targetMonthFolderKey) {
    const candidates = pdfList.filter(p => p.normalizedName === normalizedCustomerName);
    if (candidates.length === 0) return "";
    if (targetMonthFolderKey) {
      const sameMonth = candidates.find(p => p.monthFolderKey === targetMonthFolderKey);
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

        const targetMonthFolderKey = dateColIndex !== -1 ? getMonthFolderKeyFromDate_(data[i][dateColIndex]) : null;
        const matchedUrl = findMatchedUrl(normalizedCustomerName, targetMonthFolderKey);

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
function autoLinkVehicleInspectionPDFNewCar() {
  autoLinkVehicleInspectionPDF_('新車');
}
function autoLinkVehicleInspectionPDFUsedCar() {
  autoLinkVehicleInspectionPDF_('中古車');
}

// ▼ 新車・中古車それぞれのPDF自動リンクを定期実行するトリガーを設置する。
//   GASエディタからこの関数を一度だけ手動実行してください（重複設置は防止済み）。
//   これにより、ドライブにPDFが追加されてから最大15分程度でカレンダー/リストに反映されます。
//   ※以前のバージョンで `autoLinkVehicleInspectionPDF` という名前のトリガーを設置済みの場合は、
//     関数名変更に伴い古いトリガーが無効化されるため、GASエディタの「トリガー」画面から削除してください。
function setupPdfLinkTrigger() {
  ['autoLinkVehicleInspectionPDFNewCar', 'autoLinkVehicleInspectionPDFUsedCar'].forEach(fnName => {
    const alreadyExists = ScriptApp.getProjectTriggers().some(
      t => t.getHandlerFunction() === fnName
    );
    if (alreadyExists) return;
    ScriptApp.newTrigger(fnName)
      .timeBased()
      .everyMinutes(15)
      .create();
  });
}

// ============================================================
// ▼ 登録予定日確定時の自動カレンダー反映
//   ステータスが「登録予定日確定」になった行について、担当者マスタ(settings_マイページ連携)で
//   紐づいているGoogleアカウントのカレンダーに、顧客名・車種・登録方法(OSS区分)を自動反映する。
//   ・「車検証PDF自動リンク」と同じ考え方で、定期実行トリガー(15分間隔)で動作する
//     (スプレッドシート編集時に即時実行するonEditトリガーは使わない。onEditは編集した
//     本人の権限で動くため、他の担当者のカレンダーへは書き込めない)。
//   ・反映先は担当者マスタに登録済みのアカウントのみ。未登録の担当者名の行は対象外。
//   ・反映先カレンダーは、このトリガーを設置したアカウントに対して、各担当者が
//     Googleカレンダーの共有設定で「予定の変更権限」を付与しておく必要がある(要・事前設定)。
//     共有されていない/カレンダーが見つからない場合はその行だけスキップし、
//     他の行の処理やトリガー自体は止めない。
//   ・二重登録を防ぐため、シートに「登録カレンダー反映」列を自動追加し、作成したイベントの
//     IDを記録する。この列が埋まっている行は再反映しない(手動で編集しないでください)。
// ============================================================
const CALENDAR_SYNC_COLUMN = '登録カレンダー反映';

// ▼ 指定シートに「登録カレンダー反映」列が無ければ追加し、その列インデックス(0始まり)を返す。
//   headers引数(そのシートの見出し配列)は、追加した場合その場で更新する。
function ensureCalendarSyncColumn_(sheet, headers) {
  let colIndex = headers.indexOf(CALENDAR_SYNC_COLUMN);
  if (colIndex !== -1) return colIndex;
  colIndex = headers.length;
  sheet.getRange(1, colIndex + 1).setValue(CALENDAR_SYNC_COLUMN);
  sheet.getRange(1, colIndex + 1).setFontWeight('bold').setBackground('#E8F0FE');
  if (HEADER_NOTES[CALENDAR_SYNC_COLUMN]) sheet.getRange(1, colIndex + 1).setNote(HEADER_NOTES[CALENDAR_SYNC_COLUMN]);
  headers.push(CALENDAR_SYNC_COLUMN);
  return colIndex;
}

// ▼ 指定した車両区分の全シートを巡回し、登録予定日確定済みでまだカレンダー未反映の行を
//   担当者のGoogleカレンダーに反映する。
function syncConfirmedRegistrationsToCalendar_(carType) {
  const sheets = getDbSheetsForCarType_(carType);
  if (sheets.length === 0) return;

  const emailByName = {};
  getMypageLinks().forEach(l => { if (l.name && l.email) emailByName[l.name] = l.email; });

  sheets.forEach(sheet => {
    const lastCol = sheet.getLastColumn();
    if (lastCol === 0) return;
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const statusCol = headers.indexOf('ステータス');
    const dateCol = headers.indexOf('登録予定日');
    const nameCol = headers.indexOf('顧客名');
    const modelCol = headers.indexOf('車種');
    const ossCol = headers.indexOf('OSS区分');
    const repCol = headers.indexOf('担当者');
    if (statusCol === -1 || dateCol === -1 || nameCol === -1 || repCol === -1) return;
    const syncCol = ensureCalendarSyncColumn_(sheet, headers); // 列追加時はheadersがこの場で伸びる

    // 列追加が発生した可能性があるため、シートの現在の内容を(数式を保持したまま)改めて読み直す
    const data = getSheetDataPreservingFormulas_(sheet);
    if (data.length <= 1) return;

    let changed = false;
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row.some(cell => cell !== '' && cell !== null)) continue; // 空行はスキップ
      if (row[syncCol]) continue; // 反映済み

      const rawStatus = row[statusCol];
      const status = LEGACY_CONFIRMED_STATUSES.indexOf(rawStatus) !== -1 ? STATUS_CONFIRMED : rawStatus;
      if (status !== STATUS_CONFIRMED) continue;

      const dateVal = row[dateCol];
      if (!dateVal) continue;
      const eventDate = dateVal instanceof Date ? dateVal : new Date(dateVal);
      if (isNaN(eventDate.getTime())) continue;

      const repName = row[repCol];
      const email = repName ? emailByName[String(repName)] : null;
      if (!email) continue; // 担当者マスタに未登録の担当者は対象外

      try {
        const calendar = CalendarApp.getCalendarById(email);
        if (!calendar) continue; // 共有されていない等でアクセスできない場合はスキップ
        const customerName = String(row[nameCol] || '');
        const model = modelCol !== -1 ? String(row[modelCol] || '') : '';
        const method = ossCol !== -1 ? String(row[ossCol] || '') : '';
        const title = `【登録予定】${customerName}`;
        const description = `顧客名: ${customerName}\nモデル: ${model}\n登録方法: ${method}\n担当者: ${repName}`;
        const event = calendar.createAllDayEvent(title, eventDate, { description: description });
        row[syncCol] = event.getId();
        changed = true;
      } catch (e) {
        Logger.log('calendar sync failed (sheet=%s, row=%s, email=%s): %s', sheet.getName(), i + 1, email, e && e.stack ? e.stack : e);
      }
    }
    if (changed) {
      sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
    }
  });
}
function syncConfirmedRegistrationsToCalendarNewCar() {
  syncConfirmedRegistrationsToCalendar_('新車');
}
function syncConfirmedRegistrationsToCalendarUsedCar() {
  syncConfirmedRegistrationsToCalendar_('中古車');
}

// ▼ 新車・中古車それぞれのカレンダー自動反映を定期実行するトリガーを設置する。
//   GASエディタ、またはスプレッドシートのメニュー「シート設定 > 登録予定日確定時のカレンダー
//   自動反映を設定」から一度だけ実行してください(重複設置は防止済み)。トリガーを設置した
//   アカウントに対して、各担当者が事前にGoogleカレンダーの共有設定で「予定の変更権限」を
//   付与しておく必要があります(付与されていない担当者の分はスキップされます)。
function setupCalendarSyncTrigger() {
  ['syncConfirmedRegistrationsToCalendarNewCar', 'syncConfirmedRegistrationsToCalendarUsedCar'].forEach(fnName => {
    const alreadyExists = ScriptApp.getProjectTriggers().some(
      t => t.getHandlerFunction() === fnName
    );
    if (alreadyExists) return;
    ScriptApp.newTrigger(fnName)
      .timeBased()
      .everyMinutes(15)
      .create();
  });
}
