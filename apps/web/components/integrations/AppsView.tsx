'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { authFetch } from '@/lib/client';
import { formatRelativeTime } from '@/lib/format';
import { readableOn } from '@/lib/color';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CopyField, Field, Notice, SheetSection, Toggle, iso, type Handoff } from './shared';

interface Connection {
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'SYNCING' | 'REQUIRES_REAUTH';
  account: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}
interface Provider {
  key: string;
  name: string;
  category: string;
  description: string;
  status: 'available' | 'coming_soon';
  scopes: string[];
  popular?: boolean;
  connection: Connection | null;
  supportsOAuth?: boolean;
  oauthAppConfigured?: boolean;
  crmSyncable?: boolean;
}

type State = 'connected' | 'attention' | 'ready' | 'ownApp' | 'soon';
const RANK: Record<State, number> = { connected: 0, attention: 1, ready: 2, ownApp: 3, soon: 4 };

function stateOf(p: Provider): State {
  const s = p.connection?.status;
  if (s === 'CONNECTED' || s === 'SYNCING') return 'connected';
  if (s === 'ERROR' || s === 'REQUIRES_REAUTH') return 'attention';
  if (p.status === 'available') return 'ready';
  if (p.supportsOAuth) return 'ownApp';
  return 'soon';
}

const DOT: Record<State, string> = {
  connected: 'bg-emerald-500',
  attention: 'bg-amber-500',
  ready: 'bg-accent',
  ownApp: '',
  soon: '',
};

/** Each app's own colour, behind its initial. */
const BRAND: Record<string, string> = {
  hubspot: '#ff7a59', salesforce: '#00a1e0', zoho_crm: '#e42527', pipedrive: '#017737', dynamics: '#0b53ce',
  mailchimp: '#ffe01b', brevo: '#0b996e', klaviyo: '#232426', activecampaign: '#356ae6',
  slack: '#4a154b', ms_teams: '#5059c9', whatsapp_business: '#25d366', telegram: '#26a5e4',
  google_calendar: '#4285f4', outlook_calendar: '#0078d4', calendly: '#006bff',
  google_workspace: '#4285f4', microsoft_365: '#d83b01', notion: '#191919', trello: '#0079bf', asana: '#f06a6a', clickup: '#7b68ee',
  google_drive: '#1fa463', onedrive: '#0364b8', dropbox: '#0061ff',
  zapier: '#ff4f00', make: '#6d00cc', n8n: '#ea4b71',
  google_analytics: '#e37400', google_tag_manager: '#246fdb', meta_pixel: '#0866ff', linkedin_insight: '#0a66c2',
};

/** The app's description in the page's language; the API's text is English. */
function describe(t: TFunction, p: Provider): string {
  return t(`integrations:apps.descriptions.${p.key}`, { defaultValue: p.description });
}

/** Tools that already take our webhooks, and the one an automation can post to. */
const VIA_WEBHOOK = new Set(['zapier', 'make', 'n8n']);
const VIA_AUTOMATION: Record<string, string> = { slack: 'new-lead-slack' };

function AppLogo({ p, size = 36 }: { p: Provider; size?: number }) {
  const bg = BRAND[p.key] ?? '#64748b';
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-[10px] font-semibold ring-1 ring-inset ring-black/5 dark:ring-white/10"
      style={{ width: size, height: size, background: bg, color: readableOn(bg), fontSize: size * 0.42 }}
    >
      {p.name.charAt(0).toUpperCase()}
    </span>
  );
}

export function AppsView({
  canManage,
  canHandOff,
  returned,
  onReturnedSeen,
  onHandOff,
}: {
  canManage: boolean;
  canHandOff: boolean;
  returned: { connected?: string; error?: string } | null;
  onReturnedSeen: () => void;
  onHandOff: (h: Exclude<Handoff, null>) => void;
}) {
  const { t } = useTranslation('integrations');
  const [items, setItems] = useState<Provider[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [error, setError] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([authFetch<Provider[]>('/integrations'), authFetch<{ categories: Record<string, string> }>('/integrations/providers')])
      .then(([list, meta]) => {
        setItems(list);
        // Only categories that have apps, in the API's order.
        setCategories(Object.keys(meta.categories).filter((c) => list.some((p) => p.category === c)));
      })
      .catch((e) => setError((e as Error).message));
  }, []);
  useEffect(load, [load]);

  const byKey = useMemo(() => new Map((items ?? []).map((p) => [p.key, p])), [items]);
  const sorted = useMemo(
    () =>
      [...(items ?? [])].sort(
        (a, b) => RANK[stateOf(a)] - RANK[stateOf(b)] || Number(!!b.popular) - Number(!!a.popular) || a.name.localeCompare(b.name),
      ),
    [items],
  );
  const needle = q.trim().toLowerCase();
  const shown = sorted.filter(
    (p) => (cat === 'all' || p.category === cat) && (!needle || p.name.toLowerCase().includes(needle) || describe(t, p).toLowerCase().includes(needle)),
  );
  const connected = cat === 'all' && !needle ? shown.filter((p) => RANK[stateOf(p)] <= 1) : [];
  const rest = shown.filter((p) => !connected.includes(p));
  const groups = categories.map((c) => ({ key: c, items: rest.filter((p) => p.category === c) })).filter((g) => g.items.length);

  const returnedName = returned?.connected ? byKey.get(returned.connected)?.name ?? returned.connected : '';
  const open = openKey ? byKey.get(openKey) ?? null : null;

  return (
    <div>
      {returned && (
        <Notice tone={returned.connected ? 'success' : 'danger'} icon={returned.connected ? 'check' : 'x'} onDismiss={onReturnedSeen}>
          {returned.connected ? t('apps.returned.connected', { name: returnedName }) : t('apps.returned.failed', { error: returned.error })}
        </Notice>
      )}
      {error && <Notice tone="danger" icon="x">{error}</Notice>}

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-72">
          <Icon name="search" size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-faint" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('apps.search')} aria-label={t('apps.search')} className="v-field w-full !ps-9" />
        </div>
        <div role="tablist" aria-label={t('categories.all')} className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5 lg:mx-0 lg:px-0">
          {['all', ...categories].map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={cat === c}
              onClick={() => setCat(c)}
              className={`h-9 shrink-0 rounded-full px-3.5 text-sm font-medium transition-colors sm:h-8 ${
                cat === c ? 'bg-ink text-canvas' : 'text-muted ring-1 ring-inset ring-line hover:text-ink'
              }`}
            >
              {t(`categories.${c}`, { defaultValue: c })}
            </button>
          ))}
        </div>
      </div>

      {!items ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="v-skeleton h-[92px] rounded-xl" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">{t('apps.noMatch', { q })}</p>
      ) : (
        <div className="space-y-8">
          {connected.length > 0 && <Group title={t('apps.connected')} items={connected} onOpen={setOpenKey} />}
          {groups.map((g) => (
            <Group key={g.key} title={t(`categories.${g.key}`, { defaultValue: g.key })} items={g.items} onOpen={setOpenKey} />
          ))}
        </div>
      )}

      <AppSheet
        p={open}
        canManage={canManage}
        canHandOff={canHandOff}
        onClose={() => setOpenKey(null)}
        onChanged={load}
        onHandOff={(h) => {
          setOpenKey(null);
          onHandOff(h);
        }}
      />
    </div>
  );
}

function Group({ title, items, onOpen }: { title: string; items: Provider[]; onOpen: (key: string) => void }) {
  return (
    <section>
      <h2 className="mb-3 flex items-baseline gap-2 text-sm font-semibold text-ink">
        {title}
        <span className="tabular text-xs font-normal text-faint">{items.length}</span>
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => (
          <Tile key={p.key} p={p} onOpen={() => onOpen(p.key)} />
        ))}
      </div>
    </section>
  );
}

function Tile({ p, onOpen }: { p: Provider; onOpen: () => void }) {
  const { t } = useTranslation('integrations');
  const state = stateOf(p);
  return (
    <button
      onClick={onOpen}
      className="group flex items-start gap-3 rounded-xl bg-surface p-4 text-start ring-1 ring-inset ring-line transition-shadow hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <AppLogo p={p} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-base font-medium text-ink">{p.name}</span>
        </span>
        <span className={`mt-0.5 flex items-center gap-1.5 text-xs ${state === 'soon' || state === 'ownApp' ? 'text-faint' : state === 'attention' ? 'text-amber-700 dark:text-amber-400' : 'text-muted'}`}>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[state]}`} style={state === 'soon' || state === 'ownApp' ? { background: 'hsl(var(--v-border-strong))' } : undefined} />
          {t(`apps.state.${state}`)}
        </span>
        <span className="mt-2 line-clamp-2 block text-xs leading-snug text-muted">{describe(t, p)}</span>
      </span>
    </button>
  );
}

interface OAuthApp {
  configured: boolean;
  clientId: string | null;
  redirectUri: string;
}
interface SyncConfig {
  syncEnabled: boolean;
  fieldMapping: Record<string, string>;
}
interface SyncRecord {
  id: string;
  externalId: string | null;
  status: string;
  error: string | null;
  syncedAt: string;
}

function AppSheet({
  p,
  canManage,
  canHandOff,
  onClose,
  onChanged,
  onHandOff,
}: {
  p: Provider | null;
  canManage: boolean;
  canHandOff: boolean;
  onClose: () => void;
  onChanged: () => void;
  onHandOff: (h: Exclude<Handoff, null>) => void;
}) {
  const { t } = useTranslation('integrations');
  const { locale } = useLocale();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'disconnect' | 'removeApp' | null>(null);

  useEffect(() => {
    setBusy('');
    setError('');
    setConfirm(null);
  }, [p?.key]);

  // Keep the last app while the sheet animates closed.
  const [last, setLast] = useState<Provider | null>(p);
  useEffect(() => {
    if (p) setLast(p);
  }, [p]);
  const app = p ?? last;
  if (!app) return <Sheet open={false} onClose={onClose} title="" closeLabel={t('close')}>{null}</Sheet>;

  const state = stateOf(app);
  const conn = app.connection;

  async function connect() {
    setError('');
    setBusy('connect');
    try {
      const { url } = await authFetch<{ url: string }>(`/integrations/${app!.key}/authorize`);
      window.location.href = url;
    } catch (e) {
      setError((e as Error).message);
      setBusy('');
    }
  }

  const footer =
    canManage && (state === 'connected' || state === 'attention' || state === 'ready') ? (
      <div className="flex flex-wrap justify-end gap-2">
        {state !== 'ready' && (
          <button onClick={() => setConfirm('disconnect')} className="v-btn v-btn-ghost text-red-600 dark:text-red-400">
            {t('apps.disconnect')}
          </button>
        )}
        {state !== 'connected' && (
          <button onClick={connect} disabled={!!busy} className="v-btn disabled:opacity-60">
            {busy === 'connect' ? t('apps.connecting') : state === 'attention' ? t('apps.reconnect') : t('apps.connect')}
          </button>
        )}
      </div>
    ) : undefined;

  return (
    <>
      <Sheet
        open={!!p}
        onClose={onClose}
        closeLabel={t('close')}
        title={
          <span className="flex items-center gap-3">
            <AppLogo p={app} size={32} />
            {app.name}
          </span>
        }
        subtitle={<span className="ms-11 block -mt-1">{t(`categories.${app.category}`, { defaultValue: app.category })}</span>}
        footer={footer}
      >
        <div className="space-y-6">
          <p className="text-sm leading-relaxed text-ink">{describe(t, app)}</p>

          {error && <Notice tone="danger" icon="x">{error}</Notice>}

          {(state === 'connected' || state === 'attention') && (
            <div className="rounded-lg bg-elevated px-4 py-3 text-sm ring-1 ring-inset ring-line">
              <p className="flex items-center gap-2 font-medium text-ink">
                <span className={`h-2 w-2 rounded-full ${DOT[state]}`} />
                {conn?.account ? t('apps.account', { account: iso(conn.account) }) : t(`apps.state.${state}`)}
              </p>
              {conn?.lastSyncAt && <p className="mt-1 text-muted">{t('apps.lastSync', { time: formatRelativeTime(conn.lastSyncAt, locale) })}</p>}
              {conn?.status === 'REQUIRES_REAUTH' && <p className="mt-2 text-amber-700 dark:text-amber-400">{t('apps.expired')}</p>}
              {conn?.lastError && <p className="mt-2 break-words text-red-700 dark:text-red-300">{conn.lastError}</p>}
            </div>
          )}

          {(state === 'soon' || state === 'ownApp') && (
            <div className="rounded-lg bg-elevated px-4 py-3 text-sm leading-relaxed text-muted ring-1 ring-inset ring-line">
              <p>{t('apps.soonBody', { name: app.name })}</p>
              {VIA_WEBHOOK.has(app.key) && (
                <>
                  <p className="mt-1">{t('apps.viaWebhook', { name: app.name })}</p>
                  {canHandOff && (
                    <button onClick={() => onHandOff({ kind: 'webhook' })} className="v-btn v-btn-ghost mt-3">
                      <Icon name="send" size={14} /> {t('apps.addWebhook')}
                    </button>
                  )}
                </>
              )}
              {VIA_AUTOMATION[app.key] && (
                <>
                  <p className="mt-1">{t('apps.viaAutomation', { name: app.name })}</p>
                  {canHandOff && (
                    <button onClick={() => onHandOff({ kind: 'automation', template: VIA_AUTOMATION[app.key] })} className="v-btn v-btn-ghost mt-3">
                      <Icon name="sparkle" size={14} /> {t('apps.createAutomation')}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          <SheetSection title={t('apps.access')}>
            <ul className="space-y-2">
              {app.scopes.map((s) => (
                <li key={s} className="flex items-center gap-2.5 text-sm text-ink">
                  <Icon name="check" size={14} className="shrink-0 text-accent" />
                  {t(`apps.scopes.${s}`, { defaultValue: s })}
                </li>
              ))}
            </ul>
          </SheetSection>

          {app.supportsOAuth && canManage && state !== 'connected' && (
            <OwnApp app={app} onSaved={onChanged} onRemove={() => setConfirm('removeApp')} />
          )}

          {app.crmSyncable && state === 'connected' && <CrmSync app={app} canManage={canManage} />}
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirm === 'disconnect'}
        title={t('apps.disconnectTitle', { name: app.name })}
        body={t('apps.disconnectBody', { name: app.name })}
        confirmLabel={t('apps.disconnect')}
        busyLabel={t('apps.disconnecting')}
        cancelLabel={t('cancel')}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          await authFetch(`/integrations/${app.key}/disconnect`, { method: 'POST' });
          setConfirm(null);
          onChanged();
        }}
      />
      <ConfirmDialog
        open={confirm === 'removeApp'}
        title={t('apps.ownApp.removeTitle', { name: app.name })}
        body={t('apps.ownApp.removeBody', { name: app.name })}
        confirmLabel={t('apps.ownApp.remove')}
        busyLabel={t('apps.ownApp.removing')}
        cancelLabel={t('cancel')}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          await authFetch(`/integrations/${app.key}/oauth-app`, { method: 'DELETE' });
          setConfirm(null);
          onChanged();
        }}
      />
    </>
  );
}

/** Registering the organization's own OAuth app, for providers that allow it. */
function OwnApp({ app, onSaved, onRemove }: { app: Provider; onSaved: () => void; onRemove: () => void }) {
  const { t } = useTranslation('integrations');
  const [info, setInfo] = useState<OAuthApp | null>(null);
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    setMsg(null);
    setSecret('');
    authFetch<OAuthApp>(`/integrations/${app.key}/oauth-app`)
      .then((r) => {
        setInfo(r);
        setClientId(r.clientId ?? '');
      })
      .catch(() => {});
  }, [app.key, app.oauthAppConfigured]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!clientId.trim() || !secret.trim()) return setMsg({ tone: 'danger', text: t('apps.ownApp.both') });
    setBusy(true);
    try {
      await authFetch(`/integrations/${app.key}/oauth-app`, { method: 'PUT', body: JSON.stringify({ clientId: clientId.trim(), clientSecret: secret.trim() }) });
      setSecret('');
      setMsg({ tone: 'success', text: t('apps.ownApp.saved') });
      onSaved();
    } catch (err) {
      setMsg({ tone: 'danger', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SheetSection title={t('apps.ownApp.title', { name: app.name })} hint={t('apps.ownApp.body', { name: app.name })}>
      <form onSubmit={save} className="space-y-4">
        {info && (
          <Field label={t('apps.ownApp.redirect')}>
            <CopyField value={info.redirectUri} />
          </Field>
        )}
        <Field label={t('apps.ownApp.clientId')} htmlFor="own-client-id">
          <input id="own-client-id" dir="ltr" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" className="v-field w-full font-mono text-sm" />
        </Field>
        <Field label={t('apps.ownApp.clientSecret')} htmlFor="own-client-secret" hint={info?.configured ? t('apps.ownApp.secretKept') : undefined}>
          <input id="own-client-secret" dir="ltr" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" className="v-field w-full font-mono text-sm" />
        </Field>
        {msg && <p className={`text-xs ${msg.tone === 'success' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{msg.text}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {info?.configured ? (
            <button type="button" onClick={onRemove} className="text-sm font-medium text-red-600 hover:underline dark:text-red-400">
              {t('apps.ownApp.remove')}
            </button>
          ) : (
            <span />
          )}
          <button disabled={busy} className="v-btn disabled:opacity-60">
            {busy ? t('saving') : t('save')}
          </button>
        </div>
      </form>
    </SheetSection>
  );
}

/** Sending leads to a connected CRM: on or off, which fields go where, and a log. */
function CrmSync({ app, canManage }: { app: Provider; canManage: boolean }) {
  const { t } = useTranslation('integrations');
  const { locale } = useLocale();
  const [cfg, setCfg] = useState<SyncConfig | null>(null);
  const [fields, setFields] = useState<string[]>([]);
  const [records, setRecords] = useState<SyncRecord[]>([]);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState('');

  const load = useCallback(() => {
    authFetch<{ config: SyncConfig; meta: { vertexFields: string[] } }>(`/integrations/${app.key}/sync-config`)
      .then((r) => {
        setCfg(r.config);
        setFields(r.meta.vertexFields);
      })
      .catch(() => {});
    authFetch<SyncRecord[]>(`/integrations/${app.key}/sync-records`).then(setRecords).catch(() => {});
  }, [app.key]);
  useEffect(load, [load]);

  async function put(body: Partial<SyncConfig>) {
    const next = await authFetch<SyncConfig>(`/integrations/${app.key}/sync-config`, { method: 'PUT', body: JSON.stringify(body) }).catch(() => null);
    if (next) setCfg(next);
  }

  if (!cfg) return null;

  return (
    <SheetSection title={t('apps.sync.title', { name: app.name })}>
      <label className="flex items-center justify-between gap-3 text-sm text-ink">
        {t('apps.sync.auto')}
        <Toggle on={cfg.syncEnabled} disabled={!canManage} label={t('apps.sync.auto')} onChange={() => put({ syncEnabled: !cfg.syncEnabled })} />
      </label>

      <div className="mt-5">
        <p className="text-xs font-medium text-ink">{t('apps.sync.mapping')}</p>
        <p className="mt-1 text-xs leading-relaxed text-faint">{t('apps.sync.mappingHint', { name: app.name })}</p>
        <div className="mt-3 divide-y divide-line rounded-lg ring-1 ring-inset ring-line">
          {fields.map((f) => (
            <div key={f} className="flex items-center gap-3 px-3 py-2">
              <span className="w-28 shrink-0 text-sm text-muted">{t(`apps.sync.fields.${f}`, { defaultValue: f })}</span>
              <Icon name="arrow" size={13} className="shrink-0 text-faint rtl:-scale-x-100" />
              <input
                key={`${f}:${cfg.fieldMapping[f] ?? ''}`}
                dir="ltr"
                defaultValue={cfg.fieldMapping[f] ?? ''}
                disabled={!canManage}
                placeholder={t('apps.sync.notMapped')}
                aria-label={t(`apps.sync.fields.${f}`, { defaultValue: f })}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v === (cfg.fieldMapping[f] ?? '')) return;
                  const fm = { ...cfg.fieldMapping };
                  if (v) fm[f] = v;
                  else delete fm[f];
                  put({ fieldMapping: fm });
                }}
                className="h-8 min-w-0 flex-1 rounded-md bg-transparent px-2 font-mono text-xs text-ink outline-none placeholder:font-sans placeholder:text-faint hover:bg-elevated focus:bg-elevated rtl:text-right"
              />
            </div>
          ))}
        </div>
      </div>

      {canManage && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={async () => {
              setBusy('sync');
              setResult('');
              const r = await authFetch<{ synced: number; failed: number }>(`/integrations/${app.key}/sync`, { method: 'POST' }).catch(() => null);
              if (r) setResult(t('apps.sync.result', { synced: r.synced, failed: r.failed }));
              setBusy('');
              load();
            }}
            disabled={!!busy}
            className="v-btn v-btn-ghost disabled:opacity-60"
          >
            <Icon name="refresh" size={14} />
            {busy === 'sync' ? t('apps.sync.running') : t('apps.sync.now')}
          </button>
          {result && <span className="text-xs text-muted">{result}</span>}
        </div>
      )}

      <p className="mt-5 text-xs font-medium text-ink">{t('apps.sync.recent')}</p>
      {records.length === 0 ? (
        <p className="mt-1.5 text-xs text-faint">{t('apps.sync.none')}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {records.slice(0, 8).map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-xs">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.status === 'SYNCED' ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <span dir="ltr" className="min-w-0 flex-1 truncate font-mono text-muted rtl:text-right">
                {r.externalId ?? r.error ?? '—'}
              </span>
              <span className="shrink-0 text-faint">{formatRelativeTime(r.syncedAt, locale)}</span>
            </li>
          ))}
        </ul>
      )}
    </SheetSection>
  );
}
