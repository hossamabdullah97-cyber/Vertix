'use client';

import { useCallback, useEffect, useState } from 'react';
import { THEME_KEY as KEY } from './themeScript';

/**
 * The app's light/dark theme. The choice is kept in localStorage and applied
 * to <html data-theme> — before the first paint by THEME_SCRIPT (./themeScript)
 * in the root layout, so a dark page never flashes white — and so the page
 * background, overscroll and native controls follow it too.
 *
 * "system" follows the device and changes with it.
 */
export type ThemePref = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

const CHANGED = 'vertex-theme-change';

function readPref(): ThemePref {
  try {
    const p = localStorage.getItem(KEY);
    return p === 'dark' || p === 'system' ? p : 'light';
  } catch {
    return 'light';
  }
}

function resolve(pref: ThemePref): Theme {
  if (pref !== 'system') return pref;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The theme as shown now, and the choice behind it; every user of the hook stays in step. */
export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>('light');
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    const sync = () => {
      const p = readPref();
      const t = resolve(p);
      setPrefState(p);
      setThemeState(t);
      document.documentElement.dataset.theme = t;
    };
    sync();
    const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    media?.addEventListener('change', sync);
    window.addEventListener(CHANGED, sync);
    window.addEventListener('storage', sync);
    return () => {
      media?.removeEventListener('change', sync);
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setPref = useCallback((next: ThemePref) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // storage unavailable: the choice lasts for this page only
    }
    document.documentElement.dataset.theme = resolve(next);
    setPrefState(next);
    setThemeState(resolve(next));
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  return { theme, pref, setPref };
}

/**
 * The theme chosen inside the app, for the pages outside it (the landing page,
 * sign-in), so a returning visitor is not switched from dark to light on the
 * way in.
 */
export function useStoredTheme(): Theme {
  return useTheme().theme;
}
