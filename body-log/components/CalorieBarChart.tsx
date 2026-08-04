'use client';

import { useState } from 'react';

export interface CalorieBarPoint {
  label: string;
  calories: number;
}

export default function CalorieBarChart({
  points,
  target,
}: {
  points: CalorieBarPoint[];
  target: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const width = 320;
  const height = 168;
  const padTop = 14;
  const padBottom = 24;
  const padLeft = 4;
  const padRight = 4;
  const plotH = height - padTop - padBottom;
  const plotW = width - padLeft - padRight;

  const maxVal = Math.max(target, ...points.map((p) => p.calories), 1);
  const niceMax = Math.ceil((maxVal * 1.15) / 500) * 500 || 500;
  const scaleY = (v: number) => padTop + plotH - (v / niceMax) * plotH;

  const n = Math.max(points.length, 1);
  const slot = plotW / n;
  const barWidth = Math.min(24, slot * 0.55);

  const gridSteps = [0, 0.25, 0.5, 0.75, 1];
  const activePoint = active !== null ? points[active] : null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-[11px] text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: 'var(--brand)' }} />
          摂取カロリー
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: 'var(--viz-critical)' }} />
          目標超過
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3" style={{ background: 'var(--viz-baseline)' }} />
          目標
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full touch-none select-none" role="img" aria-label="カロリー推移グラフ">
        {gridSteps.map((s) => {
          const y = padTop + plotH - s * plotH;
          return (
            <line key={s} x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="var(--viz-grid)" strokeWidth={1} />
          );
        })}
        <line
          x1={padLeft}
          x2={width - padRight}
          y1={scaleY(target)}
          y2={scaleY(target)}
          stroke="var(--viz-baseline)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        {points.map((p, i) => {
          const x = padLeft + slot * i + slot / 2 - barWidth / 2;
          const y = scaleY(p.calories);
          const h = Math.max(0, padTop + plotH - y);
          const over = p.calories > target;
          const isActive = active === i;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={h}
                rx={4}
                fill={over ? 'var(--viz-critical)' : 'var(--brand)'}
                opacity={active === null || isActive ? 1 : 0.45}
                onClick={() => setActive(isActive ? null : i)}
                style={{ cursor: 'pointer' }}
              />
              <rect
                x={padLeft + slot * i}
                y={padTop}
                width={slot}
                height={plotH}
                fill="transparent"
                onClick={() => setActive(isActive ? null : i)}
                style={{ cursor: 'pointer' }}
              />
              {(points.length <= 7 || i % Math.ceil(points.length / 7) === 0) && (
                <text
                  x={padLeft + slot * i + slot / 2}
                  y={height - 6}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--viz-ink-muted)"
                >
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {activePoint && (
        <div className="glass-card animate-fade-up mt-1 inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs">
          <span className="font-semibold text-text">{activePoint.label}</span>
          <span className="text-text-muted">{activePoint.calories} kcal</span>
        </div>
      )}
    </div>
  );
}
