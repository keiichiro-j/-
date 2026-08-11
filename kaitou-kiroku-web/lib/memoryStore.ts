/**
 * lib/memoryStore.ts
 * ローカル開発専用のフォールバックストア（プロジェクト直下の .data/dev-store.json に永続化）。
 * Google Sheetsの認証情報が未設定でも `npm run dev` でアプリの動作確認ができるようにするためのもの。
 *
 * 状態をモジュールスコープの変数に保持する方式は、Next.js dev（Turbopack）が
 * ルートごとにモジュールを再評価することがあり、その際に状態が失われるため採用していない。
 * 代わりにリクエストのたびにJSONファイルを読み書きし、モジュールの再評価に影響されないようにする。
 *
 * サーバーレス上では書き込み可能な永続ディスクが無いため、本番（Vercel）では使用しない
 * （lib/store.ts が NODE_ENV==='production' では自動的に sheetsStore を選択する）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildQuestionConfigs, computeSetStats } from './scoring';
import type { AnswerRow, BulkConfig, OverrideRange } from './scoring';
import { NotFoundError, ValidationError } from './types';
import type { AnswerUpdate, DataStore, GradingUpdate, SetSummary, ThemeValue } from './types';

interface InternalSet {
  id: string;
  examName: string;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
  answers: AnswerRow[];
}

interface FileShape {
  sets: InternalSet[];
  theme: ThemeValue;
}

const DATA_FILE = path.join(process.cwd(), '.data', 'dev-store.json');

function load(): FileShape {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as FileShape;
    return { sets: parsed.sets || [], theme: parsed.theme || 'system' };
  } catch {
    return { sets: [], theme: 'system' };
  }
}

function save(data: FileShape) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function nowIso(): string {
  return new Date().toISOString();
}

function toSummary(s: InternalSet): SetSummary {
  const stats = computeSetStats(s.answers);
  return {
    id: s.id,
    examName: s.examName,
    questionCount: s.questionCount,
    status: stats.status,
    answeredCount: stats.answered,
    gradedCount: stats.graded,
    correctCount: stats.correctCount,
    score: stats.percentage,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

function getOrThrow(data: FileShape, setId: string): InternalSet {
  const s = data.sets.find((x) => x.id === setId);
  if (!s) throw new NotFoundError('指定された解答セットが見つかりません');
  return s;
}

export const memoryStore: DataStore = {
  async getSets() {
    const data = load();
    return data.sets.map(toSummary).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async createSet(examName, questionCount, bulkConfig: BulkConfig, overrides: OverrideRange[]) {
    const name = examName.trim();
    if (!name) throw new ValidationError('資格名・試験名を入力してください');
    const configs = buildQuestionConfigs(questionCount, bulkConfig, overrides);
    const data = load();
    const id = crypto.randomUUID();
    const now = nowIso();
    data.sets.push({
      id,
      examName: name,
      questionCount,
      createdAt: now,
      updatedAt: now,
      answers: configs.map((c) => ({
        no: c.no,
        qType: c.qType,
        choiceCount: c.choiceCount,
        userAnswer: '',
        correctAnswer: '',
        memo: '',
        judgment: '',
      })),
    });
    save(data);
    return id;
  },

  async getSetDetail(setId) {
    const data = load();
    const s = getOrThrow(data, setId);
    return { set: toSummary(s), answers: [...s.answers].sort((a, b) => a.no - b.no) };
  },

  async saveAnswers(setId, updates: AnswerUpdate[]) {
    const data = load();
    const s = getOrThrow(data, setId);
    updates.forEach((u) => {
      const row = s.answers.find((a) => a.no === u.no);
      if (!row) return;
      if (u.userAnswer !== undefined) row.userAnswer = u.userAnswer;
      if (u.memo !== undefined) row.memo = u.memo;
    });
    s.updatedAt = nowIso();
    save(data);
    return toSummary(s);
  },

  async saveGrading(setId, updates: GradingUpdate[]) {
    const data = load();
    const s = getOrThrow(data, setId);
    updates.forEach((u) => {
      const row = s.answers.find((a) => a.no === u.no);
      if (!row) return;
      if (u.correctAnswer !== undefined) row.correctAnswer = u.correctAnswer;
      if (u.judgment !== undefined) row.judgment = u.judgment as AnswerRow['judgment'];
    });
    s.updatedAt = nowIso();
    save(data);
    return toSummary(s);
  },

  async getTheme() {
    return load().theme;
  },

  async saveTheme(next: ThemeValue) {
    const data = load();
    data.theme = next;
    save(data);
    return next;
  },
};
