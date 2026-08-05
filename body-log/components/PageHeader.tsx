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
    <div className="flex items-start justify-between gap-3 px-5 pb-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="min-w-0">
        {eyebrow && (
          <span className="brand-fill mb-2 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]">
            {eyebrow}
          </span>
        )}
        <h1 className="font-display truncate text-[1.75rem] font-bold leading-tight tracking-tight text-text">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 text-sm text-text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
