/**
 * Constants.gs
 * 中古車販売可能リスト 共通定数定義
 *
 * スプレッドシートは4タブ構成：
 *   在庫リスト … 車両情報＋Holdステータスのみ
 *   Holdリスト … Hold（1st/2nd）の入力項目・開始日時・期限（車両情報とは別テーブル）
 *   受注リスト … 受注確定時に転記される車両情報＋入力項目
 *   変更履歴 … 監査ログ
 */

// ===== シート名 =====
var SHEET_NAMES = {
  INVENTORY: '在庫リスト',
  HOLDS: 'Holdリスト',
  ORDERS: '受注リスト',
  AUDIT_LOG: '変更履歴'
};

// ===== Hold 関連 =====
var HOLD_DURATION_MS = 72 * 60 * 60 * 1000; // Hold期間 72時間

var HOLD_STATUS = {
  AVAILABLE: 'available',
  HOLD: 'hold'
};

var HOLD_RANK = {
  FIRST: '1st',
  SECOND: '2nd'
};

/**
 * Hold種別。管理者権限を持つ担当者（SYSTEM_ADMIN_EMAILS）のみ、通常のHoldに加えて
 * デモカーHOLD・他店HOLDを登録できる（normalizeHoldType_、HoldService.gs参照）。
 * デモカーHOLD・他店HOLDは、通常のHold・2nd Holdと異なりHold期限が無期限（expiresAtがnull）で、
 * カレンダーイベントも作成しない。入力項目もデモカーHOLDは「リード番号・登録月」のみ、
 * 他店HOLDは「販売店」のみで、どちらも未入力のままHold登録できる。
 */
var HOLD_TYPE = {
  NORMAL: 'normal',
  DEMO: 'demo',
  OTHER_STORE: 'otherStore'
};

var HOLD_TYPE_LABELS = {
  normal: '通常のHOLD',
  demo: 'デモカーHOLD',
  otherStore: '他店HOLD'
};

// ===== 選択肢 =====
// 「右」「左」から「R」「L」表記へ変更（現場からの要望）。既存シートに保存済みの
// 「右」「左」の値は、SetupService.gsのmigrateSteeringToRL_（スプレッドシートの
// メニューから実行可能）で一括変換できる。
var STEERING_OPTIONS = ['R', 'L'];
var YES_NO_OPTIONS = ['あり', 'なし'];
var OSS_OPTIONS = ['可', '不可'];
var PAYMENT_METHOD_OPTIONS = ['現金', 'ローン', 'リース'];
var STAFF_LIST_MAX = 30; // 担当者マスタの最大登録人数
var MODEL_PHOTOS_MAX = 40; // ホーム画面のモデル写真の最大登録数
var NOTIFY_MAIL_LIST_MAX = 20; // メール通知先（Hold時／受注確定時／エラー通知）1項目あたりの最大登録件数
var NOTIFY_MAIL_MAX_LENGTH = 254; // メールアドレス1件あたりの最大文字数（RFC 5321の実務上の上限に合わせる）

/**
 * 車両情報（在庫リスト・受注リストで共通）の列定義。中古車1台ごとに固有の
 * 管理項目（区分・OCN・型式・車台番号・初年度登録日・走行距離・車検満了日・
 * 販売価格・リサイクル料・旧使用拠点・CCC入庫日・経過月・現展示拠点・
 * オプション・現名義・掲載リンク）を持つ。
 */
var VEHICLE_COLUMNS = [
  { key: 'category', label: '区分', type: 'text', required: true },
  { key: 'ocn', label: 'ＯＣＮ', type: 'text' },
  { key: 'model', label: 'MODEL', type: 'text', required: true },
  { key: 'steering', label: 'ステア', type: 'select', options: STEERING_OPTIONS },
  { key: 'exteriorColor', label: '外装色', type: 'text' },
  { key: 'interiorColor', label: '内装色', type: 'text' },
  // 登録番号（ナンバープレート）は「地域名／分類番号／ひらがな／一連指定番号」の
  // 4マスに分けて管理する（例: 岐阜／303／た／1247）。
  { key: 'plateRegion', label: '登録番号（地域）', type: 'text' },
  { key: 'plateClass', label: '登録番号（分類番号）', type: 'text' },
  { key: 'plateKana', label: '登録番号（ひらがな）', type: 'text' },
  { key: 'plateNumber', label: '登録番号（一連番号）', type: 'text' },
  { key: 'modelCode', label: '型式', type: 'text' },
  { key: 'chassisNumber', label: '車台番号', type: 'text' },
  { key: 'chassisNumberLast4', label: '下４桁', type: 'text' },
  { key: 'firstRegistrationDate', label: '初年度登録日', type: 'date' },
  { key: 'mileage', label: '走行距離', type: 'number' },
  { key: 'inspectionExpiryDate', label: '車検満了日', type: 'date' },
  { key: 'salePrice', label: '販売価格', type: 'number' },
  { key: 'recycleFee', label: 'ﾘｻｲｸﾙ料', type: 'number' },
  { key: 'previousLocation', label: '旧使用拠点', type: 'text' },
  { key: 'cccArrivalDate', label: 'CCC入庫日', type: 'date' },
  { key: 'elapsedMonths', label: '経過月', type: 'number' },
  { key: 'currentDisplayLocation', label: '現展示拠点', type: 'text' },
  {
    key: 'commission', label: 'コミッション', type: 'text', required: true,
    note: '車両を特定するID。先頭が0で始まる値（例: 0583911111）も保持されるよう、' +
      'この列全体を「書式なしテキスト」に設定しています。Number型に戻すと先頭の0が' +
      '消えてしまうため、書式は変更しないでください。'
  },
  { key: 'option', label: 'オプション', type: 'text' },
  { key: 'currentOwnerName', label: '現名義', type: 'text' },
  { key: 'listingUrl', label: '掲載リンク', type: 'link' }
];

/**
 * Hold（予約）・受注確定の共通入力項目。
 * 販売拠点／リード番号／登録月／担当者／顧客／下取車の有無／OSS登録の可否／保険加入の有無。
 * すべて必須（Hold登録・受注確定は全項目入力しないと進められない）。
 * 販売拠点はHold登録時、担当者マスタに登録された担当者本人の拠点名から自動的に
 * 入力される（編集可。JavaScript.html の currentStaffLocation_ 参照）。
 */
var HOLD_ORDER_INPUT_COLUMNS = [
  { key: 'salesLocation', label: '販売拠点', type: 'text', required: true },
  {
    key: 'leadNumber', label: 'リード番号', type: 'text', required: true,
    note: '「L-」＋数字で保存されます（例: L-12345）。アプリからの入力では数字のみで' +
      '構いません（「L-」は自動的に付与されます）。'
  },
  {
    key: 'registeredMonth', label: '登録月', type: 'text', required: true,
    note: '「YYYY-MM」形式で入力してください（例: 2026-08）。'
  },
  { key: 'staff', label: '担当者', type: 'text', required: true }, // 担当者マスタから選択（SettingsService参照）
  { key: 'customer', label: '顧客', type: 'text', required: true },
  { key: 'tradeIn', label: '下取車の有無', type: 'select', options: YES_NO_OPTIONS, required: true },
  { key: 'oss', label: 'OSS登録の可否', type: 'select', options: OSS_OPTIONS, required: true },
  { key: 'insurance', label: '保険加入の有無', type: 'select', options: YES_NO_OPTIONS, required: true },
  { key: 'paymentMethod', label: '支払方法', type: 'select', options: PAYMENT_METHOD_OPTIONS, required: true }
];

/**
 * 在庫リスト列定義（順序 = スプレッドシートの列順）。
 * 車両情報＋Holdステータスのみ。Holdの詳細はHoldリストで別管理する。
 */
var INVENTORY_COLUMNS = VEHICLE_COLUMNS.concat([
  { key: 'holdStatus', label: 'Holdステータス', type: 'select', options: [HOLD_STATUS.AVAILABLE, HOLD_STATUS.HOLD] }
]);

/**
 * Holdリスト列定義。1台の車両につき 1st Hold・2nd Hold それぞれ1行（最大2行）。
 * commission + rank で一意に特定する。
 */
var HOLD_COLUMNS = [
  { key: 'commission', label: 'コミッション', type: 'text', required: true },
  { key: 'rank', label: '順番', type: 'select', options: [HOLD_RANK.FIRST, HOLD_RANK.SECOND], required: true },
  {
    key: 'holdType', label: 'Hold種別', type: 'select',
    options: [HOLD_TYPE.NORMAL, HOLD_TYPE.DEMO, HOLD_TYPE.OTHER_STORE],
    note: '管理者権限を持つ担当者が登録した「デモカーHOLD」「他店HOLD」かどうかを示します。' +
      '空欄は通常のHold（normal）として扱われます。アプリからの操作でのみ設定されるため、' +
      '通常は手動編集しないでください。'
  }
].concat(HOLD_ORDER_INPUT_COLUMNS).concat([
  {
    key: 'salesStore', label: '販売店', type: 'text',
    note: '他店HOLD（holdTypeがotherStore）の場合のみ使用する、販売先の店舗名です。' +
      '未入力でもHold登録できます。'
  },
  // 担当者メール（staffEmail）は表示名「担当者」ではなく、ログイン中のGoogleアカウントの
  // メールアドレスで本人確認を行うための識別キー（canConfirmOrder_ / canCancelHold_ /
  // canRegisterSecondHold_ 参照）。「担当者」名は表示用の別名に過ぎず編集され得るため、
  // 権限判定には必ずこちらを使う。
  {
    key: 'staffEmail', label: '担当者メール', type: 'text',
    note: 'Hold解除・受注確定の本人確認に使う内部用の列です（表示名ではなくこちらで' +
      '照合します）。アプリからの操作でのみ設定されるため、通常は手動編集しないで' +
      'ください。やむを得ず手動で修正する場合も、前後の空白を入れないでください' +
      '（大文字小文字の違いは無視されますが、値そのものが異なると本人でも' +
      '解除・受注確定ができなくなります）。'
  },
  { key: 'createdAt', label: '開始日時', type: 'datetime', note: 'アプリが自動記録する値です。手動編集しないでください。' },
  { key: 'expiresAt', label: '期限', type: 'datetime', note: 'Hold期限（開始日時の72時間後）。アプリが自動計算する値です。手動編集しないでください。' },
  // Hold登録者本人のGoogleカレンダーに作成した期限リマインドイベントのID。
  // Hold解除・受注確定時に、このIDを使って該当イベントを削除する（CalendarService.gs参照）。
  {
    key: 'calendarEventId', label: 'カレンダーイベントID', type: 'text',
    note: 'Hold登録者本人のGoogleカレンダーに作成した期限リマインドイベントのIDです。' +
      'アプリが自動設定・削除する値のため、手動編集しないでください。'
  }
]);

/**
 * 受注リスト列定義。車両情報＋Hold・受注共通入力項目（販売拠点を含む）＋受注確定日時。
 */
var ORDER_COLUMNS = VEHICLE_COLUMNS.concat(HOLD_ORDER_INPUT_COLUMNS).concat([
  {
    key: 'staffEmail', label: '担当者メール', type: 'text',
    note: '受注確定を行った担当者の内部識別用の列です。アプリからの操作でのみ設定されるため、通常は手動編集しないでください。'
  },
  { key: 'orderedAt', label: '受注確定日時', type: 'datetime', note: 'アプリが自動記録する値です。手動編集しないでください。' }
]);

/**
 * 変更履歴（監査ログ）列定義。Hold登録・2nd Hold登録・Hold解除（手動・自動）・
 * 受注確定のたびに1行追記する。「誰が・いつ・何を」の記録専用で、更新・削除は行わない
 * （AuditLogService.gs参照）。
 */
var AUDIT_LOG_COLUMNS = [
  { key: 'timestamp', label: '日時', type: 'datetime' },
  { key: 'action', label: '操作', type: 'text' },
  { key: 'commission', label: 'コミッション', type: 'text' },
  { key: 'model', label: 'モデル', type: 'text' },
  { key: 'staffName', label: '担当者', type: 'text' },
  { key: 'staffEmail', label: '担当者メール', type: 'text' },
  { key: 'detail', label: '詳細', type: 'text' }
];

var INVENTORY_COL_INDEX = buildColIndex_(INVENTORY_COLUMNS);
var HOLD_COL_INDEX = buildColIndex_(HOLD_COLUMNS);
var ORDER_COL_INDEX = buildColIndex_(ORDER_COLUMNS);
var AUDIT_LOG_COL_INDEX = buildColIndex_(AUDIT_LOG_COLUMNS);

function buildColIndex_(columns) {
  var map = {};
  columns.forEach(function (c, i) { map[c.key] = i; }); // 0-indexed
  return map;
}

function inventoryColIndex1(key) {
  return INVENTORY_COL_INDEX[key] + 1; // 1-indexed（Range操作用）
}

function holdColIndex1(key) {
  return HOLD_COL_INDEX[key] + 1;
}

function orderColIndex1(key) {
  return ORDER_COL_INDEX[key] + 1;
}

function auditLogColIndex1(key) {
  return AUDIT_LOG_COL_INDEX[key] + 1;
}

// ===== 設定機能のプロパティキー =====
// THEME_KEYのみ、ログイン中のGoogleアカウントごとに独立して保存したいため
// PropertiesService.getUserProperties()（アカウント単位）に、それ以外
// （ロゴ・メール通知先・担当者マスタ・モデル写真）は全利用者共通の
// システムマスタとしてPropertiesService.getScriptProperties()（スクリプト単位）
// に保存する（SettingsService.gs参照）。保存先のストアが異なるだけで、
// キー名（文字列）自体は同じ命名で問題ない。サイドバーの色は表示設定
// （THEME_PRESETSのsidebarColor）とセットになったため、独立したプロパティは
// 持たない。
var PROP_KEYS = {
  THEME_KEY: 'THEME_KEY',
  LOGO_URL: 'LOGO_URL',
  NOTIFY_HOLD_MAIL_TO: 'NOTIFY_HOLD_MAIL_TO',
  NOTIFY_ORDER_MAIL_TO: 'NOTIFY_ORDER_MAIL_TO',
  NOTIFY_ERROR_MAIL_TO: 'NOTIFY_ERROR_MAIL_TO',
  NOTIFY_CHAT_WEBHOOK_URL: 'NOTIFY_CHAT_WEBHOOK_URL',
  STAFF_LIST: 'STAFF_LIST',
  MODEL_PHOTOS: 'MODEL_PHOTOS',
  CELEBRATION_VARIANTS: 'CELEBRATION_VARIANTS',
  HOME_ANNOUNCEMENT: 'HOME_ANNOUNCEMENT',
  LOADING_IMAGE_URL: 'LOADING_IMAGE_URL'
};

/**
 * Hold登録・2nd Hold登録・受注確定それぞれの完了時に表示する演出（絵柄の
 * アクション）の選択肢キー。管理者（SYSTEM_ADMIN_EMAILS）が設定タブから
 * 選べるようにする（CELEBRATION_VARIANT_LABELS・SettingsService.gsの
 * normalizeCelebrationVariants_参照。案内メッセージ自体は固定で、絵柄の
 * 演出だけが切り替わる。実際の演出内容自体はクライアント側
 * （JavaScript.htmlのCELEBRATION_EFFECTS）で定義する）。
 */
var CELEBRATION_VARIANT_OPTIONS = ['A', 'B', 'C', 'D'];
var DEFAULT_CELEBRATION_VARIANTS = { hold: 'A', secondHold: 'A', order: 'A' };
// 設定タブのプルダウンに表示するラベル（クライアント側のCELEBRATION_EFFECTSと
// 対応させておくこと）。D はどのアクションでも既存の演出パーツを最も多く
// 重ね掛けした、最も派手な演出にしている（JavaScript.htmlのCELEBRATION_EFFECTS参照）。
var CELEBRATION_VARIANT_LABELS = {
  hold: {
    A: 'エール（応援の掛け声）', B: '応援フラッグ', C: 'ガッツポーズ',
    D: '全力エール'
  },
  secondHold: {
    A: '砂時計', B: 'コーヒーブレイク', C: '少々お待ちを',
    D: '大歓声で応援'
  },
  order: {
    A: '紙吹雪＋風船（既定）', B: '花火', C: '祝福シャワー',
    D: '祝賀フィナーレ'
  }
};

/**
 * テーマ（配色）の「着せ替え」プリセット一覧。以前は配色を自由な色指定（カラーピッカー）で
 * 選ばせていたが、組み合わせによってはコントラスト比が不足し文字が読みにくくなる懸念が
 * あったため、あらかじめWCAG AA基準（ボタン塗り用途で白文字とのコントラスト比4.5:1以上、
 * 文字用途で背景（--surface）とのコントラスト比4.6:1以上）を満たすことを確認済みの
 * 11色から選択する方式にしている（JavaScript.htmlのapplyTheme参照）。
 *   primary      … ボタン塗り・境界線・アクセント用
 *   primaryDark  … ホバー時などに使う、primaryを少し暗くした色
 *   primaryText  … 背景の上に「文字として」使う色。ベース配色がウォームアイボリー
 *                  （白系、Stylesheet.html参照）になったため、primaryよりも
 *                  濃くしてコントラスト比4.6:1以上を確保している（以前の暗い背景
 *                  向け配色では逆にprimaryより明るい色にしていた）。
 *   sidebarColor … PCビュー左端のサイドバー（項目タブ）の背景色。以前はサイドバーの
 *                  色だけ独立したカラーピッカーで自由に指定できたが、「サイドバーの色と
 *                  表示設定（着せ替え）はセットにしてほしい」という要望を受け、
 *                  プリセット1つでアプリ全体の配色とサイドバーの配色の両方が一括で
 *                  切り替わるようにした。サイドバーの文字色自体は固定せず、この背景色に
 *                  対してコントラスト比が高いほう（白／濃色）をapplySidebarColor_
 *                  （JavaScript.html）が毎回自動計算するため、いずれも十分暗い色にして
 *                  あれば個別のコントラスト検証は不要（白文字側が常に選ばれ、かつ
 *                  10:1以上の余裕を確保できる濃さにしてある）。
 */
var THEME_PRESETS = [
  { key: 'steel', name: 'ブリリアントブルー', primary: '#2f6fae', primaryDark: '#102a43', primaryText: '#2f6fae', sidebarColor: '#1f3a5c' },
  { key: 'graphite', name: 'グラファイトグレー', primary: '#55606b', primaryDark: '#424b53', primaryText: '#687787', sidebarColor: '#3a4149' },
  { key: 'wine', name: 'ヒヤシンスレッド', primary: '#8c2f39', primaryDark: '#6d252c', primaryText: '#e32439', sidebarColor: '#4a1c22' },
  { key: 'green', name: 'エメラルドグリーン', primary: '#1f6f4a', primaryDark: '#18573a', primaryText: '#258559', sidebarColor: '#163f2c' },
  { key: 'amber', name: 'カラハリゴールド', primary: '#a06a1f', primaryDark: '#7d5318', primaryText: '#9f6a1f', sidebarColor: '#4a3413' },
  { key: 'purple', name: 'アメジスト', primary: '#5b3a8c', primaryDark: '#472d6d', primaryText: '#904df5', sidebarColor: '#33224d' },
  { key: 'petrol', name: 'カヴァンサイトブルー', primary: '#1f6f78', primaryDark: '#18575e', primaryText: '#24818a', sidebarColor: '#123f44' },
  { key: 'mono', name: 'セレナイトグレー', primary: '#4a4e55', primaryDark: '#3a3d42', primaryText: '#6f7682', sidebarColor: '#2b2e33' },
  { key: 'obsidian', name: 'オブシディアンブラック', primary: '#33383d', primaryDark: '#202327', primaryText: '#52585f', sidebarColor: '#18191b' },
  { key: 'cardinal', name: 'カーディナルレッド', primary: '#b5222c', primaryDark: '#8c1a21', primaryText: '#b5222c', sidebarColor: '#4d1015' },
  { key: 'denim', name: 'デニムブルー', primary: '#3d6690', primaryDark: '#2c4d70', primaryText: '#3d6690', sidebarColor: '#1c3247' }
];

var DEFAULT_THEME_KEY = 'steel';

/**
 * 「ランダム（ログインのたび変化）」を表す特別なテーマキー。THEME_PRESETSの
 * 実体は持たず、選択するとアプリを開く（ログインする）たびにTHEME_PRESETSから
 * ランダムに1つ選んで適用する（JavaScript.htmlのresolveThemePresetForSession_参照）。
 * normalizeThemeKey_はTHEME_PRESETSのキーに加えてこのキーも有効として扱う。
 */
var RANDOM_THEME_KEY = 'random';

// 設定タブの「システムマスタ」（メール通知設定・担当者）にアクセスできる
// Googleアカウントのメールアドレス一覧（大文字小文字は区別しない）。
// 担当者マスタのようにスプレッドシート/画面から編集できる項目ではなく、
// 意図的にコードにのみ記述する（Api.gs参照）。管理者は複数人登録できる。
// 例: ['admin1@example.com', 'admin2@example.com']
// TODO: 実際のシステム管理者のメールアドレスに差し替えてください。
var SYSTEM_ADMIN_EMAILS = ['jimny.girl.2000@gmail.com'];

// ロゴ（画像URL、またはアップロード時のdata URL）の最大文字数。
// Script Propertiesは1プロパティあたり9KB（=9216文字程度）が上限のため、
// 余裕を持ってこの文字数を超える場合は保存時にエラーにする（SettingsService.gs参照）。
var LOGO_URL_MAX_LENGTH = 9000;

// Google ChatのWebhook URL（受信Webhook）の最大文字数。実際のURLは200文字前後だが、
// 余裕を持った上限にしている（validateChatWebhookUrl_、SettingsService.gs参照）。
var CHAT_WEBHOOK_URL_MAX_LENGTH = 1000;

// モデル写真1件あたりのURLの最大文字数（署名付きURL等、長めの共有リンクにも
// 対応できるようある程度余裕を持たせている。data URLではなく外部URLの利用を
// 前提とする。SettingsService.gs参照）。
var MODEL_PHOTO_URL_MAX_LENGTH = 1500;

// Googleドライブの共有リンクを直接画像URLに変換する際に指定する幅（px）。
// ホーム画面のモデル写真タイルは最大でも480px幅（クローズアップ表示時）のため、
// 高解像度ディスプレイ（2倍相当）でも十分な解像度になるよう余裕を持たせている
// （normalizeModelPhotoUrl_、SettingsService.gs参照）。
var MODEL_PHOTO_DISPLAY_WIDTH = 1000;

// モデル写真設定全体（JSON化した状態）の最大文字数。最大MODEL_PHOTOS_MAX件分の
// URLをまとめて1つのScript Propertyへ保存するため、1件あたりの上限だけでは
// 「件数×上限文字数」が実際の保存上限（1プロパティあたり9KB＝9216文字程度）を
// 超えてしまう可能性がある。そのため合計文字数についても余裕を持った上限で
// 別途チェックする（SettingsService.gs参照）。
var MODEL_PHOTOS_TOTAL_MAX_LENGTH = 8000;

// お知らせ（管理者が設定タブから入力し、ホーム画面の「販売可能リスト」の文字の上に
// 全利用者向けに表示する案内文。例:「限定車在庫3台あり」）の最大文字数。1行で
// 目立たせて表示する想定のため短めの上限にしている（validateHomeAnnouncement_、
// SettingsService.gs参照）。
var HOME_ANNOUNCEMENT_MAX_LENGTH = 60;

// 起動時ローディング画面（#appLoading）に表示する画像のURLの最大文字数。
// モデル写真と同様、Googleドライブの共有リンク／ファイルIDから直接画像URLに
// 変換したうえで保存するため、data URLではなく変換後の外部URLの利用を前提とする
// （normalizeLoadingImageUrl_、SettingsService.gs参照）。
var LOADING_IMAGE_URL_MAX_LENGTH = 1500;

// Googleドライブの共有リンク／ファイルIDを直接画像URLに変換する際に指定する幅
// （px）。ローディング画面は全画面表示になり得るため、モデル写真
// （MODEL_PHOTO_DISPLAY_WIDTH）より大きめの解像度にしている
// （normalizeLoadingImageUrl_参照）。
var LOADING_IMAGE_DISPLAY_WIDTH = 1600;
