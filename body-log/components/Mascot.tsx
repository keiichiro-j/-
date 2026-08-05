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
      <rect x={90} y={112} width={20} height={54} rx={10} fill="url(#cactus-grad)" />
      <g stroke="#2f5330" strokeOpacity={0.4} strokeWidth={1.3}>
        {ribXs.map((x) => (
          <line key={x} x1={x} y1={114} x2={x} y2={164} />
        ))}
      </g>
      <Spines points={[[93, 122], [107, 128], [93, 140], [107, 148], [100, 116], [100, 158]]} />
    </g>
  );
}

/** 標準体重: まるい玉サボテン + 花 */
function BallCactus() {
  const ribs: { x: number; y1: number; y2: number }[] = [
    { x: 70, y1: 118, y2: 152 },
    { x: 80, y1: 106, y2: 164 },
    { x: 90, y1: 101, y2: 169 },
    { x: 100, y1: 99, y2: 171 },
    { x: 110, y1: 101, y2: 169 },
    { x: 120, y1: 106, y2: 164 },
    { x: 130, y1: 118, y2: 152 },
  ];
  return (
    <g>
      <ellipse cx={100} cy={135} rx={34} ry={36} fill="url(#cactus-grad)" />
      <g stroke="#2f5330" strokeOpacity={0.35} strokeWidth={1.3}>
        {ribs.map((r) => (
          <line key={r.x} x1={r.x} y1={r.y1} x2={r.x} y2={r.y2} />
        ))}
      </g>
      <Spines
        points={[
          [80, 118], [80, 148], [90, 110], [90, 158], [100, 106], [100, 162], [110, 110], [110, 158], [120, 118], [120, 148],
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
      <rect x={104} y={90} width={30} height={15} rx={7.5} fill="url(#cactus-grad)" />
      <rect x={118} y={48} width={17} height={50} rx={8.5} fill="url(#cactus-grad)" />
      <rect x={85} y={56} width={26} height={110} rx={13} fill="url(#cactus-grad)" />
      <g stroke="#2f5330" strokeOpacity={0.38} strokeWidth={1.3}>
        {trunkRibs.map((x) => (
          <line key={x} x1={x} y1={58} x2={x} y2={164} />
        ))}
        {armRibs.map((x) => (
          <line key={x} x1={x} y1={51} x2={x} y2={96} />
        ))}
      </g>
      <Spines
        points={[
          [88, 80], [112, 90], [88, 110], [112, 130], [88, 140], [121, 60], [131, 70], [121, 85],
        ]}
      />
    </g>
  );
}

/** 肥満(2度以上): うちわサボテン(バニーカクタス、ふっくらと丸い) */
function PricklyPear() {
  return (
    <g>
      <ellipse cx={100} cy={150} rx={30} ry={34} fill="url(#cactus-grad)" />
      <ellipse cx={77} cy={99} rx={22} ry={28} fill="url(#cactus-grad)" transform="rotate(-14 77 99)" />
      <ellipse cx={119} cy={103} rx={20} ry={26} fill="url(#cactus-grad)" transform="rotate(13 119 103)" />
      <Spines
        points={[
          [88, 140], [112, 155], [95, 168], [70, 95], [82, 110], [66, 105], [113, 96], [125, 112], [110, 118],
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
  const color = MASCOT_META[variant].color;
  const potGradId = `pot-grad-${variant}`;
  const soilGradId = `soil-grad-${variant}`;
  const height = Math.round(size * 1.2);
  const CactusBody = CACTUS[variant];

  return (
    <svg width={size} height={height} viewBox="0 0 200 240" role="img" aria-label={MASCOT_META[variant].title}>
      <defs>
        <filter id="mascot-soft-blur" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <linearGradient id={potGradId} x1="60" y1="164" x2="140" y2="230" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={`color-mix(in srgb, ${color}, white 26%)`} />
          <stop offset="0.55" stopColor={color} />
          <stop offset="1" stopColor={`color-mix(in srgb, ${color}, black 24%)`} />
        </linearGradient>
        <radialGradient id={soilGradId} cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#5a4530" />
          <stop offset="1" stopColor="#2f2115" />
        </radialGradient>
        <linearGradient id="cactus-grad" x1="0.15" y1="0" x2="0.65" y2="1">
          <stop offset="0" stopColor="#7ec37e" />
          <stop offset="1" stopColor="#3d7a40" />
        </linearGradient>
        <radialGradient id="petal-grad" cx="0.35" cy="0.25" r="0.8">
          <stop offset="0" stopColor="#f8de7c" />
          <stop offset="1" stopColor="#e8b93f" />
        </radialGradient>
      </defs>

      {/* ground shadow */}
      <ellipse cx={100} cy={233} rx={50} ry={7} fill="var(--text)" opacity={0.18} filter="url(#mascot-soft-blur)" />

      {/* cactus body (drawn behind the pot rim/soil so its base tucks under the soil line) */}
      {CactusBody && <CactusBody />}
      {variant === 'normal' && (
        <g transform="translate(100,97)">
          {[0, 72, 144, 216, 288].map((deg) => (
            <ellipse key={deg} cx={0} cy={-9} rx={6} ry={8.5} fill="url(#petal-grad)" transform={`rotate(${deg})`} />
          ))}
          <circle r={5.5} fill="#e8933d" />
        </g>
      )}

      {/* pot */}
      <path d="M62,166 L138,166 L126,224 Q100,232 74,224 Z" fill={`url(#${potGradId})`} />
      <g stroke="var(--text)" strokeOpacity={0.06} strokeWidth={1.4} fill="none">
        <path d="M78,170 C76,190 77,208 80,222" />
        <path d="M100,170 C99,192 100,210 100,224" />
        <path d="M122,170 C124,190 123,208 120,222" />
      </g>
      <g stroke="#ffffff" strokeOpacity={0.14} strokeWidth={1.2} fill="none">
        <path d="M70,172 C68,192 69,208 72,220" />
      </g>
      <ellipse cx={100} cy={166} rx={38} ry={7} fill={`url(#${potGradId})`} />
      <path d="M66,163 A34,6 0 0 1 96,159.5" stroke="#ffffff" strokeOpacity={0.4} strokeWidth={2} strokeLinecap="round" fill="none" />
      <ellipse cx={100} cy={166} rx={32} ry={5} fill={`url(#${soilGradId})`} />
      <circle cx={92} cy={165} r={1.6} fill="#1f160e" opacity={0.7} />
      <circle cx={110} cy={167} r={1.3} fill="#1f160e" opacity={0.6} />
      <circle cx={85} cy={168} r={1} fill="#1f160e" opacity={0.5} />
      {variant === 'noData' && <ellipse cx={100} cy={164} rx={5} ry={3.5} fill="#6b4a2f" />}
      <ellipse cx={78} cy={182} rx={11} ry={17} fill="#ffffff" opacity={0.16} />
    </svg>
  );
}
