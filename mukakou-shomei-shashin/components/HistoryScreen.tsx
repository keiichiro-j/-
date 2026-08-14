"use client";

import { useEffect, useState } from "react";
import { HistoryEntry, listHistoryEntries, setFavorite } from "@/lib/history";
import { StarIcon } from "./icons";

export default function HistoryScreen({ onOpenDetail }: { onOpenDetail: (id: string) => void }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"all" | "favorite">("all");

  async function reload() {
    const list = await listHistoryEntries();
    setEntries(list);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetched from IndexedDB on mount
    void reload();
  }, []);

  useEffect(() => {
    if (!entries) return;
    const urls: Record<string, string> = {};
    for (const e of entries) urls[e.id] = URL.createObjectURL(e.imageBlob);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing object URLs (external resource) with entries
    setThumbUrls(urls);
    return () => {
      Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
    };
  }, [entries]);

  async function toggleFavorite(e: React.MouseEvent, id: string, current: boolean) {
    e.stopPropagation();
    await setFavorite(id, !current);
    reload();
  }

  const visible = (entries ?? []).filter((e) => tab === "all" || e.favorite);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-white px-4 py-3">
      <h2 className="mb-2 text-[13px] font-bold">マイフォト</h2>
      <div className="flex gap-4 border-b-2 border-zinc-800 pb-2 text-[11px]">
        <button
          type="button"
          onClick={() => setTab("all")}
          className={tab === "all" ? "-mb-[10px] border-b-2 border-zinc-800 pb-2 font-bold" : "-mb-[10px] pb-2 text-zinc-400"}
        >
          すべて
        </button>
        <button
          type="button"
          onClick={() => setTab("favorite")}
          className={
            tab === "favorite" ? "-mb-[10px] border-b-2 border-zinc-800 pb-2 font-bold" : "-mb-[10px] pb-2 text-zinc-400"
          }
        >
          お気に入り
        </button>
      </div>

      {entries === null ? (
        <p className="mt-6 text-center text-[11px] text-zinc-400">読み込み中…</p>
      ) : visible.length === 0 ? (
        <p className="mt-6 text-center text-[11px] text-zinc-400">
          {tab === "all" ? "まだ証明写真がありません。" : "お気に入りに登録された写真はありません。"}
        </p>
      ) : (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {visible.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onOpenDetail(e.id)}
              className="relative h-[80px] overflow-hidden rounded-sm bg-zinc-100"
            >
              {thumbUrls[e.id] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbUrls[e.id]} alt={e.id} className="h-full w-full object-cover" />
              )}
              <span
                role="button"
                tabIndex={0}
                onClick={(ev) => toggleFavorite(ev, e.id, e.favorite)}
                className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <StarIcon className="h-3 w-3" filled={e.favorite} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
