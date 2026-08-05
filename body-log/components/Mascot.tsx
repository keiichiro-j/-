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
    return <path d="M78,120 Q100,142 122,120 Q100,132 78,120 Z" fill="var(--bg)" />;
  }
  if (style === 'soft') {
    return <path d="M84,123 Q100,133 116,123" stroke="var(--bg)" strokeWidth={5} strokeLinecap="round" fill="none" />;
  }
  return <path d="M80,122 Q100,140 120,122" stroke="var(--bg)" strokeWidth={5.5} strokeLinecap="round" fill="none" />;
}

/** Costume pieces worn on the head — the primary silhouette read for each persona. */
function Headwear({ variant }: { variant: MascotVariant }) {
  if (variant === 'normal') {
    return (
      <g>
        <rect x={68} y={18} width={64} height={12} rx={6} fill="var(--brand)" />
        <path d="M76,20 L88,-6 L94,10 L100,-16 L106,10 L112,-6 L124,20 Z" fill="var(--brand)" />
        <circle cx={100} cy={-12} r={5} fill="#ffd94a" />
        <circle cx={84} cy={24} r={2.8} fill="#ffffff" opacity={0.85} />
        <circle cx={100} cy={24} r={2.8} fill="#ffffff" opacity={0.85} />
        <circle cx={116} cy={24} r={2.8} fill="#ffffff" opacity={0.85} />
      </g>
    );
  }
  if (variant === 'low') {
    return (
      <g fill="#5fae5f">
        <path d="M100,22 C88,10 86,-6 100,4 C102,-8 116,-4 108,10 C118,8 112,22 100,22 Z" />
        <path d="M100,22 V8" stroke="#3f7d3f" strokeWidth={2} strokeLinecap="round" fill="none" />
      </g>
    );
  }
  if (variant === 'obese1') {
    return (
      <g>
        <rect x={54} y={52} width={92} height={13} rx={6.5} fill="var(--brand)" transform="rotate(-2 100 58)" />
        <circle cx={146} cy={57} r={7.5} fill="var(--brand-strong)" />
        <path d="M92,18 L100,-6 L108,18 Z" fill="color-mix(in srgb, var(--tag-lunch-bg), white 25%)" />
      </g>
    );
  }
  if (variant === 'obese2') {
    const beanie = 'var(--card-strong)';
    return (
      <g>
        <path d="M48,52 A52,48 0 0 1 152,52 Z" fill={beanie} />
        <rect x={46} y={44} width={108} height={13} rx={6.5} fill={beanie} />
        <circle cx={100} cy={4} r={9} fill={beanie} />
        <rect x={62} y={166} width={76} height={16} rx={8} fill={beanie} transform="rotate(4 100 174)" />
        <path d="M126,172 L146,198 L116,182 Z" fill={beanie} />
      </g>
    );
  }
  // noData: soft drooping sleep cap
  return (
    <g fill="color-mix(in srgb, #9a9284, white 15%)">
      <path d="M65,26 C65,-6 128,-10 118,22 C112,10 78,8 65,26 Z" />
      <circle cx={116} cy={20} r={6} fill="color-mix(in srgb, #9a9284, white 35%)" />
    </g>
  );
}

/** Held prop / chest emblem — the secondary read, distinct per persona. */
function Emblem({ variant }: { variant: MascotVariant }) {
  if (variant === 'normal') {
    const cx = 100;
    const cy = 168;
    return (
      <path
        d={`M${cx},${cy - 15} L${cx + 4.6},${cy - 4.6} L${cx + 15},${cy} L${cx + 4.6},${cy + 4.6} L${cx},${cy + 15} L${cx - 4.6},${cy + 4.6} L${cx - 15},${cy} L${cx - 4.6},${cy - 4.6} Z`}
        fill="#ffffff"
        opacity={0.9}
      />
    );
  }
  if (variant === 'low') {
    return (
      <g transform="translate(100,170)">
        <circle r={11} fill="#c0392b" opacity={0.85} />
        <path d="M0,-11 q6,-8 12,-5" stroke="#3f7d3f" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      </g>
    );
  }
  if (variant === 'obese1') {
    return (
      <g>
        <path
          d="M104,150 L86,172 H98 L92,192 L114,166 H102 Z"
          fill="#ffffff"
          opacity={0.92}
        />
        <g stroke="#ffffff" strokeWidth={3} strokeLinecap="round" opacity={0.55}>
          <path d="M18,145 h14" />
          <path d="M14,155 h16" />
          <path d="M20,165 h12" />
        </g>
      </g>
    );
  }
  if (variant === 'obese2') {
    return (
      <path
        d="M100,178 C82,164 90,146 100,156 C110,146 118,164 100,178 Z"
        fill="#ffffff"
        opacity={0.92}
      />
    );
  }
  return null;
}

export default function Mascot({ variant, size = 100 }: { variant: MascotVariant; size?: number }) {
  const color = MASCOT_META[variant].color;
  const pose = POSES[variant];
  const gradId = `mascot-grad-${variant}`;
  const glossId = `mascot-gloss-${variant}`;
  const height = Math.round(size * 1.28);

  return (
    <svg width={size} height={height} viewBox="0 0 200 272" role="img" aria-label={MASCOT_META[variant].title}>
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

      <g transform="translate(0,12)">
        {/* ground shadow */}
        <ellipse cx={100} cy={250} rx={50} ry={9} fill="var(--text)" opacity={0.14} />

        {/* feet */}
        <ellipse cx={78} cy={236} rx={17} ry={11} fill={`url(#${gradId})`} />
        <ellipse cx={122} cy={236} rx={17} ry={11} fill={`url(#${gradId})`} />

        {/* legs */}
        <rect x={67} y={202} width={19} height={32} rx={9.5} fill={`url(#${gradId})`} />
        <rect x={114} y={202} width={19} height={32} rx={9.5} fill={`url(#${gradId})`} />
        {/* ambient occlusion where legs meet torso */}
        <ellipse cx={100} cy={207} rx={34} ry={7} fill="var(--text)" opacity={0.08} />

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
        <Emblem variant={variant} />

        {/* head + face (shares the original 0-200 face coordinate space) */}
        <g transform="translate(26,-1) scale(0.76)">
          <ellipse cx={100} cy={118} rx={30} ry={8} fill="var(--text)" opacity={0.06} />
          <path d={HEAD_BLOB_PATH} fill={`url(#${gradId})`} />
          <ellipse cx={64} cy={110} rx={10} ry={7} fill="#ffffff" opacity={0.22} />
          <ellipse cx={136} cy={110} rx={10} ry={7} fill="#ffffff" opacity={0.22} />
          <Eyes style={pose.eyes} />
          <Mouth style={pose.mouth} />
          <Headwear variant={variant} />
        </g>

        {/* glossy 3D highlight across head + torso */}
        <ellipse cx={78} cy={70} rx={40} ry={34} fill={`url(#${glossId})`} />
        <ellipse cx={80} cy={150} rx={26} ry={30} fill={`url(#${glossId})`} opacity={0.7} />

        {variant === 'noData' && (
          <g>
            <circle cx={150} cy={22} r={17} fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth={1.5} />
            <path d="M144,22 h12 M150,16 v12" stroke="var(--text-faint)" strokeWidth={3} strokeLinecap="round" />
          </g>
        )}
      </g>
    </svg>
  );
}
