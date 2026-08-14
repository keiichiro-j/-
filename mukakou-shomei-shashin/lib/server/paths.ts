import path from "path";

// On Vercel, only /tmp is writable (and it's ephemeral, not shared across
// instances) — the rest of the filesystem is read-only. This is only a
// fallback for when no Redis/KV store is attached; see kv.ts.
export const DATA_DIR = process.env.VERCEL
  ? "/tmp/data"
  : path.join(process.cwd(), "data");
