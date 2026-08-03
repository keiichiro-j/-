'use client';

import { useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Calendar from '@/components/Calendar';
import OutfitCard from '@/components/OutfitCard';
import { useClothingItems, useOutfits } from '@/lib/hooks';
import * as db from '@/lib/db';
import { todayKey, formatDateJa } from '@/lib/date';
import { TPO_LABEL, type ClothingItem } from '@/lib/types';
import clsx from 'clsx';

export default function HistoryPage() {
  const { outfits, refresh } = useOutfits();
  const { items } = useClothingItems();
  const [selected, setSelected] = useState(todayKey());
  const [tab, setTab] = useState<'calendar' | 'favorites'>('calendar');

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const resolveItems = (ids: string[]): ClothingItem[] =>
    ids.map((id) => itemsById.get(id)).filter((i): i is ClothingItem => Boolean(i));

  const selectedOutfit = outfits.find((o) => o.date === selected);
  const favorites = outfits.filter((o) => o.isFavorite);
  const hasTodaysOutfit = outfits.some((o) => o.date === todayKey());

  const applyFavoriteToToday = async (favorite: (typeof outfits)[number]) => {
    if (hasTodaysOutfit) return;
    await db.saveOutfit({
      date: todayKey(),
      itemIds: favorite.itemIds,
      tpo: favorite.tpo,
      reason: `お気に入りから再提案：${favorite.reason}`,
      feedback: null,
      isFavorite: false,
    });
    await refresh();
    setTab('calendar');
    setSelected(todayKey());
  };

  return (
    <div>
      <PageHeader eyebrow="Archive" title="アーカイブ" subtitle={`累計 ${outfits.length}コーデ`} />

      <div className="flex gap-2 px-5 pb-4">
        {(['calendar', 'favorites'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'flex-1 rounded-xl py-2 text-xs font-bold',
              tab === t ? 'brand-gradient text-white' : 'border border-black/10 bg-black/5 text-text-muted'
            )}
          >
            {t === 'calendar' ? 'カレンダー' : `お気に入り (${favorites.length})`}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4 px-5 pb-8">
        {tab === 'calendar' ? (
          <>
            <Calendar outfits={outfits} selected={selected} onSelect={setSelected} />
            <div>
              <p className="mb-2 text-xs font-semibold text-text-muted">{formatDateJa(selected)}</p>
              {selectedOutfit ? (
                <OutfitCard
                  items={resolveItems(selectedOutfit.itemIds)}
                  reason={`${selectedOutfit.reason}`}
                  footer={
                    <div className="flex items-center justify-between text-[11px] text-text-faint">
                      <span>シーン：{TPO_LABEL[selectedOutfit.tpo]}</span>
                      <span>
                        {selectedOutfit.feedback === 'good'
                          ? '評価：良い 👍'
                          : selectedOutfit.feedback === 'meh'
                            ? '評価：微妙 🤔'
                            : '評価：未入力'}
                      </span>
                    </div>
                  }
                />
              ) : (
                <p className="glass-card rounded-lg px-4 py-8 text-center text-xs text-text-faint">
                  この日のコーデ記録はありません
                </p>
              )}
            </div>
          </>
        ) : favorites.length === 0 ? (
          <p className="glass-card rounded-lg px-4 py-10 text-center text-xs text-text-faint">
            ホーム画面で ☆ を押すとお気に入りに追加されます
          </p>
        ) : (
          favorites.map((f) => (
            <OutfitCard
              key={f.id}
              items={resolveItems(f.itemIds)}
              reason={`${formatDateJa(f.date)} ・ ${f.reason}`}
              footer={
                <button
                  onClick={() => applyFavoriteToToday(f)}
                  disabled={hasTodaysOutfit}
                  className="brand-gradient rounded-xl py-2.5 text-xs font-bold text-white disabled:opacity-40"
                >
                  {hasTodaysOutfit ? '本日は決定済みです' : 'このコーデを今日着る'}
                </button>
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
