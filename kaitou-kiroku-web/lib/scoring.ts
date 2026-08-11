/**
 * lib/scoring.ts
 * 外部サービス（Sheets等）に依存しない純粋ロジック。
 * 企画書 5.1（出題形式設定）・5.3（自己採点）に対応。
 * kaitou-kiroku-gas/ScoringService.gs のTypeScript移植版。
 */

export class ValidationError extends Error {}

export const MIN_QUESTION_COUNT = 1;
export const MAX_QUESTION_COUNT = 100;
export const MIN_CHOICE_COUNT = 2;
export const MAX_CHOICE_COUNT = 10;
export const DEFAULT_CHOICE_COUNT = 4;

export const JUDGMENTS = {
  CORRECT: '○',
  PARTIAL: '△',
  WRONG: '✕',
  NONE: '',
} as const;
export type Judgment = (typeof JUDGMENTS)[keyof typeof JUDGMENTS];

export const SET_STATUS = {
  ANSWERING: 'answering',
  GRADED: 'graded',
} as const;
export type SetStatus = (typeof SET_STATUS)[keyof typeof SET_STATUS];

export type QuestionType = 'choice' | 'text';

export interface QuestionConfig {
  no: number;
  qType: QuestionType;
  choiceCount: number;
}

export interface BulkConfig {
  qType: QuestionType;
  choiceCount: number;
}

export interface OverrideRange {
  from: number;
  to: number;
  qType: QuestionType;
  choiceCount: number;
}

export interface AnswerRow {
  no: number;
  qType: QuestionType;
  choiceCount: number;
  userAnswer: string;
  correctAnswer: string;
  memo: string;
  judgment: Judgment | '';
}

export function validateQuestionCount(n: unknown): boolean {
  const v = Number(n);
  return Number.isInteger(v) && v >= MIN_QUESTION_COUNT && v <= MAX_QUESTION_COUNT;
}

export function validateChoiceCount(n: unknown): boolean {
  const v = Number(n);
  return Number.isInteger(v) && v >= MIN_CHOICE_COUNT && v <= MAX_CHOICE_COUNT;
}

export function choiceLetters(count: number): string[] {
  const letters: string[] = [];
  for (let i = 0; i < count; i++) letters.push(String.fromCharCode(97 + i));
  return letters;
}

function normalizeQuestionConfig(config: Partial<BulkConfig> | undefined): BulkConfig {
  const qType: QuestionType = config?.qType === 'text' ? 'text' : 'choice';
  let choiceCount = DEFAULT_CHOICE_COUNT;
  if (qType === 'choice') {
    choiceCount = validateChoiceCount(config?.choiceCount) ? Number(config?.choiceCount) : DEFAULT_CHOICE_COUNT;
  }
  return { qType, choiceCount };
}

/**
 * 「全問○択にする」等の一括設定＋問題ごとの個別上書き（企画書 5.1）から
 * 問題番号ごとの出題形式配列を組み立てる。上書きは配列の後ろが優先。
 */
export function buildQuestionConfigs(
  questionCount: number,
  bulkConfig: Partial<BulkConfig> | undefined,
  overrides: OverrideRange[] | undefined
): QuestionConfig[] {
  if (!validateQuestionCount(questionCount)) {
    throw new ValidationError(`問題数は${MIN_QUESTION_COUNT}〜${MAX_QUESTION_COUNT}の範囲で指定してください`);
  }
  const base = normalizeQuestionConfig(bulkConfig);
  const configs: QuestionConfig[] = [];
  for (let no = 1; no <= questionCount; no++) {
    configs.push({ no, qType: base.qType, choiceCount: base.choiceCount });
  }
  (overrides || []).forEach((ov) => {
    const conf = normalizeQuestionConfig(ov);
    const from = Math.max(1, Number(ov.from) || 1);
    const to = Math.min(questionCount, Number(ov.to) || from);
    for (let no = from; no <= to; no++) {
      configs[no - 1].qType = conf.qType;
      configs[no - 1].choiceCount = conf.choiceCount;
    }
  });
  return configs;
}

function normText(s: unknown): string {
  return String(s == null ? '' : s).trim();
}

function judgeChoice(userAnswer: string, correctAnswer: string): Judgment {
  const correctNorm = normText(correctAnswer).toLowerCase();
  if (!correctNorm) return JUDGMENTS.NONE;
  const userNorm = normText(userAnswer).toLowerCase();
  if (!userNorm) return JUDGMENTS.WRONG;
  return userNorm === correctNorm ? JUDGMENTS.CORRECT : JUDGMENTS.WRONG;
}

/** 1問分の実効判定（選択式は自動判定、記述式は自己申告の判定をそのまま使う） */
export function effectiveJudgment(row: Pick<AnswerRow, 'qType' | 'userAnswer' | 'correctAnswer' | 'judgment'>): Judgment {
  if (row.qType === 'choice') return judgeChoice(row.userAnswer, row.correctAnswer);
  const j = row.judgment;
  return j === JUDGMENTS.CORRECT || j === JUDGMENTS.PARTIAL || j === JUDGMENTS.WRONG ? j : JUDGMENTS.NONE;
}

export interface SetStats {
  total: number;
  answered: number;
  graded: number;
  correctCount: number;
  partialCount: number;
  wrongCount: number;
  percentage: number | null;
  status: SetStatus;
}

/** 解答セット全体の集計（企画書 5.3: 正答率） */
export function computeSetStats(
  rows: Array<Pick<AnswerRow, 'qType' | 'userAnswer' | 'correctAnswer' | 'judgment'>>
): SetStats {
  const total = rows.length;
  let answered = 0;
  let graded = 0;
  let correctCount = 0;
  let partialCount = 0;
  let wrongCount = 0;

  rows.forEach((row) => {
    if (normText(row.userAnswer)) answered++;
    const j = effectiveJudgment(row);
    if (j !== JUDGMENTS.NONE) {
      graded++;
      if (j === JUDGMENTS.CORRECT) correctCount++;
      else if (j === JUDGMENTS.PARTIAL) partialCount++;
      else if (j === JUDGMENTS.WRONG) wrongCount++;
    }
  });

  const percentage = graded > 0 ? Math.round((correctCount / graded) * 1000) / 10 : null;
  const status: SetStatus = total > 0 && graded === total ? SET_STATUS.GRADED : SET_STATUS.ANSWERING;

  return { total, answered, graded, correctCount, partialCount, wrongCount, percentage, status };
}

export function typeLabel(qType: QuestionType, choiceCount: number): string {
  return qType === 'text' ? '記述式' : `${choiceCount}択（${choiceLetters(choiceCount).join(',')}）`;
}

export interface ConfigGroup {
  from: number;
  to: number;
  qType: QuestionType;
  choiceCount: number;
}

/** 連続する同一形式の問題をまとめてプレビュー表示するためのグルーピング */
export function groupConsecutive(configs: QuestionConfig[]): ConfigGroup[] {
  const groups: ConfigGroup[] = [];
  configs.forEach((c) => {
    const last = groups[groups.length - 1];
    if (last && last.qType === c.qType && last.choiceCount === c.choiceCount && last.to === c.no - 1) {
      last.to = c.no;
    } else {
      groups.push({ from: c.no, to: c.no, qType: c.qType, choiceCount: c.choiceCount });
    }
  });
  return groups;
}
