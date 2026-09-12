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
  WHOLESALE_ORDERS: '業販受注リスト',
  AUDIT_LOG: '変更履歴'
};

/**
 * タブごとの見出し色（タブの色・ヘッダー行の背景色の両方に使う）。5つのタブを
 * 開いたときに、どのタブを見ているか色だけで直感的に区別できるようにする
 * （SheetService.gsのapplySheetDesign_参照）。色はアプリ本体のテーマプリセット
 * （Constants.gsのTHEME_PRESETS）から流用し、アプリの配色と統一感を持たせている。
 */
var SHEET_TAB_COLORS = {};
SHEET_TAB_COLORS[SHEET_NAMES.INVENTORY] = '#2f6fae';
SHEET_TAB_COLORS[SHEET_NAMES.HOLDS] = '#a06a1f';
SHEET_TAB_COLORS[SHEET_NAMES.ORDERS] = '#1f6f4a';
SHEET_TAB_COLORS[SHEET_NAMES.WHOLESALE_ORDERS] = '#5b3a8c';
SHEET_TAB_COLORS[SHEET_NAMES.AUDIT_LOG] = '#55606b';

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
 * 業販HOLDを登録できる（normalizeHoldType_、HoldService.gs参照）。業販HOLDは、
 * 通常のHold・2nd Holdと異なりHold期限が無期限（expiresAtがnull）で、カレンダー
 * イベントも作成しない。入力項目も「販売先」のみで、未入力のままHold登録できる。
 */
var HOLD_TYPE = {
  NORMAL: 'normal',
  WHOLESALE: 'wholesale'
};

var HOLD_TYPE_LABELS = {
  normal: '通常のHOLD',
  wholesale: '業販HOLD'
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
// モデル写真1件ごとに割り当てられる「型（ボディタイプ）」の選択肢。ホーム画面
// 上部の型クイックナビ（#homeTypeNav）のボタン・カード内の型バッジに使う
// （JavaScript.htmlのrenderHomeTypeNav_・state.homeBodyTypeFilter参照）。
var MODEL_BODY_TYPE_OPTIONS = ['Sedan', 'SUV', 'Station Wagon', 'Compact', 'Coupe', 'Cabriolet/Roadster', 'Mini Van', '限定車'];
var NOTIFY_MAIL_LIST_MAX = 20; // メール通知先（Hold時／受注確定時／エラー通知）1項目あたりの最大登録件数
var NOTIFY_MAIL_MAX_LENGTH = 254; // メールアドレス1件あたりの最大文字数（RFC 5321の実務上の上限に合わせる）

/**
 * 車両情報（在庫リスト・受注リストで共通）の列定義。中古車1台ごとに固有の
 * 管理項目（区分・OCN・型式・車台番号・初年度登録日・走行距離・車検満了日・
 * 販売価格・リサイクル料・旧使用拠点・CCC入庫日・経過月・現展示拠点・
 * オプション・現名義・掲載）を持つ。
 */
var VEHICLE_COLUMNS = [
  { key: 'category', label: '区分', type: 'text', required: true, note: '車両の区分を入力してください（必須項目）。' },
  {
    key: 'ocn', label: 'ＯＣＮ', type: 'text', required: true,
    note: '在庫の有無を判定するキー列です。この列が空欄の行は、在庫リストに表示されません' +
      '（末尾の空行等とみなされます）。先頭が0で始まる値（例: 0583911111）も保持されるよう、' +
      'この列全体を「書式なしテキスト」に設定しています。Number型に戻すと先頭の0が' +
      '消えてしまうため、書式は変更しないでください。'
  },
  { key: 'model', label: 'MODEL', type: 'text', required: true, note: '型式・グレード名を表す値です（必須）。ホーム画面のモデル写真との紐付けにも使われます。' },
  { key: 'steering', label: 'ステア', type: 'select', options: STEERING_OPTIONS, note: 'ハンドル位置を「R」（右）または「L」（左）で選択してください。' },
  { key: 'exteriorColor', label: '外装色', type: 'text', note: '外装色を入力してください。' },
  { key: 'interiorColor', label: '内装色', type: 'text', note: '内装色を入力してください。' },
  // 登録番号（ナンバープレート）は「地域名／分類番号／ひらがな／一連指定番号」の
  // 4マスに分けて管理する（例: 岐阜／303／た／1247）。
  { key: 'plateRegion', label: '登録番号（地域）', type: 'text', note: '登録番号（ナンバープレート）の地域名です（例: 岐阜）。分類番号・ひらがな・一連番号は隣の列に分けて入力します。' },
  { key: 'plateClass', label: '登録番号（分類番号）', type: 'text', note: '登録番号の分類番号です（例: 303）。' },
  { key: 'plateKana', label: '登録番号（ひらがな）', type: 'text', note: '登録番号のひらがな1文字です（例: た）。' },
  { key: 'plateNumber', label: '登録番号（一連番号）', type: 'text', note: '登録番号の一連指定番号です（例: 1247）。' },
  { key: 'modelCode', label: '型式', type: 'text', note: '車両の型式コードを入力してください。' },
  { key: 'chassisNumberLast4', label: '車台番号下４桁', type: 'text', note: '車台番号の下4桁を入力してください。' },
  { key: 'firstRegistrationDate', label: '初年度登録日', type: 'date', note: '日付形式で入力してください（例: 2024-08-01）。' },
  { key: 'mileage', label: '走行距離', type: 'number', note: '走行距離を数値（km）で入力してください。' },
  { key: 'inspectionExpiryDate', label: '車検満了日', type: 'date', note: '日付形式で入力してください（例: 2026-08-01）。' },
  { key: 'salePrice', label: '販売価格', type: 'number', note: '販売価格を数値（円）で入力してください。' },
  { key: 'recycleFee', label: 'ﾘｻｲｸﾙ料', type: 'number', note: 'リサイクル料を数値（円）で入力してください。' },
  { key: 'previousLocation', label: '旧使用拠点', type: 'text', note: '車両の旧使用拠点名を入力してください。' },
  { key: 'cccArrivalDate', label: 'CCC入庫日', type: 'date', note: '日付形式で入力してください（例: 2026-01-15）。' },
  { key: 'elapsedMonths', label: '経過月', type: 'number', note: '入庫からの経過月数を数値で入力してください。' },
  { key: 'currentDisplayLocation', label: '現展示拠点', type: 'text', note: '現在車両を展示している拠点名を入力してください。' },
  {
    key: 'commission', label: 'コミッション', type: 'text',
    note: '車両を特定する社内ID（任意入力）。入力する場合、先頭が0で始まる値' +
      '（例: 0583911111）も保持されるよう、この列全体を「書式なしテキスト」に' +
      '設定しています。Number型に戻すと先頭の0が消えてしまうため、書式は変更' +
      'しないでください。'
  },
  { key: 'option', label: 'オプション', type: 'text', note: '装備されているオプションを入力してください（複数ある場合はカンマ等で区切ります）。' },
  { key: 'currentOwnerName', label: '現名義', type: 'text', note: '現在の車両名義人を入力してください。' },
  {
    key: 'listed', label: '掲載', type: 'select', options: YES_NO_OPTIONS,
    note: '中古車サイトに掲載中かどうかです。「あり」の車両は、在庫リストの背景色を' +
      '変えて一目で区別できるようにします。'
  }
];

/**
 * Hold（予約）・受注確定の共通入力項目。
 * 販売拠点／リード番号／登録月／担当者／顧客／下取車の有無／OSS登録の可否／保険加入の有無。
 * すべて必須（Hold登録・受注確定は全項目入力しないと進められない）。
 * 販売拠点はHold登録時、担当者マスタに登録された担当者本人の拠点名から自動的に
 * 入力される（編集可。JavaScript.html の currentStaffLocation_ 参照）。
 */
var HOLD_ORDER_INPUT_COLUMNS = [
  {
    key: 'salesLocation', label: '販売拠点', type: 'text', required: true,
    note: 'Hold登録時に担当者本人の拠点名が自動入力されます（必須・編集可）。'
  },
  {
    key: 'leadNumber', label: 'リード番号', type: 'text', required: true,
    note: '「L-」＋数字で保存されます（例: L-12345）。アプリからの入力では数字のみで' +
      '構いません（「L-」は自動的に付与されます）。'
  },
  {
    key: 'registeredMonth', label: '登録月', type: 'text', required: true,
    note: '「YYYY-MM」形式で入力してください（例: 2026-08）。'
  },
  { key: 'staff', label: '担当者', type: 'text', required: true, note: '担当者マスタに登録されている担当者名を入力してください（必須）。' }, // 担当者マスタから選択（SettingsService参照）
  { key: 'customer', label: '顧客', type: 'text', required: true, note: '顧客名を入力してください（必須）。' },
  { key: 'tradeIn', label: '下取車の有無', type: 'select', options: YES_NO_OPTIONS, required: true, note: '下取車の有無を「あり」または「なし」で選択してください（必須）。' },
  { key: 'oss', label: 'OSS登録の可否', type: 'select', options: OSS_OPTIONS, required: true, note: 'OSS（ワンストップサービス）登録の可否を「可」または「不可」で選択してください（必須）。' },
  { key: 'insurance', label: '保険加入の有無', type: 'select', options: YES_NO_OPTIONS, required: true, note: '保険加入の有無を「あり」または「なし」で選択してください（必須）。' },
  { key: 'paymentMethod', label: '支払方法', type: 'select', options: PAYMENT_METHOD_OPTIONS, required: true, note: '支払方法を「現金」「ローン」「リース」から選択してください（必須）。' }
];

/**
 * 在庫リスト列定義（順序 = スプレッドシートの列順）。
 * 車両情報＋Holdステータス＋備考のみ。Holdの詳細はHoldリストで別管理する。
 */
var INVENTORY_COLUMNS = VEHICLE_COLUMNS.concat([
  {
    key: 'holdStatus', label: 'Holdステータス', type: 'select', options: [HOLD_STATUS.AVAILABLE, HOLD_STATUS.HOLD],
    note: 'アプリがHold登録・解除・受注確定のたびに自動更新する値です（available＝在庫あり、' +
      'hold＝Hold中）。手動編集しないでください。'
  },
  {
    key: 'remarks', label: '備考', type: 'text',
    note: '在庫についての自由記述メモです。この列はスプレッドシートに直接入力してください' +
      '（アプリの画面からは書き込めません）。アプリ側では、在庫リストの詳細ポップアップに' +
      'ある「備考」ボタンを押すと、この内容がそのままポップアップで表示されます。' +
      'INVENTORY_COLUMNSの末尾に追加した列のため、既存のスプレッドシートには' +
      '自動では追加されません（SetupService.gsのaddRemarksColumnToInventory_参照）。'
  }
]);

/**
 * Holdリスト列定義。1台の車両につき 1st Hold・2nd Hold それぞれ1行（最大2行）。
 * commission + rank で一意に特定する。
 */
var HOLD_COLUMNS = [
  {
    key: 'commission', label: 'コミッション', type: 'text', required: true,
    note: '対象車両のコミッション（在庫リストと同じ値）です。1台につき1st・2nd Holdで' +
      'それぞれ1行になります。'
  },
  { key: 'rank', label: '順番', type: 'select', options: [HOLD_RANK.FIRST, HOLD_RANK.SECOND], required: true, note: '「1st」または「2nd」を選択してください。' },
  {
    key: 'holdType', label: 'Hold種別', type: 'select',
    options: [HOLD_TYPE.NORMAL, HOLD_TYPE.WHOLESALE],
    note: '管理者権限を持つ担当者が登録した「業販HOLD」かどうかを示します。' +
      '空欄は通常のHold（normal）として扱われます。アプリからの操作でのみ設定されるため、' +
      '通常は手動編集しないでください。'
  }
].concat(HOLD_ORDER_INPUT_COLUMNS).concat([
  {
    key: 'salesStore', label: '販売先', type: 'text',
    note: '業販HOLD（holdTypeがwholesale）の場合のみ使用する、販売先の名前です。' +
      '未入力でもHold登録できます。'
  },
  // 担当者ID（staffEmail、スプレッドシート上のラベルは「担当者ID」）は表示名「担当者」
  // ではなく、ログイン中のGoogleアカウントのメールアドレスで本人確認を行うための
  // 識別キー（canConfirmOrder_ / canCancelHold_ / canRegisterSecondHold_ 参照）。
  // 「担当者」名は表示用の別名に過ぎず編集され得るため、権限判定には必ずこちらを使う。
  {
    key: 'staffEmail', label: '担当者ID', type: 'text',
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
    key: 'staffEmail', label: '担当者ID', type: 'text',
    note: '受注確定を行った担当者の内部識別用の列です（内容はメールアドレス）。アプリからの操作でのみ設定されるため、通常は手動編集しないでください。'
  },
  { key: 'orderedAt', label: '受注確定日時', type: 'datetime', note: 'アプリが自動記録する値です。手動編集しないでください。' },
  {
    key: 'inventoryRowNumber', label: '在庫リストの元の行番号', type: 'number',
    note: '受注確定時点で在庫リストにあった行番号です。受注キャンセル（cancelOrder、' +
      'OrderService.gs参照）で、できるだけ元の位置へ車両を復元するために使う内部用の' +
      '値です。アプリが自動記録するため、手動編集しないでください。'
  }
]);

/**
 * 業販受注リスト列定義。車両情報＋「販売先」「登録月」（業販Holdから受注確定する際に
 * 入力が必要な項目はこの2つのみ）＋販売拠点・担当者（ログイン中の担当者情報から
 * 自動設定）＋受注確定日時。通常の受注リスト（ORDER_COLUMNS）と異なり、リード番号・
 * 下取車の有無・保険加入の有無・支払方法は持たない（業販＝業者向け卸売のため、
 * 通常の小売受注とは性質が異なる。現場からの要望）。
 */
var WHOLESALE_ORDER_COLUMNS = VEHICLE_COLUMNS.concat([
  { key: 'salesLocation', label: '販売拠点', type: 'text', note: '受注確定を行った担当者本人の拠点名が自動設定されます。' },
  { key: 'salesStore', label: '販売先', type: 'text', required: true, note: '業販の販売先（業者名）を入力してください（必須）。' },
  {
    key: 'registeredMonth', label: '登録月', type: 'text', required: true,
    note: '「YYYY-MM」形式で入力してください（例: 2026-08）。'
  },
  { key: 'staff', label: '担当者', type: 'text', note: '受注確定を行った担当者本人の氏名が自動設定されます。' },
  {
    key: 'staffEmail', label: '担当者ID', type: 'text',
    note: '受注確定を行った担当者の内部識別用の列です（内容はメールアドレス）。アプリからの操作でのみ設定されるため、通常は手動編集しないでください。'
  },
  { key: 'orderedAt', label: '受注確定日時', type: 'datetime', note: 'アプリが自動記録する値です。手動編集しないでください。' },
  {
    key: 'inventoryRowNumber', label: '在庫リストの元の行番号', type: 'number',
    note: '受注確定時点で在庫リストにあった行番号です。業販受注キャンセル（cancelWholesaleOrder、' +
      'OrderService.gs参照）で、できるだけ元の位置へ車両を復元するために使う内部用の' +
      '値です。アプリが自動記録するため、手動編集しないでください。'
  }
]);

/**
 * 変更履歴（監査ログ）列定義。Hold登録・2nd Hold登録・Hold解除（手動・自動）・
 * 受注確定のたびに1行追記する。「誰が・いつ・何を」の記録専用で、更新・削除は行わない
 * （AuditLogService.gs参照）。
 */
var AUDIT_LOG_COLUMNS = [
  { key: 'timestamp', label: '日時', type: 'datetime', note: 'アプリが自動記録する日時です。手動編集しないでください。' },
  { key: 'action', label: '操作', type: 'text', note: 'アプリが自動記録する操作種別です（Hold登録・受注確定 等）。手動編集しないでください。' },
  { key: 'commission', label: 'コミッション', type: 'text', note: '対象車両のコミッションです。アプリが自動記録します。' },
  { key: 'model', label: 'モデル', type: 'text', note: '対象車両のモデルです。アプリが自動記録します。' },
  { key: 'staffName', label: '担当者', type: 'text', note: '操作を行った担当者名です。アプリが自動記録します。' },
  { key: 'staffEmail', label: '担当者ID', type: 'text', note: '操作を行った担当者のメールアドレスです。アプリが自動記録します。' },
  { key: 'detail', label: '詳細', type: 'text', note: '操作の詳細内容です。アプリが自動記録します。' }
];

var INVENTORY_COL_INDEX = buildColIndex_(INVENTORY_COLUMNS);
var HOLD_COL_INDEX = buildColIndex_(HOLD_COLUMNS);
var ORDER_COL_INDEX = buildColIndex_(ORDER_COLUMNS);
var WHOLESALE_ORDER_COL_INDEX = buildColIndex_(WHOLESALE_ORDER_COLUMNS);
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

function wholesaleOrderColIndex1(key) {
  return WHOLESALE_ORDER_COL_INDEX[key] + 1;
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
  LOADING_IMAGE_URL: 'LOADING_IMAGE_URL',
  APP_TITLE: 'APP_TITLE'
};

// アプリのタイトル（ブラウザのタブ名・サイドバー/トップバーの見出し・ホーム画面へ
// 追加した場合のアイコン名として使う）の既定値。同じアプリを複数のスプレッドシート
// （拠点・店舗違い等）にひも付けて別々にデプロイした場合でも、タブや見出しの文字列で
// どちらを開いているか区別できるよう、管理者が設定タブから上書きできるようにしている
// （APP_TITLE、SettingsService.gsのcurrentAppTitle_参照）。未設定（空欄）の場合は
// この既定値のままになる。
var DEFAULT_APP_TITLE = '販売可能リスト';

// アプリタイトルの最大文字数。タブ名・見出しとして1行で収まる長さに収める
// （validateAppTitle_、SettingsService.gs参照）。
var APP_TITLE_MAX_LENGTH = 40;

// スプレッドシート自体のタイトル（Googleドライブ上のファイル名。本プロジェクトは
// コンテナバインド型のため、SpreadsheetApp.getActiveSpreadsheet()で直接取得・変更
// できる）の最大文字数。Googleドライブのファイル名としての実用上の長さに収める
// （validateSpreadsheetTitle_、SettingsService.gs参照。上のAPP_TITLEとは別物：
// APP_TITLEはこのウェブアプリ画面内の表示だけを変える設定で、スプレッドシート
// ファイル自体の名前は変更しない）。
var SPREADSHEET_TITLE_MAX_LENGTH = 100;

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

// ロゴ画像URLの最大文字数。ローディング画像と同様、Googleドライブの共有リンク／
// ファイルIDから直接画像URLに変換したうえで保存するため、data URL（ローカル
// ファイルのアップロード）ではなく変換後の外部URLの利用を前提とする
// （normalizeLogoUrl_、SettingsService.gs参照）。
var LOGO_URL_MAX_LENGTH = 1500;

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

// モデル写真1件（例: 「C」＝Cクラス全般）に紐づけられる、在庫リストのMODEL列の値
// （型番。例: 「C200」「C220d」「C18T」「C18TZ」「CLA18」「CLA18T」）を自動判定
// するための条件（gradePrefix・gradeMarker）1件あたりの最大文字数。型番を手入力で
// 列挙する代わりに、「①型番先頭のアルファベット連続部分（クラス名）がgradePrefixと
// 完全一致する」「②設定されていれば、それに続く部分にgradeMarkerがどこかに
// 含まれている」の2条件だけで、ホーム画面がその場で在庫リストと突き合わせて台数を
// 計算する（SettingsService.gs / JavaScript.htmlのleadingAlphaPrefix_・
// gradeCountsForEntry_・matchesGradeRule_参照。①②とも大文字小文字は区別しない）。
// ①を単純な前方一致ではなく完全一致にしているのは、「C」が「CLA18」まで拾って
// しまい「C20」と「CLA18」を区別できなくなるのを防ぐため。②は「含まれていれば
// 優先的に一致する」方式にすることで、gradeMarker「T」が「C18T」「C18TZ」
// 「C63T」のように位置を問わずTを含む型番をまとめて拾える一方、「CLA18」
// （Tを含まない）と「CLA18T」（Tを含む）のような、片方がもう片方に文字を継ぎ足した
// だけの型番同士も、gradeMarker「T」を設定すれば自動的に区別できる。
var MODEL_PHOTO_GRADE_RULE_MAX_LENGTH = 30;

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

// Googleドライブの共有リンク／ファイルIDを直接画像URLに変換する際に指定する幅
// （px）。ロゴは画面上部・サイドバーに小さく表示されるだけのため、ローディング画像
// より控えめな解像度で十分（normalizeLogoUrl_参照）。
var LOGO_DISPLAY_WIDTH = 800;
