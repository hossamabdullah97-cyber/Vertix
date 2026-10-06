'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { authFetch, type Me } from '@/lib/client';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatDate, formatRelativeTime } from '@/lib/format';
import type { CreateTaskInput } from '@vertex/shared';
import {
  type Lead,
  type Stage,
  type Temp,
  type Task,
  type ActivityType,
  type LeadActivity,
  type LeadDetail,
  ACTIVITY_META,
  TASK_PRIORITY,
  LOGGABLE,
  stageKey,
  sourceMeta,
  quickLinks,
  waitingHours,
  waitingSpan,
  dueMeta,
  currencyLabel,
} from '@/lib/crm';
import { Heat } from './LeadCard';
import { MeetingRequest, meetingRequestOf } from './MeetingRequest';
import { ComposeMessage, type Channel, type ContactResult } from './ComposeMessage';
import { MentionInput, NoteText } from './MentionInput';
import { keptMentions, type Mention } from '@/lib/mentions';
import { CustomFieldsPanel } from './CustomFieldsPanel';
import { useCustomFields } from '@/lib/custom-fields';

const TEMPS: Temp[] = ['COLD', 'WARM', 'HOT'];

type LeadPatch = {
  stageId?: string | null;
  temperature?: Temp;
  value?: number;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  customFields?: Record<string, string | number | boolean | null>;
};

/**
 * Lead details in a panel beside the list. Stage, temperature, value and the
 * contact fields edit inline through PATCH /leads/:id; the activity log and
 * tasks are the lead's real records. Nothing here is kept only in the browser.
 */
export function LeadDrawer({
  lead,
  stages,
  tasks,
  busy,
  onClose,
  onPatch,
  onAddTask,
  onToggleTask,
  onContacted,
  duplicates = [],
  onReviewDuplicates,
  onManageFields,
}: {
  lead: Lead | null;
  stages: Stage[];
  tasks: Task[];
  busy?: boolean;
  onClose: () => void;
  onPatch: (patch: LeadPatch) => void;
  onAddTask: (input: CreateTaskInput) => Promise<void> | void;
  onToggleTask: (id: string, completed: boolean) => void;
  /** Someone reached out from the panel; the list updates its "waiting" flag. */
  onContacted?: (id: string, times: { firstContactedAt: string | null; lastContactedAt: string | null }) => void;
  /** Other leads that look like the same person. */
  duplicates?: Lead[];
  onReviewDuplicates?: () => void;
  /** Opens the workspace's field list, for those who may change it. */
  onManageFields?: () => void;
}) {
  const { t } = useTranslation('crm');

  // Escape closes the panel, as it does every other overlay.
  useEffect(() => {
    if (!lead) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lead, onClose]);

  return (
    <AnimatePresence>
      {lead && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-canvas/60"
          />
          <motion.aside
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            role="dialog"
            aria-modal="true"
            aria-label={t('drawer.ariaLabel')}
            className="fixed inset-y-0 end-0 z-50 flex w-full max-w-[460px] flex-col bg-surface shadow-2xl sm:inset-y-2 sm:end-2 sm:rounded-[14px] sm:ring-1 sm:ring-line"
          >
            <DrawerBody
              key={lead.id}
              lead={lead}
              stages={stages}
              tasks={tasks}
              busy={busy}
              onClose={onClose}
              onPatch={onPatch}
              onAddTask={onAddTask}
              onToggleTask={onToggleTask}
              onContacted={onContacted}
              duplicates={duplicates}
              onReviewDuplicates={onReviewDuplicates}
              onManageFields={onManageFields}
            />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function DrawerBody({
  lead,
  stages,
  tasks,
  busy,
  onClose,
  onPatch,
  onAddTask,
  onToggleTask,
  onContacted,
  duplicates,
  onReviewDuplicates,
  onManageFields,
}: {
  lead: Lead;
  stages: Stage[];
  tasks: Task[];
  busy?: boolean;
  onClose: () => void;
  onPatch: (patch: LeadPatch) => void;
  onAddTask: (input: CreateTaskInput) => Promise<void> | void;
  onToggleTask: (id: string, completed: boolean) => void;
  onContacted?: (id: string, times: { firstContactedAt: string | null; lastContactedAt: string | null }) => void;
  duplicates: Lead[];
  onReviewDuplicates?: () => void;
  onManageFields?: () => void;
}) {
  const { t } = useTranslation('crm');
  const { locale } = useLocale();
  const src = sourceMeta(lead.source);
  const sourceLabel = t(`sources.${lead.source}`, src.label);
  const links = quickLinks(lead);

  const stageName = (id?: string | null) => {
    const s = stages.find((st) => st.id === id);
    return s ? t(stageKey(s.name), s.name) : t('drawer.unassigned');
  };

  const [activeTab, setActiveTab] = useState<'info' | 'timeline' | 'tasks'>('info');

  // Inline edits commit on blur or Enter.
  const [editName, setEditName] = useState(lead.name || '');
  const [editEmail, setEditEmail] = useState(lead.email || '');
  const [editPhone, setEditPhone] = useState(lead.phone || '');
  const [editCompany, setEditCompany] = useState(lead.company || '');
  const [valueInput, setValueInput] = useState(lead.value ? String(lead.value) : '');

  useEffect(() => {
    setEditName(lead.name || '');
    setEditEmail(lead.email || '');
    setEditPhone(lead.phone || '');
    setEditCompany(lead.company || '');
    setValueInput(lead.value ? String(lead.value) : '');
  }, [lead.name, lead.email, lead.phone, lead.company, lead.value]);

  function commitValue() {
    const n = Math.max(0, Math.round(Number(valueInput) || 0));
    if (n !== lead.value) onPatch({ value: n });
  }

  function commitProfileField(field: 'name' | 'email' | 'phone' | 'company', currentVal: string) {
    const next = currentVal.trim() || null;
    if (next !== lead[field]) onPatch({ [field]: next });
  }

  // Activity history from GET /leads/:id.
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [loadingLog, setLoadingLog] = useState(true);
  const [logType, setLogType] = useState<ActivityType>('NOTE');
  const [logText, setLogText] = useState('');
  const [logging, setLogging] = useState(false);
  const [picked, setPicked] = useState<Mention[]>([]);
  // Who is reading: their own notes can be changed, and an admin can delete any.
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    authFetch<Me>('/auth/me').then(setMe, () => undefined);
  }, []);
  const [editing, setEditing] = useState<{ id: string; text: string; picked: Mention[] } | null>(null);
  const fields = useCustomFields();
  const canManageFields = me?.role === 'OWNER' || me?.role === 'ADMIN';

  useEffect(() => {
    let alive = true;
    setLoadingLog(true);
    authFetch<LeadDetail>(`/leads/${lead.id}`)
      .then((d) => {
        if (alive) setActivities(d.activities ?? []);
      })
      .catch(() => {
        if (alive) setActivities([]);
      })
      .finally(() => {
        if (alive) setLoadingLog(false);
      });
    return () => {
      alive = false;
    };
  }, [lead.id]);

  async function logActivity() {
    const note = logText.trim();
    if (!note || logging) return;
    setLogging(true);
    try {
      const mentions = logType === 'NOTE' ? keptMentions(note, picked).map((m) => m.id) : [];
      const created = await authFetch<LeadActivity>(`/leads/${lead.id}/activities`, {
        method: 'POST',
        body: JSON.stringify({ type: logType, note, ...(mentions.length ? { mentions } : {}) }),
      });
      setActivities((a) => [created, ...a]);
      setLogText('');
      setPicked([]);
    } catch {
      /* surfaced via the page-level error path on failure */
    } finally {
      setLogging(false);
    }
  }

  async function saveEdit() {
    if (!editing || !editing.text.trim()) return;
    const mentions = keptMentions(editing.text, editing.picked).map((m) => m.id);
    try {
      const updated = await authFetch<LeadActivity>(`/leads/${lead.id}/notes/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ note: editing.text.trim(), mentions }),
      });
      setActivities((list) => list.map((a) => (a.id === updated.id ? updated : a)));
      setEditing(null);
    } catch {
      /* the note stays as it was */
    }
  }

  async function deleteNote(a: LeadActivity) {
    if (!window.confirm(t('notes.confirmDelete'))) return;
    try {
      await authFetch(`/leads/${lead.id}/notes/${a.id}`, { method: 'DELETE' });
      setActivities((list) => list.filter((x) => x.id !== a.id));
    } catch {
      /* still there */
    }
  }

  const mentionsOf = (a: LeadActivity): Mention[] => {
    const m = (a.metadata ?? {}) as Record<string, unknown>;
    return Array.isArray(m.mentions) ? (m.mentions as Mention[]) : [];
  };

  function activityText(a: LeadActivity): string {
    const meta = (a.metadata ?? {}) as Record<string, unknown>;
    if (a.type === 'STAGE_CHANGE') return `${stageName(meta.from as string)} → ${stageName(meta.to as string)}`;
    if (a.type === 'MERGE') {
      const merged = (meta.merged as { name?: string | null; email?: string | null; phone?: string | null }[] | undefined) ?? [];
      const differing = (meta.differing as Record<string, string[]> | undefined) ?? {};
      const kept = Object.values(differing).flat();
      return [
        t('duplicates.mergedWith', { count: merged.length, names: merged.map((m) => m.name || m.email || m.phone).filter(Boolean).join(', ') }),
        kept.length ? t('duplicates.alsoKnown', { values: kept.join(', ') }) : '',
      ].filter(Boolean).join('\n');
    }
    return (meta.note as string) || '';
  }

  // Task composer
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [taskBusy, setTaskBusy] = useState(false);

  async function addTask() {
    const title = taskTitle.trim();
    if (!title || taskBusy) return;
    setTaskBusy(true);
    try {
      await onAddTask({ title, leadId: lead.id, dueDate: taskDue ? new Date(taskDue).toISOString() : undefined });
      setTaskTitle('');
      setTaskDue('');
    } finally {
      setTaskBusy(false);
    }
  }

  const openTasks = tasks.filter((tk) => !tk.completed).length;
  const meetingRequest = meetingRequestOf(activities);

  // Writing to the lead opens the composer; a call is logged as it is placed.
  const [compose, setCompose] = useState<Channel | null>(null);
  const contacted = (r: ContactResult) => {
    setActivities((a) => [r.activity, ...a]);
    onContacted?.(lead.id, { firstContactedAt: r.firstContactedAt, lastContactedAt: r.lastContactedAt });
  };
  function logCall() {
    authFetch<ContactResult>(`/leads/${lead.id}/contact`, { method: 'POST', body: JSON.stringify({ channel: 'CALL' }) })
      .then(contacted)
      .catch(() => undefined);
  }
  const waiting = waitingHours(lead);

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4 text-xs text-faint">
        <Icon name="inbox" size={14} />
        <span>{t('title')}</span>
        <span aria-hidden>/</span>
        <span className="min-w-0 truncate text-ink">{lead.name || t('table.unknownLead')}</span>
        <button
          onClick={onClose}
          className="ms-auto flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-elevated hover:text-ink sm:h-8 sm:w-8"
          aria-label={t('drawer.close')}
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto">
        {duplicates.length > 0 && (
          <div className="mx-5 mt-4 flex items-start gap-2.5 rounded-lg bg-amber-500/[0.08] px-3 py-2.5 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-500/25 dark:text-amber-200">
            <Icon name="users" size={14} className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">
              {t('duplicates.hint', { names: duplicates.map((d) => d.name || d.email || d.phone).join(locale === 'ar' ? '، ' : ', ') })}
            </span>
            {onReviewDuplicates && (
              <button type="button" onClick={onReviewDuplicates} className="shrink-0 font-medium underline underline-offset-2">
                {t('duplicates.review')}
              </button>
            )}
          </div>
        )}
        <div className="px-5 pb-4 pt-5">
          <div className="flex items-center gap-3.5">
            <Avatar user={{ id: lead.id, name: lead.name, email: lead.email }} size={44} />
            <div className="min-w-0 flex-1">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => commitProfileField('name', editName)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                placeholder={t('table.unknownLead')}
                className="w-full rounded-md bg-transparent text-xl font-semibold tracking-[-0.015em] text-ink outline-none placeholder:text-faint hover:bg-elevated focus:bg-elevated rtl:tracking-normal"
              />
              <p className="truncate text-sm text-muted">{[lead.company, sourceLabel].filter(Boolean).join(' · ')}</p>
            </div>
          </div>

          {links.length > 0 && (
            <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}>
              {links.map((l) => (
                <a
                  key={l.key}
                  href={l.href}
                  target={l.key === 'whatsapp' ? '_blank' : undefined}
                  rel="noreferrer"
                  onClick={(e) => {
                    if (l.key === 'call') return logCall();
                    e.preventDefault();
                    setCompose(l.key === 'whatsapp' ? 'WHATSAPP' : 'EMAIL');
                  }}
                  className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-[10px] py-2 text-xs font-medium text-muted ring-1 ring-inset ring-line transition-colors hover:bg-elevated hover:text-ink"
                >
                  <span className="text-ink">
                    <Icon name={l.icon} size={16} />
                  </span>
                  {t(`drawer.actions.${l.key}`, l.label)}
                </a>
              ))}
            </div>
          )}

          {waiting !== null ? (
            <p className="mt-3 flex items-center gap-2 rounded-[10px] bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-100 dark:ring-amber-500/20">
              <Icon name="clock" size={14} className="shrink-0" />
              {t('waiting.banner', { span: waitingSpan(waiting, t) })}
            </p>
          ) : lead.lastContactedAt ? (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
              <Icon name="check" size={13} className="shrink-0" />
              {t('waiting.lastContact', { when: formatRelativeTime(lead.lastContactedAt, locale) })}
            </p>
          ) : null}

          {!loadingLog && meetingRequest && (
            <MeetingRequest
              lead={lead}
              request={meetingRequest}
              onChange={(updated) => setActivities((list) => list.map((a) => (a.id === updated.id ? updated : a)))}
            />
          )}
        </div>

        <div role="tablist" className="flex gap-5 border-b border-line px-5">
          {(['info', 'timeline', 'tasks'] as const).map((tab) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab)}
                className={`relative flex min-h-11 min-w-11 items-center justify-center gap-1.5 text-sm font-medium transition-colors sm:min-h-10 ${
                  active ? 'text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {t(`drawer.tabs.${tab}`)}
                {tab === 'tasks' && openTasks > 0 && <span className="tabular text-xs text-faint">{openTasks}</span>}
                {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink" />}
              </button>
            );
          })}
        </div>

        <div className="px-5 py-5">
          {activeTab === 'info' && (
            <dl className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-x-3 gap-y-3 text-sm">
              <dt className="text-faint">{t('drawer.stageLabel')}</dt>
              <dd>
                <select
                  value={lead.stageId ?? ''}
                  disabled={busy}
                  onChange={(e) => e.target.value && onPatch({ stageId: e.target.value })}
                  className="v-field !h-11 !w-auto !pe-8 !text-sm sm:!h-8"
                >
                  {!lead.stageId && <option value="">{t('drawer.unassigned')}</option>}
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {t(stageKey(s.name), s.name)}
                    </option>
                  ))}
                </select>
              </dd>

              <dt className="text-faint">{t('drawer.tempLabel')}</dt>
              <dd>
                <div className="inline-flex rounded-lg bg-elevated p-0.5 ring-1 ring-inset ring-line">
                  {TEMPS.map((tp) => {
                    const active = lead.temperature === tp;
                    return (
                      <button
                        key={tp}
                        disabled={busy}
                        aria-pressed={active}
                        onClick={() => !active && onPatch({ temperature: tp })}
                        className={`flex h-11 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors disabled:opacity-50 sm:h-7 ${
                          active ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'
                        }`}
                      >
                        <Heat temp={tp} />
                        {t(`temperature.${tp.toLowerCase()}`)}
                      </button>
                    );
                  })}
                </div>
              </dd>

              <dt className="text-faint">{t('drawer.dealValue')}</dt>
              <dd className="flex items-center gap-1.5">
                <span className="shrink-0 text-muted">{currencyLabel(locale)}</span>
                <input
                  type="number"
                  min={0}
                  dir="ltr"
                  value={valueInput}
                  onChange={(e) => setValueInput(e.target.value)}
                  onBlur={commitValue}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  placeholder="0"
                  disabled={busy}
                  className="tabular h-11 w-full rounded-md bg-transparent px-1.5 text-sm font-medium text-ink outline-none placeholder:text-faint hover:bg-elevated focus:bg-elevated rtl:text-right sm:h-8"
                />
              </dd>

              <dt className="col-span-2 mt-3 border-t border-line pt-4 text-xs font-medium text-faint">{t('drawer.contactDetails')}</dt>
              <EditableField icon="mail" label={t('drawer.email')} value={editEmail} onChange={setEditEmail} onCommit={() => commitProfileField('email', editEmail)} placeholder={t('drawer.emailPlaceholder')} dir="ltr" />
              <EditableField icon="phone" label={t('drawer.phone')} value={editPhone} onChange={setEditPhone} onCommit={() => commitProfileField('phone', editPhone)} placeholder={t('drawer.phonePlaceholder')} dir="ltr" />
              <EditableField icon="briefcase" label={t('drawer.company')} value={editCompany} onChange={setEditCompany} onCommit={() => commitProfileField('company', editCompany)} placeholder={t('drawer.companyPlaceholder')} />

              <dt className="col-span-2 mt-3 border-t border-line pt-4 text-xs font-medium text-faint">{t('drawer.more')}</dt>
              <dt className="text-faint">{t('drawer.sourceLink')}</dt>
              <dd className="flex items-center gap-1.5 text-ink">
                <span className="text-faint">
                  <Icon name={src.icon} size={13} />
                </span>
                {sourceLabel}
              </dd>
              {lead.card?.slug && (
                <>
                  <dt className="text-faint">{t('drawer.card')}</dt>
                  <dd dir="ltr" className="truncate text-start font-mono text-xs text-muted rtl:text-right">
                    /c/{lead.card.slug}
                  </dd>
                </>
              )}
              <dt className="text-faint">{t('drawer.leadScore')}</dt>
              <dd className="tabular text-ink">{lead.score}</dd>
            </dl>
          )}
          {activeTab === 'info' && fields && (
            <CustomFieldsPanel
              fields={fields}
              values={lead.customFields}
              busy={!!busy}
              onChange={(id, value) => onPatch({ customFields: { [id]: value } })}
              onManage={canManageFields && onManageFields ? onManageFields : undefined}
            />
          )}

          {activeTab === 'timeline' && (
            <>
              <div className="rounded-[10px] ring-1 ring-inset ring-line">
                <div className="flex gap-1 border-b border-line p-1.5">
                  {LOGGABLE.map((tp) => {
                    const meta = ACTIVITY_META[tp];
                    const active = logType === tp;
                    return (
                      <button
                        key={tp}
                        onClick={() => setLogType(tp)}
                        aria-pressed={active}
                        className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors sm:min-h-7 ${
                          active ? 'bg-elevated text-ink ring-1 ring-inset ring-line' : 'text-muted hover:text-ink'
                        }`}
                      >
                        <Icon name={meta.icon} size={12} /> {t(`activity.types.${tp}`, meta.label)}
                      </button>
                    );
                  })}
                </div>
                {logType === 'NOTE' ? (
                  <MentionInput
                    leadId={lead.id}
                    value={logText}
                    onChange={setLogText}
                    picked={picked}
                    onPick={setPicked}
                    onSubmit={logActivity}
                    placeholder={t('notes.placeholder')}
                    className="block w-full resize-none bg-transparent px-3 py-2.5 text-sm text-ink outline-none placeholder:text-faint"
                  />
                ) : (
                  <textarea
                    value={logText}
                    onChange={(e) => setLogText(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') logActivity();
                    }}
                    placeholder={t('drawer.addActivity', { type: t(`activity.types.${logType}`, ACTIVITY_META[logType].label).toLowerCase() })}
                    rows={3}
                    className="block w-full resize-none bg-transparent px-3 py-2.5 text-sm text-ink outline-none placeholder:text-faint"
                  />
                )}
                <div className="flex items-center justify-between border-t border-line px-3 py-2">
                  <span className="text-2xs text-faint">{logType === 'NOTE' ? t('notes.hint') : '⌘/Ctrl + Enter'}</span>
                  <button onClick={logActivity} disabled={!logText.trim() || logging} className="v-btn !h-11 !px-3 !text-xs sm:!h-7">
                    {logging ? t('drawer.saving') : t('drawer.log')}
                  </button>
                </div>
              </div>

              {loadingLog ? (
                <div className="mt-5 space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="v-skeleton h-9 w-full" />
                  ))}
                </div>
              ) : (
                <ol className="relative mt-5 space-y-4">
                  <span className="absolute inset-y-2 start-[11px] w-px bg-line" aria-hidden />
                  {activities.map((a) => {
                    const meta = ACTIVITY_META[a.type];
                    const body = activityText(a);
                    const m = (a.metadata ?? {}) as Record<string, unknown>;
                    const mine = !!me && m.by === me.sub;
                    const isNote = a.type === 'NOTE' && m.manual === true;
                    const canDelete = isNote && (mine || me?.role === 'OWNER' || me?.role === 'ADMIN');
                    return (
                      <li key={a.id} className="group relative flex items-start gap-3" data-testid="activity">
                        <span className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-line">
                          <Icon name={meta.icon} size={11} />
                        </span>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="min-w-0 truncate text-sm font-medium text-ink">
                              {t(`activity.types.${a.type}`, meta.label)}
                              {a.author && <span className="font-normal text-muted"> · {mine ? t('notes.you') : a.author.name}</span>}
                            </p>
                            <span className="shrink-0 text-xs text-faint">
                              {typeof m.editedAt === 'string' && <span className="me-1">{t('notes.edited')} ·</span>}
                              {formatRelativeTime(a.createdAt, locale, 'narrow')}
                            </span>
                          </div>
                          {editing?.id === a.id ? (
                            <div className="mt-1 rounded-lg ring-1 ring-inset ring-line">
                              <MentionInput
                                leadId={lead.id}
                                value={editing.text}
                                onChange={(text) => setEditing((e) => e && { ...e, text })}
                                picked={editing.picked}
                                onPick={(p) => setEditing((e) => e && { ...e, picked: p })}
                                onSubmit={saveEdit}
                                placeholder={t('notes.placeholder')}
                                autoFocus
                                className="block w-full resize-none bg-transparent px-3 py-2 text-xs leading-relaxed text-ink outline-none"
                              />
                              <div className="flex justify-end gap-2 border-t border-line px-2 py-1.5">
                                <button type="button" onClick={() => setEditing(null)} className="v-btn v-btn-ghost !h-8 !px-2.5 !text-xs">
                                  {t('notes.cancel')}
                                </button>
                                <button type="button" onClick={saveEdit} disabled={!editing.text.trim()} className="v-btn !h-8 !px-2.5 !text-xs">
                                  {t('notes.save')}
                                </button>
                              </div>
                            </div>
                          ) : (
                            body && (
                              <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-elevated px-3 py-2 text-xs leading-relaxed text-muted ring-1 ring-inset ring-line" dir="auto">
                                <NoteText text={body} mentions={mentionsOf(a)} me={me?.sub} />
                              </p>
                            )
                          )}
                          {isNote && editing?.id !== a.id && (mine || canDelete) && (
                            <div className="mt-1 flex gap-3 text-xs">
                              {mine && (
                                <button type="button" onClick={() => setEditing({ id: a.id, text: body, picked: mentionsOf(a) })} className="text-muted hover:text-ink">
                                  {t('notes.edit')}
                                </button>
                              )}
                              {canDelete && (
                                <button type="button" onClick={() => deleteNote(a)} className="text-muted hover:text-red-600">
                                  {t('notes.delete')}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                  <li className="relative flex items-start gap-3">
                    <span className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-line">
                      <Icon name="user-plus" size={11} />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-sm font-medium text-ink">{t('drawer.leadCreated')}</p>
                      <p className="text-xs text-faint">
                        {t('drawer.createdVia', {
                          source: sourceLabel,
                          date: formatDate(lead.createdAt, locale, { year: 'numeric', month: 'short', day: 'numeric' }),
                        })}
                      </p>
                    </div>
                  </li>
                </ol>
              )}
            </>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-4">
              <div className="rounded-[10px] p-2.5 ring-1 ring-inset ring-line">
                <input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addTask();
                  }}
                  placeholder={t('drawer.addTaskPlaceholder')}
                  className="h-9 w-full bg-transparent px-1.5 text-sm text-ink outline-none placeholder:text-faint"
                />
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <input
                    type="date"
                    value={taskDue}
                    onChange={(e) => setTaskDue(e.target.value)}
                    className="h-11 rounded-md bg-elevated px-2.5 text-xs text-muted outline-none ring-1 ring-inset ring-line focus:ring-accent sm:h-7"
                  />
                  <button onClick={addTask} disabled={!taskTitle.trim() || taskBusy} className="v-btn !h-11 !px-3 !text-xs sm:!h-7">
                    <Icon name="plus" size={12} /> {t('drawer.addTask')}
                  </button>
                </div>
              </div>

              {tasks.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">{t('drawer.noTasks')}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {tasks.map((tk) => {
                    const pr = TASK_PRIORITY[tk.priority];
                    const due = dueMeta(tk.dueDate);
                    const toneColor = due.tone === 'overdue' ? '#c8322a' : due.tone === 'today' ? '#b86e0a' : 'hsl(var(--v-faint))';
                    return (
                      <li key={tk.id} className="flex min-h-11 items-center gap-3 py-1.5">
                        <button
                          onClick={() => onToggleTask(tk.id, !tk.completed)}
                          aria-pressed={tk.completed}
                          className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] transition-colors ${
                            tk.completed ? 'bg-accent text-white' : 'ring-1 ring-inset ring-faint/50 hover:ring-faint'
                          }`}
                        >
                          {tk.completed && <Icon name="check" size={12} />}
                        </button>
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: pr.color }} title={pr.label} />
                        <p className={`min-w-0 flex-1 truncate text-sm ${tk.completed ? 'text-faint line-through' : 'text-ink'}`}>{tk.title}</p>
                        {tk.dueDate && (
                          <span className="shrink-0 text-xs font-medium" style={{ color: tk.completed ? 'hsl(var(--v-faint))' : toneColor }}>
                            {due.label}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
      <AnimatePresence>
        {compose && <ComposeMessage key={compose} lead={lead} initial={compose} onClose={() => setCompose(null)} onSent={contacted} />}
      </AnimatePresence>
    </>
  );
}

function EditableField({
  icon,
  label,
  value,
  onChange,
  onCommit,
  placeholder,
  dir,
}: {
  icon: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  placeholder?: string;
  dir?: 'ltr' | 'rtl';
}) {
  return (
    <>
      <dt className="flex items-center gap-2 text-faint">
        <Icon name={icon} size={13} />
        {label}
      </dt>
      <dd>
        <input
          value={value}
          dir={dir}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          placeholder={placeholder}
          className={`h-11 w-full rounded-md bg-transparent px-1.5 text-start text-sm text-ink outline-none placeholder:text-faint hover:bg-elevated focus:bg-elevated sm:h-8 ${dir === 'ltr' ? 'rtl:text-right' : ''}`}
        />
      </dd>
    </>
  );
}
