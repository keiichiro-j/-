/**
 * ScoringService.gs
 * スプレッドシート／GASサービスに依存しない純粋ロジック。
 * 企画書 5.1（出題形式設定）・5.3（自己採点）に対応。
 * tests/run.js から Node.js の vm サンドボックスへ読み込んで単体テストする。
 */

/**
 * 問題数のバリデーション（企画書 5.1: 1〜100問）
 */
function validateQuestionCount(n) {
  var v = Number(n);
  return Number.isInteger(v) && v >= MIN_QUESTION_COUNT && v <= MAX_QUESTION_COUNT;
}

/**
 * 選択肢数のバリデーション（企画書 5.1: 2〜任意の数。上限は運用上10とする）
 */
function validateChoiceCount(n) {
  var v = Number(n);
  return Number.isInteger(v) && v >= MIN_CHOICE_COUNT && v <= MAX_CHOICE_COUNT;
}

/**
 * 選択肢数から a, b, c... のラベル配列を生成する
 */
function choiceLetters(count) {
  var letters = [];
  for (var i = 0; i < count; i++) {
    letters.push(String.fromCharCode(97 + i)); // 'a' start
  }
  return letters;
}

/**
 * 「全問○択にする」等の一括設定＋問題ごとの個別上書き（企画書 5.1）から
 * 問題番号ごとの出題形式配列を組み立てる。
 * @param {number} questionCount
 * @param {{qType:string, choiceCount:number}} bulkConfig - 一括設定（デフォルト）
 * @param {Array<{from:number, to:number, qType:string, choiceCount:number}>} overrides - 個別上書き（範囲指定）。配列の後ろが優先。
 * @return {Array<{no:number, qType:string, choiceCount:number}>}
 */
function buildQuestionConfigs(questionCount, bulkConfig, overrides) {
  if (!validateQuestionCount(questionCount)) {
    throw new Error('問題数は' + MIN_QUESTION_COUNT + '〜' + MAX_QUESTION_COUNT + 'の範囲で指定してください');
  }
  var base = normalizeQuestionConfig_(bulkConfig);
  var configs = [];
  for (var no = 1; no <= questionCount; no++) {
    configs.push({ no: no, qType: base.qType, choiceCount: base.choiceCount });
  }
  (overrides || []).forEach(function (ov) {
    var conf = normalizeQuestionConfig_(ov);
    var from = Math.max(1, Number(ov.from) || 1);
    var to = Math.min(questionCount, Number(ov.to) || from);
    for (var no = from; no <= to; no++) {
      configs[no - 1].qType = conf.qType;
      configs[no - 1].choiceCount = conf.choiceCount;
    }
  });
  return configs;
}

function normalizeQuestionConfig_(config) {
  var qType = (config && config.qType === QUESTION_TYPES.TEXT) ? QUESTION_TYPES.TEXT : QUESTION_TYPES.CHOICE;
  var choiceCount = DEFAULT_CHOICE_COUNT;
  if (qType === QUESTION_TYPES.CHOICE) {
    var c = config && config.choiceCount;
    choiceCount = validateChoiceCount(c) ? Number(c) : DEFAULT_CHOICE_COUNT;
  }
  return { qType: qType, choiceCount: choiceCount };
}

/**
 * 文字列の前後空白除去・大文字小文字を無視した比較用正規化
 */
function normalizeAnswerText_(s) {
  return String(s == null ? '' : s).trim().toLowerCase();
}

/**
 * 選択式の自動正誤判定
 */
function judgeChoice_(userAnswer, correctAnswer) {
  var correctNorm = normalizeAnswerText_(correctAnswer);
  if (!correctNorm) return JUDGMENTS.NONE;
  var userNorm = normalizeAnswerText_(userAnswer);
  if (!userNorm) return JUDGMENTS.WRONG;
  return userNorm === correctNorm ? JUDGMENTS.CORRECT : JUDGMENTS.WRONG;
}

/**
 * 1問分の実効判定（選択式は自動判定、記述式は自己申告の判定をそのまま使う）
 */
function effectiveJudgment(row) {
  if (row.qType === QUESTION_TYPES.CHOICE) {
    return judgeChoice_(row.userAnswer, row.correctAnswer);
  }
  var j = row.judgment;
  return (j === JUDGMENTS.CORRECT || j === JUDGMENTS.PARTIAL || j === JUDGMENTS.WRONG) ? j : JUDGMENTS.NONE;
}

/**
 * 解答セット全体の集計（企画書 5.3: 正答率、5.4: 履歴の正答率推移の元データ）
 * @param {Array<{qType, userAnswer, correctAnswer, judgment}>} rows
 * @return {{total:number, answered:number, graded:number, correctCount:number, partialCount:number, wrongCount:number, percentage:(number|null), status:string}}
 */
function computeSetStats(rows) {
  rows = rows || [];
  var total = rows.length;
  var answered = 0;
  var graded = 0;
  var correctCount = 0;
  var partialCount = 0;
  var wrongCount = 0;

  rows.forEach(function (row) {
    if (normalizeAnswerText_(row.userAnswer)) answered++;
    var j = effectiveJudgment(row);
    if (j !== JUDGMENTS.NONE) {
      graded++;
      if (j === JUDGMENTS.CORRECT) correctCount++;
      else if (j === JUDGMENTS.PARTIAL) partialCount++;
      else if (j === JUDGMENTS.WRONG) wrongCount++;
    }
  });

  var percentage = graded > 0 ? Math.round((correctCount / graded) * 1000) / 10 : null;
  var status = (total > 0 && graded === total) ? SET_STATUS.GRADED : SET_STATUS.ANSWERING;

  return {
    total: total,
    answered: answered,
    graded: graded,
    correctCount: correctCount,
    partialCount: partialCount,
    wrongCount: wrongCount,
    percentage: percentage,
    status: status
  };
}
