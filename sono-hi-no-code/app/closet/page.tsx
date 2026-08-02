'use client';

import { useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import ClothingForm from '@/components/ClothingForm';
import ClothingCard from '@/components/ClothingCard';
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
  const { items, loading, refresh } = useClothingItems();
  const [filter, setFilter] = useState<ClothingCategory | 'all'>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ClothingItem | null>(null);

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
        eyebrow="Closet DB"
        title="クローゼット"
        subtitle={`${items.length}点 ・ 概算資産額 ¥${total.toLocaleString()}`}
        action={
          <button
            onClick={() => setAddOpen(true)}
            className="brand-gradient flex h-10 w-10 items-center justify-center rounded-full text-xl font-bold text-white shadow-lg shadow-fuchsia-900/30"
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
                : 'border-white/10 bg-white/5 text-text-muted'
            )}
          >
            {c === 'all' ? 'すべて' : CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

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
          />
        )}
      </Modal>
    </div>
  );
}

function EmptyState({ onAdd, hasAny }: { onAdd: () => void; hasAny: boolean }) {
  return (
    <div className="glass-card flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center">
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
