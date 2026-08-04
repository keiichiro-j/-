import type { ReactNode } from 'react';
import clsx from 'clsx';

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
  mark,
  emphasize,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  mark?: ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            {eyebrow}
          </p>
        )}
        <div className="flex items-center gap-2">
          {mark}
          <h1
            className={clsx(
              'font-display truncate text-text',
              emphasize ? 'text-[2rem] font-medium leading-[1.1] tracking-tight' : 'text-2xl font-medium'
            )}
          >
            {title}
          </h1>
        </div>
        {emphasize && <div className="mt-2 h-px w-10 bg-text/25" />}
        {subtitle && <p className="mt-2 text-sm text-text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
