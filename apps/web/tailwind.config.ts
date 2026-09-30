import type { Config } from 'tailwindcss';

// Every color maps to the CSS tokens in globals.css, so pages pick up the
// palette and dark mode from one place. The accent is declared as an RGB
// channel list so opacity modifiers (bg-accent/10, ring-accent/20) compile —
// a bare var() color makes Tailwind drop those classes silently.
// Radii and shadows are tightened here on purpose: pages written against the
// Tailwind defaults (rounded-2xl, shadow-lg) render in the house shape
// without each one being rewritten.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './design-system/**/*.{ts,tsx}'],
  // `dark:` follows the app's own theme switch (data-theme on the shell and
  // on public cards), not the operating system's preference.
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        ink: 'hsl(var(--v-fg) / <alpha-value>)',
        muted: 'hsl(var(--v-muted) / <alpha-value>)',
        faint: 'hsl(var(--v-faint) / <alpha-value>)',
        line: 'hsl(var(--v-border) / <alpha-value>)',
        surface: 'hsl(var(--v-surface) / <alpha-value>)',
        elevated: 'hsl(var(--v-elevated) / <alpha-value>)',
        canvas: 'hsl(var(--v-bg) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--v-accent-ch) / <alpha-value>)',
          fg: 'var(--v-accent-contrast)',
        },
      },
      // Text in the accent reads from its own token, lifted in dark mode.
      textColor: {
        accent: {
          DEFAULT: 'rgb(var(--v-accent-text-ch) / <alpha-value>)',
          fg: 'var(--v-accent-contrast)',
        },
      },
      // One type scale for the whole app, in whole pixels. Each is a font size
      // only (no line height), so a size never moves the lines around it.
      // Smaller sizes (badges inside fixed circles) and display headings above
      // 32px stay as literal values where they are used.
      fontSize: {
        '3xs': '10px',
        '2xs': '11px',
        xs: '12px',
        sm: '13px',
        base: '14px',
        md: '15px',
        lg: '16px',
        xl: '18px',
        '2xl': '20px',
        '3xl': '24px',
        '4xl': '28px',
        '5xl': '32px',
      },
      fontFamily: {
        sans: ['Geist', '"IBM Plex Sans Arabic"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xl: '0.625rem',
        '2xl': '0.75rem',
        '3xl': '0.875rem',
        'ds-xs': 'var(--ds-radius-xs)',
        'ds-sm': 'var(--ds-radius-sm)',
        'ds-md': 'var(--ds-radius-md)',
        'ds-lg': 'var(--ds-radius-lg)',
        'ds-xl': 'var(--ds-radius-xl)',
        'ds-2xl': 'var(--ds-radius-2xl)',
        'ds-pill': 'var(--ds-radius-pill)',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgb(23 23 26 / 0.05)',
        DEFAULT: '0 1px 2px 0 rgb(23 23 26 / 0.06), 0 1px 3px 0 rgb(23 23 26 / 0.04)',
        md: '0 4px 12px -4px rgb(23 23 26 / 0.1), 0 1px 2px 0 rgb(23 23 26 / 0.04)',
        lg: '0 12px 28px -10px rgb(23 23 26 / 0.16), 0 2px 6px -2px rgb(23 23 26 / 0.06)',
        xl: '0 20px 40px -12px rgb(23 23 26 / 0.2), 0 4px 10px -4px rgb(23 23 26 / 0.06)',
        '2xl': '0 28px 56px -16px rgb(23 23 26 / 0.26)',
      },
      maxWidth: {
        card: '32rem',
      },
    },
  },
  plugins: [],
};

export default config;
