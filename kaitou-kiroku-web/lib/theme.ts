'use client';

import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

export const STORAGE_KEY = 'kaitou-kiroku-theme';

export function applyTheme(pref: ThemePreference) {
  const root = document.documentElement;
  if (pref === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', pref);
  }
}

export function readStoredTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

// layout.tsx にブロッキングスクリプトとしてインライン展開し、初回描画前にテーマを
// 適用することでライトモードのちらつきを防ぐ（sono-hi-no-code/lib/theme.ts と同じ手法）。
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem('${STORAGE_KEY}');
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
})();
`;

export function useTheme() {
  const [theme, setThemeState] = useState<ThemePreference>('system');

  useEffect(() => {
    setThemeState(readStoredTheme());
  }, []);

  const setTheme = useCallback((pref: ThemePreference) => {
    setThemeState(pref);
    applyTheme(pref);
    if (pref === 'system') {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, pref);
    }
  }, []);

  return { theme, setTheme };
}
