'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import ClothingForm from '@/components/ClothingForm';
import ClothingCard from '@/components/ClothingCard';
import ListingModal from '@/components/ListingModal';
import { useClothingItems } from '@/lib/hooks';
import * as db from '@/lib/db';
import { totalAssetValue } from '@/lib/resale';
import { CATEGORY_LABEL, type ClothingCategory, type ClothingItem } from '@/lib/types';
import clsx from 'clsx';

const CATEGORY_FILTERS: (ClothingCategory | 'all')[] = [
  'all',
  'tops',
  'bottoms',
  'outer',
  'shoes',
  'accessory',
];

export default function ClosetPage() {
  return (
    <Suspense fallback={null}>
      <ClosetPageContent />
    </Suspense>
  );
}

function ClosetPageContent() {
  const { items, loading, error, refresh } = useClothingItems();
  const [filter, setFilter] = useState<ClothingCategory | 'all'>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ClothingItem | null>(null);
  const [listingItem, setListingItem] = useState<ClothingItem | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const itemId = searchParams.get('item');
    if (!itemId || loading) return;
    const target = items.find((i) => i.id === itemId);
    if (target) {
      setEditing(target);
    }
    router.replace('/closet');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, loading]);

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.category === filter)),
    [items, filter]
  );

  const total = useMemo(() => totalAssetValue(items), [items]);

  const handleDelete = async () => {
    if (!editing) return;
    await db.deleteClothingItem(editing.id);
    setEditing(null);
    refresh();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Wardrobe"
        title="ワードローブ"
        subtitle={`${items.length}点 ・ 概算資産額 ¥${total.toLocaleString()}`}
        action={
          <button
            onClick={() => setAddOpen(true)}
            className="brand-gradient flex h-10 w-10 items-center justify-center rounded-full text-xl font-normal text-white shadow-sm"
            aria-label="服を追加"
          >
            ＋
          </button>
        }
      />

      <div className="scrollbar-none flex gap-2 overflow-x-auto px-5 pb-3">
        {CATEGORY_FILTERS.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={clsx(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold',
              filter === c
                ? 'border-transparent brand-gradient text-white'
                : 'border-text/10 bg-text/5 text-text-muted'
            )}
          >
            {c === 'all' ? 'すべて' : CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      {error && (
        <div className="mx-5 mb-3 rounded-lg border border-danger-border bg-danger-bg px-3 py-2.5 text-xs text-danger-text">
          {error}
        </div>
      )}

      <div className="px-5 pb-6">
        {loading ? (
          <p className="py-10 text-center text-sm text-text-faint">読み込み中…</p>
        ) : filtered.length === 0 ? (
          <EmptyState onAdd={() => setAddOpen(true)} hasAny={items.length > 0} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((item) => (
              <ClothingCard key={item.id} item={item} onClick={() => setEditing(item)} />
            ))}
          </div>
        )}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="服を登録">
        <ClothingForm
          onSaved={() => {
            setAddOpen(false);
            refresh();
          }}
        />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="服を編集">
        {editing && (
          <ClothingForm
            initial={editing}
            onSaved={() => {
              setEditing(null);
              refresh();
            }}
            onDelete={handleDelete}
            onCreateListing={() => {
              setListingItem(editing);
              setEditing(null);
            }}
          />
        )}
      </Modal>

      <ListingModal item={listingItem} onClose={() => setListingItem(null)} />
    </div>
  );
}

function EmptyState({ onAdd, hasAny }: { onAdd: () => void; hasAny: boolean }) {
  return (
    <div className="glass-card flex flex-col items-center gap-3 rounded-lg px-6 py-12 text-center">
      <span className="text-4xl">👗</span>
      <p className="text-sm font-semibold text-text">
        {hasAny ? 'このカテゴリのアイテムはありません' : 'まだ服が登録されていません'}
      </p>
      <p className="text-xs text-text-muted">
        写真を撮って数タップで登録すると、AIコーデ提案に使われます
      </p>
      <button
        onClick={onAdd}
        className="brand-gradient mt-1 rounded-full px-5 py-2 text-xs font-bold text-white"
      >
        最初の1着を登録
      </button>
    </div>
  );
}
