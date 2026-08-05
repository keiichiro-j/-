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

const GREENS = ['#4f8f52', '#5fa85f', '#437a46', '#6bb56b'];

interface LeafSpec {
  x: number;
  y: number;
  rotate: number;
  scale?: number;
  colorIndex?: number;
}

function Leaf({ x, y, rotate, scale = 1, colorIndex = 0 }: LeafSpec) {
  const gradId = `leaf-grad-${colorIndex}`;
  return (
    <g transform={`translate(${x},${y}) rotate(${rotate}) scale(${scale})`}>
      <path
        d="M0,0 C-17,-4 -25,-19 -13,-33 C-8,-40 -3,-42 0,-41 C3,-42 10,-39 13,-32 C24,-18 16,-4 0,0 Z"
        fill={`url(#${gradId})`}
      />
      <path
        d="M-3,-5 C-6,-15 -5,-26 -2,-36"
        stroke="#ffffff"
        strokeOpacity={0.16}
        strokeWidth={2.4}
        strokeLinecap="round"
        fill="none"
      />
      <path d="M0,-2 C-1,-14 -1,-27 0,-38" stroke="#2f5330" strokeOpacity={0.42} strokeWidth={1.1} fill="none" />
      <path
        d="M0,-11 C-5,-15 -8,-18 -11,-21 M0,-19 C-4,-22 -6,-24 -9,-26 M0,-27 C-3,-29 -5,-31 -7,-32 M0,-11 C5,-15 8,-18 11,-21 M0,-19 C4,-22 6,-24 9,-26"
        stroke="#2f5330"
        strokeOpacity={0.32}
        strokeWidth={0.9}
        fill="none"
      />
      <circle cx={0} cy={1.5} r={2.2} fill="#3f6b42" />
    </g>
  );
}

function Flower({ x, y, bud = false }: { x: number; y: number; bud?: boolean }) {
  if (bud) {
    return (
      <g transform={`translate(${x},${y})`}>
        <path d="M0,10 C-7,2 -5,-11 0,-15 C5,-11 7,2 0,10 Z" fill="var(--tag-lunch-bg)" />
        <path d="M0,8 C-3,2 -2,-8 0,-12" stroke="#ffffff" strokeOpacity={0.2} strokeWidth={1.4} fill="none" />
      </g>
    );
  }
  const petals = [0, 72, 144, 216, 288];
  return (
    <g transform={`translate(${x},${y})`}>
      {petals.map((deg) => (
        <ellipse key={deg} cx={0} cy={-10} rx={6.5} ry={9.5} fill="url(#petal-grad)" transform={`rotate(${deg})`} />
      ))}
      <circle r={6.5} fill="#e8a33d" />
      <circle r={6.5} fill="url(#pollen-grad)" />
    </g>
  );
}

interface PlantConfig {
  stemPath: string | null;
  leaves: LeafSpec[];
  topY: number;
  flower: 'bloom' | 'bud' | 'none';
}

const PLANT: Record<MascotVariant, PlantConfig> = {
  noData: { stemPath: null, leaves: [], topY: 160, flower: 'none' },
  low: {
    stemPath: 'M100,164 C99,148 103,132 109,120',
    leaves: [
      { x: 109, y: 121, rotate: 195, scale: 0.5, colorIndex: 2 },
      { x: 102, y: 142, rotate: 30, scale: 0.42, colorIndex: 0 },
    ],
    topY: 118,
    flower: 'none',
  },
  normal: {
    stemPath: 'M100,164 C94,132 106,96 100,50',
    leaves: [
      { x: 100, y: 148, rotate: 25, scale: 0.95, colorIndex: 0 },
      { x: 100, y: 148, rotate: 202, scale: 0.9, colorIndex: 1 },
      { x: 99, y: 118, rotate: -22, scale: 1.0, colorIndex: 1 },
      { x: 99, y: 118, rotate: 158, scale: 0.95, colorIndex: 2 },
      { x: 100, y: 86, rotate: 20, scale: 0.85, colorIndex: 0 },
      { x: 100, y: 86, rotate: 195, scale: 0.8, colorIndex: 3 },
    ],
    topY: 48,
    flower: 'bloom',
  },
  obese1: {
    stemPath: 'M100,164 C95,136 106,104 98,72',
    leaves: [
      { x: 100, y: 150, rotate: 28, scale: 1.05, colorIndex: 0 },
      { x: 100, y: 150, rotate: 208, scale: 1.0, colorIndex: 1 },
      { x: 100, y: 128, rotate: -18, scale: 1.1, colorIndex: 2 },
      { x: 100, y: 122, rotate: 165, scale: 1.0, colorIndex: 0 },
      { x: 98, y: 98, rotate: -30, scale: 1.05, colorIndex: 3 },
      { x: 98, y: 96, rotate: 150, scale: 0.95, colorIndex: 1 },
      { x: 98, y: 78, rotate: 15, scale: 0.85, colorIndex: 2 },
    ],
    topY: 70,
    flower: 'bud',
  },
  obese2: {
    stemPath: 'M100,164 C105,138 96,116 108,96',
    leaves: [
      { x: 100, y: 150, rotate: 100, scale: 1.35, colorIndex: 1 },
      { x: 101, y: 150, rotate: 250, scale: 1.3, colorIndex: 0 },
      { x: 104, y: 122, rotate: 80, scale: 1.4, colorIndex: 2 },
      { x: 107, y: 100, rotate: 260, scale: 1.25, colorIndex: 3 },
    ],
    topY: 96,
    flower: 'none',
  },
};

export default function Mascot({ variant, size = 100 }: { variant: MascotVariant; size?: number }) {
  const color = MASCOT_META[variant].color;
  const plant = PLANT[variant];
  const potGradId = `pot-grad-${variant}`;
  const soilGradId = `soil-grad-${variant}`;
  const height = Math.round(size * 1.2);

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
        <linearGradient id="stem-grad" x1="0" y1="164" x2="0" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5f6b34" />
          <stop offset="1" stopColor="#6fb56f" />
        </linearGradient>
        <linearGradient id="petal-grad" x1="0" y1="1" x2="0.4" y2="0">
          <stop offset="0" stopColor="#e8b93f" />
          <stop offset="1" stopColor="#f8de7c" />
        </linearGradient>
        <radialGradient id="pollen-grad" cx="0.35" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#ffffff" stopOpacity={0.35} />
          <stop offset="1" stopColor="#ffffff" stopOpacity={0} />
        </radialGradient>
        {GREENS.map((c, i) => (
          <linearGradient key={i} id={`leaf-grad-${i}`} x1="0.1" y1="0" x2="0.6" y2="1">
            <stop offset="0" stopColor={`color-mix(in srgb, ${c}, white 28%)`} />
            <stop offset="1" stopColor={`color-mix(in srgb, ${c}, black 20%)`} />
          </linearGradient>
        ))}
      </defs>

      {/* ground shadow */}
      <ellipse cx={100} cy={233} rx={50} ry={7} fill="var(--text)" opacity={0.18} filter="url(#mascot-soft-blur)" />

      {/* stem */}
      {plant.stemPath && (
        <path d={plant.stemPath} stroke="url(#stem-grad)" strokeWidth={5.5} strokeLinecap="round" fill="none" />
      )}
      {plant.leaves.map((leaf, i) => (
        <Leaf key={i} {...leaf} />
      ))}
      {plant.flower === 'bloom' && <Flower x={100} y={plant.topY} />}
      {plant.flower === 'bud' && <Flower x={98} y={plant.topY} bud />}

      {/* pot */}
      <path d="M62,166 L138,166 L126,224 Q100,232 74,224 Z" fill={`url(#${potGradId})`} />
      {/* subtle ceramic ridge shading */}
      <g stroke="var(--text)" strokeOpacity={0.06} strokeWidth={1.4} fill="none">
        <path d="M78,170 C76,190 77,208 80,222" />
        <path d="M100,170 C99,192 100,210 100,224" />
        <path d="M122,170 C124,190 123,208 120,222" />
      </g>
      <g stroke="#ffffff" strokeOpacity={0.14} strokeWidth={1.2} fill="none">
        <path d="M70,172 C68,192 69,208 72,220" />
      </g>
      {/* rim */}
      <ellipse cx={100} cy={166} rx={38} ry={7} fill={`url(#${potGradId})`} />
      <path d="M66,163 A34,6 0 0 1 96,159.5" stroke="#ffffff" strokeOpacity={0.4} strokeWidth={2} strokeLinecap="round" fill="none" />
      {/* soil */}
      <ellipse cx={100} cy={166} rx={32} ry={5} fill={`url(#${soilGradId})`} />
      <circle cx={92} cy={165} r={1.6} fill="#1f160e" opacity={0.7} />
      <circle cx={110} cy={167} r={1.3} fill="#1f160e" opacity={0.6} />
      <circle cx={85} cy={168} r={1} fill="#1f160e" opacity={0.5} />
      {/* specular highlight on the shoulder */}
      <ellipse cx={78} cy={182} rx={11} ry={17} fill="#ffffff" opacity={0.16} />
    </svg>
  );
}
