import { generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { getRedis } from "./kv";
import { DATA_DIR } from "./paths";

// Server signing key for the "電子署名の付与" step. P-256 + IEEE-P1363
// signature encoding is used so the raw signature can also be verified
// client-side via the Web Crypto API (SubtleCrypto ECDSA expects r||s, not
// the DER encoding Node defaults to).
//
// Persistence: Redis/KV when attached (required once deployed — see kv.ts),
// otherwise a local file (fine for `next dev`).

const KEY_FILE = path.join(DATA_DIR, "signing-key.json");
const REDIS_KEY = "mukakou-shomei-shashin:signing-key";

interface StoredKeyPair {
  publicKeyPem: string;
  privateKeyPem: string;
}

let cached: StoredKeyPair | null = null;

function generateKeyPair(): StoredKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

function loadOrCreateKeyPairFromFile(): StoredKeyPair {
  if (existsSync(KEY_FILE)) {
    return JSON.parse(readFileSync(KEY_FILE, "utf-8"));
  }
  const stored = generateKeyPair();
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(KEY_FILE, JSON.stringify(stored, null, 2), "utf-8");
  return stored;
}

async function loadOrCreateKeyPair(): Promise<StoredKeyPair> {
  const redis = getRedis();
  if (!redis) return loadOrCreateKeyPairFromFile();

  const existing = await redis.get<StoredKeyPair>(REDIS_KEY);
  if (existing) return existing;

  // Racing cold starts may both generate a key; NX makes only the first
  // write win, so every instance converges on the same key.
  const stored = generateKeyPair();
  await redis.set(REDIS_KEY, stored, { nx: true });
  return (await redis.get<StoredKeyPair>(REDIS_KEY)) ?? stored;
}

async function getKeys(): Promise<StoredKeyPair> {
  if (!cached) {
    cached = await loadOrCreateKeyPair();
  }
  return cached;
}

/** Message that gets signed: binds the proof ID, the final exported image's
 * SHA-256 hash, and the client-reported capture timestamp together. */
export function buildSigningPayload(id: string, hash: string, capturedAt: string): string {
  return `${id}\n${hash}\n${capturedAt}`;
}

export async function signRecord(id: string, hash: string, capturedAt: string): Promise<string> {
  const { privateKeyPem } = await getKeys();
  const payload = buildSigningPayload(id, hash, capturedAt);
  const signature = cryptoSign("sha256", Buffer.from(payload, "utf-8"), {
    key: privateKeyPem,
    dsaEncoding: "ieee-p1363",
  });
  return signature.toString("base64");
}

export async function verifyRecordSignature(
  id: string,
  hash: string,
  capturedAt: string,
  signatureBase64: string
): Promise<boolean> {
  const { publicKeyPem } = await getKeys();
  const payload = buildSigningPayload(id, hash, capturedAt);
  try {
    return cryptoVerify(
      "sha256",
      Buffer.from(payload, "utf-8"),
      { key: publicKeyPem, dsaEncoding: "ieee-p1363" },
      Buffer.from(signatureBase64, "base64")
    );
  } catch {
    return false;
  }
}

/** SPKI public key as base64 DER, importable via SubtleCrypto.importKey("spki", ...). */
export async function getPublicKeySpkiBase64(): Promise<string> {
  const { publicKeyPem } = await getKeys();
  return publicKeyPem
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s+/g, "");
}
