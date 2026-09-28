'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { formatRelativeTime } from '@/lib/format';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EVENT_GROUPS, Empty, Field, Intro, ListSkeleton, Notice, Toggle, eventLabel, type Handoff } from './shared';

type Operator = 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'exists' | 'not_exists' | 'gt' | 'lt';
type ActionType = 'notify' | 'task' | 'webhook';
interface Condition {
  field: string;
  operator: Operator | string;
  value?: unknown;
}
interface Action {
  type: ActionType | string;
  config: Record<string, unknown>;
}
interface Draft {
  id?: string;
  name: string;
  trigger: string;
  matchType: 'ALL' | 'ANY';
  conditions: Condition[];
  actions: Action[];
}
interface Automation extends Required<Omit<Draft, 'id'>> {
  id: string;
  enabled: boolean;
  runCount: number;
  lastRunAt: string | null;
}
interface Template extends Omit<Draft, 'id'> {
  key: string;
  description: string;
}
interface Run {
  id: string;
  automationId: string;
  event: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | string;
  results: { type: string; ok: boolean; detail: string }[] | null;
  createdAt: string;
}

const OPERATORS: Operator[] = ['equals', 'not_equals', 'contains', 'not_contains', 'exists', 'not_exists', 'gt', 'lt'];
const ACTIONS: ActionType[] = ['notify', 'task', 'webhook'];
const ACTION_ICON: Record<string, string> = { notify: 'bell', task: 'list', webhook: 'send' };

/** The fields an event's data carries, for the condition picker. */
function fieldsFor(trigger: string): string[] {
  if (trigger === 'lead.updated') return ['name', 'temperature', 'value', 'stageChanged'];
  if (trigger.startsWith('lead.') || trigger === 'meeting.requested' || trigger === 'quote.requested')
    return ['name', 'email', 'phone', 'company', 'source', 'intent', 'temperature', 'cardSlug'];
  if (trigger === 'card.viewed' || trigger === 'contact.saved') return ['slug'];
  if (trigger === 'nfc.tapped') return ['tagUid', 'cardSlug'];
  if (trigger === 'member.added') return ['email', 'role'];
  return [];
}

/** Template webhook URLs are placeholders; the owner types their own. */
const isPlaceholderUrl = (u: unknown) => typeof u === 'string' && /X{4}|example\.com/.test(u);

export function AutomationsView({ canManage, handoff, onHandled }: { canManage: boolean; handoff: Handoff; onHandled: () => void }) {
  const { t } = useTranslation('integrations');
  const { locale } = useLocale();
  const [items, setItems] = useState<Automation[] | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<Automation | null>(null);

  const load = useCallback(() => {
    authFetch<Automation[]>('/automations').then(setItems).catch((e) => setError((e as Error).message));
    authFetch<Run[]>('/automations/runs').then(setRuns).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    authFetch<{ templates: Template[] }>('/automations/templates').then((r) => setTemplates(r.templates)).catch(() => {});
  }, [load]);

  const fromTemplate = useCallback(
    (tpl: Template): Draft => ({
      name: t(`automations.templateNames.${tpl.key}`, { defaultValue: tpl.name }),
      trigger: tpl.trigger,
      matchType: tpl.matchType,
      conditions: tpl.conditions.map((c) => ({ ...c })),
      actions: tpl.actions.map((a) => ({ type: a.type, config: isPlaceholderUrl(a.config.url) ? { ...a.config, url: '' } : { ...a.config } })),
    }),
    [t],
  );

  // An app can send the owner here to start from a particular template.
  useEffect(() => {
    if (handoff?.kind !== 'automation' || !templates.length) return;
    const tpl = templates.find((x) => x.key === handoff.template);
    if (tpl && canManage) setDraft(fromTemplate(tpl));
    onHandled();
  }, [handoff, templates, canManage, fromTemplate, onHandled]);

  async function toggle(a: Automation) {
    setItems((list) => list?.map((x) => (x.id === a.id ? { ...x, enabled: !a.enabled } : x)) ?? list);
    await authFetch(`/automations/${a.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !a.enabled }) }).catch((e) => setError((e as Error).message));
    load();
  }

  const names = useMemo(() => new Map((items ?? []).map((a) => [a.id, a.name])), [items]);
  const blank = (): Draft => ({ name: '', trigger: 'lead.created', matchType: 'ALL', conditions: [], actions: [{ type: 'notify', config: {} }] });

  return (
    <div>
      <Intro
        text={t('automations.intro')}
        action={
          canManage && items && items.length > 0 ? (
            <button onClick={() => setDraft(blank())} className="v-btn">
              <Icon name="plus" size={14} /> {t('automations.new')}
            </button>
          ) : undefined
        }
      />
      {error && <Notice tone="danger" icon="x" onDismiss={() => setError('')}>{error}</Notice>}

      {!items ? (
        <ListSkeleton rows={3} />
      ) : items.length === 0 ? (
        <div>
          <Empty
            icon="sparkle"
            title={t('automations.emptyTitle')}
            body={t('automations.emptyBody')}
            action={
              canManage ? (
                <button onClick={() => setDraft(blank())} className="v-btn v-btn-ghost">
                  <Icon name="plus" size={14} /> {t('automations.new')}
                </button>
              ) : undefined
            }
          />
          {templates.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-3 text-[13px] font-semibold text-ink">{t('automations.templates')}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((tpl) => (
                  <button
                    key={tpl.key}
                    disabled={!canManage}
                    onClick={() => setDraft(fromTemplate(tpl))}
                    className="flex flex-col items-start rounded-xl bg-surface p-4 text-start ring-1 ring-inset ring-line transition-shadow enabled:hover:shadow-sm disabled:cursor-default"
                  >
                    <span className="flex gap-1.5 text-faint">
                      {tpl.actions.map((a, i) => (
                        <span key={i} className="flex h-7 w-7 items-center justify-center rounded-md bg-elevated">
                          <Icon name={ACTION_ICON[a.type] ?? 'sparkle'} size={14} />
                        </span>
                      ))}
                    </span>
                    <span className="mt-3 text-[14px] font-medium text-ink">{t(`automations.templateNames.${tpl.key}`, { defaultValue: tpl.name })}</span>
                    <span className="mt-1 text-[12.5px] leading-snug text-muted">{t(`automations.templateBodies.${tpl.key}`, { defaultValue: tpl.description })}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <ul className="v-card divide-y divide-line overflow-hidden">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
              <Toggle on={a.enabled} disabled={!canManage} label={t('automations.toggle', { name: a.name })} onChange={() => toggle(a)} />
              <button
                disabled={!canManage}
                onClick={() => setDraft({ id: a.id, name: a.name, trigger: a.trigger, matchType: a.matchType, conditions: a.conditions, actions: a.actions })}
                className="min-w-0 flex-1 text-start disabled:cursor-default"
              >
                <span className={`block truncate text-[14px] font-medium ${a.enabled ? 'text-ink' : 'text-muted'}`}>{a.name}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted">
                  <span>{eventLabel(t, a.trigger)}</span>
                  {a.conditions.length > 0 && <span className="text-faint">· {t('automations.conditions', { count: a.conditions.length })}</span>}
                  <Icon name="arrow" size={12} className="text-faint rtl:-scale-x-100" />
                  <span>{a.actions.map((x) => t(`automations.actions.${x.type}`, { defaultValue: x.type })).join(locale === 'ar' ? '، ' : ', ')}</span>
                </span>
              </button>
              <span className="hidden shrink-0 text-end text-[12.5px] text-faint sm:block">
                {a.runCount > 0 ? t('automations.runs', { count: a.runCount }) : t('automations.neverRan')}
                {a.lastRunAt && <span className="block">{t('automations.lastRun', { time: formatRelativeTime(a.lastRunAt, locale) })}</span>}
              </span>
              {canManage && (
                <ActionMenu
                  label={t('more')}
                  items={[
                    { key: 'edit', label: t('automations.edit'), icon: 'settings', onSelect: () => setDraft({ id: a.id, name: a.name, trigger: a.trigger, matchType: a.matchType, conditions: a.conditions, actions: a.actions }) },
                    { key: 'delete', label: t('automations.delete'), icon: 'trash', danger: true, separated: true, onSelect: () => setRemoving(a) },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {runs.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-[13px] font-semibold text-ink">{t('automations.recent')}</h2>
          <div className="v-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="v-table">
                <thead>
                  <tr>
                    <th>{t('automations.columns.automation')}</th>
                    <th className="hidden sm:table-cell">{t('automations.columns.event')}</th>
                    <th>{t('automations.columns.result')}</th>
                    <th className="!text-end">{t('automations.columns.when')}</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.slice(0, 12).map((r) => (
                    <tr key={r.id}>
                      <td className="max-w-0 w-full">
                        <span className="block truncate text-ink">{names.get(r.automationId) ?? t('automations.removed')}</span>
                      </td>
                      <td className="hidden whitespace-nowrap text-muted sm:table-cell">{eventLabel(t, r.event)}</td>
                      <td className="whitespace-nowrap">
                        <span className="flex items-center gap-2">
                          <span className={`v-badge ${r.status === 'SUCCESS' ? 'v-badge-success' : r.status === 'FAILED' ? 'v-badge-danger' : 'v-badge-warning'}`}>
                            {t(`automations.run.${r.status}`, { defaultValue: r.status })}
                          </span>
                          <span className="flex gap-1">
                            {(r.results ?? []).map((x, i) => (
                              <span key={i} title={x.detail} className={x.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                                <Icon name={ACTION_ICON[x.type] ?? 'sparkle'} size={13} />
                              </span>
                            ))}
                          </span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap !text-end text-faint">{formatRelativeTime(r.createdAt, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <Builder
        draft={draft}
        templates={templates}
        fromTemplate={fromTemplate}
        onClose={() => setDraft(null)}
        onSaved={() => {
          setDraft(null);
          load();
        }}
      />

      <ConfirmDialog
        open={!!removing}
        title={t('automations.deleteTitle', { name: removing?.name ?? '' })}
        body={t('automations.deleteBody')}
        confirmLabel={t('automations.delete')}
        busyLabel={t('automations.deleting')}
        cancelLabel={t('cancel')}
        danger
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          await authFetch(`/automations/${removing!.id}`, { method: 'DELETE' });
          setRemoving(null);
          load();
        }}
      />
    </div>
  );
}

/** When → only if → then, in a sheet. Creates, or edits when the draft has an id. */
function Builder({
  draft,
  templates,
  fromTemplate,
  onClose,
  onSaved,
}: {
  draft: Draft | null;
  templates: Template[];
  fromTemplate: (tpl: Template) => Draft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation('integrations');
  const [d, setD] = useState<Draft | null>(draft);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (draft) {
      setD(structuredClone(draft));
      setErr('');
      setBusy(false);
    }
  }, [draft]);

  if (!d) return <Sheet open={false} onClose={onClose} title="" closeLabel={t('close')}>{null}</Sheet>;

  const set = (patch: Partial<Draft>) => setD((x) => (x ? { ...x, ...patch } : x));
  const setCond = (i: number, patch: Partial<Condition>) => set({ conditions: d.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setAct = (i: number, patch: Partial<Action>) => set({ actions: d.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const fields = fieldsFor(d.trigger);
  const known = new Set(EVENT_GROUPS.flatMap((g) => g.events));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!d) return;
    setErr('');
    if (!d.name.trim()) return setErr(t('automations.form.needName'));
    if (!d.actions.length) return setErr(t('automations.form.needAction'));
    if (d.actions.some((a) => a.type === 'webhook' && !/^https:\/\/|^http:\/\/localhost/.test(String(a.config.url ?? '').trim()))) return setErr(t('automations.form.needUrl'));
    setBusy(true);
    const body = JSON.stringify({ name: d.name.trim(), trigger: d.trigger, matchType: d.matchType, conditions: d.conditions, actions: d.actions });
    try {
      await authFetch(d.id ? `/automations/${d.id}` : '/automations', { method: d.id ? 'PATCH' : 'POST', body });
      onSaved();
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!draft}
      onClose={onClose}
      closeLabel={t('close')}
      title={d.id ? t('automations.edit') : t('automations.new')}
      footer={
        <div className="flex items-center justify-end gap-2">
          {err && <p className="me-auto text-[12.5px] text-red-600 dark:text-red-400">{err}</p>}
          <button type="button" onClick={onClose} className="v-btn v-btn-ghost">
            {t('cancel')}
          </button>
          <button type="submit" form="automation-form" disabled={busy} className="v-btn disabled:opacity-60">
            {busy ? t('saving') : t('save')}
          </button>
        </div>
      }
    >
      <form id="automation-form" onSubmit={save} className="space-y-6">
        {!d.id && templates.length > 0 && (
          <Field label={t('automations.templates')} htmlFor="auto-template">
            <select
              id="auto-template"
              value=""
              onChange={(e) => {
                const tpl = templates.find((x) => x.key === e.target.value);
                if (tpl) setD(fromTemplate(tpl));
              }}
              className="v-field w-full"
            >
              <option value="">—</option>
              {templates.map((tpl) => (
                <option key={tpl.key} value={tpl.key}>
                  {t(`automations.templateNames.${tpl.key}`, { defaultValue: tpl.name })}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label={t('automations.form.name')} htmlFor="auto-name">
          <input id="auto-name" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder={t('automations.form.namePlaceholder')} maxLength={120} className="v-field w-full" />
        </Field>

        <Step n={1} title={t('automations.form.when')}>
          <select value={d.trigger} onChange={(e) => set({ trigger: e.target.value })} aria-label={t('automations.form.when')} className="v-field w-full">
            {EVENT_GROUPS.map((g) => (
              <optgroup key={g.key} label={t(`events.groups.${g.key}`)}>
                {g.events.map((ev) => (
                  <option key={ev} value={ev}>
                    {eventLabel(t, ev)}
                  </option>
                ))}
              </optgroup>
            ))}
            {!known.has(d.trigger) && <option value={d.trigger}>{d.trigger}</option>}
          </select>
        </Step>

        <Step n={2} title={t('automations.form.if')} hint={d.conditions.length === 0 ? t('automations.form.ifHint') : undefined}>
          {d.conditions.length > 1 && (
            <div role="radiogroup" className="mb-3 inline-flex rounded-lg bg-elevated p-0.5 ring-1 ring-inset ring-line">
              {(['ALL', 'ANY'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={d.matchType === m}
                  onClick={() => set({ matchType: m })}
                  className={`h-9 rounded-md px-3 text-[12.5px] font-medium sm:h-7 ${d.matchType === m ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'}`}
                >
                  {t(`automations.form.match.${m}`)}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-2">
            {d.conditions.map((c, i) => {
              const short = c.field.replace(/^data\./, '');
              const custom = !fields.includes(short);
              const needsValue = !['exists', 'not_exists'].includes(c.operator);
              return (
                <div key={i} className="rounded-lg p-3 ring-1 ring-inset ring-line">
                  <div className="flex items-center gap-2">
                    <select
                      value={custom ? '__other' : short}
                      onChange={(e) => setCond(i, { field: e.target.value === '__other' ? 'data.' : `data.${e.target.value}` })}
                      aria-label={t('automations.form.field')}
                      className="v-field min-w-0 flex-1"
                    >
                      {fields.map((f) => (
                        <option key={f} value={f}>
                          {t(`automations.fields.${f}`, { defaultValue: f })}
                        </option>
                      ))}
                      <option value="__other">{t('automations.form.otherField')}</option>
                    </select>
                    <button type="button" onClick={() => set({ conditions: d.conditions.filter((_, j) => j !== i) })} aria-label={t('automations.form.remove')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-faint hover:bg-elevated hover:text-ink">
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                  {custom && (
                    <input dir="ltr" value={c.field} onChange={(e) => setCond(i, { field: e.target.value })} placeholder={t('automations.form.fieldPath')} aria-label={t('automations.form.field')} className="v-field mt-2 w-full font-mono text-[13px] rtl:text-right" />
                  )}
                  <div className={`mt-2 grid gap-2 ${needsValue ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <select value={c.operator} onChange={(e) => setCond(i, { operator: e.target.value })} aria-label={t('automations.form.operator')} className="v-field min-w-0">
                      {OPERATORS.map((o) => (
                        <option key={o} value={o}>
                          {t(`automations.operators.${o}`)}
                        </option>
                      ))}
                    </select>
                    {needsValue && (
                      <input value={String(c.value ?? '')} onChange={(e) => setCond(i, { value: e.target.value })} placeholder={t('automations.form.value')} aria-label={t('automations.form.value')} className="v-field min-w-0" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <button type="button" onClick={() => set({ conditions: [...d.conditions, { field: `data.${fields[0] ?? ''}`, operator: 'equals', value: '' }] })} className="mt-2 flex h-9 items-center gap-1.5 text-[13px] font-medium text-accent hover:underline">
            <Icon name="plus" size={14} /> {t('automations.form.addCondition')}
          </button>
        </Step>

        <Step n={3} title={t('automations.form.then')} last>
          <div className="space-y-2">
            {d.actions.map((a, i) => (
              <div key={i} className="rounded-lg p-3 ring-1 ring-inset ring-line">
                <div className="flex items-center gap-2">
                  <div role="radiogroup" className="grid min-w-0 flex-1 grid-cols-3 rounded-lg bg-elevated p-0.5 ring-1 ring-inset ring-line">
                    {ACTIONS.map((type) => (
                      <button
                        key={type}
                        type="button"
                        role="radio"
                        aria-checked={a.type === type}
                        title={t(`automations.actions.${type}`)}
                        onClick={() => a.type !== type && setAct(i, { type, config: {} })}
                        className={`flex h-9 items-center justify-center gap-1.5 rounded-md px-1 text-[12px] font-medium sm:h-8 ${a.type === type ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'}`}
                      >
                        <Icon name={ACTION_ICON[type]} size={13} className="shrink-0" />
                        <span className="truncate">{t(`automations.actionsShort.${type}`)}</span>
                      </button>
                    ))}
                  </div>
                  {d.actions.length > 1 && (
                    <button type="button" onClick={() => set({ actions: d.actions.filter((_, j) => j !== i) })} aria-label={t('automations.form.remove')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-faint hover:bg-elevated hover:text-ink">
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </div>
                <div className="mt-3 space-y-2">
                  {a.type === 'webhook' ? (
                    <>
                      <input dir="ltr" value={String(a.config.url ?? '')} onChange={(e) => setAct(i, { config: { url: e.target.value } })} placeholder="https://hooks.slack.com/services/…" aria-label={t('automations.form.url')} className="v-field w-full font-mono text-[13px] rtl:text-right" />
                      <p className="text-[12px] leading-relaxed text-faint">{t('automations.form.urlHint')}</p>
                    </>
                  ) : (
                    <>
                      <input value={String(a.config.title ?? '')} onChange={(e) => setAct(i, { config: { ...a.config, title: e.target.value } })} placeholder={t('automations.form.title')} aria-label={t('automations.form.title')} className="v-field w-full" />
                      {a.type === 'notify' ? (
                        <input value={String(a.config.body ?? '')} onChange={(e) => setAct(i, { config: { ...a.config, body: e.target.value } })} placeholder={t('automations.form.message')} aria-label={t('automations.form.message')} className="v-field w-full" />
                      ) : (
                        <label className="flex items-center gap-3 whitespace-nowrap text-[13px] text-muted">
                          {t('automations.form.dueIn')}
                          <input
                            type="number"
                            min={0}
                            max={365}
                            value={a.config.dueInDays === undefined || a.config.dueInDays === '' ? '' : String(a.config.dueInDays)}
                            onChange={(e) => setAct(i, { config: { ...a.config, dueInDays: e.target.value === '' ? undefined : Number(e.target.value) } })}
                            className="v-field tabular !w-24"
                          />
                        </label>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => set({ actions: [...d.actions, { type: 'notify', config: {} }] })} className="mt-2 flex h-9 items-center gap-1.5 text-[13px] font-medium text-accent hover:underline">
            <Icon name="plus" size={14} /> {t('automations.form.addAction')}
          </button>
        </Step>
      </form>
    </Sheet>
  );
}

/** One numbered step of the builder, joined to the next by a line. */
function Step({ n, title, hint, last, children }: { n: number; title: string; hint?: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div className="relative flex gap-3">
      {!last && <span aria-hidden className="absolute bottom-[-18px] start-[11px] top-7 w-px bg-line" />}
      <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-elevated text-[12px] font-semibold text-muted ring-1 ring-inset ring-line">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="flex h-6 items-center text-[13px] font-semibold text-ink">{title}</p>
        {hint && <p className="mb-1 text-[12px] text-faint">{hint}</p>}
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}
