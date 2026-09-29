/**
 * Code.gs
 * YANASE 中古車管理表 整備・読み取り改善（改訂版企画書 フェーズ1）
 *
 * AU・C7・MB の3社のスプレッドシートそれぞれに同じコードをコンテナバインドで入れ、
 * メニュー「★専用システム」→「初期セットアップ／設定変更」で会社ごとの設定を行う。
 *
 * 方針（企画書 第1章）
 *  - 入力の主役はスプレッドシートへの直接入力。書式の統一と入力補助で使いやすくする
 *  - 直接入力も自動読み取りも、同じ自動整形を通して書式を揃える（Gemini を使わない）
 *  - 自動読み取りは補助。Gemini は「1ファイル＝1回」まで、1日の上限つき
 *  - 計算式の列（車検残・下取損・仕入価格）にはコードから書き込まない
 *  - Gemini APIキーはスクリプトプロパティに保存し、コードには書かない
 *
 * 構成
 *   1. 定数・列定義
 *   2. 正規化・入力チェック（純粋関数：tests/run.js で単体テスト）
 *   3. 自動読み取りの組立（純粋関数）
 *   4. メニュー・画面表示
 *   5. 設定（スクリプトプロパティ・設定シート）
 *   6. シート共通処理
 *   7. セットアップ（シート・書式・プルダウン・条件付き書式・トリガー）
 *   8. 入力時の自動整形（onEdit）・OCN採番・販売済みへの移動
 *   9. 自動読み取り（Gemini）
 *  10. 車検証リンク
 *  11. 既存データの一括整形・販売済みシートの列統一
 *  12. ログ
 */

// =====================================================================
// 1. 定数・列定義
// =====================================================================

var MENU_NAME = '★専用システム';

var SHEET = {
  IMPORT_MASTER: '輸入車マスタ',
  DOMESTIC_MASTER: '国産車マスタ',
  SOLD: '販売済み',
  SETTINGS: '設定',
  LOG: 'ログ'
};
var MASTER_SHEETS = [SHEET.IMPORT_MASTER, SHEET.DOMESTIC_MASTER];
var VEHICLE_SHEETS = [SHEET.IMPORT_MASTER, SHEET.DOMESTIC_MASTER, SHEET.SOLD];

var STATUS_OPTIONS = ['書類待ち', '所有権解除済み', '車庫証明申請中', '名義変更中', '名義変更済み', '抹消登録済み', '販売済み'];
var CATEGORY_OPTIONS = ['買取', '仕入', '下取', 'オークション'];
var STATUS_SOLD = '販売済み';
var DEFAULT_STATUS = '書類待ち';

/**
 * マスタ・販売済みの列定義（順序 = A〜AC列の標準配置。企画書 第4章「列ごとの入力方式」）
 *  type : date | ocn | list | kana（半角カナ・半角英数）| address（英数字のみ半角）| chassis
 *         | mileage | money | plateClass | plateKana | plateNumber | link（自動）| formula（書き込まない）
 *  list : プルダウンの選択肢（設定シートまたは固定の選択肢）
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

/** 列の表示形式（企画書 第4章の「書式」） */
var NUMBER_FORMATS = {
  date: 'yyyy/MM/dd',
  ocn: '0',
  mileage: '#,##0"km"',
  money: '#,##0',
  chassis: '@',
  plateClass: '@',
  plateNumber: '@'
};

/**
 * 計算式の列の定義。見出し行に ARRAYFORMULA を1つ置く方式で使う（既存の式・値がある列は切り替えない）。
 * {キー} は該当列の「2行目以降の範囲」（例：G2:G）に置き換わる。
 * null は式が未確定（企画書 第11章の確認事項）のため設定しない。
 */
var FORMULA_DEFS = {
  inspectionRemain: 'IF({inspectionExpiry}="",,IF({inspectionExpiry}<TODAY(),0,DATEDIF(TODAY(),{inspectionExpiry},"M")))',
  tradeInLoss: 'IF(({tradeInAllowance}="")+({tradeInPrice}=""),,{tradeInAllowance}-{tradeInPrice})',
  purchasePrice: null
};

/** 設定シートの列（プルダウンの選択肢。企画書 第4章） */
var LIST_COLUMNS = [
  { list: 'maker', label: 'メーカー', aliasLabel: 'メーカーの別名（読み取り・入力の変換用。カンマ区切り）' },
  { list: 'color', label: '色', aliasLabel: '色の別名（読み取り・入力の変換用。カンマ区切り）' },
  { list: 'staff', label: '担当者' },
  { list: 'idCheck', label: '本人確認方法' },
  { list: 'region', label: '地域名' }
];

/** 自動車登録番号標の地域名（設定シートの初期値） */
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

/** 設定シートの初期値（選択肢は企画書 第11章で確定するまでの案。カタカナは作成時に半角カナへ変換） */
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

var AUTO_NOTE_PREFIX = '［自動読み取り';
var COLOR_AUTO = '#e1f0fb';   // 自動読み取りで入れた値
var COLOR_CHECK = '#fff2cc';  // 疑わしい値・読めなかった項目
var CF_MARKER = 'N("ucs")=0'; // このシステムが設定した条件付き書式の目印（常に真）

var DOC = { APPRAISAL: '査定書', CERT: '車検証', ORDER: '注文書', OTHER: 'その他' };
var SUPPORTED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
var MAX_FILE_BYTES = 18 * 1024 * 1024;
var RUN_BUDGET_MS = 4.5 * 60 * 1000;

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

/** 車台番号の入力整形：大文字化・半角化・空白除去。ハイフンは残す（国産車の形式） */
function normalizeChassisInput(v) {
  return toHalfWidthAlnum(v).toUpperCase().replace(/\s+/g, '').replace(/[ーｰ]/g, '-');
}

/**
 * 車台番号の文字補正（自動読み取り用。企画書 第6章）
 *  - 輸入車（17桁・ハイフンなし）：規格上 I・O・Q を使わないため 1・0・0 に補正
 *  - 国産車（型式部-連番）：ハイフン後の連番は数字のみとして補正（O→0、I→1 等）
 * @return {{value:string, kind:string, valid:boolean, corrected:boolean}}
 */
function correctChassisNumber(raw) {
  var s = normalizeChassisInput(raw);
  if (!s) return { value: '', kind: 'unknown', valid: false, corrected: false };
  if (s.indexOf('-') === -1 && s.length === 17 && /^[A-Z0-9]+$/.test(s)) {
    var vin = s.replace(/I/g, '1').replace(/[OQ]/g, '0');
    return { value: vin, kind: 'import', valid: /^[A-HJ-NPR-Z0-9]{17}$/.test(vin), corrected: vin !== s };
  }
  var m = s.match(/^([A-Z0-9]+)-([A-Z0-9|]+)$/);
  if (m) {
    var serial = m[2].replace(/[ODQ]/g, '0').replace(/[IL|]/g, '1').replace(/Z/g, '2')
      .replace(/S/g, '5').replace(/B/g, '8').replace(/G/g, '6');
    var value = m[1] + '-' + serial;
    return { value: value, kind: 'domestic', valid: /^\d{4,8}$/.test(serial), corrected: value !== s };
  }
  return { value: s, kind: 'unknown', valid: false, corrected: false };
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
 * 和暦・西暦の日付文字列を解釈する（R5.6.1、令和5年6月1日、2023/6/1、20230601 など）。
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
 * 1セル分の自動整形（直接入力・自動読み取り・一括整形で共通。企画書 第5章）
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

/** 日付の矛盾チェック（初度登録日が未来、車検満了日が初度登録日以前） */
function checkVehicleDates(firstReg, expiry, today) {
  var problems = {};
  if (firstReg instanceof Date && firstReg.getTime() > today.getTime()) problems.firstRegDate = '初度登録日が未来の日付です';
  if (firstReg instanceof Date && expiry instanceof Date && expiry.getTime() <= firstReg.getTime()) {
    problems.inspectionExpiry = '車検満了日が初度登録日以前です';
  }
  return problems;
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
 * 入力チェック用の条件付き書式（企画書 第5章「入力チェック」）を組み立てる。
 * 重複チェックは3シート横断（INDIRECT で他シートを参照）。
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

// =====================================================================
// 3. 自動読み取りの組立（純粋関数）
// =====================================================================

/** Gemini の応答テキスト（JSON）を書類の配列にする */
function parseGeminiDocuments(text) {
  var s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  var parsed;
  try {
    parsed = JSON.parse(s);
  } catch (e) {
    var m = s.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Gemini の応答を解釈できませんでした');
    parsed = JSON.parse(m[0]);
  }
  var docs = Array.isArray(parsed) ? parsed : (parsed.documents || []);
  return docs.map(function (d) {
    var fields = {};
    Object.keys(d.fields || {}).forEach(function (k) {
      var f = d.fields[k];
      if (f === null || typeof f !== 'object') f = { value: f, readable: !isBlank(f) };
      fields[k] = { value: isBlank(f.value) ? null : f.value, readable: f.readable !== false && !isBlank(f.value) };
    });
    return { type: String(d.type || DOC.OTHER).trim(), fields: fields };
  });
}

/** 比較用に値を正規化する（既存値との照合に使う） */
function compareKey(key, value) {
  if (isBlank(value)) return '';
  var f = FIELD_BY_KEY[key];
  var type = f ? f.type : 'kana';
  if (type === 'date') {
    var d = parseJapaneseDate(value);
    return d ? d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() : String(value);
  }
  if (type === 'mileage' || type === 'money') {
    var n = type === 'mileage' ? parseMileage(value) : parseAmount(value);
    return n === null ? String(value) : String(n);
  }
  if (type === 'chassis') return normalizeChassisInput(value).replace(/-/g, '');
  if (type === 'plateNumber') return normalizePlateNumber(value).replace(/^0+(?=\d)/, '');
  if (type === 'plateKana') return normalizePlateKana(value);
  return listKey(value);
}

/**
 * 読み取り結果（書類ごと）から、マスタに書く1台分の値を組み立てる。
 * 値は直接入力と同じ自動整形を通し、疑わしい値・読めなかった項目には理由（flags）を付ける。
 *
 * @param {Array<{type:string, fields:Object}>} docs
 * @param {{lists:Object, today:Date, readCert:boolean}} opts
 * @return {{fields:Object, docTypes:Array<string>, kind:string, skipped?:string}}
 *   fields[key] = {value:*, flags:Array<string>, raw:string, source:string}
 */
function buildReadRecord(docs, opts) {
  var appraisal = null, cert = null, ignored = [];
  (docs || []).forEach(function (d) {
    if (d.type === DOC.APPRAISAL && !appraisal) appraisal = d;
    else if (d.type === DOC.CERT && !cert) { if (opts.readCert) cert = d; else ignored.push(DOC.CERT); }
    else if (d.type !== DOC.APPRAISAL && d.type !== DOC.CERT) ignored.push(d.type);
  });
  var record = { fields: {}, docTypes: [], kind: 'unknown', ignored: ignored };
  if (!appraisal && !cert) {
    record.skipped = ignored.length
      ? '読み取り対象外の書類です（' + ignored.join('・') + '）。' +
        (ignored.indexOf(DOC.CERT) !== -1 ? '車検証の読み取りは設定で無効になっています' : '注文書は直接入力してください')
      : '書類の種類を判別できませんでした';
    return record;
  }
  if (appraisal) record.docTypes.push(DOC.APPRAISAL);
  if (cert) record.docTypes.push(DOC.CERT);

  function put(key, doc, name) {
    var f = doc.fields[name];
    if (!f) return;
    var entry = { value: '', flags: [], raw: isBlank(f.value) ? '' : String(f.value), source: doc.type };
    if (isBlank(f.value)) {
      entry.flags.push('読み取れませんでした');
    } else {
      if (!f.readable) entry.flags.push('一部読み取れない文字があります');
      var res = normalizeCellValue(FIELD_BY_KEY[key], f.value, opts.lists);
      entry.value = res.value;
      if (res.error) { entry.flags.push(res.error); entry.value = entry.raw; }
      if (res.outOfList) entry.flags.push('選択肢にない値です');
    }
    record.fields[key] = entry;
  }
  var PLATE_KEYS = ['plateRegion', 'plateClass', 'plateKana', 'plateNumber'];

  if (appraisal) {
    var af = appraisal.fields;
    put('maker', appraisal, af.maker ? 'maker' : 'carName');
    put('modelName', appraisal, 'model');
    put('chassisNumber', appraisal, 'chassisNumber');
    put('mileage', appraisal, 'mileage');
    put('recycleFee', appraisal, 'recycleFee');
    put('appraisalPrice', appraisal, 'appraisalPrice');
    PLATE_KEYS.forEach(function (k) { put(k, appraisal, k); });
    // 色：Gemini に10色の分類も返させ、元の色名はメモに残す
    var basic = af.colorBasic && af.colorBasic.value, named = af.color && af.color.value;
    if (!isBlank(basic) || !isBlank(named)) {
      var entries = (opts.lists && opts.lists.color) || [];
      var hit = matchListValue(basic, entries, true) || matchListValue(named, entries, true);
      record.fields.color = {
        value: hit || normalizeKanaText(named || basic),
        flags: hit ? [] : ['選択肢にない値です'],
        raw: String(named || basic), source: DOC.APPRAISAL
      };
    } else if (af.color) {
      record.fields.color = { value: '', flags: ['読み取れませんでした'], raw: '', source: DOC.APPRAISAL };
    }
  }

  if (cert) {
    var fromAppraisal = {};
    ['chassisNumber'].concat(PLATE_KEYS).forEach(function (k) { if (record.fields[k]) fromAppraisal[k] = record.fields[k]; });
    put('chassisNumber', cert, 'chassisNumber');
    put('firstRegDate', cert, 'firstRegDate');
    put('inspectionExpiry', cert, 'inspectionExpiry');
    put('supplier', cert, 'ownerName');
    put('address', cert, 'ownerAddress');
    PLATE_KEYS.forEach(function (k) { put(k, cert, k); });
    // 書類間の突合：査定書と車検証で食い違えば車検証の値を採り、要確認にする
    Object.keys(fromAppraisal).forEach(function (k) {
      var a = fromAppraisal[k], c = record.fields[k];
      if (!c || isBlank(c.value)) { record.fields[k] = a; return; }
      if (!isBlank(a.value) && compareKey(k, a.value) !== compareKey(k, c.value)) {
        c.flags.push('査定書「' + a.raw + '」と車検証で異なります');
      }
    });
    var fmt = cert.fields.certFormat && cert.fields.certFormat.value;
    if (fmt && String(fmt).indexOf('券面') !== -1) {
      ['inspectionExpiry', 'address'].forEach(function (k) {
        if (record.fields[k] && isBlank(record.fields[k].value)) record.fields[k].flags.push('電子車検証の券面には載りません（記録事項をスキャン）');
      });
    }
  }

  // 車台番号の文字補正
  var ch = record.fields.chassisNumber;
  if (ch && !isBlank(ch.value)) {
    var fixed = correctChassisNumber(ch.value);
    if (fixed.corrected) ch.flags.push('文字を補正しました（読取値：' + ch.raw + '）');
    if (!fixed.valid) ch.flags.push('車台番号の形式が正しくありません');
    ch.value = fixed.value;
    record.kind = fixed.kind;
  }
  // 登録番号の形式
  var pc = record.fields.plateClass, pn = record.fields.plateNumber, pk = record.fields.plateKana;
  if (pc && pc.value && !/^[0-9][0-9A-Z]{0,2}$/.test(pc.value)) pc.flags.push('分類番号の形式が正しくありません');
  if (pn && pn.value && !/^\d{1,4}$/.test(pn.value)) pn.flags.push('一連番号の形式が正しくありません');
  if (pk && pk.value && !/^[ぁ-ゖ]$/.test(pk.value)) pk.flags.push('ひらがな1文字ではありません');
  // 日付の矛盾
  var problems = checkVehicleDates(
    record.fields.firstRegDate && record.fields.firstRegDate.value,
    record.fields.inspectionExpiry && record.fields.inspectionExpiry.value, opts.today);
  Object.keys(problems).forEach(function (k) { record.fields[k].flags.push(problems[k]); });
  return record;
}

/**
 * 既存行に読み取り結果を反映する計画（空欄の項目だけを埋める。企画書 第6章）
 * @param {Object} existing 既存行の値（キー → 値）
 * @param {Object} fields buildReadRecord の fields
 * @return {{fill:Array<string>, conflicts:Array<string>}}
 */
function planRowFill(existing, fields) {
  var fill = [], conflicts = [];
  Object.keys(fields).forEach(function (k) {
    var f = fields[k];
    var type = FIELD_BY_KEY[k].type;
    if (type === 'formula' || type === 'link') return;
    if (isBlank(existing[k])) {
      if (!isBlank(f.value) || f.flags.length) fill.push(k);
    } else if (!isBlank(f.value) && compareKey(k, existing[k]) !== compareKey(k, f.value)) {
      conflicts.push(k);
    }
  });
  return { fill: fill, conflicts: conflicts };
}

/**
 * Gemini の 429 応答を読み、上限の種類と日本語の説明を返す。
 * @return {{scope:'minute'|'day'|'zero'|'unknown', retryDelaySec:number, message:string}}
 */
function parseGeminiQuotaError(text, model) {
  var body = {};
  try { body = JSON.parse(text) || {}; } catch (e) { body = {}; }
  var err = body.error || {};
  var raw = String(err.message || text || '');
  var retryDelaySec = 0, violations = [];
  (err.details || []).forEach(function (d) {
    var type = String(d['@type'] || '');
    if (/RetryInfo$/.test(type) && d.retryDelay) retryDelaySec = parseFloat(String(d.retryDelay)) || 0;
    if (/QuotaFailure$/.test(type)) {
      (d.violations || []).forEach(function (v) {
        violations.push({
          id: String(v.quotaId || '') + ' ' + String(v.quotaMetric || ''),
          metric: String(v.quotaMetric || ''),
          limit: (v.quotaValue === undefined || v.quotaValue === '') ? null : Number(v.quotaValue)
        });
      });
    }
  });
  if (!retryDelaySec) {
    var r = raw.match(/retry in ([\d.]+)s/i);
    if (r) retryDelaySec = parseFloat(r[1]);
  }
  if (!violations.length) {
    var re = /metric:\s*([^\s,]+)[^\n]*?limit:\s*(\d+)/g, m;
    while ((m = re.exec(raw))) violations.push({ id: m[1], metric: m[1], limit: Number(m[2]) });
  }
  // 複数の上限に同時に当たった場合は、回復に時間がかかる方を優先する
  var pick = function (test) { return violations.filter(test)[0]; };
  var hit = pick(function (v) { return v.limit === 0; });
  var scope = hit ? 'zero' : 'unknown';
  if (!hit) { hit = pick(function (v) { return /PerDay|per_day|daily/i.test(v.id); }); if (hit) scope = 'day'; }
  if (!hit) { hit = pick(function (v) { return /PerMinute|per_minute/i.test(v.id); }); if (hit) scope = 'minute'; }
  if (!hit && retryDelaySec > 0 && retryDelaySec <= 120) scope = 'minute';
  hit = hit || violations[0] || { metric: '', limit: null };

  var message;
  if (scope === 'zero') {
    message = 'Gemini APIの上限：このAPIキーのプロジェクトでは、モデル「' + model + '」の無料枠がありません（上限0）。課金を有効にするか、セットアップでモデルを変更してください';
  } else if (scope === 'day') {
    message = 'Gemini APIの上限：1日あたりの上限に達しました（日本時間の16〜17時ごろに回復）';
  } else if (scope === 'minute') {
    message = 'Gemini APIの上限：1分あたりの上限に達しました。次回の実行で続きを読み取ります';
  } else {
    message = 'Gemini APIの上限に達しました（' + raw.substring(0, 200) + '）';
  }
  if (hit.metric) message += '［' + hit.metric + (hit.limit !== null ? '・上限' + hit.limit : '') + '］';
  return { scope: scope, retryDelaySec: retryDelaySec, message: message };
}

// =====================================================================
// 4. メニュー・画面表示
// =====================================================================

function onOpen() {
  SpreadsheetApp.getUi().createMenu(MENU_NAME)
    .addItem('初期セットアップ／設定変更', 'showSetup')
    .addItem('プルダウン選択肢の編集', 'showLists')
    .addSeparator()
    .addItem('受付フォルダの書類を今すぐ読み取り', 'readInboxFromMenu')
    .addItem('車検証リンクを更新', 'updateCertLinksFromMenu')
    .addItem('エラーフォルダの書類を受付に戻す', 'restoreErrorFilesFromMenu')
    .addSeparator()
    .addItem('ステータスが販売済みの行を販売済みシートへ移動', 'moveSoldRowsFromMenu')
    .addItem('既存データの一括整形・販売済みシートの列統一', 'showCleanup')
    .addToUi();
}

function showSetup() {
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('Setup').setWidth(560).setHeight(720), '初期セットアップ／設定変更');
}

function showLists() {
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('Lists').setWidth(760).setHeight(680), 'プルダウン選択肢の編集');
}

function showCleanup() {
  SpreadsheetApp.getUi().showModelessDialog(HtmlService.createHtmlOutputFromFile('Cleanup').setWidth(980).setHeight(740), '既存データの一括整形・列統一');
}

function readInboxFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var result = readInbox_({ manual: true });
  ui.alert('自動読み取り', result.message, ui.ButtonSet.OK);
}

function updateCertLinksFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var n = updateCertLinks_();
  ui.alert('車検証リンクを更新', n + '件のリンクを設定しました。', ui.ButtonSet.OK);
}

function moveSoldRowsFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var ss = getSpreadsheet_();
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
  var total = targets.reduce(function (s, t) { return s + t.rows.length; }, 0);
  if (!total) { ui.alert('ステータスが「販売済み」の行はありません。'); return; }
  if (ui.alert('販売済みシートへ移動', total + '行を販売済みシートへ移動します。よろしいですか？', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  targets.forEach(function (t) { moveRowsToSold_(ss, ss.getSheetByName(t.name), t.rows); });
  ui.alert(total + '行を販売済みシートへ移動しました。');
}

// =====================================================================
// 5. 設定（スクリプトプロパティ・設定シート）
// =====================================================================

var PROP = {
  COMPANY: 'COMPANY_NAME',
  GEMINI_KEY: 'GEMINI_API_KEY',
  GEMINI_MODEL: 'GEMINI_MODEL',
  GEMINI_INTERVAL: 'GEMINI_MIN_INTERVAL_SEC',
  GEMINI_LAST_CALL: 'GEMINI_LAST_CALL_MS',
  DAILY_LIMIT: 'DAILY_READ_LIMIT',
  DAILY_COUNT: 'DAILY_READ_COUNT_', // + yyyyMMdd
  READ_CERT: 'READ_CERT',
  UNKNOWN_TARGET: 'UNKNOWN_TARGET_SHEET',
  EXPIRY_DAYS: 'EXPIRY_WARNING_DAYS',
  FOLDER_ROOT: 'FOLDER_ROOT',
  FOLDER_INBOX: 'FOLDER_INBOX',
  FOLDER_DONE: 'FOLDER_DONE',
  FOLDER_ERROR: 'FOLDER_ERROR',
  FOLDER_CERT: 'FOLDER_CERT',
  TRIGGER_MINUTES: 'TRIGGER_MINUTES',
  OCN_LAST: 'OCN_LAST_ISSUED'
};

var SETTING_DEFAULTS = {
  GEMINI_MODEL: 'gemini-2.5-flash',
  GEMINI_MIN_INTERVAL_SEC: '7',
  DAILY_READ_LIMIT: '20',
  READ_CERT: 'false',
  UNKNOWN_TARGET_SHEET: SHEET.IMPORT_MASTER,
  EXPIRY_WARNING_DAYS: '30',
  TRIGGER_MINUTES: '60'
};

function getSettings_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  function get(key) {
    var v = props[key];
    return (v === undefined || v === null || v === '') ? (SETTING_DEFAULTS[key] || '') : v;
  }
  return {
    company: get(PROP.COMPANY),
    geminiKey: get(PROP.GEMINI_KEY),
    geminiModel: get(PROP.GEMINI_MODEL),
    geminiIntervalSec: Math.max(0, Number(get(PROP.GEMINI_INTERVAL)) || 0),
    dailyLimit: Math.max(0, Number(get(PROP.DAILY_LIMIT)) || 0),
    readCert: get(PROP.READ_CERT) === 'true',
    unknownTarget: get(PROP.UNKNOWN_TARGET),
    expiryDays: Math.max(0, Number(get(PROP.EXPIRY_DAYS)) || 0),
    folderRoot: get(PROP.FOLDER_ROOT),
    folderInbox: get(PROP.FOLDER_INBOX),
    folderDone: get(PROP.FOLDER_DONE),
    folderError: get(PROP.FOLDER_ERROR),
    folderCert: get(PROP.FOLDER_CERT),
    triggerMinutes: Number(get(PROP.TRIGGER_MINUTES)) || 0
  };
}

function requireFolders_(settings) {
  var missing = [];
  if (!settings.folderInbox) missing.push('受付フォルダ');
  if (!settings.folderDone) missing.push('処理済みフォルダ');
  if (!settings.folderError) missing.push('エラーフォルダ');
  if (!settings.folderCert) missing.push('車検証保管フォルダ');
  if (missing.length) throw new Error('初期セットアップが完了していません（未設定：' + missing.join('、') + '）');
}

/** 設定シートの列配置（メーカー・別名・色・別名・担当者・本人確認方法・地域名） */
function settingsLayout_() {
  var pos = {}, headers = [], col = 0;
  LIST_COLUMNS.forEach(function (c) {
    pos[c.list] = { value: col };
    headers.push(c.label);
    col++;
    if (c.aliasLabel) { pos[c.list].alias = col; headers.push(c.aliasLabel); col++; }
  });
  return { pos: pos, headers: headers, width: col };
}

/**
 * 設定シートからプルダウンの選択肢を読む。
 * @return {Object} list名 → [{value, aliases}]（区分・ステータスは固定の選択肢）
 */
function readLists_(ss) {
  var lists = {
    category: CATEGORY_OPTIONS.map(function (v) { return { value: v, aliases: [] }; }),
    status: STATUS_OPTIONS.map(function (v) { return { value: v, aliases: [] }; })
  };
  LIST_COLUMNS.forEach(function (c) { lists[c.list] = []; });
  var sheet = (ss || getSpreadsheet_()).getSheetByName(SHEET.SETTINGS);
  if (!sheet || sheet.getLastRow() < 2) return lists;
  var layout = settingsLayout_();
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, layout.width).getValues();
  LIST_COLUMNS.forEach(function (c) {
    var pos = layout.pos[c.list];
    values.forEach(function (row) {
      var v = row[pos.value];
      if (isBlank(v)) return;
      var aliases = pos.alias === undefined ? [] : splitAliases_(row[pos.alias]);
      lists[c.list].push({ value: String(v).trim(), aliases: aliases });
    });
  });
  return lists;
}

function splitAliases_(text) {
  return String(text || '').split(/[,、，]/).map(function (a) { return a.trim(); }).filter(function (a) { return a; });
}

/** 選択肢編集画面：現在の選択肢を「値: 別名,別名」の行テキストで返す */
function getListsForEdit() {
  var lists = readLists_();
  var out = {};
  LIST_COLUMNS.forEach(function (c) {
    out[c.list] = lists[c.list].map(function (e) {
      return c.aliasLabel && e.aliases.length ? e.value + ': ' + e.aliases.join(',') : e.value;
    }).join('\n');
  });
  return { lists: out, columns: LIST_COLUMNS, company: getSettings_().company };
}

/** 選択肢編集画面：保存（値のカタカナは半角カナに揃える。別名は変換用なので原文のまま） */
function saveLists(input) {
  var ss = getSpreadsheet_();
  var sheet = ensureSettingsSheet_(ss, []);
  var layout = settingsLayout_();
  var columns = {}, maxRows = 0;
  LIST_COLUMNS.forEach(function (c) {
    var seen = {};
    var entries = String(input[c.list] || '').split(/\r?\n/).map(function (line) {
      var at = line.search(/[:：]/);
      var head = at === -1 ? line : line.substring(0, at);
      return { value: normalizeKanaText(head), aliases: c.aliasLabel && at !== -1 ? splitAliases_(line.substring(at + 1)) : [] };
    }).filter(function (e) {
      if (!e.value || seen[e.value]) return false;
      seen[e.value] = true;
      return true;
    });
    columns[c.list] = entries;
    maxRows = Math.max(maxRows, entries.length);
  });
  var lastRow = Math.max(sheet.getLastRow(), 2);
  sheet.getRange(2, 1, lastRow - 1, layout.width).clearContent();
  if (maxRows) {
    var grid = [];
    for (var r = 0; r < maxRows; r++) {
      var row = [];
      for (var i = 0; i < layout.width; i++) row.push('');
      LIST_COLUMNS.forEach(function (c) {
        var e = columns[c.list][r];
        if (!e) return;
        row[layout.pos[c.list].value] = e.value;
        if (layout.pos[c.list].alias !== undefined) row[layout.pos[c.list].alias] = e.aliases.join(',');
      });
      grid.push(row);
    }
    ensureRows_(sheet, maxRows + 1);
    sheet.getRange(2, 1, maxRows, layout.width).setValues(grid);
  }
  var counts = LIST_COLUMNS.map(function (c) { return c.label + ' ' + columns[c.list].length + '件'; }).join('、');
  appendLog_('設定', '選択肢', '', '', '', counts);
  return { ok: true, message: '保存しました（' + counts + '）' };
}

// =====================================================================
// 6. シート共通処理
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

function todayJst_() {
  var s = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd').split('/');
  return new Date(Number(s[0]), Number(s[1]) - 1, Number(s[2]));
}

/** 3シートを読み、OCN・車台番号・登録番号で車両を引ける索引を作る */
function buildVehicleIndex_(ss) {
  var index = { byOcn: {}, byChassis: {}, byPlate: {}, ocns: [] };
  VEHICLE_SHEETS.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;
    var cols = getColumns_(sheet).map;
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    values.forEach(function (row, i) {
      var rec = { sheet: name, row: i + 2, values: {} };
      FIELDS.forEach(function (f) { if (cols[f.key] !== undefined) rec.values[f.key] = row[cols[f.key]]; });
      if (!isBlank(rec.values.ocn)) {
        index.ocns.push(rec.values.ocn);
        var n = parseOcnNumber(rec.values.ocn);
        if (n !== null) index.byOcn[n] = rec;
      }
      var ck = compareKey('chassisNumber', rec.values.chassisNumber);
      if (ck) index.byChassis[ck] = rec;
      var pk = plateKey_(rec.values);
      if (pk) index.byPlate[pk] = rec;
    });
  });
  return index;
}

function plateKey_(v) {
  if (isBlank(v.plateNumber) || isBlank(v.plateRegion)) return '';
  return [compareKey('plateRegion', v.plateRegion), compareKey('plateClass', v.plateClass),
    compareKey('plateKana', v.plateKana), compareKey('plateNumber', v.plateNumber)].join('|');
}

/** 次のOCNを予約する（会社単位・輸入車／国産車共通の連番）。呼び出し側でロックを取る */
function reserveOcn_(ss) {
  var props = PropertiesService.getScriptProperties();
  var n = nextOcnNumber(buildVehicleIndex_(ss).ocns, props.getProperty(PROP.OCN_LAST));
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
// 7. セットアップ
// =====================================================================

function getSetupState() {
  var s = getSettings_();
  return {
    company: s.company, hasGeminiKey: !!s.geminiKey, geminiModel: s.geminiModel,
    geminiIntervalSec: s.geminiIntervalSec, dailyLimit: s.dailyLimit, readCert: s.readCert,
    unknownTarget: s.unknownTarget, expiryDays: s.expiryDays,
    folderRoot: s.folderRoot, folderInbox: s.folderInbox, folderDone: s.folderDone,
    folderError: s.folderError, folderCert: s.folderCert, triggerMinutes: s.triggerMinutes,
    masterSheets: MASTER_SHEETS, todayCount: getDailyCount_(),
    spreadsheetName: getSpreadsheet_().getName()
  };
}

/**
 * セットアップ。既存シート・既存データは上書きせず、不足分だけを追加する。
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
    values[PROP.GEMINI_MODEL] = String(form.geminiModel || SETTING_DEFAULTS.GEMINI_MODEL).trim();
    values[PROP.GEMINI_INTERVAL] = String(Math.max(0, Number(form.geminiIntervalSec) || 0));
    values[PROP.DAILY_LIMIT] = String(Math.max(0, Number(form.dailyLimit) || 0));
    values[PROP.READ_CERT] = form.readCert ? 'true' : 'false';
    values[PROP.UNKNOWN_TARGET] = MASTER_SHEETS.indexOf(form.unknownTarget) !== -1 ? form.unknownTarget : SHEET.IMPORT_MASTER;
    values[PROP.EXPIRY_DAYS] = String(Math.max(0, Number(form.expiryDays) || 0));
    values[PROP.TRIGGER_MINUTES] = String(Number(form.triggerMinutes) || 0);
    if (!isBlank(form.geminiKey)) {
      values[PROP.GEMINI_KEY] = String(form.geminiKey).trim();
      report.push('Gemini APIキーをスクリプトプロパティに保存しました');
    }
    props.setProperties(values);

    setupFolders_(form, report);
    var settingsSheet = ensureSettingsSheet_(ss, report);
    VEHICLE_SHEETS.forEach(function (name) { ensureVehicleSheet_(ss, name, report); });
    ensureLogSheet_(ss);
    applyAllSheetStandards_(ss, settingsSheet, report);

    if (!props.getProperty(PROP.OCN_LAST)) {
      var max = nextOcnNumber(buildVehicleIndex_(ss).ocns, 0) - 1;
      props.setProperty(PROP.OCN_LAST, String(max));
      report.push('OCNの採番を初期化しました（次の番号：' + (max + 1) + '）');
    }
    setupTriggers_(Number(form.triggerMinutes) || 0, report);
    appendLog_('セットアップ', ss.getName(), '', '', '', report.join(' / '));
    return { ok: true, report: report };
  } finally {
    lock.releaseLock();
  }
}

function setupFolders_(form, report) {
  var props = PropertiesService.getScriptProperties();
  var company = String(form.company).trim();
  var defs = [
    { prop: PROP.FOLDER_INBOX, input: form.folderInbox, name: '受付' },
    { prop: PROP.FOLDER_DONE, input: form.folderDone, name: '処理済み' },
    { prop: PROP.FOLDER_ERROR, input: form.folderError, name: 'エラー' },
    { prop: PROP.FOLDER_CERT, input: form.folderCert, name: '車検証保管' }
  ];
  var root = null;
  function getRoot() {
    if (root) return root;
    var rootId = extractDriveId_(form.folderRoot) || props.getProperty(PROP.FOLDER_ROOT);
    if (rootId) {
      root = DriveApp.getFolderById(rootId);
    } else {
      root = DriveApp.createFolder('中古車書類_' + company);
      report.push('ドライブにフォルダを作成しました：' + root.getName());
    }
    props.setProperty(PROP.FOLDER_ROOT, root.getId());
    return root;
  }
  defs.forEach(function (d) {
    var id = extractDriveId_(d.input) || props.getProperty(d.prop);
    if (id) {
      props.setProperty(d.prop, DriveApp.getFolderById(id).getId()); // 存在確認（無ければ例外）
      return;
    }
    var parent = getRoot();
    var it = parent.getFoldersByName(d.name);
    props.setProperty(d.prop, (it.hasNext() ? it.next() : parent.createFolder(d.name)).getId());
    report.push('フォルダ「' + d.name + '」を設定しました');
  });
}

/** フォルダURL・ID のどちらでも受け付ける */
function extractDriveId_(input) {
  if (isBlank(input)) return '';
  var s = String(input).trim();
  var m = s.match(/\/folders\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/) || s.match(/\/d\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : s;
}

/** 設定シート（プルダウンの選択肢）。無ければ初期値で作成し、あれば触らない */
function ensureSettingsSheet_(ss, report) {
  var sheet = ss.getSheetByName(SHEET.SETTINGS);
  if (sheet) return sheet;
  var layout = settingsLayout_();
  sheet = ss.insertSheet(SHEET.SETTINGS);
  sheet.getRange(1, 1, 1, layout.width).setValues([layout.headers]).setFontWeight('bold').setBackground('#eef3f0');
  sheet.setFrozenRows(1);
  var maxRows = 0;
  LIST_COLUMNS.forEach(function (c) { maxRows = Math.max(maxRows, DEFAULT_LISTS[c.list].length); });
  if (maxRows) {
    var grid = [];
    for (var r = 0; r < maxRows; r++) {
      var row = [];
      for (var i = 0; i < layout.width; i++) row.push('');
      LIST_COLUMNS.forEach(function (c) {
        var e = DEFAULT_LISTS[c.list][r];
        if (!e) return;
        row[layout.pos[c.list].value] = normalizeKanaText(e[0]);
        if (layout.pos[c.list].alias !== undefined) row[layout.pos[c.list].alias] = e[1] || '';
      });
      grid.push(row);
    }
    ensureRows_(sheet, maxRows + 1);
    sheet.getRange(2, 1, maxRows, layout.width).setValues(grid);
  }
  sheet.getRange(1, 1).setNote('この列の内容が各シートのプルダウンになります。メニュー「プルダウン選択肢の編集」からも編集できます。');
  report.push('シート「' + SHEET.SETTINGS + '」を作成しました（選択肢は案です。企画書 第11章で確定したら編集してください）');
  return sheet;
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
    report.push('「' + name + '」の列配置が標準（A〜AC）と異なります。メニュー「既存データの一括整形・販売済みシートの列統一」で列統一を実行してください');
    return sheet;
  }
  var res = resolveColumns(headers);
  if (res.missing.length) {
    var labels = res.missing.map(function (k) { return FIELD_BY_KEY[k].label; });
    sheet.getRange(1, headers.length + 1, 1, labels.length).setValues([labels]).setFontWeight('bold');
    report.push('「' + name + '」に不足していた列を右端に追加しました：' + labels.join('、'));
  }
  if (!isStandardLayout(getHeaders_(sheet))) {
    report.push('「' + name + '」の列順が標準（A〜AC）と異なります（見出し名で列を特定するので動作はします）');
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

/** 3シートに書式・プルダウン・保護・条件付き書式・計算式を設定する */
function applyAllSheetStandards_(ss, settingsSheet, report) {
  var settings = getSettings_();
  var colMaps = {};
  VEHICLE_SHEETS.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (sheet) colMaps[name] = getColumns_(sheet).map;
  });
  Object.keys(colMaps).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    applySheetStandards_(sheet, colMaps[name], settingsSheet || ss.getSheetByName(SHEET.SETTINGS), report);
    applyCheckRules_(sheet, buildCheckRules(name, colMaps, settings.expiryDays));
  });
  report.push('日付・金額・走行距離の表示形式、プルダウン、入力チェックの色分けを設定しました');
}

function applySheetStandards_(sheet, cols, settingsSheet, report) {
  var rows = Math.max(sheet.getMaxRows() - 1, 1);
  var layout = settingsLayout_();
  FIELDS.forEach(function (f) {
    var c = cols[f.key];
    if (c === undefined) return;
    var range = sheet.getRange(2, c + 1, rows, 1);
    if (NUMBER_FORMATS[f.type]) range.setNumberFormat(NUMBER_FORMATS[f.type]);
    if (f.key === 'tradeInLoss' || f.key === 'purchasePrice') range.setNumberFormat('#,##0');
    var rule = null;
    if (f.type === 'date') {
      rule = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(true).build(); // カレンダーで選べる
    } else if (f.type === 'list') {
      // 表記ゆれは入力時に自動で選択肢へ変換するため、入力自体は拒否しない（選択肢外は警告表示）
      if (f.list === 'category') rule = SpreadsheetApp.newDataValidation().requireValueInList(CATEGORY_OPTIONS, true).setAllowInvalid(true).build();
      else if (f.list === 'status') rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUS_OPTIONS, true).setAllowInvalid(true).build();
      else if (settingsSheet) {
        var letter = columnLetter(layout.pos[f.list].value + 1);
        rule = SpreadsheetApp.newDataValidation()
          .requireValueInRange(settingsSheet.getRange(letter + '2:' + letter), true).setAllowInvalid(true).build();
      }
    }
    if (rule) range.setDataValidation(rule);
  });

  // 見出し行と OCN 列の保護（警告表示のみ）
  var existing = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).map(function (p) { return p.getDescription(); });
  if (existing.indexOf('見出し行の保護') === -1) {
    sheet.getRange(1, 1, 1, sheet.getMaxColumns()).protect().setDescription('見出し行の保護').setWarningOnly(true);
  }
  if (cols.ocn !== undefined && existing.indexOf('OCNの保護') === -1) {
    sheet.getRange(2, cols.ocn + 1, rows, 1).protect().setDescription('OCNの保護').setWarningOnly(true);
  }

  // 計算式の列：見出し行に ARRAYFORMULA（既存の式・値がある列は切り替えない）
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
    var label = '「' + sheet.getName() + '」の' + f.label + '：';
    var formula = buildArrayFormula(f.key, cols);
    if (!formula) { report.push(label + '計算式が未確定のため設定していません（企画書 第11章）'); return; }
    header.setFormula(formula);
    report.push(label + '見出し行に ARRAYFORMULA を設定しました');
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

function setupTriggers_(minutes, report) {
  var ss = getSpreadsheet_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (h === 'scheduledRun' || h === 'handleEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('handleEdit').forSpreadsheet(ss).onEdit().create();
  report.push('入力時の自動整形（編集トリガー）を設定しました');
  if (!minutes) { report.push('自動読み取り・車検証リンクの定期実行：なし（メニューから手動）'); return; }
  var builder = ScriptApp.newTrigger('scheduledRun').timeBased();
  if (minutes >= 60) builder.everyHours(Math.max(1, Math.round(minutes / 60)));
  else builder.everyMinutes([1, 5, 10, 15, 30].filter(function (m) { return m <= minutes; }).pop() || 5);
  builder.create();
  report.push('自動読み取り・車検証リンクの定期実行を設定しました（' + minutes + '分ごと）');
}

// =====================================================================
// 8. 入力時の自動整形（onEdit）・OCN採番・販売済みへの移動
// =====================================================================

/**
 * 編集トリガー（セットアップで設定するインストール型トリガー）。
 * 確定した値を正しい書式に整え、OCNを採番し、ステータスが販売済みになった行を移動する。
 * 複数セルの貼り付けにも対応する。
 */
function handleEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  var name = sheet.getName();
  if (VEHICLE_SHEETS.indexOf(name) === -1) return;
  var range = e.range;
  if (range.getRow() === 1) {
    if (range.getNumRows() === 1) return; // 見出し行
    range = range.offset(1, 0, range.getNumRows() - 1);
  }
  if (range.getNumRows() > 2000) return; // 大量の貼り付けは一括整形で
  var startRow = range.getRow(), startCol = range.getColumn();

  var ss = sheet.getParent();
  var cols = getColumns_(sheet).map;
  var fieldAt = {};
  FIELDS.forEach(function (f) { if (cols[f.key] !== undefined) fieldAt[cols[f.key] + 1] = f; });
  var lists = readLists_(ss);
  var values = range.getValues();
  var numRows = values.length, numCols = values[0].length;

  // 1) 自動整形（変わった列だけ書き戻す。計算式・リンク・OCN列は触らない）
  for (var c = 0; c < numCols; c++) {
    var field = fieldAt[startCol + c];
    if (!field || field.type === 'formula' || field.type === 'link' || field.type === 'ocn') continue;
    var changed = false;
    var column = [];
    for (var r = 0; r < numRows; r++) {
      var res = normalizeCellValue(field, values[r][c], lists);
      column.push([res.value]);
      if (res.changed) { changed = true; values[r][c] = res.value; }
    }
    if (changed) sheet.getRange(startRow, startCol + c, numRows, 1).setValues(column);
  }

  // 2) 人が直した自動読み取りのセルは、色とメモを外す
  var notes = range.getNotes();
  for (var nr = 0; nr < numRows; nr++) {
    for (var nc = 0; nc < numCols; nc++) {
      if (String(notes[nr][nc]).indexOf(AUTO_NOTE_PREFIX) === 0) {
        sheet.getRange(startRow + nr, startCol + nc).setNote(null).setBackground(null);
      }
    }
  }

  // 3) OCN の自動採番（車台番号・車種・モデル名のいずれかが入った行で、OCNが空欄なら）
  if (cols.ocn !== undefined) assignMissingOcns_(ss, sheet, cols, startRow, numRows);

  // 4) ステータスが「販売済み」になった行は、確認のうえ販売済みシートへ移動
  if (MASTER_SHEETS.indexOf(name) !== -1 && cols.status !== undefined) {
    var sc = cols.status + 1;
    if (sc >= startCol && sc < startCol + numCols) {
      var soldRows = [];
      for (var sr = 0; sr < numRows; sr++) if (values[sr][sc - startCol] === STATUS_SOLD) soldRows.push(startRow + sr);
      if (soldRows.length) confirmAndMoveSold_(ss, sheet, soldRows, e.oldValue);
    }
  }
}

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
  if (!lock.tryLock(20000)) return;
  try {
    targets.forEach(function (row) {
      var cell = sheet.getRange(row, cols.ocn + 1);
      if (isBlank(cell.getValue())) cell.setValue(reserveOcn_(ss));
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
    // 確認画面を出せない場合（トリガーの設定者以外の編集など）は移動せず、メニューからの移動を案内する
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
// 9. 自動読み取り（Gemini：1ファイル＝1回まで）
// =====================================================================

/** 時間主導トリガー：自動読み取り → 車検証リンクの更新 */
function scheduledRun() {
  try {
    readInbox_({ manual: false });
  } catch (e) {
    appendLog_('エラー', '定期実行', '自動読み取り', '', '', e.message);
  }
  try {
    updateCertLinks_();
  } catch (e2) {
    appendLog_('エラー', '定期実行', '車検証リンク', '', '', e2.message);
  }
}

function dailyCountKey_() {
  return PROP.DAILY_COUNT + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
}

function getDailyCount_() {
  return Number(PropertiesService.getScriptProperties().getProperty(dailyCountKey_())) || 0;
}

function addDailyCount_(delta) {
  var props = PropertiesService.getScriptProperties();
  var key = dailyCountKey_();
  var n = Math.max(0, (Number(props.getProperty(key)) || 0) + delta);
  props.setProperty(key, String(n));
  Object.keys(props.getProperties()).forEach(function (k) {
    if (k.indexOf(PROP.DAILY_COUNT) === 0 && k !== key) props.deleteProperty(k); // 前日以前のカウンタ
  });
  return n;
}

/**
 * 受付フォルダの書類を読み取る。1ファイルにつき Gemini は1回だけ呼び、
 * 1日の処理上限・回数制限エラーで止まったら、残りは受付フォルダに残して次回に回す。
 */
function readInbox_(opts) {
  var started = Date.now();
  var settings = getSettings_();
  requireFolders_(settings);
  if (!settings.geminiKey) return { message: 'Gemini APIキーが未設定のため、自動読み取りは行いませんでした。' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(opts.manual ? 30000 : 1000)) return { message: '他の処理が実行中です。しばらくしてから再実行してください。' };
  var done = 0, failed = 0, stopReason = '';
  var lines = [];
  try {
    var files = listInboxFiles_(settings);
    for (var i = 0; i < files.length; i++) {
      if (Date.now() - started > RUN_BUDGET_MS) { stopReason = '1回の実行時間の上限'; break; }
      if (settings.dailyLimit && getDailyCount_() >= settings.dailyLimit) { stopReason = '1日の処理上限（' + settings.dailyLimit + '件）。残りは翌日に読み取ります'; break; }
      var r = processInboxFile_(files[i], settings);
      lines.push(r.message);
      if (r.quota) { stopReason = r.message; break; }
      if (r.ok) done++; else failed++;
    }
  } finally {
    lock.releaseLock();
  }
  var remaining = listInboxFiles_(settings).length;
  var summary = '読み取り ' + done + '件・エラー ' + failed + '件・受付フォルダの残り ' + remaining + '件・本日の読み取り ' +
    getDailyCount_() + (settings.dailyLimit ? '／' + settings.dailyLimit : '') + '回' + (stopReason ? '（停止：' + stopReason + '）' : '');
  if (done || failed || stopReason || opts.manual) appendLog_('自動読み取り', '受付フォルダ', '', '', '', summary);
  return { message: summary + (lines.length ? '\n\n' + lines.join('\n') : '') };
}

function listInboxFiles_(settings) {
  var it = DriveApp.getFolderById(settings.folderInbox).getFiles();
  var files = [];
  while (it.hasNext()) files.push(it.next());
  files.sort(function (a, b) { return a.getDateCreated().getTime() - b.getDateCreated().getTime(); });
  return files;
}

function processInboxFile_(file, settings) {
  var name = file.getName();
  try {
    var blob = file.getBlob();
    var mime = blob.getContentType();
    if (SUPPORTED_MIME_TYPES.indexOf(mime) === -1) throw new Error('対応していないファイル形式です（' + mime + '）');
    if (blob.getBytes().length > MAX_FILE_BYTES) throw new Error('ファイルが大きすぎます（18MBまで）');

    addDailyCount_(1);
    var docs;
    try {
      docs = callGemini_(blob, settings);
    } catch (e) {
      if (e.quota) addDailyCount_(-1); // 上限エラー・一時エラーは回数に含めない
      throw e;
    }
    var ss = getSpreadsheet_();
    var record = buildReadRecord(docs, { lists: readLists_(ss), today: todayJst_(), readCert: settings.readCert });
    if (record.skipped) {
      file.moveTo(DriveApp.getFolderById(settings.folderError));
      appendLog_('読み取り対象外', name, '', '', '', record.skipped);
      return { ok: false, message: name + '：' + record.skipped + ' → エラーフォルダへ' };
    }
    var result = writeReadRecord_(ss, settings, record, file);
    appendLog_('自動読み取り', name, record.docTypes.join('・'), '', 'OCN ' + result.ocn, result.message);
    return { ok: true, message: name + '：' + result.message };
  } catch (e) {
    if (e.quota) {
      appendLog_('API上限', name, '', '', '', e.message);
      return { ok: false, quota: true, message: e.message + '（' + name + ' は受付フォルダに残しています）' };
    }
    try { file.moveTo(DriveApp.getFolderById(settings.folderError)); } catch (moveErr) { console.error(moveErr); }
    appendLog_('エラー', name, '自動読み取り', '', '', e.message);
    return { ok: false, message: name + '：エラー（' + e.message + '）→ エラーフォルダへ' };
  }
}

/**
 * 読み取り結果をマスタへ書く。
 *  - 車台番号（無ければ登録番号）が一致する既存行があれば、新しい行は作らず空欄の項目だけを埋める
 *  - 無ければ新しい行を追加し、OCN を採番する
 *  - 自動で入れたセルは水色＋メモ、疑わしい値・読めなかった項目は黄色＋メモ
 */
function writeReadRecord_(ss, settings, record, file) {
  var index = buildVehicleIndex_(ss);
  var ck = compareKey('chassisNumber', record.fields.chassisNumber && record.fields.chassisNumber.value);
  var plateVals = {};
  ['plateRegion', 'plateClass', 'plateKana', 'plateNumber'].forEach(function (k) { plateVals[k] = record.fields[k] ? record.fields[k].value : ''; });
  var pk = plateKey_(plateVals);
  var target = (ck && index.byChassis[ck]) || (pk && index.byPlate[pk]) || null;
  var stamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
  var source = record.docTypes.join('・');
  var sheet, cols, row, ocn, message;

  if (target) {
    sheet = ss.getSheetByName(target.sheet);
    cols = getColumns_(sheet).map;
    row = target.row;
    ocn = target.values.ocn;
    var plan = planRowFill(target.values, record.fields);
    plan.fill.forEach(function (k) { writeMarkedCell_(sheet, cols, row, k, record.fields[k], stamp, source); });
    plan.conflicts.forEach(function (k) {
      if (cols[k] === undefined) return;
      var cell = sheet.getRange(row, cols[k] + 1);
      cell.setNote(AUTO_NOTE_PREFIX + '・要確認 ' + stamp + ' ' + source + '］読み取り値「' + displayValue_(record.fields[k].value) +
        '」が入力済みの値と異なります（入力済みの値を残しています）');
      if (k === 'chassisNumber' || k.indexOf('plate') === 0) cell.setBackground(COLOR_CHECK);
    });
    message = target.sheet + ' ' + row + '行目（OCN ' + ocn + '）の空欄 ' + plan.fill.length + '項目を埋めました' +
      (plan.conflicts.length ? '・入力済みと異なる値 ' + plan.conflicts.length + '項目' : '');
  } else {
    var sheetName = record.kind === 'domestic' ? SHEET.DOMESTIC_MASTER : (record.kind === 'import' ? SHEET.IMPORT_MASTER : settings.unknownTarget);
    sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error('「' + sheetName + '」シートがありません。初期セットアップを実行してください');
    cols = getColumns_(sheet).map;
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) throw new Error('他の処理が実行中です');
    try {
      row = lastDataRow_(sheet, cols) + 1;
      ensureRows_(sheet, row);
      copyRowFormulas_(sheet, cols, row);
      ocn = reserveOcn_(ss);
      sheet.getRange(row, cols.ocn + 1).setValue(ocn);
    } finally {
      lock.releaseLock();
    }
    if (cols.purchaseDate !== undefined) sheet.getRange(row, cols.purchaseDate + 1).setValue(todayJst_());
    if (cols.status !== undefined) sheet.getRange(row, cols.status + 1).setValue(DEFAULT_STATUS);
    Object.keys(record.fields).forEach(function (k) { writeMarkedCell_(sheet, cols, row, k, record.fields[k], stamp, source); });
    message = sheetName + ' ' + row + '行目に追加しました（OCN ' + ocn + '）' +
      (record.kind === 'unknown' ? '。輸入車／国産車を判別できなかったため、登録先シートを確認してください' : '');
  }

  var flagged = Object.keys(record.fields).filter(function (k) { return record.fields[k].flags.length; });
  if (flagged.length) message += '・要確認：' + flagged.map(function (k) { return FIELD_BY_KEY[k].label; }).join('、');

  // ファイルの整理：車検証は OCN 名にして車検証保管へ（リンク付与）、査定書は処理済みへ
  var ext = (file.getName().match(/\.[A-Za-z0-9]+$/) || ['.pdf'])[0];
  if (record.docTypes.indexOf(DOC.CERT) !== -1) {
    var folder = DriveApp.getFolderById(settings.folderCert);
    file.setName(uniqueName_(folder, String(ocn), ext));
    file.moveTo(folder);
    setCertLink_(sheet, cols, row, file);
  } else {
    file.setName(ocn + '_' + file.getName());
    file.moveTo(DriveApp.getFolderById(settings.folderDone));
  }
  return { ocn: ocn, message: message };
}

function writeMarkedCell_(sheet, cols, row, key, f, stamp, source) {
  var field = FIELD_BY_KEY[key];
  if (!field || field.type === 'formula' || field.type === 'link' || cols[key] === undefined) return;
  var cell = sheet.getRange(row, cols[key] + 1);
  if (cell.getFormula()) return;
  if (!isBlank(f.value)) cell.setValue(f.value);
  if (f.flags.length) {
    cell.setBackground(COLOR_CHECK).setNote(AUTO_NOTE_PREFIX + '・要確認 ' + stamp + ' ' + source + '］' + f.flags.join('／') +
      (f.raw && displayValue_(f.value) !== f.raw ? '（読取値：' + f.raw + '）' : ''));
  } else if (!isBlank(f.value)) {
    cell.setBackground(COLOR_AUTO).setNote(AUTO_NOTE_PREFIX + ' ' + stamp + ' ' + source + '］' +
      (key === 'color' && f.raw && f.raw !== f.value ? '元の色名：' + f.raw : ''));
  }
}

function displayValue_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy/MM/dd');
  return isBlank(v) ? '' : String(v);
}

var GEMINI_PROMPT = [
  'あなたは中古車販売店の書類読み取り担当です。添付ファイルの書類を判別し、記載内容を読み取ってJSONで返してください。',
  '',
  '## 書類の種類（type）',
  '- "査定書"：査定書・査定表',
  '- "車検証"：自動車検査証、または自動車検査証記録事項',
  '- "注文書"：注文書（項目の読み取りは不要。type だけ返す）',
  '- "その他"：上記以外',
  '1つのファイルに複数の書類が含まれる場合は、書類ごとに documents の要素を分けてください。',
  '',
  '## 厳守事項',
  '- 書類に書かれている文字をそのまま転記してください。推測・補完・計算は禁止です。',
  '- 読めない・記載がない項目は value を null、readable を false にしてください。自信のない文字がある場合も readable を false にしてください。',
  '- 車台番号にハイフンが含まれていても、それは車台番号です（国産車の例：ZVW30-1234567）。型式（例：DAA-ZVW30）とは別の欄です。必ず「車台番号」欄の値を返してください。',
  '- 輸入車の車台番号は17桁の英数字です（例：WDD2130042A123456）。',
  '- 日付・金額・走行距離は書類の表記のまま返してください。',
  '- 登録番号（ナンバー）は地域名・分類番号・ひらがな・一連番号の4つに分けてください（例：品川 / 330 / さ / 12-34）。',
  '',
  '## 書類ごとの項目（fields のキー）',
  '査定書: maker(メーカー名), model(車名・モデル名・グレード), chassisNumber(車台番号), mileage(走行距離), color(色名), colorBasic(色を 黒/白/灰/赤/紺/青/緑/黄/茶/その他 のいずれかに分類), plateRegion, plateClass, plateKana, plateNumber, recycleFee(リサイクル預託金), appraisalPrice(査定価格)',
  '車検証: chassisNumber(車台番号), firstRegDate(初度登録年月), inspectionExpiry(有効期間の満了する日), ownerName(所有者の氏名又は名称), ownerAddress(所有者の住所), plateRegion, plateClass, plateKana, plateNumber, certFormat("券面" または "記録事項" または "従来型")',
  '',
  '## 出力形式（JSONのみ）',
  '{"documents":[{"type":"査定書","fields":{"maker":{"value":"...","readable":true}}}]}'
].join('\n');

/** Gemini を1回だけ呼ぶ（再試行しない。回数制限・一時エラーは quota 付きの例外） */
function callGemini_(blob, settings) {
  waitForGeminiSlot_(settings);
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(settings.geminiModel) + ':generateContent';
  var res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-goog-api-key': settings.geminiKey },
    payload: JSON.stringify({
      contents: [{ role: 'user', parts: [
        { text: GEMINI_PROMPT },
        { inline_data: { mime_type: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) } }
      ] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' }
    })
  });
  var code = res.getResponseCode();
  if (code === 200) {
    var body = JSON.parse(res.getContentText());
    var parts = (((body.candidates || [])[0] || {}).content || {}).parts || [];
    return parseGeminiDocuments(parts.map(function (p) { return p.text || ''; }).join(''));
  }
  if (code === 429) {
    var err = new Error(parseGeminiQuotaError(res.getContentText(), settings.geminiModel).message);
    err.quota = true;
    throw err;
  }
  if (code >= 500) {
    var busy = new Error('Gemini API が一時的に応答できません（HTTP ' + code + '）。次回の実行で読み取ります');
    busy.quota = true; // 書類の問題ではないので受付フォルダに残す
    throw busy;
  }
  throw new Error('Gemini API エラー（HTTP ' + code + '）：' + res.getContentText().substring(0, 300));
}

/** 前回の呼び出しから設定の間隔（秒）が空くまで待つ（1分あたりの上限対策） */
function waitForGeminiSlot_(settings) {
  var intervalMs = (settings.geminiIntervalSec || 0) * 1000;
  var props = PropertiesService.getScriptProperties();
  if (intervalMs > 0) {
    var wait = (Number(props.getProperty(PROP.GEMINI_LAST_CALL)) || 0) + intervalMs - Date.now();
    if (wait > 0) Utilities.sleep(Math.min(wait, intervalMs));
  }
  props.setProperty(PROP.GEMINI_LAST_CALL, String(Date.now()));
}

function restoreErrorFilesFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var settings = getSettings_();
  requireFolders_(settings);
  var it = DriveApp.getFolderById(settings.folderError).getFiles();
  var files = [];
  while (it.hasNext()) files.push(it.next());
  if (!files.length) { ui.alert('エラーフォルダに書類はありません。'); return; }
  var answer = ui.alert('エラーフォルダの書類を受付に戻す',
    files.length + '件を受付フォルダに戻します。次の読み取りで再度処理します。よろしいですか？\n\n' +
    files.slice(0, 10).map(function (f) { return '・' + f.getName(); }).join('\n') + (files.length > 10 ? '\n…ほか' + (files.length - 10) + '件' : ''),
    ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) return;
  var inbox = DriveApp.getFolderById(settings.folderInbox);
  files.forEach(function (f) { f.moveTo(inbox); });
  appendLog_('再読み取り', 'エラーフォルダ', '', '', files.length + '件', '受付フォルダに戻しました');
  ui.alert(files.length + '件を受付フォルダに戻しました。');
}

// =====================================================================
// 10. 車検証リンク
// =====================================================================

/** ファイル名の先頭の OCN を取り出す（「12345.pdf」「12345_xxx.pdf」など） */
function ocnFromFileName(name) {
  var m = String(name).match(/^(\d+)(?:[_\-\s.(（]|$)/);
  return m ? Number(m[1]) : null;
}

/** 車検証保管フォルダのファイル名（先頭の OCN）と行を突き合わせ、「車検証ﾘﾝｸ」を付ける */
function updateCertLinks_() {
  var settings = getSettings_();
  requireFolders_(settings);
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
      setCertLink_(sheet, cols, i + 2, byOcn[num].file);
      count++;
    });
  });
  if (count) appendLog_('車検証リンク', '車検証保管フォルダ', '', '', count + '件', 'リンクを設定しました');
  return count;
}

function setCertLink_(sheet, cols, row, file) {
  if (cols.certLink === undefined) return;
  sheet.getRange(row, cols.certLink + 1).setRichTextValue(
    SpreadsheetApp.newRichTextValue().setText(normalizeKanaText('車検証リンク')).setLinkUrl(file.getUrl()).build());
}

function uniqueName_(folder, base, ext) {
  var name = base + ext, n = 2;
  while (folder.getFilesByName(name).hasNext()) name = base + '_' + (n++) + ext;
  return name;
}

// =====================================================================
// 11. 既存データの一括整形・販売済みシートの列統一（企画書 第7章）
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

/** 一括整形画面：ドライラン（変更予定の一覧）。シートには何も書き込まない */
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
 * 一括整形画面：実行。変更のあるシートはバックアップを作ってから書き換える。
 * @param {Object} replacements 列キー → {プルダウン外の値: 置き換え先 | '__KEEP__' | '__ADD__'}
 */
function cleanupExecute(replacements) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('他の処理が実行中です');
  try {
    return runCleanup_(getSpreadsheet_(), replacements || {}, true);
  } finally {
    lock.releaseLock();
  }
}

function runCleanup_(ss, replacements, execute) {
  var lists = readLists_(ss);
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
      if (!values.length || !LIST_COLUMNS.some(function (c) { return c.list === listName; })) return;
      appendListValues_(ss, listName, values);
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
  out.editableLists = LIST_COLUMNS.map(function (c) { return c.list; });
  return out;
}

function appendListValues_(ss, listName, values) {
  var sheet = ensureSettingsSheet_(ss, []);
  var col = settingsLayout_().pos[listName].value + 1;
  var existing = sheet.getLastRow() >= 2 ? sheet.getRange(2, col, sheet.getLastRow() - 1, 1).getValues() : [];
  var last = 1;
  existing.forEach(function (r, i) { if (!isBlank(r[0])) last = i + 2; });
  ensureRows_(sheet, last + values.length);
  sheet.getRange(last + 1, col, values.length, 1).setValues(values.map(function (v) { return [v]; }));
}

/** 一括整形画面：販売済みシートの列統一の実行（バックアップを作ってから並べ替え） */
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
    applyAllSheetStandards_(ss, ss.getSheetByName(SHEET.SETTINGS), report);
    appendLog_('列統一', SHEET.SOLD, '', headers.join(','), outHeaders.join(','), report.join(' / '));
    return { message: report.join('\n') };
  } finally {
    lock.releaseLock();
  }
}

// =====================================================================
// 12. ログ
// =====================================================================

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
