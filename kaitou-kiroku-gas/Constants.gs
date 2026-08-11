/**
 * Constants.gs
 * 資格試験 解答記録アプリ 共通定数定義
 * （企画書 5. 主要機能 / 6. 画面構成 を参照）
 */

// ===== シート名 =====
var SHEET_NAMES = {
  SETS: 'Sets',
  ANSWERS: 'Answers'
};

// ===== 出題形式 =====
var QUESTION_TYPES = {
  CHOICE: 'choice',
  TEXT: 'text'
};

// ===== 記述式の自己採点区分（企画書 5.3） =====
var JUDGMENTS = {
  CORRECT: '○',
  PARTIAL: '△',
  WRONG: '✕',
  NONE: ''
};

// ===== 解答セットのステータス =====
var SET_STATUS = {
  ANSWERING: 'answering', // 解答入力中・未採点
  GRADED: 'graded'        // 採点済み（全問に正解／自己判定が入力済み）
};

// ===== 問題数の上限（企画書 5.1） =====
var MAX_QUESTION_COUNT = 100;
var MIN_QUESTION_COUNT = 1;

// ===== 選択肢数の上限（企画書 5.1: 2〜任意の数） =====
var MAX_CHOICE_COUNT = 10;
var MIN_CHOICE_COUNT = 2;
var DEFAULT_CHOICE_COUNT = 4;

// ===== Sets シート 列定義 =====
var SETS_COLUMNS = [
  { key: 'id', label: 'id' },
  { key: 'examName', label: '試験名' },
  { key: 'questionCount', label: '問題数' },
  { key: 'status', label: 'ステータス' },
  { key: 'answeredCount', label: '回答済み数' },
  { key: 'gradedCount', label: '採点済み数' },
  { key: 'correctCount', label: '正解数' },
  { key: 'score', label: '正答率' },
  { key: 'createdAt', label: '作成日時' },
  { key: 'updatedAt', label: '更新日時' }
];
var SETS_HEADER_ROW = SETS_COLUMNS.map(function (c) { return c.label; });
var SETS_COL_INDEX = (function () {
  var map = {};
  SETS_COLUMNS.forEach(function (c, i) { map[c.key] = i; });
  return map;
})();

// ===== Answers シート 列定義（1解答セット x 1問題 = 1行） =====
var ANSWERS_COLUMNS = [
  { key: 'setId', label: 'setId' },
  { key: 'no', label: '問題番号' },
  { key: 'qType', label: '出題形式' },
  { key: 'choiceCount', label: '選択肢数' },
  { key: 'userAnswer', label: '解答' },
  { key: 'correctAnswer', label: '正解' },
  { key: 'memo', label: '備考' },
  { key: 'judgment', label: '判定' },
  { key: 'updatedAt', label: '更新日時' }
];
var ANSWERS_HEADER_ROW = ANSWERS_COLUMNS.map(function (c) { return c.label; });
var ANSWERS_COL_INDEX = (function () {
  var map = {};
  ANSWERS_COLUMNS.forEach(function (c, i) { map[c.key] = i; });
  return map;
})();

// ===== Script Properties キー =====
var PROP_KEYS = {
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  THEME: 'THEME' // 'light' | 'dark' | 'system'
};

var DB_SPREADSHEET_NAME = '資格試験解答記録アプリ_DB';
var DEFAULT_THEME = 'system';
