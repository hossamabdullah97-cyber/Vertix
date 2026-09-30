'use client';

import { useEffect } from 'react';

/**
 * A public card wears its owner's colours, never the visitor's app theme. The
 * app sets <html data-theme>; arriving here from inside the app in the same
 * tab would carry it over, so it is taken off (and put back on the way out).
 */
export function ClearAppTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const theme = root.dataset.theme;
    delete root.dataset.theme;
    return () => {
      if (theme) root.dataset.theme = theme;
    };
  }, []);
  return null;
}
