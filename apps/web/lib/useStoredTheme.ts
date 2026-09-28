'use client';

import { useEffect, useState } from 'react';

/**
 * The theme chosen inside the app, for the pages outside it (the landing page,
 * sign-in), so a returning visitor is not switched from dark to light on the
 * way in. Light until it is known.
 */
export function useStoredTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    try {
      if (localStorage.getItem('vertex_theme') === 'dark') setTheme('dark');
    } catch {
      // storage unavailable: stay light
    }
  }, []);
  return theme;
}
