/**
 * lib/sheetsStore.ts
 * GoogleスプレッドシートをDBとするデータストア実装（企画書 8. 実装方式）。
 * サービスアカウントで認証し、対象スプレッドシートを直接読み書きする。
 * 事前に対象スプレッドシートをサービスアカウントのメールアドレスへ
 * 編集者として共有しておく必要がある（README参照）。
 */
import { google, sheets_v4 } from 'googleapis';
import { JWT } from 'google-auth-library';
import {
  ANSWERS_HEADERS,
  SETS_HEADERS,
  SETTINGS_HEADERS,
  SHEET_NAMES,
  columnLetter,
} from './sheetSchema';
import { buildQuestionConfigs, computeSetStats } from './scoring';
import type { BulkConfig, OverrideRange, AnswerRow } from './scoring';
import { NotFoundError, ValidationError } from './types';
import type { AnswerUpdate, DataStore, GradingUpdate, SetDetail, SetSummary, ThemeValue } from './types';

type Row = Record<string, string> & { _row: number };

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `環境変数 ${name} が設定されていません。README.md のセットアップ手順に従って Vercel の環境変数を設定してください。`
    );
  }
  return v;
}

function getSpreadsheetId(): string {
  return requiredEnv('GOOGLE_SHEETS_SPREADSHEET_ID');
}

let sheetsClient: sheets_v4.Sheets | null = null;
function getSheetsClient(): sheets_v4.Sheets {
  if (sheetsClient) return sheetsClient;
  const email = requiredEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const rawKey = requiredEnv('GOOGLE_PRIVATE_KEY');
  const auth = new JWT({
    email,
    key: rawKey.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

const ensuredSpreadsheets = new Set<string>();

async function ensureSchema(sheets: sheets_v4.Sheets, spreadsheetId: string) {
  if (ensuredSpreadsheets.has(spreadsheetId)) return;

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  const existing = new Set((meta.data.sheets || []).map((s) => s.properties?.title));

  const wanted: Array<[string, readonly string[]]> = [
    [SHEET_NAMES.SETS, SETS_HEADERS],
    [SHEET_NAMES.ANSWERS, ANSWERS_HEADERS],
    [SHEET_NAMES.SETTINGS, SETTINGS_HEADERS],
  ];
  const toAdd = wanted.filter(([name]) => !existing.has(name));

  if (toAdd.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: toAdd.map(([name]) => ({ addSheet: { properties: { title: name } } })) },
    });
  }

  await Promise.all(wanted.map(([name, headers]) => ensureHeader(sheets, spreadsheetId, name, headers)));
  ensuredSpreadsheets.add(spreadsheetId);
}

async function ensureHeader(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetName: string, headers: readonly string[]) {
  const lastCol = columnLetter(headers.length);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A1:${lastCol}1` });
  const row = res.data.values?.[0];
  if (!row || row.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [Array.from(headers)] },
    });
  }
}

async function readRows(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetName: string, headers: readonly string[]): Promise<Row[]> {
  await ensureSchema(sheets, spreadsheetId);
  const lastCol = columnLetter(headers.length);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A2:${lastCol}`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const values = res.data.values || [];
  return values
    .map((raw, i): Row => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        const v = raw[idx];
        obj[h] = v === undefined || v === null ? '' : String(v);
      });
      const row = obj as Row;
      row._row = i + 2;
      return row;
    })
    .filter((row) => String(row[headers[0]] ?? '').length > 0);
}

function toRowArray(obj: Record<string, unknown>, headers: readonly string[]): unknown[] {
  return headers.map((h) => {
    const v = obj[h];
    return v === undefined || v === null ? '' : v;
  });
}

async function writeRow(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetName: string, row: number, values: unknown[]) {
  const lastCol = columnLetter(values.length);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A${row}:${lastCol}${row}`,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  });
}

async function appendRows(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetName: string, rows: unknown[][]) {
  if (rows.length === 0) return;
  const lastCol = columnLetter(rows[0].length);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1:${lastCol}1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function toSetSummary(row: Row): SetSummary {
  return {
    id: row.id,
    examName: row.examName,
    questionCount: Number(row.questionCount) || 0,
    status: row.status === 'graded' ? 'graded' : 'answering',
    answeredCount: Number(row.answeredCount) || 0,
    gradedCount: Number(row.gradedCount) || 0,
    correctCount: Number(row.correctCount) || 0,
    score: row.score === '' ? null : Number(row.score),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toAnswerRow(row: Row): AnswerRow {
  return {
    no: Number(row.no) || 0,
    qType: row.qType === 'text' ? 'text' : 'choice',
    choiceCount: Number(row.choiceCount) || 0,
    userAnswer: row.userAnswer || '',
    correctAnswer: row.correctAnswer || '',
    memo: row.memo || '',
    judgment: (row.judgment as AnswerRow['judgment']) || '',
  };
}

/** Answers行の書き込み値を、既存行＋部分的な上書きから組み立てる（setId/no/qType/choiceCountは維持） */
function answerFields(
  row: Row,
  now: string,
  overrides: { userAnswer?: string; correctAnswer?: string; memo?: string; judgment?: string }
) {
  return {
    setId: row.setId,
    no: Number(row.no) || 0,
    qType: row.qType,
    choiceCount: row.choiceCount === '' ? '' : Number(row.choiceCount),
    userAnswer: overrides.userAnswer !== undefined ? overrides.userAnswer : row.userAnswer,
    correctAnswer: overrides.correctAnswer !== undefined ? overrides.correctAnswer : row.correctAnswer,
    memo: overrides.memo !== undefined ? overrides.memo : row.memo,
    judgment: overrides.judgment !== undefined ? overrides.judgment : row.judgment,
    updatedAt: now,
  };
}

async function findSetRow(sheets: sheets_v4.Sheets, spreadsheetId: string, setId: string): Promise<Row> {
  const rows = await readRows(sheets, spreadsheetId, SHEET_NAMES.SETS, SETS_HEADERS);
  const row = rows.find((r) => r.id === setId);
  if (!row) throw new NotFoundError('指定された解答セットが見つかりません');
  return row;
}

async function recomputeAndSaveSetStats(sheets: sheets_v4.Sheets, spreadsheetId: string, setId: string): Promise<SetSummary> {
  const answerRows = (await readRows(sheets, spreadsheetId, SHEET_NAMES.ANSWERS, ANSWERS_HEADERS))
    .filter((r) => r.setId === setId)
    .map(toAnswerRow);
  const stats = computeSetStats(answerRows);

  const setRow = await findSetRow(sheets, spreadsheetId, setId);
  const updatedAt = nowIso();
  const updated = {
    id: setRow.id,
    examName: setRow.examName,
    questionCount: Number(setRow.questionCount) || 0,
    status: stats.status,
    answeredCount: stats.answered,
    gradedCount: stats.graded,
    correctCount: stats.correctCount,
    score: stats.percentage === null ? '' : stats.percentage,
    createdAt: setRow.createdAt,
    updatedAt,
  };
  await writeRow(sheets, spreadsheetId, SHEET_NAMES.SETS, setRow._row, toRowArray(updated, SETS_HEADERS));
  return {
    id: updated.id,
    examName: updated.examName,
    questionCount: updated.questionCount,
    status: stats.status,
    answeredCount: stats.answered,
    gradedCount: stats.graded,
    correctCount: stats.correctCount,
    score: stats.percentage,
    createdAt: updated.createdAt,
    updatedAt,
  };
}

export const sheetsStore: DataStore = {
  async getSets() {
    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const rows = await readRows(sheets, spreadsheetId, SHEET_NAMES.SETS, SETS_HEADERS);
    return rows.map(toSetSummary).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async createSet(examName, questionCount, bulkConfig: BulkConfig, overrides: OverrideRange[]) {
    const name = examName.trim();
    if (!name) throw new ValidationError('資格名・試験名を入力してください');
    const configs = buildQuestionConfigs(questionCount, bulkConfig, overrides);

    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    await ensureSchema(sheets, spreadsheetId);

    const id = crypto.randomUUID();
    const now = nowIso();

    await appendRows(sheets, spreadsheetId, SHEET_NAMES.SETS, [
      toRowArray(
        {
          id,
          examName: name,
          questionCount,
          status: 'answering',
          answeredCount: 0,
          gradedCount: 0,
          correctCount: 0,
          score: '',
          createdAt: now,
          updatedAt: now,
        },
        SETS_HEADERS
      ),
    ]);

    const answerRows = configs.map((c) =>
      toRowArray(
        {
          setId: id,
          no: c.no,
          qType: c.qType,
          choiceCount: c.qType === 'choice' ? c.choiceCount : '',
          userAnswer: '',
          correctAnswer: '',
          memo: '',
          judgment: '',
          updatedAt: now,
        },
        ANSWERS_HEADERS
      )
    );
    await appendRows(sheets, spreadsheetId, SHEET_NAMES.ANSWERS, answerRows);

    return id;
  },

  async getSetDetail(setId): Promise<SetDetail> {
    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const setRow = await findSetRow(sheets, spreadsheetId, setId);
    const answers = (await readRows(sheets, spreadsheetId, SHEET_NAMES.ANSWERS, ANSWERS_HEADERS))
      .filter((r) => r.setId === setId)
      .map(toAnswerRow)
      .sort((a, b) => a.no - b.no);
    return { set: toSetSummary(setRow), answers };
  },

  async saveAnswers(setId, updates: AnswerUpdate[]) {
    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    if (updates.length > 0) {
      const rows = (await readRows(sheets, spreadsheetId, SHEET_NAMES.ANSWERS, ANSWERS_HEADERS)).filter(
        (r) => r.setId === setId
      );
      const byNo = new Map(rows.map((r) => [Number(r.no), r]));
      const now = nowIso();
      const data: sheets_v4.Schema$ValueRange[] = [];
      updates.forEach((u) => {
        const row = byNo.get(Number(u.no));
        if (!row) return;
        const next = answerFields(row, now, {
          userAnswer: u.userAnswer !== undefined ? u.userAnswer : row.userAnswer,
          memo: u.memo !== undefined ? u.memo : row.memo,
        });
        const values = toRowArray(next, ANSWERS_HEADERS);
        const lastCol = columnLetter(values.length);
        data.push({ range: `${SHEET_NAMES.ANSWERS}!A${row._row}:${lastCol}${row._row}`, values: [values] });
      });
      if (data.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: { valueInputOption: 'RAW', data },
        });
      }
    }
    return recomputeAndSaveSetStats(sheets, spreadsheetId, setId);
  },

  async saveGrading(setId, updates: GradingUpdate[]) {
    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    if (updates.length > 0) {
      const rows = (await readRows(sheets, spreadsheetId, SHEET_NAMES.ANSWERS, ANSWERS_HEADERS)).filter(
        (r) => r.setId === setId
      );
      const byNo = new Map(rows.map((r) => [Number(r.no), r]));
      const now = nowIso();
      const data: sheets_v4.Schema$ValueRange[] = [];
      updates.forEach((u) => {
        const row = byNo.get(Number(u.no));
        if (!row) return;
        const next = answerFields(row, now, {
          correctAnswer: u.correctAnswer !== undefined ? u.correctAnswer : row.correctAnswer,
          judgment: u.judgment !== undefined ? u.judgment : row.judgment,
        });
        const values = toRowArray(next, ANSWERS_HEADERS);
        const lastCol = columnLetter(values.length);
        data.push({ range: `${SHEET_NAMES.ANSWERS}!A${row._row}:${lastCol}${row._row}`, values: [values] });
      });
      if (data.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: { valueInputOption: 'RAW', data },
        });
      }
    }
    return recomputeAndSaveSetStats(sheets, spreadsheetId, setId);
  },

  async getTheme(): Promise<ThemeValue> {
    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const rows = await readRows(sheets, spreadsheetId, SHEET_NAMES.SETTINGS, SETTINGS_HEADERS);
    const themeRow = rows.find((r) => r.key === 'theme');
    const v = themeRow?.value;
    return v === 'light' || v === 'dark' ? v : 'system';
  },

  async saveTheme(theme: ThemeValue) {
    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const rows = await readRows(sheets, spreadsheetId, SHEET_NAMES.SETTINGS, SETTINGS_HEADERS);
    const themeRow = rows.find((r) => r.key === 'theme');
    if (themeRow) {
      await writeRow(sheets, spreadsheetId, SHEET_NAMES.SETTINGS, themeRow._row, ['theme', theme]);
    } else {
      await appendRows(sheets, spreadsheetId, SHEET_NAMES.SETTINGS, [['theme', theme]]);
    }
    return theme;
  },
};
