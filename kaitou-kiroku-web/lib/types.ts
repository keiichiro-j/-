import type { AnswerRow, BulkConfig, OverrideRange, SetStatus } from './scoring';

export { ValidationError } from './scoring';

export interface SetSummary {
  id: string;
  examName: string;
  questionCount: number;
  status: SetStatus;
  answeredCount: number;
  gradedCount: number;
  correctCount: number;
  score: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SetDetail {
  set: SetSummary;
  answers: AnswerRow[];
}

export interface AnswerUpdate {
  no: number;
  userAnswer?: string;
  memo?: string;
}

export interface GradingUpdate {
  no: number;
  correctAnswer?: string;
  judgment?: string;
}

export type ThemeValue = 'light' | 'dark' | 'system';

export interface DataStore {
  getSets(): Promise<SetSummary[]>;
  createSet(examName: string, questionCount: number, bulkConfig: BulkConfig, overrides: OverrideRange[]): Promise<string>;
  getSetDetail(setId: string): Promise<SetDetail>;
  saveAnswers(setId: string, updates: AnswerUpdate[]): Promise<SetSummary>;
  saveGrading(setId: string, updates: GradingUpdate[]): Promise<SetSummary>;
  getTheme(): Promise<ThemeValue>;
  saveTheme(theme: ThemeValue): Promise<ThemeValue>;
}

export class NotFoundError extends Error {}
