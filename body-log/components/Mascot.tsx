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

const BLOB_PATH =
  'M100,24 C138,22 172,52 176,90 C180,130 152,170 110,176 C68,182 26,158 20,116 C14,72 40,30 82,24 C88,23 94,23 100,24 Z';

function Accessory({ variant }: { variant: MascotVariant }) {
  const cx = 152;
  const cy = 148;
  return (
    <g>
      <circle cx={cx} cy={cy} r={20} fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth={1.5} />
      {variant === 'noData' && (
        <path d={`M${cx - 7},${cy} h14 M${cx},${cy - 7} v14`} stroke="var(--text-faint)" strokeWidth={3} strokeLinecap="round" />
      )}
      {variant === 'low' && (
        <g>
          <circle cx={cx} cy={cy + 3} r={7} fill="var(--tag-breakfast-text)" opacity={0.85} />
          <path d={`M${cx},${cy - 4} q4,-6 8,-4`} stroke="var(--tag-breakfast-text)" strokeWidth={2} fill="none" strokeLinecap="round" />
        </g>
      )}
      {variant === 'normal' && (
        <path
          d={`M${cx},${cy - 9} L${cx + 3},${cy - 3} L${cx + 9},${cy} L${cx + 3},${cy + 3} L${cx},${cy + 9} L${cx - 3},${cy + 3} L${cx - 9},${cy} L${cx - 3},${cy - 3} Z`}
          fill="var(--viz-good)"
        />
      )}
      {variant === 'obese1' && (
        <g stroke="var(--tag-lunch-text)" strokeWidth={2.5} strokeLinecap="round" fill="none">
          <path d={`M${cx},${cy + 8} V${cy - 2}`} />
          <path d={`M${cx},${cy - 2} q-8,-2 -8,-9`} />
          <path d={`M${cx},${cy - 2} q8,-2 8,-9`} />
        </g>
      )}
      {variant === 'obese2' && (
        <path
          d={`M${cx},${cy + 8} C${cx - 14},${cy - 2} ${cx - 8},${cy - 14} ${cx},${cy - 6} C${cx + 8},${cy - 14} ${cx + 14},${cy - 2} ${cx},${cy + 8} Z`}
          fill="var(--tag-dinner-text)"
          opacity={0.85}
        />
      )}
    </g>
  );
}

export default function Mascot({ variant, size = 96 }: { variant: MascotVariant; size?: number }) {
  const color = MASCOT_META[variant].color;
  const sleepy = variant === 'noData';

  return (
    <svg width={size} height={size} viewBox="0 0 200 200" role="img" aria-label={MASCOT_META[variant].title}>
      <path d={BLOB_PATH} fill={color} />
      {/* cheeks */}
      <ellipse cx={64} cy={110} rx={10} ry={7} fill="#ffffff" opacity={0.25} />
      <ellipse cx={136} cy={110} rx={10} ry={7} fill="#ffffff" opacity={0.25} />
      {/* eyes */}
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
      {/* mouth */}
      <path d="M80,122 Q100,140 120,122" stroke="var(--bg)" strokeWidth={5.5} strokeLinecap="round" fill="none" />
      <Accessory variant={variant} />
    </svg>
  );
}
