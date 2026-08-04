'use client';

import { useEffect, type ReactNode } from 'react';

export default function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm"
      />
      <div className="animate-fade-up relative z-10 max-h-[88vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-xl border border-text/10 bg-bg-elevated p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-xl [-webkit-overflow-scrolling:touch]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-medium text-text">{title}</h2>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-text/5 text-text-muted"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
