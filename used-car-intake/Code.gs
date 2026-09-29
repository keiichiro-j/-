/**
 * Code.gs
 * YANASE 中古車管理表 整備（フェーズ1：シートの整備）
 *
 * AU・C7・MB の3社のスプレッドシートそれぞれに同じコードをコンテナバインドで入れ、
 * 設定アプリ（メニュー「★専用システム」→「設定アプリを開く」、または Web アプリの URL）で会社ごとに設定する。
 *
 * 方針
 *  - 入力はスプレッドシートへの直接入力。書式の統一と入力補助で使いやすくする
 *  - 入力した値は確定した瞬間に正しい書式へ整える（西暦日付・半角カナ・数値＋区切り・km）
 *  - プルダウンの選択肢はシートではなく設定アプリで管理する（スクリプトプロパティに保存）
 *  - 計算式の列（車検残・下取損・仕入価格）にはコードから書き込まない
 *  - 書類の自動読み取り（Gemini）は今後の展望とし、このコードには含めない
 *
 * 構成
 *   1. 定数・列定義
 *   2. 正規化・入力チェック（純粋関数：tests/run.js で単体テスト）
 *   3. メニュー・設定アプリ
 *   4. 設定（スクリプトプロパティ・プルダウンの選択肢）
 *   5. シート共通処理
 *   6. セットアップ（シート・書式・プルダウン・条件付き書式）
 *   7. 入力時の自動整形（onEdit）・OCN採番・販売済みへの移動
 *   8. 車検証リンク
 *   9. 既存データの一括整形・販売済みシートの列統一
 *  10. ログ
 */

// =====================================================================
// 1. 定数・列定義
// =====================================================================

var MENU_NAME = '★専用システム';
var APP_TITLE = '中古車管理表 設定アプリ';

var SHEET = {
  IMPORT_MASTER: '輸入車マスタ',
  DOMESTIC_MASTER: '国産車マスタ',
  SOLD: '販売済み',
  LOG: 'ログ',
  OLD_SETTINGS: '設定' // 以前の版の設定シート（選択肢をアプリへ移したあと削除する）
};
var MASTER_SHEETS = [SHEET.IMPORT_MASTER, SHEET.DOMESTIC_MASTER];
var VEHICLE_SHEETS = [SHEET.IMPORT_MASTER, SHEET.DOMESTIC_MASTER, SHEET.SOLD];

var STATUS_OPTIONS = ['書類待ち', '所有権解除済み', '車庫証明申請中', '名義変更中', '名義変更済み', '抹消登録済み', '販売済み'];
var CATEGORY_OPTIONS = ['買取', '仕入', '下取', 'オークション'];
var STATUS_SOLD = '販売済み';

/**
 * マスタ・販売済みの列定義（順序 = A〜AC列の標準配置）
 *  type : date | ocn | list | kana（半角カナ・半角英数）| address（英数字のみ半角）| chassis
 *         | mileage | money | plateClass | plateKana | plateNumber | link（自動）| formula（書き込まない）
 *  list : プルダウンの選択肢（設定アプリで管理する選択肢、または固定の選択肢）
 *  aliases : 既存シートの見出しの別表記（列の特定・販売済みシートの列統一に使う）
 */
var FIELDS = [
  { key: 'purchaseDate', label: '仕入年月日', type: 'date', aliases: ['仕入日', '仕入年月'] },
  { key: 'ocn', label: 'OCN', type: 'ocn' },
  { key: 'maker', label: '車種', type: 'list', list: 'maker', aliases: ['メーカー', '車名'] },
  { key: 'modelName', label: 'モデル名', type: 'kana', aliases: ['モデル', 'グレード'] },
  { key: 'chassisNumber', label: '車台番号', type: 'chassis', aliases: ['車体番号'] },
  { key: 'firstRegDate', label: '初度登録日', type: 'date', aliases: ['初度登録', '初年度登録', '初度登録年月'] },
  { key: 'inspectionExpiry', label: '車検満了日', type: 'date', aliases: ['車検満了', '車検有効期限'] },
  { key: 'inspectionRemain', label: '車検残', type: 'formula' },
  { key: 'mileage', label: '走行距離', type: 'mileage', aliases: ['走行'] },
  { key: 'color', label: '色', type: 'list', list: 'color', aliases: ['カラー', '車体色'] },
  { key: 'category', label: '区分', type: 'list', list: 'category', aliases: ['仕入区分'] },
  { key: 'staff', label: '担当', type: 'list', list: 'staff', aliases: ['担当者'] },
  { key: 'supplier', label: '仕入先', type: 'kana', aliases: ['仕入先（所有者）', '所有者', '所有者名'] },
  { key: 'address', label: '住所', type: 'address', aliases: ['仕入先住所', '所有者住所'] },
  { key: 'idCheck', label: '本人確認方法', type: 'list', list: 'idCheck', aliases: ['本人確認'] },
  { key: 'plateRegion', label: '登録番号（地域）', type: 'list', list: 'region', aliases: ['地域', '登録番号地域名'] },
  { key: 'plateClass', label: '登録番号（分類番号）', type: 'plateClass', aliases: ['分類番号', '登録番号（分類）'] },
  { key: 'plateKana', label: '登録番号（ひらがな）', type: 'plateKana', aliases: ['ひらがな', '登録番号（かな）'] },
  { key: 'plateNumber', label: '登録番号（一連番号）', type: 'plateNumber', aliases: ['一連番号', '登録番号（番号）'] },
  { key: 'status', label: 'ステータス', type: 'list', list: 'status' },
  { key: 'saleDate', label: '売上日', type: 'date', aliases: ['販売日', '売上年月日'] },
  { key: 'saleTo', label: '売上先', type: 'kana', aliases: ['販売先'] },
  { key: 'certLink', label: '車検証', type: 'link', aliases: ['車検証リンク'] },
  { key: 'tradeInAllowance', label: '下取充当額', type: 'money', aliases: ['充当額', '下取充当'] },
  { key: 'recycleFee', label: 'リサイクル', type: 'money', aliases: ['リサイクル金額', 'リサイクル料', 'リサイクル預託金'] },
  { key: 'tradeInPrice', label: '下取価格', type: 'money', aliases: ['下取額'] },
  { key: 'appraisalPrice', label: '査定価格', type: 'money', aliases: ['査定額', '査定金額'] },
  { key: 'tradeInLoss', label: '下取損', type: 'formula' },
  { key: 'purchasePrice', label: '仕入価格（買取金額）', type: 'formula', aliases: ['仕入価格', '買取金額', '仕入金額'] }
];

var FIELD_BY_KEY = (function () {
  var map = {};
  FIELDS.forEach(function (f) { map[f.key] = f; });
  return map;
})();
var STANDARD_HEADERS = FIELDS.map(function (f) { return f.label; });

/**
 * 列の表示形式。日付は西暦（和暦の表示形式が残っていても上書きする）、
 * 走行距離は「12,345km」、金額は「1,234,000」と表示する（値は日付型・数値のまま）。
 */
var DATE_FORMAT = 'yyyy/MM/dd';
var MILEAGE_FORMAT = '#,##0"km"';
var MONEY_FORMAT = '#,##0';
var NUMBER_FORMATS = {
  date: DATE_FORMAT,
  ocn: '0',
  mileage: MILEAGE_FORMAT,
  money: MONEY_FORMAT,
  chassis: '@',
  plateClass: '@',
  plateNumber: '@'
};
/** 計算式の列の表示形式（式の結果が数値のとき） */
var FORMULA_FORMATS = { inspectionRemain: '0"ヶ月"', tradeInLoss: MONEY_FORMAT, purchasePrice: MONEY_FORMAT };

/**
 * 計算式の列の定義。見出し行に ARRAYFORMULA を1つ置く方式で使う（既存の式・値がある列は切り替えない）。
 * {キー} は該当列の「2行目以降の範囲」（例：G2:G）に置き換わる。
 * null は式が未確定のため設定しない。
 */
var FORMULA_DEFS = {
  inspectionRemain: 'IF({inspectionExpiry}="",,IF({inspectionExpiry}<TODAY(),0,DATEDIF(TODAY(),{inspectionExpiry},"M")))',
  tradeInLoss: 'IF(({tradeInAllowance}="")+({tradeInPrice}=""),,{tradeInAllowance}-{tradeInPrice})',
  purchasePrice: null
};

/** 設定アプリで管理するプルダウンの選択肢 */
var LIST_DEFS = [
  { list: 'maker', label: 'メーカー', aliases: true },
  { list: 'color', label: '色', aliases: true },
  { list: 'staff', label: '担当者' },
  { list: 'idCheck', label: '本人確認方法' },
  { list: 'region', label: '地域名' }
];

/** 自動車登録番号標の地域名（選択肢の初期値） */
var PLATE_REGIONS = [
  '札幌', '函館', '旭川', '室蘭', '苫小牧', '釧路', '知床', '帯広', '北見',
  '青森', '八戸', '弘前', '岩手', '盛岡', '平泉', '宮城', '仙台', '秋田', '山形', '庄内',
  '福島', '会津', '郡山', '白河', 'いわき',
  '水戸', '土浦', 'つくば', '宇都宮', '那須', 'とちぎ', '群馬', '前橋', '高崎',
  '大宮', '川口', '所沢', '川越', '熊谷', '春日部', '越谷',
  '千葉', '成田', '習志野', '市川', '船橋', '袖ケ浦', '市原', '野田', '柏', '松戸',
  '品川', '世田谷', '練馬', '杉並', '板橋', '足立', '江東', '葛飾', '八王子', '多摩', '府中', '日野',
  '横浜', '川崎', '相模', '湘南', '山梨', '富士山',
  '新潟', '長岡', '上越', '富山', '石川', '金沢', '福井', '長野', '松本', '諏訪',
  '岐阜', '飛騨', '静岡', '浜松', '沼津', '伊豆',
  '名古屋', '豊橋', '三河', '岡崎', '豊田', '尾張小牧', '一宮', '春日井',
  '三重', '鈴鹿', '四日市', '伊勢志摩', '伊賀',
  '滋賀', '京都', '大阪', 'なにわ', '和泉', '堺', '奈良', '飛鳥', '和歌山', '神戸', '姫路',
  '鳥取', '島根', '出雲', '岡山', '倉敷', '広島', '福山', '山口', '下関',
  '徳島', '香川', '高松', '愛媛', '高知',
  '福岡', '北九州', '久留米', '筑豊', '佐賀', '長崎', '佐世保', '熊本', '大分', '宮崎', '鹿児島', '奄美', '沖縄'
];

/** 選択肢の初期値（案。カタカナは保存時に半角カナへ変換） */
var DEFAULT_LISTS = {
  maker: [
    ['MB', 'メルセデス,ベンツ,MERCEDES,BENZ,AMG'], ['VW', 'フォルクスワーゲン,VOLKSWAGEN,ワーゲン'], ['BMW', 'ビーエムダブリュー'],
    ['MINI', 'ミニ'], ['ポルシェ', 'PORSCHE'], ['アウディ', 'AUDI'], ['ボルボ', 'VOLVO'], ['ジープ', 'JEEP'],
    ['プジョー', 'PEUGEOT'], ['ルノー', 'RENAULT'], ['フィアット', 'FIAT'], ['アルファロメオ', 'ALFA ROMEO'],
    ['ランドローバー', 'LAND ROVER,レンジローバー,RANGE ROVER'], ['ジャガー', 'JAGUAR'], ['フェラーリ', 'FERRARI'],
    ['ランボルギーニ', 'LAMBORGHINI'], ['マセラティ', 'MASERATI'], ['ベントレー', 'BENTLEY'], ['ロールスロイス', 'ROLLS ROYCE,ROLLS-ROYCE'],
    ['アストンマーチン', 'ASTON MARTIN'], ['マクラーレン', 'MCLAREN'], ['テスラ', 'TESLA'], ['キャデラック', 'CADILLAC'],
    ['シボレー', 'CHEVROLET'], ['トヨタ', 'TOYOTA'], ['レクサス', 'LEXUS'], ['ニッサン', 'NISSAN,日産'], ['ホンダ', 'HONDA,本田'],
    ['マツダ', 'MAZDA'], ['スバル', 'SUBARU'], ['スズキ', 'SUZUKI'], ['ダイハツ', 'DAIHATSU'], ['ミツビシ', 'MITSUBISHI,三菱'],
    ['その他', '']
  ],
  color: [
    ['黒', 'ブラック,BLACK,オブシディアン'], ['白', 'ホワイト,WHITE,パール'], ['灰', 'グレー,グレイ,GRAY,GREY,シルバー,SILVER,ガンメタ'],
    ['赤', 'レッド,RED'], ['紺', 'ネイビー,NAVY,ダークブルー'], ['青', 'ブルー,BLUE'], ['緑', 'グリーン,GREEN'],
    ['黄', 'イエロー,YELLOW'], ['茶', 'ブラウン,BROWN,ベージュ'], ['その他', '']
  ],
  staff: [],
  idCheck: [['運転免許証'], ['マイナンバーカード'], ['パスポート'], ['在留カード'], ['健康保険証'], ['登記事項証明書'], ['その他']],
  region: PLATE_REGIONS.map(function (r) { return [r]; })
};

var LOG_HEADERS = ['日時', '区分', '対象', '項目', '変更前', '変更後', '内容', '実行者'];
var CF_MARKER = 'N("ucs")=0'; // このシステムが設定した条件付き書式の目印（常に真）

// =====================================================================
// 2. 正規化・入力チェック（純粋関数）
// =====================================================================

function isBlank(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/** 全角英数記号 → 半角、全角空白 → 半角、各種ダッシュ → 「-」（長音「ー」はそのまま） */
function toHalfWidthAlnum(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/　/g, ' ')
    .replace(/[‐‑‒–—―−]/g, '-');
}

var KANA_FULL = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンァィゥェォッャュョヮヰヱヵヶ・ー「」、。゛゜';
var KANA_HALF = ['ｱ', 'ｲ', 'ｳ', 'ｴ', 'ｵ', 'ｶ', 'ｷ', 'ｸ', 'ｹ', 'ｺ', 'ｻ', 'ｼ', 'ｽ', 'ｾ', 'ｿ', 'ﾀ', 'ﾁ', 'ﾂ', 'ﾃ', 'ﾄ',
  'ﾅ', 'ﾆ', 'ﾇ', 'ﾈ', 'ﾉ', 'ﾊ', 'ﾋ', 'ﾌ', 'ﾍ', 'ﾎ', 'ﾏ', 'ﾐ', 'ﾑ', 'ﾒ', 'ﾓ', 'ﾔ', 'ﾕ', 'ﾖ', 'ﾗ', 'ﾘ', 'ﾙ', 'ﾚ', 'ﾛ',
  'ﾜ', 'ｦ', 'ﾝ', 'ｧ', 'ｨ', 'ｩ', 'ｪ', 'ｫ', 'ｯ', 'ｬ', 'ｭ', 'ｮ', 'ﾜ', 'ｲ', 'ｴ', 'ｶ', 'ｹ', '･', 'ｰ', '｢', '｣', '､', '｡', 'ﾞ', 'ﾟ'];
var KANA_TO_HALF = (function () {
  var map = {};
  for (var i = 0; i < KANA_FULL.length; i++) map[KANA_FULL.charAt(i)] = KANA_HALF[i];
  return map;
})();
var KANA_TO_FULL = (function () {
  var map = {};
  // 逆引きは代表の1文字だけ（ﾜ→ワ、ｲ→イ など）
  for (var i = KANA_FULL.length - 1; i >= 0; i--) map[KANA_HALF[i]] = KANA_FULL.charAt(i);
  return map;
})();

/** 全角カタカナ → 半角カナ（濁点・半濁点は分解）。ひらがな・漢字はそのまま */
function toHalfKana(s) {
  if (s === null || s === undefined) return '';
  var out = '';
  var str = String(s);
  for (var i = 0; i < str.length; i++) {
    var c = str.charAt(i);
    if (KANA_TO_HALF[c]) { out += KANA_TO_HALF[c]; continue; }
    if (c >= 'ァ' && c <= 'ヺ') {
      var d = c.normalize('NFD');
      if (d.length === 2 && KANA_TO_HALF[d.charAt(0)]) {
        out += KANA_TO_HALF[d.charAt(0)] + (d.charAt(1) === '゙' ? 'ﾞ' : 'ﾟ');
        continue;
      }
    }
    out += c;
  }
  return out;
}

/** 半角カナ → 全角カタカナ（濁点・半濁点は合成） */
function toFullKatakana(s) {
  var out = '';
  var str = String(s || '');
  for (var i = 0; i < str.length; i++) {
    var c = str.charAt(i);
    var next = str.charAt(i + 1);
    if (KANA_TO_FULL[c] && c !== 'ﾞ' && c !== 'ﾟ') {
      var full = KANA_TO_FULL[c];
      if (next === 'ﾞ' || next === 'ﾟ') {
        var composed = (full + (next === 'ﾞ' ? '゙' : '゚')).normalize('NFC');
        if (composed.length === 1) { out += composed; i++; continue; }
      }
      out += full;
    } else {
      out += c;
    }
  }
  return out;
}

function katakanaToHiragana(s) {
  return String(s).replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); });
}

/** 数字にはさまれた長音・ダッシュは「-」（住所・番地の「1ー2ー3」など） */
function digitDashes(s) {
  return String(s).replace(/(\d)\s*[ーｰ－-]\s*(?=\d)/g, '$1-');
}

/** 半角カナ・半角英数に揃え、前後の空白を除く（モデル名・仕入先・売上先・選択肢） */
function normalizeKanaText(v) {
  var s = digitDashes(toHalfWidthAlnum(v));
  return toHalfKana(s).replace(/ {2,}/g, ' ').trim();
}

/** 英数字だけ半角にする（住所） */
function normalizeAddress(v) {
  return digitDashes(toHalfWidthAlnum(v)).replace(/ {2,}/g, ' ').trim();
}

/** 車台番号：大文字化・半角化・空白除去。ハイフンは残す（国産車の形式） */
function normalizeChassisInput(v) {
  return toHalfWidthAlnum(v).toUpperCase().replace(/\s+/g, '').replace(/[ーｰ]/g, '-');
}

function normalizePlateClass(v) {
  return toHalfWidthAlnum(v).toUpperCase().replace(/\s+/g, '');
}

function normalizePlateKana(v) {
  return katakanaToHiragana(toFullKatakana(toHalfWidthAlnum(v).replace(/\s+/g, '')));
}

function normalizePlateNumber(v) {
  return toHalfWidthAlnum(v).replace(/[\s・･.\-ーｰ]/g, '');
}

var ERA_BASE = { '令和': 2018, 'R': 2018, '平成': 1988, 'H': 1988, '昭和': 1925, 'S': 1925 };

/**
 * 和暦・西暦の日付文字列を日付にする（R5.6.1、令和5年6月1日、2023/6/1、20230601 など）。
 * 年月のみの表記は1日とする。解釈できなければ null。
 */
function parseJapaneseDate(raw) {
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
  if (isBlank(raw)) return null;
  var s = toHalfWidthAlnum(raw).toUpperCase().replace(/\s+/g, '');
  var y, mo, d, m;
  m = s.match(/^(令和|平成|昭和|R|H|S)(元|\d{1,2})[年.\/\-](\d{1,2})月?(?:[.\/\-]?(\d{1,2})日?)?$/);
  if (m) {
    y = ERA_BASE[m[1]] + (m[2] === '元' ? 1 : Number(m[2]));
    mo = Number(m[3]); d = m[4] ? Number(m[4]) : 1;
  } else if ((m = s.match(/^(\d{4})[年.\/\-](\d{1,2})月?(?:[.\/\-]?(\d{1,2})日?)?$/))) {
    y = Number(m[1]); mo = Number(m[2]); d = m[3] ? Number(m[3]) : 1;
  } else if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) {
    y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]);
  } else {
    return null;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  var date = new Date(y, mo - 1, d);
  return date.getMonth() === mo - 1 ? date : null;
}

/** 金額の解釈（「1,234,000円」「123万円」「12.5万」等）。解釈できなければ null */
function parseAmount(raw) {
  if (typeof raw === 'number') return raw;
  if (isBlank(raw)) return null;
  var s = toHalfWidthAlnum(raw).replace(/[\s,，¥￥円]|税込|税抜/g, '');
  var m = s.match(/^(-?\d+(?:\.\d+)?)万(\d{0,4})$/);
  if (m) return Math.round(Number(m[1]) * 10000) + (m[2] ? Number(m[2]) : 0);
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return null;
}

/** 走行距離の解釈（「12,345km」「1.2万km」等） */
function parseMileage(raw) {
  if (typeof raw === 'number') return raw;
  if (isBlank(raw)) return null;
  return parseAmount(toHalfWidthAlnum(raw).replace(/km|KM|Km|ｋｍ|キロ|ｷﾛ/g, ''));
}

/** 選択肢の照合キー（半角・大文字・空白と中点を除く） */
function listKey(s) {
  return toHalfKana(toHalfWidthAlnum(s)).toUpperCase().replace(/[\s･・\-]/g, '');
}

/**
 * 値を選択肢に当てはめる。完全一致 → 別名の一致 → 別名・選択肢名を含む（最長一致）の順。
 * @param {Array<{value:string, aliases:Array<string>}>} entries
 * @param {boolean} allowContains 部分一致を使うか（メーカー・色）
 * @return {string|null}
 */
function matchListValue(value, entries, allowContains) {
  var k = listKey(value);
  if (!k) return null;
  var i, j;
  for (i = 0; i < entries.length; i++) if (listKey(entries[i].value) === k) return entries[i].value;
  for (i = 0; i < entries.length; i++) {
    for (j = 0; j < (entries[i].aliases || []).length; j++) {
      if (listKey(entries[i].aliases[j]) === k) return entries[i].value;
    }
  }
  if (!allowContains) return null;
  var best = null, bestLen = 0;
  entries.forEach(function (e) {
    if (e.value === 'その他') return;
    [e.value].concat(e.aliases || []).forEach(function (a) {
      var ak = listKey(a);
      if (ak.length >= 2 && ak.length > bestLen && k.indexOf(ak) !== -1) { best = e.value; bestLen = ak.length; }
    });
  });
  return best;
}

function levenshtein(a, b) {
  a = String(a); b = String(b);
  var prev = [];
  for (var j = 0; j <= b.length; j++) prev[j] = j;
  for (var i = 1; i <= a.length; i++) {
    var cur = [i];
    for (var k = 1; k <= b.length; k++) {
      cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + (a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** プルダウン外の値の置き換え候補（一致しなければ、よく似た選択肢。無ければ空） */
function suggestListValue(value, entries, allowContains) {
  var hit = matchListValue(value, entries, allowContains);
  if (hit) return hit;
  var k = listKey(value), best = '', bestDist = 3;
  entries.forEach(function (e) {
    var d = levenshtein(k, listKey(e.value));
    if (d < bestDist && d < Math.max(2, Math.ceil(k.length / 2))) { best = e.value; bestDist = d; }
  });
  return best;
}

/** メーカー・色は部分一致で変換してよい項目（例：「ﾒﾙｾﾃﾞｽ･ﾍﾞﾝﾂ」→ MB、「ﾎﾟｰﾗｰﾎﾜｲﾄ」→ 白） */
function listAllowsContains(listName) {
  return listName === 'maker' || listName === 'color';
}

function sameCellValue(a, b) {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

/**
 * 1セル分の自動整形（入力時・一括整形で共通）
 * @param {{key:string,type:string,list?:string}} field
 * @param {*} value セルの値
 * @param {Object} lists 選択肢（readLists_ の戻り値）
 * @return {{value:*, changed:boolean, error?:string, outOfList?:boolean}}
 */
function normalizeCellValue(field, value, lists) {
  if (isBlank(value)) return { value: value, changed: false };
  var out = value, error = null, outOfList = false;
  switch (field.type) {
    case 'date':
      if (value instanceof Date) break;
      var d = parseJapaneseDate(typeof value === 'number' ? String(value) : value);
      if (d) out = d; else error = '日付として読めません';
      break;
    case 'mileage':
    case 'money':
      if (typeof value === 'number') break;
      var n = field.type === 'mileage' ? parseMileage(value) : parseAmount(value);
      if (n === null) error = '数値として読めません'; else out = n;
      break;
    case 'ocn':
      if (typeof value === 'number') break;
      var o = toHalfWidthAlnum(value).trim();
      if (/^\d+$/.test(o)) out = Number(o); else error = 'OCNが数値ではありません';
      break;
    case 'chassis':
      out = normalizeChassisInput(value);
      break;
    case 'kana':
      out = normalizeKanaText(value);
      break;
    case 'address':
      out = normalizeAddress(value);
      break;
    case 'plateClass':
      out = normalizePlateClass(value);
      break;
    case 'plateKana':
      out = normalizePlateKana(value);
      break;
    case 'plateNumber':
      out = normalizePlateNumber(value);
      break;
    case 'list':
      var text = normalizeKanaText(value);
      var entries = (lists && lists[field.list]) || [];
      var hit = matchListValue(text, entries, listAllowsContains(field.list));
      if (hit) out = hit;
      else { out = text; outOfList = entries.length > 0; }
      break;
    default:
      return { value: value, changed: false }; // link・formula は触らない
  }
  var res = { value: out, changed: !sameCellValue(value, out) };
  if (error) res.error = error;
  if (outOfList) res.outOfList = true;
  return res;
}

/** 列の表示形式（無ければ null） */
function numberFormatFor(field) {
  if (field.type === 'formula') return FORMULA_FORMATS[field.key] || null;
  return NUMBER_FORMATS[field.type] || null;
}

// ----- OCN -----

function parseOcnNumber(ocn) {
  if (typeof ocn === 'number') return Math.floor(ocn);
  if (isBlank(ocn)) return null;
  var s = toHalfWidthAlnum(ocn).trim();
  return /^\d+$/.test(s) ? Number(s) : null;
}

/** 既存OCN（3シート）と発行済み最大値から次のOCNを決める（「NEW-乱数」等は無視） */
function nextOcnNumber(existingOcns, lastIssued) {
  var max = Number(lastIssued) || 0;
  existingOcns.forEach(function (o) {
    var n = parseOcnNumber(o);
    if (n !== null && n > max) max = n;
  });
  return max + 1;
}

/** 車検証ファイル名から OCN を取り出す（「12345.pdf」「12345_xxx.pdf」など） */
function ocnFromFileName(name) {
  var m = String(name).match(/^(\d+)(?:[_\-\s.(（]|$)/);
  return m ? Number(m[1]) : null;
}

// ----- 列 -----

function normalizeHeader(label) {
  return toHalfKana(toHalfWidthAlnum(label)).replace(/[\s()（）［］\[\]・･]/g, '');
}

/**
 * 見出し行から各項目の列位置を特定する（見出し名 → 別表記の順）。
 * @return {{map:Object, missing:Array<string>, unknown:Array<{index:number,label:string}>}}
 */
function resolveColumns(headers) {
  var normalized = headers.map(normalizeHeader);
  var map = {}, used = {};
  FIELDS.forEach(function (f) {
    var idx = normalized.indexOf(normalizeHeader(f.label));
    if (idx !== -1 && !used[idx]) { map[f.key] = idx; used[idx] = true; }
  });
  FIELDS.forEach(function (f) {
    if (map[f.key] !== undefined || !f.aliases) return;
    for (var i = 0; i < f.aliases.length; i++) {
      var idx = normalized.indexOf(normalizeHeader(f.aliases[i]));
      if (idx !== -1 && !used[idx]) { map[f.key] = idx; used[idx] = true; return; }
    }
  });
  var missing = FIELDS.filter(function (f) { return map[f.key] === undefined; }).map(function (f) { return f.key; });
  var unknown = [];
  headers.forEach(function (h, i) { if (!used[i] && !isBlank(h)) unknown.push({ index: i, label: String(h) }); });
  return { map: map, missing: missing, unknown: unknown };
}

function isStandardLayout(headers) {
  var res = resolveColumns(headers);
  return FIELDS.every(function (f, i) { return res.map[f.key] === i; });
}

/** 1始まりの列番号 → 列記号（1→A, 29→AC） */
function columnLetter(n) {
  var s = '';
  while (n > 0) {
    var r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** 見出し行に置く ARRAYFORMULA。参照先の列が無い・式が未確定なら null */
function buildArrayFormula(key, colMap) {
  var def = FORMULA_DEFS[key];
  if (!def) return null;
  var ok = true;
  var expr = def.replace(/\{(\w+)\}/g, function (_, ref) {
    if (colMap[ref] === undefined) { ok = false; return ''; }
    var letter = columnLetter(colMap[ref] + 1);
    return letter + '2:' + letter;
  });
  return ok ? '={"' + FIELD_BY_KEY[key].label.replace(/"/g, '""') + '";ARRAYFORMULA(' + expr + ')}' : null;
}

/**
 * 入力チェック用の条件付き書式を組み立てる。重複チェックは3シート横断（INDIRECT で他シートを参照）。
 * @param {string} sheetName 対象シート
 * @param {Object} colMaps シート名 → 列マップ（存在するシートのみ）
 * @param {number} expiryDays 車検満了が近いとみなす日数（0で無効）
 * @return {Array<{columns?:Array<string>, wholeRow?:boolean, formula:string, color:string, note:string}>}
 */
function buildCheckRules(sheetName, colMaps, expiryDays) {
  var own = colMaps[sheetName];
  var L = function (key) { return own[key] === undefined ? null : columnLetter(own[key] + 1); };
  var names = Object.keys(colMaps);
  var rules = [];
  function indirect(name, key) {
    var c = colMaps[name][key];
    if (c === undefined) return null;
    var letter = columnLetter(c + 1);
    return 'INDIRECT("\'' + name + '\'!' + letter + '2:' + letter + '")';
  }

  var E = L('chassisNumber');
  if (E) {
    var counts = names.map(function (n) { var r = indirect(n, 'chassisNumber'); return r ? 'COUNTIF(' + r + ',$' + E + '2)' : null; })
      .filter(function (x) { return x; });
    rules.push({ columns: [E], color: '#f4c7c3', note: '車台番号の重複（3シート横断）',
      formula: '=AND(' + CF_MARKER + ',$' + E + '2<>"",(' + counts.join('+') + ')>1)' });
    rules.push({ columns: [E], color: '#fce8b2', note: '車台番号の形式違い',
      formula: '=AND(' + CF_MARKER + ',$' + E + '2<>"",NOT(REGEXMATCH(TO_TEXT($' + E + '2),"^([A-HJ-NPR-Z0-9]{17}|[A-Z0-9]+-[0-9]{4,8})$")))' });
  }

  var P = L('plateRegion'), Q = L('plateClass'), R = L('plateKana'), S = L('plateNumber');
  if (P && Q && R && S) {
    var plateCounts = names.map(function (n) {
      var parts = ['plateRegion', 'plateClass', 'plateKana', 'plateNumber'].map(function (k) { return indirect(n, k); });
      if (parts.some(function (p) { return !p; })) return null;
      return 'COUNTIFS(' + parts[0] + ',$' + P + '2,' + parts[1] + ',$' + Q + '2,' + parts[2] + ',$' + R + '2,' + parts[3] + ',$' + S + '2)';
    }).filter(function (x) { return x; });
    rules.push({ columns: [P, Q, R, S], color: '#f4c7c3', note: '登録番号4項目の重複',
      formula: '=AND(' + CF_MARKER + ',$' + P + '2<>"",$' + S + '2<>"",(' + plateCounts.join('+') + ')>1)' });
  }
  if (Q) rules.push({ columns: [Q], color: '#fce8b2', note: '分類番号の形式違い',
    formula: '=AND(' + CF_MARKER + ',$' + Q + '2<>"",NOT(REGEXMATCH(TO_TEXT($' + Q + '2),"^[0-9][0-9A-Z]{0,2}$")))' });
  if (S) rules.push({ columns: [S], color: '#fce8b2', note: '一連番号の形式違い',
    formula: '=AND(' + CF_MARKER + ',$' + S + '2<>"",NOT(REGEXMATCH(TO_TEXT($' + S + '2),"^[0-9]{1,4}$")))' });

  var F = L('firstRegDate'), G = L('inspectionExpiry');
  if (F) rules.push({ columns: [F], color: '#fce8b2', note: '初度登録日が未来',
    formula: '=AND(' + CF_MARKER + ',ISNUMBER($' + F + '2),$' + F + '2>TODAY())' });
  if (F && G) rules.push({ columns: [G], color: '#fce8b2', note: '車検満了日が初度登録日以前',
    formula: '=AND(' + CF_MARKER + ',ISNUMBER($' + F + '2),ISNUMBER($' + G + '2),$' + G + '2<=$' + F + '2)' });
  if (G && MASTER_SHEETS.indexOf(sheetName) !== -1 && expiryDays > 0) {
    rules.push({ wholeRow: true, color: '#efe3f7', note: '車検満了が近い車両',
      formula: '=AND(' + CF_MARKER + ',ISNUMBER($' + G + '2),$' + G + '2>=TODAY(),$' + G + '2<=TODAY()+' + Number(expiryDays) + ')' });
  }
  return rules;
}

/** 選択肢の編集テキスト（1行1つ、「値: 別名,別名」）を解釈する */
function parseListText(text, withAliases) {
  var seen = {};
  return String(text || '').split(/\r?\n/).map(function (line) {
    var at = withAliases ? line.search(/[:：]/) : -1;
    var head = at === -1 ? line : line.substring(0, at);
    return { value: normalizeKanaText(head), aliases: at === -1 ? [] : splitAliases(line.substring(at + 1)) };
  }).filter(function (e) {
    if (!e.value || seen[e.value]) return false;
    seen[e.value] = true;
    return true;
  });
}

function splitAliases(text) {
  return String(text || '').split(/[,、，]/).map(function (a) { return a.trim(); }).filter(function (a) { return a; });
}

// =====================================================================
// 3. メニュー・設定アプリ
// =====================================================================

function onOpen() {
  SpreadsheetApp.getUi().createMenu(MENU_NAME)
    .addItem('設定アプリを開く', 'showApp')
    .addSeparator()
    .addItem('書式・プルダウン・入力チェックを整え直す', 'reapplyStandardsFromMenu')
    .addItem('ステータスが販売済みの行を販売済みシートへ移動', 'moveSoldRowsFromMenu')
    .addItem('車検証リンクを更新', 'updateCertLinksFromMenu')
    .addToUi();
}

/** 設定アプリ（スプレッドシート上のダイアログ） */
function showApp() {
  var html = HtmlService.createTemplateFromFile('App');
  html.mode = 'dialog';
  SpreadsheetApp.getUi().showModelessDialog(html.evaluate().setWidth(1000).setHeight(760), APP_TITLE);
}

/** 設定アプリ（Web アプリとして公開した場合の入口） */
function doGet() {
  var html = HtmlService.createTemplateFromFile('App');
  html.mode = 'web';
  return html.evaluate().setTitle(APP_TITLE).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function reapplyStandardsFromMenu() {
  var report = reapplyStandards();
  SpreadsheetApp.getUi().alert('書式・プルダウン・入力チェック', report.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

function updateCertLinksFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var res = updateCertLinks();
  ui.alert('車検証リンクを更新', res.message, ui.ButtonSet.OK);
}

function moveSoldRowsFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var ss = getSpreadsheet_();
  var targets = findSoldRows_(ss);
  var total = targets.reduce(function (s, t) { return s + t.rows.length; }, 0);
  if (!total) { ui.alert('ステータスが「販売済み」の行はありません。'); return; }
  if (ui.alert('販売済みシートへ移動', total + '行を販売済みシートへ移動します。よろしいですか？', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  targets.forEach(function (t) { moveRowsToSold_(ss, ss.getSheetByName(t.name), t.rows); });
  ui.alert(total + '行を販売済みシートへ移動しました。');
}

function findSoldRows_(ss) {
  var targets = [];
  MASTER_SHEETS.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;
    var cols = getColumns_(sheet).map;
    if (cols.status === undefined) return;
    var rows = [];
    sheet.getRange(2, cols.status + 1, sheet.getLastRow() - 1, 1).getValues()
      .forEach(function (r, i) { if (r[0] === STATUS_SOLD) rows.push(i + 2); });
    if (rows.length) targets.push({ name: name, rows: rows });
  });
  return targets;
}

// =====================================================================
// 4. 設定（スクリプトプロパティ・プルダウンの選択肢）
// =====================================================================

var PROP = {
  COMPANY: 'COMPANY_NAME',
  EXPIRY_DAYS: 'EXPIRY_WARNING_DAYS',
  FOLDER_CERT: 'FOLDER_CERT',
  CERT_LINK_HOURLY: 'CERT_LINK_HOURLY',
  OCN_LAST: 'OCN_LAST_ISSUED',
  LIST: 'LIST_' // + maker / color / staff / idCheck / region
};

function getSettings_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  return {
    company: props[PROP.COMPANY] || '',
    expiryDays: props[PROP.EXPIRY_DAYS] === undefined ? 30 : Math.max(0, Number(props[PROP.EXPIRY_DAYS]) || 0),
    folderCert: props[PROP.FOLDER_CERT] || '',
    certLinkHourly: props[PROP.CERT_LINK_HOURLY] === 'true'
  };
}

/** 既定の選択肢（半角カナに変換済み） */
function defaultListEntries(listName) {
  return (DEFAULT_LISTS[listName] || []).map(function (e) {
    return { value: normalizeKanaText(e[0]), aliases: splitAliases(e[1]) };
  });
}

/**
 * プルダウンの選択肢を読む（設定アプリで保存したもの。未保存なら既定の選択肢）。
 * @return {Object} list名 → [{value, aliases}]（区分・ステータスは固定の選択肢）
 */
function readLists_() {
  var props = PropertiesService.getScriptProperties();
  var lists = {
    category: CATEGORY_OPTIONS.map(function (v) { return { value: v, aliases: [] }; }),
    status: STATUS_OPTIONS.map(function (v) { return { value: v, aliases: [] }; })
  };
  LIST_DEFS.forEach(function (d) {
    var json = props.getProperty(PROP.LIST + d.list);
    var entries = null;
    if (json) { try { entries = JSON.parse(json); } catch (e) { entries = null; } }
    lists[d.list] = entries || defaultListEntries(d.list);
  });
  return lists;
}

function writeList_(listName, entries) {
  var compact = entries.map(function (e) { return e.aliases && e.aliases.length ? { value: e.value, aliases: e.aliases } : { value: e.value }; });
  PropertiesService.getScriptProperties().setProperty(PROP.LIST + listName, JSON.stringify(compact));
}

/** 設定アプリ：現在の選択肢を「値: 別名,別名」の行テキストで返す */
function getListsForEdit() {
  var lists = readLists_();
  var out = {};
  LIST_DEFS.forEach(function (d) {
    out[d.list] = lists[d.list].map(function (e) {
      return d.aliases && e.aliases && e.aliases.length ? e.value + ': ' + e.aliases.join(',') : e.value;
    }).join('\n');
  });
  return { lists: out, defs: LIST_DEFS };
}

/** 設定アプリ：選択肢を保存し、3シートのプルダウンに反映する */
function saveLists(input) {
  var counts = [];
  LIST_DEFS.forEach(function (d) {
    var entries = parseListText(input[d.list], !!d.aliases);
    if (entries.length > 500) throw new Error(d.label + 'の選択肢は500件までです');
    writeList_(d.list, entries);
    counts.push(d.label + ' ' + entries.length + '件');
  });
  var ss = getSpreadsheet_();
  VEHICLE_SHEETS.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (sheet) applyValidations_(sheet, getColumns_(sheet).map);
  });
  appendLog_('設定', '選択肢', '', '', '', counts.join('、'));
  return { ok: true, message: '保存し、プルダウンに反映しました（' + counts.join('、') + '）' };
}

/**
 * 以前の版の「設定」シートがあれば、その選択肢を設定アプリ（スクリプトプロパティ）へ移してシートを削除する。
 * （選択肢だけのシートで、車両データは含まない。セットアップ時のバックアップにも残る）
 */
function migrateOldSettingsSheet_(ss, report) {
  var sheet = ss.getSheetByName(SHEET.OLD_SETTINGS);
  if (!sheet) return;
  var props = PropertiesService.getScriptProperties();
  var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  if (lastRow >= 2 && lastCol >= 1) {
    var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    LIST_DEFS.forEach(function (d) {
      if (props.getProperty(PROP.LIST + d.list)) return; // アプリで保存済みならそちらを優先
      var col = headers.indexOf(d.label);
      if (col === -1) return;
      var aliasCol = d.aliases ? headers.findIndex(function (h) { return String(h).indexOf(d.label + 'の別名') === 0; }) : -1;
      var seen = {};
      var entries = [];
      values.forEach(function (row) {
        var v = normalizeKanaText(row[col]);
        if (!v || seen[v]) return;
        seen[v] = true;
        entries.push({ value: v, aliases: aliasCol === -1 ? [] : splitAliases(row[aliasCol]) });
      });
      writeList_(d.list, entries);
    });
  }
  ss.deleteSheet(sheet);
  report.push('「設定」シートの選択肢を設定アプリへ移し、シートを削除しました');
}

// =====================================================================
// 5. シート共通処理
// =====================================================================

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getHeaders_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
}

function getColumns_(sheet) {
  return resolveColumns(getHeaders_(sheet));
}

function ensureRows_(sheet, lastNeededRow) {
  var max = sheet.getMaxRows();
  if (lastNeededRow > max) sheet.insertRowsAfter(max, lastNeededRow - max + 50);
}

/** データが入っている最終行（OCN・車台番号・車種・モデル名のいずれかが入っている行） */
function lastDataRow_(sheet, colMap) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  var keys = ['ocn', 'chassisNumber', 'maker', 'modelName'].filter(function (k) { return colMap[k] !== undefined; });
  if (!keys.length) return lastRow;
  var last = 1;
  keys.forEach(function (k) {
    var values = sheet.getRange(2, colMap[k] + 1, lastRow - 1, 1).getValues();
    for (var i = values.length - 1; i >= 0; i--) {
      if (!isBlank(values[i][0])) { last = Math.max(last, i + 2); break; }
    }
  });
  return last;
}

function timestamp_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmm');
}

/** 3シートの OCN をすべて集める */
function collectOcns_(ss) {
  var ocns = [];
  VEHICLE_SHEETS.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;
    var cols = getColumns_(sheet).map;
    if (cols.ocn === undefined) return;
    sheet.getRange(2, cols.ocn + 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) { if (!isBlank(r[0])) ocns.push(r[0]); });
  });
  return ocns;
}

/** 次のOCNを予約する（会社単位・輸入車／国産車共通の連番）。呼び出し側でロックを取る */
function reserveOcn_(ss) {
  var props = PropertiesService.getScriptProperties();
  var n = nextOcnNumber(collectOcns_(ss), props.getProperty(PROP.OCN_LAST));
  props.setProperty(PROP.OCN_LAST, String(n));
  return n;
}

/** 行ごとに式を入れている既存シート向け：上の行の式を新しい行へ引き継ぐ */
function copyRowFormulas_(sheet, cols, row) {
  if (row <= 2) return;
  FIELDS.filter(function (f) { return f.type === 'formula' && cols[f.key] !== undefined; }).forEach(function (f) {
    var c = cols[f.key] + 1;
    if (sheet.getRange(1, c).getFormula()) return; // 見出しの ARRAYFORMULA 方式
    var above = sheet.getRange(row - 1, c);
    if (above.getFormula()) above.copyTo(sheet.getRange(row, c), SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
  });
}

/** シートのバックアップ（同じスプレッドシート内に非表示のコピーを作る） */
function makeBackupSheet_(ss, sheet) {
  var copy = sheet.copyTo(ss).setName(sheet.getName() + '_BK_' + timestamp_() + '_' + Math.floor(Math.random() * 90 + 10));
  copy.hideSheet();
  return copy.getName();
}

// =====================================================================
// 6. セットアップ
// =====================================================================

/** 設定アプリ：現在の設定 */
function getSetupState() {
  var s = getSettings_();
  var ss = getSpreadsheet_();
  return {
    company: s.company, expiryDays: s.expiryDays, folderCert: s.folderCert, certLinkHourly: s.certLinkHourly,
    spreadsheetName: ss.getName(), spreadsheetUrl: ss.getUrl(),
    sheets: VEHICLE_SHEETS.map(function (name) {
      var sheet = ss.getSheetByName(name);
      if (!sheet) return { name: name, exists: false };
      var headers = getHeaders_(sheet);
      var cols = resolveColumns(headers).map;
      return { name: name, exists: true, standard: isStandardLayout(headers), rows: Math.max(lastDataRow_(sheet, cols) - 1, 0) };
    }),
    nextOcn: nextOcnNumber(collectOcns_(ss), PropertiesService.getScriptProperties().getProperty(PROP.OCN_LAST))
  };
}

/**
 * 設定アプリ：セットアップ（設定の保存と、シートの整備）。
 * 既存シート・既存データは上書きせず、不足分だけを追加する。
 * @return {{ok:boolean, report:Array<string>}}
 */
function runSetup(form) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('他の処理が実行中です。しばらくしてから再実行してください。');
  var report = [];
  try {
    var ss = getSpreadsheet_();
    var props = PropertiesService.getScriptProperties();
    if (isBlank(form.company)) throw new Error('会社名を入力してください');

    var hasExisting = VEHICLE_SHEETS.some(function (n) { return !!ss.getSheetByName(n); });
    if (form.backup !== false && hasExisting) {
      var copy = DriveApp.getFileById(ss.getId()).makeCopy(ss.getName() + '_バックアップ_' + timestamp_());
      report.push('バックアップを作成しました：' + copy.getName());
    }

    var values = {};
    values[PROP.COMPANY] = String(form.company).trim();
    values[PROP.EXPIRY_DAYS] = String(Math.max(0, Number(form.expiryDays) || 0));
    values[PROP.CERT_LINK_HOURLY] = form.certLinkHourly ? 'true' : 'false';
    var folderId = extractDriveId_(form.folderCert);
    if (folderId) values[PROP.FOLDER_CERT] = DriveApp.getFolderById(folderId).getId(); // 存在確認
    else props.deleteProperty(PROP.FOLDER_CERT);
    props.setProperties(values);

    migrateOldSettingsSheet_(ss, report);
    VEHICLE_SHEETS.forEach(function (name) { ensureVehicleSheet_(ss, name, report); });
    ensureLogSheet_(ss);
    reapplyStandards_(ss, report);

    if (!props.getProperty(PROP.OCN_LAST)) {
      var max = nextOcnNumber(collectOcns_(ss), 0) - 1;
      props.setProperty(PROP.OCN_LAST, String(max));
      report.push('OCNの採番を初期化しました（次の番号：' + (max + 1) + '）');
    }
    setupTriggers_(values[PROP.CERT_LINK_HOURLY] === 'true' && !!folderId, report);
    appendLog_('セットアップ', ss.getName(), '', '', '', report.join(' / '));
    return { ok: true, report: report };
  } finally {
    lock.releaseLock();
  }
}

/** フォルダURL・ID のどちらでも受け付ける */
function extractDriveId_(input) {
  if (isBlank(input)) return '';
  var s = String(input).trim();
  var m = s.match(/\/folders\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/) || s.match(/\/d\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : s;
}

function ensureVehicleSheet_(ss, name, report) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, STANDARD_HEADERS.length).setValues([STANDARD_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    report.push('シート「' + name + '」を作成しました（A〜AC列）');
    return sheet;
  }
  var headers = getHeaders_(sheet);
  if (!headers.some(function (h) { return !isBlank(h); })) {
    sheet.getRange(1, 1, 1, STANDARD_HEADERS.length).setValues([STANDARD_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    report.push('シート「' + name + '」に見出し行を設定しました');
    return sheet;
  }
  if (name === SHEET.SOLD && !isStandardLayout(headers)) {
    report.push('「' + name + '」の列配置が標準（A〜AC）と異なります。設定アプリの「一括整形・列統一」で列統一を実行してください');
    return sheet;
  }
  var res = resolveColumns(headers);
  if (res.missing.length) {
    var labels = res.missing.map(function (k) { return FIELD_BY_KEY[k].label; });
    sheet.getRange(1, headers.length + 1, 1, labels.length).setValues([labels]).setFontWeight('bold');
    report.push('「' + name + '」に不足していた列を右端に追加しました：' + labels.join('、'));
  }
  return sheet;
}

function ensureLogSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET.LOG);
  if (sheet) return sheet;
  sheet = ss.insertSheet(SHEET.LOG);
  sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  return sheet;
}

/** 設定アプリ・メニュー：3シートの書式・プルダウン・入力チェックを整え直す（値は変えない） */
function reapplyStandards() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('他の処理が実行中です');
  try {
    var report = [];
    reapplyStandards_(getSpreadsheet_(), report);
    appendLog_('書式の再設定', '3シート', '', '', '', report.join(' / '));
    return report;
  } finally {
    lock.releaseLock();
  }
}

function reapplyStandards_(ss, report) {
  var settings = getSettings_();
  var colMaps = {};
  VEHICLE_SHEETS.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (sheet) colMaps[name] = getColumns_(sheet).map;
  });
  Object.keys(colMaps).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    var cols = colMaps[name];
    applyFormats_(sheet, cols, 2, Math.max(sheet.getMaxRows() - 1, 1));
    applyValidations_(sheet, cols);
    applyProtections_(sheet, cols);
    applyFormulaColumns_(sheet, cols, report);
    applyCheckRules_(sheet, buildCheckRules(name, colMaps, settings.expiryDays));
  });
  report.push('日付を西暦（yyyy/MM/dd）、走行距離を「12,345km」、金額を「#,##0」で表示するよう設定しました');
  report.push('プルダウン、入力チェックの色分け、見出し行・OCN列の保護を設定しました');
}

/** 表示形式を列ごとに設定する（日付は西暦・走行距離は区切り＋km・金額は区切り） */
function applyFormats_(sheet, cols, startRow, numRows) {
  FIELDS.forEach(function (f) {
    var fmt = numberFormatFor(f);
    if (!fmt || cols[f.key] === undefined) return;
    sheet.getRange(startRow, cols[f.key] + 1, numRows, 1).setNumberFormat(fmt);
  });
}

function applyValidations_(sheet, cols) {
  var rows = Math.max(sheet.getMaxRows() - 1, 1);
  var lists = readLists_();
  FIELDS.forEach(function (f) {
    var c = cols[f.key];
    if (c === undefined) return;
    var range = sheet.getRange(2, c + 1, rows, 1);
    if (f.type === 'date') {
      range.setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(true).build()); // カレンダーで選べる
    } else if (f.type === 'list') {
      var values = (lists[f.list] || []).map(function (e) { return e.value; });
      // 表記ゆれは入力時に自動で選択肢へ変換するため、入力自体は拒否しない（選択肢外は警告表示）
      if (values.length) range.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(true).build());
      else range.clearDataValidations();
    }
  });
}

function applyProtections_(sheet, cols) {
  var existing = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).map(function (p) { return p.getDescription(); });
  if (existing.indexOf('見出し行の保護') === -1) {
    sheet.getRange(1, 1, 1, sheet.getMaxColumns()).protect().setDescription('見出し行の保護').setWarningOnly(true);
  }
  if (cols.ocn !== undefined && existing.indexOf('OCNの保護') === -1) {
    sheet.getRange(2, cols.ocn + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).protect().setDescription('OCNの保護').setWarningOnly(true);
  }
}

/** 計算式の列：見出し行に ARRAYFORMULA（既存の式・値がある列は切り替えない） */
function applyFormulaColumns_(sheet, cols, report) {
  FIELDS.filter(function (f) { return f.type === 'formula'; }).forEach(function (f) {
    var c = cols[f.key];
    if (c === undefined) return;
    var header = sheet.getRange(1, c + 1);
    if (header.getFormula()) return;
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var range = sheet.getRange(2, c + 1, lastRow - 1, 1);
      if (range.getFormulas().some(function (r) { return r[0]; }) || range.getValues().some(function (r) { return !isBlank(r[0]); })) {
        return; // 既存の式・値はそのまま（新しい行には上の行の式を引き継ぐ）
      }
    }
    var formula = buildArrayFormula(f.key, cols);
    if (!formula) { report.push('「' + sheet.getName() + '」の' + f.label + '：計算式が未確定のため設定していません'); return; }
    header.setFormula(formula);
    report.push('「' + sheet.getName() + '」の' + f.label + '：見出し行に計算式を設定しました');
  });
}

/** このシステムの条件付き書式だけを入れ替える（利用者が作った条件付き書式は残す） */
function applyCheckRules_(sheet, defs) {
  var rules = sheet.getConditionalFormatRules().filter(function (r) {
    var cond = r.getBooleanCondition();
    var vals = cond ? cond.getCriteriaValues() : [];
    return !(vals.length && String(vals[0]).indexOf(CF_MARKER) !== -1);
  });
  var rows = Math.max(sheet.getMaxRows() - 1, 1);
  var lastCol = Math.max(sheet.getLastColumn(), STANDARD_HEADERS.length);
  defs.forEach(function (d) {
    var ranges = d.wholeRow
      ? [sheet.getRange(2, 1, rows, lastCol)]
      : d.columns.map(function (letter) { return sheet.getRange(letter + '2:' + letter + (rows + 1)); });
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(d.formula)
      .setBackground(d.color).setRanges(ranges).build());
  });
  sheet.setConditionalFormatRules(rules);
}

/**
 * トリガー：入力時の自動整形はシンプルトリガー onEdit（設定不要）で動く。
 * 以前の版のトリガー（編集トリガー・自動読み取り）は削除し、車検証リンクの定期更新だけを任意で設定する。
 */
function setupTriggers_(certLinkHourly, report) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (h === 'handleEdit' || h === 'scheduledRun' || h === 'scheduledCertLinks') ScriptApp.deleteTrigger(t);
  });
  if (certLinkHourly) {
    ScriptApp.newTrigger('scheduledCertLinks').timeBased().everyHours(1).create();
    report.push('車検証リンクの定期更新（1時間ごと）を設定しました');
  }
}

// =====================================================================
// 7. 入力時の自動整形（onEdit）・OCN採番・販売済みへの移動
// =====================================================================

/**
 * シンプルトリガー：セルの値を確定するたびに実行される（誰が入力しても動く）。
 *  1) 値を正しい書式に整える（和暦→西暦日付、全角→半角、「12,345km」→ 12345 など）
 *  2) 入力した列の表示形式を付け直す（貼り付けで和暦などの表示形式が持ち込まれても西暦・km表示に戻す）
 *  3) OCN を採番する
 *  4) ステータスが「販売済み」になった行を、確認のうえ販売済みシートへ移動する
 * 複数セルの貼り付けにも対応する。
 */
function onEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  var name = sheet.getName();
  if (VEHICLE_SHEETS.indexOf(name) === -1) return;
  var range = e.range;
  if (range.getRow() === 1) {
    if (range.getNumRows() === 1) return; // 見出し行
    range = range.offset(1, 0, range.getNumRows() - 1);
  }
  if (range.getNumRows() > 2000) return; // 大量の貼り付けは設定アプリの一括整形で
  var startRow = range.getRow(), startCol = range.getColumn();
  var numRows = range.getNumRows(), numCols = range.getNumColumns();

  var ss = sheet.getParent();
  var cols = getColumns_(sheet).map;
  var fieldAt = {};
  FIELDS.forEach(function (f) { if (cols[f.key] !== undefined) fieldAt[cols[f.key] + 1] = f; });
  var lists = readLists_();
  var values = range.getValues();

  for (var c = 0; c < numCols; c++) {
    var field = fieldAt[startCol + c];
    if (!field) continue;
    var colRange = sheet.getRange(startRow, startCol + c, numRows, 1);
    var fmt = numberFormatFor(field);
    if (fmt) colRange.setNumberFormat(fmt);
    if (field.type === 'formula' || field.type === 'link' || field.type === 'ocn') continue;
    var changed = false;
    var column = [];
    for (var r = 0; r < numRows; r++) {
      var res = normalizeCellValue(field, values[r][c], lists);
      column.push([res.value]);
      if (res.changed) { changed = true; values[r][c] = res.value; }
    }
    if (changed) colRange.setValues(column);
  }

  if (cols.ocn !== undefined) assignMissingOcns_(ss, sheet, cols, startRow, numRows);

  if (MASTER_SHEETS.indexOf(name) !== -1 && cols.status !== undefined) {
    var sc = cols.status + 1;
    if (sc >= startCol && sc < startCol + numCols) {
      var soldRows = [];
      for (var sr = 0; sr < numRows; sr++) if (values[sr][sc - startCol] === STATUS_SOLD) soldRows.push(startRow + sr);
      if (soldRows.length) confirmAndMoveSold_(ss, sheet, soldRows, e.oldValue);
    }
  }
}

/** OCN の自動採番（車台番号・車種・モデル名のいずれかが入った行で、OCNが空欄なら） */
function assignMissingOcns_(ss, sheet, cols, startRow, numRows) {
  var keys = ['chassisNumber', 'maker', 'modelName'].filter(function (k) { return cols[k] !== undefined; });
  var rows = sheet.getRange(startRow, 1, numRows, sheet.getLastColumn()).getValues();
  var targets = [];
  rows.forEach(function (row, i) {
    if (!isBlank(row[cols.ocn])) return;
    if (keys.some(function (k) { return !isBlank(row[cols[k]]); })) targets.push(startRow + i);
  });
  if (!targets.length) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    targets.forEach(function (row) {
      var cell = sheet.getRange(row, cols.ocn + 1);
      if (isBlank(cell.getValue())) cell.setNumberFormat('0').setValue(reserveOcn_(ss));
    });
  } finally {
    lock.releaseLock();
  }
}

function confirmAndMoveSold_(ss, sheet, rows, oldValue) {
  var cols = getColumns_(sheet).map;
  var ocns = cols.ocn === undefined ? [] : rows.map(function (r) { return sheet.getRange(r, cols.ocn + 1).getDisplayValue(); }).filter(function (o) { return o; });
  var ui, answer;
  try {
    ui = SpreadsheetApp.getUi();
    answer = ui.alert('販売済みシートへ移動',
      (ocns.length ? 'OCN ' + ocns.join('、') + ' の' : '') + rows.length + '行を販売済みシートへ移動します。よろしいですか？\n（「いいえ」の場合はステータスを元に戻します）',
      ui.ButtonSet.YES_NO);
  } catch (err) {
    // 確認画面を出せない場合は移動せず、メニューからの移動を案内する
    sheet.getRange(rows[0], cols.status + 1).setNote('販売済みシートへの移動は、メニュー「' + MENU_NAME + '」→「ステータスが販売済みの行を販売済みシートへ移動」で行ってください');
    return;
  }
  if (answer === ui.Button.YES) {
    moveRowsToSold_(ss, sheet, rows);
  } else if (rows.length === 1) {
    sheet.getRange(rows[0], cols.status + 1).setValue(oldValue === undefined ? '' : oldValue);
  }
}

/** マスタの行を販売済みシートへ移動する（見出し名で列を対応づけるので列ずれしない） */
function moveRowsToSold_(ss, sheet, rows) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('他の処理が実行中です');
  try {
    var sold = ss.getSheetByName(SHEET.SOLD);
    if (!sold) throw new Error('「' + SHEET.SOLD + '」シートがありません');
    var srcCols = getColumns_(sheet).map, dstCols = getColumns_(sold).map;
    var lastCol = sheet.getLastColumn();
    rows = rows.slice().sort(function (a, b) { return a - b; });
    rows.forEach(function (row) {
      var values = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
      var dstRow = lastDataRow_(sold, dstCols) + 1;
      ensureRows_(sold, dstRow);
      copyRowFormulas_(sold, dstCols, dstRow);
      applyFormats_(sold, dstCols, dstRow, 1);
      FIELDS.forEach(function (f) {
        if (f.type === 'formula' || srcCols[f.key] === undefined || dstCols[f.key] === undefined) return;
        var v = values[srcCols[f.key]];
        if (isBlank(v)) return;
        var dst = sold.getRange(dstRow, dstCols[f.key] + 1);
        if (f.type === 'link') dst.setRichTextValue(sheet.getRange(row, srcCols[f.key] + 1).getRichTextValue());
        else dst.setValue(v);
      });
      appendLog_('販売済み移動', String(values[srcCols.ocn] || ''), sheet.getName() + ' ' + row + '行目', '', SHEET.SOLD + ' ' + dstRow + '行目', '');
    });
    for (var i = rows.length - 1; i >= 0; i--) sheet.deleteRow(rows[i]);
  } finally {
    lock.releaseLock();
  }
}

// =====================================================================
// 8. 車検証リンク（車検証保管フォルダのファイル名の OCN と行を突き合わせる）
// =====================================================================

/**
 * 以前の版のトリガー（編集トリガー handleEdit・自動読み取り scheduledRun）が残っていてもエラーにしないための空の関数。
 * 設定アプリでセットアップを実行し直すと、古いトリガーは削除される。
 */
function handleEdit() {}
function scheduledRun() {}

function scheduledCertLinks() {
  try {
    updateCertLinks();
  } catch (e) {
    appendLog_('エラー', '定期実行', '車検証リンク', '', '', e.message);
  }
}

/** 設定アプリ・メニュー：車検証保管フォルダの「OCN.pdf」などを行と突き合わせ、「車検証ﾘﾝｸ」を付ける */
function updateCertLinks() {
  var settings = getSettings_();
  if (!settings.folderCert) return { count: 0, message: '車検証保管フォルダが未設定です。設定アプリの「基本設定」で設定してください。' };
  var byOcn = {};
  var it = DriveApp.getFolderById(settings.folderCert).getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var n = ocnFromFileName(f.getName());
    if (n === null) continue;
    // 同じ OCN のファイルが複数あれば「OCN.拡張子」を優先し、次に更新日の新しいもの
    var exact = /^\d+\.[A-Za-z0-9]+$/.test(f.getName());
    var cur = byOcn[n];
    if (!cur || (exact && !cur.exact) || (exact === cur.exact && f.getLastUpdated() > cur.file.getLastUpdated())) byOcn[n] = { file: f, exact: exact };
  }
  var ss = getSpreadsheet_();
  var count = 0;
  var linkText = normalizeKanaText('車検証リンク');
  VEHICLE_SHEETS.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;
    var cols = getColumns_(sheet).map;
    if (cols.ocn === undefined || cols.certLink === undefined) return;
    var n = sheet.getLastRow() - 1;
    var ocns = sheet.getRange(2, cols.ocn + 1, n, 1).getValues();
    var links = sheet.getRange(2, cols.certLink + 1, n, 1).getRichTextValues();
    ocns.forEach(function (r, i) {
      var num = parseOcnNumber(r[0]);
      if (num === null || !byOcn[num]) return;
      var url = byOcn[num].file.getUrl();
      if (links[i][0] && links[i][0].getLinkUrl() === url) return;
      sheet.getRange(i + 2, cols.certLink + 1).setRichTextValue(
        SpreadsheetApp.newRichTextValue().setText(linkText).setLinkUrl(url).build());
      count++;
    });
  });
  if (count) appendLog_('車検証リンク', '車検証保管フォルダ', '', '', count + '件', 'リンクを設定しました');
  return { count: count, message: count + '件のリンクを設定しました。' };
}

// =====================================================================
// 9. 既存データの一括整形・販売済みシートの列統一
// =====================================================================

/** 列統一の計画（標準の各列 ← 現行のどの列か） */
function planSoldMigration_(headers) {
  var res = resolveColumns(headers);
  var rows = FIELDS.map(function (f, i) {
    var src = res.map[f.key];
    return { to: columnLetter(i + 1) + ' ' + f.label, from: src === undefined ? '（該当なし・空欄）' : columnLetter(src + 1) + '「' + headers[src] + '」' };
  });
  return {
    alreadyStandard: isStandardLayout(headers), rows: rows,
    extra: res.unknown.map(function (u) { return columnLetter(u.index + 1) + '「' + u.label + '」'; }),
    resolved: res
  };
}

/** 設定アプリ：ドライラン（変更予定の一覧）。シートには何も書き込まない */
function cleanupDryRun() {
  var ss = getSpreadsheet_();
  var sold = ss.getSheetByName(SHEET.SOLD);
  var result = runCleanup_(ss, {}, false);
  if (sold) {
    var plan = planSoldMigration_(getHeaders_(sold));
    result.migration = { needed: !plan.alreadyStandard, rows: plan.rows, extra: plan.extra };
  }
  return result;
}

/**
 * 設定アプリ：一括整形の実行。変更のあるシートはバックアップを作ってから書き換え、最後に表示形式を整え直す。
 * @param {Object} replacements 列キー → {プルダウン外の値: 置き換え先 | '__KEEP__' | '__ADD__'}
 */
function cleanupExecute(replacements) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('他の処理が実行中です');
  try {
    var ss = getSpreadsheet_();
    var result = runCleanup_(ss, replacements || {}, true);
    reapplyStandards_(ss, []);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function runCleanup_(ss, replacements, execute) {
  var lists = readLists_();
  var out = { totalChanges: 0, byColumn: {}, samples: [], unfixable: [], unfixableTotal: 0, outOfList: {}, backups: [], added: [] };
  var toAdd = {};
  VEHICLE_SHEETS.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) return;
    var cols = getColumns_(sheet).map;
    var last = lastDataRow_(sheet, cols);
    if (last < 2) return;
    var numRows = last - 1;
    var width = sheet.getLastColumn();
    var data = sheet.getRange(2, 1, numRows, width).getValues();
    var formulas = sheet.getRange(2, 1, numRows, width).getFormulas();
    var writes = [];
    FIELDS.forEach(function (f) {
      var c = cols[f.key];
      if (c === undefined || f.type === 'formula' || f.type === 'link') return; // 計算式の列は対象外
      var column = [], changedRows = [], hasFormula = false;
      for (var r = 0; r < numRows; r++) {
        var v = data[r][c];
        if (formulas[r][c]) { hasFormula = true; column.push([v]); continue; }
        var res = normalizeCellValue(f, v, lists);
        var nv = res.value;
        if (res.outOfList) {
          var rep = replacements[f.key] && replacements[f.key][String(nv)];
          if (rep === '__ADD__') {
            (toAdd[f.list] = toAdd[f.list] || {})[String(nv)] = true;
          } else if (rep && rep !== '__KEEP__') {
            nv = rep;
          } else if (!rep) {
            var bk = f.key + '|' + nv;
            var bucket = out.outOfList[bk] = out.outOfList[bk] || {
              key: f.key, label: f.label, list: f.list, value: String(nv), count: 0,
              suggestion: suggestListValue(nv, lists[f.list] || [], listAllowsContains(f.list))
            };
            bucket.count++;
          }
        }
        if (res.error) {
          out.unfixableTotal++;
          if (out.unfixable.length < 300) out.unfixable.push({ sheet: name, row: r + 2, label: f.label, value: displayValue_(v), reason: res.error });
        }
        column.push([nv]);
        if (!sameCellValue(v, nv)) {
          changedRows.push(r);
          if (out.samples.length < 300) out.samples.push({ sheet: name, row: r + 2, label: f.label, before: displayValue_(v), after: displayValue_(nv) });
        }
      }
      if (!changedRows.length) return;
      out.totalChanges += changedRows.length;
      var k = name + '｜' + f.label;
      out.byColumn[k] = (out.byColumn[k] || 0) + changedRows.length;
      writes.push({ col: c + 1, column: column, rows: changedRows, hasFormula: hasFormula });
    });
    if (execute && writes.length) {
      out.backups.push(makeBackupSheet_(ss, sheet));
      writes.forEach(function (w) {
        if (w.hasFormula) w.rows.forEach(function (r) { sheet.getRange(r + 2, w.col).setValue(w.column[r][0]); });
        else sheet.getRange(2, w.col, numRows, 1).setValues(w.column);
      });
    }
  });

  if (execute) {
    var addedTotal = 0;
    Object.keys(toAdd).forEach(function (listName) {
      var values = Object.keys(toAdd[listName]);
      if (!values.length || !LIST_DEFS.some(function (d) { return d.list === listName; })) return;
      var entries = readLists_()[listName].concat(values.map(function (v) { return { value: v, aliases: [] }; }));
      writeList_(listName, entries);
      out.added.push(listName + '：' + values.join('、'));
      addedTotal += values.length;
    });
    var report = '変更したセル ' + out.totalChanges + '件・修正できなかったセル ' + out.unfixableTotal + '件' +
      (addedTotal ? '・選択肢に追加 ' + addedTotal + '件' : '') + (out.backups.length ? '・バックアップ：' + out.backups.join('、') + '（非表示シート）' : '');
    appendLog_('一括整形', '3シート', '', '', '', report);
    if (out.unfixable.length) {
      appendLogRows_(out.unfixable.slice(0, 200).map(function (u) {
        return ['一括整形・修正不可', u.sheet + ' ' + u.row + '行目', u.label, u.value, '', u.reason];
      }));
    }
    out.message = report;
  }
  out.byColumn = Object.keys(out.byColumn).map(function (k) { return { column: k, count: out.byColumn[k] }; });
  out.outOfList = Object.keys(out.outOfList).map(function (k) { return out.outOfList[k]; })
    .sort(function (a, b) { return b.count - a.count; });
  out.options = {};
  Object.keys(lists).forEach(function (k) { out.options[k] = lists[k].map(function (e) { return e.value; }); });
  out.editableLists = LIST_DEFS.map(function (d) { return d.list; });
  return out;
}

function displayValue_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy/MM/dd');
  return isBlank(v) ? '' : String(v);
}

/** 設定アプリ：販売済みシートの列統一の実行（バックアップを作ってから並べ替え） */
function migrateSoldSheet() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('他の処理が実行中です');
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(SHEET.SOLD);
    if (!sheet) throw new Error('「' + SHEET.SOLD + '」シートがありません');
    var headers = getHeaders_(sheet);
    var plan = planSoldMigration_(headers);
    if (plan.alreadyStandard) return { message: '「' + SHEET.SOLD + '」は既にA〜AC列の標準構成です' };
    var res = plan.resolved;
    var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
    var backup = makeBackupSheet_(ss, sheet);
    var data = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
    var linkCol = res.map.certLink;
    var links = (lastRow >= 2 && linkCol !== undefined) ? sheet.getRange(2, linkCol + 1, lastRow - 1, 1).getRichTextValues() : [];

    var outHeaders = STANDARD_HEADERS.concat(res.unknown.map(function (u) { return u.label; }));
    var out = [], outLinks = [];
    data.forEach(function (row, r) {
      if (row.every(function (v) { return isBlank(v); })) return;
      var newRow = FIELDS.map(function (f) {
        if (f.type === 'formula' && FORMULA_DEFS[f.key]) return ''; // 見出しの ARRAYFORMULA で再計算
        var src = res.map[f.key];
        return src === undefined ? '' : row[src];
      });
      res.unknown.forEach(function (u) { newRow.push(row[u.index]); });
      out.push(newRow);
      outLinks.push(links[r] ? links[r][0] : null);
    });

    sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) { p.remove(); });
    sheet.clear();
    sheet.setConditionalFormatRules([]);
    sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).clearDataValidations();
    ensureRows_(sheet, out.length + 1);
    if (sheet.getMaxColumns() < outHeaders.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), outHeaders.length - sheet.getMaxColumns());
    sheet.getRange(1, 1, 1, outHeaders.length).setValues([outHeaders]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    if (out.length) {
      sheet.getRange(2, 1, out.length, outHeaders.length).setValues(out);
      var linkIdx = STANDARD_HEADERS.indexOf(FIELD_BY_KEY.certLink.label);
      if (outLinks.some(function (l) { return l && l.getLinkUrl(); })) {
        sheet.getRange(2, linkIdx + 1, outLinks.length, 1).setRichTextValues(outLinks.map(function (l, i) {
          return [l || SpreadsheetApp.newRichTextValue().setText(String(out[i][linkIdx] || '')).build()];
        }));
      }
    }
    var report = ['バックアップ：' + backup + '（非表示シート）', out.length + '行を標準の列構成（A〜AC）へ並べ替えました'];
    if (res.unknown.length) report.push('標準にない列はAD列以降に残しました：' + res.unknown.map(function (u) { return u.label; }).join('、'));
    reapplyStandards_(ss, report);
    appendLog_('列統一', SHEET.SOLD, '', headers.join(','), outHeaders.join(','), report.join(' / '));
    return { message: report.join('\n') };
  } finally {
    lock.releaseLock();
  }
}

// =====================================================================
// 10. ログ
// =====================================================================

/** 設定アプリ：最近のログ（新しい順） */
function getRecentLogs(limit) {
  var sheet = getSpreadsheet_().getSheetByName(SHEET.LOG);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var n = Math.min(Number(limit) || 50, sheet.getLastRow() - 1);
  var start = sheet.getLastRow() - n + 1;
  return sheet.getRange(start, 1, n, LOG_HEADERS.length).getValues().reverse().map(function (r) {
    return { at: r[0] instanceof Date ? Utilities.formatDate(r[0], 'Asia/Tokyo', 'yyyy/MM/dd HH:mm') : String(r[0]),
      kind: String(r[1]), target: String(r[2]), item: String(r[3]), message: [r[4], r[5], r[6]].filter(function (x) { return !isBlank(x); }).join(' → ') };
  });
}

function appendLog_(kind, target, item, before, after, message) {
  appendLogRows_([[kind, target, item, before, after, message]]);
}

/** rows: [区分, 対象, 項目, 変更前, 変更後, 内容] の配列 */
function appendLogRows_(rows) {
  try {
    var sheet = ensureLogSheet_(getSpreadsheet_());
    var user = '';
    try { user = Session.getActiveUser().getEmail(); } catch (e) { user = ''; }
    var now = new Date();
    var out = rows.map(function (r) {
      return [now].concat(r.map(function (v) { return String(v === null || v === undefined ? '' : v).substring(0, 5000); })).concat([user]);
    });
    var start = sheet.getLastRow() + 1;
    ensureRows_(sheet, start + out.length - 1);
    sheet.getRange(start, 1, out.length, LOG_HEADERS.length).setValues(out);
  } catch (e) {
    console.error('ログ書き込み失敗: ' + e.message);
  }
}
