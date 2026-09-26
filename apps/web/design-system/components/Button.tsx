'use client';

import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = '',
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      type = 'button',
      ...props
    },
    ref
  ) => {
    // Styles mapping to central tokens
    const baseStyle =
      'inline-flex items-center justify-center font-semibold transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--ds-bg))] select-none disabled:pointer-events-none disabled:opacity-[var(--ds-state-disabled)] active:scale-[0.98]';

    const variants = {
      primary:
        'bg-[var(--ds-accent)] text-[var(--ds-accent-contrast)] border border-black/10 shadow-sm hover:brightness-[1.06] active:brightness-[0.96]',
      secondary:
        'bg-[hsl(var(--ds-elevated))] text-[hsl(var(--ds-fg))] border border-[hsl(var(--ds-border-strong))] shadow-sm hover:bg-[hsl(var(--ds-elevated))/0.8] active:bg-[hsl(var(--ds-border))]',
      outline:
        'bg-transparent text-[hsl(var(--ds-fg))] border border-[hsl(var(--ds-border))] shadow-sm hover:bg-[hsl(var(--ds-surface))] hover:border-[hsl(var(--ds-border-strong))]',
      ghost:
        'bg-transparent text-[hsl(var(--ds-fg))] hover:bg-[hsl(var(--ds-fg)/0.04)] hover:text-[hsl(var(--ds-fg))] active:bg-[hsl(var(--ds-fg)/0.08)]',
      danger:
        'bg-[hsl(var(--ds-error-accent))] text-[var(--ds-accent-contrast)] border border-black/10 shadow-sm hover:brightness-105 active:brightness-95',
      success:
        'bg-[hsl(var(--ds-success-accent))] text-[var(--ds-accent-contrast)] border border-black/10 shadow-sm hover:brightness-105 active:brightness-95',
    };

    // Phones get at least a 44px tap target; the tighter desktop scale is
    // restored from `sm` up so no existing layout shifts on a wide screen.
    const sizes = {
      sm: 'h-11 sm:h-8 px-3 text-[12.5px] rounded-ds-sm gap-1.5',
      md: 'h-11 sm:h-10 px-4 text-[13.5px] rounded-ds-md gap-2',
      lg: 'h-12 px-6 text-[15px] rounded-ds-lg gap-2.5',
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`}
        aria-busy={isLoading}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin h-4 w-4 shrink-0 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {!isLoading && leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>}
        <span className="truncate">{children}</span>
        {!isLoading && rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
