/** Where the light/dark choice is kept (see useTheme in ./useStoredTheme). */
export const THEME_KEY = 'vertex_theme';

/**
 * Runs in <head> before the page paints. Kept tiny and self-contained: it
 * cannot import anything, and a storage error must leave the page light. A
 * public card (/c/…) is left alone: it wears its owner's colours, not the
 * visitor's app theme.
 */
export const THEME_SCRIPT = `(function(){try{if(location.pathname.indexOf('/c/')===0)return;var p=localStorage.getItem('${THEME_KEY}');var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){}})()`;
