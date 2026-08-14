import { generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

// Server signing key for the "電子署名の付与" step. Persisted to disk so
// signatures issued in a previous dev run keep verifying after a restart.
// P-256 + IEEE-P1363 signature encoding is used so the raw signature can
// also be verified client-side via the Web Crypto API (SubtleCrypto ECDSA
// expects r||s, not the DER encoding Node defaults to).

const DATA_DIR = path.join(process.cwd(), "data");
const KEY_FILE = path.join(DATA_DIR, "signing-key.json");

interface StoredKeyPair {
  publicKeyPem: string;
  privateKeyPem: string;
}

let cached: StoredKeyPair | null = null;

function loadOrCreateKeyPair(): StoredKeyPair {
  if (existsSync(KEY_FILE)) {
    return JSON.parse(readFileSync(KEY_FILE, "utf-8"));
  }
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const stored: StoredKeyPair = {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(KEY_FILE, JSON.stringify(stored, null, 2), "utf-8");
  return stored;
}

function getKeys(): StoredKeyPair {
  if (!cached) {
    cached = loadOrCreateKeyPair();
  }
  return cached;
}

/** Message that gets signed: binds the proof ID, the final exported image's
 * SHA-256 hash, and the client-reported capture timestamp together. */
export function buildSigningPayload(id: string, hash: string, capturedAt: string): string {
  return `${id}\n${hash}\n${capturedAt}`;
}

export function signRecord(id: string, hash: string, capturedAt: string): string {
  const { privateKeyPem } = getKeys();
  const payload = buildSigningPayload(id, hash, capturedAt);
  const signature = cryptoSign("sha256", Buffer.from(payload, "utf-8"), {
    key: privateKeyPem,
    dsaEncoding: "ieee-p1363",
  });
  return signature.toString("base64");
}

export function verifyRecordSignature(
  id: string,
  hash: string,
  capturedAt: string,
  signatureBase64: string
): boolean {
  const { publicKeyPem } = getKeys();
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
export function getPublicKeySpkiBase64(): string {
  const { publicKeyPem } = getKeys();
  const b64 = publicKeyPem
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s+/g, "");
  return b64;
}
