'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch, getToken } from '@/lib/client';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/AppShell';
import { Icon } from '@/components/Icon';

// ---- Types mirroring the API responses ----
interface Connection {
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'SYNCING' | 'REQUIRES_REAUTH';
  scope: 'ORG' | 'USER';
  account: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  updatedAt: string;
}
interface Provider {
  key: string;
  name: string;
  category: string;
  description: string;
  auth: 'oauth2' | 'api_key' | 'webhook_url' | 'none';
  status: 'available' | 'coming_soon';
  scopes: string[];
  popular?: boolean;
  connection: Connection | null;
  /** OAuth-capable and this org can register its own app credentials. */
  supportsOAuth?: boolean;
  /** This org has registered its OWN OAuth app for the provider. */
  oauthAppConfigured?: boolean;
  /** Supports Vertex → CRM lead sync. */
  crmSyncable?: boolean;
}
interface WebhookEndpoint {
  id: string;
  url: string;
  description: string | null;
  secretHint: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
}
interface Delivery {
  id: string;
  event: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  attempts: number;
  responseStatus: number | null;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
}
interface ApiKey {
  id: string;
  name: string;
  keyHint: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revoked: boolean;
  createdBy: string | null;
  createdAt: string;
}

type Tab = 'overview' | 'marketplace' | 'automations' | 'webhooks' | 'keys';

const CONN_BADGE: Record<string, { label: string; cls: string }> = {
  CONNECTED: { label: 'Connected', cls: 'v-badge-success' },
  ERROR: { label: 'Connection error', cls: 'v-badge-danger' },
  REQUIRES_REAUTH: { label: 'Needs reauth', cls: 'v-badge-warning' },
  SYNCING: { label: 'Syncing', cls: 'v-badge-accent' },
  DISCONNECTED: { label: 'Disconnected', cls: 'v-badge-neutral' },
};

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function IntegrationsPage() {
  const router = useRouter();
  const { t } = useTranslation('integrations');
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    if (!getToken()) router.replace('/login');
    // Returning from an OAuth flow (?connected / ?error) lands on the
    // marketplace so the result is shown next to the provider. Done in an
    // effect (client-only) to avoid an SSR hydration mismatch.
    const q = new URLSearchParams(window.location.search);
    if (q.has('connected') || q.has('error')) setTab('marketplace');
  }, [router]);

  return (
    <AppShell title={t('title', 'Integrations & Automations')}>
      <div className="mb-6 flex gap-1.5 overflow-x-auto border-b border-line">
        {([
          ['overview', t('tabs.overview', 'Overview'), 'gauge'],
          ['marketplace', t('tabs.marketplace', 'Marketplace'), 'layers'],
          ['automations', t('tabs.automations', 'Automations'), 'sparkle'],
          ['webhooks', t('tabs.webhooks', 'Webhooks'), 'send'],
          ['keys', t('tabs.keys', 'API Keys'), 'lock'],
        ] as const).map(([id, label, icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-[13px] font-semibold transition-colors ${
              tab === id
                ? 'border-accent text-ink'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <Icon name={icon} size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview />}
      {tab === 'marketplace' && <Marketplace />}
      {tab === 'automations' && <Automations />}
      {tab === 'webhooks' && <Webhooks />}
      {tab === 'keys' && <ApiKeys />}
    </AppShell>
  );
}

// ===========================================================================
//  Overview — real analytics computed from delivery data
// ===========================================================================
interface Analytics {
  windowDays: number;
  deliveries: { total: number; success: number; failed: number; pending: number; successRate: number; failureRate: number };
  byEvent: { event: string; count: number }[];
  perDay: { day: string; total: number; success: number }[];
  counts: { webhookEndpoints: number; activeApiKeys: number; connectedIntegrations: number };
}
interface EndpointHealth {
  endpointId: string;
  url: string;
  status: 'healthy' | 'warning' | 'degraded' | 'error' | 'idle';
  total: number;
  succeeded: number;
  failed: number;
  successRate: number;
  lastDeliveryAt: string | null;
  lastStatus: string | null;
}

const HEALTH_META: Record<string, { dot: string; label: string }> = {
  healthy: { dot: '#22c55e', label: 'Healthy' },
  warning: { dot: '#f59e0b', label: 'Warning' },
  degraded: { dot: '#f97316', label: 'Degraded' },
  error: { dot: '#ef4444', label: 'Error' },
  idle: { dot: '#94a3b8', label: 'Idle' },
};

function Overview() {
  const { t } = useTranslation('integrations');
  const [a, setA] = useState<Analytics | null>(null);
  const [health, setHealth] = useState<EndpointHealth[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      authFetch<Analytics>('/integrations/analytics'),
      authFetch<EndpointHealth[]>('/integrations/health'),
    ])
      .then(([an, h]) => {
        setA(an);
        setHealth(h);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <p className="text-[13px] text-red-500">{error}</p>;
  if (!a) return <GridSkeleton />;

  const maxDay = Math.max(1, ...a.perDay.map((d) => d.total));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('stats.deliveries7d', 'Deliveries (7d)')} value={a.deliveries.total.toLocaleString()} />
        <StatCard label={t('stats.successRate', 'Success Rate')} value={`${a.deliveries.successRate}%`} accent={a.deliveries.total > 0} />
        <StatCard label={t('stats.failed', 'Failed')} value={a.deliveries.failed.toLocaleString()} danger={a.deliveries.failed > 0} />
        <StatCard label={t('stats.activeKeys', 'Active API Keys')} value={String(a.counts.activeApiKeys)} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="v-card p-5">
          <h3 className="mb-3 text-[13.5px] font-bold text-ink">{t('sections.deliveriesPerDay', 'Deliveries Per Day')}</h3>
          {a.perDay.length === 0 ? (
            <p className="py-8 text-center text-[12.5px] text-muted">{t('sections.noDeliveries', 'No deliveries in the last 7 days.')}</p>
          ) : (
            <div className="flex h-32 items-end gap-1.5">
              {a.perDay.map((d) => (
                <div key={d.day} className="group flex flex-1 flex-col items-center justify-end gap-1" title={`${d.day}: ${d.success}/${d.total} ok`}>
                  <div className="flex w-full flex-col justify-end" style={{ height: `${(d.total / maxDay) * 100}%` }}>
                    <div className="w-full rounded-t bg-red-400/40" style={{ height: `${((d.total - d.success) / d.total) * 100}%` }} />
                    <div className="w-full rounded-b bg-accent" style={{ height: `${(d.success / d.total) * 100}%` }} />
                  </div>
                  <span className="text-[9px] text-faint">{d.day.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="v-card p-5">
          <h3 className="mb-3 text-[13.5px] font-bold text-ink">{t('sections.byEvent', 'By Event')}</h3>
          {a.byEvent.length === 0 ? (
            <p className="py-8 text-center text-[12.5px] text-muted">{t('sections.noEvents', 'No events forwarded yet.')}</p>
          ) : (
            <div className="space-y-2">
              {a.byEvent.slice(0, 6).map((e) => (
                <div key={e.event} className="flex items-center gap-2">
                  <span className="w-36 shrink-0 truncate font-mono text-[11.5px] text-muted">{e.event}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(e.count / a.byEvent[0].count) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right text-[11.5px] font-semibold text-ink">{e.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-2.5 text-[13.5px] font-bold text-ink">{t('sections.endpointHealth', 'Endpoint Health')}</h3>
        {!health || health.length === 0 ? (
          <EmptyState icon="send" text={t('sections.noWebhooks', 'No webhook endpoints to monitor yet.')} />
        ) : (
          <div className="space-y-2">
            {health.map((h) => {
              const meta = HEALTH_META[h.status];
              return (
                <div key={h.endpointId} className="v-card flex flex-wrap items-center justify-between gap-3 p-3.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: meta.dot }} />
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[12px] font-semibold text-ink">{h.url}</p>
                      <p className="text-[10.5px] text-muted">
                        {meta.label} · {h.total} deliveries · last {timeAgo(h.lastDeliveryAt)}
                      </p>
                    </div>
                  </div>
                  <span className="text-[12.5px] font-bold text-ink">{h.total > 0 ? `${h.successRate}%` : '—'}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className="v-card p-4">
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-1 text-[24px] font-extrabold tabular-nums ${danger ? 'text-red-500' : accent ? 'text-accent' : 'text-ink'}`}>
        {value}
      </p>
    </div>
  );
}

// ===========================================================================
//  Marketplace
// ===========================================================================
function Marketplace() {
  const [items, setItems] = useState<Provider[] | null>(null);
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [error, setError] = useState('');

  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    Promise.all([
      authFetch<Provider[]>('/integrations'),
      authFetch<{ categories: Record<string, string> }>('/integrations/providers'),
    ])
      .then(([m, p]) => {
        setItems(m);
        setCategories(p.categories);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    load();
    // Surface the OAuth callback result carried back in the URL, then clean it.
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const err = params.get('error');
    if (connected) setNotice(`Connected to ${connected}.`);
    else if (err) setNotice(`Connection failed: ${err}`);
    if (connected || err) window.history.replaceState({}, '', '/integrations');
  }, [load]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const needle = q.toLowerCase().trim();
    return items.filter(
      (i) =>
        (cat === 'all' || i.category === cat) &&
        (!needle ||
          i.name.toLowerCase().includes(needle) ||
          i.description.toLowerCase().includes(needle)),
    );
  }, [items, q, cat]);

  const connectedCount = items?.filter((i) => i.connection?.status === 'CONNECTED').length ?? 0;

  if (error) return <p className="text-[13px] text-red-500">{error}</p>;
  if (!items) return <GridSkeleton />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute left-3 top-2.5 text-muted">
            <Icon name="search" size={15} />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search integrations…"
            className="v-field h-10 w-full pl-9 text-[13px]"
          />
        </div>
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="v-field h-10 text-[13px] font-semibold"
        >
          <option value="all">All categories</option>
          {Object.entries(categories).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <span className="v-badge v-badge-neutral">{connectedCount} connected</span>
      </div>

      {notice && (
        <div className="rounded-xl border border-line bg-canvas/40 px-4 py-2.5 text-[12.5px] text-ink">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => (
          <ProviderCard key={p.key} p={p} categoryLabel={categories[p.category] ?? p.category} onChanged={load} />
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="py-12 text-center text-[13px] text-muted">No integrations match your search.</p>
      )}
    </div>
  );
}

function ProviderCard({ p, categoryLabel, onChanged }: { p: Provider; categoryLabel: string; onChanged: () => void }) {
  const conn = p.connection;
  const badge = conn
    ? CONN_BADGE[conn.status]
    : p.status === 'coming_soon'
      ? { label: 'Coming soon', cls: 'v-badge-neutral' }
      : { label: 'Available', cls: 'v-badge-accent' };

  return (
    <div className="v-card flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-canvas text-[15px] font-bold text-ink border border-line">
          {p.name.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13.5px] font-bold text-ink">{p.name}</p>
            {p.popular && <span className="v-badge v-badge-accent !py-0 text-[9px]">Popular</span>}
          </div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-faint">{categoryLabel}</p>
        </div>
        <span className={`v-badge ${badge.cls} shrink-0`}>{badge.label}</span>
      </div>

      <p className="text-[12px] leading-relaxed text-muted line-clamp-2">{p.description}</p>

      <div className="flex flex-wrap gap-1">
        {p.scopes.map((s) => (
          <span key={s} className="v-chip !py-0.5 text-[10px] text-muted">
            {s}
          </span>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between pt-1">
        <span className="text-[11px] text-faint">
          {conn?.lastError ? conn.lastError.slice(0, 40) : conn?.lastSyncAt ? `Last sync ${timeAgo(conn.lastSyncAt)}` : ''}
        </span>
        <ProviderAction p={p} onChanged={onChanged} />
      </div>

      {p.crmSyncable && conn?.status === 'CONNECTED' && <CrmSyncPanel provider={p.key} />}
    </div>
  );
}

// ---- CRM sync settings for a connected CRM provider (sections 5–8, 14) ----
interface SyncConfig { syncEnabled: boolean; direction: string; fieldMapping: Record<string, string> }
interface SyncMeta { vertexFields: string[]; defaultMapping: Record<string, string> }
interface SyncRecord { id: string; entityId: string; externalId: string | null; status: string; error: string | null; syncedAt: string }

function CrmSyncPanel({ provider }: { provider: string }) {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<SyncConfig | null>(null);
  const [meta, setMeta] = useState<SyncMeta | null>(null);
  const [records, setRecords] = useState<SyncRecord[]>([]);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    authFetch<{ config: SyncConfig; meta: SyncMeta }>(`/integrations/${provider}/sync-config`)
      .then((r) => { setCfg(r.config); setMeta(r.meta); }).catch(() => {});
    authFetch<SyncRecord[]>(`/integrations/${provider}/sync-records`).then(setRecords).catch(() => {});
  }, [provider]);
  useEffect(() => { if (open) load(); }, [open, load]);

  async function toggle() {
    if (!cfg) return;
    setBusy('toggle');
    const next = await authFetch<SyncConfig>(`/integrations/${provider}/sync-config`, {
      method: 'PUT', body: JSON.stringify({ syncEnabled: !cfg.syncEnabled }),
    }).catch(() => cfg);
    setCfg(next); setBusy('');
  }
  async function setMap(vertexField: string, crmField: string) {
    if (!cfg) return;
    const fm = { ...cfg.fieldMapping };
    if (crmField) fm[vertexField] = crmField; else delete fm[vertexField];
    const next = await authFetch<SyncConfig>(`/integrations/${provider}/sync-config`, {
      method: 'PUT', body: JSON.stringify({ fieldMapping: fm }),
    }).catch(() => cfg);
    setCfg(next);
  }
  async function syncNow() {
    setBusy('sync');
    const r = await authFetch<{ synced: number; failed: number }>(`/integrations/${provider}/sync`, { method: 'POST' }).catch(() => null);
    if (r) alert(`Synced ${r.synced}, failed ${r.failed}`);
    load(); setBusy('');
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-[11.5px] font-semibold text-ink">
        <span className="flex items-center gap-1.5"><Icon name="refresh" size={12} /> CRM Sync</span>
        <Icon name={open ? 'x' : 'plus'} size={11} className="text-muted" />
      </button>
      {open && cfg && meta && (
        <div className="mt-2.5 space-y-3">
          <label className="flex items-center justify-between text-[11.5px]">
            <span className="text-muted">Auto-sync new leads → {provider}</span>
            <button onClick={toggle} disabled={busy === 'toggle'} className={`h-5 w-9 rounded-full transition-colors ${cfg.syncEnabled ? 'bg-accent' : 'bg-line'}`}>
              <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${cfg.syncEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </label>

          <div>
            <p className="v-section-label mb-1">Field mapping (Vertex → CRM)</p>
            <div className="space-y-1">
              {meta.vertexFields.map((vf) => (
                <div key={vf} className="flex items-center gap-2 text-[11px]">
                  <span className="w-20 shrink-0 font-mono text-muted">{vf}</span>
                  <span className="text-faint">→</span>
                  <input
                    defaultValue={cfg.fieldMapping[vf] ?? ''}
                    onBlur={(e) => e.target.value !== (cfg.fieldMapping[vf] ?? '') && setMap(vf, e.target.value.trim())}
                    placeholder="(not mapped)"
                    className="v-field h-7 flex-1 font-mono text-[11px]"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button onClick={syncNow} disabled={busy === 'sync'} className="v-btn v-btn-ghost h-7 px-3 text-[11px]">
              {busy === 'sync' ? 'Syncing…' : 'Sync now'}
            </button>
            <span className="text-[10.5px] text-faint">{records.length} synced record{records.length !== 1 ? 's' : ''}</span>
          </div>

          {records.length > 0 && (
            <div className="max-h-28 space-y-0.5 overflow-y-auto">
              {records.slice(0, 6).map((r) => (
                <div key={r.id} className="flex items-center justify-between text-[10.5px]">
                  <span className="font-mono text-muted">{r.externalId ?? '—'}</span>
                  <span className={r.status === 'SYNCED' ? 'text-emerald-600' : 'text-red-500'}>{r.status}</span>
                  <span className="text-faint">{timeAgo(r.syncedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProviderAction({ p, onChanged }: { p: Provider; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(false);
  const connected = p.connection?.status === 'CONNECTED';
  const reauth = p.connection?.status === 'REQUIRES_REAUTH';

  async function connect() {
    setBusy(true);
    try {
      // Kick off the OAuth flow — the server returns the provider consent URL.
      const { url } = await authFetch<{ url: string }>(`/integrations/${p.key}/authorize`);
      window.location.href = url; // leaves to the provider; returns to /integrations
    } catch (e) {
      alert((e as Error).message);
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    try {
      await authFetch(`/integrations/${p.key}/disconnect`, { method: 'POST' });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (setup) {
    return <OAuthAppForm provider={p.key} onClose={() => setSetup(false)} onSaved={() => { setSetup(false); onChanged(); }} />;
  }

  if (connected || reauth) {
    return (
      <div className="flex gap-1.5">
        {reauth && (
          <button onClick={connect} disabled={busy} className="v-btn h-8 px-3 text-[12px]">Reconnect</button>
        )}
        <button onClick={disconnect} disabled={busy} className="v-btn v-btn-ghost h-8 px-3 text-[12px] text-red-500">
          Disconnect
        </button>
      </div>
    );
  }
  // OAuth provider this org can bring its own app to, but hasn't yet.
  if (p.supportsOAuth && !p.oauthAppConfigured && p.status !== 'available') {
    return (
      <button onClick={() => setSetup(true)} className="v-btn v-btn-ghost h-8 px-3 text-[12px]">
        Set up app
      </button>
    );
  }
  if (p.status === 'available') {
    return (
      <div className="flex gap-1.5">
        {p.oauthAppConfigured && (
          <button onClick={() => setSetup(true)} className="v-btn v-btn-ghost h-8 px-2.5 text-[12px]" title="Edit app credentials">
            <Icon name="settings" size={13} />
          </button>
        )}
        <button onClick={connect} disabled={busy} className="v-btn h-8 px-3 text-[12px] disabled:opacity-60">
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      </div>
    );
  }
  return <button disabled title="Not available yet" className="v-btn v-btn-ghost h-8 px-3 text-[12px] disabled:opacity-50">Coming soon</button>;
}

function OAuthAppForm({ provider, onClose, onSaved }: { provider: string; onClose: () => void; onSaved: () => void }) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    authFetch<{ clientId: string | null }>(`/integrations/${provider}/oauth-app`)
      .then((r) => r.clientId && setClientId(r.clientId))
      .catch(() => {});
  }, [provider]);

  async function save() {
    setErr('');
    if (!clientId.trim() || !clientSecret.trim()) { setErr('Both fields are required.'); return; }
    setBusy(true);
    try {
      await authFetch(`/integrations/${provider}/oauth-app`, {
        method: 'PUT',
        body: JSON.stringify({ clientId, clientSecret }),
      });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-2 rounded-lg border border-line bg-canvas/40 p-2.5">
      <p className="text-[11px] font-semibold text-ink">Your {provider} OAuth app</p>
      <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Client ID" className="v-field h-8 w-full text-[11.5px]" />
      <input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="Client secret" type="password" className="v-field h-8 w-full text-[11.5px]" />
      {err && <p className="text-[10.5px] text-red-500">{err}</p>}
      <div className="flex justify-end gap-1.5">
        <button onClick={onClose} className="v-btn v-btn-ghost h-7 px-2.5 text-[11px]">Cancel</button>
        <button onClick={save} disabled={busy} className="v-btn h-7 px-2.5 text-[11px] disabled:opacity-60">Save</button>
      </div>
    </div>
  );
}

// ===========================================================================
//  Webhooks
// ===========================================================================
function Webhooks() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[] | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [reveal, setReveal] = useState<string | null>(null);
  const [logFor, setLogFor] = useState<string | null>(null);

  const load = useCallback(() => {
    authFetch<WebhookEndpoint[]>('/webhooks').then(setEndpoints).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => {
    load();
    authFetch<{ events: string[] }>('/webhooks/events').then((r) => setEvents(r.events)).catch(() => {});
  }, [load]);

  async function remove(id: string) {
    await authFetch(`/webhooks/${id}`, { method: 'DELETE' }).catch((e) => setError((e as Error).message));
    load();
  }
  async function rotate(id: string) {
    const r = await authFetch<{ secret: string }>(`/webhooks/${id}/rotate-secret`, { method: 'POST' });
    setReveal(r.secret);
  }

  if (error) return <p className="text-[13px] text-red-500">{error}</p>;
  if (!endpoints) return <GridSkeleton />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-muted">
          Send signed events to external systems (Slack, Zapier, Make, n8n, your own server).
        </p>
        <button onClick={() => setShowForm(true)} className="v-btn h-9 px-3.5 text-[12.5px]">
          <Icon name="plus" size={14} /> Add endpoint
        </button>
      </div>

      {reveal && <SecretReveal label="Signing secret" value={reveal} onClose={() => setReveal(null)} />}
      {showForm && (
        <WebhookForm
          events={events}
          onClose={() => setShowForm(false)}
          onCreated={(secret) => {
            setShowForm(false);
            setReveal(secret);
            load();
          }}
        />
      )}

      {endpoints.length === 0 ? (
        <EmptyState icon="send" text="No webhook endpoints yet." />
      ) : (
        <div className="space-y-2.5">
          {endpoints.map((e) => (
            <div key={e.id} className="v-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-mono text-[12.5px] font-semibold text-ink">{e.url}</p>
                    <span className={`v-badge ${e.enabled ? 'v-badge-success' : 'v-badge-neutral'}`}>
                      {e.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {e.description ? `${e.description} · ` : ''}
                    {e.events.length} event{e.events.length !== 1 ? 's' : ''} · secret {e.secretHint}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {e.events.map((ev) => (
                      <span key={ev} className="v-chip !py-0.5 text-[10px] text-muted">{ev}</span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button onClick={() => setLogFor(logFor === e.id ? null : e.id)} className="v-btn v-btn-ghost h-8 px-3 text-[12px]">
                    <Icon name="list" size={13} /> Log
                  </button>
                  <button onClick={() => rotate(e.id)} className="v-btn v-btn-ghost h-8 px-3 text-[12px]" title="Rotate secret">
                    <Icon name="refresh" size={13} />
                  </button>
                  <button onClick={() => remove(e.id)} className="v-btn v-btn-ghost h-8 px-3 text-[12px] text-red-500" title="Delete">
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </div>
              {logFor === e.id && <DeliveryLog endpointId={e.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WebhookForm({
  events,
  onClose,
  onCreated,
}: {
  events: string[];
  onClose: () => void;
  onCreated: (secret: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setErr('');
    if (!url || selected.length === 0) {
      setErr('Enter a URL and pick at least one event.');
      return;
    }
    setBusy(true);
    try {
      const r = await authFetch<{ secret: string }>('/webhooks', {
        method: 'POST',
        body: JSON.stringify({ url, description: description || undefined, events: selected }),
      });
      onCreated(r.secret);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="v-card space-y-3 p-5">
      <h3 className="text-[14px] font-bold text-ink">New webhook endpoint</h3>
      <div>
        <label className="v-section-label mb-1 block">Endpoint URL</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/hooks/vertex"
          className="v-field h-10 w-full text-[13px]"
        />
        <p className="mt-1 text-[11px] text-faint">Must be https (localhost allowed for testing).</p>
      </div>
      <div>
        <label className="v-section-label mb-1 block">Description (optional)</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} className="v-field h-10 w-full text-[13px]" />
      </div>
      <div>
        <label className="v-section-label mb-1.5 block">Events</label>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {events.map((ev) => {
            const on = selected.includes(ev);
            return (
              <button
                key={ev}
                onClick={() => setSelected((s) => (on ? s.filter((x) => x !== ev) : [...s, ev]))}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors ${
                  on ? 'border-accent bg-accent/10 text-ink' : 'border-line text-muted hover:border-line-strong'
                }`}
              >
                <Icon name={on ? 'check' : 'plus'} size={11} /> {ev}
              </button>
            );
          })}
        </div>
      </div>
      {err && <p className="text-[12px] text-red-500">{err}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="v-btn v-btn-ghost h-9 px-4 text-[12.5px]">Cancel</button>
        <button onClick={submit} disabled={busy} className="v-btn h-9 px-4 text-[12.5px] disabled:opacity-60">
          Create endpoint
        </button>
      </div>
    </div>
  );
}

function DeliveryLog({ endpointId }: { endpointId: string }) {
  const [rows, setRows] = useState<Delivery[] | null>(null);
  const load = useCallback(() => {
    authFetch<Delivery[]>(`/webhooks/deliveries/log?endpointId=${endpointId}`).then(setRows).catch(() => setRows([]));
  }, [endpointId]);
  useEffect(() => load(), [load]);

  async function replay(id: string) {
    await authFetch(`/webhooks/deliveries/${id}/replay`, { method: 'POST' }).catch(() => {});
    setTimeout(load, 1500);
  }

  if (!rows) return <p className="mt-3 text-[12px] text-muted">Loading deliveries…</p>;
  if (rows.length === 0) return <p className="mt-3 text-[12px] text-muted">No deliveries yet.</p>;

  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-line">
      <table className="v-table w-full text-[11.5px]">
        <thead>
          <tr>
            <th className="text-left">Event</th>
            <th className="text-left">Status</th>
            <th className="text-left">HTTP</th>
            <th className="text-left">Attempts</th>
            <th className="text-left">Duration</th>
            <th className="text-left">When</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id}>
              <td className="font-mono">{d.event}</td>
              <td>
                <span
                  className={`v-badge ${
                    d.status === 'SUCCESS' ? 'v-badge-success' : d.status === 'FAILED' ? 'v-badge-danger' : 'v-badge-neutral'
                  }`}
                >
                  {d.status}
                </span>
              </td>
              <td>{d.responseStatus ?? (d.error ? '—' : '')}</td>
              <td>{d.attempts}</td>
              <td>{d.durationMs != null ? `${d.durationMs}ms` : '—'}</td>
              <td className="text-muted">{timeAgo(d.createdAt)}</td>
              <td className="text-right">
                {d.status === 'FAILED' && (
                  <button onClick={() => replay(d.id)} className="v-btn v-btn-ghost h-7 px-2 text-[11px]">
                    <Icon name="refresh" size={11} /> Replay
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ===========================================================================
//  API Keys
// ===========================================================================
function ApiKeys() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [reveal, setReveal] = useState<string | null>(null);

  const load = useCallback(() => {
    authFetch<ApiKey[]>('/api-keys').then(setKeys).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => {
    load();
    authFetch<{ scopes: string[] }>('/api-keys/scopes').then((r) => setScopes(r.scopes)).catch(() => {});
  }, [load]);

  async function revoke(id: string) {
    await authFetch(`/api-keys/${id}/revoke`, { method: 'POST' }).catch((e) => setError((e as Error).message));
    load();
  }
  async function rotate(id: string) {
    const r = await authFetch<{ key: string }>(`/api-keys/${id}/rotate`, { method: 'POST' });
    setReveal(r.key);
    load();
  }

  if (error) return <p className="text-[13px] text-red-500">{error}</p>;
  if (!keys) return <GridSkeleton />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-muted">
          Programmatic access to this workspace. Scopes limit what each key can do.
        </p>
        <button onClick={() => setShowForm(true)} className="v-btn h-9 px-3.5 text-[12.5px]">
          <Icon name="plus" size={14} /> New key
        </button>
      </div>

      {reveal && <SecretReveal label="API key" value={reveal} onClose={() => setReveal(null)} />}
      {showForm && (
        <KeyForm
          scopes={scopes}
          onClose={() => setShowForm(false)}
          onCreated={(key) => {
            setShowForm(false);
            setReveal(key);
            load();
          }}
        />
      )}

      {keys.length === 0 ? (
        <EmptyState icon="lock" text="No API keys yet." />
      ) : (
        <div className="space-y-2.5">
          {keys.map((k) => (
            <div key={k.id} className="v-card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[13px] font-bold text-ink">{k.name}</p>
                  {k.revoked && <span className="v-badge v-badge-danger">Revoked</span>}
                </div>
                <p className="mt-0.5 font-mono text-[11.5px] text-muted">{k.keyHint}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {k.scopes.map((s) => (
                    <span key={s} className="v-chip !py-0.5 text-[10px] text-muted">{s}</span>
                  ))}
                </div>
                <p className="mt-1 text-[10.5px] text-faint">
                  {k.createdBy ? `By ${k.createdBy} · ` : ''}last used {timeAgo(k.lastUsedAt)}
                  {k.expiresAt ? ` · expires ${new Date(k.expiresAt).toLocaleDateString()}` : ''}
                </p>
              </div>
              {!k.revoked && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button onClick={() => rotate(k.id)} className="v-btn v-btn-ghost h-8 px-3 text-[12px]" title="Rotate">
                    <Icon name="refresh" size={13} />
                  </button>
                  <button onClick={() => revoke(k.id)} className="v-btn v-btn-ghost h-8 px-3 text-[12px] text-red-500">
                    Revoke
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KeyForm({
  scopes,
  onClose,
  onCreated,
}: {
  scopes: string[];
  onClose: () => void;
  onCreated: (key: string) => void;
}) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setErr('');
    if (!name || selected.length === 0) {
      setErr('Enter a name and pick at least one scope.');
      return;
    }
    setBusy(true);
    try {
      const r = await authFetch<{ key: string }>('/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name, scopes: selected }),
      });
      onCreated(r.key);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="v-card space-y-3 p-5">
      <h3 className="text-[14px] font-bold text-ink">New API key</h3>
      <div>
        <label className="v-section-label mb-1 block">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Production server" className="v-field h-10 w-full text-[13px]" />
      </div>
      <div>
        <label className="v-section-label mb-1.5 block">Scopes</label>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {scopes.map((s) => {
            const on = selected.includes(s);
            return (
              <button
                key={s}
                onClick={() => setSelected((v) => (on ? v.filter((x) => x !== s) : [...v, s]))}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-mono transition-colors ${
                  on ? 'border-accent bg-accent/10 text-ink' : 'border-line text-muted hover:border-line-strong'
                }`}
              >
                <Icon name={on ? 'check' : 'plus'} size={11} /> {s}
              </button>
            );
          })}
        </div>
      </div>
      {err && <p className="text-[12px] text-red-500">{err}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="v-btn v-btn-ghost h-9 px-4 text-[12.5px]">Cancel</button>
        <button onClick={submit} disabled={busy} className="v-btn h-9 px-4 text-[12.5px] disabled:opacity-60">
          Create key
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
//  Automations — no-code rules on real domain events
// ===========================================================================
interface Automation {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  trigger: string;
  matchType: 'ALL' | 'ANY';
  conditions: { field: string; operator: string; value?: unknown }[];
  actions: { type: string; config: Record<string, unknown> }[];
  runCount: number;
  lastRunAt: string | null;
}
interface AutomationTemplate {
  key: string;
  name: string;
  description: string;
  trigger: string;
  matchType: 'ALL' | 'ANY';
  conditions: { field: string; operator: string; value?: unknown }[];
  actions: { type: string; config: Record<string, unknown> }[];
}
interface AutomationRun {
  id: string;
  automationId: string;
  event: string;
  status: string;
  actionsRun: number;
  results: { type: string; ok: boolean; detail: string }[] | null;
  createdAt: string;
}

const ACTION_ICON: Record<string, string> = { notify: 'bell', task: 'list', webhook: 'send' };

function Automations() {
  const [items, setItems] = useState<Automation[] | null>(null);
  const [triggers, setTriggers] = useState<string[]>([]);
  const [templates, setTemplates] = useState<AutomationTemplate[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState<Partial<AutomationTemplate> | null>(null);

  const load = useCallback(() => {
    authFetch<Automation[]>('/automations').then(setItems).catch((e) => setError((e as Error).message));
    authFetch<AutomationRun[]>('/automations/runs').then(setRuns).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    authFetch<{ triggers: string[] }>('/automations/triggers').then((r) => setTriggers(r.triggers)).catch(() => {});
    authFetch<{ templates: AutomationTemplate[] }>('/automations/templates').then((r) => setTemplates(r.templates)).catch(() => {});
  }, [load]);

  async function toggle(a: Automation) {
    await authFetch(`/automations/${a.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !a.enabled }) }).catch(() => {});
    load();
  }
  async function remove(id: string) {
    await authFetch(`/automations/${id}`, { method: 'DELETE' }).catch(() => {});
    load();
  }

  if (error) return <p className="text-[13px] text-red-500">{error}</p>;
  if (!items) return <GridSkeleton />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-muted">
          When an event happens, if conditions match, run actions — notify, create a task, or call a webhook.
        </p>
        <button onClick={() => setForm({ trigger: 'lead.created', matchType: 'ALL', conditions: [], actions: [] })} className="v-btn h-9 px-3.5 text-[12.5px]">
          <Icon name="plus" size={14} /> New automation
        </button>
      </div>

      {form && (
        <AutomationForm
          initial={form}
          triggers={triggers}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); load(); }}
        />
      )}

      {items.length === 0 && !form && (
        <div className="space-y-3">
          <EmptyState icon="sparkle" text="No automations yet. Start from a template:" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <button key={t.key} onClick={() => setForm(t)} className="v-card p-4 text-left hover:border-accent">
                <p className="text-[13px] font-bold text-ink">{t.name}</p>
                <p className="mt-1 text-[11.5px] text-muted line-clamp-2">{t.description}</p>
                <span className="v-chip mt-2 !py-0.5 text-[10px] text-muted">{t.trigger}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-2.5">
          {items.map((a) => (
            <div key={a.id} className="v-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13.5px] font-bold text-ink">{a.name}</p>
                    <span className={`v-badge ${a.enabled ? 'v-badge-success' : 'v-badge-neutral'}`}>
                      {a.enabled ? 'On' : 'Off'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-muted">
                    <span className="font-mono">{a.trigger}</span>
                    {a.conditions.length > 0 && ` · ${a.conditions.length} condition${a.conditions.length !== 1 ? 's' : ''} (${a.matchType})`}
                    {` · ran ${a.runCount}×`}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {a.actions.map((ac, i) => (
                      <span key={i} className="v-chip !py-0.5 flex items-center gap-1 text-[10px] text-muted">
                        <Icon name={ACTION_ICON[ac.type] ?? 'sparkle'} size={10} /> {ac.type}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button onClick={() => toggle(a)} className="v-btn v-btn-ghost h-8 px-3 text-[12px]">
                    {a.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => remove(a.id)} className="v-btn v-btn-ghost h-8 px-3 text-[12px] text-red-500" title="Delete">
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {runs.length > 0 && (
        <div>
          <h3 className="mb-2 text-[13px] font-bold text-ink">Recent runs</h3>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="v-table w-full text-[11.5px]">
              <thead>
                <tr>
                  <th className="text-left">Event</th>
                  <th className="text-left">Status</th>
                  <th className="text-left">Actions</th>
                  <th className="text-left">When</th>
                </tr>
              </thead>
              <tbody>
                {runs.slice(0, 12).map((r) => (
                  <tr key={r.id}>
                    <td className="font-mono">{r.event}</td>
                    <td>
                      <span className={`v-badge ${r.status === 'SUCCESS' ? 'v-badge-success' : r.status === 'FAILED' ? 'v-badge-danger' : 'v-badge-warning'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="text-muted">{(r.results ?? []).map((x) => `${x.type}:${x.ok ? '✓' : '✗'}`).join(' ')}</td>
                    <td className="text-muted">{timeAgo(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function AutomationForm({
  initial,
  triggers,
  onClose,
  onSaved,
}: {
  initial: Partial<AutomationTemplate>;
  triggers: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial.name ?? '');
  const [trigger, setTrigger] = useState(initial.trigger ?? 'lead.created');
  const [matchType, setMatchType] = useState<'ALL' | 'ANY'>(initial.matchType ?? 'ALL');
  const [conditions, setConditions] = useState(initial.conditions ?? []);
  const [actions, setActions] = useState(initial.actions ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setErr('');
    if (!name || actions.length === 0) {
      setErr('Give it a name and at least one action.');
      return;
    }
    setBusy(true);
    try {
      await authFetch('/automations', {
        method: 'POST',
        body: JSON.stringify({ name, trigger, matchType, conditions, actions }),
      });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  const OPERATORS = ['equals', 'not_equals', 'contains', 'not_contains', 'exists', 'not_exists', 'gt', 'lt'];
  const ACTION_TYPES = ['notify', 'task', 'webhook'] as const;

  return (
    <div className="v-card space-y-4 p-5">
      <h3 className="text-[14px] font-bold text-ink">New automation</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="v-section-label mb-1 block">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Route hot leads" className="v-field h-10 w-full text-[13px]" />
        </div>
        <div>
          <label className="v-section-label mb-1 block">When this happens (trigger)</label>
          <select value={trigger} onChange={(e) => setTrigger(e.target.value)} className="v-field h-10 w-full text-[13px] font-mono">
            {triggers.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <label className="v-section-label">Conditions</label>
          <select value={matchType} onChange={(e) => setMatchType(e.target.value as 'ALL' | 'ANY')} className="v-field h-7 text-[11px] font-semibold">
            <option value="ALL">match ALL</option>
            <option value="ANY">match ANY</option>
          </select>
        </div>
        <div className="space-y-1.5">
          {conditions.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <input value={c.field} onChange={(e) => setConditions((cs) => cs.map((x, j) => j === i ? { ...x, field: e.target.value } : x))} placeholder="data.company" className="v-field h-8 flex-1 min-w-[120px] font-mono text-[11.5px]" />
              <select value={c.operator} onChange={(e) => setConditions((cs) => cs.map((x, j) => j === i ? { ...x, operator: e.target.value } : x))} className="v-field h-8 text-[11.5px]">
                {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              {!['exists', 'not_exists'].includes(c.operator) && (
                <input value={String(c.value ?? '')} onChange={(e) => setConditions((cs) => cs.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} placeholder="value" className="v-field h-8 w-24 text-[11.5px]" />
              )}
              <button onClick={() => setConditions((cs) => cs.filter((_, j) => j !== i))} className="v-btn v-btn-ghost h-8 px-2 text-red-500"><Icon name="x" size={12} /></button>
            </div>
          ))}
          <button onClick={() => setConditions((cs) => [...cs, { field: 'data.', operator: 'contains', value: '' }])} className="v-btn v-btn-ghost h-8 px-3 text-[11.5px]">
            <Icon name="plus" size={12} /> Add condition
          </button>
        </div>
      </div>

      <div>
        <label className="v-section-label mb-1.5 block">Then do this</label>
        <div className="space-y-2">
          {actions.map((a, i) => (
            <div key={i} className="rounded-lg border border-line p-2.5">
              <div className="flex items-center gap-2">
                <select value={a.type} onChange={(e) => setActions((as) => as.map((x, j) => j === i ? { type: e.target.value, config: {} } : x))} className="v-field h-8 text-[12px] font-semibold">
                  {ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <button onClick={() => setActions((as) => as.filter((_, j) => j !== i))} className="v-btn v-btn-ghost ml-auto h-8 px-2 text-red-500"><Icon name="x" size={12} /></button>
              </div>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {a.type === 'webhook' ? (
                  <input value={String(a.config.url ?? '')} onChange={(e) => setActions((as) => as.map((x, j) => j === i ? { ...x, config: { url: e.target.value } } : x))} placeholder="https://hooks.slack.com/…" className="v-field h-8 text-[11.5px] sm:col-span-2" />
                ) : (
                  <>
                    <input value={String(a.config.title ?? '')} onChange={(e) => setActions((as) => as.map((x, j) => j === i ? { ...x, config: { ...x.config, title: e.target.value } } : x))} placeholder="Title" className="v-field h-8 text-[11.5px]" />
                    {a.type === 'notify' ? (
                      <input value={String(a.config.body ?? '')} onChange={(e) => setActions((as) => as.map((x, j) => j === i ? { ...x, config: { ...x.config, body: e.target.value } } : x))} placeholder="Body (optional)" className="v-field h-8 text-[11.5px]" />
                    ) : (
                      <input value={String(a.config.dueInDays ?? '')} onChange={(e) => setActions((as) => as.map((x, j) => j === i ? { ...x, config: { ...x.config, dueInDays: Number(e.target.value) } } : x))} placeholder="Due in days" type="number" className="v-field h-8 text-[11.5px]" />
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          <button onClick={() => setActions((as) => [...as, { type: 'notify', config: {} }])} className="v-btn v-btn-ghost h-8 px-3 text-[11.5px]">
            <Icon name="plus" size={12} /> Add action
          </button>
        </div>
      </div>

      {err && <p className="text-[12px] text-red-500">{err}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="v-btn v-btn-ghost h-9 px-4 text-[12.5px]">Cancel</button>
        <button onClick={submit} disabled={busy} className="v-btn h-9 px-4 text-[12.5px] disabled:opacity-60">Save automation</button>
      </div>
    </div>
  );
}

// ===========================================================================
//  Shared bits
// ===========================================================================
function SecretReveal({ label, value, onClose }: { label: string; value: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="mb-2 flex items-center gap-2 text-amber-600">
        <Icon name="shield" size={15} />
        <p className="text-[12.5px] font-bold">Copy your {label} now — it won&apos;t be shown again.</p>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-[12px] text-ink">
          {value}
        </code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="v-btn v-btn-ghost h-9 px-3 text-[12px]"
        >
          <Icon name={copied ? 'check' : 'copy'} size={13} /> {copied ? 'Copied' : 'Copy'}
        </button>
        <button onClick={onClose} className="v-btn v-btn-ghost h-9 px-3 text-[12px]">
          <Icon name="x" size={13} />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line py-14 text-center">
      <Icon name={icon} size={26} className="text-faint" />
      <p className="text-[13px] font-medium text-muted">{text}</p>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="v-skeleton h-36 w-full rounded-2xl" />
      ))}
    </div>
  );
}
