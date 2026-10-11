/**
 * Config.gs
 * 定数・シート定義・設定の初期値・地域名マスタの初期値と、設定の読み書き。
 * 定数部分は GAS サービスに依存しないため Node.js の単体テストからも読み込む。
 */

var APP_TITLE = '封印集計システム';

/** 集計単位 */
var UNITS = ['A', 'B', 'AI'];
var UNIT_LABELS = { A: 'ブランドA（岐阜）', B: 'ブランドB（岐阜）', AI: 'ブランドA（愛知）' };
var UNIT_SHORT = { A: 'ブランドA', B: 'ブランドB', AI: '愛知' };

/** 明細の状態 */
var STATUS = {
  OK: '正常', DUP: '重複', WARN: '誤りの疑い', PEND: '要確認', NOSEAL: '封印なし', EXCLUDED: '除外'
};
/** 画面用の状態コード */
var STATUS_CODE = { '正常': 'ok', '重複': 'err', '誤りの疑い': 'warn', '要確認': 'pend', '封印なし': 'ns', '除外': 'ex' };
/** 締めを妨げる状態 */
var BLOCKING_STATUSES = ['重複', '要確認', '誤りの疑い'];

/** チェックのレベル */
var LEVEL = { DUP: 'err', PEND: 'pend', WARN: 'warn', INFO: 'info' };

/** 地域名マスタの区分 */
var AREA_KIND = { GIFU: '岐阜', AICHI: '愛知', OTHER: '対象外' };

var DEFAULT_AREAS = {
  '岐阜': ['岐阜', '飛騨'],
  '愛知': ['名古屋', '尾張小牧', '一宮', '春日井', '三河', '岡崎', '豊田', '豊橋'],
  '対象外': ['三重', '鈴鹿', '四日市', '浜松', '静岡', '沼津', '伊豆', '富士山', '福井', '若狭',
    '長野', '松本', '諏訪', '滋賀', '大阪', '京都', '品川', '富山', '石川', '金沢']
};

/** 帳票：明細書のシート定義 [キー, 表示名, 集計単位, 新中('' は新中共通)] */
var DETAIL_SHEETS = [
  ['A新', 'ブランドA新車', 'A', '新'],
  ['A中', 'ブランドA中古車', 'A', '中'],
  ['B新', 'ブランドB新車', 'B', '新'],
  ['B中', 'ブランドB中古車', 'B', '中'],
  ['AI', '愛知', 'AI', '']
];
/** 帳票：台数集計書・報告書のシート定義 [キー, 表示名, 集計単位] */
var UNIT_SHEETS = [['A', 'ブランドA', 'A'], ['B', 'ブランドB', 'B'], ['AI', '愛知', 'AI']];

var DOC_TYPES = {
  detail: { label: '明細書', filePrefix: '封印明細書', settingKey: 'output.fileId.明細書' },
  count: { label: '台数集計書', filePrefix: '封印台数集計書', settingKey: 'output.fileId.台数集計書' },
  report: { label: '報告書', filePrefix: '封印報告書', settingKey: 'output.fileId.報告書' }
};

/** 読み取りフォルダ [設定キー, 表示名, ブランド, 新中] */
var INPUT_FOLDERS = [
  ['folder.A新', 'ブランドA・新車', 'A', '新'],
  ['folder.A中', 'ブランドA・中古車', 'A', '中'],
  ['folder.B新', 'ブランドB・新車', 'B', '新'],
  ['folder.B中', 'ブランドB・中古車', 'B', '中']
];
/** 移動先フォルダ [設定キー, 自動作成時のフォルダ名] */
var OUTPUT_FOLDERS = [
  ['folder.done', '処理済'], ['folder.review', '要確認'], ['folder.skip', '対象外'],
  ['folder.error', 'エラー'], ['folder.submit', '提出用']
];

var MANUAL_REASONS = ['再封印', 'PDFが届いていない', 'その他'];

/** シート名 */
var SHEET = {
  RECORDS: '明細', STOCK: '受入調整', SKIPLOG: '対象外ログ', PROCESSED: '処理済ファイル',
  CLOSING: '締め', AREAS: '地域名マスタ', SETTINGS: '設定', HISTORY: '履歴', USERS: '利用者'
};

/** 各シートの列定義 [プロパティ名, 見出し] */
var COLUMNS = {};
COLUMNS[SHEET.RECORDS] = [
  ['id', '管理ID'], ['regDate', '登録日'], ['area', '地域名'], ['cls', '分類番号'], ['kana', 'ひらがな'],
  ['num', '一連番号'], ['brand', 'ブランド'], ['nc', '新中'], ['unit', '集計単位'], ['vin', '車台番号'],
  ['status', '状態'], ['checks', 'チェック結果'], ['acked', '確認済みコード'], ['noSeal', '封印なし'],
  ['noSealReason', '封印なし理由'], ['inputType', '入力区分'], ['manualReason', '手入力理由'],
  ['excluded', '除外'], ['excludeReason', '除外理由'], ['dateCandidates', '登録日候補'],
  ['fileId', 'ファイルID'], ['fileName', 'ファイル名'], ['savedDate', '保存日'], ['importedAt', '取込日時'],
  ['updatedBy', '更新者'], ['updatedAt', '更新日時']
];
COLUMNS[SHEET.STOCK] = [
  ['id', '受入ID'], ['kind', '種類'], ['date', '日付'], ['unit', '集計単位'], ['qty', '個数'],
  ['memo', 'メモ'], ['canceled', '取消'], ['by', '入力者'], ['at', '入力日時']
];
COLUMNS[SHEET.SKIPLOG] = [
  ['fileId', 'ファイルID'], ['fileName', 'ファイル名'], ['brand', 'ブランド'], ['nc', '新中'],
  ['plate', '登録番号'], ['regDate', '登録日'], ['reason', '理由'], ['at', '処理日時']
];
COLUMNS[SHEET.PROCESSED] = [
  ['fileId', 'ファイルID'], ['fileName', 'ファイル名'], ['hash', 'SHA-256'], ['result', '結果'],
  ['recordId', '管理ID'], ['at', '処理日時']
];
COLUMNS[SHEET.CLOSING] = [
  ['month', '年月'], ['unit', '集計単位'], ['carry', '繰越'], ['received', '受入'], ['adjusted', '調整'],
  ['used', '封印台数'], ['left', '月末残数'], ['closed', '締め'], ['by', '締めた人'], ['at', '日時']
];
COLUMNS[SHEET.AREAS] = [['area', '地域名'], ['kind', '区分']];
COLUMNS[SHEET.SETTINGS] = [['key', 'キー'], ['value', '値'], ['note', '内容']];
COLUMNS[SHEET.HISTORY] = [
  ['seq', '連番'], ['at', '日時'], ['by', '利用者'], ['action', '操作'], ['target', '対象'],
  ['field', '項目'], ['before', '修正前'], ['after', '修正後'], ['note', '備考']
];
COLUMNS[SHEET.USERS] = [['email', 'メール'], ['name', '名前'], ['role', '役割']];

var ROLE = { ADMIN: '管理者', EDITOR: '編集者' };

/** 設定シートの初期値 [キー, 値, 内容] */
var DEFAULT_SETTINGS = [
  ['folder.A新', '', 'ブランドA新車の読み取りフォルダID'],
  ['folder.A中', '', 'ブランドA中古車の読み取りフォルダID'],
  ['folder.B新', '', 'ブランドB新車の読み取りフォルダID'],
  ['folder.B中', '', 'ブランドB中古車の読み取りフォルダID'],
  ['folder.root', '', 'アプリ用フォルダ（移動先・帳票の親）'],
  ['folder.done', '', '処理済の移動先（自動作成）'],
  ['folder.review', '', '要確認の移動先（自動作成）'],
  ['folder.skip', '', '対象外の移動先（自動作成）'],
  ['folder.error', '', 'エラーの移動先（自動作成）'],
  ['folder.submit', '', '提出用PDFの保存先（自動作成）'],
  ['auto.enabled', true, '自動取込のオンオフ'],
  ['auto.intervalMin', 10, '自動取込の間隔（5/10/15/30分）'],
  ['check.dateToleranceDays', 7, '保存日と登録日の許容差（日）'],
  ['check.useVin', true, '車台番号を重複判定に使う'],
  ['notify.lowStock', 10, '残数がこの数を切ったら通知'],
  ['notify.closeRemind', true, '毎月1日の締めリマインド'],
  ['notify.to', '', '通知先（カンマ区切り。空なら利用者全員）'],
  ['notify.lowSent.A', false, '残数通知の送信済みフラグ'],
  ['notify.lowSent.B', false, '残数通知の送信済みフラグ'],
  ['notify.lowSent.AI', false, '残数通知の送信済みフラグ'],
  ['start.month', '2026-10', '稼働開始月'],
  ['start.carry.A', 0, '開始月の月初残数（ブランドA岐阜）'],
  ['start.carry.B', 0, '開始月の月初残数（ブランドB岐阜）'],
  ['start.carry.AI', 0, '開始月の月初残数（ブランドA愛知）'],
  ['output.yearly', true, '年ごとに帳票ファイルを分ける'],
  ['output.fileId.明細書', '', '帳票ファイルのID（年ごとの場合はJSON）'],
  ['output.fileId.台数集計書', '', '帳票ファイルのID（年ごとの場合はJSON）'],
  ['output.fileId.報告書', '', '帳票ファイルのID（年ごとの場合はJSON）'],
  ['layout.detail', '', '明細書の差し込み位置（JSON。空なら標準レイアウト）'],
  ['layout.count', '', '台数集計書の差し込み位置（JSON。空なら標準レイアウト）'],
  ['layout.report', '', '報告書の差し込み位置（JSON。空なら標準レイアウト）'],
  ['app.url', '', 'WebアプリのURL（通知メールに記載）'],
  ['import.lastRun', '', '最終取込日時']
];

/** 1回の取込の打ち切り時間（ミリ秒） */
var IMPORT_TIME_LIMIT_MS = 5 * 60 * 1000;
var HOLIDAY_CALENDAR_ID = 'ja.japanese#holiday@group.v.calendar.google.com';

/* ---------------- 設定の読み書き（GAS） ---------------- */

var settingsCache_ = null;

/** 設定をキー→値のオブジェクトで返す（真偽・数値は型を戻す） */
function getSettings_() {
  if (settingsCache_) return settingsCache_;
  var rows = readAll_(SHEET.SETTINGS);
  var s = {};
  DEFAULT_SETTINGS.forEach(function (d) { s[d[0]] = d[1]; });
  rows.forEach(function (r) { if (r.key) s[r.key] = coerceSetting_(r.value); });
  settingsCache_ = s;
  return s;
}

function coerceSetting_(v) {
  if (v === 'TRUE' || v === 'true') return true;
  if (v === 'FALSE' || v === 'false') return false;
  return v;
}

/** 比較用の文字列（true と "TRUE" を同じとみなす） */
function settingText_(v) {
  return typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v == null ? '' : v);
}

function getSetting_(key) { return getSettings_()[key]; }

/** 設定をまとめて保存する。変更前後を返す */
function setSettings_(obj) {
  var sheet = getSheet_(SHEET.SETTINGS);
  var values = sheet.getDataRange().getValues();
  var changes = [];
  var index = {};
  for (var i = 1; i < values.length; i++) index[values[i][0]] = i;
  Object.keys(obj).forEach(function (key) {
    var v = obj[key];
    if (index[key] !== undefined) {
      var before = values[index[key]][1];
      if (settingText_(before) !== settingText_(v)) {
        changes.push({ key: key, before: before, after: v });
        values[index[key]][1] = v;
      }
    } else {
      var note = '';
      DEFAULT_SETTINGS.forEach(function (d) { if (d[0] === key) note = d[2]; });
      values.push([key, v, note]);
      index[key] = values.length - 1;
      changes.push({ key: key, before: '', after: v });
    }
  });
  if (changes.length) {
    sheet.getRange(1, 1, values.length, 3).setValues(values.map(function (r) { return [r[0], r[1], r[2]]; }));
  }
  settingsCache_ = null;
  return changes;
}

/** 地域名マスタを {地域名: 区分} で返す */
function getAreaMaster_() {
  var map = {};
  readAll_(SHEET.AREAS).forEach(function (r) { if (r.area) map[String(r.area).trim()] = String(r.kind).trim(); });
  return map;
}

/** 地域名マスタを {岐阜:[...], 愛知:[...], 対象外:[...]} にまとめる（純粋関数） */
function groupAreas_(master) {
  var g = { '岐阜': [], '愛知': [], '対象外': [] };
  Object.keys(master).forEach(function (a) { (g[master[a]] = g[master[a]] || []).push(a); });
  return g;
}

/** 文字列のフォルダURLまたはIDからIDを取り出す（純粋関数） */
function parseFolderId_(input) {
  var s = String(input || '').trim();
  if (!s) return '';
  var m = s.match(/\/folders\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : '';
}
