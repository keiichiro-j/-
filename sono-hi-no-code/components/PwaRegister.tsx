'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PwaRegister() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }

    setIsStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
    setDismissed(sessionStorage.getItem('pwa-install-dismissed') === '1');

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (isStandalone || dismissed) return null;
  if (!deferredPrompt && !isIOS) return null;

  const dismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('pwa-install-dismissed', '1');
  };

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="glass-card animate-fade-up flex w-full max-w-md items-center gap-3 rounded-2xl border-white/10 px-3.5 py-2.5 shadow-lg">
        <div className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base">
          ✨
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-text">ホーム画面に追加</p>
          <p className="truncate text-[11px] text-text-muted">
            {isIOS && !deferredPrompt
              ? '共有ボタン→「ホーム画面に追加」でアプリ化'
              : 'タップ一つで毎朝アクセスできます'}
          </p>
        </div>
        {deferredPrompt ? (
          <button
            onClick={async () => {
              await deferredPrompt.prompt();
              setDeferredPrompt(null);
              dismiss();
            }}
            className="brand-gradient shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
          >
            追加
          </button>
        ) : null}
        <button
          onClick={dismiss}
          aria-label="閉じる"
          className="shrink-0 text-text-faint"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
