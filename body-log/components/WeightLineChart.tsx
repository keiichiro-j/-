'use client';

import { useState } from 'react';

export interface WeightPoint {
  label: string;
  weightKg: number;
}

export default function WeightLineChart({ points }: { points: WeightPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const width = 320;
  const height = 140;
  const padTop = 16;
  const padBottom = 20;
  const padX = 8;
  const plotH = height - padTop - padBottom;
  const plotW = width - padX * 2;

  if (points.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-text-faint">
        体重記録がありません
      </p>
    );
  }

  const values = points.map((p) => p.weightKg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const yPad = range * 0.25 || 1;
  const scaleY = (v: number) => padTop + plotH - ((v - (min - yPad)) / (range + yPad * 2)) * plotH;
  const scaleX = (i: number) => (points.length === 1 ? width / 2 : padX + (plotW * i) / (points.length - 1));

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(p.weightKg)}`).join(' ');
  const areaPath = `${path} L ${scaleX(points.length - 1)} ${padTop + plotH} L ${scaleX(0)} ${padTop + plotH} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full touch-none select-none" role="img" aria-label="体重推移グラフ">
        <path d={areaPath} fill="var(--brand)" opacity={0.1} />
        <path d={path} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={scaleX(i)}
              cy={scaleY(p.weightKg)}
              r={active === i ? 5.5 : 4}
              fill="var(--brand)"
              stroke="var(--card)"
              strokeWidth={2}
            />
            <circle
              cx={scaleX(i)}
              cy={padTop}
              r={10}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={() => setActive(active === i ? null : i)}
            />
            <rect
              x={scaleX(i) - plotW / points.length / 2}
              y={0}
              width={plotW / points.length}
              height={height}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={() => setActive(active === i ? null : i)}
            />
          </g>
        ))}
        {(points.length <= 6 ? points : [points[0], points[points.length - 1]]).map((p) => {
          const i = points.indexOf(p);
          return (
            <text key={i} x={scaleX(i)} y={height - 4} textAnchor="middle" fontSize={9} fill="var(--viz-ink-muted)">
              {p.label}
            </text>
          );
        })}
      </svg>
      {active !== null && (
        <div className="glass-card animate-fade-up mt-1 inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs">
          <span className="font-semibold text-text">{points[active].label}</span>
          <span className="text-text-muted">{points[active].weightKg.toFixed(1)} kg</span>
        </div>
      )}
    </div>
  );
}
