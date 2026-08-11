import type { ButtonHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

export function Button({
  className,
  variant = 'default',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary'; size?: 'md' | 'sm' }) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-[9px] font-medium font-sans active:opacity-70 disabled:opacity-50',
        size === 'md' ? 'px-4 py-[11px] text-[15px]' : 'rounded-lg px-3 py-[7px] text-[13px]',
        variant === 'primary' ? 'bg-[var(--accent)] text-[var(--accent-text)]' : 'bg-[var(--fill)] text-[var(--text)]',
        className
      )}
      {...props}
    />
  );
}

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={clsx(
        'flex w-full items-center justify-between gap-2.5 rounded-[14px] bg-[var(--bg-elevated)] px-3.5 py-3 text-left shadow-[var(--shadow)]',
        onClick && 'active:opacity-75',
        className
      )}
    >
      {children}
    </Comp>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 mt-4 text-[12px] font-semibold uppercase tracking-wide text-[var(--text-secondary)] first:mt-0">
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3.5">
      <label className="mb-1 block text-[12.5px] font-medium text-[var(--text-secondary)]">{label}</label>
      {children}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        'w-full rounded-[9px] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-[11px] text-[15px] text-[var(--text)] outline-none focus:outline-2 focus:outline-[var(--accent)] focus:-outline-offset-1',
        props.className
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(
        'rounded-[8px] border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-2 text-[13px] text-[var(--text)] outline-none',
        props.className
      )}
    />
  );
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'success' | 'danger' }) {
  return (
    <span
      className={clsx(
        'inline-block whitespace-nowrap rounded-full px-[11px] py-1 text-[12px] font-semibold',
        tone === 'success' && 'bg-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)]',
        tone === 'danger' && 'bg-[color-mix(in_srgb,var(--danger)_18%,transparent)] text-[var(--danger)]',
        tone === 'default' && 'bg-[var(--fill)] text-[var(--text)]'
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-5 py-10 text-center text-[13.5px] leading-relaxed text-[var(--text-secondary)]">{children}</div>;
}

export function Note({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={clsx('text-[12px] text-[var(--text-secondary)]', className)}>{children}</p>;
}
