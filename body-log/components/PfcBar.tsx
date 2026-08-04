export default function PfcBar({
  protein,
  fat,
  carbs,
  compact,
}: {
  protein: number;
  fat: number;
  carbs: number;
  compact?: boolean;
}) {
  const total = protein + fat + carbs;
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-text/5">
        {total > 0 ? (
          <>
            <div style={{ width: `${pct(protein)}%`, background: 'var(--viz-protein)' }} />
            <div style={{ width: `${pct(fat)}%`, background: 'var(--viz-fat)' }} />
            <div style={{ width: `${pct(carbs)}%`, background: 'var(--viz-carbs)' }} />
          </>
        ) : null}
      </div>
      {!compact && (
        <div className="mt-2 flex items-center gap-4 text-[11px] text-text-muted">
          <LegendItem color="var(--viz-protein)" label="P" value={protein} />
          <LegendItem color="var(--viz-fat)" label="F" value={fat} />
          <LegendItem color="var(--viz-carbs)" label="C" value={carbs} />
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      {label} {Math.round(value)}g
    </span>
  );
}
