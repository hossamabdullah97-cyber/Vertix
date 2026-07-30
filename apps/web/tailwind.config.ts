import type { Config } from 'tailwindcss';

// Design System v2 — every legacy color maps to the CSS tokens in globals.css,
// so all pages inherit the refined palette and full dark mode automatically.
// The font stack is platform-native: SF Pro on Apple, Segoe UI Variable on
// Windows, Roboto on Android — the exact typefaces of Apple/Microsoft/Google.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './design-system/**/*.{ts,tsx}'],
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
          DEFAULT: 'var(--v-accent)',
          fg: 'var(--v-accent-contrast)',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI Variable Text"',
          '"Segoe UI"',
          'Roboto',
          'Inter',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.5rem',
        'ds-xs': 'var(--ds-radius-xs)',
        'ds-sm': 'var(--ds-radius-sm)',
        'ds-md': 'var(--ds-radius-md)',
        'ds-lg': 'var(--ds-radius-lg)',
        'ds-xl': 'var(--ds-radius-xl)',
        'ds-2xl': 'var(--ds-radius-2xl)',
        'ds-pill': 'var(--ds-radius-pill)',
      },
      maxWidth: {
        card: '32rem',
      },
    },
  },
  plugins: [],
};

export default config;
