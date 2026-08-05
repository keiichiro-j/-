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

const HEAD_BLOB_PATH =
  'M100,24 C138,22 172,52 176,90 C180,130 152,170 110,176 C68,182 26,158 20,116 C14,72 40,30 82,24 C88,23 94,23 100,24 Z';

function Accessory({ variant }: { variant: MascotVariant }) {
  const cx = 152;
  const cy = 176;
  return (
    <g>
      <circle cx={cx} cy={cy} r={18} fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth={1.5} />
      {variant === 'noData' && (
        <path d={`M${cx - 6},${cy} h12 M${cx},${cy - 6} v12`} stroke="var(--text-faint)" strokeWidth={3} strokeLinecap="round" />
      )}
      {variant === 'low' && (
        <g>
          <circle cx={cx} cy={cy + 2} r={6} fill="var(--tag-breakfast-text)" opacity={0.85} />
          <path d={`M${cx},${cy - 4} q4,-5 7,-3`} stroke="var(--tag-breakfast-text)" strokeWidth={2} fill="none" strokeLinecap="round" />
        </g>
      )}
      {variant === 'normal' && (
        <path
          d={`M${cx},${cy - 8} L${cx + 2.5},${cy - 2.5} L${cx + 8},${cy} L${cx + 2.5},${cy + 2.5} L${cx},${cy + 8} L${cx - 2.5},${cy + 2.5} L${cx - 8},${cy} L${cx - 2.5},${cy - 2.5} Z`}
          fill="var(--viz-good)"
        />
      )}
      {variant === 'obese1' && (
        <g stroke="var(--tag-lunch-text)" strokeWidth={2.2} strokeLinecap="round" fill="none">
          <path d={`M${cx},${cy + 7} V${cy - 1}`} />
          <path d={`M${cx},${cy - 1} q-7,-2 -7,-8`} />
          <path d={`M${cx},${cy - 1} q7,-2 7,-8`} />
        </g>
      )}
      {variant === 'obese2' && (
        <path
          d={`M${cx},${cy + 7} C${cx - 12},${cy - 2} ${cx - 7},${cy - 12} ${cx},${cy - 5} C${cx + 7},${cy - 12} ${cx + 12},${cy - 2} ${cx},${cy + 7} Z`}
          fill="var(--tag-dinner-text)"
          opacity={0.85}
        />
      )}
    </g>
  );
}

export default function Mascot({ variant, size = 100 }: { variant: MascotVariant; size?: number }) {
  const color = MASCOT_META[variant].color;
  const sleepy = variant === 'noData';
  const gradId = `mascot-grad-${variant}`;
  const glossId = `mascot-gloss-${variant}`;
  const height = Math.round(size * 1.3);

  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 200 260"
      role="img"
      aria-label={MASCOT_META[variant].title}
    >
      <defs>
        <linearGradient id={gradId} x1="45" y1="10" x2="155" y2="250" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={`color-mix(in srgb, ${color}, white 32%)`} />
          <stop offset="1" stopColor={`color-mix(in srgb, ${color}, black 22%)`} />
        </linearGradient>
        <radialGradient id={glossId} cx="0.35" cy="0.3" r="0.65">
          <stop offset="0" stopColor="#ffffff" stopOpacity={0.55} />
          <stop offset="1" stopColor="#ffffff" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* ground shadow */}
      <ellipse cx={100} cy={250} rx={50} ry={9} fill="var(--text)" opacity={0.14} />

      {/* feet */}
      <ellipse cx={78} cy={236} rx={17} ry={11} fill={`url(#${gradId})`} />
      <ellipse cx={122} cy={236} rx={17} ry={11} fill={`url(#${gradId})`} />

      {/* legs */}
      <rect x={67} y={202} width={19} height={32} rx={9.5} fill={`url(#${gradId})`} />
      <rect x={114} y={202} width={19} height={32} rx={9.5} fill={`url(#${gradId})`} />

      {/* arms */}
      <ellipse cx={38} cy={158} rx={17} ry={27} fill={`url(#${gradId})`} transform="rotate(-16 38 158)" />
      <ellipse cx={162} cy={158} rx={17} ry={27} fill={`url(#${gradId})`} transform="rotate(16 162 158)" />

      {/* torso */}
      <rect x={50} y={116} width={100} height={102} rx={48} fill={`url(#${gradId})`} />

      {/* head + face (shares the original 0-200 face coordinate space) */}
      <g transform="translate(26,-1) scale(0.76)">
        <path d={HEAD_BLOB_PATH} fill={`url(#${gradId})`} />
        <ellipse cx={64} cy={110} rx={10} ry={7} fill="#ffffff" opacity={0.22} />
        <ellipse cx={136} cy={110} rx={10} ry={7} fill="#ffffff" opacity={0.22} />
        {sleepy ? (
          <g stroke="var(--bg)" strokeWidth={5} strokeLinecap="round" fill="none">
            <path d="M70,92 q8,8 16,0" />
            <path d="M114,92 q8,8 16,0" />
          </g>
        ) : (
          <g fill="var(--bg)">
            <circle cx={78} cy={92} r={7} />
            <circle cx={122} cy={92} r={7} />
          </g>
        )}
        <path d="M80,122 Q100,140 120,122" stroke="var(--bg)" strokeWidth={5.5} strokeLinecap="round" fill="none" />
      </g>

      {/* glossy 3D highlight across head + torso */}
      <ellipse cx={78} cy={70} rx={40} ry={34} fill={`url(#${glossId})`} />
      <ellipse cx={80} cy={150} rx={26} ry={30} fill={`url(#${glossId})`} opacity={0.7} />

      <Accessory variant={variant} />
    </svg>
  );
}
