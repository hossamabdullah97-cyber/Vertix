'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { INCIDENT_IMPACTS, INCIDENT_STATUSES, STATUS_COMPONENTS, type IncidentImpact, type IncidentStatus, type StatusComponentId, type StatusIncidentView } from '@vertex/shared';
import { authFetch } from '@/lib/client';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { STATE_TONE, STATUS_STRINGS } from '@/lib/status';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { Notice } from './shared';

type Check = { id: StatusComponentId; status: 'OPERATIONAL' | 'DEGRADED' | 'OUTAGE'; latencyMs: number | null; detail: string | null; checkedAt: string };

const blank = { title: '', titleAr: '', impact: 'MINOR' as IncidentImpact, components: [] as StatusComponentId[], message: '', messageAr: '', startsAt: '', endsAt: '' };

/** datetime-local value → ISO, in the admin's own time zone. */
const toIso = (v: string) => (v ? new Date(v).toISOString() : undefined);

/**
 * The status page from behind: what the automatic checks found, and posting
 * about an outage or planned maintenance, then updating it until resolved.
 */
export function Status() {
  const { t } = useTranslation('admin');
  const { locale } = useLocale();
  const s = STATUS_STRINGS[locale === 'ar' ? 'ar' : 'en'];
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [incidents, setIncidents] = useState<StatusIncidentView[] | null>(null);
  const [form, setForm] = useState<typeof blank | null>(null);
  const [open, setOpen] = useState<StatusIncidentView | null>(null);
  const [update, setUpdate] = useState({ status: 'MONITORING' as IncidentStatus, message: '', messageAr: '' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [c, i] = await Promise.all([authFetch<Check[]>('/admin/status/checks'), authFetch<StatusIncidentView[]>('/admin/status/incidents')]);
    setChecks(c);
    setIncidents(i);
    return i;
  }, []);

  useEffect(() => {
    load().catch((e) => setError((e as Error).message));
  }, [load]);

  async function run<T>(key: string, fn: () => Promise<T>) {
    setBusy(key);
    setError('');
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy('');
    }
  }

  const runChecks = () => run('checks', async () => setChecks(await authFetch<Check[]>('/admin/status/checks', { method: 'POST' })));

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    void run('create', async () => {
      await authFetch('/admin/status/incidents', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          status: form.impact === 'MAINTENANCE' ? 'SCHEDULED' : 'INVESTIGATING',
          startsAt: form.impact === 'MAINTENANCE' ? toIso(form.startsAt) : undefined,
          endsAt: form.impact === 'MAINTENANCE' ? toIso(form.endsAt) : undefined,
        }),
      });
      setForm(null);
      await load();
    });
  };

  const postUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!open) return;
    void run('update', async () => {
      const next = await authFetch<StatusIncidentView>(`/admin/status/incidents/${open.id}/updates`, { method: 'POST', body: JSON.stringify(update) });
      setOpen(next);
      setUpdate({ status: next.status === 'RESOLVED' ? 'RESOLVED' : 'MONITORING', message: '', messageAr: '' });
      await load();
    });
  };

  const remove = (i: StatusIncidentView) => {
    if (!window.confirm(t('status.confirmDelete', { title: i.title }))) return;
    void run('delete', async () => {
      await authFetch(`/admin/status/incidents/${i.id}`, { method: 'DELETE' });
      setOpen(null);
      await load();
    });
  };

  const formReady = form && form.title.trim().length >= 3 && form.message.trim().length >= 2 && form.components.length > 0 && (form.impact !== 'MAINTENANCE' || (form.startsAt && form.endsAt));

  return (
    <div className="max-w-[1180px] space-y-8">
      <p className="text-sm text-muted">{t('status.intro')}</p>
      {error && (
        <Notice tone="danger" onDismiss={() => setError('')}>
          {error}
        </Notice>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">{t('status.checks')}</h2>
          <div className="flex gap-2">
            <a href="/status" target="_blank" rel="noreferrer" className="v-btn v-btn-ghost">
              <Icon name="external-link" size={14} /> {t('status.openPage')}
            </a>
            <button type="button" onClick={runChecks} disabled={busy === 'checks'} className="v-btn disabled:opacity-50">
              <Icon name="refresh" size={14} /> {t('status.runChecks')}
            </button>
          </div>
        </div>
        {!checks ? (
          <div className="v-skeleton h-40 rounded-xl" />
        ) : checks.length === 0 ? (
          <p className="rounded-xl py-8 text-center text-sm text-muted ring-1 ring-inset ring-line">{t('status.noChecks')}</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl ring-1 ring-inset ring-line" data-testid="status-checks">
            {checks.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATE_TONE[c.status].dot}`} aria-hidden />
                <span className="min-w-[160px] flex-1 font-medium text-ink">{s.components[c.id].name}</span>
                <span className={`text-xs font-medium ${STATE_TONE[c.status].text}`}>{s.state[c.status]}</span>
                {c.latencyMs !== null && <span className="tabular text-xs text-faint">{c.latencyMs} ms</span>}
                {c.detail && (
                  <bdi className="text-xs text-muted" dir="ltr">
                    {c.detail}
                  </bdi>
                )}
                <span className="text-xs text-faint">{formatRelativeTime(c.checkedAt, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">{t('status.incidents')}</h2>
          <button type="button" onClick={() => setForm({ ...blank })} className="v-btn v-btn-primary">
            <Icon name="plus" size={14} /> {t('status.new')}
          </button>
        </div>
        {!incidents ? (
          <div className="v-skeleton h-40 rounded-xl" />
        ) : incidents.length === 0 ? (
          <p className="rounded-xl py-8 text-center text-sm text-muted ring-1 ring-inset ring-line">{t('status.noIncidents')}</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl ring-1 ring-inset ring-line">
            {incidents.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  data-testid="incident-row"
                  onClick={() => {
                    setOpen(i);
                    setUpdate({ status: i.status === 'SCHEDULED' ? 'IDENTIFIED' : i.status === 'RESOLVED' ? 'RESOLVED' : 'MONITORING', message: '', messageAr: '' });
                  }}
                  className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-start text-sm hover:bg-elevated"
                >
                  <span className="min-w-[200px] flex-1 font-medium text-ink" dir="auto">
                    {i.title}
                  </span>
                  <span className="v-badge">{s.impact[i.impact]}</span>
                  <span className={`v-badge ${i.status === 'RESOLVED' ? 'v-badge-success' : 'v-badge-warning'}`}>{s.status[i.status]}</span>
                  <span className="text-xs text-faint">{formatRelativeTime(i.createdAt, locale)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Sheet open={!!form} onClose={() => setForm(null)} closeLabel={t('status.close')} title={t('status.new')} subtitle={t('status.newHint')}>
        {form && (
          <form onSubmit={create} className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t('status.impact')}>
              {INCIDENT_IMPACTS.map((imp) => (
                <button
                  key={imp}
                  type="button"
                  role="radio"
                  aria-checked={form.impact === imp}
                  onClick={() => setForm({ ...form, impact: imp })}
                  className={`rounded-lg px-3 py-2 text-sm ring-1 ring-inset ${form.impact === imp ? 'bg-accent/10 font-medium text-accent ring-accent/40' : 'text-muted ring-line hover:bg-elevated'}`}
                >
                  {s.impact[imp]}
                </button>
              ))}
            </div>
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-ink">{t('status.components')}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {STATUS_COMPONENTS.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={form.components.includes(c)}
                      onChange={(e) => setForm({ ...form, components: e.target.checked ? [...form.components, c] : form.components.filter((x) => x !== c) })}
                    />
                    {s.components[c].name}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink">{t('status.title')}</span>
              <input className="v-field w-full" dir="ltr" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={160} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink">{t('status.titleAr')}</span>
              <input className="v-field w-full" dir="rtl" value={form.titleAr} onChange={(e) => setForm({ ...form, titleAr: e.target.value })} maxLength={160} />
            </label>
            {form.impact === 'MAINTENANCE' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-ink">{t('status.startsAt')}</span>
                  <input type="datetime-local" className="v-field w-full" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-ink">{t('status.endsAt')}</span>
                  <input type="datetime-local" className="v-field w-full" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
                </label>
              </div>
            )}
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink">{t('status.message')}</span>
              <textarea className="v-field min-h-[96px] w-full" dir="ltr" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength={2000} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink">{t('status.messageAr')}</span>
              <textarea className="v-field min-h-[96px] w-full" dir="rtl" value={form.messageAr} onChange={(e) => setForm({ ...form, messageAr: e.target.value })} maxLength={2000} />
            </label>
            <button className="v-btn v-btn-primary disabled:opacity-50" disabled={!formReady || busy === 'create'}>
              {t('status.publish')}
            </button>
          </form>
        )}
      </Sheet>

      <Sheet open={!!open} onClose={() => setOpen(null)} closeLabel={t('status.close')} title={open ? <bdi>{open.title}</bdi> : ''} subtitle={open ? `${s.impact[open.impact]} · ${s.status[open.status]}` : undefined}>
        {open && (
          <>
            <ol className="space-y-3 border-s-2 border-line ps-4">
              {open.updates.map((u) => (
                <li key={u.id}>
                  <p className="text-xs text-faint">
                    <span className="font-medium text-ink">{s.status[u.status]}</span> · {formatDateTime(u.createdAt, locale)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted" dir="auto">
                    {u.message}
                  </p>
                  {u.messageAr && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted" dir="rtl">
                      {u.messageAr}
                    </p>
                  )}
                </li>
              ))}
            </ol>
            {open.status !== 'RESOLVED' && (
              <form onSubmit={postUpdate} className="mt-6 space-y-3 rounded-xl p-4 ring-1 ring-inset ring-line">
                <h3 className="text-sm font-semibold text-ink">{t('status.postUpdate')}</h3>
                <select className="v-field w-full" aria-label={t('status.newStatus')} value={update.status} onChange={(e) => setUpdate({ ...update, status: e.target.value as IncidentStatus })}>
                  {INCIDENT_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {s.status[st]}
                    </option>
                  ))}
                </select>
                <textarea
                  className="v-field min-h-[80px] w-full"
                  dir="ltr"
                  aria-label={t('status.message')}
                  placeholder={t('status.message')}
                  value={update.message}
                  onChange={(e) => setUpdate({ ...update, message: e.target.value })}
                />
                <textarea
                  className="v-field min-h-[80px] w-full"
                  dir="rtl"
                  aria-label={t('status.messageAr')}
                  placeholder={t('status.messageAr')}
                  value={update.messageAr}
                  onChange={(e) => setUpdate({ ...update, messageAr: e.target.value })}
                />
                <button className="v-btn v-btn-primary disabled:opacity-50" disabled={update.message.trim().length < 2 || busy === 'update'}>
                  {t('status.post')}
                </button>
              </form>
            )}
            <button type="button" onClick={() => remove(open)} disabled={busy === 'delete'} className="mt-6 text-xs font-medium text-red-600 hover:underline">
              {t('status.delete')}
            </button>
          </>
        )}
      </Sheet>
    </div>
  );
}
