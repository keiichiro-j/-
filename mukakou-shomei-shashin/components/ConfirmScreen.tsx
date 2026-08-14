"use client";

import { useMemo } from "react";
import { CheckBadgeIcon } from "./icons";

export default function ConfirmScreen({
  canvas,
  proofId,
  onRetake,
  onSave,
  saving,
}: {
  canvas: HTMLCanvasElement;
  proofId: string;
  onRetake: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const dataUrl = useMemo(() => canvas.toDataURL("image/png"), [canvas]);

  return (
    <div className="flex flex-1 flex-col bg-white">
      <div className="relative flex-1 bg-zinc-900">
        {dataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt="撮影した写真" className="h-full w-full object-cover" />
        )}
        <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full border border-zinc-800 bg-white px-2.5 py-1 text-[10px] font-bold">
          <CheckBadgeIcon className="h-3.5 w-3.5" />
          VERIFIED
        </div>
      </div>
      <div className="px-4 py-3">
        <p className="text-center text-[11px] text-zinc-400">ID: {proofId}</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onRetake}
            disabled={saving}
            className="flex-1 rounded-md border border-zinc-800 py-2.5 text-[13px] font-bold disabled:opacity-40"
          >
            撮り直す
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
          >
            {saving ? "証明情報を発行中…" : "保存・共有する"}
          </button>
        </div>
      </div>
    </div>
  );
}
