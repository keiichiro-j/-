/**
 * Api.gs
 * クライアント（html/JavaScript.html）から google.script.run 経由で呼び出すAPI。
 * 画面単位の機能（企画書 6. 画面構成）に対応する。
 */

// ============ ①セット一覧画面 ============

/**
 * ホーム画面の初期データ（過去のセット一覧＋テーマ設定）
 */
function apiGetHome() {
  var sets = readAllRows_(getSheet_(SHEET_NAMES.SETS), SETS_COL_INDEX)
    .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); })
    .map(formatSetSummary_);
  return { sets: sets, theme: apiGetSettings().theme };
}

function formatSetSummary_(set) {
  return {
    id: set.id,
    examName: set.examName,
    questionCount: set.questionCount,
    status: set.status,
    answeredCount: set.answeredCount,
    gradedCount: set.gradedCount,
    correctCount: set.correctCount,
    score: set.score === '' ? null : set.score,
    createdAt: set.createdAt,
    updatedAt: set.updatedAt
  };
}

// ============ ②設定画面（新規セット作成） ============

/**
 * 新規解答セットを作成する。
 * @param {string} examName
 * @param {number} questionCount
 * @param {{qType, choiceCount}} bulkConfig - 一括設定
 * @param {Array<{from,to,qType,choiceCount}>} overrides - 個別上書き
 * @return {string} setId
 */
function apiCreateSet(examName, questionCount, bulkConfig, overrides) {
  examName = String(examName || '').trim();
  if (!examName) throw new Error('資格名・試験名を入力してください');
  if (!validateQuestionCount(questionCount)) {
    throw new Error('問題数は' + MIN_QUESTION_COUNT + '〜' + MAX_QUESTION_COUNT + 'の範囲で指定してください');
  }
  var configs = buildQuestionConfigs(questionCount, bulkConfig, overrides);

  var id = generateId_();
  var now = nowIso_();
  var setsSheet = getSheet_(SHEET_NAMES.SETS);
  var setRow = {
    id: id,
    examName: examName,
    questionCount: questionCount,
    status: SET_STATUS.ANSWERING,
    answeredCount: 0,
    gradedCount: 0,
    correctCount: 0,
    score: '',
    createdAt: now,
    updatedAt: now
  };
  setsSheet.appendRow(rowFromObject_(setRow, SETS_COLUMNS));

  var answersSheet = getSheet_(SHEET_NAMES.ANSWERS);
  var rows = configs.map(function (c) {
    return rowFromObject_({
      setId: id,
      no: c.no,
      qType: c.qType,
      choiceCount: c.qType === QUESTION_TYPES.CHOICE ? c.choiceCount : '',
      userAnswer: '',
      correctAnswer: '',
      memo: '',
      judgment: '',
      updatedAt: now
    }, ANSWERS_COLUMNS);
  });
  if (rows.length > 0) {
    answersSheet.getRange(answersSheet.getLastRow() + 1, 1, rows.length, ANSWERS_COLUMNS.length).setValues(rows);
  }
  return id;
}

// ============ ③解答入力画面 / ④採点・結果画面 ============

/**
 * セットの詳細（セット情報＋全問の解答行）を取得する
 */
function apiGetSetDetail(setId) {
  var set = findSetRow_(setId);
  if (!set) throw new Error('指定された解答セットが見つかりません');
  var answers = readAllRows_(getSheet_(SHEET_NAMES.ANSWERS), ANSWERS_COL_INDEX)
    .filter(function (a) { return a.setId === setId; })
    .sort(function (a, b) { return Number(a.no) - Number(b.no); })
    .map(function (a) {
      return {
        no: a.no,
        qType: a.qType,
        choiceCount: a.choiceCount,
        userAnswer: a.userAnswer,
        correctAnswer: a.correctAnswer,
        memo: a.memo,
        judgment: a.judgment
      };
    });
  return { set: formatSetSummary_(set), answers: answers };
}

/**
 * 解答入力画面からの自動保存（企画書 5.2）。
 * @param {string} setId
 * @param {Array<{no:number, userAnswer:string, memo:string}>} updates
 */
function apiSaveAnswers(setId, updates) {
  applyAnswerUpdates_(setId, updates || [], function (row, u) {
    if (u.userAnswer !== undefined) row.userAnswer = u.userAnswer;
    if (u.memo !== undefined) row.memo = u.memo;
  });
  return recomputeAndSaveSetStats_(setId);
}

/**
 * 採点・結果画面からの正解／自己判定の保存（企画書 5.3）。
 * @param {string} setId
 * @param {Array<{no:number, correctAnswer:string, judgment:string}>} updates
 */
function apiSaveGrading(setId, updates) {
  applyAnswerUpdates_(setId, updates || [], function (row, u) {
    if (u.correctAnswer !== undefined) row.correctAnswer = u.correctAnswer;
    if (u.judgment !== undefined) row.judgment = u.judgment;
  });
  return recomputeAndSaveSetStats_(setId);
}

function applyAnswerUpdates_(setId, updates, applyFn) {
  if (updates.length === 0) return;
  var sheet = getSheet_(SHEET_NAMES.ANSWERS);
  var rows = readAllRows_(sheet, ANSWERS_COL_INDEX).filter(function (a) { return a.setId === setId; });
  var byNo = {};
  rows.forEach(function (r) { byNo[Number(r.no)] = r; });
  var now = nowIso_();

  updates.forEach(function (u) {
    var row = byNo[Number(u.no)];
    if (!row) return;
    applyFn(row, u);
    row.updatedAt = now;
    sheet.getRange(row._row, 1, 1, ANSWERS_COLUMNS.length).setValues([rowFromObject_(row, ANSWERS_COLUMNS)]);
  });
}

function recomputeAndSaveSetStats_(setId) {
  var answers = readAllRows_(getSheet_(SHEET_NAMES.ANSWERS), ANSWERS_COL_INDEX)
    .filter(function (a) { return a.setId === setId; });
  var stats = computeSetStats(answers);

  var setsSheet = getSheet_(SHEET_NAMES.SETS);
  var set = findSetRow_(setId, setsSheet);
  if (!set) return stats;
  set.status = stats.status;
  set.answeredCount = stats.answered;
  set.gradedCount = stats.graded;
  set.correctCount = stats.correctCount;
  set.score = stats.percentage === null ? '' : stats.percentage;
  set.updatedAt = nowIso_();
  setsSheet.getRange(set._row, 1, 1, SETS_COLUMNS.length).setValues([rowFromObject_(set, SETS_COLUMNS)]);
  return stats;
}

function findSetRow_(setId, sheetOpt) {
  var sheet = sheetOpt || getSheet_(SHEET_NAMES.SETS);
  var rows = readAllRows_(sheet, SETS_COL_INDEX);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === setId) return rows[i];
  }
  return null;
}

// ============ ⑤アプリ設定画面 ============

function apiGetSettings() {
  var theme = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.THEME) || DEFAULT_THEME;
  return { theme: theme };
}

function apiSaveSettings(theme) {
  if (['light', 'dark', 'system'].indexOf(theme) === -1) throw new Error('不正なテーマです');
  PropertiesService.getScriptProperties().setProperty(PROP_KEYS.THEME, theme);
  return { theme: theme };
}
