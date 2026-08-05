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

type EyeStyle = 'sleepy' | 'round' | 'sparkle' | 'sporty' | 'calm';
type MouthStyle = 'soft' | 'smile' | 'big' | 'grin';

function Eyes({ style, cx = 100 }: { style: EyeStyle; cx?: number }) {
  const l = cx - 15;
  const r = cx + 15;
  if (style === 'sleepy') {
    return (
      <g stroke="var(--bg)" strokeWidth={4.5} strokeLinecap="round" fill="none">
        <path d={`M${l - 7},${192} q7,7 14,0`} />
        <path d={`M${r - 7},${192} q7,7 14,0`} />
      </g>
    );
  }
  if (style === 'calm') {
    return (
      <g stroke="var(--bg)" strokeWidth={4.5} strokeLinecap="round" fill="none">
        <path d={`M${l - 7},${190} q7,3.5 14,0`} />
        <path d={`M${r - 7},${190} q7,3.5 14,0`} />
      </g>
    );
  }
  if (style === 'sparkle') {
    return (
      <g fill="var(--bg)">
        <circle cx={l} cy={192} r={7.5} />
        <circle cx={r} cy={192} r={7.5} />
        <circle cx={l + 2.5} cy={189} r={2} fill="#ffffff" />
        <circle cx={r + 2.5} cy={189} r={2} fill="#ffffff" />
      </g>
    );
  }
  if (style === 'sporty') {
    return (
      <g>
        <g fill="var(--bg)">
          <ellipse cx={l} cy={193} rx={6} ry={7} />
          <ellipse cx={r} cy={193} rx={6} ry={7} />
        </g>
        <g stroke="var(--bg)" strokeWidth={3} strokeLinecap="round">
          <path d={`M${l - 8},${181} q8,-4 15,-1`} />
          <path d={`M${r - 7},${180} q8,-3 15,1`} />
        </g>
      </g>
    );
  }
  return (
    <g fill="var(--bg)">
      <circle cx={l} cy={192} r={5.8} />
      <circle cx={r} cy={192} r={5.8} />
    </g>
  );
}

function Mouth({ style, cx = 100 }: { style: MouthStyle; cx?: number }) {
  if (style === 'big') return <path d={`M${cx - 16},${206} Q${cx},${222} ${cx + 16},${206}`} stroke="var(--bg)" strokeWidth={4.5} strokeLinecap="round" fill="none" />;
  if (style === 'grin')
    return <path d={`M${cx - 15},${206} Q${cx},${220} ${cx + 15},${206} Q${cx},${216} ${cx - 15},${206} Z`} fill="var(--bg)" />;
  if (style === 'soft') return <path d={`M${cx - 11},${208} Q${cx},${216} ${cx + 11},${208}`} stroke="var(--bg)" strokeWidth={4} strokeLinecap="round" fill="none" />;
  return <path d={`M${cx - 14},${207} Q${cx},${220} ${cx + 14},${207}`} stroke="var(--bg)" strokeWidth={4.5} strokeLinecap="round" fill="none" />;
}

function Leaf({
  x,
  y,
  rotate,
  scale = 1,
  color,
}: {
  x: number;
  y: number;
  rotate: number;
  scale?: number;
  color: string;
}) {
  return (
    <g transform={`translate(${x},${y}) rotate(${rotate}) scale(${scale})`}>
      <path d="M0,0 C11,-15 28,-15 32,0 C28,15 11,15 0,0 Z" fill={color} />
      <path d="M2,0 C12,0 22,0 30,0" stroke="var(--bg)" strokeOpacity={0.25} strokeWidth={1.5} fill="none" />
    </g>
  );
}

function Flower({ x, y, petal, bud = false }: { x: number; y: number; petal: string; bud?: boolean }) {
  if (bud) {
    return (
      <g transform={`translate(${x},${y})`}>
        <path d="M0,10 C-8,2 -6,-10 0,-14 C6,-10 8,2 0,10 Z" fill={petal} />
      </g>
    );
  }
  const petals = [0, 72, 144, 216, 288];
  return (
    <g transform={`translate(${x},${y})`}>
      {petals.map((deg) => (
        <ellipse key={deg} cx={0} cy={-11} rx={7} ry={10} fill={petal} transform={`rotate(${deg})`} />
      ))}
      <circle r={7} fill="#ffd94a" />
    </g>
  );
}

interface PlantConfig {
  stemPath: string | null;
  leaves: { x: number; y: number; rotate: number; scale?: number }[];
  topY: number;
  flower: 'bloom' | 'bud' | 'none';
}

const LEAF_GREEN = '#5fa85f';
const LEAF_GREEN_DARK = '#4a8f4a';

const PLANT: Record<MascotVariant, PlantConfig> = {
  noData: { stemPath: null, leaves: [], topY: 160, flower: 'none' },
  low: {
    stemPath: 'M100,164 C97,144 103,126 100,112',
    leaves: [{ x: 100, y: 122, rotate: -20, scale: 0.7 }],
    topY: 112,
    flower: 'none',
  },
  normal: {
    stemPath: 'M100,164 C93,124 107,80 100,46',
    leaves: [
      { x: 100, y: 135, rotate: 20 },
      { x: 100, y: 135, rotate: 200 },
      { x: 100, y: 95, rotate: -25 },
      { x: 100, y: 95, rotate: 155 },
    ],
    topY: 44,
    flower: 'bloom',
  },
  obese1: {
    stemPath: 'M100,164 C95,132 106,98 98,70',
    leaves: [
      { x: 100, y: 140, rotate: 25 },
      { x: 100, y: 140, rotate: 205 },
      { x: 99, y: 108, rotate: -20 },
      { x: 99, y: 108, rotate: 160 },
      { x: 98, y: 82, rotate: 30 },
    ],
    topY: 68,
    flower: 'bud',
  },
  obese2: {
    stemPath: 'M100,164 C105,138 94,112 103,86',
    leaves: [
      { x: 100, y: 138, rotate: -30, scale: 1.15 },
      { x: 101, y: 138, rotate: 195, scale: 1.15 },
      { x: 102, y: 104, rotate: 20, scale: 1.1 },
    ],
    topY: 86,
    flower: 'none',
  },
};

/** Extras that give each state a distinct read beyond leaf count. */
function Props({ variant, color }: { variant: MascotVariant; color: string }) {
  if (variant === 'noData') {
    return (
      <g>
        <ellipse cx={100} cy={160} rx={5} ry={3.5} fill="#6b4a2f" />
        <circle cx={152} cy={48} r={17} fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth={1.5} />
        <path d="M146,48 h12 M152,42 v12" stroke="var(--text-faint)" strokeWidth={3} strokeLinecap="round" />
      </g>
    );
  }
  if (variant === 'low') {
    return (
      <g transform="translate(52,90)">
        <path d="M0,-14 C7,-4 7,6 0,12 C-7,6 -7,-4 0,-14 Z" fill="#5aa7d6" opacity={0.85} />
      </g>
    );
  }
  if (variant === 'obese1') {
    return (
      <g>
        <rect x={122} y={96} width={4} height={122} rx={2} fill="#a9784f" />
        <ellipse cx={100} cy={130} rx={16} ry={7} fill="none" stroke="#a9784f" strokeWidth={2.5} />
        <g transform="translate(148,54)" stroke={color} strokeWidth={3} strokeLinecap="round">
          <circle r={8} fill={color} stroke="none" />
          <path d="M0,-14 v6 M0,8 v6 M-14,0 h6 M8,0 h6 M-10,-10 l4,4 M6,6 l4,4 M-10,10 l4,-4 M6,-6 l4,-4" />
        </g>
      </g>
    );
  }
  if (variant === 'obese2') {
    return (
      <g transform="translate(158,196)">
        <rect x={-14} y={-14} width={28} height={22} rx={5} fill={color} />
        <path d="M12,-8 L28,-16 L26,-9 L14,-2 Z" fill={color} />
        <path d="M-14,-16 Q-2,-24 10,-16" stroke={color} strokeWidth={4} fill="none" strokeLinecap="round" />
      </g>
    );
  }
  if (variant === 'normal') {
    return (
      <g fill="#ffd94a">
        <circle cx={70} cy={55} r={3} />
        <circle cx={135} cy={70} r={2.4} />
        <circle cx={122} cy={40} r={2} />
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
  const eyeStyle: EyeStyle = variant === 'noData' ? 'sleepy' : variant === 'normal' ? 'sparkle' : variant === 'obese1' ? 'sporty' : variant === 'obese2' ? 'calm' : 'round';
  const mouthStyle: MouthStyle = variant === 'normal' ? 'big' : variant === 'obese1' ? 'grin' : variant === 'obese2' ? 'soft' : variant === 'low' ? 'soft' : 'soft';
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

      {/* stem (behind pot rim, in front of shadow) */}
      {plant.stemPath && (
        <path d={plant.stemPath} stroke={LEAF_GREEN_DARK} strokeWidth={6} strokeLinecap="round" fill="none" />
      )}
      {plant.leaves.map((leaf, i) => (
        <Leaf key={i} x={leaf.x} y={leaf.y} rotate={leaf.rotate} scale={leaf.scale} color={i % 2 === 0 ? LEAF_GREEN : LEAF_GREEN_DARK} />
      ))}
      {plant.flower === 'bloom' && <Flower x={100} y={plant.topY} petal="#ffd94a" />}
      {plant.flower === 'bud' && <Flower x={98} y={plant.topY} petal={color} bud />}

      <Props variant={variant} color={color} />

      {/* pot */}
      <path d="M62,166 L138,166 L126,224 Q100,232 74,224 Z" fill={`url(#${potGradId})`} />
      <ellipse cx={100} cy={166} rx={38} ry={7} fill={`url(#${potGradId})`} />
      <ellipse cx={100} cy={166} rx={32} ry={5} fill="#4a3626" opacity={0.9} />
      <ellipse cx={80} cy={190} rx={22} ry={30} fill={`url(#${glossId})`} />

      {variant === 'obese2' && (
        <g>
          <rect x={64} y={184} width={72} height={20} rx={5} fill="var(--card-strong)" />
          <g stroke="var(--border)" strokeWidth={1} opacity={0.6}>
            <path d="M76,184 v20 M88,184 v20 M100,184 v20 M112,184 v20 M124,184 v20" />
          </g>
        </g>
      )}

      {/* face on the pot */}
      <Eyes style={eyeStyle} />
      <Mouth style={mouthStyle} />
    </svg>
  );
}
