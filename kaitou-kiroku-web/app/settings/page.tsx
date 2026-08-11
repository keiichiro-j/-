'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { useTheme } from '@/lib/theme';
import type { ThemePreference } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Note, SectionLabel } from '@/components/ui';

const THEME_OPTIONS: { value: ThemePreference; title: string; desc: string }[] = [
  { value: 'light', title: 'ライトモード', desc: '明るい配色で表示します' },
  { value: 'dark', title: 'ダークモード', desc: '暗い配色で表示します（夜間の学習向け）' },
  { value: 'system', title: '端末の設定に合わせる', desc: 'iPhone/PCのシステム設定に自動追従します' },
];

// サーバーとの同期は layout.tsx にマウントされている ThemeSync（初回ロード時に一度だけ実行）が担う。
// この画面でも同様の再取得を行うと、ユーザーがここでテーマを選択した直後に古いサーバー値で
// 上書きしてしまう競合が起きるため、ここでは行わない。
export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [saving, setSaving] = useState(false);

  async function choose(value: ThemePreference) {
    setTheme(value);
    setSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: value }),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ScreenHeader title="アプリ設定" backHref="/" />
      <main className="px-3.5 pb-8 pt-3.5">
        <SectionLabel>テーマ</SectionLabel>
        <div className="flex flex-col gap-2">
          {THEME_OPTIONS.map((opt) => {
            const selected = theme === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => choose(opt.value)}
                disabled={saving}
                className="flex w-full items-center justify-between gap-2.5 rounded-[14px] bg-[var(--bg-elevated)] px-3.5 py-3 text-left shadow-[var(--shadow)] active:opacity-75 disabled:opacity-70"
              >
                <div>
                  <div className="text-[13px] font-semibold">{opt.title}</div>
                  <div className="mt-0.5 text-[12px] text-[var(--text-secondary)]">{opt.desc}</div>
                </div>
                <span
                  className={clsx(
                    'whitespace-nowrap rounded-full px-[11px] py-1 text-[12px] font-semibold',
                    selected
                      ? 'bg-[color-mix(in_srgb,var(--success)_20%,transparent)] text-[var(--success)]'
                      : 'bg-[var(--fill)] text-[var(--text)]'
                  )}
                >
                  {selected ? '選択中' : '選択'}
                </span>
              </button>
            );
          })}
        </div>
        <Note className="mt-[18px] text-center">今後、他のアプリ設定もこの画面に追加していきます</Note>
      </main>
    </>
  );
}
