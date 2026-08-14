import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

// Server-side proof ledger. By design it stores only the ID, hash, capture
// timestamp and signature for each photo — never the image itself
// ("画像本体はサーバーに保存せず、ID・ハッシュ値・署名・撮影時刻のみを保存する").
// A JSON file is enough for local functional testing; a real deployment
// would swap this for a database.

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "records.json");

export interface ProofRecord {
  id: string;
  hash: string;
  capturedAt: string;
  signature: string;
  registeredAt: string;
}

function readAll(): Record<string, ProofRecord> {
  if (!existsSync(STORE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(STORE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeAll(records: Record<string, ProofRecord>) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(records, null, 2), "utf-8");
}

export function saveRecord(record: ProofRecord) {
  const all = readAll();
  all[record.id] = record;
  writeAll(all);
}

export function getRecord(id: string): ProofRecord | null {
  const all = readAll();
  return all[id] ?? null;
}
