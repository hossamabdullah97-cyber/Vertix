'use client';

import * as React from 'react';

/* ============================================================================
   Badge Component
   ============================================================================ */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'success' | 'warning' | 'error' | 'info';
}

export const Badge: React.FC<BadgeProps> = ({
  className = '',
  variant = 'neutral',
  children,
  ...props
}) => {
  const styles = {
    neutral: 'bg-[hsl(var(--ds-gray-200))] text-[hsl(var(--ds-fg-muted))] border border-[hsl(var(--ds-border-strong))]',
    success: 'bg-[hsl(var(--ds-success-bg))] text-[hsl(var(--ds-success-fg))] border border-[hsl(var(--ds-success-border))]',
    warning: 'bg-[hsl(var(--ds-warning-bg))] text-[hsl(var(--ds-warning-fg))] border border-[hsl(var(--ds-warning-border))]',
    error: 'bg-[hsl(var(--ds-error-bg))] text-[hsl(var(--ds-error-fg))] border border-[hsl(var(--ds-error-border))]',
    info: 'bg-[hsl(var(--ds-info-bg))] text-[hsl(var(--ds-info-fg))] border border-[hsl(var(--ds-info-border))]',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider border select-none ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};

/* ============================================================================
   Alert Component
   ============================================================================ */
export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'success' | 'warning' | 'error' | 'info';
  title?: string;
  onClose?: () => void;
}

export const Alert: React.FC<AlertProps> = ({
  className = '',
  variant = 'info',
  title,
  onClose,
  children,
  ...props
}) => {
  const styles = {
    success: {
      bg: 'bg-[hsl(var(--ds-success-bg))] border-[hsl(var(--ds-success-border))] text-[hsl(var(--ds-success-fg))]',
      icon: '✓',
    },
    warning: {
      bg: 'bg-[hsl(var(--ds-warning-bg))] border-[hsl(var(--ds-warning-border))] text-[hsl(var(--ds-warning-fg))]',
      icon: '⚠️',
    },
    error: {
      bg: 'bg-[hsl(var(--ds-error-bg))] border-[hsl(var(--ds-error-border))] text-[hsl(var(--ds-error-fg))]',
      icon: '❌',
    },
    info: {
      bg: 'bg-[hsl(var(--ds-info-bg))] border-[hsl(var(--ds-info-border))] text-[hsl(var(--ds-info-fg))]',
      icon: 'ℹ️',
    },
  };

  const current = styles[variant];

  return (
    <div
      className={`p-4 rounded-xl border flex items-start gap-3 shadow-sm ${current.bg} ${className}`}
      role="alert"
      {...props}
    >
      <span className="text-[16px] leading-none shrink-0">{current.icon}</span>
      <div className="flex-1 space-y-0.5 text-[13px] leading-relaxed">
        {title && <p className="font-bold tracking-tight">{title}</p>}
        {children && <div className="font-medium text-current/90">{children}</div>}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="shrink-0 p-0.5 rounded-lg hover:bg-current/10 text-current transition-colors"
          aria-label="Close alert"
        >
          ✕
        </button>
      )}
    </div>
  );
};

/* ============================================================================
   Progress Bar Component
   ============================================================================ */
export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number; // 0 to 100
  max?: number;
  showValueLabel?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  className = '',
  value,
  max = 100,
  showValueLabel = false,
  ...props
}) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={`w-full space-y-1.5 ${className}`} {...props}>
      {showValueLabel && (
        <div className="flex justify-between text-xs font-bold text-[hsl(var(--ds-fg-muted))] uppercase">
          <span>Usage</span>
          <span>{value} / {max} ({Math.round(percentage)}%)</span>
        </div>
      )}
      <div className="h-2 w-full bg-[hsl(var(--ds-border))] border border-[hsl(var(--ds-border))] rounded-full overflow-hidden">
        <div
          className="h-full bg-[var(--ds-accent)] rounded-full transition-all duration-300 ease-in-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

/* ============================================================================
   Skeleton Loader Component
   ============================================================================ */
export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'rect' | 'circle';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rect',
  ...props
}) => {
  const styles = {
    text: 'h-3.5 w-full rounded-ds-xs',
    rect: 'h-24 w-full rounded-ds-lg',
    circle: 'h-12 w-12 rounded-full shrink-0',
  };

  return (
    <div
      className={`v-skeleton ${styles[variant]} ${className}`}
      {...props}
    />
  );
};

/* ============================================================================
   Toast Component
   ============================================================================ */
export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'success' | 'warning' | 'error' | 'info';
  message: string;
  onClose?: () => void;
}

export const Toast: React.FC<ToastProps> = ({
  className = '',
  variant = 'info',
  message,
  onClose,
  ...props
}) => {
  const icons = {
    success: '✓',
    warning: '⚠️',
    error: '✕',
    info: 'ℹ️',
  };

  return (
    <div
      className={`fixed bottom-5 right-5 z-[var(--ds-z-toast)] max-w-sm p-4 rounded-xl border bg-[hsl(var(--ds-surface))] border-[hsl(var(--ds-border-strong))] shadow-[var(--ds-shadow-lg)] flex items-center justify-between gap-3 animate-fadeIn ${className}`}
      {...props}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white`}
          style={{
            background:
              variant === 'success'
                ? 'hsl(var(--ds-success-accent))'
                : variant === 'warning'
                ? 'hsl(var(--ds-warning-accent))'
                : variant === 'error'
                ? 'hsl(var(--ds-error-accent))'
                : 'var(--ds-accent)',
          }}
        >
          {icons[variant]}
        </span>
        <p className="text-[13px] font-bold text-ink truncate">{message}</p>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-muted hover:text-ink text-[11px] font-bold p-0.5 rounded"
          aria-label="Close notification"
        >
          ✕
        </button>
      )}
    </div>
  );
};

/* ============================================================================
   Tooltip Component
   ============================================================================ */
export interface TooltipProps extends React.HTMLAttributes<HTMLDivElement> {
  content: string;
  children: React.ReactElement;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  className = '',
  ...props
}) => {
  return (
    <div className="relative group inline-block" {...props}>
      {children}
      <div
        className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg bg-[hsl(var(--ds-gray-900))] text-[var(--ds-accent-contrast)] text-[11px] font-semibold whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-[var(--ds-z-popover)] shadow-[var(--ds-shadow-sm)] ${className}`}
      >
        {content}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-width-[5px] border-solid border-transparent border-t-[hsl(var(--ds-gray-900))] content-['']" />
      </div>
    </div>
  );
};
