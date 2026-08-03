'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import DressUpSilhouette from '@/components/DressUpSilhouette';
import { useClothingItems, useOutfits, useProfile } from '@/lib/hooks';
import { todayKey } from '@/lib/date';
import type { ClothingItem } from '@/lib/types';
import clsx from 'clsx';

type Slot = 'tops' | 'bottoms' | 'outer' | 'shoes';

export default function DressUpPage() {
  const { items } = useClothingItems();
  const { outfits } = useOutfits();
  const { profile } = useProfile();

  const active = useMemo(() => items.filter((i) => i.status === 'active'), [items]);
  const byCategory = (cat: Slot) => active.filter((i) => i.category === cat);

  const todaysOutfit = useMemo(
    () => outfits.find((o) => o.date === todayKey()),
    [outfits]
  );

  const [selected, setSelected] = useState<Record<Slot, string | undefined>>({
    tops: undefined,
    bottoms: undefined,
    outer: undefined,
    shoes: undefined,
  });
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized || active.length === 0) return;
    const fromOutfit = new Set(todaysOutfit?.itemIds ?? []);
    const pick = (cat: Slot) => {
      const list = byCategory(cat);
      const preferred = list.find((i) => fromOutfit.has(i.id));
      return (preferred ?? list[0])?.id;
    };
    setSelected({
      tops: pick('tops'),
      bottoms: pick('bottoms'),
      outer: pick('outer'),
      shoes: pick('shoes'),
    });
    setInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.length, initialized]);

  const findItem = (id?: string): ClothingItem | undefined =>
    id ? items.find((i) => i.id === id) : undefined;

  if (active.length === 0) {
    return (
      <div>
        <PageHeader eyebrow="Try-On" title="試着室" subtitle="登録した服を試着プレビューできます" />
        <div className="mx-5 flex flex-col items-center gap-3 rounded-lg glass-card px-6 py-12 text-center">
          <span className="text-4xl">🧍</span>
          <p className="text-sm font-semibold text-text">
            ワードローブに服を登録すると試着できます
          </p>
          <Link
            href="/closet"
            className="brand-gradient mt-1 rounded-full px-5 py-2 text-xs font-bold text-white"
          >
            ワードローブに追加する
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader eyebrow="Try-On" title="試着室" subtitle="身長・顔写真をもとにした簡易プレビューです" />

      <div className="flex flex-col gap-4 px-5 pb-8">
        <DressUpSilhouette
          heightCm={profile?.heightCm}
          faceImageDataUrl={profile?.faceImageDataUrl}
          top={findItem(selected.tops)}
          bottom={findItem(selected.bottoms)}
          outer={findItem(selected.outer)}
          shoes={findItem(selected.shoes)}
        />

        {(['tops', 'bottoms', 'outer', 'shoes'] as Slot[]).map((cat) => {
          const list = byCategory(cat);
          if (list.length === 0) return null;
          return (
            <div key={cat}>
              <p className="mb-2 text-xs font-semibold text-text-muted">{SLOT_LABEL[cat]}</p>
              <div className="scrollbar-none flex gap-2 overflow-x-auto">
                {cat === 'outer' && (
                  <button
                    onClick={() => setSelected((prev) => ({ ...prev, outer: undefined }))}
                    className={clsx(
                      'flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border text-[10px] font-semibold',
                      !selected.outer
                        ? 'border-transparent brand-gradient text-white'
                        : 'border-black/10 bg-black/5 text-text-muted'
                    )}
                  >
                    なし
                  </button>
                )}
                {list.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelected((prev) => ({ ...prev, [cat]: item.id }))}
                    className={clsx(
                      'h-16 w-16 shrink-0 overflow-hidden rounded-lg border',
                      selected[cat] === item.id ? 'border-2 border-[var(--brand-orange)]' : 'border-black/10'
                    )}
                  >
                    {item.imageDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageDataUrl}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-black/5 text-lg opacity-40">
                        👕
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        <p className="rounded-lg bg-black/5 px-3 py-2.5 text-[10px] leading-relaxed text-text-faint">
          身長からスケールした簡易シルエットに、登録した服の写真を重ねて表示する2Dプレビューです。実際の着用感・サイズ感とは異なります。
        </p>
      </div>
    </div>
  );
}

const SLOT_LABEL: Record<Slot, string> = {
  tops: 'トップス',
  bottoms: 'ボトムス',
  outer: 'アウター',
  shoes: '靴',
};
