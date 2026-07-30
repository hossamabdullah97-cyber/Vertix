'use client';

import * as React from 'react';
import { Icon } from '@/components/Icon';

// Helpers for input wrapper layouts
interface FieldWrapperProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

const FieldWrapper: React.FC<FieldWrapperProps> = ({
  label,
  error,
  hint,
  required,
  children,
  className = '',
}) => {
  return (
    <div className={`space-y-1.5 w-full ${className}`}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-[12.5px] font-bold text-[hsl(var(--ds-fg-muted))] uppercase tracking-wider">
            {label}
            {required && <span className="text-[hsl(var(--ds-error-accent))] ml-0.5">*</span>}
          </label>
          {hint && <span className="text-[12px] text-[hsl(var(--ds-fg-faint))] font-semibold">{hint}</span>}
        </div>
      )}
      {children}
      {error && (
        <p className="text-[12px] font-semibold text-[hsl(var(--ds-error-accent))] flex items-center gap-1 animate-pulse">
          <span>⚠️</span> {error}
        </p>
      )}
    </div>
  );
};

/* --- Input Component --- */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  isSearch?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, isSearch, className = '', required, ...props }, ref) => {
    return (
      <FieldWrapper label={label} error={error} hint={hint} required={required}>
        <div className="relative flex items-center w-full">
          {isSearch && (
            <span className="absolute left-3 text-[hsl(var(--ds-fg-faint))] pointer-events-none">
              <Icon name="search" size={15} />
            </span>
          )}
          <input
            ref={ref}
            required={required}
            className={`v-field ${isSearch ? '!pl-9' : ''} ${
              error ? 'border-[hsl(var(--ds-error-accent))] focus:border-[hsl(var(--ds-error-accent))] focus:box-shadow-none' : ''
            } ${className}`}
            {...props}
          />
        </div>
      </FieldWrapper>
    );
  }
);
Input.displayName = 'Input';

/* --- Textarea Component --- */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className = '', required, ...props }, ref) => {
    return (
      <FieldWrapper label={label} error={error} hint={hint} required={required}>
        <textarea
          ref={ref}
          required={required}
          className={`v-field textarea.v-field h-auto py-2.5 ${
            error ? 'border-[hsl(var(--ds-error-accent))] focus:border-[hsl(var(--ds-error-accent))]' : ''
          } ${className}`}
          {...props}
        />
      </FieldWrapper>
    );
  }
);
Textarea.displayName = 'Textarea';

/* --- Select Component --- */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, className = '', required, children, ...props }, ref) => {
    return (
      <FieldWrapper label={label} error={error} hint={hint} required={required}>
        <select
          ref={ref}
          required={required}
          className={`v-field cursor-pointer bg-canvas ${
            error ? 'border-[hsl(var(--ds-error-accent))]' : ''
          } ${className}`}
          {...props}
        >
          {children}
        </select>
      </FieldWrapper>
    );
  }
);
Select.displayName = 'Select';

/* --- Checkbox Component --- */
export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="space-y-1">
        <label className="flex items-center gap-2.5 cursor-pointer text-[13.5px] font-semibold text-ink select-none">
          <input
            ref={ref}
            type="checkbox"
            className={`h-4.5 w-4.5 rounded-ds-xs border-[hsl(var(--ds-border))] text-[var(--ds-accent)] focus:ring-[var(--ds-accent-soft)] focus:ring-2 accent-[var(--ds-accent)] ${className}`}
            {...props}
          />
          <span>{label}</span>
        </label>
        {error && <p className="text-[12px] font-semibold text-[hsl(var(--ds-error-accent))]">{error}</p>}
      </div>
    );
  }
);
Checkbox.displayName = 'Checkbox';

/* --- Radio Component --- */
export interface RadioProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ label, className = '', ...props }, ref) => {
    return (
      <label className="flex items-center gap-2.5 cursor-pointer text-[13.5px] font-semibold text-ink select-none">
        <input
          ref={ref}
          type="radio"
          className={`h-4.5 w-4.5 rounded-full border-[hsl(var(--ds-border))] text-[var(--ds-accent)] focus:ring-[var(--ds-accent-soft)] focus:ring-2 accent-[var(--ds-accent)] ${className}`}
          {...props}
        />
        <span>{label}</span>
      </label>
    );
  }
);
Radio.displayName = 'Radio';

/* --- Switch (Custom Toggle slider) Component --- */
export interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  checked?: boolean;
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ label, checked, className = '', ...props }, ref) => {
    return (
      <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
        {label && <span className="text-[13.5px] font-bold text-ink">{label}</span>}
        <div className="relative inline-flex items-center">
          <input
            ref={ref}
            type="checkbox"
            checked={checked}
            className="sr-only peer"
            {...props}
          />
          <div className="w-10 h-5.5 bg-[hsl(var(--ds-border-strong))] rounded-full peer peer-focus:ring-2 peer-focus:ring-[var(--ds-accent-soft)] peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-[hsl(var(--ds-border))] after:border after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-[var(--ds-accent)] transition-colors duration-200" />
        </div>
      </label>
    );
  }
);
Switch.displayName = 'Switch';
