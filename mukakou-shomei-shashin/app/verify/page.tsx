"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PROOF_ID_PATTERN } from "@/lib/id";
import BrandLogo from "@/components/BrandLogo";
import { VerifyCard } from "@/components/VerifyCard";

export default function VerifyLookupPage() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const id = value.trim().toUpperCase();
    if (!PROOF_ID_PATTERN.test(id)) {
      setError("IDの形式が正しくありません（例：UNEDITED-7F3A-92KD）");
      return;
    }
    setError(null);
    router.push(`/verify/${id}`);
  }

  return (
    <VerifyCard>
      <BrandLogo className="mb-4 justify-center" />
      <h1 className="mb-1 text-center text-[15px] font-bold">証明情報を確認</h1>
      <p className="mb-4 text-center text-[11px] text-zinc-500">
        写真に写り込んだQRコードを読み取るか、写真下部に印字された証明ID（例：UNEDITED-7F3A-92KD）を入力してください。
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="UNEDITED-XXXX-XXXX"
          autoCapitalize="characters"
          className="rounded-md border border-zinc-300 px-3 py-2.5 text-center font-mono text-[13px] uppercase tracking-wide"
        />
        {error && <p className="text-center text-[11px] text-red-600">{error}</p>}
        <button type="submit" className="rounded-md bg-zinc-900 py-2.5 text-[13px] font-bold text-white">
          確認する
        </button>
      </form>
    </VerifyCard>
  );
}
