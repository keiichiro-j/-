'use client';

import { useEffect } from 'react';
import { applyTheme, readStoredTheme, STORAGE_KEY } from '@/lib/theme';
import type { ThemeValue } from '@/lib/types';

/**
 * サーバー（Google Sheets）に保存されたテーマ設定を取得し、
 * 別端末で選択したテーマをこの端末にも反映する（企画書 5.5: テーマ設定の同期）。
 * ローカルの localStorage を正としつつ、初回マウント時のみサーバー値で上書きを試みる。
 */
export default function ThemeSync() {
  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { theme?: ThemeValue } | null) => {
        if (cancelled || !data?.theme) return;
        const local = readStoredTheme();
        if (data.theme !== local) {
          applyTheme(data.theme);
          if (data.theme === 'system') {
            window.localStorage.removeItem(STORAGE_KEY);
          } else {
            window.localStorage.setItem(STORAGE_KEY, data.theme);
          }
        }
      })
      .catch(() => {
        // オフライン等で取得できない場合はローカルの設定をそのまま使う
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
