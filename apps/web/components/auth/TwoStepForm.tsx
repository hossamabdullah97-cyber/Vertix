'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { completeTwoStep } from '@/lib/client';
import { AuthShell } from './AuthShell';
import { Field, FormMessage, SubmitButton, authErrorText } from './fields';

/**
 * The second step of a sign-in on an account with two-step verification:
 * the 6-digit code the authenticator app shows, or one of the recovery codes
 * kept for a lost phone.
 */
export function TwoStepForm({ mfaToken, onDone, onCancel }: { mfaToken: string; onDone: () => void; onCancel: () => void }) {
  const { t } = useTranslation('auth');
  const { locale } = useLocale();
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(value: string) {
    setError(null);
    setBusy(true);
    try {
      await completeTwoStep(mfaToken, value);
      onDone();
    } catch (err) {
      setError(authErrorText(err, t, 'code', locale));
      setCode('');
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return setError(t('twoStep.enterCode'));
    void send(code);
  }

  return (
    <AuthShell title={t('twoStep.title')} subtitle={recovery ? t('twoStep.recoverySubtitle') : t('twoStep.subtitle')}>
      <form onSubmit={submit} noValidate className="space-y-5">
        {error && <FormMessage tone="danger">{error}</FormMessage>}
        <Field label={recovery ? t('twoStep.recoveryLabel') : t('twoStep.codeLabel')}>
          {(p) =>
            recovery ? (
              <input
                {...p}
                className="v-field font-mono tracking-wider"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="xxxx-xxxx"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                autoFocus
                dir="ltr"
              />
            ) : (
              <input
                {...p}
                className="v-field text-center font-mono text-2xl tracking-[0.5em]"
                value={code}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setCode(digits);
                  // Six digits are the whole code: no need to press the button.
                  if (digits.length === 6 && !busy) void send(digits);
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                autoFocus
                dir="ltr"
              />
            )
          }
        </Field>
        <SubmitButton busy={busy} label={t('twoStep.submit')} busyLabel={t('twoStep.checking')} />
      </form>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
        <button
          type="button"
          onClick={() => {
            setRecovery(!recovery);
            setCode('');
            setError(null);
          }}
          className="v-hit font-medium text-accent hover:underline"
        >
          {recovery ? t('twoStep.useApp') : t('twoStep.useRecovery')}
        </button>
        <button type="button" onClick={onCancel} className="v-hit text-muted hover:text-ink">
          {t('twoStep.back')}
        </button>
      </div>
    </AuthShell>
  );
}
