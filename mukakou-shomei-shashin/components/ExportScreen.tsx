"use client";

import { useEffect, useState } from "react";

export default function ExportScreen({
  blob,
  proofId,
  onOpenDetail,
  onDone,
}: {
  blob: Blob;
  proofId: string;
  onOpenDetail: () => void;
  onDone: () => void;
}) {
  const [shareState, setShareState] = useState<"idle" | "done" | "error">("idle");
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing an object URL (external resource) with blob
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  async function handleSaveOrShare() {
    setShareState("idle");
    const file = new File([blob], `${proofId}.png`, { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "無加工証明写真" });
        setShareState("done");
        return;
      }
    } catch {
      // user cancelled the share sheet, or share failed — fall back to download below
    }
    if (!objectUrl) return;
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `${proofId}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setShareState("done");
  }

  return (
    <div className="flex flex-1 flex-col bg-white">
      <div className="relative flex-1 bg-zinc-900">
        <span className="absolute top-2 left-2 z-10 rounded bg-zinc-900 px-2 py-1 text-[9px] font-bold text-white">
          書き出しファイル
        </span>
        {objectUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={objectUrl} alt="書き出し用の画像" className="h-full w-full object-contain" />
        )}
      </div>
      <div className="px-4 py-3">
        <p className="text-center text-[10px] leading-relaxed text-zinc-500">
          写真ライブラリ保存・共有シートへ
          <br />
          渡されるのはこのファイル
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleSaveOrShare}
            className="rounded-md border border-zinc-800 py-2.5 text-[13px] font-bold"
          >
            写真に保存 / 共有
          </button>
          {shareState === "done" && (
            <p className="text-center text-[10px] text-emerald-600">完了しました</p>
          )}
          <button type="button" onClick={onOpenDetail} className="text-center text-[11px] text-zinc-500 underline">
            証明情報の詳細を見る
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded-md bg-zinc-900 py-2.5 text-[13px] font-bold text-white"
          >
            撮影に戻る
          </button>
        </div>
      </div>
    </div>
  );
}
