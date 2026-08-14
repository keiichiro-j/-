"use client";

import { useState } from "react";
import { sha256Hex } from "@/lib/hash";

type Result = "idle" | "checking" | "match" | "mismatch";

export default function VerifyUploadCheck({ expectedHash }: { expectedHash: string }) {
  const [result, setResult] = useState<Result>("idle");

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setResult("checking");
    const hash = await sha256Hex(file);
    setResult(hash === expectedHash ? "match" : "mismatch");
  }

  return (
    <div className="mt-4 rounded-md border border-zinc-300 bg-zinc-50 p-3 text-[11px]">
      <p className="mb-2 text-zinc-600">
        画像ファイルをアップロードすると、ここに記録されたハッシュ値と完全に一致するかを検証できます（ハードバインディング検証・1画素でも変化があれば不一致になります）。
      </p>
      <label className="block w-full cursor-pointer rounded-md border border-zinc-800 py-2 text-center text-[11px] font-bold">
        画像を選択して照合
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </label>
      {result === "checking" && <p className="mt-2 text-center text-zinc-500">照合中…</p>}
      {result === "match" && (
        <p className="mt-2 text-center font-bold text-emerald-600">✓ 画像は完全に一致しました</p>
      )}
      {result === "mismatch" && (
        <p className="mt-2 text-center font-bold text-red-600">✗ 一致しません（改変されているか、別の画像です）</p>
      )}
    </div>
  );
}
