'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { account, logout, saveJson, type DeletionPreview, type Me } from '@/lib/client';
import { Icon } from '@/components/Icon';
import { Field, PasswordInput } from '@/components/auth/fields';
import { useLocale } from '@/components/i18n/LanguageProvider';

const today = () => new Date().toISOString().slice(0, 10);

/** A copy of everything the account holds, as a file. */
export function ExportMyData() {
  const { t } = useTranslation('settings');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setBusy(true);
    setError('');
    try {
      saveJson(await account.export(), `vertex-connect-my-data-${today()}.json`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl p-5 ring-1 ring-inset ring-line">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-elevated text-muted">
          <Icon name="download" size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-medium text-ink">{t('data.title')}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{t('data.body')}</p>
          {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button type="button" onClick={run} disabled={busy} className="v-btn v-btn-ghost mt-4 disabled:opacity-50">
            <Icon name="download" size={14} /> {busy ? t('data.preparing') : t('data.download')}
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * Closing the account: what happens to each workspace first, then the
 * password (or the address, for a Google-only account) and a two-step code.
 */
export function DeleteAccount({ me }: { me: Me | null }) {
  const { t } = useTranslation('settings');
  const { locale } = useLocale();
  const list = (names: { name: string }[]) => new Intl.ListFormat(locale, { type: 'conjunction' }).format(names.map((o) => o.name));
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<DeletionPreview | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && !plan) account.deletion().then(setPlan, (e) => setError((e as Error).message));
  }, [open, plan]);

  const blocked = !!plan?.blockers.length;
  const ready = plan && !blocked && confirmEmail.trim().toLowerCase() === (me?.email ?? '').toLowerCase() && (!plan.hasPassword || password) && (!plan.twoFactor || code.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      await account.remove({ confirmEmail, password: password || undefined, code: code.trim() || undefined });
      logout();
      window.location.href = '/?accountDeleted=1';
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl p-5 ring-1 ring-inset ring-red-500/25">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
          <Icon name="trash" size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-medium text-ink">{t('delete.title')}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{t('delete.body')}</p>
          {!open ? (
            <button type="button" onClick={() => setOpen(true)} className="v-btn v-btn-ghost mt-4 text-red-600 dark:text-red-400">
              {t('delete.start')}
            </button>
          ) : !plan ? (
            error ? <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : <div className="v-skeleton mt-4 h-24 w-full rounded-lg" />
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-4">
              {plan.blockers.length > 0 && (
                <div className="rounded-lg bg-amber-500/[0.08] px-4 py-3 text-sm ring-1 ring-inset ring-amber-500/25">
                  <p className="font-medium text-ink">{t('delete.blockedTitle')}</p>
                  <ul className="mt-1.5 list-disc space-y-0.5 ps-5 text-muted">
                    {plan.blockers.map((b) => (
                      <li key={b.id}>{t('delete.blocker', { name: b.name, count: b.members })}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-muted">{t('delete.blockedHow')}</p>
                </div>
              )}
              {plan.deletedWithIt.length > 0 && (
                <Consequence icon="trash" text={t('delete.withIt', { names: list(plan.deletedWithIt) })} />
              )}
              {plan.leaving.length > 0 && (
                <Consequence icon="logout" text={t('delete.leaving', { names: list(plan.leaving) })} />
              )}
              <Consequence icon="user" text={t('delete.erased')} />

              {!blocked && (
                <>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-ink">{t('delete.typeEmail', { email: me?.email ?? '' })}</span>
                    <input className="v-field" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} autoComplete="off" dir="ltr" />
                  </label>
                  {plan.hasPassword && (
                    <Field label={t('delete.password')}>{(p) => <PasswordInput {...p} value={password} onChange={setPassword} autoComplete="current-password" />}</Field>
                  )}
                  {plan.twoFactor && (
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium text-ink">{t('delete.code')}</span>
                      <input className="v-field w-44 font-mono tracking-[0.3em]" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" dir="ltr" />
                    </label>
                  )}
                  {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                  <div className="flex flex-wrap gap-2">
                    <button disabled={!ready || busy} className="v-btn v-btn-danger disabled:opacity-50">
                      {busy ? t('delete.deleting') : t('delete.confirm')}
                    </button>
                    <button type="button" onClick={() => (setOpen(false), setError(''))} className="v-btn v-btn-ghost">
                      {t('twoStep.cancel')}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function Consequence({ icon, text }: { icon: string; text: string }) {
  return (
    <p className="flex items-start gap-2 text-sm leading-relaxed text-muted">
      <Icon name={icon as never} size={14} className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </p>
  );
}
