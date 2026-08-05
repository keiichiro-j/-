import type { ComponentType } from 'react';
import type { MascotVariant } from '@/lib/health';

export const MASCOT_META: Record<MascotVariant, { color: string; title: string; message: string }> = {
  noData: {
    color: '#9a9284',
    title: 'はじめまして',
    message: '身長・体重を登録すると、ここに今の状態が表示されます',
  },
  low: {
    color: 'var(--tag-breakfast-bg)',
    title: '低体重ぎみ',
    message: 'しっかり食べて、栄養をつけていきましょう',
  },
  normal: {
    color: 'var(--viz-good)',
    title: '標準体重',
    message: 'いい調子です。このペースをキープしましょう',
  },
  obese1: {
    color: 'var(--tag-lunch-bg)',
    title: 'ゆるやかに',
    message: '無理なく、できる範囲で体を動かしてみましょう',
  },
  obese2: {
    color: 'var(--tag-dinner-bg)',
    title: 'マイペースに',
    message: '焦らなくて大丈夫。少しずつ一緒に整えていきましょう',
  },
};

function Spines({ points }: { points: [number, number][] }) {
  return (
    <g fill="#f5f0e6" opacity={0.8}>
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.1} />
      ))}
    </g>
  );
}

/** 低体重: 一本の細い柱サボテン(まだ小さく発育途上) */
function ColumnCactus() {
  const ribXs = [94, 100, 106];
  return (
    <g>
      <rect x={90} y={136} width={20} height={54} rx={10} fill="url(#cactus-grad)" />
      <g stroke="#2f5330" strokeOpacity={0.4} strokeWidth={1.3}>
        {ribXs.map((x) => (
          <line key={x} x1={x} y1={138} x2={x} y2={188} />
        ))}
      </g>
      <Spines points={[[93, 146], [107, 152], [93, 164], [107, 172], [100, 140], [100, 182]]} />
    </g>
  );
}

/** 標準体重: まるい玉サボテン + 花 */
function BallCactus() {
  const ribs: { x: number; y1: number; y2: number }[] = [
    { x: 70, y1: 142, y2: 176 },
    { x: 80, y1: 130, y2: 188 },
    { x: 90, y1: 125, y2: 193 },
    { x: 100, y1: 123, y2: 195 },
    { x: 110, y1: 125, y2: 193 },
    { x: 120, y1: 130, y2: 188 },
    { x: 130, y1: 142, y2: 176 },
  ];
  return (
    <g>
      <ellipse cx={100} cy={159} rx={34} ry={36} fill="url(#cactus-grad)" />
      <g stroke="#2f5330" strokeOpacity={0.35} strokeWidth={1.3}>
        {ribs.map((r) => (
          <line key={r.x} x1={r.x} y1={r.y1} x2={r.x} y2={r.y2} />
        ))}
      </g>
      <Spines
        points={[
          [80, 142], [80, 172], [90, 134], [90, 182], [100, 130], [100, 186], [110, 134], [110, 182], [120, 142], [120, 172],
        ]}
      />
    </g>
  );
}

/** 肥満(1度): 腕の生えたサボテン(すくすく育っている途中) */
function ArmCactus() {
  const trunkRibs = [90, 96, 102, 108];
  const armRibs = [122, 126, 130];
  return (
    <g>
      <rect x={104} y={114} width={30} height={15} rx={7.5} fill="url(#cactus-grad)" />
      <rect x={118} y={72} width={17} height={50} rx={8.5} fill="url(#cactus-grad)" />
      <rect x={85} y={80} width={26} height={110} rx={13} fill="url(#cactus-grad)" />
      <g stroke="#2f5330" strokeOpacity={0.38} strokeWidth={1.3}>
        {trunkRibs.map((x) => (
          <line key={x} x1={x} y1={82} x2={x} y2={188} />
        ))}
        {armRibs.map((x) => (
          <line key={x} x1={x} y1={75} x2={x} y2={120} />
        ))}
      </g>
      <Spines
        points={[
          [88, 104], [112, 114], [88, 134], [112, 154], [88, 164], [121, 84], [131, 94], [121, 109],
        ]}
      />
    </g>
  );
}

/** 肥満(2度以上): うちわサボテン(バニーカクタス、ふっくらと丸い) */
function PricklyPear() {
  return (
    <g>
      <ellipse cx={100} cy={174} rx={30} ry={34} fill="url(#cactus-grad)" />
      <ellipse cx={77} cy={123} rx={22} ry={28} fill="url(#cactus-grad)" transform="rotate(-14 77 123)" />
      <ellipse cx={119} cy={127} rx={20} ry={26} fill="url(#cactus-grad)" transform="rotate(13 119 127)" />
      <Spines
        points={[
          [88, 164], [112, 179], [95, 192], [70, 119], [82, 134], [66, 129], [113, 120], [125, 136], [110, 142],
        ]}
      />
    </g>
  );
}

const CACTUS: Record<MascotVariant, ComponentType | null> = {
  noData: null,
  low: ColumnCactus,
  normal: BallCactus,
  obese1: ArmCactus,
  obese2: PricklyPear,
};

export default function Mascot({ variant, size = 100 }: { variant: MascotVariant; size?: number }) {
  const height = Math.round(size * 1.2);
  const CactusBody = CACTUS[variant];

  return (
    <svg width={size} height={height} viewBox="0 0 200 240" role="img" aria-label={MASCOT_META[variant].title}>
      <defs>
        <filter id="mascot-soft-blur" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <linearGradient id="cactus-grad" x1="0.15" y1="0" x2="0.65" y2="1">
          <stop offset="0" stopColor="#7ec37e" />
          <stop offset="1" stopColor="#3d7a40" />
        </linearGradient>
        <radialGradient id="petal-grad" cx="0.35" cy="0.25" r="0.8">
          <stop offset="0" stopColor="#f8de7c" />
          <stop offset="1" stopColor="#e8b93f" />
        </radialGradient>
        <linearGradient id="sand-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9c49a" />
          <stop offset="1" stopColor="#b89a68" />
        </linearGradient>
      </defs>

      {/* ground shadow */}
      <ellipse cx={100} cy={214} rx={54} ry={8} fill="var(--text)" opacity={0.16} filter="url(#mascot-soft-blur)" />

      {/* sandy ground */}
      <ellipse cx={100} cy={206} rx={62} ry={15} fill="url(#sand-grad)" />
      <ellipse cx={72} cy={210} rx={7} ry={4} fill="#8a7350" opacity={0.5} />
      <ellipse cx={128} cy={208} rx={5.5} ry={3.5} fill="#8a7350" opacity={0.45} />
      <ellipse cx={100} cy={213} rx={6} ry={3} fill="#8a7350" opacity={0.4} />

      {/* cactus body */}
      {CactusBody && <CactusBody />}
      {variant === 'normal' && (
        <g transform="translate(100,121)">
          {[0, 72, 144, 216, 288].map((deg) => (
            <ellipse key={deg} cx={0} cy={-9} rx={6} ry={8.5} fill="url(#petal-grad)" transform={`rotate(${deg})`} />
          ))}
          <circle r={5.5} fill="#e8933d" />
        </g>
      )}
      {variant === 'noData' && <ellipse cx={100} cy={202} rx={5} ry={3.5} fill="#6b4a2f" />}
    </svg>
  );
}
