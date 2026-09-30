'use client';

import { forwardRef, useId, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { AuthError } from '@/lib/client';
import { formatTime } from '@/lib/format';
import type { Locale } from '@/lib/i18n/config';
import { Icon } from '@/components/Icon';
import { FieldError } from '@/components/ui/FieldError';

/** A labelled field; `aside` sits across from the label (the "forgot" link). */
/** A labelled field; `aside` sits across from the label (the "forgot" link), `error` under it in place of the hint. */
export function Field({
  label,
  aside,
  hint,
  error,
  children,
}: {
  label: React.ReactNode;
  aside?: React.ReactNode;
  hint?: string;
  error?: string | null;
  children: (props: { id: string; 'aria-describedby'?: string }) => React.ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = error ? errId : hint ? hintId : undefined;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {aside}
      </div>
      {children({ id, ...(describedBy ? { 'aria-describedby': describedBy } : {}) })}
      {error ? (
        <FieldError id={errId}>{error}</FieldError>
      ) : (
        hint && (
          <p id={hintId} className="mt-1.5 text-xs text-faint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export const PasswordInput = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (v: string) => void;
    autoComplete: 'current-password' | 'new-password';
    minLength?: number;
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
    onBlur?: () => void;
  }
>(function PasswordInput({ value, onChange, autoComplete, minLength, ...rest }, ref) {
  const { t } = useTranslation('auth');
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        {...rest}
        ref={ref}
        type={shown ? 'text' : 'password'}
        dir="ltr"
        className="v-field !pe-11 rtl:text-right"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        minLength={minLength}
        autoCapitalize="none"
        spellCheck={false}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? t('password.hide') : t('password.show')}
        aria-pressed={shown}
        className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-e-lg text-faint transition-colors hover:text-ink focus-visible:text-ink focus-visible:outline-none"
      >
        <Icon name={shown ? 'eye-off' : 'eye'} size={16} />
      </button>
    </div>
  );
});

/** Email as people type it on a phone: no capitals, no autocorrect. */
export function emailProps(autoComplete: 'username' | 'email') {
  return {
    type: 'email',
    dir: 'ltr',
    className: 'v-field rtl:text-right',
    autoComplete,
    inputMode: 'email',
    autoCapitalize: 'none',
    autoCorrect: 'off',
    spellCheck: false,
  } as const;
}

export function FormMessage({ tone, children }: { tone: 'danger' | 'info'; children: React.ReactNode }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm leading-snug ring-1 ring-inset ${
        tone === 'danger'
          ? 'bg-red-500/[0.07] text-red-700 ring-red-500/20 dark:text-red-300'
          : 'bg-accent/[0.06] text-ink ring-accent/20'
      }`}
    >
      <Icon name={tone === 'danger' ? 'alert' : 'info'} size={15} className={`mt-px shrink-0 ${tone === 'danger' ? '' : 'text-accent'}`} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function SubmitButton({ busy, label, busyLabel }: { busy: boolean; label: string; busyLabel: string }) {
  return (
    <button type="submit" disabled={busy} className="v-btn w-full !h-11 text-base sm:!h-10">
      {busy && <Icon name="loader" size={15} className="animate-spin" />}
      {busy ? busyLabel : label}
    </button>
  );
}

/**
 * A refused call, in words the person can act on and in their language. The
 * API speaks English; the status says what happened.
 */
export function authErrorText(err: unknown, t: TFunction, context: 'login' | 'register' | 'link' | 'google', locale: Locale): string {
  if (!(err instanceof AuthError)) return t('auth:errors.generic');
  switch (err.status) {
    case 0:
      return t('auth:errors.offline');
    case 429:
      // A lockout says when it ends; the per-minute limit does not, and is short.
      return err.retryAfter
        ? t('auth:errors.tooManyUntil', { time: formatTime(Date.now() + err.retryAfter * 1000, locale) })
        : t('auth:errors.tooMany');
    case 401:
      if (context === 'google') return /different Google/i.test(err.message) ? t('auth:google.otherAccount') : t('auth:google.failed');
      return context === 'login' ? t('auth:errors.invalidCredentials') : t('auth:errors.linkInvalid');
    case 503:
      return context === 'google' ? t('auth:google.unavailable') : t('auth:errors.generic');
    case 403:
      return t('auth:errors.suspended');
    case 409:
      return t('auth:errors.emailTaken');
    case 400:
      if (/expired link/i.test(err.message)) return t('auth:errors.linkInvalid');
      if (/8 characters/i.test(err.message)) return t('auth:errors.passwordShort');
      if (/email/i.test(err.message)) return t('auth:errors.invalidEmail');
      return t('auth:errors.generic');
    default:
      return t('auth:errors.generic');
  }
}
