function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

let cachedKey: CryptoKey | null = null;

async function importServerPublicKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const res = await fetch("/api/public-key");
  if (!res.ok) throw new Error("public_key_fetch_failed");
  const { spkiBase64 } = await res.json();
  cachedKey = await crypto.subtle.importKey(
    "spki",
    base64ToBytes(spkiBase64),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
  return cachedKey;
}

/** Independently re-verifies a server-issued signature in the browser,
 * without trusting the server's own "signatureValid" field. */
export async function verifySignatureClientSide(
  id: string,
  hash: string,
  capturedAt: string,
  signatureBase64: string
): Promise<boolean> {
  const key = await importServerPublicKey();
  const payload = new TextEncoder().encode(`${id}\n${hash}\n${capturedAt}`);
  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    base64ToBytes(signatureBase64),
    payload
  );
}
