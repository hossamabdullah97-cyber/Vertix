'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ssoIssuer, type SsoProvider, type SsoView } from '@vertex/shared';
import { ssoSettings } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatDate } from '@/lib/format';
import { Icon } from '@/components/Icon';
import { Toggle } from '@/components/ui/Toggle';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const PROVIDERS: SsoProvider[] = ['GOOGLE', 'MICROSOFT', 'OIDC'];
const JOIN_ROLES = ['EMPLOYEE', 'MANAGER', 'ADMIN'] as const;

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 border-b border-line py-6 last:border-b-0 md:grid-cols-[240px_minmax(0,1fr)] md:gap-8">
      <div className="flex gap-3">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-elevated text-xs font-semibold tabular-nums text-muted ring-1 ring-inset ring-line">{n}</span>
        <div>
          <h2 className="text-base font-medium text-ink">{title}</h2>
          {hint && <p className="mt-1 text-xs leading-relaxed text-faint">{hint}</p>}
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Copyable({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation('organizations');
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg bg-elevated px-3 py-2 ring-1 ring-inset ring-line">
      <code dir="ltr" className="min-w-0 flex-1 truncate text-xs text-ink" title={value}>
        {value}
      </code>
      <button
        type="button"
        aria-label={label}
        className="v-hit flex shrink-0 items-center gap-1 text-xs font-medium text-accent hover:underline"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        <Icon name={copied ? 'check' : 'copy'} size={12} />
        {copied ? t('sso.copied') : t('sso.copy')}
      </button>
    </div>
  );
}

/**
 * A company workspace's single sign-on, in the order it is set up: prove the
 * email domain, connect the company's app at its provider, test it, then
 * decide who it adds and whether it is required.
 */
export function SsoSettings({ onDone, onError }: { onDone: (m: string) => void; onError: (m: string) => void }) {
  const { t } = useTranslation('organizations');
  const { locale } = useLocale();
  const [data, setData] = useState<SsoView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [domain, setDomain] = useState('');
  const [provider, setProvider] = useState<SsoProvider>('GOOGLE');
  const [tenantId, setTenantId] = useState('');
  const [issuer, setIssuer] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  function show(v: SsoView) {
    setData(v);
    if (v.connection) {
      setProvider(v.connection.provider);
      setTenantId(v.connection.tenantId ?? '');
      setIssuer(v.connection.provider === 'OIDC' ? v.connection.issuer : '');
      setClientId(v.connection.clientId);
    }
  }

  useEffect(() => {
    ssoSettings.get().then(show, (e) => onError((e as Error).message));
  }, [onError]);

  async function run(key: string, fn: () => Promise<SsoView | void>, done?: string) {
    setBusy(key);
    try {
      const v = await fn();
      if (v) show(v);
      if (done) onDone(done);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!data) return <div className="v-skeleton h-40 w-full rounded-xl" />;
  const c = data.connection;
  const verified = data.domains.filter((d) => d.verifiedAt);

  return (
    <div>
      <p className="max-w-[640px] text-sm leading-relaxed text-muted">{t('sso.intro')}</p>

      <Step n={1} title={t('sso.domains')} hint={t('sso.domainsHint')}>
        {data.domains.length > 0 && (
          <ul className="mb-4 space-y-3">
            {data.domains.map((d) => (
              <li key={d.id} className="rounded-lg p-3 ring-1 ring-inset ring-line" data-testid="sso-domain">
                <div className="flex items-center gap-2">
                  <span dir="ltr" className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                    {d.domain}
                  </span>
                  {d.verifiedAt ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      <Icon name="check" size={11} /> {t('sso.verified')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                      <Icon name="clock" size={11} /> {t('sso.waiting')}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={t('sso.removeDomain', { domain: d.domain })}
                    disabled={!!busy}
                    onClick={() => run(`rm-${d.id}`, () => ssoSettings.removeDomain(d.id))}
                    className="v-hit flex size-8 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-ink"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
                {!d.verifiedAt && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs leading-relaxed text-muted">{t('sso.recordHow', { domain: d.domain })}</p>
                    <Copyable value={d.record} label={t('sso.copyRecord')} />
                    <button type="button" className="v-btn v-btn-ghost" disabled={!!busy} onClick={() => run(`verify-${d.id}`, () => ssoSettings.verifyDomain(d.id), t('sso.domainVerified'))}>
                      {busy === `verify-${d.id}` && <Icon name="loader" size={14} className="animate-spin" />}
                      {t('sso.verify')}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!domain.trim()) return;
            void run('add-domain', async () => {
              const v = await ssoSettings.addDomain(domain.trim());
              setDomain('');
              return v;
            });
          }}
        >
          <input
            className="v-field min-w-0 flex-1"
            dir="ltr"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="company.com"
            aria-label={t('sso.domainLabel')}
            autoCapitalize="none"
            spellCheck={false}
          />
          <button type="submit" className="v-btn v-btn-ghost shrink-0" disabled={!!busy || !domain.trim()}>
            {t('sso.addDomain')}
          </button>
        </form>
      </Step>

      <Step n={2} title={t('sso.provider')} hint={t('sso.providerHint')}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run('save', () => ssoSettings.save({ provider, tenantId: tenantId || undefined, issuer: issuer || undefined, clientId, clientSecret: clientSecret || undefined }), t('sso.saved')).then(() =>
              setClientSecret(''),
            );
          }}
        >
          <div role="radiogroup" aria-label={t('sso.provider')} className="grid gap-2 sm:grid-cols-3">
            {PROVIDERS.map((p) => (
              <label
                key={p}
                className={`flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-sm ring-1 ring-inset transition-colors ${provider === p ? 'bg-accent/[0.06] font-medium text-ink ring-2 ring-accent' : 'text-muted ring-line hover:bg-elevated'}`}
              >
                <input type="radio" name="sso-provider" className="sr-only" checked={provider === p} onChange={() => setProvider(p)} />
                {t(`sso.providers.${p}`)}
              </label>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-muted">{t(`sso.how.${provider}`)}</p>
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-ink">{t('sso.redirect')}</span>
            <Copyable value={data.redirectUri} label={t('sso.copyRedirect')} />
          </div>
          {provider === 'MICROSOFT' && (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t('sso.tenantId')}</span>
              <input className="v-field" dir="ltr" value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" spellCheck={false} />
            </label>
          )}
          {provider === 'OIDC' && (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t('sso.issuer')}</span>
              <input className="v-field" dir="ltr" value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="https://login.company.com" spellCheck={false} />
            </label>
          )}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink">{t('sso.clientId')}</span>
            <input className="v-field" dir="ltr" value={clientId} onChange={(e) => setClientId(e.target.value)} spellCheck={false} autoComplete="off" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink">{t('sso.clientSecret')}</span>
            <input
              className="v-field"
              dir="ltr"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={c ? t('sso.secretKept') : ''}
              autoComplete="new-password"
            />
          </label>
          {provider !== 'OIDC' && (
            <p className="text-xs text-faint">
              {t('sso.issuerIs')}{' '}
              <span dir="ltr" className="font-mono">
                {ssoIssuer(provider, { tenantId: tenantId || '…' })}
              </span>
            </p>
          )}
          <button type="submit" className="v-btn" disabled={!!busy || !clientId.trim() || (!c && !clientSecret.trim())}>
            {busy === 'save' && <Icon name="loader" size={14} className="animate-spin" />}
            {c ? t('sso.update') : t('sso.connect')}
          </button>
        </form>
      </Step>

      <Step n={3} title={t('sso.test')} hint={t('sso.testHint')}>
        {c?.testedAt ? (
          <p className="flex items-center gap-2 text-sm text-ink" data-testid="sso-tested-at">
            <Icon name="check" size={14} className="text-emerald-600" />
            {t('sso.testedOn', { date: formatDate(c.testedAt, locale) })}
          </p>
        ) : (
          <p className="text-sm text-muted">{c ? t('sso.notTested') : t('sso.connectFirst')}</p>
        )}
        <button type="button" className="v-btn v-btn-ghost mt-3" disabled={!c || !!busy} onClick={() => run('test', () => ssoSettings.test())}>
          {busy === 'test' && <Icon name="loader" size={14} className="animate-spin" />}
          {t('sso.runTest')}
        </button>
      </Step>

      <Step n={4} title={t('sso.who')} hint={t('sso.whoHint')}>
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <Toggle on={!!c?.autoJoin} disabled={!c || !!busy} label={t('sso.autoJoin')} onChange={() => run('join', () => ssoSettings.set({ autoJoin: !c!.autoJoin }))} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{t('sso.autoJoin')}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{t('sso.autoJoinHint')}</p>
              {c?.autoJoin && (
                <label className="mt-2 flex items-center gap-2 text-sm text-muted">
                  {t('sso.joinAs')}
                  <select className="v-field !h-9 !w-auto" value={c.joinRole} disabled={!!busy} onChange={(e) => run('role', () => ssoSettings.set({ joinRole: e.target.value as (typeof JOIN_ROLES)[number] }))}>
                    {JOIN_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(`sso.roles.${r}`)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Toggle
              on={!!c?.enforced}
              disabled={!c || !!busy || (!c.enforced && (!c.testedAt || verified.length === 0))}
              label={t('sso.enforce')}
              onChange={() => run('enforce', () => ssoSettings.set({ enforced: !c!.enforced }), c!.enforced ? t('sso.enforceOff') : t('sso.enforceOn'))}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{t('sso.enforce')}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{t('sso.enforceHint')}</p>
              {c && !c.enforced && (!c.testedAt || verified.length === 0) && <p className="mt-1 text-xs text-faint">{t('sso.enforceNeeds')}</p>}
            </div>
          </div>
          {c && (
            <button type="button" className="v-btn v-btn-danger" disabled={!!busy} onClick={() => setConfirmRemove(true)}>
              {t('sso.remove')}
            </button>
          )}
        </div>
      </Step>

      <ConfirmDialog
        open={confirmRemove}
        danger
        title={t('sso.removeTitle')}
        body={t('sso.removeBody')}
        confirmLabel={t('sso.remove')}
        busyLabel={t('sso.removing')}
        cancelLabel={t('sso.cancel')}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={async () => {
          await run('remove', () => ssoSettings.remove(), t('sso.removed'));
          setConfirmRemove(false);
        }}
      />
    </div>
  );
}
