import type { DataStore } from './types';
import { sheetsStore } from './sheetsStore';
import { memoryStore } from './memoryStore';

/**
 * 本番（Vercel）では常に Google Sheets を使用する。
 * ローカル開発時のみ、Sheets の認証情報が未設定であればメモリストアにフォールバックし、
 * 認証情報を用意しなくても `npm run dev` で画面遷移を確認できるようにする。
 * （sheetsStore 自体は import 時点では何も実行しないため、未設定でも安全に読み込める）
 */
function selectStore(): DataStore {
  const hasSheetsCredentials =
    !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    !!process.env.GOOGLE_PRIVATE_KEY &&
    !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  if (process.env.NODE_ENV === 'production' || hasSheetsCredentials) {
    return sheetsStore;
  }
  return memoryStore;
}

export const store: DataStore = selectStore();
