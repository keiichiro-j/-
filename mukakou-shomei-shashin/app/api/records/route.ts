import { NextRequest, NextResponse } from "next/server";
import { PROOF_ID_PATTERN } from "@/lib/id";
import { getRecord, saveRecord } from "@/lib/server/store";
import { signRecord } from "@/lib/server/keys";

const HASH_PATTERN = /^[0-9a-f]{64}$/i;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { id, hash, capturedAt } = (body ?? {}) as Record<string, unknown>;

  if (typeof id !== "string" || !PROOF_ID_PATTERN.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  if (typeof hash !== "string" || !HASH_PATTERN.test(hash)) {
    return NextResponse.json({ error: "invalid_hash" }, { status: 400 });
  }
  if (typeof capturedAt !== "string" || Number.isNaN(Date.parse(capturedAt))) {
    return NextResponse.json({ error: "invalid_capturedAt" }, { status: 400 });
  }
  if (getRecord(id)) {
    return NextResponse.json({ error: "id_already_registered" }, { status: 409 });
  }

  const signature = signRecord(id, hash, capturedAt);
  const registeredAt = new Date().toISOString();

  saveRecord({ id, hash, capturedAt, signature, registeredAt });

  return NextResponse.json({ id, signature, registeredAt }, { status: 201 });
}
