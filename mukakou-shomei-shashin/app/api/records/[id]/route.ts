import { NextRequest, NextResponse } from "next/server";
import { getRecord } from "@/lib/server/store";
import { verifyRecordSignature } from "@/lib/server/keys";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const record = getRecord(id);
  if (!record) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const signatureValid = verifyRecordSignature(
    record.id,
    record.hash,
    record.capturedAt,
    record.signature
  );
  return NextResponse.json({ ...record, signatureValid });
}
