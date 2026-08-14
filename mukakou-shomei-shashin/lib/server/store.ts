import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { getRedis } from "./kv";
import { DATA_DIR } from "./paths";

// Server-side proof ledger. By design it stores only the ID, hash, capture
// timestamp and signature for each photo — never the image itself
// ("画像本体はサーバーに保存せず、ID・ハッシュ値・署名・撮影時刻のみを保存する").
//
// Persistence: Redis/KV when attached (required once deployed — see kv.ts),
// otherwise a local JSON file (fine for `next dev`).

const STORE_FILE = path.join(DATA_DIR, "records.json");
const redisKey = (id: string) => `mukakou-shomei-shashin:record:${id}`;

export interface ProofRecord {
  id: string;
  hash: string;
  capturedAt: string;
  signature: string;
  registeredAt: string;
}

function readAllFromFile(): Record<string, ProofRecord> {
  if (!existsSync(STORE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(STORE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeAllToFile(records: Record<string, ProofRecord>) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(records, null, 2), "utf-8");
}

export async function saveRecord(record: ProofRecord): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set(redisKey(record.id), record);
    return;
  }
  const all = readAllFromFile();
  all[record.id] = record;
  writeAllToFile(all);
}

export async function getRecord(id: string): Promise<ProofRecord | null> {
  const redis = getRedis();
  if (redis) {
    return (await redis.get<ProofRecord>(redisKey(id))) ?? null;
  }
  const all = readAllFromFile();
  return all[id] ?? null;
}
