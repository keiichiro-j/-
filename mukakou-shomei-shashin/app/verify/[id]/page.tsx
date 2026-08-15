import type { Metadata } from "next";
import Link from "next/link";
import { getRecord } from "@/lib/server/store";
import { verifyRecordSignature } from "@/lib/server/keys";
import { formatDateTime, truncateHash } from "@/lib/format";
import VerifyUploadCheck from "@/components/VerifyUploadCheck";
import { VerifyCard, VerifyRow } from "@/components/VerifyCard";
import BrandLogo from "@/components/BrandLogo";
import BrandMark from "@/components/BrandMark";

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
      <VerifyCard>
        <BrandLogo className="mb-4 justify-center" />
        <div className="mx-auto mb-4 flex h-[70px] w-[70px] items-center justify-center rounded-full border-[3px] border-zinc-800 text-2xl font-black text-zinc-400">
          ?
        </div>
        <h1 className="mb-1 text-center text-[15px] font-bold">証明情報が見つかりません</h1>
        <p className="mb-4 text-center text-[11px] text-zinc-500">
          指定されたIDの証明情報は登録されていません。IDを確認してください。
        </p>
        <VerifyRow label="証明ID" value={id} />
        <Link
          href="/verify"
          className="mt-4 block rounded-md border border-zinc-800 py-2.5 text-center text-[12px] font-bold"
        >
          別のIDを確認する
        </Link>
      </VerifyCard>
    );
  }

  const signatureValid = await verifyRecordSignature(record.id, record.hash, record.capturedAt, record.signature);

  return (
    <VerifyCard>
      <BrandLogo className="mb-4 justify-center" />
      {signatureValid ? (
        <BrandMark className="mx-auto mb-4 h-[70px] w-[70px] text-zinc-900" />
      ) : (
        <div className="mx-auto mb-4 flex h-[70px] w-[70px] items-center justify-center rounded-full border-[3px] border-red-600 text-2xl font-black text-red-600">
          ✗
        </div>
      )}
      <h1 className="mb-1 text-center text-[15px] font-bold">
        {signatureValid ? "Authentic / Verified" : "署名を検証できませんでした"}
      </h1>
      <p className="mb-4 text-center text-[10.5px] text-zinc-500">
        {signatureValid
          ? "この証明情報は撮影後に改変されていません"
          : "証明情報が破損しているか、改ざんされている可能性があります"}
      </p>

      <dl>
        <VerifyRow label="証明ID" value={record.id} />
        <VerifyRow label="撮影日時" value={formatDateTime(record.capturedAt)} />
        <VerifyRow label="撮影アプリ" value="無加工証明写真" />
        <VerifyRow label="ハッシュ値" value={truncateHash(record.hash)} />
        <VerifyRow label="署名検証" value={signatureValid ? "✓ 一致" : "✗ 不一致"} />
      </dl>

      <VerifyUploadCheck expectedId={record.id} expectedHash={record.hash} />

      <Link href="/verify" className="mt-4 block text-center text-[11px] text-zinc-500 underline">
        別のIDを確認する
      </Link>
    </VerifyCard>
  );
}
