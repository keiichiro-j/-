/**
 * ExternalSyncService.gs
 * 他システム(外部の管理用スプレッドシート)の登録データへ、本アプリで申請した内容のうち
 * 「ステータス」「登録日」「申請方法(OSS/紙登録)」を転記する。
 *
 * 転記先スプレッドシートはブランド(BrandService.gs参照)ごとに異なるため、「設定」画面で
 * ブランドとスプレッドシートの組を最大 EXTERNAL_SYNC_MAX_SHEETS 件まで登録できるようにし、
 * 車両データの「ブランド」に応じて転記先を選ぶ。
 *
 * 転記先は各スプレッドシートの「新車」用のタブ(例: "db_登録データ_2026_10月")。同じ
 * スプレッドシートに中古車用のタブ("db_登録データ_中古_2026_10月")もあるが、本アプリ
 * (新車新規登録依頼書 発行システム)が扱うのは新車のみのため、"中古" が付かないタブだけを
 * 対象にする。タブは「登録日」の年月から自動で特定する(月ごとにタブが分かれているため)。
 *
 * 転記先シートの列構成(ユーザー提供の実物シートに合わせた固定レイアウト):
 *   A列: ステータス   B列: 登録予定日   F列: OSS区分   G列: 顧客名
 * (顧客名=本アプリの「使用者名」とマッチングするキー)。
 * 顧客名(G列)をキーに該当行を探し、見つかった行のA・B・F列だけを更新する
 * (行の新規作成は行わない。他システム側で事前に顧客の行が用意されている前提)。
 * 転記できた行の「ステータス」は "登録予定日確定" に上書きする。
 *
 * 顧客名の一致判定は完全一致ではなく normalizeCustomerName_() を通した表記ゆれ吸収比較を行う
 * (スペースの有無・全角/半角・法人格の表記ゆれ・末尾の敬称を無視する)。ただし文字自体が
 * 異なる別人(例: 「山田優」と「山田優作」)を誤って同一視することはない。
 * 同じ正規化後の名前が複数行ある場合は、まだ「登録予定日確定」になっていない行を優先して
 * 更新する(同姓同名の再来店等で過去の確定済み行を誤って上書きしにくくするため)。
 *
 * ブランドに対応する転記先が1件も設定されていない(=機能が完全にOFF)場合は何もしない。
 * ブランドは設定されているが、その車両のブランドに対応する転記先が無い・タブや該当行が
 * 見つからない場合はエラーを投げる(呼び出し側のApi.gsで1台ごとにcatchし、PDF発行・履歴
 * 記録という本アプリ側の主処理は失敗させずに警告としてまとめて返す)。
 */

var EXTERNAL_SYNC_SHEETS_PROP_KEY = 'externalSyncSheets';
var EXTERNAL_SYNC_MAX_SHEETS = 5;
var EXTERNAL_SYNC_TAB_PREFIX = 'db_登録データ_'; // 中古車用は "db_登録データ_中古_..." で本アプリの対象外
var EXTERNAL_SYNC_HEADER_ROW = 1;
var EXTERNAL_SYNC_STATUS_CONFIRMED = '登録予定日確定';
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
 * 登録日から、転記先タブ名("db_登録データ_2026_10月"の形式)を組み立てる。
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
 * 使用者名の表記ゆれを吸収して比較できるようにする。
 * - 全角英数記号(全角パーレンを含む)を半角に統一する
 * - 半角/全角スペースは、有無・数を問わず無視する(「山田太郎」「山田 太郎」「山田　太郎」を同一視)
 * - 法人格(株式会社・有限会社・弁護士法人 等、LEGAL_ENTITY_GROUPS_参照)は、正式名称・括弧書きの
 *   略称(「(株)」等)・丸囲み文字(㈱等)のどれで書かれていても同じ法人格として扱い、名前中の
 *   位置(前後どちらでも)を問わず取り出す。ただし「株式会社」と「有限会社」のように法人格の
 *   種類そのものが異なる場合は、引き続き別法人として区別する(法人格を消してしまうのではなく、
 *   種類ごとに区別できる形にそろえるだけ)
 * - 末尾の敬称(様・殿)は名前の一部ではないため無視する
 * - 英字の大文字・小文字を無視する
 * あくまで「同じ名前・同じ法人の表記ゆれ」を吸収するためのもので、「山田優」と「山田優作」の
 * ように文字そのものが異なる別人や、法人格の種類が異なる別法人を誤って同一視することはない。
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
 * 使用者名(=転記先の「顧客名」)をキーに該当行を探し、ステータス・登録日・申請方法(OSS/紙登録)
 * を転記する。ブランドに対応する転記先が1件も設定されていない場合は何もしない(機能OFF)。
 * @param {string} userName 使用者名(顧客名)
 * @param {Date} regDate 登録日(タブの年月の特定にも使う)
 * @param {string} typeLabel 転記する申請方法('OSS' または '紙登録')
 * @param {string} brand 車両のブランド(転記先スプレッドシートの選択に使う)
 * @return {boolean|undefined} 実際に転記できた場合はtrue。機能OFF・使用者名未入力などで
 *   何もしなかった場合はundefined(成功メッセージの表示可否の判定に使う)。
 */
function syncRegistrationToExternalSheet_(userName, regDate, typeLabel, brand) {
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
  sheet.getRange(matchedRow, EXTERNAL_SYNC_COLUMNS.ossKind).setValue(typeLabel);
  return true; // 実際に転記できたことを呼び出し側(Api.gs)へ知らせる(成功メッセージの表示に使う)
}
