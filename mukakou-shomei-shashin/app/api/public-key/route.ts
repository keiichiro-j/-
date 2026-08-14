import { NextResponse } from "next/server";
import { getPublicKeySpkiBase64 } from "@/lib/server/keys";

export async function GET() {
  return NextResponse.json({
    algorithm: "ECDSA-P256-SHA256",
    encoding: "ieee-p1363",
    spkiBase64: await getPublicKeySpkiBase64(),
  });
}
