import type { ClothingItem } from '@/lib/types';

export default function DressUpSilhouette({
  heightCm,
  faceImageDataUrl,
  top,
  bottom,
  outer,
  shoes,
}: {
  heightCm?: number;
  faceImageDataUrl?: string;
  top?: ClothingItem;
  bottom?: ClothingItem;
  outer?: ClothingItem;
  shoes?: ClothingItem;
}) {
  const scale = Math.min(1.12, Math.max(0.88, (heightCm ?? 168) / 168));

  return (
    <div className="flex justify-center py-4">
      <div
        className="relative"
        style={{
          width: 200,
          height: 380,
          transform: `scale(${scale})`,
          transformOrigin: 'bottom center',
        }}
      >
        {/* base silhouette (decorative line art guide) */}
        <svg viewBox="0 0 200 380" className="absolute inset-0 h-full w-full" fill="none">
          <circle cx="100" cy="40" r="30" stroke="var(--border)" strokeWidth="2" />
          <path
            d="M62 86 Q100 72 138 86 L148 200 Q100 215 52 200 Z"
            stroke="var(--border)"
            strokeWidth="2"
          />
          <path d="M56 200 L48 322 L90 322 L96 205 Z" stroke="var(--border)" strokeWidth="2" />
          <path d="M144 200 L152 322 L110 322 L104 205 Z" stroke="var(--border)" strokeWidth="2" />
          <rect x="40" y="322" width="54" height="18" rx="8" stroke="var(--border)" strokeWidth="2" />
          <rect x="106" y="322" width="54" height="18" rx="8" stroke="var(--border)" strokeWidth="2" />
        </svg>

        {/* face */}
        <div className="absolute left-1/2 top-[10px] h-[60px] w-[60px] -translate-x-1/2 overflow-hidden rounded-full bg-black/5">
          {faceImageDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={faceImageDataUrl} alt="" className="h-full w-full object-cover" />
          )}
        </div>

        {/* outer, worn loosely over the torso */}
        {outer?.imageDataUrl && (
          <div className="absolute left-[32px] top-[78px] h-[135px] w-[136px] overflow-hidden rounded-2xl opacity-95 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={outer.imageDataUrl} alt={outer.name} className="h-full w-full object-cover" />
          </div>
        )}

        {/* top */}
        {top?.imageDataUrl && (
          <div className="absolute left-[52px] top-[84px] h-[118px] w-[96px] overflow-hidden rounded-2xl shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={top.imageDataUrl} alt={top.name} className="h-full w-full object-cover" />
          </div>
        )}

        {/* bottom */}
        {bottom?.imageDataUrl && (
          <div className="absolute left-[50px] top-[198px] h-[128px] w-[100px] overflow-hidden rounded-2xl shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bottom.imageDataUrl}
              alt={bottom.name}
              className="h-full w-full object-cover"
            />
          </div>
        )}

        {/* shoes */}
        {shoes?.imageDataUrl && (
          <div className="absolute left-[40px] top-[320px] h-[22px] w-[120px] overflow-hidden rounded-lg shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shoes.imageDataUrl} alt={shoes.name} className="h-full w-full object-cover" />
          </div>
        )}
      </div>
    </div>
  );
}
