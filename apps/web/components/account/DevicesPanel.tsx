'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { describeDevice } from '@vertex/shared';
import { devices, logout, type SignedInDevice } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatDate, formatRelativeTime } from '@/lib/format';
import { Icon } from '@/components/Icon';

/** Seen within this long counts as in use now. */
const ACTIVE_NOW_MS = 10 * 60 * 1000;

/**
 * Where the account is signed in: each device with its browser, address and
 * when it was last used, and a way to sign it out. Signing this one out is
 * signing out here.
 */
export function DevicesPanel() {
  const { t } = useTranslation('settings');
  const { locale } = useLocale();
  const [list, setList] = useState<SignedInDevice[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmOthers, setConfirmOthers] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => devices.list().then(setList), []);

  useEffect(() => {
    load().catch((e) => setError((e as Error).message));
  }, [load]);

  async function run(key: string, fn: () => Promise<void>) {
    setError('');
    setNotice('');
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const signOut = (d: SignedInDevice) =>
    run(d.id, async () => {
      await devices.signOut(d.id);
      if (d.current) {
        logout();
        window.location.href = '/login';
        return;
      }
      setList((l) => l?.filter((x) => x.id !== d.id) ?? null);
      setNotice(t('devices.signedOutOne', { device: name(d) }));
    });

  const signOutOthers = () =>
    run('others', async () => {
      const { count } = await devices.signOutOthers();
      setConfirmOthers(false);
      setList((l) => l?.filter((x) => x.current) ?? null);
      setNotice(t('devices.signedOutOthers', { count }));
    });

  function name(d: SignedInDevice) {
    const { browser, os } = describeDevice(d.userAgent);
    if (browser && os) return t('devices.on', { browser, os });
    return browser ?? os ?? t('devices.unknown');
  }

  const others = list?.filter((d) => !d.current).length ?? 0;

  return (
    <section className="rounded-xl p-5 ring-1 ring-inset ring-line">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-elevated text-muted">
          <Icon name="monitor" size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-medium text-ink">{t('devices.title')}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{t('devices.body')}</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-500/[0.06] px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-4 rounded-lg bg-emerald-500/[0.06] px-3 py-2 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-300">
          {notice}
        </p>
      )}

      {!list ? (
        <div className="mt-4 space-y-2">
          <div className="v-skeleton h-14 rounded-lg" />
          <div className="v-skeleton h-14 rounded-lg" />
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-lg ring-1 ring-inset ring-line" aria-label={t('devices.title')}>
          {list.map((d) => {
            const kind = describeDevice(d.userAgent).kind;
            const now = Date.now() - new Date(d.lastSeenAt).getTime() < ACTIVE_NOW_MS;
            return (
              <li key={d.id} className="flex items-center gap-3 px-3 py-3" data-testid="device-row">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-elevated text-muted">
                  <Icon name={kind === 'desktop' ? 'monitor' : 'phone'} size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">{name(d)}</span>
                    {d.current && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">{t('devices.thisDevice')}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-faint">
                    {d.ip && (
                      <>
                        <span dir="ltr">{d.ip}</span> ·{' '}
                      </>
                    )}
                    {d.current || now ? t('devices.activeNow') : t('devices.lastActive', { when: formatRelativeTime(d.lastSeenAt, locale) })} ·{' '}
                    {t('devices.since', { date: formatDate(d.createdAt, locale) })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => signOut(d)}
                  disabled={busy !== null}
                  className="v-btn v-btn-ghost shrink-0 disabled:opacity-50"
                  aria-label={t('devices.signOutNamed', { device: name(d) })}
                >
                  {busy === d.id ? t('devices.signingOut') : t('devices.signOut')}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {others > 0 &&
        (confirmOthers ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted">{t('devices.confirmOthers', { count: others })}</p>
            <button type="button" onClick={signOutOthers} disabled={busy !== null} className="v-btn disabled:opacity-50">
              {busy === 'others' ? t('devices.signingOut') : t('devices.confirm')}
            </button>
            <button type="button" onClick={() => setConfirmOthers(false)} className="v-btn v-btn-ghost">
              {t('devices.cancel')}
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => (setConfirmOthers(true), setNotice(''))} className="v-btn v-btn-ghost mt-4 text-red-600 dark:text-red-400">
            <Icon name="logout" size={14} /> {t('devices.signOutOthers')}
          </button>
        ))}
    </section>
  );
}
