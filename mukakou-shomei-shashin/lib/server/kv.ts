import { Redis } from "@upstash/redis";

let client: Redis | null | undefined;

/**
 * Persistent store for the signing key + proof records, used when deployed
 * (e.g. on Vercel, whose serverless functions have no durable local disk).
 * Attach any Redis-compatible integration that exposes REST credentials —
 * Vercel's own KV/Storage tab or Upstash both work — under either the
 * KV_REST_API_* or UPSTASH_REDIS_REST_* env var names.
 *
 * Returns null when no such store is configured, so callers can fall back
 * to local-file storage (used for `next dev`).
 */
export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}
