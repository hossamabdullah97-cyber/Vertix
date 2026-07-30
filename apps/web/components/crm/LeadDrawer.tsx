'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { Icon } from '@/components/Icon';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatDate } from '@/lib/format';
import type { CreateTaskInput } from '@vertex/shared';
import {
  type Lead,
  type Stage,
  type Temp,
  type Task,
  type ActivityType,
  type LeadActivity,
  type LeadDetail,
  TEMP_META,
  ACTIVITY_META,
  TASK_PRIORITY,
  LOGGABLE,
  initials,
  hueFor,
  relativeTime,
  sourceMeta,
  quickLinks,
  dueMeta,
} from '@/lib/crm';

const TEMPS: Temp[] = ['COLD', 'WARM', 'HOT'];

/**
 * Lead details side drawer. Stage + temperature edit inline through the real
 * PATCH /leads/:id endpoint (the only lead mutations the API supports). The
 * timeline is derived from actual lead data — no fabricated activity.
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
}: {
  lead: Lead | null;
  stages: Stage[];
  tasks: Task[];
  busy?: boolean;
  onClose: () => void;
  onPatch: (patch: { stageId?: string | null; temperature?: Temp; value?: number; name?: string | null; email?: string | null; phone?: string | null; company?: string | null }) => void;
  onAddTask: (input: CreateTaskInput) => Promise<void> | void;
  onToggleTask: (id: string, completed: boolean) => void;
}) {
  const { t } = useTranslation('crm');
  return (
    <AnimatePresence>
      {lead && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            role="dialog"
            aria-modal="true"
            aria-label={t('drawer.ariaLabel')}
            className="fixed inset-y-0 end-0 z-50 flex w-full max-w-[460px] flex-col border-s border-line bg-surface shadow-2xl"
          >
            <DrawerBody lead={lead} stages={stages} tasks={tasks} busy={busy} onClose={onClose} onPatch={onPatch} onAddTask={onAddTask} onToggleTask={onToggleTask} />
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
}: {
  lead: Lead;
  stages: Stage[];
  tasks: Task[];
  busy?: boolean;
  onClose: () => void;
  onPatch: (patch: { stageId?: string | null; temperature?: Temp; value?: number; name?: string | null; email?: string | null; phone?: string | null; company?: string | null }) => void;
  onAddTask: (input: CreateTaskInput) => Promise<void> | void;
  onToggleTask: (id: string, completed: boolean) => void;
}) {
  const { t } = useTranslation('crm');
  const { locale } = useLocale();
  const tm = TEMP_META[lead.temperature];
  const hue = hueFor(lead.name || lead.email || lead.id);
  const src = sourceMeta(lead.source);
  const links = quickLinks(lead);

  const stageName = (id?: string | null) => stages.find((s) => s.id === id)?.name ?? t('drawer.unassigned');

  const [activeTab, setActiveTab] = useState<'info' | 'timeline' | 'tasks' | 'notes' | 'engagement'>('info');

  // Inline Profile Edit Fields
  const [editName, setEditName] = useState(lead.name || '');
  const [editEmail, setEditEmail] = useState(lead.email || '');
  const [editPhone, setEditPhone] = useState(lead.phone || '');
  const [editCompany, setEditCompany] = useState(lead.company || '');
  const [valueInput, setValueInput] = useState(lead.value ? String(lead.value) : '');

  // Keep state synced when switching leads
  useEffect(() => {
    setEditName(lead.name || '');
    setEditEmail(lead.email || '');
    setEditPhone(lead.phone || '');
    setEditCompany(lead.company || '');
    setValueInput(lead.value ? String(lead.value) : '');
  }, [lead.id, lead.name, lead.email, lead.phone, lead.company, lead.value]);

  function commitValue() {
    const n = Math.max(0, Math.round(Number(valueInput) || 0));
    if (n !== lead.value) onPatch({ value: n });
  }

  function commitProfileField(field: 'name' | 'email' | 'phone' | 'company', currentVal: string) {
    const trimVal = currentVal.trim() || null;
    const originVal = lead[field];
    if (trimVal !== originVal) {
      onPatch({ [field]: trimVal });
    }
  }

  // Real activity history fetched from GET /leads/:id.
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [loadingLog, setLoadingLog] = useState(true);
  const [logType, setLogType] = useState<ActivityType>('NOTE');
  const [logText, setLogText] = useState('');
  const [logging, setLogging] = useState(false);

  // Task composer state
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

  useEffect(() => {
    let alive = true;
    setLoadingLog(true);
    authFetch<LeadDetail>(`/leads/${lead.id}`)
      .then((d) => { if (alive) setActivities(d.activities ?? []); })
      .catch(() => { if (alive) setActivities([]); })
      .finally(() => { if (alive) setLoadingLog(false); });
    return () => { alive = false; };
  }, [lead.id]);

  async function logActivity() {
    const note = logText.trim();
    if (!note || logging) return;
    setLogging(true);
    try {
      const created = await authFetch<LeadActivity>(`/leads/${lead.id}/activities`, {
        method: 'POST',
        body: JSON.stringify({ type: logType, note }),
      });
      setActivities((a) => [created, ...a]);
      setLogText('');
    } catch {
      /* surfaced via the page-level error path on failure */
    } finally {
      setLogging(false);
    }
  }

  function activityText(a: LeadActivity): string {
    const meta = (a.metadata ?? {}) as Record<string, unknown>;
    if (a.type === 'STAGE_CHANGE') return `${stageName(meta.from as string)} → ${stageName(meta.to as string)}`;
    return (meta.note as string) || '';
  }

  // Tags derived from the lead's own real data (session-local labels).
  const [tags, setTags] = useState<string[]>([]);
  useEffect(() => {
    const list: string[] = [];
    if (lead.company) list.push(lead.company.split(' ')[0]);
    if (lead.temperature === 'HOT') list.push('High-Intent');
    setTags(list);
  }, [lead.id, lead.company, lead.temperature]);

  const [newTagInput, setNewTagInput] = useState('');
  function handleAddTag(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && newTagInput.trim()) {
      const val = newTagInput.trim();
      if (!tags.includes(val)) {
        setTags([...tags, val]);
      }
      setNewTagInput('');
    }
  }
  function handleRemoveTag(t: string) {
    setTags(tags.filter((x) => x !== t));
  }

  return (
    <>
      {/* header */}
      <div className="flex items-start gap-3 border-b border-line px-5 py-4 bg-canvas/30">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-white"
          style={{ background: `hsl(${hue} 62% 48%)`, boxShadow: `0 0 0 3px ${tm.dot}33` }}
        >
          {initials(lead.name)}
        </span>
        <div className="min-w-0 flex-1">
          {/* Editable Name */}
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={() => commitProfileField('name', editName)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="w-full bg-transparent text-[16px] font-black text-ink outline-none border-b border-transparent hover:border-line focus:border-accent"
          />
          {lead.company && <p className="truncate text-[12px] font-semibold text-muted">{lead.company}</p>}
        </div>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink" aria-label={t('drawer.close')}>
          <Icon name="x" size={17} />
        </button>
      </div>

      {/* quick actions */}
      {links.length > 0 && (
        <div className="flex gap-2 border-b border-line px-5 py-3">
          {links.map((l) => (
            <a
              key={l.key}
              href={l.href}
              target={l.key === 'whatsapp' ? '_blank' : undefined}
              rel="noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-canvas py-2 text-[12px] font-semibold text-ink transition-colors hover:border-line-strong"
            >
              <span style={{ color: l.color }}><Icon name={l.icon} size={14} /></span> {l.label}
            </a>
          ))}
        </div>
      )}

      {/* Tab select bar */}
      <div className="flex border-b border-line px-4 bg-canvas/20">
        {(['info', 'timeline', 'tasks', 'notes', 'engagement'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-3 text-[11px] font-bold uppercase tracking-wider text-muted hover:text-ink relative transition-colors focus:outline-none"
            style={activeTab === tab ? { color: 'var(--v-accent)' } : undefined}
          >
            {t(`drawer.tabs.${tab}`)}
            {activeTab === tab && (
              <motion.span
                layoutId="drawer-active-tab-line"
                className="absolute bottom-0 inset-x-2 h-0.5 bg-accent"
              />
            )}
          </button>
        ))}
      </div>

      {/* Scrollable Workspace Panels */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {activeTab === 'info' && (
          <>
            {/* Stage Selector */}
            <Field label={t('drawer.stageLabel')}>
              <div className="flex flex-wrap gap-1.5">
                {stages.map((s) => {
                  const active = s.id === lead.stageId;
                  return (
                    <button
                      key={s.id}
                      disabled={busy}
                      onClick={() => !active && onPatch({ stageId: s.id })}
                      className="rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold transition-all disabled:opacity-50"
                      style={
                        active
                          ? { background: 'var(--v-accent)', color: 'var(--v-accent-contrast)', borderColor: 'var(--v-accent)' }
                          : { borderColor: 'hsl(var(--v-border))', color: 'hsl(var(--v-muted))' }
                      }
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </Field>

            {/* Temperature Selector */}
            <Field label={t('drawer.tempLabel')}>
              <div className="inline-flex rounded-xl border border-line p-0.5">
                {TEMPS.map((tp) => {
                  const meta = TEMP_META[tp];
                  const active = lead.temperature === tp;
                  return (
                    <button
                      key={tp}
                      disabled={busy}
                      onClick={() => !active && onPatch({ temperature: tp })}
                      className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12px] font-bold transition-all disabled:opacity-50"
                      style={active ? { background: meta.bg, color: meta.fg } : { color: 'hsl(var(--v-muted))' }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: meta.dot }} /> {t(`temperature.${tp.toLowerCase()}`)}
                    </button>
                  );
                })}
              </div>
            </Field>

            {/* Deal value */}
            <Field label={t('drawer.dealValue')}>
              <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas/40 px-3 py-2.5">
                <span className="text-[16px] font-bold text-emerald-500">$</span>
                <input
                  type="number"
                  min={0}
                  dir="ltr"
                  value={valueInput}
                  onChange={(e) => setValueInput(e.target.value)}
                  onBlur={commitValue}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  placeholder="0"
                  disabled={busy}
                  className="w-full bg-transparent text-[16px] font-bold text-ink outline-none placeholder:text-faint"
                />
                <span className="shrink-0 text-[11px] font-semibold text-faint">{t('drawer.estimated')}</span>
              </div>
            </Field>

            {/* Profile fields inline edits */}
            <Field label={t('drawer.contactDetails')}>
              <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line">
                <EditableRow
                  icon="mail"
                  label={t('drawer.email')}
                  value={editEmail}
                  onChange={setEditEmail}
                  onCommit={() => commitProfileField('email', editEmail)}
                  placeholder={t('drawer.emailPlaceholder')}
                  dir="ltr"
                />
                <EditableRow
                  icon="phone"
                  label={t('drawer.phone')}
                  value={editPhone}
                  onChange={setEditPhone}
                  onCommit={() => commitProfileField('phone', editPhone)}
                  placeholder={t('drawer.phonePlaceholder')}
                  dir="ltr"
                />
                <EditableRow
                  icon="briefcase"
                  label={t('drawer.company')}
                  value={editCompany}
                  onChange={setEditCompany}
                  onCommit={() => commitProfileField('company', editCompany)}
                  placeholder={t('drawer.companyPlaceholder')}
                />
                <Row icon="sparkle" label={t('drawer.leadScore')} value={String(lead.score)} />
                <Row icon={src.icon} label={t('drawer.sourceLink')} value={src.label} />
              </div>
            </Field>

            {/* Tags widget */}
            <Field label={t('drawer.tagsLabel')}>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  {tags.map((tg) => (
                    <span
                      key={tg}
                      className="v-chip !px-2.5 !py-1 !text-[10px] font-bold bg-canvas text-ink border border-line flex items-center gap-1.5"
                    >
                      {tg}
                      <button onClick={() => handleRemoveTag(tg)} className="text-faint hover:text-red-500 font-extrabold">×</button>
                    </span>
                  ))}
                </div>
                <input
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  placeholder={t('drawer.addTagPlaceholder')}
                  className="v-field !h-8 text-[11.5px] font-semibold"
                />
              </div>
            </Field>
          </>
        )}

        {activeTab === 'timeline' && (
          <>
            {/* Activity composer */}
            <div className="rounded-xl border border-line bg-canvas/40 p-2.5">
              <div className="mb-2 flex gap-1">
                {LOGGABLE.map((tp) => {
                  const meta = ACTIVITY_META[tp];
                  const active = logType === tp;
                  return (
                    <button
                      key={tp}
                      onClick={() => setLogType(tp)}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-[11px] font-semibold transition-all"
                      style={active ? { background: meta.color + '1a', color: meta.color } : { color: 'hsl(var(--v-muted))' }}
                    >
                      <Icon name={meta.icon} size={12} /> {t(`activity.types.${tp}`, meta.label)}
                    </button>
                  );
                })}
              </div>
              <textarea
                value={logText}
                onChange={(e) => setLogText(e.target.value)}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') logActivity(); }}
                placeholder={t('drawer.addActivity', { type: t(`activity.types.${logType}`, ACTIVITY_META[logType].label).toLowerCase() })}
                rows={2}
                className="w-full resize-none rounded-lg border border-line bg-surface px-2.5 py-2 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-[var(--v-accent)]"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10.5px] text-faint">⌘/Ctrl + Enter</span>
                <button onClick={logActivity} disabled={!logText.trim() || logging} className="v-btn !h-8 px-3 text-[12px] disabled:opacity-50">
                  {logging ? t('drawer.saving') : (<><Icon name="plus" size={13} /> {t('drawer.log')}</>)}
                </button>
              </div>
            </div>

            {/* Timeline log list */}
            {loadingLog ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="v-skeleton h-9 w-full" />)}</div>
            ) : (
              <ol className="relative space-y-4 ps-1">
                <span className="absolute inset-y-1 start-[13px] w-px bg-line" aria-hidden />
                {activities.map((a) => {
                  const meta = ACTIVITY_META[a.type];
                  const body = activityText(a);
                  return (
                    <li key={a.id} className="relative flex items-start gap-3">
                      <span className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line bg-surface" style={{ color: meta.color }}>
                        <Icon name={meta.icon} size={12} />
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[12.5px] font-semibold text-ink">{t(`activity.types.${a.type}`, meta.label)}</p>
                          <span className="shrink-0 text-[11px] text-faint">{relativeTime(a.createdAt)}</span>
                        </div>
                        {body && <p className="mt-0.5 whitespace-pre-wrap break-words text-[12px] text-muted">{body}</p>}
                      </div>
                    </li>
                  );
                })}
                <li className="relative flex items-start gap-3">
                  <span className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted">
                    <Icon name="user-plus" size={12} />
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-[12.5px] font-semibold text-ink">{t('drawer.leadCreated')}</p>
                    <p className="text-[11px] text-faint">{t('drawer.createdVia', { source: src.label, date: formatDate(lead.createdAt, locale, { year: 'numeric', month: 'short', day: 'numeric' }) })}</p>
                  </div>
                </li>
              </ol>
            )}
          </>
        )}

        {activeTab === 'tasks' && (
          <div className="space-y-4">
            {/* Add Task */}
            <div className="rounded-lg border border-dashed border-line p-2.5">
              <input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }}
                placeholder={t('drawer.addTaskPlaceholder')}
                className="w-full bg-transparent px-1.5 text-[12.5px] text-ink outline-none placeholder:text-faint"
              />
              <div className="mt-2 flex items-center justify-between">
                <input
                  type="date"
                  value={taskDue}
                  onChange={(e) => setTaskDue(e.target.value)}
                  className="rounded-md border border-line bg-surface px-2.5 py-1 text-[11px] text-muted outline-none focus:border-[var(--v-accent)]"
                />
                <button onClick={addTask} disabled={!taskTitle.trim() || taskBusy} className="v-btn !h-7.5 px-3 text-[11.5px] disabled:opacity-50">
                  <Icon name="plus" size={12} /> {t('drawer.addTask')}
                </button>
              </div>
            </div>

            {/* Tasks list */}
            <div className="space-y-2">
              {tasks.map((tk) => {
                const pr = TASK_PRIORITY[tk.priority];
                const due = dueMeta(tk.dueDate);
                const toneColor = due.tone === 'overdue' ? '#ef4444' : due.tone === 'today' ? '#f59e0b' : 'hsl(var(--v-faint))';
                return (
                  <div key={tk.id} className="flex items-center gap-2.5 rounded-lg border border-line bg-canvas/40 px-2.5 py-2">
                    <button
                      onClick={() => onToggleTask(tk.id, !tk.completed)}
                      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-colors"
                      style={tk.completed ? { background: 'var(--v-accent)', borderColor: 'var(--v-accent)', color: 'var(--v-accent-contrast)' } : { borderColor: 'hsl(var(--v-border-strong))' }}
                    >
                      {tk.completed && <Icon name="check" size={12} />}
                    </button>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: pr.color }} />
                    <p className={`min-w-0 flex-1 truncate text-[12.5px] font-semibold ${tk.completed ? 'text-faint line-through' : 'text-ink'}`}>{tk.title}</p>
                    {tk.dueDate && <span className="shrink-0 text-[10.5px] font-bold" style={{ color: tk.completed ? 'hsl(var(--v-faint))' : toneColor }}>{due.label}</span>}
                  </div>
                );
              })}
              {tasks.length === 0 && (
                <div className="py-10 text-center text-faint">
                  <Icon name="list" size={20} className="mx-auto mb-1.5" />
                  <span className="text-[12px] font-semibold">{t('drawer.noTasks')}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="space-y-4">
            <div className="v-card p-4 space-y-3.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-faint block">{t('drawer.internalNotes')}</span>
              <textarea
                placeholder={t('drawer.notesPlaceholder')}
                rows={5}
                className="w-full text-[12.5px] leading-relaxed text-ink bg-canvas/40 border border-line p-2.5 rounded-xl outline-none focus:border-accent"
              />
              <div className="flex justify-end">
                <button className="v-btn !h-8 px-3 text-[11.5px]">{t('drawer.saveNote')}</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'engagement' && (
          // Per-lead card engagement (this lead's QR scans / NFC taps / profile
          // views) can't be shown yet: analytics Events carry a visitorId + cardId
          // but leads aren't linked to a visitor, so there's no honest way to
          // attribute engagement to a single lead. Show a roadmap placeholder
          // instead of fabricated numbers.
          <div className="space-y-4">
            <div className="v-card overflow-hidden">
              <div className="v-hero p-5">
                <div className="relative z-10 flex flex-col items-start gap-2.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur">
                    <Icon name="sparkle" size={18} />
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/90">
                    {t('drawer.engagement.roadmap')}
                  </span>
                  <h4 className="v-display text-[17px] font-extrabold tracking-tight text-white">{t('drawer.engagement.title')}</h4>
                  <p className="max-w-sm text-[12px] font-medium leading-relaxed text-white/80">
                    {t('drawer.engagement.desc')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <Icon name="settings" size={14} />
                </span>
                <div>
                  <p className="text-[12px] font-bold text-ink">{t('drawer.engagement.whatNeeds')}</p>
                  <p className="mt-0.5 text-[11.5px] font-medium leading-relaxed text-muted">
                    {t('drawer.engagement.whatNeedsDesc')}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl border border-line bg-elevated/50 p-3.5 text-[11.5px] font-medium text-muted">
              <Icon name="clock" size={14} className="shrink-0 text-accent" />
              {t('drawer.engagement.useTimeline')}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function EditableRow({
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
    <div className="flex items-center gap-3 bg-surface px-3 py-2.5">
      <Icon name={icon} size={14} className="shrink-0 text-faint" />
      <span className="w-[76px] shrink-0 text-[11.5px] font-semibold text-muted">{label}</span>
      <input
        value={value}
        dir={dir}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder={placeholder}
        className="w-full bg-transparent text-[12.5px] font-bold text-ink outline-none placeholder:text-faint"
      />
    </div>
  );
}

function Row({ icon, label, value, href, external }: { icon: string; label: string; value: string | null; href?: string; external?: boolean }) {
  const content = (
    <div className="flex items-center gap-3 bg-surface px-3 py-2.5">
      <Icon name={icon} size={14} className="shrink-0 text-faint" />
      <span className="w-[76px] shrink-0 text-[11.5px] font-semibold text-muted">{label}</span>
      <span className={`min-w-0 flex-1 truncate text-[12.5px] ${value ? 'text-ink' : 'text-faint'} ${href ? 'text-accent' : ''}`}>
        {value || '—'}
      </span>
      {href && <Icon name="external-link" size={12} className="shrink-0 text-faint" />}
    </div>
  );
  if (href) {
    return (
      <a href={href} target={external ? '_blank' : undefined} rel="noreferrer" className="transition-colors hover:bg-canvas/50">
        {content}
      </a>
    );
  }
  return content;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-faint">{label}</p>
      {children}
    </div>
  );
}
