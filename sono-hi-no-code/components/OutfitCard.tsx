import type { ReactNode } from 'react';
import Link from 'next/link';
import type { ClothingItem } from '@/lib/types';

const CATEGORY_EMOJI: Record<ClothingItem['category'], string> = {
  tops: '👕',
  bottoms: '👖',
  outer: '🧥',
  shoes: '👞',
  accessory: '🧣',
};

export default function OutfitCard({
  items,
  reason,
  footer,
  highlight,
}: {
  items: ClothingItem[];
  reason: string;
  footer?: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`glass-card animate-pop-in flex flex-col gap-3 rounded-lg p-4 ${
        highlight ? 'ring-1 ring-brand-pink/50' : ''
      }`}
    >
      <div className="flex gap-2.5 overflow-x-auto">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/closet?item=${item.id}`}
            className="flex w-20 shrink-0 flex-col items-center gap-1 transition-transform active:scale-[0.96]"
          >
            <div className="h-20 w-20 overflow-hidden rounded-xl bg-black/5">
              {item.imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageDataUrl}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl opacity-50">
                  {CATEGORY_EMOJI[item.category]}
                </div>
              )}
            </div>
            <p className="w-full truncate text-center text-[10px] text-text-muted">
              {item.name}
            </p>
          </Link>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-text-muted">{reason}</p>
      {footer}
    </div>
  );
}
