'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { resendVerification, type Me } from '@/lib/client';

const HIDDEN_KEY = 'vx:verify-email-hidden';
/** How long a closed reminder stays closed: long enough to stop nagging, short enough not to be forgotten. */
const HIDE_FOR_MS = 3 * 24 * 60 * 60 * 1000;

/** Whether the reminder was closed lately on this browser, for this account. */
function hiddenFor(userId: string): boolean {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? 'null') as { id: string; until: number } | null;
    return !!v && v.id === userId && v.until > Date.now();
  } catch {
    return false;
  }
}

/** Sends the confirmation link again; shared by the line above the page and the account menu. */
export function useResendVerification() {
  const { t } = useTranslation('common');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [message, setMessage] = useState('');
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
  return { state, message, resend };
}

/**
 * One quiet line above the page while the account has not confirmed its
 * email, saying why it matters (inviting the team and paying wait on it) and
 * offering the link again. It can be closed for a few days; the account menu
 * keeps the way to confirm meanwhile. Gone once the address is confirmed.
 */
export function VerifyEmailBanner({ me, personal = false }: { me: Me | null; personal?: boolean }) {
  const { t } = useTranslation('common');
  const { state, message, resend } = useResendVerification();
  // Read after mount: the server has no storage to decide it from.
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    if (me) setHidden(hiddenFor(me.id));
  }, [me]);

  if (!me || me.emailVerified !== false || hidden) return null;
  // Isolated, so an address inside an Arabic sentence keeps its own direction.
  const email = `⁨${me.email}⁩`;

  function close() {
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify({ id: me!.id, until: Date.now() + HIDE_FOR_MS }));
    } catch {
      // storage blocked: closed for this page only
    }
    setHidden(true);
  }

  return (
    <div
      role="status"
      className="flex items-center gap-3 border-b border-amber-500/20 bg-amber-500/[0.07] px-5 py-2 text-sm text-amber-950 md:px-8 dark:bg-amber-500/10 dark:text-amber-100"
    >
      <Icon name="mail" size={14} className="shrink-0 opacity-70" />
      <span className="min-w-0 flex-1 sm:truncate">
        <span className="font-semibold">{t('verifyEmail.title')}</span>{' '}
        {state === 'sent' ? t('verifyEmail.sent', { email }) : state === 'failed' ? message : t(personal ? 'verifyEmail.bodyPersonal' : 'verifyEmail.body')}
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
      <button type="button" onClick={close} aria-label={t('verifyEmail.close')} title={t('verifyEmail.close')} className="-me-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-70 hover:bg-amber-500/10 hover:opacity-100">
        <Icon name="x" size={13} />
      </button>
    </div>
  );
}

/** The way to confirm from the account menu, kept there while the line above the page is closed. */
export function VerifyEmailMenuItem({ me }: { me: Me | null }) {
  const { t } = useTranslation('common');
  const { state, message, resend } = useResendVerification();
  if (!me || me.emailVerified !== false) return null;
  return (
    <button
      type="button"
      role="menuitem"
      onClick={resend}
      disabled={state === 'sending' || state === 'sent'}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-start text-sm text-amber-800 transition-colors hover:bg-elevated disabled:opacity-80 md:min-h-8 dark:text-amber-200"
    >
      <Icon name="mail" size={15} />
      <span className="min-w-0 flex-1 truncate">
        {state === 'sent' ? t('verifyEmail.menuSent') : state === 'failed' ? message : state === 'sending' ? t('verifyEmail.sending') : t('verifyEmail.menu')}
      </span>
    </button>
  );
}
