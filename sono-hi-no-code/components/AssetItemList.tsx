import { CATEGORY_LABEL, type ClothingItem } from '@/lib/types';
import { estimateResaleValue } from '@/lib/resale';

export default function AssetItemList({
  items,
  onCreateListing,
}: {
  items: ClothingItem[];
  onCreateListing: (item: ClothingItem) => void;
}) {
  const sorted = [...items]
    .filter((i) => i.status !== 'retired')
    .sort((a, b) => estimateResaleValue(b) - estimateResaleValue(a));

  if (sorted.length === 0) {
    return <p className="text-xs text-text-faint">アイテムを登録すると一覧が表示されます</p>;
  }

  return (
    <div className="flex max-h-80 flex-col divide-y divide-text/10 overflow-y-auto overscroll-contain rounded-lg border border-text/10 [-webkit-overflow-scrolling:touch]">
      {sorted.map((item) => (
        <div key={item.id} className="flex items-center gap-3 p-2.5">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-text/5">
            {item.imageDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.imageDataUrl} alt={item.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lg opacity-40">
                👕
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-text">{item.name}</p>
            <p className="truncate text-[10px] text-text-faint">
              {item.brand ? `${item.brand} ・ ` : ''}
              {CATEGORY_LABEL[item.category]}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs font-semibold text-text">
              ¥{estimateResaleValue(item).toLocaleString()}
            </p>
            <button
              onClick={() => onCreateListing(item)}
              className="text-[10px] font-semibold text-brand-pink"
            >
              出品文を作成
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
