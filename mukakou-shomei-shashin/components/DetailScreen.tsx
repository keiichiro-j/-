"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { HistoryEntry, getHistoryEntry } from "@/lib/history";
import { formatDateTime, truncateHash } from "@/lib/format";
import { verifySignatureClientSide } from "@/lib/verifySignature";
import { BackIcon } from "./icons";

type SignatureStatus = "checking" | "verified" | "failed";

export default function DetailScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const [entry, setEntry] = useState<HistoryEntry | null | undefined>(undefined);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<SignatureStatus>("checking");

  useEffect(() => {
    let objectUrl: string | null = null;
    (async () => {
      const found = await getHistoryEntry(id);
      setEntry(found ?? null);
      if (!found) return;

      objectUrl = URL.createObjectURL(found.imageBlob);
      setThumbUrl(objectUrl);
      setQrUrl(await QRCode.toDataURL(found.verifyUrl, { margin: 1, width: 200 }));

      try {
        const res = await fetch(`/api/records/${found.id}`);
        if (!res.ok) throw new Error("record_not_found");
        const record = await res.json();
        const hashMatches = record.hash === found.hash;
        const sigValid = await verifySignatureClientSide(
          found.id,
          found.hash,
          found.capturedAt,
          found.signature
        );
        setStatus(hashMatches && sigValid ? "verified" : "failed");
      } catch {
        setStatus("failed");
      }
    })();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  if (entry === undefined) {
    return <div className="flex flex-1 items-center justify-center bg-white text-xs text-zinc-400">読み込み中…</div>;
  }
  if (entry === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-white px-6 text-center">
        <p className="text-sm text-zinc-500">この写真の証明情報が見つかりません。</p>
        <button type="button" onClick={onBack} className="rounded-md border border-zinc-800 px-4 py-2 text-xs font-bold">
          戻る
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-white px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <button type="button" onClick={onBack} aria-label="戻る">
          <BackIcon className="h-4 w-4" />
        </button>
        <h2 className="text-[13px] font-bold">証明情報</h2>
      </div>

      {thumbUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbUrl} alt="写真サムネイル" className="h-[140px] w-full rounded-lg object-cover" />
      )}

      <dl className="mt-2 text-[11px]">
        <Row label="証明ID" value={entry.id} />
        <Row label="撮影日時" value={formatDateTime(entry.capturedAt)} />
        <Row label="ハッシュ値" value={truncateHash(entry.hash)} />
        <Row
          label="署名ステータス"
          value={
            status === "checking" ? "検証中…" : status === "verified" ? "✓ 検証済み" : "✗ 検証失敗"
          }
          valueClassName={status === "failed" ? "text-red-600" : undefined}
        />
      </dl>

      {qrUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrUrl} alt="検証用QRコード" className="mx-auto my-3 h-[92px] w-[92px] border border-zinc-800 p-1" />
      )}
      <p className="mb-2 text-center text-[9px] text-zinc-400">QRコードで第三者検証</p>

      <a
        href={entry.verifyUrl}
        target="_blank"
        rel="noreferrer"
        className="block rounded-md border border-zinc-800 py-2.5 text-center text-[13px] font-bold"
      >
        検証ページを開く
      </a>
    </div>
  );
}

function Row({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-200 py-1.5">
      <span className="text-zinc-400">{label}</span>
      <span className={`font-bold ${valueClassName ?? ""}`}>{value}</span>
    </div>
  );
}
