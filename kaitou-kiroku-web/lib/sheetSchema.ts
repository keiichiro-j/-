export const SHEET_NAMES = {
  SETS: 'Sets',
  ANSWERS: 'Answers',
  SETTINGS: 'Settings',
} as const;

export const SETS_HEADERS = [
  'id',
  'examName',
  'questionCount',
  'status',
  'answeredCount',
  'gradedCount',
  'correctCount',
  'score',
  'createdAt',
  'updatedAt',
] as const;

export const ANSWERS_HEADERS = [
  'setId',
  'no',
  'qType',
  'choiceCount',
  'userAnswer',
  'correctAnswer',
  'memo',
  'judgment',
  'updatedAt',
] as const;

export const SETTINGS_HEADERS = ['key', 'value'] as const;

export function columnLetter(n: number): string {
  let s = '';
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}
