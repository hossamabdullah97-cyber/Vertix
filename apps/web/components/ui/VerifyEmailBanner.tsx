'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { resendVerification, type Me } from '@/lib/client';

/**
 * A quiet line above the page while the account has not confirmed its email,
 * saying why it matters (inviting the team and paying wait on it) and
 * offering the link again. Gone as soon as the address is confirmed.
 */
export function VerifyEmailBanner({ me }: { me: Me | null }) {
  const { t } = useTranslation('common');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [message, setMessage] = useState('');

  if (!me || me.emailVerified !== false) return null;
  // Isolated, so an address inside an Arabic sentence keeps its own direction.
  const email = `\u2068${me.email}\u2069`;

  async function resend() {
    setState('sending');
    try {
      const r = await resendVerification();
      if (r.alreadyVerified) window.location.reload();
      else if (r.emailSent === false) {
        setMessage(t('verifyEmail.notSent'));
        setState('failed');
      } else setState('sent');
    } catch (e) {
      setMessage((e as Error).message);
      setState('failed');
    }
  }

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-950 md:px-8 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
      <Icon name="mail" size={15} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{t('verifyEmail.title')}</span>{' '}
        {state === 'sent' ? t('verifyEmail.sent', { email }) : state === 'failed' ? message : t('verifyEmail.body', { email })}
      </span>
      {state !== 'sent' && (
        <button
          type="button"
          onClick={resend}
          disabled={state === 'sending'}
          className="v-hit shrink-0 font-semibold underline underline-offset-2 disabled:opacity-60"
        >
          {state === 'sending' ? t('verifyEmail.sending') : t('verifyEmail.resend')}
        </button>
      )}
    </div>
  );
}
