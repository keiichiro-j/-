/**
 * ScheduleConstants.gs
 * 登録スケジュール管理アプリ 共通定数定義
 */

var SCHEDULE_PROP_KEYS = {
  SHEET_ID: 'SCHEDULE_SHEET_ID',  // 登録スケジュール用スプレッドシートID
  EDITORS: 'SCHEDULE_EDITORS',    // JSON配列: 編集権限を持つメールアドレス一覧（未設定/空配列なら全員編集可）
  OFFICES: 'SCHEDULE_OFFICES'     // JSON配列: 陸運支局名一覧
};

var SCHEDULE_EVENT_TYPES = {
  HOLIDAY_OWN: 'holiday_own',
  HOLIDAY_OFFICE: 'holiday_office',
  DEADLINE_PAPER: 'deadline_paper',
  DEADLINE_OSS: 'deadline_oss',
  DEADLINE_PLATE: 'deadline_plate'
};

// 表示優先度順（先頭ほど優先。1セル内で表示上限を超えた分は「+N件」に畳む）
var SCHEDULE_EVENT_TYPE_ORDER = [
  SCHEDULE_EVENT_TYPES.DEADLINE_PLATE,
  SCHEDULE_EVENT_TYPES.DEADLINE_PAPER,
  SCHEDULE_EVENT_TYPES.DEADLINE_OSS,
  SCHEDULE_EVENT_TYPES.HOLIDAY_OFFICE,
  SCHEDULE_EVENT_TYPES.HOLIDAY_OWN
];

// requiresOffice: false の弊社休日は全支局共通のため office 指定なしで登録できる
var SCHEDULE_EVENT_TYPE_META = {
  holiday_own:    { label: '弊社休日',                 kind: 'holiday',  requiresOffice: false },
  holiday_office: { label: '陸運支局休日',              kind: 'holiday',  requiresOffice: true },
  deadline_paper: { label: '紙登録締切',                kind: 'deadline', requiresOffice: true },
  deadline_oss:   { label: 'OSS登録締切',               kind: 'deadline', requiresOffice: true },
  deadline_plate: { label: '希望番号締切（月末交付）',   kind: 'deadline', requiresOffice: true }
};

var SCHEDULE_MAX_TAGS_PER_CELL = 3;

var SCHEDULE_DEFAULT_OFFICES = ['〇〇陸運支局'];
