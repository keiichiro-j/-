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
  DASHBOARD: 'ダッシュボード',
  PURCHASE: '仕入集計',
  OLD_SETTINGS: '設定' // 以前の版の設定シート（選択肢をアプリへ移したあと削除する）
};
var MASTER_SHEETS = [SHEET.IMPORT_MASTER, SHEET.DOMESTIC_MASTER];
var VEHICLE_SHEETS = [SHEET.IMPORT_MASTER, SHEET.DOMESTIC_MASTER, SHEET.SOLD];

var STATUS_OPTIONS = ['書類待ち', '車庫証明申請中', '名義変更中', '名義変更済み', '販売済み'];
var CATEGORY_OPTIONS = ['買取', '仕入', '下取', 'オークション'];
var STATUS_SOLD = '販売済み';
var STATUS_TRANSFERRED = '名義変更済み';

/**
 * マスタ・販売済みの列定義（順序 = A〜AC列の標準配置）
 *  type : date | yearMonth（年月だけ。初度登録）| ocn | list | kana（半角カナ・半角英数）| address（英数字のみ半角）| chassis
 *         | mileage | money | plateClass | plateKana | plateNumber | link（自動）| formula（書き込まない）
 *  list : プルダウンの選択肢（設定アプリで管理する選択肢、または固定の選択肢）
 *  format : 列ごとの表示形式（型の既定と違う場合に指定）
 *  aliases : 既存シートの見出しの別表記（列の特定・販売済みシートの列統一に使う）
 */
var FIELDS = [
  { key: 'purchaseDate', label: '仕入年月日', type: 'date', aliases: ['仕入日', '仕入年月'] },
  { key: 'ocn', label: 'OCN', type: 'ocn' },
  { key: 'maker', label: '車種', type: 'list', list: 'maker', aliases: ['メーカー', '車名'] },
  { key: 'modelName', label: 'モデル名', type: 'kana', aliases: ['モデル', 'グレード'] },
  { key: 'chassisNumber', label: '車台番号', type: 'chassis', aliases: ['車体番号'] },
  { key: 'firstRegDate', label: '初度登録日', type: 'yearMonth', aliases: ['初度登録', '初年度登録', '初度登録年月'] },
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
  { key: 'saleDate', label: '売上日', type: 'yearMonth', aliases: ['販売日', '売上年月日', '売上年月'] },
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
 * 列の表示形式。日付は西暦（和暦の表示形式が残っていても上書きする）、初度登録は西暦の年月（yyyy/MM）、
 * 走行距離は「12,345km」、金額は「1,234,000」と表示する（値は日付型・数値のまま）。
 */
var DATE_FORMAT = 'yyyy/MM/dd';
var YEAR_MONTH_FORMAT = 'yyyy/MM';
var MILEAGE_FORMAT = '#,##0"km"';
var MONEY_FORMAT = '#,##0';
var NUMBER_FORMATS = {
  date: DATE_FORMAT,
  yearMonth: YEAR_MONTH_FORMAT,
  ocn: '0',
  mileage: MILEAGE_FORMAT,
  money: MONEY_FORMAT,
  chassis: '@',
  plateClass: '@',
  plateNumber: '@'
};
/** 計算式の列の表示形式（式の結果が数値のとき） */
var FORMULA_FORMATS = {
  inspectionRemain: '0"日"', tradeInAllowance: MONEY_FORMAT, recycleFee: MONEY_FORMAT, tradeInPrice: MONEY_FORMAT,
  appraisalPrice: MONEY_FORMAT, tradeInLoss: MONEY_FORMAT, purchasePrice: MONEY_FORMAT
};

/**
 * 計算式の列の定義。見出し行に ARRAYFORMULA を1つ置く方式で使う。
 * {キー} は該当列の「2行目以降の範囲」（例：G2:G）に置き換わる。null は式が未確定のため設定しない。
 *  - 車検残：車検満了日までの残りの日数（「120日」と表示）。満了日を迎えたら「満了」。毎日自動で更新される
 */
var FORMULA_DEFS = {
  inspectionRemain: 'IFERROR(IF({inspectionExpiry}="",,IF({inspectionExpiry}<=TODAY(),"満了",{inspectionExpiry}-TODAY())),"")',
  tradeInLoss: 'IF(({tradeInAllowance}="")+({tradeInPrice}=""),,{tradeInAllowance}-{tradeInPrice})',
  purchasePrice: null
};

/**
 * 常に自動計算にする列。既存の値・行ごとの式があっても消して、見出し行の ARRAYFORMULA に置き換える
 * （車検残は車検満了日だけで決まるため、手入力の値は残さない）。
 */
var FORCED_FORMULA_KEYS = ['inspectionRemain'];

/**
 * 設定アプリで計算式を設定できる列（X〜AC：下取充当額〜仕入価格）。
 * 列ごとに「未設定（今のまま）／手入力／自動計算（式）」を選ぶ。式は [項目名] と + - * / ( ) 数字で書く。
 *  - 自動計算：見出し行の ARRAYFORMULA にし、その列に入っていた値・式は置き換える
 *  - 手入力：自動計算だった列は、その時点の計算結果を値として残して手入力の列に戻す
 *  - 未設定：以前どおり（下取損・仕入価格は既存の式を使う。空の列にだけ既定の式を置く）
 */
var CALC_KEYS = ['tradeInAllowance', 'recycleFee', 'tradeInPrice', 'appraisalPrice', 'tradeInLoss', 'purchasePrice'];
var CALC_DEFAULT_TYPES = { tradeInAllowance: 'money', recycleFee: 'money', tradeInPrice: 'money', appraisalPrice: 'money', tradeInLoss: 'formula', purchasePrice: 'formula' };
var CALC_DEFAULT_DEFS = { tradeInLoss: FORMULA_DEFS.tradeInLoss, purchasePrice: null };

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

// ----- 見た目（色・列幅） -----

/** ステータスの色（背景・文字）。流れに沿って 赤→黄→青→緑→灰 */
var STATUS_COLORS = {
  '書類待ち': { bg: '#fce8e6', fg: '#a50e0e' },
  '車庫証明申請中': { bg: '#fef7d6', fg: '#7a5c00' },
  '名義変更中': { bg: '#e3effd', fg: '#0b57a4' },
  '名義変更済み': { bg: '#e6f4ea', fg: '#137333' },
  '販売済み': { bg: '#eceff1', fg: '#455a64' }
};

/** 区分の色 */
var CATEGORY_COLORS = {
  '買取': { bg: '#e0f2f1', fg: '#00695c' },
  '仕入': { bg: '#e8eaf6', fg: '#303f9f' },
  '下取': { bg: '#fff3e0', fg: '#b35400' },
  'オークション': { bg: '#fce4ec', fg: '#ad1457' }
};

/** 色の列は実際の色で塗る（選択肢名 → 色見本） */
var COLOR_SWATCHES = {
  '黒': { bg: '#262626', fg: '#ffffff' },
  '白': { bg: '#ffffff', fg: '#333333' },
  '灰': { bg: '#9aa0a6', fg: '#ffffff' },
  '赤': { bg: '#c62828', fg: '#ffffff' },
  '紺': { bg: '#1a2a6c', fg: '#ffffff' },
  '青': { bg: '#1e6fd9', fg: '#ffffff' },
  '緑': { bg: '#2e7d32', fg: '#ffffff' },
  '黄': { bg: '#f9d648', fg: '#3a3000' },
  '茶': { bg: '#795548', fg: '#ffffff' }
};

/** そのほかのプルダウンの列（車種・担当・本人確認方法・地域）は、値が入ると淡い色のチップ風にする */
var LIST_CHIP = { bg: '#eef3fa', fg: '#1f3b63' };

/** 見出しのグループ（色で列のまとまりを分ける） */
var HEADER_GROUPS = [
  { name: '車両', color: '#1f4e5f', keys: ['purchaseDate', 'ocn', 'maker', 'modelName', 'chassisNumber', 'firstRegDate', 'inspectionExpiry', 'inspectionRemain', 'mileage', 'color'] },
  { name: '仕入', color: '#35527a', keys: ['category', 'staff', 'supplier', 'address', 'idCheck'] },
  { name: '登録番号', color: '#5a4a86', keys: ['plateRegion', 'plateClass', 'plateKana', 'plateNumber'] },
  { name: '状況・販売', color: '#8a4f1d', keys: ['status', 'saleDate', 'saleTo', 'certLink'] },
  { name: '金額', color: '#2f6a3b', keys: ['tradeInAllowance', 'recycleFee', 'tradeInPrice', 'appraisalPrice', 'tradeInLoss', 'purchasePrice'] }
];
var HEADER_OTHER_COLOR = '#607d8b';   // 標準にない列
var AUTO_CELL_BG = '#f1f4f6';        // 自動の列（OCN・計算式）の本文
var BAND_COLORS = ['#ffffff', '#f7f9fb'];

/** 列幅（ピクセル） */
var COLUMN_WIDTHS = {
  purchaseDate: 96, ocn: 70, maker: 100, modelName: 170, chassisNumber: 170, firstRegDate: 80, inspectionExpiry: 96,
  inspectionRemain: 72, mileage: 92, color: 56, category: 90, staff: 80, supplier: 150, address: 220, idCheck: 120,
  plateRegion: 80, plateClass: 60, plateKana: 50, plateNumber: 66, status: 120, saleDate: 90, saleTo: 150, certLink: 90,
  tradeInAllowance: 96, recycleFee: 84, tradeInPrice: 96, appraisalPrice: 96, tradeInLoss: 90, purchasePrice: 110
};

/** ダッシュボードで集計する「名義変更前」のステータス */
var PRE_TRANSFER_STATUSES = ['書類待ち', '車庫証明申請中', '名義変更中'];

/** ダッシュボードの列幅（一覧の12列）と、台数カードの位置 [開始列, 列数]（幅がほぼそろう組み合わせ） */
var DASHBOARD_COLUMN_WIDTHS = [112, 76, 96, 84, 90, 96, 170, 170, 160, 100, 110, 110];
var DASHBOARD_CARD_SPANS = [[1, 2], [3, 2], [5, 2], [7, 1], [8, 1]];
/**
 * 仕入集計タブ：期間（開始日〜終了日）に仕入れた車両を、販売済みを含む3シートから集計する。
 * カードで合計する項目（期間の合計と、前の同じ日数の期間の合計）
 */
var PURCHASE_CARDS = [
  { key: '__count', label: '仕入台数' },
  { key: 'purchasePrice', label: '仕入価格 合計' },
  { key: 'appraisalPrice', label: '査定価格 合計' },
  { key: 'tradeInPrice', label: '下取価格 合計' },
  { key: 'tradeInAllowance', label: '下取充当額 合計' },
  { key: 'tradeInLoss', label: '下取損 合計' }
];
/** 仕入集計タブの一覧の列（sheetLabel は 輸入車／国産車／販売済み。money は合計行を出す列） */
var PURCHASE_LIST_COLUMNS = [
  { key: 'purchaseDate', label: '仕入年月日', width: 96 },
  { key: 'ocn', label: 'OCN', width: 72 },
  { key: 'sheetLabel', label: 'シート', width: 76 },
  { key: 'status', label: 'ステータス', width: 120 },
  { key: 'maker', label: '車種', width: 120 },
  { key: 'modelName', label: 'モデル名', width: 168 },
  { key: 'category', label: '区分', width: 76 },
  { key: 'staff', label: '担当', width: 80 },
  { key: 'supplier', label: '仕入先', width: 160 },
  { key: 'tradeInAllowance', label: '下取充当額', width: 84, money: true },
  { key: 'recycleFee', label: 'リサイクル', width: 72, money: true },
  { key: 'tradeInPrice', label: '下取価格', width: 84, money: true },
  { key: 'appraisalPrice', label: '査定価格', width: 76, money: true },
  { key: 'tradeInLoss', label: '下取損', width: 64, money: true },
  { key: 'purchasePrice', label: '仕入価格（買取金額）', width: 120, money: true }
];
/** 仕入集計タブの合計カード6枚の位置 [開始列, 列数]（幅がほぼそろう組み合わせ） */
var PURCHASE_CARD_SPANS = [[1, 3], [4, 2], [6, 2], [8, 2], [10, 3], [13, 3]];
/** 集計期間（開始日・終了日）のセルの位置（タブを作り直しても選んだ日付を残す） */
var PURCHASE_PERIOD = { row: 4, startCol: 4, endCol: 5 };
var AMOUNT_FORMAT = '#,##0;-#,##0;"–"';     // 0 は「–」
var COUNT_FORMAT = '0"台";-0"台";"–"';

/** ダッシュボードで台数を出すステータス（在庫の流れ順） */
var DASHBOARD_STATUSES = ['書類待ち', '車庫証明申請中', '名義変更中', '名義変更済み'];

/** ダッシュボードの配色（落ち着いた地に、ステータスごとの差し色） */
var DASHBOARD_THEME = {
  page: '#f6f7f9', ink: '#1f2a33', muted: '#6b7780', band: '#f7f9fb',
  status: {
    '書類待ち': { accent: '#d93a2b', tint: '#fdf0ee' },
    '車庫証明申請中': { accent: '#c98500', tint: '#fdf6e3' },
    '名義変更中': { accent: '#1f6fd1', tint: '#edf4fd' },
    '名義変更済み': { accent: '#1e8a4c', tint: '#eaf6ef' },
    '未入力': { accent: '#6b7780', tint: '#eef1f3' }
  },
  month: { accent: '#2b5c8a', tint: '#eef4fa' }
};

/** ダッシュボードの一覧の列（key は車両シートの列。sheetLabel は輸入車／国産車） */
var DASHBOARD_LIST_COLUMNS = [
  { key: 'status', label: 'ステータス', width: 120 },
  { key: 'purchaseDate', label: '仕入年月日', width: 96 },
  { key: 'ocn', label: 'OCN', width: 70 },
  { key: 'sheetLabel', label: '輸入／国産', width: 80 },
  { key: 'maker', label: '車種', width: 100 },
  { key: 'modelName', label: 'モデル名', width: 170 },
  { key: 'chassisNumber', label: '車台番号', width: 170 },
  { key: 'supplier', label: '仕入先（該当者）', width: 160 },
  { key: 'staff', label: '担当', width: 80 },
  { key: 'category', label: '区分', width: 90 },
  { key: 'inspectionExpiry', label: '車検満了日', width: 96 }
];
var SHEET_LABELS = { '輸入車マスタ': '輸入車', '国産車マスタ': '国産車' };

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
 * 和暦・西暦の日付文字列を日付にする（R5.6.1、令和5年6月1日、2023/6/1、20230601、202306 など）。
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
  } else if ((m = s.match(/^(\d{4})(\d{2})$/))) {
    y = Number(m[1]); mo = Number(m[2]); d = 1;
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
    case 'yearMonth':
      // 初度登録は年月だけ。日付が入っていても月の1日にそろえる
      var ym = parseJapaneseDate(typeof value === 'number' ? String(value) : value);
      if (ym) out = new Date(ym.getFullYear(), ym.getMonth(), 1); else error = '年月として読めません';
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
  if (field.format) return field.format;
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

/**
 * プルダウンの列の色分け（条件付き書式）。値ごとに背景色・文字色を付けて、チップのように見せる。
 *  - ステータス・区分：値ごとの色
 *  - 色：実際の色で塗る
 *  - 車種・担当・本人確認方法・地域：値が入ると淡い色
 * @param {Object} colMap 列マップ
 * @param {Array<string>} colorValues 色の選択肢（設定アプリで編集されたもの）
 */
function buildChipRules(colMap, colorValues) {
  var rules = [];
  function letter(key) { return colMap[key] === undefined ? null : columnLetter(colMap[key] + 1); }
  function valueRules(key, map) {
    var L = letter(key);
    if (!L) return;
    Object.keys(map).forEach(function (v) {
      rules.push({ columns: [L], color: map[v].bg, fg: map[v].fg, bold: true, note: FIELD_BY_KEY[key].label + '：' + v,
        formula: '=AND(' + CF_MARKER + ',$' + L + '2="' + v.replace(/"/g, '""') + '")' });
    });
  }
  valueRules('status', STATUS_COLORS);
  valueRules('category', CATEGORY_COLORS);
  var swatches = {};
  (colorValues || Object.keys(COLOR_SWATCHES)).forEach(function (v) { if (COLOR_SWATCHES[v]) swatches[v] = COLOR_SWATCHES[v]; });
  valueRules('color', swatches);
  ['maker', 'staff', 'idCheck', 'plateRegion'].forEach(function (key) {
    var L = letter(key);
    if (!L) return;
    rules.push({ columns: [L], color: LIST_CHIP.bg, fg: LIST_CHIP.fg, note: FIELD_BY_KEY[key].label + '：入力あり',
      formula: '=AND(' + CF_MARKER + ',$' + L + '2<>"")' });
  });
  return rules;
}

/** 見出しの色（列キー → グループの色）。自動の列は同じ色で、本文を灰色にして区別する */
function headerColorFor(key) {
  for (var i = 0; i < HEADER_GROUPS.length; i++) if (HEADER_GROUPS[i].keys.indexOf(key) !== -1) return HEADER_GROUPS[i].color;
  return HEADER_OTHER_COLOR;
}

/** 列の横位置（日付・選択肢・番号は中央、数値は右、文字は左） */
function alignmentFor(field) {
  if (['mileage', 'money', 'formula'].indexOf(field.type) !== -1) return 'right';
  if (['date', 'yearMonth', 'ocn', 'list', 'plateClass', 'plateKana', 'plateNumber', 'link'].indexOf(field.type) !== -1) return 'center';
  return 'left';
}

/** シートの列範囲の参照（例：'輸入車マスタ'!T2:T） */
function columnRef(sheetName, colIndex0) {
  var L = columnLetter(colIndex0 + 1);
  return "'" + sheetName + "'!" + L + '2:' + L;
}

/**
 * ダッシュボード：COUNTIFS の合計の式。
 * @param {Object} colMaps シート名 → 列マップ（対象のシートだけ）
 * @param {Array<Array<[string,string]>>} criteriaSets 条件の組（[列キー, 条件の式] の配列）。組ごとに数えて足す
 *   例：[[['status','"書類待ち"'],['ocn','"<>"']]]
 * 必要な列が無いシートは数えない。1つも数えられなければ =0
 */
function buildCountifsFormula(colMaps, criteriaSets) {
  var parts = [];
  Object.keys(colMaps).forEach(function (n) {
    criteriaSets.forEach(function (set) {
      if (set.some(function (c) { return colMaps[n][c[0]] === undefined; })) return;
      parts.push('COUNTIFS(' + set.map(function (c) { return columnRef(n, colMaps[n][c[0]]) + ',' + c[1]; }).join(',') + ')');
    });
  });
  return parts.length ? '=' + parts.join('+') : '=0';
}

/**
 * ダッシュボード：SUMIFS の合計の式（シートごとに sumKey の列を条件つきで合計して足す）。
 * 合計する列・条件の列が無いシートは数えない。1つも無ければ =0
 */
function buildSumifsFormula(colMaps, sumKey, criteria) {
  var parts = [];
  Object.keys(colMaps).forEach(function (n) {
    var cols = colMaps[n];
    if (cols[sumKey] === undefined || criteria.some(function (c) { return cols[c[0]] === undefined; })) return;
    parts.push('SUMIFS(' + columnRef(n, cols[sumKey]) + ',' + criteria.map(function (c) { return columnRef(n, cols[c[0]]) + ',' + c[1]; }).join(',') + ')');
  });
  return parts.length ? '=' + parts.join('+') : '=0';
}

/** 期間（開始日・終了日の式・セル。両端を含む）に仕入年月日が入る条件 */
function periodCriteria(startRef, endRef) {
  return [['purchaseDate', '">="&' + startRef], ['purchaseDate', '"<="&' + endRef]];
}

/**
 * 比較に使う「前の同じ日数の期間」の開始日・終了日の式。
 * 例：10/1〜10/31（31日間）→ 8/31〜9/30
 */
function previousPeriodRefs(startRef, endRef) {
  return { start: '(' + startRef + '-(' + endRef + '-' + startRef + '+1))', end: '(' + startRef + '-1)' };
}

/**
 * ダッシュボードを作り直すときに残す期間を決める。
 * 以前の版の「表示する月」（終了日のセルに月が入っている）の場合は、その月の1日〜末日にする。
 * どちらも日付でなければ、今月の1日〜今日。
 */
function resolveDashboardPeriod(startValue, endValue, today) {
  var isDate = function (v) { return v instanceof Date && !isNaN(v.getTime()); };
  if (isDate(startValue) && isDate(endValue)) return { start: startValue, end: endValue };
  if (isDate(endValue)) {
    return { start: new Date(endValue.getFullYear(), endValue.getMonth(), 1), end: new Date(endValue.getFullYear(), endValue.getMonth() + 1, 0) };
  }
  return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: new Date(today.getFullYear(), today.getMonth(), today.getDate()) };
}

/**
 * ダッシュボード：車両の一覧（輸入車マスタ・国産車マスタ）。
 * OCN が入っている行のうち、除外するステータス（名義変更済み・販売済み）以外を、
 * ステータスの流れ順（order。空欄は「未入力」として最後）→ 仕入が古い順に並べる。2列目に仕入からの経過日数。
 */
function buildDashboardListFormula(colMaps, order, excluded) {
  var blocks = Object.keys(colMaps).filter(function (n) { return colMaps[n].status !== undefined; }).map(function (n) {
    var cols = colMaps[n];
    var statusRef = columnRef(n, cols.status);
    return 'HSTACK(' + DASHBOARD_LIST_COLUMNS.map(function (c) {
      if (c.key === 'sheetLabel') return 'IF(' + statusRef + '="","","' + (SHEET_LABELS[n] || n) + '")';
      return cols[c.key] === undefined ? 'IF(' + statusRef + '="","","")' : columnRef(n, cols[c.key]);
    }).join(',') + ')';
  });
  if (!blocks.length) return '="ステータスの列が見つかりません"';
  var arr = function (list) { return '{' + list.map(function (s) { return '"' + s + '"'; }).join(';') + '}'; };
  var keyIdx = function (key) { return 1 + DASHBOARD_LIST_COLUMNS.map(function (c) { return c.key; }).indexOf(key); };
  var dateIdx = keyIdx('purchaseDate'), ocnIdx = keyIdx('ocn');
  var rest = [];
  for (var i = 2; i <= DASHBOARD_LIST_COLUMNS.length; i++) rest.push(i);
  return '=IFERROR(ARRAYFORMULA(LET(' +
    'd,VSTACK(' + blocks.join(',') + '),' +
    't,' + arr(order) + ',' +
    'x,' + arr(excluded || []) + ',' +
    'f,FILTER(d,(INDEX(d,,' + ocnIdx + ')<>"")*ISNA(MATCH(INDEX(d,,1),x,0))),' +
    's,SORT(f,IFERROR(MATCH(INDEX(f,,1),t,0),99),TRUE,INDEX(f,,' + dateIdx + '),TRUE),' +
    'HSTACK(IF(INDEX(s,,1)="","未入力",INDEX(s,,1)),IF(ISNUMBER(INDEX(s,,' + dateIdx + ')),TODAY()-INDEX(s,,' + dateIdx + '),""),CHOOSECOLS(s,' + rest.join(',') + '))' +
    ')),"該当する車両はありません")';
}

/**
 * 仕入集計タブ：期間に仕入れた車両の一覧（販売済みを含む3シート）。
 * 仕入年月日が開始日〜終了日（両端を含む）の行を、仕入年月日 → OCN の順に並べる。列は PURCHASE_LIST_COLUMNS の順。
 */
function buildPeriodListFormula(colMaps, startRef, endRef) {
  var blocks = Object.keys(colMaps).filter(function (n) { return colMaps[n].purchaseDate !== undefined; }).map(function (n) {
    var cols = colMaps[n];
    var dateRef = columnRef(n, cols.purchaseDate);
    return 'HSTACK(' + PURCHASE_LIST_COLUMNS.map(function (c) {
      if (c.key === 'sheetLabel') return 'IF(' + dateRef + '="","","' + (SHEET_LABELS[n] || n) + '")';
      return cols[c.key] === undefined ? 'IF(' + dateRef + '="","","")' : columnRef(n, cols[c.key]);
    }).join(',') + ')';
  });
  if (!blocks.length) return '="仕入年月日の列が見つかりません"';
  return '=IFERROR(ARRAYFORMULA(LET(' +
    'd,VSTACK(' + blocks.join(',') + '),' +
    'k,INDEX(d,,1),' +
    'f,FILTER(d,ISNUMBER(k)*(k>=' + startRef + ')*(k<=' + endRef + ')),' +
    'SORT(f,1,TRUE,2,TRUE)' +
    ')),"この期間に仕入れた車両はありません")';
}

/** 計算式で使える項目名（[ ] の中）→ 列キー。見出し名と別表記（例：仕入価格・買取金額）を受け付ける */
function calcItemKey(name) {
  var n = normalizeHeader(name);
  for (var i = 0; i < CALC_KEYS.length; i++) {
    var f = FIELD_BY_KEY[CALC_KEYS[i]];
    if (normalizeHeader(f.label) === n) return f.key;
    if ((f.aliases || []).some(function (a) { return normalizeHeader(a) === n; })) return f.key;
  }
  return null;
}

/** 計算式で使える関数（日本語名でも書ける）。いずれも行ごとに計算できるもの */
var CALC_FUNCTIONS = {
  ROUND: { fn: 'ROUND', min: 1, max: 2 }, '四捨五入': { fn: 'ROUND', min: 1, max: 2 },
  ROUNDDOWN: { fn: 'ROUNDDOWN', min: 1, max: 2 }, '切り捨て': { fn: 'ROUNDDOWN', min: 1, max: 2 }, '切捨て': { fn: 'ROUNDDOWN', min: 1, max: 2 }, '切捨': { fn: 'ROUNDDOWN', min: 1, max: 2 },
  ROUNDUP: { fn: 'ROUNDUP', min: 1, max: 2 }, '切り上げ': { fn: 'ROUNDUP', min: 1, max: 2 }, '切上げ': { fn: 'ROUNDUP', min: 1, max: 2 }, '切上': { fn: 'ROUNDUP', min: 1, max: 2 },
  INT: { fn: 'INT', min: 1, max: 1 }, '整数': { fn: 'INT', min: 1, max: 1 },
  ABS: { fn: 'ABS', min: 1, max: 1 }, '絶対値': { fn: 'ABS', min: 1, max: 1 }
};

/**
 * 設定アプリの計算式を、列の式の定義（{キー} 形式）にする。
 * 書けるもの：
 *  - [項目名]（下取充当額・リサイクル・下取価格・査定価格・下取損・仕入価格／買取金額）
 *  - 数字、10% のような百分率、+ - * / ( )（全角・×・÷ も可）、マイナスの数（-1 など）
 *  - 関数：四捨五入(式, 桁)・切り捨て(式, 桁)・切り上げ(式, 桁)・整数(式)・絶対値(式)
 *    （ROUND・ROUNDDOWN・ROUNDUP・INT・ABS とも書ける。桁は省略で0＝1円単位、-3 で千円単位）
 * 例：（[下取充当額]-[下取価格]）÷1.1×0.9、切り捨て([査定価格]×1.1, 0)、[下取充当額]-[下取価格]×(1+10%)
 * 参照する項目がすべて空欄の行は空欄、0で割るなどのエラーは空欄にする。
 * @return {{def:string, refs:Array<string>}}  不正な式は例外（日本語のメッセージ）
 */
function compileCalcExpression(key, expr) {
  var label = FIELD_BY_KEY[key].label;
  var fail = function (msg) { throw new Error(label + '：' + msg); };
  var text = toHalfWidthAlnum(String(expr || '')).replace(/×/g, '*').replace(/÷/g, '/').replace(/[、，]/g, ',');
  if (!text.trim()) fail('計算式を入力してください');

  // 字句に分ける
  var tokens = [], refs = [], i = 0, m;
  while (i < text.length) {
    var c = text.charAt(i);
    if (/\s/.test(c)) { i++; continue; }
    if (c === '[') {
      var j = text.indexOf(']', i);
      if (j === -1) fail('［ ］が閉じていません');
      var name = text.substring(i + 1, j);
      var ref = calcItemKey(name);
      if (!ref) fail('「' + name + '」は計算に使えない項目です（使える項目：' + CALC_KEYS.map(function (k) { return FIELD_BY_KEY[k].label; }).join('・') + '）');
      if (ref === key) fail('自分自身の列は計算に使えません');
      if (refs.indexOf(ref) === -1) refs.push(ref);
      tokens.push({ t: 'ref', v: '{' + ref + '}' });
      i = j + 1;
    } else if ((m = text.substring(i).match(/^(\d+(?:\.\d+)?|\.\d+)(%?)/))) {
      tokens.push({ t: 'num', v: m[2] ? '(' + m[1] + '/100)' : m[1] });
      i += m[0].length;
    } else if ('+-*/(),'.indexOf(c) !== -1) {
      tokens.push({ t: c });
      i++;
    } else if ((m = text.substring(i).match(/^[A-Za-z぀-ヿ一-鿿]+/))) {
      var fname = /^[A-Za-z]+$/.test(m[0]) ? m[0].toUpperCase() : m[0];
      if (!CALC_FUNCTIONS[fname]) fail('「' + m[0] + '」は使えない関数・文字です（使える関数：四捨五入・切り捨て・切り上げ・整数・絶対値）');
      tokens.push({ t: 'fn', v: CALC_FUNCTIONS[fname], name: m[0] });
      i += m[0].length;
    } else {
      fail('使えない文字「' + c + '」があります（[項目名]・数字・% ・+ - * / ( ) ・関数が使えます）');
    }
  }

  // 構文を確かめながら式を組み立てる（式 := 項 (+|- 項)* ／ 項 := 因子 (*|/ 因子)* ）
  var pos = 0;
  var peek = function () { return tokens[pos] || { t: 'end' }; };
  var expect = function (t, msg) { if (peek().t !== t) fail(msg); pos++; };
  function parseExpr() {
    var out = parseTerm();
    while (peek().t === '+' || peek().t === '-') { var op = tokens[pos++].t; out += op + parseTerm(); }
    return out;
  }
  function parseTerm() {
    var out = parseFactor();
    while (peek().t === '*' || peek().t === '/') { var op = tokens[pos++].t; out += op + parseFactor(); }
    return out;
  }
  function parseFactor() {
    var tk = peek();
    if (tk.t === '+' || tk.t === '-') { pos++; return tk.t + parseFactor(); }
    if (tk.t === 'num' || tk.t === 'ref') { pos++; return tk.v; }
    if (tk.t === '(') {
      pos++;
      var inner = parseExpr();
      expect(')', 'かっこの数が合っていません');
      return '(' + inner + ')';
    }
    if (tk.t === 'fn') {
      pos++;
      expect('(', '関数「' + tk.name + '」のあとに ( ) で式を書いてください');
      var args = [parseExpr()];
      while (peek().t === ',') { pos++; args.push(parseExpr()); }
      expect(')', 'かっこの数が合っていません');
      if (args.length < tk.v.min || args.length > tk.v.max) {
        fail('関数「' + tk.name + '」の書き方が正しくありません（例：' + tk.name + (tk.v.max === 2 ? '([査定価格]*1.1, 0)' : '([下取損])') + '）');
      }
      return tk.v.fn + '(' + args.join(',') + ')';
    }
    if (tk.t === 'end') fail('式の形が正しくありません（途中で終わっています）');
    if (tk.t === ')') fail('かっこの数が合っていません');
    fail('式の形が正しくありません（「' + tk.t + '」の位置）');
  }
  var body = parseExpr();
  if (pos < tokens.length) fail(peek().t === ')' ? 'かっこの数が合っていません' : '式の形が正しくありません');
  if (!refs.length) fail('[項目名] を1つ以上使ってください');
  var blank = refs.map(function (r) { return '({' + r + '}="")'; }).join('*');
  return { def: 'IF(' + blank + ',,IFERROR(' + body + ',""))', refs: refs };
}

/** 自動計算の列どうしが循環していないか（例：下取損が仕入価格を使い、仕入価格が下取損を使う）。循環していれば例外 */
function checkCalcCycles(refsByKey) {
  var state = {};
  function visit(k, path) {
    if (state[k] === 2) return;
    if (state[k] === 1) {
      throw new Error('計算式が循環しています：' + path.concat(k).map(function (x) { return FIELD_BY_KEY[x].label; }).join(' → '));
    }
    state[k] = 1;
    (refsByKey[k] || []).forEach(function (r) { if (refsByKey[r]) visit(r, path.concat(k)); });
    state[k] = 2;
  }
  Object.keys(refsByKey).forEach(function (k) { visit(k, []); });
}

/** 車検証リンクの自動更新の間隔の選択肢（分）。Apps Script の時間主導トリガーの最短は1分 */
var CERT_LINK_CHOICES = [
  { minutes: 0, label: 'しない' }, { minutes: 1, label: '1分ごと（最速）' }, { minutes: 5, label: '5分ごと' },
  { minutes: 10, label: '10分ごと' }, { minutes: 15, label: '15分ごと' }, { minutes: 30, label: '30分ごと' }, { minutes: 60, label: '1時間ごと' }
];

function normalizeCertLinkMinutes(v) {
  var n = Number(v);
  return CERT_LINK_CHOICES.some(function (c) { return c.minutes === n; }) ? n : 0;
}

/** 間隔（分）→ 時間主導トリガーの設定。0 は null */
function certLinkSchedule(minutes) {
  var n = normalizeCertLinkMinutes(minutes);
  if (!n) return null;
  var label = CERT_LINK_CHOICES.filter(function (c) { return c.minutes === n; })[0].label;
  return n >= 60 ? { hours: n / 60, label: label } : { minutes: n, label: label };
}

/**
 * 自動更新でシートを全件確認するか。
 * フォルダに新しい・更新されたファイルがあるとき、OCN が採番・変更されたとき、前回の全件確認から1時間たったときに確認する。
 * それ以外はフォルダを見るだけで終える（1分ごとの実行でも処理時間を使いすぎないため）。
 */
function certLinkNeedsFullScan(opts) {
  if (opts.changedFiles > 0 || opts.pending) return true;
  return !opts.lastFullMs || opts.nowMs - opts.lastFullMs >= 60 * 60 * 1000;
}

/** Drive の検索条件用の日時（RFC 3339、UTC） */
function driveQueryTime(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * 車検証リンクが入ったときの新しいステータス。
 * 名義変更前（空欄を含む）なら「名義変更済み」にし、名義変更済み・販売済みなどはそのまま（null）。
 */
function statusAfterCertLink(currentStatus) {
  var s = isBlank(currentStatus) ? '' : String(currentStatus).trim();
  if (s === STATUS_TRANSFERRED || s === STATUS_SOLD) return null;
  if (s === '' || PRE_TRANSFER_STATUSES.indexOf(s) !== -1) return STATUS_TRANSFERRED;
  return null; // 選択肢にない値は人が確認する
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
    .addItem('ダッシュボードを開く', 'openDashboard')
    .addItem('仕入集計を開く', 'openPurchaseSummary')
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

function openDashboard() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET.DASHBOARD);
  if (!sheet) {
    var colMaps = {};
    VEHICLE_SHEETS.forEach(function (name) { var s = ss.getSheetByName(name); if (s) colMaps[name] = getColumns_(s).map; });
    sheet = buildDashboard_(ss, colMaps);
  }
  ss.setActiveSheet(sheet);
}

function openPurchaseSummary() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET.PURCHASE);
  if (!sheet) sheet = buildPurchaseSheet_(ss, vehicleColMaps_(ss));
  ss.setActiveSheet(sheet);
}

function vehicleColMaps_(ss) {
  var colMaps = {};
  VEHICLE_SHEETS.forEach(function (name) { var s = ss.getSheetByName(name); if (s) colMaps[name] = getColumns_(s).map; });
  return colMaps;
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
  CERT_LINK_HOURLY: 'CERT_LINK_HOURLY',   // 以前の版（1時間ごと）の設定
  CERT_LINK_MINUTES: 'CERT_LINK_MINUTES', // 車検証リンクの自動更新の間隔（分。0＝しない）
  CERT_LAST_CHECK: 'CERT_LINK_LAST_CHECK_MS',
  CERT_LAST_FULL: 'CERT_LINK_LAST_FULL_MS',
  CERT_PENDING: 'CERT_LINK_PENDING',       // OCN が採番・変更された（次の自動更新で全件を確認する）
  OCN_LAST: 'OCN_LAST_ISSUED',
  CALC: 'CALC_', // + 列キー（計算式の設定）
  LIST: 'LIST_' // + maker / color / staff / idCheck / region
};

function getSettings_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  return {
    company: props[PROP.COMPANY] || '',
    expiryDays: props[PROP.EXPIRY_DAYS] === undefined ? 30 : Math.max(0, Number(props[PROP.EXPIRY_DAYS]) || 0),
    folderCert: props[PROP.FOLDER_CERT] || '',
    certLinkMinutes: props[PROP.CERT_LINK_MINUTES] !== undefined
      ? normalizeCertLinkMinutes(props[PROP.CERT_LINK_MINUTES])
      : (props[PROP.CERT_LINK_HOURLY] === 'true' ? 60 : 0)
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

// ----- 計算式（X〜AC列） -----

/** 列ごとの計算の設定 {mode:'auto'|'manual'|'', expr} */
function readCalcSettings_() {
  var props = PropertiesService.getScriptProperties();
  var out = {};
  CALC_KEYS.forEach(function (k) {
    var json = props.getProperty(PROP.CALC + k);
    var v = null;
    if (json) { try { v = JSON.parse(json); } catch (e) { v = null; } }
    out[k] = v && (v.mode === 'auto' || v.mode === 'manual') ? v : { mode: '', expr: '' };
  });
  return out;
}

/**
 * 計算の設定を、この実行中の列定義（FIELDS の type・FORMULA_DEFS・FORCED_FORMULA_KEYS）に反映する。
 * 入力時の整形・書式・一括整形などの入口で呼ぶ。
 */
function applyCalcSettings_() {
  var calc = readCalcSettings_();
  CALC_KEYS.forEach(function (k) {
    var f = FIELD_BY_KEY[k];
    var setting = calc[k];
    var forcedAt = FORCED_FORMULA_KEYS.indexOf(k);
    if (forcedAt !== -1) FORCED_FORMULA_KEYS.splice(forcedAt, 1);
    f.calcMode = setting.mode;
    if (setting.mode === 'auto') {
      f.type = 'formula';
      FORMULA_DEFS[k] = compileCalcExpression(k, setting.expr).def;
      FORCED_FORMULA_KEYS.push(k);
    } else if (setting.mode === 'manual') {
      f.type = 'money';
      FORMULA_DEFS[k] = null;
    } else {
      f.type = CALC_DEFAULT_TYPES[k];
      FORMULA_DEFS[k] = CALC_DEFAULT_DEFS[k] || null;
    }
  });
  return calc;
}

/** 設定アプリ：計算式の設定を返す */
function getCalcSettings() {
  var calc = readCalcSettings_();
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET.IMPORT_MASTER) || ss.getSheetByName(SHEET.DOMESTIC_MASTER);
  var cols = sheet ? getColumns_(sheet).map : {};
  return {
    items: CALC_KEYS.map(function (k) {
      var f = FIELD_BY_KEY[k];
      var hasFormula = false;
      if (sheet && cols[k] !== undefined) hasFormula = !!sheet.getRange(1, cols[k] + 1).getFormula();
      return {
        key: k, label: f.label, letter: cols[k] === undefined ? '' : columnLetter(cols[k] + 1),
        mode: calc[k].mode, expr: calc[k].expr || '', hasFormula: hasFormula,
        defaultExpr: k === 'tradeInLoss' ? '[下取充当額]-[下取価格]' : ''
      };
    }),
    names: CALC_KEYS.map(function (k) { return FIELD_BY_KEY[k].label; })
  };
}

/**
 * 設定アプリ：計算式の設定を保存し、3シートに反映する。
 * 自動計算にする列に値が入っているシートは、先にバックアップ（非表示シート）を作る。
 * @param {Array<{key:string, mode:string, expr:string}>} items
 */
function saveCalcSettings(items) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('他の処理が実行中です');
  try {
    var refsByKey = {};
    var clean = {};
    (items || []).forEach(function (it) {
      if (CALC_KEYS.indexOf(it.key) === -1) return;
      var mode = it.mode === 'auto' || it.mode === 'manual' ? it.mode : '';
      var expr = String(it.expr || '').trim();
      if (mode === 'auto') refsByKey[it.key] = compileCalcExpression(it.key, expr).refs; // 不正な式はここで例外
      clean[it.key] = { mode: mode, expr: expr };
    });
    checkCalcCycles(refsByKey);

    var ss = getSpreadsheet_();
    var before = readCalcSettings_();
    var report = [];
    // 新しく自動計算にする列に値が入っていれば、そのシートをバックアップ
    VEHICLE_SHEETS.forEach(function (name) {
      var sheet = ss.getSheetByName(name);
      if (!sheet || sheet.getLastRow() < 2) return;
      var cols = getColumns_(sheet).map;
      var needs = Object.keys(clean).some(function (k) {
        if (clean[k].mode !== 'auto' || cols[k] === undefined) return false;
        if (before[k].mode === 'auto' && before[k].expr === clean[k].expr) return false;
        if (sheet.getRange(1, cols[k] + 1).getFormula()) return false;
        return sheet.getRange(2, cols[k] + 1, sheet.getLastRow() - 1, 1).getValues().some(function (r) { return !isBlank(r[0]); });
      });
      if (needs) report.push('バックアップ：' + makeBackupSheet_(ss, sheet) + '（非表示シート）');
    });

    var props = PropertiesService.getScriptProperties();
    Object.keys(clean).forEach(function (k) {
      if (clean[k].mode) props.setProperty(PROP.CALC + k, JSON.stringify(clean[k]));
      else props.deleteProperty(PROP.CALC + k);
    });
    reapplyStandards_(ss, report);
    var summary = CALC_KEYS.map(function (k) {
      var c = clean[k] || { mode: '' };
      return FIELD_BY_KEY[k].label + '＝' + (c.mode === 'auto' ? c.expr : (c.mode === 'manual' ? '手入力' : '未設定'));
    }).join('、');
    appendLog_('計算式の設定', '3シート', '', '', '', summary);
    return { ok: true, message: '保存して3シートに反映しました。\n・' + report.filter(function (r) { return /計算|バックアップ|手入力/.test(r); }).join('\n・') };
  } finally {
    lock.releaseLock();
  }
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
  var colMaps = {};
  VEHICLE_SHEETS.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) return;
    colMaps[name] = getColumns_(sheet).map;
    applyValidations_(sheet, colMaps[name]);
  });
  if (ss.getSheetByName(SHEET.DASHBOARD)) buildDashboard_(ss, colMaps); // 担当者別の行を作り直す
  if (ss.getSheetByName(SHEET.PURCHASE)) buildPurchaseSheet_(ss, colMaps);
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
    company: s.company, expiryDays: s.expiryDays, folderCert: s.folderCert, certLinkMinutes: s.certLinkMinutes, certLinkChoices: CERT_LINK_CHOICES,
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
    values[PROP.CERT_LINK_MINUTES] = String(normalizeCertLinkMinutes(form.certLinkMinutes));
    props.deleteProperty(PROP.CERT_LINK_HOURLY);
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
    setupTriggers_(folderId ? Number(values[PROP.CERT_LINK_MINUTES]) : 0, report);
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
  applyCalcSettings_();
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
    applyVisuals_(sheet, cols);
    // 入力チェック（重複・形式違い）を先に置き、プルダウンの色 → 車検満了間近の行の順にする（先の規則が優先される）
    var checks = buildCheckRules(name, colMaps, settings.expiryDays);
    var rowRules = checks.filter(function (r) { return r.wholeRow; });
    var cellRules = checks.filter(function (r) { return !r.wholeRow; });
    applyCheckRules_(sheet, cellRules.concat(buildChipRules(cols, colorListValues_())).concat(rowRules));
  });
  var logSheet = ss.getSheetByName(SHEET.LOG);
  if (logSheet) styleLogSheet_(logSheet);
  buildDashboard_(ss, colMaps);
  buildPurchaseSheet_(ss, colMaps);
  report.push('日付を西暦（yyyy/MM/dd）、走行距離を「12,345km」、金額を「#,##0」で表示するよう設定しました');
  report.push('プルダウンの値ごとの色分け、入力チェックの色分け、見出しのグループ色・1行おきの色・列幅を設定しました');
  report.push('ダッシュボード（ステータス別台数と名義変更済み以外の一覧）を更新しました');
  report.push('仕入集計（選んだ期間の合計と、期間に仕入れた車両の一覧）を更新しました');
}

function colorListValues_() {
  return (readLists_().color || []).map(function (e) { return e.value; });
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
    if (f.type === 'date' || f.type === 'yearMonth') {
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

/**
 * 計算式の列：見出し行に ARRAYFORMULA を置く。
 *  - 車検残（FORCED_FORMULA_KEYS）：常に自動計算。既存の値・式は消して置き換える
 *  - それ以外：既存の式・値がある列は切り替えない（新しい行には上の行の式を引き継ぐ）
 */
function applyFormulaColumns_(sheet, cols, report) {
  FIELDS.filter(function (f) { return f.type === 'formula'; }).forEach(function (f) {
    var c = cols[f.key];
    if (c === undefined) return;
    var label = '「' + sheet.getName() + '」の' + f.label + '：';
    var header = sheet.getRange(1, c + 1);
    var formula = buildArrayFormula(f.key, cols);
    var forced = FORCED_FORMULA_KEYS.indexOf(f.key) !== -1;
    var lastRow = sheet.getLastRow();

    if (forced) {
      if (!formula) { report.push(label + '参照する列が無いため自動計算にできません'); return; }
      if (header.getFormula() === formula) return;
      var cleared = 0;
      if (lastRow >= 2) {
        var body = sheet.getRange(2, c + 1, lastRow - 1, 1);
        var vals = body.getValues(), fmls = body.getFormulas();
        cleared = vals.filter(function (r, i) { return !isBlank(r[0]) || fmls[i][0]; }).length;
        body.clearContent();
      }
      header.setFormula(formula);
      report.push(label + (f.key === 'inspectionRemain' ? '車検満了日から' : '計算式で') + '自動で計算するようにしました' +
        (cleared ? '（入っていた値・式 ' + cleared + '件を置き換え）' : ''));
      return;
    }

    if (header.getFormula()) return;
    if (lastRow >= 2) {
      var range = sheet.getRange(2, c + 1, lastRow - 1, 1);
      if (range.getFormulas().some(function (r) { return r[0]; }) || range.getValues().some(function (r) { return !isBlank(r[0]); })) {
        return;
      }
    }
    if (!formula) { report.push(label + '計算式が未設定のため設定していません（設定アプリの「計算式」で設定できます）'); return; }
    header.setFormula(formula);
    report.push(label + '見出し行に計算式を設定しました');
  });

  // 手入力に切り替えた列：自動計算の結果を値として残し、見出しを文字に戻す
  CALC_KEYS.forEach(function (k) {
    var f = FIELD_BY_KEY[k];
    var c = cols[k];
    if (f.calcMode !== 'manual' || c === undefined) return;
    var header = sheet.getRange(1, c + 1);
    if (!header.getFormula()) return;
    var lastRow = sheet.getLastRow();
    var values = lastRow >= 2 ? sheet.getRange(2, c + 1, lastRow - 1, 1).getValues() : [];
    header.setValue(f.label);
    if (values.length) sheet.getRange(2, c + 1, values.length, 1).setValues(values);
    report.push('「' + sheet.getName() + '」の' + f.label + '：手入力に切り替えました（計算結果は値として残しています）');
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
    var builder = SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(d.formula).setBackground(d.color).setRanges(ranges);
    if (d.fg) builder.setFontColor(d.fg);
    if (d.bold) builder.setBold(true);
    rules.push(builder.build());
  });
  sheet.setConditionalFormatRules(rules);
}

/**
 * 車両シートの見た目：見出しのグループ色・自動の列の灰色・1行おきの色・列幅・配置・タブの色・フィルタ。
 * 値は変えない。何度実行しても同じ見た目になる。
 */
function applyVisuals_(sheet, cols) {
  var maxRows = sheet.getMaxRows(), lastCol = Math.max(sheet.getLastColumn(), 1);
  var bodyRows = Math.max(maxRows - 1, 1);
  var keyAt = {};
  FIELDS.forEach(function (f) { if (cols[f.key] !== undefined) keyAt[cols[f.key]] = f; });

  // 見出し行
  var header = sheet.getRange(1, 1, 1, lastCol);
  var bgs = [], fonts = [], notes = header.getNotes()[0];
  for (var c = 0; c < lastCol; c++) {
    var f = keyAt[c];
    bgs.push(f ? headerColorFor(f.key) : HEADER_OTHER_COLOR);
    fonts.push('#ffffff');
    if (f) notes[c] = headerNoteFor_(f);
  }
  header.setBackgrounds([bgs]).setFontColors([fonts]).setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(false)
    .setBorder(null, null, true, null, null, null, '#263238', SpreadsheetApp.BorderStyle.SOLID_MEDIUM)
    .setNotes([notes]);
  sheet.setRowHeight(1, 32);
  sheet.setFrozenRows(1);
  if (cols.ocn !== undefined && cols.ocn < 4) sheet.setFrozenColumns(cols.ocn + 1);

  // 本文：文字サイズ・縦位置・列ごとの横位置と列幅、自動の列は灰色
  sheet.getRange(2, 1, bodyRows, lastCol).setFontSize(10).setVerticalAlignment('middle').setWrap(false);
  Object.keys(keyAt).forEach(function (idx) {
    var f = keyAt[idx], col = Number(idx) + 1;
    var body = sheet.getRange(2, col, bodyRows, 1);
    body.setHorizontalAlignment(alignmentFor(f));
    if (f.type === 'ocn' || f.type === 'formula') body.setBackground(AUTO_CELL_BG).setFontColor('#37474f');
    else if (CALC_KEYS.indexOf(f.key) !== -1) body.setBackground(null).setFontColor(null); // 手入力に戻した計算の列
    if (f.type === 'link') body.setFontColor('#0b57a4');
  });
  // 列幅：文字が収まる幅に自動で合わせる（標準の幅より狭くはしない）
  fitColumnWidths_(sheet, 1, lastCol, keyAt);

  // 1行おきの色（このシステムが付けた帯だけでなく、既存の帯も付け直す）
  sheet.getBandings().forEach(function (b) { b.remove(); });
  sheet.getRange(2, 1, bodyRows, lastCol).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false)
    .setFirstRowColor(BAND_COLORS[0]).setSecondRowColor(BAND_COLORS[1]);

  // タブの色・フィルタ
  sheet.setTabColor(sheet.getName() === SHEET.SOLD ? '#78909c' : (sheet.getName() === SHEET.IMPORT_MASTER ? '#1f4e5f' : '#2f6a3b'));
  if (!sheet.getFilter()) sheet.getRange(1, 1, maxRows, lastCol).createFilter();
}

/** 見出しのメモ（入力のしかた） */
function headerNoteFor_(f) {
  var notes = {
    date: '西暦の日付（yyyy/MM/dd）。R5.6.1・令和5年6月1日と入力しても西暦になります',
    yearMonth: '年月だけ。R2.3・2020/3 などで入力できます',
    ocn: '自動で採番します（入力不要）',
    mileage: '数字を入れると「12,345km」と表示します',
    money: '数字を入れると「1,234,000」と表示します',
    list: 'プルダウンから選びます（表記ゆれは自動で選択肢に置き換えます）',
    formula: '自動計算（入力不要）',
    link: '車検証保管フォルダのファイルに自動でリンクします',
    chassis: '大文字・半角に自動でそろえます（ハイフンは残します）',
    kana: 'カタカナは半角カナ、英数字は半角に自動でそろえます'
  };
  if (f.key === 'inspectionRemain') return '車検満了日から自動計算（残り日数。満了日を迎えたら「満了」）';
  if (CALC_KEYS.indexOf(f.key) !== -1 && f.calcMode === 'auto') {
    var setting = readCalcSettings_()[f.key];
    return '自動計算：' + setting.expr + '（設定アプリの「計算式」で変更できます）';
  }
  return notes[f.type] || '';
}

/**
 * 列幅を文字が収まる幅に自動で合わせる。見出しのフィルタボタンの分を足し、COLUMN_WIDTHS の幅より狭くはしない。
 * @param {Object} keyAt 列番号（0始まり）→ 列定義（無ければ最小幅なし）
 */
function fitColumnWidths_(sheet, startCol, numCols, keyAt) {
  sheet.autoResizeColumns(startCol, numCols);
  for (var col = startCol; col < startCol + numCols; col++) {
    var f = keyAt ? keyAt[col - 1] : null;
    var min = f && COLUMN_WIDTHS[f.key] ? COLUMN_WIDTHS[f.key] : 60;
    var width = sheet.getColumnWidth(col) + 24; // フィルタボタン・余白
    sheet.setColumnWidth(col, Math.min(Math.max(width, min), 480));
  }
}

function styleLogSheet_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), LOG_HEADERS.length);
  sheet.getRange(1, 1, 1, lastCol).setBackground('#455a64').setFontColor('#ffffff').setFontWeight('bold').setVerticalAlignment('middle');
  sheet.setRowHeight(1, 30);
  sheet.setFrozenRows(1);
  sheet.setTabColor('#b0bec5');
  sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('yyyy/MM/dd HH:mm');
  [140, 120, 180, 120, 160, 160, 360, 180].forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
}

/**
 * ダッシュボードタブを作り直す。内容はすべて数式なので、マスタに入力するとすぐ反映される。
 *  1. ステータスごとの台数（在庫＝輸入車マスタ・国産車マスタ）：台数・在庫に占める割合と棒
 *  2. 名義変更済み以外の車両の一覧（ステータスの流れ順 → 仕入が古い順、仕入からの経過日数つき）
 */
function buildDashboard_(ss, allColMaps) {
  var masters = {};
  MASTER_SHEETS.forEach(function (n) { if (allColMaps[n]) masters[n] = allColMaps[n]; });
  var T = DASHBOARD_THEME;

  var sheet = ss.getSheetByName(SHEET.DASHBOARD) || ss.insertSheet(SHEET.DASHBOARD, 0);
  sheet.getBandings().forEach(function (bd) { bd.remove(); });
  sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) { p.remove(); });
  sheet.clear();
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).clearDataValidations();
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();
  sheet.setConditionalFormatRules([]);
  sheet.setFrozenRows(0);
  var W = DASHBOARD_LIST_COLUMNS.length + 1; // 12列
  if (sheet.getMaxColumns() < W + 1) sheet.insertColumnsAfter(sheet.getMaxColumns(), W + 1 - sheet.getMaxColumns());
  sheet.setHiddenGridlines(true);
  sheet.setTabColor(T.ink);
  var all = sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns());
  all.setFontSize(10).setFontColor(T.ink).setVerticalAlignment('middle').setWrap(false).setBackground(T.page);

  // 見出し：タイトルと基準日
  sheet.setRowHeight(1, 14);
  sheet.getRange(2, 1, 1, 6).merge().setValue('ダッシュボード').setFontSize(18).setFontWeight('bold').setFontColor(T.ink);
  sheet.getRange(2, W - 2, 1, 3).merge().setFormula('="基準日　"&TEXT(TODAY(),"yyyy/mm/dd（ddd）")')
    .setFontColor(T.muted).setHorizontalAlignment('right');
  sheet.setRowHeight(2, 36);
  sheet.setRowHeight(3, 10);

  // 1. ステータスごとの台数（カード5枚。一覧の列幅に合わせ、どのカードもほぼ同じ幅になる列の組み合わせにする）
  var inStock = ['ocn', '"<>"'];
  var totalFormula = buildCountifsFormula(masters, [[inStock]]).substring(1);
  var cards = DASHBOARD_STATUSES.map(function (st) {
    return { label: st, formula: buildCountifsFormula(masters, [[['status', '"' + st + '"'], inStock]]).substring(1), accent: T.status[st].accent, tint: T.status[st].tint };
  });
  cards.push({ label: '在庫 合計', formula: totalFormula, accent: T.ink, tint: '#eef1f3', total: true });
  var cardTop = 4;
  var spans = DASHBOARD_CARD_SPANS;
  cards.forEach(function (c, i) {
    var col = spans[i][0], n = spans[i][1];
    sheet.getRange(cardTop, col, 1, n).merge().setBackground(c.accent);                                    // 色の帯
    sheet.getRange(cardTop + 1, col, 1, n).merge().setValue(c.label).setBackground(c.tint)
      .setFontColor(c.total ? T.ink : c.accent).setFontWeight('bold').setFontSize(10).setHorizontalAlignment('left');
    sheet.getRange(cardTop + 2, col, 1, n).merge().setFormula('=' + c.formula).setBackground(c.tint)
      .setFontColor(T.ink).setFontSize(30).setFontWeight('bold').setHorizontalAlignment('left').setNumberFormat('0"台"');
    var share = c.total ? '1' : 'IFERROR((' + c.formula + ')/(' + totalFormula + '),0)';
    sheet.getRange(cardTop + 3, col, 1, n).merge()
      .setFormula('=SPARKLINE(' + share + ',{"charttype","bar";"max",1;"color1","' + c.accent + '";"empty","zero"})').setBackground(c.tint);
    sheet.getRange(cardTop + 4, col, 1, n).merge()
      .setFormula(c.total ? '="輸入車 "&(' + buildCountifsFormula(onlySheet_(masters, SHEET.IMPORT_MASTER), [[inStock]]).substring(1) + ')&"台 ／ 国産車 "&(' + buildCountifsFormula(onlySheet_(masters, SHEET.DOMESTIC_MASTER), [[inStock]]).substring(1) + ')&"台"'
        : '="在庫の "&TEXT(' + share + ',"0%")')
      .setBackground(c.tint).setFontColor(T.muted).setFontSize(9).setHorizontalAlignment('left');
    sheet.getRange(cardTop, col, 5, n).setBorder(true, true, true, true, null, null, T.page, SpreadsheetApp.BorderStyle.SOLID_THICK);
  });
  sheet.setRowHeight(cardTop, 6);
  sheet.setRowHeight(cardTop + 1, 26);
  sheet.setRowHeight(cardTop + 2, 46);
  sheet.setRowHeight(cardTop + 3, 14);
  sheet.setRowHeight(cardTop + 4, 22);
  sheet.setRowHeight(cardTop + 5, 18);

  // 2. 名義変更済み以外の一覧
  var titleRow = cardTop + 6, headerRow = titleRow + 1, listRow = titleRow + 2;
  sheet.getRange(titleRow, 1, 1, 6).merge().setValue('名義変更済み以外の車両').setFontSize(13).setFontWeight('bold').setFontColor(T.ink);
  sheet.getRange(titleRow, 7, 1, W - 6).merge()
    .setFormula('=(' + buildCountifsFormula(masters, [[inStock]]).substring(1) + ')-(' +
      buildCountifsFormula(masters, [[['status', '"' + STATUS_TRANSFERRED + '"'], inStock]]).substring(1) + ')&"台　ステータスの流れ順 → 仕入が古い順"')
    .setFontColor(T.muted).setHorizontalAlignment('right');
  sheet.setRowHeight(titleRow, 34);
  var headers = [DASHBOARD_LIST_COLUMNS[0].label, '経過日数'].concat(DASHBOARD_LIST_COLUMNS.slice(1).map(function (c) { return c.label; }));
  sheet.getRange(headerRow, 1, 1, headers.length).setValues([headers]).setBackground(T.ink).setFontColor('#ffffff')
    .setFontWeight('bold').setFontSize(9).setHorizontalAlignment('center');
  sheet.setRowHeight(headerRow, 30);
  sheet.getRange(listRow, 1).setFormula(buildDashboardListFormula(masters, DASHBOARD_STATUSES, [STATUS_TRANSFERRED, STATUS_SOLD]));

  var bodyRows = Math.max(sheet.getMaxRows() - listRow + 1, 1);
  var body = sheet.getRange(listRow, 1, bodyRows, headers.length);
  body.setBackground(null).setFontColor(T.ink);
  body.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false).setFirstRowColor('#ffffff').setSecondRowColor(T.band);
  sheet.setRowHeights(listRow, Math.min(bodyRows, 500), 26);
  var colIndex = function (key) { return key === '__days' ? 2 : 2 + DASHBOARD_LIST_COLUMNS.map(function (c) { return c.key; }).indexOf(key); };
  sheet.getRange(listRow, colIndex('__days'), bodyRows, 1).setNumberFormat('0"日"').setHorizontalAlignment('right');
  ['purchaseDate', 'inspectionExpiry'].forEach(function (k) {
    sheet.getRange(listRow, colIndex(k), bodyRows, 1).setNumberFormat(DATE_FORMAT).setHorizontalAlignment('center');
  });
  ['ocn', 'sheetLabel', 'maker', 'staff', 'category'].forEach(function (k) {
    sheet.getRange(listRow, colIndex(k), bodyRows, 1).setHorizontalAlignment('center');
  });
  sheet.getRange(listRow, colIndex('ocn'), bodyRows, 1).setNumberFormat('0');
  sheet.getRange(listRow, 1, bodyRows, 1).setHorizontalAlignment('center').setFontWeight('bold');
  sheet.getRange(headerRow, 1, 1, headers.length).setBorder(null, null, true, null, null, null, T.ink, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // 一覧の色：ステータスのチップ、経過日数（31日以上は橙、61日以上は赤）
  var rules = [];
  var statusRange = sheet.getRange(listRow, 1, bodyRows, 1), daysRange = sheet.getRange(listRow, 2, bodyRows, 1);
  DASHBOARD_STATUSES.concat(['未入力']).forEach(function (st) {
    var c = T.status[st];
    if (!c) return;
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(st).setBackground(c.tint).setFontColor(c.accent).setRanges([statusRange]).build());
  });
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(61).setBackground('#fdecea').setFontColor('#c5221f').setBold(true).setRanges([daysRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(31).setBackground('#fef3e2').setFontColor('#b35400').setBold(true).setRanges([daysRange]).build());
  sheet.setConditionalFormatRules(rules);
  sheet.setFrozenRows(2); // タイトルだけ固定（下の表までスクロールできるように）

  // 列幅（固定）
  var widths = DASHBOARD_COLUMN_WIDTHS;
  widths.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  sheet.setColumnWidth(W + 1, 16);

  // 保護（警告のみ）
  sheet.protect().setDescription('ダッシュボード（自動集計）').setWarningOnly(true);
  return sheet;
}

/**
 * 仕入集計タブを作り直す。内容はすべて数式なので、入力するとすぐ反映される。
 *  - 集計期間：開始日・終了日をカレンダーで選ぶ（作り直しても残す）
 *  - 期間の合計カード：仕入台数・仕入価格・査定価格・下取価格・下取充当額・下取損（前の同じ日数の期間と比較）
 *  - 期間に仕入れた車両の一覧（販売済みを含む3シート。仕入年月日順）と、その合計行
 */
function buildPurchaseSheet_(ss, allColMaps) {
  var vehicles = {};
  VEHICLE_SHEETS.forEach(function (n) { if (allColMaps[n]) vehicles[n] = allColMaps[n]; });
  var T = DASHBOARD_THEME;
  var P = PURCHASE_PERIOD;
  var LC = PURCHASE_LIST_COLUMNS, W = LC.length;

  var sheet = ss.getSheetByName(SHEET.PURCHASE);
  if (!sheet) {
    var dash = ss.getSheetByName(SHEET.DASHBOARD);
    sheet = ss.insertSheet(SHEET.PURCHASE, dash ? dash.getIndex() : 0);
  }
  var kept = resolveDashboardPeriod(sheet.getRange(P.row, P.startCol).getValue(), sheet.getRange(P.row, P.endCol).getValue(), new Date());
  sheet.getBandings().forEach(function (bd) { bd.remove(); });
  sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) { p.remove(); });
  sheet.clear();
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).clearDataValidations();
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();
  sheet.setConditionalFormatRules([]);
  sheet.setFrozenRows(0);
  if (sheet.getMaxColumns() < W + 1) sheet.insertColumnsAfter(sheet.getMaxColumns(), W + 1 - sheet.getMaxColumns());
  sheet.setHiddenGridlines(true);
  sheet.setTabColor(T.month.accent);
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns())
    .setFontSize(10).setFontColor(T.ink).setVerticalAlignment('middle').setWrap(false).setBackground(T.page);

  // 見出し：タイトルと基準日
  sheet.setRowHeight(1, 14);
  sheet.getRange(2, 1, 1, 6).merge().setValue('仕入集計').setFontSize(18).setFontWeight('bold');
  sheet.getRange(2, W - 2, 1, 3).merge().setFormula('="基準日　"&TEXT(TODAY(),"yyyy/mm/dd（ddd）")')
    .setFontColor(T.muted).setHorizontalAlignment('right');
  sheet.setRowHeight(2, 36);

  // 集計期間：開始日・終了日のセル（カレンダーで選ぶ）
  var startRef = '$' + columnLetter(P.startCol) + '$' + P.row;
  var endRef = '$' + columnLetter(P.endCol) + '$' + P.row;
  sheet.getRange(P.row - 1, 1, 2, P.startCol - 1).merge().setValue('集計期間 ▸').setFontSize(13).setFontWeight('bold')
    .setHorizontalAlignment('right').setVerticalAlignment('bottom');
  [[P.startCol, kept.start, '開始日'], [P.endCol, kept.end, '終了日']].forEach(function (c) {
    sheet.getRange(P.row - 1, c[0]).setValue(c[2]).setFontColor(T.muted).setFontSize(9).setHorizontalAlignment('center').setVerticalAlignment('bottom');
    sheet.getRange(P.row, c[0]).setValue(c[1]).setNumberFormat('yyyy/MM/dd').setFontWeight('bold').setFontSize(12)
      .setHorizontalAlignment('center').setBackground('#ffffff').setFontColor(T.ink)
      .setBorder(true, true, true, true, null, null, T.month.accent, SpreadsheetApp.BorderStyle.SOLID_MEDIUM)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false)
        .setHelpText(c[2] + '：ダブルクリックするとカレンダーが開きます。この日を含めて集計します').build());
  });
  sheet.getRange(P.row, P.endCol + 1, 1, W - P.endCol).merge()
    .setFormula('=IF(OR(' + startRef + '="",' + endRef + '=""),"　開始日と終了日を選んでください",IF(' + endRef + '<' + startRef + ',"　⚠ 終了日が開始日より前です",' +
      '"　"&TEXT(' + startRef + ',"yyyy/mm/dd")&" 〜 "&TEXT(' + endRef + ',"yyyy/mm/dd")&"（"&(' + endRef + '-' + startRef + '+1)&"日間）"))')
    .setFontColor(T.month.accent).setFontWeight('bold').setFontSize(11);
  sheet.setRowHeight(P.row - 1, 18);
  sheet.setRowHeight(P.row, 32);
  sheet.setRowHeight(P.row + 1, 12);

  // 期間の合計カード（前の同じ日数の期間と比べる）
  var prevRefs = previousPeriodRefs(startRef, endRef);
  var periodValue = function (key, s0, e0) {
    var crit = periodCriteria(s0, e0);
    return (key === '__count' ? buildCountifsFormula(vehicles, [crit]) : buildSumifsFormula(vehicles, key, crit)).substring(1);
  };
  var mTop = P.row + 2;
  PURCHASE_CARDS.forEach(function (card, i) {
    var col = PURCHASE_CARD_SPANS[i][0], n = PURCHASE_CARD_SPANS[i][1];
    var isCount = card.key === '__count';
    var accent = i === 0 ? T.ink : T.month.accent, tint = i === 0 ? '#eef1f3' : T.month.tint;
    sheet.getRange(mTop, col, 1, n).merge().setBackground(accent);
    sheet.getRange(mTop + 1, col, 1, n).merge().setValue(card.label).setBackground(tint)
      .setFontColor(accent).setFontWeight('bold').setFontSize(9).setHorizontalAlignment('left');
    sheet.getRange(mTop + 2, col, 1, n).merge().setFormula('=' + periodValue(card.key, startRef, endRef)).setBackground(tint)
      .setFontColor(T.ink).setFontSize(isCount ? 26 : 17).setFontWeight('bold').setHorizontalAlignment('left')
      .setNumberFormat(isCount ? COUNT_FORMAT : '#,##0"円";-#,##0"円";"–"');
    sheet.getRange(mTop + 3, col, 1, n).merge()
      .setFormula('="前の同期間 "&TEXT(' + periodValue(card.key, prevRefs.start, prevRefs.end) + ',"' + (isCount ? '0"台"' : '#,##0"円"').replace(/"/g, '""') + '")')
      .setBackground(tint).setFontColor(T.muted).setFontSize(9).setHorizontalAlignment('left');
    sheet.getRange(mTop, col, 4, n).setBorder(true, true, true, true, null, null, T.page, SpreadsheetApp.BorderStyle.SOLID_THICK);
  });
  sheet.setRowHeight(mTop, 6);
  sheet.setRowHeight(mTop + 1, 24);
  sheet.setRowHeight(mTop + 2, 40);
  sheet.setRowHeight(mTop + 3, 22);
  sheet.setRowHeight(mTop + 4, 18);

  // 期間に仕入れた車両の一覧（見出し → 合計行 → 一覧）
  var titleRow = mTop + 5, headerRow = titleRow + 1, totalRow = titleRow + 2, listRow = titleRow + 3;
  var colOf = function (key) { return 1 + LC.map(function (c) { return c.key; }).indexOf(key); };
  sheet.getRange(titleRow, 1, 1, 6).merge().setValue('期間に仕入れた車両').setFontSize(13).setFontWeight('bold');
  sheet.getRange(titleRow, 7, 1, W - 6).merge()
    .setFormula('=' + periodValue('__count', startRef, endRef) + '&"台　販売済みを含む・仕入年月日順"')
    .setFontColor(T.muted).setHorizontalAlignment('right');
  sheet.setRowHeight(titleRow, 34);
  sheet.getRange(headerRow, 1, 1, W).setValues([LC.map(function (c) { return c.label; })]).setBackground(T.ink).setFontColor('#ffffff')
    .setFontWeight('bold').setFontSize(9).setHorizontalAlignment('center');
  sheet.setRowHeight(headerRow, 30);

  var firstMoney = 1 + LC.map(function (c) { return !!c.money; }).indexOf(true);
  var below = function (col) { var L = columnLetter(col); return L + listRow + ':' + L; };
  sheet.getRange(totalRow, 1, 1, firstMoney - 1).merge()
    .setFormula('="合計　"&COUNT(' + below(colOf('purchaseDate')) + ')&"台"').setHorizontalAlignment('left');
  LC.forEach(function (c, i) {
    if (c.money) sheet.getRange(totalRow, i + 1).setFormula('=SUM(' + below(i + 1) + ')').setNumberFormat(AMOUNT_FORMAT).setHorizontalAlignment('right');
  });
  sheet.getRange(totalRow, 1, 1, W).setFontWeight('bold').setBackground(T.month.tint).setFontColor(T.month.accent)
    .setBorder(null, null, true, null, null, null, T.month.accent, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.setRowHeight(totalRow, 28);
  sheet.getRange(listRow, 1).setFormula(buildPeriodListFormula(vehicles, startRef, endRef));

  var bodyRows = Math.max(sheet.getMaxRows() - listRow + 1, 1);
  var body = sheet.getRange(listRow, 1, bodyRows, W);
  body.setBackground(null).setFontColor(T.ink);
  body.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false).setFirstRowColor('#ffffff').setSecondRowColor(T.band);
  sheet.setRowHeights(listRow, Math.min(bodyRows, 500), 26);
  sheet.getRange(listRow, colOf('purchaseDate'), bodyRows, 1).setNumberFormat(DATE_FORMAT).setHorizontalAlignment('center').setFontWeight('bold');
  sheet.getRange(listRow, colOf('ocn'), bodyRows, 1).setNumberFormat('0');
  ['ocn', 'sheetLabel', 'status', 'maker', 'category', 'staff'].forEach(function (k) {
    sheet.getRange(listRow, colOf(k), bodyRows, 1).setHorizontalAlignment('center');
  });
  LC.forEach(function (c, i) {
    if (c.money) sheet.getRange(listRow, i + 1, bodyRows, 1).setNumberFormat(AMOUNT_FORMAT).setHorizontalAlignment('right');
  });

  // 色：ステータスのチップ、シート（販売済みは灰色）
  var rules = [];
  var statusRange = sheet.getRange(listRow, colOf('status'), bodyRows, 1);
  Object.keys(T.status).forEach(function (st) {
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(st).setBackground(T.status[st].tint).setFontColor(T.status[st].accent).setRanges([statusRange]).build());
  });
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS_SOLD).setBackground('#eceff1').setFontColor('#546e7a')
    .setRanges([statusRange, sheet.getRange(listRow, colOf('sheetLabel'), bodyRows, 1)]).build());
  sheet.setConditionalFormatRules(rules);
  sheet.setFrozenRows(2);

  LC.forEach(function (c, i) { sheet.setColumnWidth(i + 1, c.width); });
  sheet.setColumnWidth(W + 1, 16);

  // 保護（警告のみ）。開始日・終了日のセルだけは自由に選べるようにする
  var protection = sheet.protect().setDescription('仕入集計（自動集計）').setWarningOnly(true);
  protection.setUnprotectedRanges([sheet.getRange(P.row, P.startCol), sheet.getRange(P.row, P.endCol)]);
  return sheet;
}

function onlySheet_(colMaps, name) {
  var o = {};
  if (colMaps[name]) o[name] = colMaps[name];
  return o;
}

/**
 * トリガー：入力時の自動整形はシンプルトリガー onEdit（設定不要）で動く。
 * 以前の版のトリガー（編集トリガー・自動読み取り）は削除し、車検証リンクの自動更新を設定する。
 *  - 時間主導：設定した間隔（最短1分）で車検証保管フォルダを確認
 *  - スプレッドシートを開いたとき：すぐに確認
 * @param {number} minutes 0 ならどちらも設定しない
 */
function setupTriggers_(minutes, report) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (h === 'handleEdit' || h === 'scheduledRun' || h === 'scheduledCertLinks' || h === 'certLinksOnOpen') ScriptApp.deleteTrigger(t);
  });
  var schedule = certLinkSchedule(minutes);
  if (!schedule) { report.push('車検証リンクの自動更新：しない（設定アプリ・メニューから手動で更新）'); return; }
  var builder = ScriptApp.newTrigger('scheduledCertLinks').timeBased();
  if (schedule.hours) builder.everyHours(schedule.hours); else builder.everyMinutes(schedule.minutes);
  builder.create();
  ScriptApp.newTrigger('certLinksOnOpen').forSpreadsheet(getSpreadsheet_()).onOpen().create();
  report.push('車検証リンクの自動更新を設定しました（' + schedule.label + '・スプレッドシートを開いたときも更新）');
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
  try { applyCalcSettings_(); } catch (err) { /* 式の設定に誤りがあっても入力の整形は続ける */ }
  var values = range.getValues();
  var linkedRows = [];

  for (var c = 0; c < numCols; c++) {
    var field = fieldAt[startCol + c];
    if (!field) continue;
    var colRange = sheet.getRange(startRow, startCol + c, numRows, 1);
    var fmt = numberFormatFor(field);
    if (fmt) colRange.setNumberFormat(fmt);
    if (field.type === 'formula') {
      // 車検残などの自動計算の列に値を入れる・貼り付けると計算が止まるため、入れた値は消す
      if (FORCED_FORMULA_KEYS.indexOf(field.key) !== -1 && sheet.getRange(1, startCol + c).getFormula()) {
        colRange.clearContent();
      }
      continue;
    }
    if (field.type === 'link') {
      // 車検証リンクが貼られた行は、あとでステータスを「名義変更済み」にする。URL を貼った場合は「車検証ﾘﾝｸ」のリンクにする
      for (var lr = 0; lr < numRows; lr++) {
        var lv = values[lr][c];
        if (isBlank(lv)) continue;
        linkedRows.push(startRow + lr);
        if (/^https?:\/\//i.test(String(lv).trim())) {
          sheet.getRange(startRow + lr, startCol + c).setRichTextValue(SpreadsheetApp.newRichTextValue()
            .setText(normalizeKanaText('車検証リンク')).setLinkUrl(String(lv).trim()).build());
        }
      }
      continue;
    }
    if (field.type === 'ocn') continue;
    var changed = false;
    var column = [];
    for (var r = 0; r < numRows; r++) {
      var res = normalizeCellValue(field, values[r][c], lists);
      column.push([res.value]);
      if (res.changed) { changed = true; values[r][c] = res.value; }
    }
    if (changed) colRange.setValues(column);
  }

  if (cols.ocn !== undefined) {
    var ocnAssigned = assignMissingOcns_(ss, sheet, cols, startRow, numRows);
    var ocnEdited = cols.ocn + 1 >= startCol && cols.ocn + 1 < startCol + numCols;
    // 次の車検証リンクの自動更新で全件を確認する（新しい OCN に合う車検証がフォルダにあればリンクを付ける）
    if (ocnAssigned || ocnEdited) PropertiesService.getScriptProperties().setProperty(PROP.CERT_PENDING, 'true');
  }

  if (linkedRows.length) markTransferred_(sheet, cols, linkedRows);


  if (MASTER_SHEETS.indexOf(name) !== -1 && cols.status !== undefined) {
    var sc = cols.status + 1;
    if (sc >= startCol && sc < startCol + numCols) {
      var soldRows = [];
      for (var sr = 0; sr < numRows; sr++) if (values[sr][sc - startCol] === STATUS_SOLD) soldRows.push(startRow + sr);
      if (soldRows.length) confirmAndMoveSold_(ss, sheet, soldRows, e.oldValue);
    }
  }
}

/** OCN の自動採番（車台番号・車種・モデル名のいずれかが入った行で、OCNが空欄なら）。採番した件数を返す */
function assignMissingOcns_(ss, sheet, cols, startRow, numRows) {
  var keys = ['chassisNumber', 'maker', 'modelName'].filter(function (k) { return cols[k] !== undefined; });
  var rows = sheet.getRange(startRow, 1, numRows, sheet.getLastColumn()).getValues();
  var targets = [];
  rows.forEach(function (row, i) {
    if (!isBlank(row[cols.ocn])) return;
    if (keys.some(function (k) { return !isBlank(row[cols[k]]); })) targets.push(startRow + i);
  });
  if (!targets.length) return 0;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return 0;
  var assigned = 0;
  try {
    targets.forEach(function (row) {
      var cell = sheet.getRange(row, cols.ocn + 1);
      if (isBlank(cell.getValue())) { cell.setNumberFormat('0').setValue(reserveOcn_(ss)); assigned++; }
    });
  } finally {
    lock.releaseLock();
  }
  return assigned;
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
  applyCalcSettings_();
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

/**
 * 時間主導トリガー：車検証保管フォルダに新しいファイルがあれば、すぐにリンクを付ける。
 * 新しいファイルが無く、OCN の採番・変更も無ければ、フォルダを見るだけで終える（全件確認は1時間に1回）。
 */
function scheduledCertLinks() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // 前回の実行中
  try {
    var settings = getSettings_();
    if (!settings.folderCert) return;
    var props = PropertiesService.getScriptProperties();
    var now = Date.now();
    var lastCheck = Number(props.getProperty(PROP.CERT_LAST_CHECK)) || 0;
    var changed = 0;
    if (lastCheck) {
      // 前回の確認より少し前からの追加・更新を探す（時計のずれ・アップロード中のファイル分の余裕）
      var q = "'" + settings.folderCert + "' in parents and trashed = false and modifiedDate > '" + driveQueryTime(lastCheck - 2 * 60 * 1000) + "'";
      var it = DriveApp.searchFiles(q);
      while (it.hasNext() && !changed) { it.next(); changed++; }
    } else {
      changed = 1; // 初回は全件
    }
    var pending = props.getProperty(PROP.CERT_PENDING) === 'true';
    props.setProperty(PROP.CERT_LAST_CHECK, String(now));
    if (!certLinkNeedsFullScan({ changedFiles: changed, pending: pending, lastFullMs: Number(props.getProperty(PROP.CERT_LAST_FULL)) || 0, nowMs: now })) return;
    props.deleteProperty(PROP.CERT_PENDING);
    props.setProperty(PROP.CERT_LAST_FULL, String(now));
    updateCertLinks();
  } catch (e) {
    appendLog_('エラー', '定期実行', '車検証リンク', '', '', e.message);
  } finally {
    lock.releaseLock();
  }
}

/** スプレッドシートを開いたとき（インストール型トリガー）：車検証リンクを更新する */
function certLinksOnOpen() {
  try {
    if (!getSettings_().folderCert) return;
    PropertiesService.getScriptProperties().setProperty(PROP.CERT_LAST_FULL, String(Date.now()));
    updateCertLinks();
  } catch (e) {
    appendLog_('エラー', '開いたとき', '車検証リンク', '', '', e.message);
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
  var count = 0, statusChanged = 0;
  var linkText = normalizeKanaText('車検証リンク');
  VEHICLE_SHEETS.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;
    var cols = getColumns_(sheet).map;
    if (cols.ocn === undefined || cols.certLink === undefined) return;
    var n = sheet.getLastRow() - 1;
    var ocns = sheet.getRange(2, cols.ocn + 1, n, 1).getValues();
    var links = sheet.getRange(2, cols.certLink + 1, n, 1).getRichTextValues();
    var linked = [];
    ocns.forEach(function (r, i) {
      var num = parseOcnNumber(r[0]);
      if (num === null || !byOcn[num]) return;
      var url = byOcn[num].file.getUrl();
      if (links[i][0] && links[i][0].getLinkUrl() === url) return;
      sheet.getRange(i + 2, cols.certLink + 1).setRichTextValue(
        SpreadsheetApp.newRichTextValue().setText(linkText).setLinkUrl(url).build());
      linked.push(i + 2);
      count++;
    });
    if (linked.length) statusChanged += markTransferred_(sheet, cols, linked);
  });
  if (count) appendLog_('車検証リンク', '車検証保管フォルダ', '', '', count + '件', 'リンクを設定しました（ステータスを名義変更済みにした行 ' + statusChanged + '件）');
  return { count: count, message: count + '件のリンクを設定しました。' + (statusChanged ? 'ステータスを「名義変更済み」にした行：' + statusChanged + '件' : '') };
}

/**
 * 車検証リンクが入った行のステータスを「名義変更済み」にする（名義変更前・空欄の行だけ。販売済みなどは変えない）。
 * @return {number} 変更した行数
 */
function markTransferred_(sheet, cols, rows) {
  if (cols.status === undefined) return 0;
  var changed = 0;
  rows.forEach(function (row) {
    var cell = sheet.getRange(row, cols.status + 1);
    var current = cell.getValue();
    var next = statusAfterCertLink(current);
    if (!next) return;
    cell.setValue(next);
    changed++;
    var ocn = cols.ocn === undefined ? '' : sheet.getRange(row, cols.ocn + 1).getDisplayValue();
    appendLog_('ステータス自動変更', ocn ? 'OCN ' + ocn : sheet.getName() + ' ' + row + '行目', 'ステータス', current, next, '車検証リンクが入ったため');
  });
  return changed;
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
  applyCalcSettings_();
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
  applyCalcSettings_();
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
