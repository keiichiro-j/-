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

const TILE_ROTATIONS = [-4, 3, -2.5];

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
  if (highlight) {
    return <OutfitHero items={items} reason={reason} footer={footer} />;
  }

  return (
    <div className="glass-card animate-pop-in flex flex-col gap-3 rounded-lg p-4">
      <div className="flex gap-2.5 overflow-x-auto">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/closet?item=${item.id}`}
            className="flex w-20 shrink-0 flex-col items-center gap-1 transition-transform active:scale-[0.96]"
          >
            <div className="h-20 w-20 overflow-hidden rounded-xl bg-text/5">
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

function OutfitHero({
  items,
  reason,
  footer,
}: {
  items: ClothingItem[];
  reason: string;
  footer?: ReactNode;
}) {
  const [primary, ...rest] = items;
  if (!primary) return null;
  const supporting = rest.slice(0, 3);

  return (
    <div className="animate-pop-in flex flex-col gap-3">
      <div className="relative -mx-5 mb-9">
        <Link
          href={`/closet?item=${primary.id}`}
          className="block aspect-[4/5] w-full overflow-hidden bg-text/5"
        >
          {primary.imageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={primary.imageDataUrl}
              alt={primary.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-7xl opacity-30">
              {CATEGORY_EMOJI[primary.category]}
            </div>
          )}
        </Link>
        {supporting.length > 0 && (
          <div className="absolute -bottom-8 right-9 z-10 flex">
            {supporting.map((item, i) => (
              <Link
                key={item.id}
                href={`/closet?item=${item.id}`}
                style={{ transform: `rotate(${TILE_ROTATIONS[i % TILE_ROTATIONS.length]}deg)`, zIndex: i }}
                className="-ml-4 h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 border-[var(--bg)] bg-card shadow-[var(--shadow-nav)] transition-transform first:ml-0 hover:z-20 hover:scale-110"
              >
                {item.imageDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageDataUrl}
                    alt={item.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-text/5 text-xl opacity-50">
                    {CATEGORY_EMOJI[item.category]}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="glass-card flex flex-col gap-3 rounded-lg p-4">
        <p className="text-xs leading-relaxed text-text-muted">{reason}</p>
        {footer}
      </div>
    </div>
  );
}
