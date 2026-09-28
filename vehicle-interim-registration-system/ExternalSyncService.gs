/**
 * ExternalSyncService.gs
 * 「名義変更」で申請した明細を、他システム(外部の顧客管理用スプレッドシート)の
 * 中古車データへ転記する。
 *
 * 中間登録書類送付書 発行システムには「使用者名」を直接入力する欄が無いため、
 * 明細の「備考」欄に「使用者名+ブランドコード」を区切り無しでそのまま入力してもらう
 * 運用にしている(例: 備考欄に「田中太郎MB」と入力)。parseTransferRemarks_() が
 * 末尾のブランドコード(BrandService.gs参照)を手がかりに使用者名とブランドへ分解する。
 *
 * 転記先スプレッドシートはブランドごとに異なるため、「設定」画面でブランドとスプレッド
 * シートの組を最大 EXTERNAL_SYNC_MAX_SHEETS 件まで登録できるようにし、備考欄から
 * 取り出したブランドに応じて転記先を選ぶ(新車新規登録依頼書 発行システムと同じ考え方)。
 *
 * 転記先は各スプレッドシートの「中古車」用のタブ(例: "db_登録データ_中古_2026_10月"、
 * 登録日の年月から自動で特定する)。名義変更の対象は中古車の名義変更が主のため、
 * 新車用のタブ(「_中古_」が付かないタブ)ではなく中古車用のタブに転記する。
 *
 * 転記先シートの列構成(新車新規登録依頼書 発行システムと共通の固定レイアウト):
 *   A列: ステータス   B列: 登録予定日   F列: OSS区分   G列: 顧客名
 * (顧客名=備考欄から取り出した使用者名とマッチングするキー)。
 * 顧客名(G列)をキーに該当行を探し、見つかった行のA・B・F列だけを更新する
 * (行の新規作成は行わない。他システム側で事前に顧客の行が用意されている前提)。
 * 転記できた行の「ステータス」は "登録予定日確定" に、「OSS区分」は常に "紙登録" を書き込む
 * (名義変更は中古車の他の手続きと同じ区分として扱うため)。
 *
 * 顧客名の一致判定は完全一致ではなく normalizeCustomerName_() を通した表記ゆれ吸収比較を行う。
 * ブランドに対応する転記先が1件も設定されていない(=機能が完全にOFF)場合は何もしない。
 * 備考欄の末尾がどのブランドコードとも一致しない場合(通常のメモ書き等)も何もしない
 * (使用者名+ブランドコードの表記で入力された行だけを転記対象とする)。
 */

var EXTERNAL_SYNC_SHEETS_PROP_KEY = 'externalSyncSheets';
var EXTERNAL_SYNC_MAX_SHEETS = 5;
var EXTERNAL_SYNC_TAB_PREFIX = 'db_登録データ_中古_'; // 名義変更は中古車用のタブへ転記する
var EXTERNAL_SYNC_HEADER_ROW = 1;
var EXTERNAL_SYNC_STATUS_CONFIRMED = '登録予定日確定';
var EXTERNAL_SYNC_OSS_KIND_VALUE = '紙登録'; // 名義変更は常にこの区分で転記する
var EXTERNAL_SYNC_COLUMNS = {
  status: 1,        // A列: ステータス
  regDate: 2,       // B列: 登録予定日
  ossKind: 6,       // F列: OSS区分
  customerName: 7   // G列: 顧客名
};

/**
 * 「設定」画面用。ブランドごとの転記先スプレッドシート一覧を返す(未設定なら空配列=機能OFF)。
 * @return {Array<{brand: string, sheetId: string}>}
 */
function getExternalSyncSheets_() {
  var raw = PropertiesService.getScriptProperties().getProperty(EXTERNAL_SYNC_SHEETS_PROP_KEY);
  if (!raw) return [];
  try {
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(function (row) {
        return {
          brand: typeof row.brand === 'string' ? row.brand.trim() : '',
          sheetId: typeof row.sheetId === 'string' ? row.sheetId.trim() : ''
        };
      })
      .filter(function (row) { return row.brand && row.sheetId; });
  } catch (e) {
    return [];
  }
}

/**
 * 「設定」画面の保存ボタン用。ブランド・スプレッドシートURLのどちらも空の行は無視する。
 * 片方だけ入力されている行、同じブランドの重複、開けないスプレッドシートはエラーにする。
 * URLで貼り付けられていてもIDだけを取り出して保存する。最大 EXTERNAL_SYNC_MAX_SHEETS 件まで。
 * @param {Array<{brand: string, sheetId: string}>} rows
 * @return {Array<{brand: string, sheetId: string}>} 保存後の内容(トリム済み)
 */
function saveExternalSyncSheets_(rows) {
  var cleaned = (rows || [])
    .map(function (row) {
      var brand = String((row && row.brand) || '').trim();
      var raw = String((row && row.sheetId) || '').trim();
      var sheetId = raw;
      var m = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(raw);
      if (m) sheetId = m[1];
      return { brand: brand, sheetId: sheetId };
    })
    .filter(function (row) { return row.brand || row.sheetId; });

  if (cleaned.length > EXTERNAL_SYNC_MAX_SHEETS) {
    throw new Error('転記先スプレッドシートは最大' + EXTERNAL_SYNC_MAX_SHEETS + '件までです');
  }

  var seenBrands = {};
  cleaned.forEach(function (row) {
    if (!row.brand || !row.sheetId) {
      throw new Error('ブランド・スプレッドシートURLは両方入力してください(' + (row.brand || row.sheetId) + ')');
    }
    if (seenBrands[row.brand]) {
      throw new Error('同じブランド「' + row.brand + '」が複数設定されています');
    }
    seenBrands[row.brand] = true;
    try {
      SpreadsheetApp.openById(row.sheetId);
    } catch (e) {
      throw new Error('スプレッドシートを開けませんでした(' + row.brand + '): URL・IDと共有設定をご確認ください。');
    }
  });

  PropertiesService.getScriptProperties().setProperty(EXTERNAL_SYNC_SHEETS_PROP_KEY, JSON.stringify(cleaned));
  return cleaned;
}

/**
 * 登録日から、転記先タブ名("db_登録データ_中古_2026_10月"の形式)を組み立てる。
 * @param {Date} regDate
 * @return {string}
 */
function externalSyncTabName_(regDate) {
  var year = Utilities.formatDate(regDate, TIMEZONE, 'yyyy');
  var month = Utilities.formatDate(regDate, TIMEZONE, 'M'); // ゼロ埋めしない("10月"であって"010月"ではない)
  return EXTERNAL_SYNC_TAB_PREFIX + year + '_' + month + '月';
}

// 法人格ごとの表記ゆれ(正式名称・括弧書きの略称・丸囲み文字)をまとめたグループ。
// 「株式会社」と「有限会社」のように法人格そのものが異なる場合は別法人として区別したいため、
// 表記ゆれは吸収しつつも法人格の種類(key)自体は最後まで残す(=単純に全部消してしまわない)。
// 「事業協同組合」は「協同組合」の文字列を含むため、判定時は先に調べる(配列の順序に依存)。
var LEGAL_ENTITY_GROUPS_ = [
  { key: '株式会社', pattern: /(株式会社|\(株\)|㈱)/g },
  { key: '有限会社', pattern: /(有限会社|\(有\)|㈲)/g },
  { key: '合同会社', pattern: /(合同会社|\(同\)|㈾)/g },
  { key: '合名会社', pattern: /(合名会社|\(名\)|㈴)/g },
  { key: '合資会社', pattern: /(合資会社|\(資\)|㈵)/g },
  { key: '弁護士法人', pattern: /(弁護士法人|\(弁\))/g },
  { key: '税理士法人', pattern: /(税理士法人|\(税\))/g },
  { key: '司法書士法人', pattern: /(司法書士法人|\(司\))/g },
  { key: '行政書士法人', pattern: /(行政書士法人|\(行\))/g },
  { key: '社会保険労務士法人', pattern: /(社会保険労務士法人|\(労\))/g },
  { key: '医療法人', pattern: /(医療法人|\(医\))/g },
  { key: '学校法人', pattern: /(学校法人|\(学\))/g },
  { key: '宗教法人', pattern: /(宗教法人|\(宗\))/g },
  { key: '社会福祉法人', pattern: /(社会福祉法人|\(福\))/g },
  { key: '一般社団法人', pattern: /(一般社団法人|\(一社\))/g },
  { key: '一般財団法人', pattern: /(一般財団法人|\(一財\))/g },
  { key: '公益社団法人', pattern: /(公益社団法人|\(公社\))/g },
  { key: '公益財団法人', pattern: /(公益財団法人|\(公財\))/g },
  { key: '特定非営利活動法人', pattern: /(特定非営利活動法人|NPO法人|\(特非\))/gi },
  { key: '事業協同組合', pattern: /事業協同組合/g },
  { key: '協同組合', pattern: /(協同組合|\(協\))/g }
];

/**
 * 使用者名の表記ゆれを吸収して比較できるようにする(新車新規登録依頼書 発行システムと同じロジック)。
 * @param {string} name
 * @return {string}
 */
function normalizeCustomerName_(name) {
  var s = String(name || '');
  s = s.replace(/[！-～]/g, function (c) {
    return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
  });
  s = s.replace(/　/g, ' ').replace(/\s+/g, '');
  s = s.replace(/(様|殿)$/, '');

  var entityTag = '';
  for (var i = 0; i < LEGAL_ENTITY_GROUPS_.length; i++) {
    var group = LEGAL_ENTITY_GROUPS_[i];
    var found = false;
    var stripped = s.replace(group.pattern, function () {
      found = true;
      return '';
    });
    if (found) {
      s = stripped;
      entityTag = group.key;
      break; // 1つの名前に複数の法人格が付くことは通常ないため、最初に見つかったものだけ使う
    }
  }

  return entityTag + ':' + s.toLowerCase();
}

/**
 * 「名義変更」明細の備考欄(例:「田中太郎MB」)から、末尾のブランドコード(BrandService.gsで
 * 設定済みのもの)と使用者名を取り出す。末尾がどのブランドコードとも一致しない場合(通常の
 * メモ書き等)はnullを返す(呼び出し側は転記を試みず、エラーにもしない)。
 * 複数のブランドコードが末尾として一致しうる場合は、最も長く一致するものを優先する。
 * @param {string} remarks
 * @return {{name: string, brand: string}|null}
 */
function parseTransferRemarks_(remarks) {
  var text = String(remarks || '').trim();
  if (!text) return null;

  var matched = getBrandOptions_().filter(function (brand) {
    return brand && text.length > brand.length && text.slice(text.length - brand.length) === brand;
  });
  if (matched.length === 0) return null;

  matched.sort(function (a, b) { return b.length - a.length; });
  var brand = matched[0];
  var name = text.slice(0, text.length - brand.length).trim();
  if (!name) return null;

  return { name: name, brand: brand };
}

/**
 * 使用者名(=転記先の「顧客名」)をキーに該当行を探し、ステータス・登録日・区分(常に"紙登録")
 * を転記する。ブランドに対応する転記先が1件も設定されていない場合は何もしない(機能OFF)。
 * @param {string} userName 使用者名(顧客名)
 * @param {Date} regDate 登録日(タブの年月の特定にも使う)
 * @param {string} brand ブランド(転記先スプレッドシートの選択に使う)
 * @return {boolean|undefined} 実際に転記できた場合はtrue。機能OFF・使用者名未入力などで
 *   何もしなかった場合はundefined(成功メッセージの表示可否の判定に使う)。
 */
function syncRegistrationToExternalSheet_(userName, regDate, brand) {
  var sheets = getExternalSyncSheets_();
  if (sheets.length === 0) return; // 1件も設定されていない = 機能OFF

  var name = String(userName || '').trim();
  if (!name) return;
  var normalizedName = normalizeCustomerName_(name);
  if (!normalizedName) return; // 敬称のみ等、正規化すると空になる場合はマッチのしようがない

  var brandTrimmed = String(brand || '').trim();
  var match = sheets.filter(function (s) { return s.brand === brandTrimmed; })[0];
  if (!match) {
    throw new Error('ブランド「' + (brandTrimmed || '(未設定)') + '」の転記先スプレッドシートが設定されていません');
  }

  var ss = SpreadsheetApp.openById(match.sheetId);
  var tabName = externalSyncTabName_(regDate);
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    throw new Error('転記先に「' + tabName + '」タブが見つかりませんでした');
  }

  var lastRow = sheet.getLastRow();
  if (lastRow <= EXTERNAL_SYNC_HEADER_ROW) {
    throw new Error('転記先「' + tabName + '」にデータ行がありません');
  }

  var rowCount = lastRow - EXTERNAL_SYNC_HEADER_ROW;
  var names = sheet.getRange(EXTERNAL_SYNC_HEADER_ROW + 1, EXTERNAL_SYNC_COLUMNS.customerName, rowCount, 1).getValues();
  var statuses = sheet.getRange(EXTERNAL_SYNC_HEADER_ROW + 1, EXTERNAL_SYNC_COLUMNS.status, rowCount, 1).getValues();

  // 同じ名前の行が複数ある場合(同姓同名の再来店等)、まだ「登録予定日確定」になっていない
  // 行を優先して更新する。該当が無ければ、最初に見つかった行(既に確定済みでも)を使う。
  var matchedRow = -1;
  var fallbackRow = -1;
  for (var i = 0; i < names.length; i++) {
    if (normalizeCustomerName_(names[i][0]) !== normalizedName) continue;
    if (fallbackRow === -1) fallbackRow = EXTERNAL_SYNC_HEADER_ROW + 1 + i;
    if (String(statuses[i][0] || '').trim() !== EXTERNAL_SYNC_STATUS_CONFIRMED) {
      matchedRow = EXTERNAL_SYNC_HEADER_ROW + 1 + i;
      break;
    }
  }
  if (matchedRow === -1) matchedRow = fallbackRow;
  if (matchedRow === -1) {
    throw new Error('転記先「' + tabName + '」に使用者名「' + name + '」と一致する行が見つかりませんでした');
  }

  sheet.getRange(matchedRow, EXTERNAL_SYNC_COLUMNS.status).setValue(EXTERNAL_SYNC_STATUS_CONFIRMED);
  sheet.getRange(matchedRow, EXTERNAL_SYNC_COLUMNS.regDate).setValue(Utilities.formatDate(regDate, TIMEZONE, 'yyyy-MM-dd'));
  sheet.getRange(matchedRow, EXTERNAL_SYNC_COLUMNS.ossKind).setValue(EXTERNAL_SYNC_OSS_KIND_VALUE);
  return true; // 実際に転記できたことを呼び出し側(Api.gs)へ知らせる(成功メッセージの表示に使う)
}
