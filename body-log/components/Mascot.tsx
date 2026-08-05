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
  const fill = GREENS[colorIndex % GREENS.length];
  return (
    <g transform={`translate(${x},${y}) rotate(${rotate}) scale(${scale})`}>
      <path
        d="M0,0 C-16,-5 -23,-21 -10,-35 C-5,-41 5,-41 10,-35 C23,-21 16,-5 0,0 Z"
        fill={fill}
      />
      <path
        d="M0,-2 C-1,-14 -1,-27 0,-37"
        stroke="var(--bg)"
        strokeOpacity={0.28}
        strokeWidth={1.4}
        fill="none"
      />
      <path
        d="M0,-11 C-5,-15 -8,-18 -11,-21 M0,-20 C-4,-23 -6,-25 -9,-27 M0,-11 C5,-15 8,-18 11,-21 M0,-20 C4,-23 6,-25 9,-27"
        stroke="var(--bg)"
        strokeOpacity={0.2}
        strokeWidth={1}
        fill="none"
      />
      <circle cx={0} cy={2} r={2.6} fill="#3f6b42" />
    </g>
  );
}

function Flower({ x, y, bud = false }: { x: number; y: number; bud?: boolean }) {
  if (bud) {
    return (
      <g transform={`translate(${x},${y})`}>
        <path d="M0,10 C-7,2 -5,-11 0,-15 C5,-11 7,2 0,10 Z" fill="var(--tag-lunch-bg)" />
      </g>
    );
  }
  const petals = [0, 72, 144, 216, 288];
  return (
    <g transform={`translate(${x},${y})`}>
      {petals.map((deg) => (
        <ellipse key={deg} cx={0} cy={-10} rx={6.5} ry={9.5} fill="#f4d35e" transform={`rotate(${deg})`} />
      ))}
      <circle r={6.5} fill="#e8a33d" />
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

function Props({ variant, color }: { variant: MascotVariant; color: string }) {
  if (variant === 'noData') {
    return <ellipse cx={100} cy={160} rx={5} ry={3.5} fill="#6b4a2f" />;
  }
  if (variant === 'low') {
    return (
      <g transform="translate(58,84)">
        <path d="M0,-14 C7,-4 7,6 0,12 C-7,6 -7,-4 0,-14 Z" fill="#5aa7d6" opacity={0.85} />
      </g>
    );
  }
  if (variant === 'obese1') {
    return (
      <g>
        <rect x={122} y={92} width={4} height={126} rx={2} fill="#a9784f" />
        <ellipse cx={100} cy={126} rx={16} ry={7} fill="none" stroke="#a9784f" strokeWidth={2.5} />
        <g transform="translate(148,50)" stroke={color} strokeWidth={3} strokeLinecap="round">
          <circle r={8} fill={color} stroke="none" />
          <path d="M0,-14 v6 M0,8 v6 M-14,0 h6 M8,0 h6 M-10,-10 l4,4 M6,6 l4,4 M-10,10 l4,-4 M6,-6 l4,-4" />
        </g>
      </g>
    );
  }
  if (variant === 'obese2') {
    return (
      <g transform="translate(160,198)">
        <rect x={-14} y={-14} width={28} height={22} rx={5} fill={color} />
        <path d="M12,-8 L28,-16 L26,-9 L14,-2 Z" fill={color} />
        <path d="M-14,-16 Q-2,-24 10,-16" stroke={color} strokeWidth={4} fill="none" strokeLinecap="round" />
      </g>
    );
  }
  return null;
}

export default function Mascot({ variant, size = 100 }: { variant: MascotVariant; size?: number }) {
  const color = MASCOT_META[variant].color;
  const plant = PLANT[variant];
  const potGradId = `pot-grad-${variant}`;
  const glossId = `pot-gloss-${variant}`;
  const height = Math.round(size * 1.2);

  return (
    <svg width={size} height={height} viewBox="0 0 200 240" role="img" aria-label={MASCOT_META[variant].title}>
      <defs>
        <linearGradient id={potGradId} x1="60" y1="164" x2="140" y2="230" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={`color-mix(in srgb, ${color}, white 30%)`} />
          <stop offset="1" stopColor={`color-mix(in srgb, ${color}, black 20%)`} />
        </linearGradient>
        <radialGradient id={glossId} cx="0.32" cy="0.25" r="0.7">
          <stop offset="0" stopColor="#ffffff" stopOpacity={0.4} />
          <stop offset="1" stopColor="#ffffff" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* ground shadow */}
      <ellipse cx={100} cy={234} rx={54} ry={8} fill="var(--text)" opacity={0.14} />

      {/* stem */}
      {plant.stemPath && (
        <path d={plant.stemPath} stroke="#437a46" strokeWidth={5.5} strokeLinecap="round" fill="none" />
      )}
      {plant.leaves.map((leaf, i) => (
        <Leaf key={i} {...leaf} />
      ))}
      {plant.flower === 'bloom' && <Flower x={100} y={plant.topY} />}
      {plant.flower === 'bud' && <Flower x={98} y={plant.topY} bud />}

      <Props variant={variant} color={color} />

      {/* pot */}
      <path d="M62,166 L138,166 L126,224 Q100,232 74,224 Z" fill={`url(#${potGradId})`} />
      <ellipse cx={100} cy={166} rx={38} ry={7} fill={`url(#${potGradId})`} />
      <ellipse cx={100} cy={166} rx={32} ry={5} fill="#4a3626" opacity={0.9} />
      <circle cx={92} cy={165} r={1.6} fill="#2f2115" opacity={0.6} />
      <circle cx={108} cy={167} r={1.3} fill="#2f2115" opacity={0.5} />
      <ellipse cx={80} cy={190} rx={22} ry={30} fill={`url(#${glossId})`} />

      {variant === 'obese2' && (
        <g>
          <rect x={64} y={184} width={72} height={20} rx={5} fill="var(--card-strong)" />
          <g stroke="var(--border)" strokeWidth={1} opacity={0.6}>
            <path d="M76,184 v20 M88,184 v20 M100,184 v20 M112,184 v20 M124,184 v20" />
          </g>
        </g>
      )}
    </svg>
  );
}
