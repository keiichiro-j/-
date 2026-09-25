const DEFAULT_ADMIN_EMAIL = "k-toda@gifuyanase.co.jp";

// ▼ 設定ページの一番下に表示するバージョン。Index.html側のバージョンと一致しているかで、
//   コードの貼り替えと「新しいバージョンでのデプロイ」が両方済んでいるかを確認できる。
const APP_VERSION = '2026.09.25-2';

// ▼ 権限者（設定ページの各種管理項目を変更できるアカウント）一覧。最大5名まで登録できます。
//   登録・編集はスプレッドシートを直接編集する運用に変わったため、ここはアプリの管理設定を
//   触れる人の一覧という意味になっている（＝スプレッドシートの編集権限そのものとは別物）。
//   追加したい場合は、下の空いている行のコメント(//)を外してメールアドレスに書き換えてください。
//   不要な行は削除して構いません（要デプロイ更新）。
const EDITOR_EMAILS = [
  DEFAULT_ADMIN_EMAIL,
  // "2人目のメールアドレスをここに",
  // "3人目のメールアドレスをここに",
  // "4人目のメールアドレスをここに",
  // "5人目のメールアドレスをここに",
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
    .addItem('登録予定日確定時のカレンダー自動反映を設定', 'menuSetupCalendarSyncTrigger_')
    .addItem('登録予定日確定時のカレンダー反映を今すぐ実行（結果・原因を確認）', 'menuRunCalendarSyncNow_')
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
  template.appVersion = APP_VERSION;
  template.initialSideIconUrl = getSideIconUrl();
  template.initialSideIconExternalUrl = getSideIconExternalUrl();
  template.initialExternalApps = getExternalApps();
  const linkedInfo = getMyLinkedInfo_(userEmail);
  template.linkedName = linkedInfo.name;
  template.linkedCarType = linkedInfo.carType;
  template.linkedBranch = linkedInfo.branch;
  template.linkedIsBranchManager = linkedInfo.isBranchManager;
  template.initialAnnouncementsNew = getAnnouncements('新車');
  template.initialAnnouncementsUsed = getAnnouncements('中古車');
  template.initialBranchesNew = getBranches('新車');
  template.initialBranchesUsed = getBranches('中古車');

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


// ▼ コントロールパネルに並べる他アプリへのリンク（最大5件、並び順どおりに表示）。権限者のみ編集できる。
const EXTERNAL_APPS_PROP = 'externalApps';
const EXTERNAL_APPS_MAX = 5;
// 以前の「車検証アプリ」単独設定。追加アプリが一度も保存されていなければ、1件目として引き継ぐ。
const LEGACY_VEHICLE_INSPECTION_APP_URL_PROP = 'vehicleInspectionAppUrl';
function getExternalApps() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(EXTERNAL_APPS_PROP);
  if (raw === null) {
    const legacyUrl = props.getProperty(LEGACY_VEHICLE_INSPECTION_APP_URL_PROP);
    return legacyUrl ? [{ name: '車検証アプリ', url: legacyUrl }] : [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}
function saveExternalApps(apps) {
  const userEmail = Session.getActiveUser().getEmail();
  if (!isEditorEmail_(userEmail)) {
    return { success: false, message: '権限者のみ変更できます。' };
  }
  const cleaned = (apps || [])
    .map(a => ({ name: String((a && a.name) || '').trim().slice(0, 20), url: String((a && a.url) || '').trim() }))
    .filter(a => a.name || a.url);
  if (cleaned.length > EXTERNAL_APPS_MAX) {
    return { success: false, message: `登録できるアプリは${EXTERNAL_APPS_MAX}件までです。` };
  }
  const invalid = cleaned.find(a => !a.name || !/^https?:\/\/\S+$/i.test(a.url));
  if (invalid) {
    return { success: false, message: `「${invalid.name || invalid.url}」の入力を確認してください。アプリ名と、http:// または https:// から始まるURLの両方が必要です。` };
  }
  const props = PropertiesService.getScriptProperties();
  props.setProperty(EXTERNAL_APPS_PROP, JSON.stringify(cleaned));
  props.deleteProperty(LEGACY_VEHICLE_INSPECTION_APP_URL_PROP);
  return { success: true, apps: cleaned };
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
// ▼ お知らせ・カレンダー案内の「部分書式(太字・文字色)」を安全に保存するためのサニタイザ。
//   許可するのは <b>...</b> と、色指定だけを持つ <span style="color:#RRGGBB;">...</span> のみ。
//   Apps ScriptのV8ランタイムにはDOMParserが無く、本物のHTMLパーサでサニタイズすることは
//   できないため、「まず全体をHTMLエスケープしてから、許可した書式の並びだけを実際のタグに
//   戻す」という方式にしている。この方式では、たとえ元の値に <span style="color:#F00;"
//   onclick="..."> のような余計な属性が混ざっていても、正規表現が完全一致しないため
//   エスケープされたまま(＝無害なテキストとして)残る。UIを経由しない直接呼び出し
//   （google.script.runの不正利用）であっても、蓄積型XSSにつながらないようにするための対策。
function sanitizeRichText_(html) {
  const escaped = String(html || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const restored = escaped
    .replace(/&lt;b&gt;/g, '<b>')
    .replace(/&lt;\/b&gt;/g, '</b>')
    .replace(/&lt;span style=&quot;color:(#[0-9A-Fa-f]{6});&quot;&gt;/g, '<span style="color:$1;">')
    .replace(/&lt;\/span&gt;/g, '</span>');
  // タグの開閉数が一致しない場合は壊れた書式とみなし、安全側(プレーンテキスト)に倒す
  const countMatches_ = (s, re) => (s.match(re) || []).length;
  const bBalanced = countMatches_(restored, /<b>/g) === countMatches_(restored, /<\/b>/g);
  const spanBalanced = countMatches_(restored, /<span style="color:#[0-9A-Fa-f]{6};">/g) === countMatches_(restored, /<\/span>/g);
  return (bBalanced && spanBalanced) ? restored : escaped;
}
function saveAnnouncements(carType, list) {
  const userEmail = Session.getActiveUser().getEmail();
  if (!isEditorEmail_(userEmail)) {
    return { success: false, message: '権限者のみ変更できます。' };
  }
  if (CAR_TYPES.indexOf(carType) === -1) return { success: false, message: '不正な車両区分です。' };
  const cleaned = (list || [])
    .filter(a => a && String(a.text || '').trim())
    .map(a => ({
      text: String(a.text).trim(),
      html: sanitizeRichText_(a.html || a.text),
    }))
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
    .map(n => ({
      date: String(n.date),
      text: String(n.text).trim(),
      html: sanitizeRichText_(n.html || n.text),
    }))
    .slice(0, CALENDAR_NOTICE_MAX);
  PropertiesService.getScriptProperties().setProperty(calendarNoticeKey_(carType, year, month), JSON.stringify(cleaned));
  return { success: true };
}

// ▼ 拠点マスタ（拠点名・KPIタイルやリストで使う色）。新車・中古車それぞれ別に、
//   権限者が設定ページから編集できる。同じアプリのコードを複数店舗で使い回す際、拠点名を
//   コードに直書きせずここで管理することで、コードを一切変更せずに拠点構成だけを
//   店舗ごとに変えられるようにしている。
const BRANCHES_PROP_PREFIX = 'branches_';
// ▼ どの拠点にも一致しないデータの受け皿として、常に一覧の最後に存在させる拠点名。
//   アプリ側のKPI集計などでも同じ名前を特別扱いしているため、変更しないこと。
const FALLBACK_BRANCH_NAME = 'その他';
const DEFAULT_BRANCHES = [
  { name: '岐阜', color: '#3B4FD1' },
  { name: '大垣', color: '#16924F' },
  { name: '多治見', color: '#7C3AED' },
  { name: '高山', color: '#C2790E' },
  { name: 'AAA', color: '#C93E77' },
  { name: 'デモカー', color: '#0C7C8C' },
  { name: FALLBACK_BRANCH_NAME, color: '#66707E' },
];
function isValidHexColor_(color) {
  return /^#[0-9A-Fa-f]{6}$/.test(String(color || ''));
}
// ▼ 「その他」が一覧に含まれていなければ末尾に補って返す（常に一覧に表示・編集できるようにするため）
function ensureFallbackBranch_(list) {
  const hasFallback = list.some(b => b && b.name === FALLBACK_BRANCH_NAME);
  return hasFallback ? list : list.concat([{ name: FALLBACK_BRANCH_NAME, color: '#66707E' }]);
}
function getBranches(carType) {
  const type = CAR_TYPES.indexOf(carType) !== -1 ? carType : '新車';
  const raw = PropertiesService.getScriptProperties().getProperty(BRANCHES_PROP_PREFIX + type);
  if (!raw) return DEFAULT_BRANCHES.slice();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? ensureFallbackBranch_(parsed) : DEFAULT_BRANCHES.slice();
  } catch (e) {
    return DEFAULT_BRANCHES.slice();
  }
}
// ▼ スプレッドシート側（拠点のプルダウン入力規則など）から参照するための、拠点名だけの配列
function getBranchNames_(carType) {
  return getBranches(carType).map(b => b.name);
}
// ▼ シート名(例: "db_登録データ_中古_2026_9月")から、そのシートが新車・中古車どちらの
//   拠点マスタを使うべきかを判定する
function carTypeForSheetName_(sheetName) {
  return String(sheetName).startsWith(USED_CAR_SHEET_PREFIX) ? '中古車' : '新車';
}
function saveBranches(carType, branches) {
  const userEmail = Session.getActiveUser().getEmail();
  if (!isEditorEmail_(userEmail)) {
    return { success: false, message: '権限者のみ変更できます。' };
  }
  if (CAR_TYPES.indexOf(carType) === -1) return { success: false, message: '不正な車両区分です。' };
  const cleaned = ensureFallbackBranch_((branches || [])
    .filter(b => b && String(b.name || '').trim())
    .map(b => ({
      name: String(b.name).trim(),
      color: isValidHexColor_(b.color) ? String(b.color) : '#66707E',
    }))
    .slice(0, 30));
  if (!cleaned.length) return { success: false, message: '拠点を1件以上登録してください。' };
  PropertiesService.getScriptProperties().setProperty(BRANCHES_PROP_PREFIX + carType, JSON.stringify(cleaned));
  return { success: true };
}

const MYPAGE_LINK_HEADERS = ['氏名(フルネーム)', 'Googleアカウント', '拠点', '担当車両区分', '拠点長'];

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
  // 拠点長列はチェックボックスにしておく
  const branchManagerColIndex = MYPAGE_LINK_HEADERS.indexOf('拠点長') + 1;
  const checkboxRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  sheet.getRange(2, branchManagerColIndex, 500, 1).setDataValidation(checkboxRule);
  return sheet;
}

// ▼ 氏名⇔Googleアカウント⇔拠点⇔担当車両区分⇔拠点長フラグの対応表（担当者マスタ）を取得する
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
      isBranchManager: row[4] === true || String(row[4]).toUpperCase() === 'TRUE',
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
  const rows = (links || []).filter(l => l && (l.name || l.email)).map(l => [l.name || '', l.email || '', l.branch || '', l.carType || '', !!l.isBranchManager]);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, colCount).setValues(rows);
  }
  return { success: true };
}

// ▼ 指定のGoogleアカウントに紐づく氏名・担当車両区分・拠点・拠点長フラグを返す（無ければ空）
function getMyLinkedInfo_(email) {
  if (!email) return { name: '', carType: '', branch: '', isBranchManager: false };
  const target = String(email).trim().toLowerCase();
  const found = getMypageLinks().find(l => String(l.email).trim().toLowerCase() === target);
  return found
    ? { name: found.name, carType: found.carType || '', branch: found.branch || '', isBranchManager: !!found.isBranchManager }
    : { name: '', carType: '', branch: '', isBranchManager: false };
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

// ▼ サイドパネルのアイコンは「画像アップロード」または「画像URLを直接指定」のどちらかで設定できる。
//   全員共通の見た目設定で、権限者だけが変更できる。
//   アップロード画像はブラウザ側で一辺256px以下に縮小したdata URI（画像データを埋め込んだ文字列）を、
//   Googleドライブではなくスクリプトプロパティに分割して保存する。以前のDrive保存方式では、
//   ・ファイル作成後の共有設定(setSharing)が組織の共有ポリシーで拒否されると、ファイルだけ残って
//     アイコンの設定が更新されない（＝「保存はできるのに反映されない」）
//   ・アプリは閲覧者ごとの権限で動くため、表示のたびに閲覧者のDrive権限に左右される
//   という問題があった。プロパティ保存ならDriveの権限・共有設定に一切左右されない。
const SIDE_ICON_CHUNK_SIZE = 8000;   // 1プロパティの上限(9KB)に収まる長さで分割する
const SIDE_ICON_MAX_CHARS = 100000;  // 画像データ全体の上限（ブラウザ側は90,000文字以内に収める）
const SIDE_ICON_DATA_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/]+={0,2}$/;

function getSideIconUrl() {
  const all = PropertiesService.getScriptProperties().getProperties();
  const source = all.sideIconSource || '';
  if (source === 'data') {
    const count = Number(all.sideIconDataCount || 0);
    let data = '';
    for (let i = 0; i < count; i++) data += all['sideIconData_' + i] || '';
    return SIDE_ICON_DATA_RE.test(data) ? data : '';
  }
  if (source === 'url') {
    const url = all.sideIconExternalUrl || '';
    // Driveの共有リンクは画像そのものではなくプレビュー画面のURLで<img>に表示できないため、
    // 以前に保存されたものは壊れた画像を出さずに既定のアイコンに戻す
    return extractDriveFileId_(url) ? '' : url;
  }
  // 旧方式（Driveに保存した画像）で設定済みの場合は、再設定されるまでそのまま表示を試みる
  const fileId = all.sideIconFileId;
  if (!fileId) return '';
  try {
    const blob = DriveApp.getFileById(fileId).getBlob();
    return `data:${blob.getContentType()};base64,${Utilities.base64Encode(blob.getBytes())}`;
  } catch (e) {
    return '';
  }
}

function getSideIconExternalUrl() {
  return PropertiesService.getScriptProperties().getProperty('sideIconExternalUrl') || '';
}

// ▼ 保存済みのアイコン画像データ（分割保存分）と、旧方式のDriveファイルの参照を消す
function clearSideIconData_(props) {
  const count = Number(props.getProperty('sideIconDataCount') || 0);
  for (let i = 0; i < count; i++) props.deleteProperty('sideIconData_' + i);
  props.deleteProperty('sideIconDataCount');
  const oldFileId = props.getProperty('sideIconFileId');
  if (oldFileId) {
    try { DriveApp.getFileById(oldFileId).setTrashed(true); } catch (e) { /* 既に削除済み・権限なしなら無視 */ }
    props.deleteProperty('sideIconFileId');
  }
}

function saveSideIconData(dataUri) {
  const userEmail = Session.getActiveUser().getEmail();
  if (!isEditorEmail_(userEmail)) {
    return { success: false, message: '権限者のみ変更できます。' };
  }
  const data = String(dataUri || '');
  if (!SIDE_ICON_DATA_RE.test(data)) {
    return { success: false, message: '画像データの形式が正しくありません。PNGかJPEGの画像でお試しください。' };
  }
  if (data.length > SIDE_ICON_MAX_CHARS) {
    return { success: false, message: '画像のデータが大きすぎます。別の画像でお試しください。' };
  }
  const props = PropertiesService.getScriptProperties();
  clearSideIconData_(props);
  const chunks = {};
  let count = 0;
  for (let i = 0; i < data.length; i += SIDE_ICON_CHUNK_SIZE) {
    chunks['sideIconData_' + count] = data.slice(i, i + SIDE_ICON_CHUNK_SIZE);
    count++;
  }
  chunks.sideIconDataCount = String(count);
  chunks.sideIconSource = 'data';
  props.setProperties(chunks);
  props.deleteProperty('sideIconExternalUrl');
  return { success: true, url: data };
}

// ▼ Googleドライブのファイルを指すURL（共有リンク・open?id=・uc?id=・lh3.googleusercontent.com/d/ など）
//   からファイルIDを取り出す。Drive以外のURLなら空文字を返す。
function extractDriveFileId_(input) {
  const s = String(input || '').trim();
  const isDrive = /^https:\/\/(drive|docs)\.google\.com\//i.test(s) || /^https:\/\/lh3\.googleusercontent\.com\/d\//i.test(s);
  if (!isDrive) return '';
  const m = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : '';
}

// ▼ ドライブ上の画像をアイコンとして取り込むため、権限者の権限で画像データを読み出して返す。
//   アプリは閲覧者ごとの権限で動く(executeAs: USER_ACCESSING)ため、元の画像を直接表示すると
//   その画像を見る権限のない人には表示されない。そこでブラウザ側で縮小したうえで
//   saveSideIconData（アップロードと同じ保存処理）に渡し、全員が見られる形で保存する。
function getDriveImageForIcon(url) {
  const userEmail = Session.getActiveUser().getEmail();
  if (!isEditorEmail_(userEmail)) {
    return { success: false, message: '権限者のみ変更できます。' };
  }
  const fileId = extractDriveFileId_(url);
  if (!fileId) return { success: false, message: 'GoogleドライブのファイルのURLを入力してください。' };
  let file;
  try {
    file = DriveApp.getFileById(fileId);
  } catch (e) {
    return { success: false, message: 'ドライブのファイルを開けませんでした。ご自身のアカウントで閲覧できるファイルか確認してください。' };
  }
  const mimeType = file.getMimeType();
  if (!/^image\//.test(mimeType)) {
    return { success: false, message: '画像ファイル（PNG・JPEGなど）のURLを指定してください。' };
  }
  if (file.getSize() > 8 * 1024 * 1024) {
    return { success: false, message: '画像サイズが大きすぎます。8MB以内の画像を指定してください。' };
  }
  return { success: true, base64: Utilities.base64Encode(file.getBlob().getBytes()), mimeType: mimeType };
}

// ▼ Drive経由のアップロードの代わりに、外部の画像URLを直接アイコンとして使う。
//   社内の別システムやブランドサイトで既に公開されている画像をそのまま使いたい場合などに利用する。
function saveSideIconUrl(url) {
  const userEmail = Session.getActiveUser().getEmail();
  if (!isEditorEmail_(userEmail)) {
    return { success: false, message: '権限者のみ変更できます。' };
  }
  const trimmed = String(url || '').trim();
  if (!trimmed) return { success: false, message: '画像のURLを入力してください。' };
  if (!/^https:\/\//i.test(trimmed)) {
    return { success: false, message: 'https:// から始まるURLを入力してください。' };
  }
  if (extractDriveFileId_(trimmed)) {
    return { success: false, message: 'GoogleドライブのリンクはURLのままでは表示できません。画面を再読み込みしてから、もう一度保存してください。' };
  }
  const props = PropertiesService.getScriptProperties();
  clearSideIconData_(props);
  props.setProperty('sideIconExternalUrl', trimmed);
  props.setProperty('sideIconSource', 'url');
  return { success: true, url: trimmed };
}

function resetSideIcon() {
  const userEmail = Session.getActiveUser().getEmail();
  if (!isEditorEmail_(userEmail)) {
    return { success: false, message: '権限者のみ変更できます。' };
  }
  const props = PropertiesService.getScriptProperties();
  clearSideIconData_(props);
  props.deleteProperty('sideIconExternalUrl');
  props.deleteProperty('sideIconSource');
  return { success: true };
}

// ============================================================
// ▼ スプレッドシート側のテンプレート(見出し・注釈・入力規則・重複/担当者マスタ照合チェック)
//   登録データの入力はアプリからではなく、このスプレッドシートを直接編集して行う。
//   新しい月のシートを作るときは createNextMonthSheet() を、既存シートに最新のテンプレート
//   (注釈・入力規則・重複チェックの書式)を当て直したいときは refreshAllSheetTemplates() を
//   GASエディタの関数選択メニューから手動実行してください。
// ============================================================
const OSS_OPTIONS = ['OSS', '紙登録'];
// ステータスの選択肢。「登録予定日確定」以外は、登録予定日が未定のものとして未定リストに表示される。
const STATUS_OPTIONS = ['登録書類到着待', '登録書類到着済', '登録予定日確定'];
const STATUS_CONFIRMED = '登録予定日確定';
// 旧仕様（IDや旧ステータス名があった頃）からのデータ移行期間中も、カレンダーに正しく
// 表示され続けるように、旧ステータス名も「確定」扱いとして読み替える。
const LEGACY_CONFIRMED_STATUSES = ['登録日確定'];

const HEADER_NOTES = {
  'ステータス': '次の3つから選択してください。\n・登録書類到着待\n・登録書類到着済\n・登録予定日確定\n\n「登録予定日確定」を選択すると、登録予定日を入力した日付でカレンダーに表示されます。それ以外は「未定リスト」に表示されます。',
  '登録予定日': 'ステータスが「登録予定日確定」の場合に入力してください。セルをクリックするとカレンダーが表示され、日付を選択できます（手入力の場合はyyyy-mm-dd形式）。未定の間は空欄のままで構いません。',
  '担当者': 'セルをクリックし、プルダウンから選択してください（設定画面の「担当者マスタ」に登録されているフルネームの一覧です）。選択すると、同じ行の「拠点」列にその担当者の拠点が自動で反映されます。一覧にない名前を直接入力した場合はマイページに反映されず、このセルの背景色も薄い赤になります。担当者マスタへの追加は設定画面から行ってください。',
  '車種': '自由入力です。',
  'OSS区分': '「OSS」または「紙登録」を選択してください。',
  '顧客名': 'このセルの背景色が薄いオレンジになっている場合、同じシート内に同姓同名の顧客が他にもいます。誤って重複登録していないか確認してください（同月に同名で2台登録される正当なケースもあるため、問題なければそのままで構いません）。',
  '備考': '任意入力です。',
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

  const branchNames = getBranchNames_(carTypeForSheetName_(sheet.getName()));

  headers.forEach((h, i) => {
    if (HEADER_NOTES[h]) sheet.getRange(1, i + 1).setNote(HEADER_NOTES[h]);
  });
  const branchColIndex = headers.indexOf('拠点');
  if (branchColIndex !== -1) {
    sheet.getRange(1, branchColIndex + 1).setNote('次から選択してください。\n' + branchNames.join(' / ') + '\n\n拠点の追加・変更は設定ページの「拠点設定」から行えます。');
  }

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
  applyDropdown_('拠点', branchNames, true);
  applyDropdown_('OSS区分', OSS_OPTIONS, false);

  // 担当者列: 自由入力ではなく、担当者マスタ(settings_マイページ連携シート)の氏名一覧から
  // プルダウンで選択する方式にする。参照が「範囲」なので、担当者マスタの登録内容が
  // 変わっても、この選択肢はテンプレートを再適用しなくても自動的に最新の状態になる。
  const mypageSheet = getOrCreateMypageLinkSheet_();
  const repNameColIndex = MYPAGE_LINK_HEADERS.indexOf('氏名(フルネーム)') + 1;
  const repMasterRange = mypageSheet.getRange(2, repNameColIndex, templateRowCount, 1);
  const repColIndex = headers.indexOf('担当者');
  if (repColIndex !== -1) {
    const repRule = SpreadsheetApp.newDataValidation().requireValueInRange(repMasterRange, true).setAllowInvalid(true).build();
    sheet.getRange(2, repColIndex + 1, templateRowCount, 1).setDataValidation(repRule);
  }

  // 登録予定日列: セルをクリックするとカレンダーから日付を選べるようにする(日付の入力規則を
  // 付けると、Googleスプレッドシートが自動でカレンダーピッカーを表示する)。
  const dateColIndex = headers.indexOf('登録予定日');
  if (dateColIndex !== -1) {
    sheet.getRange(2, dateColIndex + 1, templateRowCount, 1).setNumberFormat('yyyy-mm-dd');
    const dateRule = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(true).build();
    sheet.getRange(2, dateColIndex + 1, templateRowCount, 1).setDataValidation(dateRule);
  }

  // 顧客名列: 同じシート内に同姓同名（完全一致）が2件以上あるセルを薄いオレンジで塗る
  applyColumnHighlight_(sheet, headers, '顧客名', templateRowCount, (colLetter) => {
    return `=AND($${colLetter}2<>"", COUNTIF($${colLetter}$2:$${colLetter}$${templateRowCount + 1}, $${colLetter}2) > 1)`;
  }, '#FDE9CB');

  // 担当者マスタ(settings_マイページ連携シート)に登録のない担当者名を薄い赤で塗る
  // (プルダウン以外の値が直接入力・貼り付けされた場合の保険)
  applyColumnHighlight_(sheet, headers, '担当者', templateRowCount, (colLetter) => {
    return `=AND($${colLetter}2<>"", COUNTIF('${MYPAGE_LINK_SHEET_NAME}'!$A:$A, $${colLetter}2)=0)`;
  }, '#FCEAE8');

  // 登録予定日が過ぎている(当日は含まない)行は、登録状況が一目でわかるよう行全体をグレーで塗る。
  // 上の2つの強調表示より後に追加しているため、顧客名重複・担当者未登録の色の方が優先して見える。
  applyPastRegistrationDateRowHighlight_(sheet, headers, templateRowCount, lastCol);
}

function applyPastRegistrationDateRowHighlight_(sheet, headers, templateRowCount, lastCol) {
  const dateColIndex = headers.indexOf('登録予定日');
  if (dateColIndex === -1) return;
  const dateColLetter = columnToLetter_(dateColIndex + 1);
  const range = sheet.getRange(2, 1, templateRowCount, lastCol);
  const formula = `=AND($${dateColLetter}2<>"", $${dateColLetter}2<TODAY())`;
  const rule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(formula)
    .setBackground('#E7E8EC')
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

// ============================================================
// ▼ 担当者マスタからの拠点自動反映
//   db_登録データ系シートの「担当者」列に入力・変更があったとき、担当者マスタ
//   (settings_マイページ連携シート)に登録済みの氏名と一致すれば、その担当者の拠点を
//   同じ行の「拠点」列へ自動で反映する。単純トリガー(onEdit)なのでインストール操作は不要。
// ============================================================
function onEdit(e) {
  try {
    autoFillBranchFromRepMaster_(e);
  } catch (err) {
    Logger.log('onEdit failed: %s', err && err.stack ? err.stack : err);
  }
}
function autoFillBranchFromRepMaster_(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (!sheet.getName().startsWith(NEW_CAR_SHEET_PREFIX)) return; // db_登録データ系(新車・中古車とも)のみ対象
  const range = e.range;
  if (range.getRow() < 2) return; // 見出し行の編集は対象外

  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return;
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const repCol = headers.indexOf('担当者');
  const branchCol = headers.indexOf('拠点');
  if (repCol === -1 || branchCol === -1) return;

  // 編集範囲が「担当者」列を含んでいなければ何もしない（複数セル同時貼り付けにも対応する）
  const editStartCol = range.getColumn(), editEndCol = range.getColumn() + range.getNumColumns() - 1;
  if (repCol + 1 < editStartCol || repCol + 1 > editEndCol) return;

  const branchByName = {};
  getMypageLinks().forEach(l => { if (l.name) branchByName[l.name] = l.branch; });

  const startRow = Math.max(range.getRow(), 2);
  const numRows = range.getRow() + range.getNumRows() - startRow;
  if (numRows <= 0) return;
  const repValues = sheet.getRange(startRow, repCol + 1, numRows, 1).getValues();
  const branchRange = sheet.getRange(startRow, branchCol + 1, numRows, 1);
  const branchValues = branchRange.getValues();
  let changed = false;
  for (let i = 0; i < repValues.length; i++) {
    const repName = String(repValues[i][0] || '').trim();
    if (!repName) continue;
    const branch = branchByName[repName];
    if (!branch) continue;
    branchValues[i][0] = branch;
    changed = true;
  }
  if (changed) branchRange.setValues(branchValues);
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
  const requiredHeaders = ['ステータス', '登録予定日', '拠点', '担当者', '車種', 'OSS区分', '顧客名', '備考', '登録カレンダー反映'];

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
//   担当者のGoogleカレンダーに反映する。原因調査(メニューからの手動実行)に使えるよう、
//   反映件数・スキップ理由別の件数・詳細メッセージをまとめて返す。
function syncConfirmedRegistrationsToCalendar_(carType) {
  const stats = { synced: 0, skippedNoLink: 0, skippedNoCalendar: 0, details: [] };
  const sheets = getDbSheetsForCarType_(carType);
  if (sheets.length === 0) return stats;

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
      if (row[syncCol]) continue; // 反映済み(スキップ理由の集計対象にもしない)

      const rawStatus = row[statusCol];
      const status = LEGACY_CONFIRMED_STATUSES.indexOf(rawStatus) !== -1 ? STATUS_CONFIRMED : rawStatus;
      if (status !== STATUS_CONFIRMED) continue; // 未確定行は対象外(スキップ理由の集計対象にもしない)

      const dateVal = row[dateCol];
      if (!dateVal) continue;
      const eventDate = dateVal instanceof Date ? dateVal : new Date(dateVal);
      if (isNaN(eventDate.getTime())) continue;

      const repName = row[repCol];
      const email = repName ? emailByName[String(repName)] : null;
      if (!email) {
        stats.skippedNoLink++;
        stats.details.push(`${sheet.getName()} ${i + 1}行目: 担当者「${repName || '(空欄)'}」が担当者マスタに未登録`);
        continue;
      }

      try {
        const calendar = CalendarApp.getCalendarById(email);
        if (!calendar) {
          stats.skippedNoCalendar++;
          stats.details.push(`${sheet.getName()} ${i + 1}行目: ${email} のカレンダーが見つかりません(共有設定を確認してください)`);
          continue;
        }
        const customerName = String(row[nameCol] || '');
        const model = modelCol !== -1 ? String(row[modelCol] || '') : '';
        const method = ossCol !== -1 ? String(row[ossCol] || '') : '';
        const title = `【登録予定】${customerName}`;
        const description = `顧客名: ${customerName}\nモデル: ${model}\n登録方法: ${method}\n担当者: ${repName}`;
        const event = calendar.createAllDayEvent(title, eventDate, { description: description });
        row[syncCol] = event.getId();
        changed = true;
        stats.synced++;
      } catch (e) {
        stats.skippedNoCalendar++;
        const msg = e && e.message ? e.message : e;
        stats.details.push(`${sheet.getName()} ${i + 1}行目: ${email} への反映でエラー(${msg})`);
        Logger.log('calendar sync failed (sheet=%s, row=%s, email=%s): %s', sheet.getName(), i + 1, email, e && e.stack ? e.stack : e);
      }
    }
    if (changed) {
      sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
    }
  });
  return stats;
}
function syncConfirmedRegistrationsToCalendarNewCar() {
  syncConfirmedRegistrationsToCalendar_('新車');
}
function syncConfirmedRegistrationsToCalendarUsedCar() {
  syncConfirmedRegistrationsToCalendar_('中古車');
}
// ▼ トリガーの実行(最大15分間隔)を待たずに今すぐ反映を試し、反映件数とスキップ理由を
//   アラートで表示する（原因調査用）。スプレッドシートのメニュー「シート設定」から実行できる。
function menuRunCalendarSyncNow_() {
  const statsNew = syncConfirmedRegistrationsToCalendar_('新車');
  const statsUsed = syncConfirmedRegistrationsToCalendar_('中古車');
  const triggerInstalled = ScriptApp.getProjectTriggers().some(t =>
    ['syncConfirmedRegistrationsToCalendarNewCar', 'syncConfirmedRegistrationsToCalendarUsedCar'].indexOf(t.getHandlerFunction()) !== -1
  );
  const fmt = (label, s) => {
    const lines = [`【${label}】反映: ${s.synced}件 / 担当者マスタ未登録でスキップ: ${s.skippedNoLink}件 / カレンダーにアクセスできずスキップ: ${s.skippedNoCalendar}件`];
    if (s.details.length) {
      const shown = s.details.slice(0, 8);
      lines.push(shown.join('\n') + (s.details.length > shown.length ? `\n…ほか${s.details.length - shown.length}件` : ''));
    }
    return lines.join('\n');
  };
  const triggerMsg = triggerInstalled
    ? '定期実行トリガー: 設定済みです(以後15分間隔で自動実行されます)。'
    : '定期実行トリガー: まだ設定されていません。「登録予定日確定時のカレンダー自動反映を設定」を実行してください（これを実行しないと定期的な自動反映は行われません）。';
  SpreadsheetApp.getUi().alert(fmt('新車', statsNew) + '\n\n' + fmt('中古車', statsUsed) + '\n\n' + triggerMsg);
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
