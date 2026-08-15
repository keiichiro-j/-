"use client";

import { useState } from "react";
import { sha256Hex } from "@/lib/hash";
import { readEmbeddedProofMetadata } from "@/lib/pngMetadata";

type HashResult = "idle" | "checking" | "match" | "mismatch";
type MetadataResult = "not_found" | "id_match" | "id_mismatch";

export default function VerifyUploadCheck({
  expectedId,
  expectedHash,
}: {
  expectedId: string;
  expectedHash: string;
}) {
  const [hashResult, setHashResult] = useState<HashResult>("idle");
  const [metadataResult, setMetadataResult] = useState<MetadataResult | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setHashResult("checking");
    setMetadataResult(null);
    const [hash, metadata] = await Promise.all([sha256Hex(file), readEmbeddedProofMetadata(file)]);
    setHashResult(hash === expectedHash ? "match" : "mismatch");
    if (!metadata) {
      setMetadataResult("not_found");
    } else {
      setMetadataResult(metadata.id === expectedId ? "id_match" : "id_mismatch");
    }
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
      {hashResult === "checking" && <p className="mt-2 text-center text-zinc-500">照合中…</p>}
      {hashResult === "match" && (
        <p className="mt-2 text-center font-bold text-emerald-600">✓ 画像は完全に一致しました</p>
      )}
      {hashResult === "mismatch" && (
        <p className="mt-2 text-center font-bold text-red-600">✗ 一致しません（改変されているか、別の画像です）</p>
      )}

      {metadataResult && (
        <div className="mt-2 border-t border-zinc-200 pt-2">
          {metadataResult === "id_match" && (
            <p className="text-center text-zinc-600">
              埋め込みメタデータ: <span className="font-bold text-emerald-600">この証明IDと一致</span>
            </p>
          )}
          {metadataResult === "id_mismatch" && (
            <p className="text-center text-zinc-600">
              埋め込みメタデータ: <span className="font-bold text-red-600">別の証明IDが検出されました</span>
            </p>
          )}
          {metadataResult === "not_found" && (
            <p className="text-center text-zinc-500">
              埋め込みメタデータ: 検出されませんでした（別形式への再保存等で失われた可能性があります）
            </p>
          )}
        </div>
      )}
    </div>
  );
}
