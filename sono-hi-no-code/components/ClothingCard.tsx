import { CATEGORY_LABEL, STATUS_LABEL, type ClothingItem } from '@/lib/types';
import { estimateResaleValue } from '@/lib/resale';
import clsx from 'clsx';

const STATUS_DOT: Record<ClothingItem['status'], string> = {
  active: 'bg-emerald-400',
  cleaning: 'bg-amber-400',
  retired: 'bg-white/30',
};

export default function ClothingCard({
  item,
  onClick,
}: {
  item: ClothingItem;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="glass-card group flex flex-col overflow-hidden rounded-2xl text-left transition-transform active:scale-[0.98]"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-white/5">
        {item.imageDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageDataUrl}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl opacity-40">
            👕
          </div>
        )}
        <span
          className={clsx(
            'absolute right-2 top-2 h-2.5 w-2.5 rounded-full ring-2 ring-black/30',
            STATUS_DOT[item.status]
          )}
        />
      </div>
      <div className="flex flex-col gap-0.5 p-2.5">
        <p className="truncate text-xs font-semibold text-text">{item.name}</p>
        <p className="truncate text-[11px] text-text-faint">
          {CATEGORY_LABEL[item.category]} ・ {item.color}
        </p>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[10px] text-text-faint">{STATUS_LABEL[item.status]}</span>
          <span className="text-[10px] font-semibold text-brand-orange">
            ¥{estimateResaleValue(item).toLocaleString()}
          </span>
        </div>
      </div>
    </button>
  );
}
