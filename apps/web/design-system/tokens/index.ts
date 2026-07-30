/* ============================================================================
   Vertex Connect Enterprise Design System — TypeScript Token Mappings
   Centralized export of token variable keys for inline CSS styling.
   ============================================================================ */

export const tokens = {
  colors: {
    bg: 'var(--ds-bg)',
    surface: 'var(--ds-surface)',
    elevated: 'var(--ds-elevated)',
    fg: 'var(--ds-fg)',
    fgMuted: 'var(--ds-fg-muted)',
    fgFaint: 'var(--ds-fg-faint)',
    border: 'var(--ds-border)',
    borderStrong: 'var(--ds-border-strong)',
    accent: 'var(--ds-accent)',
    accentSoft: 'var(--ds-accent-soft)',
    accentContrast: 'var(--ds-accent-contrast)',
    success: 'var(--ds-success-accent)',
    warning: 'var(--ds-warning-accent)',
    error: 'var(--ds-error-accent)',
    info: 'var(--ds-info-accent)',
  },
  spacing: {
    1: 'var(--ds-space-1)', // 4px
    2: 'var(--ds-space-2)', // 8px
    3: 'var(--ds-space-3)', // 12px
    4: 'var(--ds-space-4)', // 16px
    5: 'var(--ds-space-5)', // 20px
    6: 'var(--ds-space-6)', // 24px
    8: 'var(--ds-space-8)', // 32px
    10: 'var(--ds-space-10)', // 40px
    12: 'var(--ds-space-12)', // 48px
    16: 'var(--ds-space-16)', // 64px
  },
  radii: {
    xs: 'var(--ds-radius-xs)',
    sm: 'var(--ds-radius-sm)',
    md: 'var(--ds-radius-md)',
    lg: 'var(--ds-radius-lg)',
    xl: 'var(--ds-radius-xl)',
    xxl: 'var(--ds-radius-2xl)',
    pill: 'var(--ds-radius-pill)',
  },
  shadows: {
    xs: 'var(--ds-shadow-xs)',
    sm: 'var(--ds-shadow-sm)',
    md: 'var(--ds-shadow-md)',
    lg: 'var(--ds-shadow-lg)',
    xl: 'var(--ds-shadow-xl)',
  },
  zindex: {
    negative: 'var(--ds-z-negative)',
    base: 'var(--ds-z-base)',
    dropdown: 'var(--ds-z-dropdown)',
    sticky: 'var(--ds-z-sticky)',
    fixed: 'var(--ds-z-fixed)',
    modal: 'var(--ds-z-modal)',
    popover: 'var(--ds-z-popover)',
    toast: 'var(--ds-z-toast)',
  },
  transitions: {
    fast: 'var(--ds-transition-duration-fast) var(--ds-transition-timing)',
    normal: 'var(--ds-transition-duration-normal) var(--ds-transition-timing)',
    slow: 'var(--ds-transition-duration-slow) var(--ds-transition-timing)',
  }
};
export default tokens;
