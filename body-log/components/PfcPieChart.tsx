const KCAL_PER_G = { protein: 4, fat: 9, carbs: 4 } as const;

export default function PfcPieChart({
  protein,
  fat,
  carbs,
}: {
  protein: number;
  fat: number;
  carbs: number;
}) {
  const kcal = {
    protein: protein * KCAL_PER_G.protein,
    fat: fat * KCAL_PER_G.fat,
    carbs: carbs * KCAL_PER_G.carbs,
  };
  const total = kcal.protein + kcal.fat + kcal.carbs;

  const segments = [
    { key: 'protein', label: 'タンパク質', grams: protein, kcal: kcal.protein, color: 'var(--viz-protein)' },
    { key: 'fat', label: '脂質', grams: fat, kcal: kcal.fat, color: 'var(--viz-fat)' },
    { key: 'carbs', label: '炭水化物', grams: carbs, kcal: kcal.carbs, color: 'var(--viz-carbs)' },
  ] as const;

  let cursor = 0;
  const stops = segments.map((s) => {
    const start = total > 0 ? (cursor / total) * 360 : 0;
    cursor += s.kcal;
    const end = total > 0 ? (cursor / total) * 360 : 0;
    return `${s.color} ${start}deg ${end}deg`;
  });

  const gradient = total > 0 ? `conic-gradient(${stops.join(', ')})` : 'var(--viz-grid)';

  return (
    <div className="flex items-center gap-5">
      <div
        className="relative h-28 w-28 shrink-0 rounded-full"
        style={{ background: gradient }}
        role="img"
        aria-label="PFCバランス円グラフ"
      >
        <div className="absolute inset-[14%] flex flex-col items-center justify-center rounded-full bg-card text-center">
          <span className="text-base font-bold text-text">{Math.round(total)}</span>
          <span className="text-[9px] text-text-faint">kcal</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-text-muted">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="font-semibold text-text">
              {Math.round(s.grams)}g
              <span className="ml-1 text-[10px] font-normal text-text-faint">
                {total > 0 ? Math.round((s.kcal / total) * 100) : 0}%
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
