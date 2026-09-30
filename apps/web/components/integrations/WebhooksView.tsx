'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { formatNumber, formatPercent, formatRelativeTime } from '@/lib/format';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EVENT_GROUPS, Empty, Field, Intro, ListSkeleton, Notice, SecretDialog, Toggle, eventLabel, iso, type Handoff } from './shared';

interface Endpoint {
  id: string;
  url: string;
  description: string | null;
  secretHint: string;
  events: string[];
  enabled: boolean;
}
interface Health {
  endpointId: string;
  status: 'healthy' | 'warning' | 'degraded' | 'error' | 'idle';
  total: number;
  successRate: number;
}
interface Summary {
  deliveries: { total: number; success: number; failed: number; successRate: number };
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

const HEALTH_DOT: Record<string, string> = {
  healthy: 'bg-emerald-500',
  warning: 'bg-amber-400',
  degraded: 'bg-orange-500',
  error: 'bg-red-500',
  idle: '',
};

type Form = { id?: string; url: string; description: string; events: string[] };

export function WebhooksView({ canManage, handoff, onHandled }: { canManage: boolean; handoff: Handoff; onHandled: () => void }) {
  const { t } = useTranslation('integrations');
  const { locale } = useLocale();
  const [items, setItems] = useState<Endpoint[] | null>(null);
  const [health, setHealth] = useState<Map<string, Health>>(new Map());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [logFor, setLogFor] = useState<Endpoint | null>(null);
  const [secret, setSecret] = useState('');
  const [confirm, setConfirm] = useState<{ kind: 'rotate' | 'delete'; e: Endpoint } | null>(null);

  const load = useCallback(() => {
    authFetch<Endpoint[]>('/webhooks').then(setItems).catch((e) => setError((e as Error).message));
    authFetch<Health[]>('/integrations/health').then((h) => setHealth(new Map(h.map((x) => [x.endpointId, x])))).catch(() => {});
    authFetch<Summary>('/integrations/analytics').then(setSummary).catch(() => {});
  }, []);
  useEffect(load, [load]);

  // An app (Zapier, Make, n8n) can send the owner here to add its URL.
  useEffect(() => {
    if (handoff?.kind !== 'webhook') return;
    if (canManage) setForm({ url: '', description: '', events: ['lead.created'] });
    onHandled();
  }, [handoff, canManage, onHandled]);

  async function toggle(e: Endpoint) {
    setItems((list) => list?.map((x) => (x.id === e.id ? { ...x, enabled: !e.enabled } : x)) ?? list);
    await authFetch(`/webhooks/${e.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !e.enabled }) }).catch((x) => setError((x as Error).message));
    load();
  }

  const n = (v: number) => formatNumber(v, locale);
  const eventsText = (events: string[]) => (events.includes('*') ? t('webhooks.allEvents') : events.length === 1 ? eventLabel(t, events[0]) : t('webhooks.events', { count: events.length }));

  return (
    <div>
      <Intro
        text={t('webhooks.intro')}
        action={
          canManage && items && items.length > 0 ? (
            <button onClick={() => setForm({ url: '', description: '', events: [] })} className="v-btn">
              <Icon name="plus" size={14} /> {t('webhooks.add')}
            </button>
          ) : undefined
        }
      />
      {error && <Notice tone="danger" icon="x" onDismiss={() => setError('')}>{error}</Notice>}

      {!items ? (
        <ListSkeleton rows={2} />
      ) : items.length === 0 ? (
        <Empty
          icon="send"
          title={t('webhooks.emptyTitle')}
          body={t('webhooks.emptyBody')}
          action={
            canManage ? (
              <button onClick={() => setForm({ url: '', description: '', events: [] })} className="v-btn">
                <Icon name="plus" size={14} /> {t('webhooks.add')}
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          {summary && (
            <dl className="v-card mb-4 grid grid-cols-3 divide-x divide-line overflow-hidden rtl:divide-x-reverse">
              {[
                [t('webhooks.stats.deliveries'), n(summary.deliveries.total), ''],
                [t('webhooks.stats.success'), summary.deliveries.total ? formatPercent(summary.deliveries.successRate / 100, locale) : '—', ''],
                [t('webhooks.stats.failed'), n(summary.deliveries.failed), summary.deliveries.failed ? 'text-red-600 dark:text-red-400' : ''],
              ].map(([label, value, tone]) => (
                <div key={label} className="px-4 py-3.5 sm:px-5">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className={`tabular mt-1 text-2xl font-semibold tracking-[-0.01em] ${tone || 'text-ink'}`}>{value}</dd>
                </div>
              ))}
            </dl>
          )}

          <ul className="v-card divide-y divide-line overflow-hidden">
            {items.map((e) => {
              const h = health.get(e.id);
              const status = h?.status ?? 'idle';
              return (
                <li key={e.id} className="flex items-center gap-3 px-4 py-3.5 sm:gap-4 sm:px-5">
                  <span
                    title={t(`webhooks.health.${status}`)}
                    className={`h-2 w-2 shrink-0 rounded-full ${HEALTH_DOT[status]}`}
                    style={status === 'idle' ? { background: 'hsl(var(--v-border-strong))' } : undefined}
                  />
                  <button onClick={() => setLogFor(e)} className="min-w-0 flex-1 text-start">
                    <span dir="ltr" className={`block truncate font-mono text-sm rtl:text-right ${e.enabled ? 'text-ink' : 'text-muted'}`}>
                      {e.url}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {[e.description, eventsText(e.events), t(`webhooks.health.${status}`)].filter((x): x is string => !!x).map(iso).join(' · ')}
                    </span>
                  </button>
                  {h && h.total > 0 && (
                    <span className="tabular hidden shrink-0 text-xs text-muted sm:block">{formatPercent(h.successRate / 100, locale)}</span>
                  )}
                  <Toggle on={e.enabled} disabled={!canManage} label={t('webhooks.toggle', { url: e.url })} onChange={() => toggle(e)} />
                  <ActionMenu
                    label={t('more')}
                    items={[
                      { key: 'log', label: t('webhooks.deliveries'), icon: 'list', onSelect: () => setLogFor(e) },
                      ...(canManage
                        ? [
                            { key: 'edit', label: t('webhooks.edit'), icon: 'settings', onSelect: () => setForm({ id: e.id, url: e.url, description: e.description ?? '', events: e.events }) },
                            { key: 'rotate', label: t('webhooks.rotate'), icon: 'refresh', onSelect: () => setConfirm({ kind: 'rotate', e }) },
                            { key: 'delete', label: t('webhooks.delete'), icon: 'trash', danger: true, separated: true, onSelect: () => setConfirm({ kind: 'delete', e }) },
                          ]
                        : []),
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}

      <details className="group mt-6 rounded-xl ring-1 ring-inset ring-line">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-ink sm:px-5 [&::-webkit-details-marker]:hidden">
          <Icon name="shield" size={14} className="text-faint" />
          {t('webhooks.verify.title')}
          <Icon name="chevron-down" size={14} className="ms-auto text-faint transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-line px-4 py-4 sm:px-5">
          <p className="max-w-[640px] text-sm leading-relaxed text-muted">{t('webhooks.verify.body')}</p>
          <pre dir="ltr" className="mt-3 overflow-x-auto rounded-lg bg-elevated px-3.5 py-3 text-start font-mono text-xs leading-relaxed text-ink ring-1 ring-inset ring-line">
            {`X-Vertex-Signature: t=1760000000,v1=5257a869e7…\n\nexpected = HMAC_SHA256(secret, t + "." + rawBody)`}
          </pre>
        </div>
      </details>

      <EndpointSheet
        form={form}
        onClose={() => setForm(null)}
        onSaved={(newSecret) => {
          setForm(null);
          if (newSecret) setSecret(newSecret);
          load();
        }}
      />
      <DeliveriesSheet endpoint={logFor} canManage={canManage} onClose={() => setLogFor(null)} />

      <SecretDialog open={!!secret} title={t('secretDialog.secretTitle')} value={secret} onDone={() => setSecret('')} />

      <ConfirmDialog
        open={confirm?.kind === 'rotate'}
        title={t('webhooks.rotateTitle')}
        body={t('webhooks.rotateBody')}
        confirmLabel={t('webhooks.rotate')}
        busyLabel={t('webhooks.rotating')}
        cancelLabel={t('cancel')}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const r = await authFetch<{ secret: string }>(`/webhooks/${confirm!.e.id}/rotate-secret`, { method: 'POST' });
          setConfirm(null);
          setSecret(r.secret);
          load();
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        title={t('webhooks.deleteTitle')}
        body={<span dir="auto">{t('webhooks.deleteBody', { url: iso(confirm?.e.url ?? '') })}</span>}
        confirmLabel={t('webhooks.delete')}
        busyLabel={t('webhooks.deleting')}
        cancelLabel={t('cancel')}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          await authFetch(`/webhooks/${confirm!.e.id}`, { method: 'DELETE' });
          setConfirm(null);
          load();
        }}
      />
    </div>
  );
}

function EndpointSheet({ form, onClose, onSaved }: { form: Form | null; onClose: () => void; onSaved: (secret?: string) => void }) {
  const { t } = useTranslation('integrations');
  const [f, setF] = useState<Form | null>(form);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (form) {
      setF({ ...form, events: [...form.events] });
      setErr('');
      setBusy(false);
    }
  }, [form]);

  if (!f) return <Sheet open={false} onClose={onClose} title="" closeLabel={t('close')}>{null}</Sheet>;

  const all = f.events.includes('*');
  const flip = (ev: string) => setF({ ...f, events: f.events.includes(ev) ? f.events.filter((x) => x !== ev) : [...f.events.filter((x) => x !== '*'), ev] });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f) return;
    setErr('');
    if (!f.url.trim()) return setErr(t('webhooks.form.needUrl'));
    if (!f.events.length) return setErr(t('webhooks.form.needEvents'));
    setBusy(true);
    const body = JSON.stringify({ url: f.url.trim(), description: f.description.trim() || undefined, events: f.events });
    try {
      const r = await authFetch<{ secret?: string }>(f.id ? `/webhooks/${f.id}` : '/webhooks', { method: f.id ? 'PATCH' : 'POST', body });
      onSaved(f.id ? undefined : r.secret);
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!form}
      onClose={onClose}
      closeLabel={t('close')}
      title={f.id ? t('webhooks.edit') : t('webhooks.add')}
      footer={
        <div className="flex items-center justify-end gap-2">
          {err && <p className="me-auto text-xs text-red-600 dark:text-red-400">{err}</p>}
          <button type="button" onClick={onClose} className="v-btn v-btn-ghost">
            {t('cancel')}
          </button>
          <button type="submit" form="endpoint-form" disabled={busy} className="v-btn disabled:opacity-60">
            {busy ? t('saving') : t('save')}
          </button>
        </div>
      }
    >
      <form id="endpoint-form" onSubmit={save} className="space-y-5">
        <Field label={t('webhooks.form.url')} hint={t('webhooks.form.urlHint')} htmlFor="wh-url">
          <input id="wh-url" dir="ltr" type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://example.com/hooks/vertex" className="v-field w-full font-mono text-sm rtl:text-right" />
        </Field>
        <Field label={t('webhooks.form.description')} htmlFor="wh-desc">
          <input id="wh-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={t('webhooks.form.descriptionPlaceholder')} maxLength={200} className="v-field w-full" />
        </Field>
        <div>
          <p className="mb-2 text-xs font-medium text-ink">{t('webhooks.form.events')}</p>
          <div className="rounded-lg ring-1 ring-inset ring-line">
            <Check label={t('events.all')} checked={all} onChange={() => setF({ ...f, events: all ? [] : ['*'] })} strong />
            {EVENT_GROUPS.map((g) => (
              <div key={g.key} className="border-t border-line px-1 py-1.5">
                <p className="px-2.5 pb-0.5 pt-1 text-xs text-faint">{t(`events.groups.${g.key}`)}</p>
                {g.events.map((ev) => (
                  <Check key={ev} label={eventLabel(t, ev)} hint={ev} checked={all || f.events.includes(ev)} disabled={all} onChange={() => flip(ev)} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </form>
    </Sheet>
  );
}

function Check({ label, hint, checked, disabled, strong, onChange }: { label: string; hint?: string; checked: boolean; disabled?: boolean; strong?: boolean; onChange: () => void }) {
  return (
    <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2.5 sm:min-h-9 ${strong ? 'px-3.5' : ''} ${disabled ? 'cursor-default opacity-60' : 'hover:bg-elevated'}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="h-4 w-4 shrink-0 accent-accent" />
      <span className={`flex-1 text-sm ${strong ? 'font-medium' : ''} text-ink`}>{label}</span>
      {hint && (
        <span dir="ltr" className="hidden font-mono text-2xs text-faint sm:inline">
          {hint}
        </span>
      )}
    </label>
  );
}

function DeliveriesSheet({ endpoint, canManage, onClose }: { endpoint: Endpoint | null; canManage: boolean; onClose: () => void }) {
  const { t } = useTranslation('integrations');
  const { locale } = useLocale();
  const [rows, setRows] = useState<Delivery[] | null>(null);
  const [busy, setBusy] = useState('');
  const [last, setLast] = useState<Endpoint | null>(endpoint);

  const load = useCallback((id: string) => {
    authFetch<Delivery[]>(`/webhooks/deliveries/log?endpointId=${id}`).then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(() => {
    if (!endpoint) return;
    setLast(endpoint);
    setRows(null);
    load(endpoint.id);
  }, [endpoint, load]);

  const e = endpoint ?? last;

  return (
    <Sheet
      open={!!endpoint}
      onClose={onClose}
      closeLabel={t('close')}
      title={t('webhooks.log.title')}
      subtitle={
        <span dir="ltr" className="block truncate font-mono rtl:text-right">
          {e?.url}
        </span>
      }
    >
      {!rows ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="v-skeleton h-14 rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{t('webhooks.log.empty')}</p>
      ) : (
        <ul className="-mx-5 divide-y divide-line">
          {rows.map((d) => (
            <li key={d.id} className="px-5 py-3">
              <div className="flex items-center gap-2">
                <span className={`v-badge ${d.status === 'SUCCESS' ? 'v-badge-success' : d.status === 'FAILED' ? 'v-badge-danger' : 'v-badge-neutral'}`}>
                  {t(`webhooks.log.status.${d.status}`)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{eventLabel(t, d.event)}</span>
                <span className="shrink-0 text-xs text-faint">{formatRelativeTime(d.createdAt, locale)}</span>
              </div>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                {d.responseStatus !== null && <span dir="ltr" className="font-mono">HTTP {d.responseStatus}</span>}
                <span>{t('webhooks.log.attempts', { count: d.attempts })}</span>
                {d.durationMs !== null && <span dir="ltr" className="tabular">{formatNumber(d.durationMs, locale)} ms</span>}
              </p>
              {d.error && !(d.responseStatus !== null && d.error.trim() === `HTTP ${d.responseStatus}`) && <p dir="auto" className="mt-1 break-words text-xs text-red-600 dark:text-red-400">{d.error}</p>}
              {d.status === 'FAILED' && canManage && (
                <button
                  onClick={async () => {
                    setBusy(d.id);
                    await authFetch(`/webhooks/deliveries/${d.id}/replay`, { method: 'POST' }).catch(() => {});
                    setTimeout(() => {
                      if (e) load(e.id);
                      setBusy('');
                    }, 1500);
                  }}
                  disabled={!!busy}
                  className="mt-2 flex h-8 items-center gap-1.5 text-xs font-medium text-accent hover:underline disabled:opacity-60"
                >
                  <Icon name="refresh" size={13} />
                  {busy === d.id ? t('webhooks.log.replaying') : t('webhooks.log.replay')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
