import Link from 'next/link';
import type { ReactNode } from 'react';

export function ScreenHeader({
  title,
  backHref,
  right,
}: {
  title: string;
  backHref?: string;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] px-3.5 pb-2.5 pt-[calc(10px+env(safe-area-inset-top))] backdrop-blur-lg">
      <div className="min-w-[44px]">
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex items-center rounded-lg px-2.5 py-1.5 text-[15px] font-medium text-[var(--accent)] active:opacity-70"
          >
            ← 戻る
          </Link>
        )}
      </div>
      <h1 className="flex-1 truncate text-center text-[17px] font-semibold">{title}</h1>
      <div className="flex min-w-[44px] justify-end">{right}</div>
    </header>
  );
}
