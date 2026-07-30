'use client';

import * as React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'standard' | 'elevated' | 'analytics' | 'feature' | 'glass';
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  className = '',
  variant = 'standard',
  hoverable = false,
  children,
  ...props
}) => {
  const baseStyle = 'border overflow-hidden rounded-ds-xl transition-all duration-200';

  const variants = {
    standard:
      'bg-[hsl(var(--ds-surface))] border-[hsl(var(--ds-border))] shadow-[var(--ds-shadow-sm)]',
    elevated:
      'bg-[hsl(var(--ds-surface))] border-[hsl(var(--ds-border-strong))] shadow-[var(--ds-shadow-md)]',
    analytics:
      'bg-[hsl(var(--ds-surface))] border-[hsl(var(--ds-border))] border-t-4 border-t-[var(--ds-accent)] shadow-[var(--ds-shadow-sm)]',
    feature:
      'bg-[hsl(var(--ds-surface))] border-[hsl(var(--ds-border))] shadow-[var(--ds-shadow-sm)] hover:border-[var(--ds-accent)]',
    glass:
      'bg-[hsl(var(--ds-surface)/0.72)] border-[hsl(var(--ds-border)/0.6)] backdrop-blur-[14px] saturate-[1.5] shadow-[var(--ds-shadow-md)]',
  };

  const hoverStyle = hoverable
    ? 'hover:shadow-[var(--ds-shadow-lg)] hover:border-[hsl(var(--ds-border-strong))] hover:-translate-y-0.5'
    : '';

  return (
    <div
      className={`${baseStyle} ${variants[variant]} ${hoverStyle} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

/* --- Card Header, Body, Footer subcomponents --- */
export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`border-b border-[hsl(var(--ds-border))] px-5 py-4 flex items-center justify-between ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardBody: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div className={`p-5 ${className}`} {...props}>
      {children}
    </div>
  );
};

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`border-t border-[hsl(var(--ds-border))] bg-[hsl(var(--ds-gray-50)/0.4)] px-5 py-3.5 flex items-center justify-between text-xs text-[hsl(var(--ds-fg-muted))] ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
