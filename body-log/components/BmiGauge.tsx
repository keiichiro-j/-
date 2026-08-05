import { bmiCategory } from '@/lib/health';

const DOMAIN_MIN = 15;
const DOMAIN_MAX = 35;

const ZONES = [
  { key: 'low', from: 15, to: 18.5, color: 'var(--tag-breakfast-bg)', label: '低体重' },
  { key: 'normal', from: 18.5, to: 25, color: 'var(--viz-good)', label: '標準' },
  { key: 'obese1', from: 25, to: 30, color: 'var(--tag-lunch-bg)', label: '肥満1度' },
  { key: 'obese2', from: 30, to: 35, color: 'var(--tag-dinner-bg)', label: '肥満2度+' },
] as const;

function pct(value: number): number {
  return ((Math.min(Math.max(value, DOMAIN_MIN), DOMAIN_MAX) - DOMAIN_MIN) / (DOMAIN_MAX - DOMAIN_MIN)) * 100;
}

export default function BmiGauge({ bmi }: { bmi: number }) {
  const category = bmiCategory(bmi);
  const markerLeft = pct(bmi);

  return (
    <div>
      <div className="relative mb-2 h-2.5 w-full overflow-hidden rounded-full">
        <div className="flex h-full w-full gap-[2px]">
          {ZONES.map((z) => (
            <div
              key={z.key}
              style={{ width: `${((z.to - z.from) / (DOMAIN_MAX - DOMAIN_MIN)) * 100}%`, background: z.color }}
            />
          ))}
        </div>
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card shadow"
          style={{ left: `${markerLeft}%`, background: category.colorVar }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-text-faint">
        <span>低体重</span>
        <span>標準</span>
        <span>肥満1度</span>
        <span>肥満2度+</span>
      </div>
    </div>
  );
}
