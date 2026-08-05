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

interface Pose {
  leftArm: { cx: number; cy: number; rotate: number };
  rightArm: { cx: number; cy: number; rotate: number };
  eyes: 'sleepy' | 'round' | 'sparkle' | 'sporty' | 'calm';
  mouth: 'soft' | 'smile' | 'big' | 'grin';
}

const POSES: Record<MascotVariant, Pose> = {
  noData: {
    leftArm: { cx: 39, cy: 160, rotate: -10 },
    rightArm: { cx: 161, cy: 160, rotate: 10 },
    eyes: 'sleepy',
    mouth: 'soft',
  },
  low: {
    leftArm: { cx: 42, cy: 163, rotate: -5 },
    rightArm: { cx: 158, cy: 163, rotate: 5 },
    eyes: 'round',
    mouth: 'soft',
  },
  normal: {
    leftArm: { cx: 27, cy: 128, rotate: -78 },
    rightArm: { cx: 173, cy: 128, rotate: 78 },
    eyes: 'sparkle',
    mouth: 'big',
  },
  obese1: {
    leftArm: { cx: 24, cy: 138, rotate: -58 },
    rightArm: { cx: 170, cy: 172, rotate: 32 },
    eyes: 'sporty',
    mouth: 'grin',
  },
  obese2: {
    leftArm: { cx: 68, cy: 168, rotate: 48 },
    rightArm: { cx: 132, cy: 168, rotate: -48 },
    eyes: 'calm',
    mouth: 'soft',
  },
};

function Eyes({ style }: { style: Pose['eyes'] }) {
  if (style === 'sleepy') {
    return (
      <g stroke="var(--bg)" strokeWidth={5} strokeLinecap="round" fill="none">
        <path d="M70,92 q8,8 16,0" />
        <path d="M114,92 q8,8 16,0" />
      </g>
    );
  }
  if (style === 'calm') {
    return (
      <g stroke="var(--bg)" strokeWidth={5} strokeLinecap="round" fill="none">
        <path d="M70,90 q8,4 16,0" />
        <path d="M114,90 q8,4 16,0" />
      </g>
    );
  }
  if (style === 'sparkle') {
    return (
      <g fill="var(--bg)">
        <circle cx={78} cy={92} r={8.5} />
        <circle cx={122} cy={92} r={8.5} />
        <circle cx={81} cy={88.5} r={2.2} fill="#ffffff" />
        <circle cx={125} cy={88.5} r={2.2} fill="#ffffff" />
      </g>
    );
  }
  if (style === 'sporty') {
    return (
      <g>
        <g fill="var(--bg)">
          <ellipse cx={78} cy={93} rx={6.5} ry={7.5} />
          <ellipse cx={122} cy={93} rx={6.5} ry={7.5} />
        </g>
        <g stroke="var(--bg)" strokeWidth={3.5} strokeLinecap="round">
          <path d="M69,80 q9,-5 17,-1" />
          <path d="M114,79 q9,-4 17,1" />
        </g>
      </g>
    );
  }
  return (
    <g fill="var(--bg)">
      <circle cx={78} cy={92} r={6.2} />
      <circle cx={122} cy={92} r={6.2} />
    </g>
  );
}

function Mouth({ style }: { style: Pose['mouth'] }) {
  if (style === 'big') {
    return <path d="M76,120 Q100,148 124,120" stroke="var(--bg)" strokeWidth={5.5} strokeLinecap="round" fill="none" />;
  }
  if (style === 'grin') {
    return (
      <path
        d="M78,120 Q100,142 122,120 Q100,132 78,120 Z"
        fill="var(--bg)"
      />
    );
  }
  if (style === 'soft') {
    return <path d="M84,123 Q100,133 116,123" stroke="var(--bg)" strokeWidth={5} strokeLinecap="round" fill="none" />;
  }
  return <path d="M80,122 Q100,140 120,122" stroke="var(--bg)" strokeWidth={5.5} strokeLinecap="round" fill="none" />;
}

function HeadAccessory({ variant }: { variant: MascotVariant }) {
  const cx = 150;
  const cy = 22;
  return (
    <g>
      <circle cx={cx} cy={cy} r={19} fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth={1.5} />
      {variant === 'noData' && (
        <path d={`M${cx - 6},${cy} h12 M${cx},${cy - 6} v12`} stroke="var(--text-faint)" strokeWidth={3} strokeLinecap="round" />
      )}
      {variant === 'low' && (
        <g>
          <circle cx={cx} cy={cy + 3} r={7} fill="var(--tag-breakfast-text)" opacity={0.85} />
          <path d={`M${cx},${cy - 5} q4,-5 8,-3`} stroke="var(--tag-breakfast-text)" strokeWidth={2} fill="none" strokeLinecap="round" />
        </g>
      )}
      {variant === 'normal' && (
        <path
          d={`M${cx},${cy - 9} L${cx + 2.8},${cy - 2.8} L${cx + 9},${cy} L${cx + 2.8},${cy + 2.8} L${cx},${cy + 9} L${cx - 2.8},${cy + 2.8} L${cx - 9},${cy} L${cx - 2.8},${cy - 2.8} Z`}
          fill="var(--viz-good)"
        />
      )}
      {variant === 'obese1' && (
        <path
          d={`M${cx + 3},${cy - 9} L${cx - 5},${cy + 1} h5 L${cx - 3},${cy + 9} L${cx + 6},${cy - 1} h-5 Z`}
          fill="var(--tag-lunch-text)"
        />
      )}
      {variant === 'obese2' && (
        <path
          d={`M${cx},${cy + 8} C${cx - 13},${cy - 2} ${cx - 7},${cy - 13} ${cx},${cy - 5} C${cx + 7},${cy - 13} ${cx + 13},${cy - 2} ${cx},${cy + 8} Z`}
          fill="var(--tag-dinner-text)"
          opacity={0.85}
        />
      )}
    </g>
  );
}

export default function Mascot({ variant, size = 100 }: { variant: MascotVariant; size?: number }) {
  const color = MASCOT_META[variant].color;
  const pose = POSES[variant];
  const gradId = `mascot-grad-${variant}`;
  const glossId = `mascot-gloss-${variant}`;
  const height = Math.round(size * 1.3);

  return (
    <svg width={size} height={height} viewBox="0 0 200 260" role="img" aria-label={MASCOT_META[variant].title}>
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

      {/* arms (pose varies per variant) */}
      <ellipse
        cx={pose.leftArm.cx}
        cy={pose.leftArm.cy}
        rx={16}
        ry={26}
        fill={`url(#${gradId})`}
        transform={`rotate(${pose.leftArm.rotate} ${pose.leftArm.cx} ${pose.leftArm.cy})`}
      />
      <ellipse
        cx={pose.rightArm.cx}
        cy={pose.rightArm.cy}
        rx={16}
        ry={26}
        fill={`url(#${gradId})`}
        transform={`rotate(${pose.rightArm.rotate} ${pose.rightArm.cx} ${pose.rightArm.cy})`}
      />

      {/* torso */}
      <rect x={50} y={116} width={100} height={102} rx={48} fill={`url(#${gradId})`} />

      {/* head + face (shares the original 0-200 face coordinate space) */}
      <g transform="translate(26,-1) scale(0.76)">
        <path d={HEAD_BLOB_PATH} fill={`url(#${gradId})`} />
        <ellipse cx={64} cy={110} rx={10} ry={7} fill="#ffffff" opacity={0.22} />
        <ellipse cx={136} cy={110} rx={10} ry={7} fill="#ffffff" opacity={0.22} />
        <Eyes style={pose.eyes} />
        <Mouth style={pose.mouth} />
      </g>

      {/* glossy 3D highlight across head + torso */}
      <ellipse cx={78} cy={70} rx={40} ry={34} fill={`url(#${glossId})`} />
      <ellipse cx={80} cy={150} rx={26} ry={30} fill={`url(#${glossId})`} opacity={0.7} />

      <HeadAccessory variant={variant} />
    </svg>
  );
}
