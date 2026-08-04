'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const NAV_ITEMS = [
  { href: '/', label: 'ホーム', icon: HomeIcon },
  { href: '/stats', label: 'グラフ', icon: StatsIcon },
  { href: '/history', label: '履歴', icon: HistoryIcon },
  { href: '/settings', label: '設定', icon: SettingsIcon },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="nav-surface flex items-center justify-around rounded-lg px-1.5 py-2 backdrop-blur-md">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="relative flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 transition-colors"
            >
              <Icon
                className={clsx('h-5 w-5 transition-all', active ? 'scale-110 text-brand' : 'text-text-faint')}
              />
              <span
                className={clsx(
                  'text-[10px] tracking-tight transition-colors',
                  active ? 'font-semibold text-brand' : 'font-medium text-text-faint'
                )}
              >
                {label}
              </span>
              <span
                className={clsx(
                  'absolute -bottom-0.5 h-0.5 w-5 rounded-full bg-brand transition-opacity',
                  active ? 'opacity-100' : 'opacity-0'
                )}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M4 11.5 12 4l8 7.5M6 9.8V19a1 1 0 0 0 1 1h3.2v-4.6a1.8 1.8 0 0 1 1.8-1.8v0a1.8 1.8 0 0 1 1.8 1.8V20H17a1 1 0 0 0 1-1V9.8"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M5 19V10M12 19V5M19 19v-6"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4 19h16" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x={4} y={5} width={16} height={15} rx={2.2} stroke="currentColor" strokeWidth={1.8} />
      <path d="M4 9.5h16M8 3v3.2M16 3v3.2" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <path
        d="M8.5 13.2h1.6M8.5 16.4h1.6M11.6 13.2h1.6M11.6 16.4h1.6M14.7 13.2h1.6"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx={12} cy={12} r={2.8} stroke="currentColor" strokeWidth={1.8} />
      <path
        d="M12 4.2v1.6M12 18.2v1.6M19.8 12h-1.6M5.8 12H4.2M17.4 6.6l-1.1 1.1M7.7 16.3l-1.1 1.1M17.4 17.4l-1.1-1.1M7.7 7.7 6.6 6.6"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}
