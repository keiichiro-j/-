import type { Metadata } from "next";
import { getRecord } from "@/lib/server/store";
import { verifyRecordSignature } from "@/lib/server/keys";
import { formatDateTime, truncateHash } from "@/lib/format";
import VerifyUploadCheck from "@/components/VerifyUploadCheck";

export const metadata: Metadata = {
  title: "証明情報の検証 | 無加工証明写真",
};

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await getRecord(id);

  if (!record) {
    return (
      <Card>
        <div className="mx-auto mb-4 flex h-[70px] w-[70px] items-center justify-center rounded-full border-[3px] border-zinc-800 text-2xl font-black text-zinc-400">
          ?
        </div>
        <h1 className="mb-1 text-center text-[15px] font-bold">証明情報が見つかりません</h1>
        <p className="mb-4 text-center text-[11px] text-zinc-500">
          指定されたIDの証明情報は登録されていません。URLを確認してください。
        </p>
        <Row label="証明ID" value={id} />
      </Card>
    );
  }

  const signatureValid = await verifyRecordSignature(record.id, record.hash, record.capturedAt, record.signature);

  return (
    <Card>
      <div
        className={`mx-auto mb-4 flex h-[70px] w-[70px] items-center justify-center rounded-full border-[3px] text-2xl font-black ${
          signatureValid ? "border-zinc-800 text-zinc-900" : "border-red-600 text-red-600"
        }`}
      >
        {signatureValid ? "✓" : "✗"}
      </div>
      <h1 className="mb-1 text-center text-[15px] font-bold">
        {signatureValid ? "Authentic / Verified" : "署名を検証できませんでした"}
      </h1>
      <p className="mb-4 text-center text-[10.5px] text-zinc-500">
        {signatureValid
          ? "この証明情報は撮影後に改変されていません"
          : "証明情報が破損しているか、改ざんされている可能性があります"}
      </p>

      <dl>
        <Row label="証明ID" value={record.id} />
        <Row label="撮影日時" value={formatDateTime(record.capturedAt)} />
        <Row label="撮影アプリ" value="無加工証明写真" />
        <Row label="ハッシュ値" value={truncateHash(record.hash)} />
        <Row label="署名検証" value={signatureValid ? "✓ 一致" : "✗ 不一致"} />
      </dl>

      <VerifyUploadCheck expectedHash={record.hash} />
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-start justify-center bg-zinc-100 p-6 sm:items-center">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-white p-6 shadow-sm">
        {children}
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-200 py-2 text-[11px]">
      <span className="text-zinc-400">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
