"use client";

import { useState } from "react";
import Link from "next/link";
import { listHistoryEntries, deleteHistoryEntry } from "@/lib/history";
import BrandLogo from "./BrandLogo";

const FLOW_STEPS = [
  "① アプリ内カメラで撮影",
  "② 固有ID発行・撮影日時を記録",
  "③ 画像ハッシュ（SHA-256）を生成",
  "④ サーバーが電子署名を発行",
  "⑤ 保存・共有時にQR＋IDを画像へ焼き込み（常時ON）",
  "⑥ SNS等で画像が流通",
  "⑦ QRから検証Webページで第三者が確認",
];

export default function SettingsScreen() {
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  async function clearLocalHistory() {
    setClearing(true);
    const entries = await listHistoryEntries();
    await Promise.all(entries.map((e) => deleteHistoryEntry(e.id)));
    setClearing(false);
    setCleared(true);
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-white px-4 py-3 text-[12px]">
      <h2 className="mb-3 text-[13px] font-bold">設定</h2>

      <BrandLogo className="mb-4" />

      <section className="mb-5">
        <h3 className="mb-1 text-[11px] font-bold text-zinc-500">無加工証明写真について</h3>
        <p className="leading-relaxed text-zinc-700">
          SNS・マッチングアプリ・ECサイトで広がる写真の加工・AI編集に対し、「加工していない」という宣言を第三者自身が検証できるようにするカメラアプリです（Web版・動作確認用）。
        </p>
      </section>

      <section className="mb-5">
        <h3 className="mb-1 text-[11px] font-bold text-zinc-500">証明情報を確認する</h3>
        <p className="mb-2 text-zinc-500">
          QRコードを読み取れない場合も、写真に印字された証明IDを直接入力して確認できます。
        </p>
        <Link
          href="/verify"
          target="_blank"
          className="block rounded-md border border-zinc-800 px-3 py-2 text-center text-[11px] font-bold"
        >
          IDで証明情報を確認する
        </Link>
      </section>

      <section className="mb-5">
        <h3 className="mb-1 text-[11px] font-bold text-zinc-500">証明のしくみ</h3>
        <ol className="list-none space-y-1 text-zinc-700">
          {FLOW_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="mb-5 rounded-md border border-zinc-300 bg-zinc-50 p-3 text-zinc-600">
        <p className="leading-relaxed">
          本アプリが証明できるのは「本アプリのカメラで撮影後に改変されていないこと」であり、「被写体の実際の容姿を保証すること」ではありません。他の画面や印刷物を撮影する経路は技術的に防げません。
        </p>
      </section>

      <section className="mb-5">
        <h3 className="mb-1 text-[11px] font-bold text-zinc-500">テスト用ツール</h3>
        <p className="mb-2 text-zinc-500">
          この端末（ブラウザ）に保存されている履歴データを削除します。サーバー側の証明レコードは削除されません。
        </p>
        <button
          type="button"
          onClick={clearLocalHistory}
          disabled={clearing}
          className="rounded-md border border-zinc-800 px-3 py-2 text-[11px] font-bold disabled:opacity-40"
        >
          {clearing ? "削除中…" : "ローカル履歴をすべて削除"}
        </button>
        {cleared && <p className="mt-1 text-[10px] text-emerald-600">削除しました</p>}
      </section>

      <p className="mt-auto pt-4 text-center text-[10px] text-zinc-300">無加工証明写真（Web版 動作確認用）</p>
    </div>
  );
}
