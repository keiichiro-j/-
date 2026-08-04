import type { ReactNode } from 'react';

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">{eyebrow}</p>
        )}
        <h1 className="truncate text-2xl font-bold text-text">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
