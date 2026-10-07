'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { authFetch, getToken, peek } from '@/lib/client';
import { BOARD_PAGE, ShowMore, useShowMore } from '@/components/crm/ShowMore';
import { Icon } from '@/components/Icon';
import AppShell, { OPEN_LEAD_EVENT } from '@/components/AppShell';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import { LeadCard, Heat } from '@/components/crm/LeadCard';
import { LeadDrawer } from '@/components/crm/LeadDrawer';
import { MergeDuplicates, useDuplicates } from '@/components/crm/MergeDuplicates';
import { LeadList } from '@/components/crm/LeadList';
import { AddLead } from '@/components/crm/AddLead';
import { ImportLeads } from '@/components/crm/ImportLeads';
import { FieldsManager } from '@/components/crm/FieldsManager';
import { useCustomFields } from '@/lib/custom-fields';
import { downloadText, leadsCsv } from '@/lib/export-leads';
import { SmartFilters } from '@/components/crm/SmartFilters';
import nextDynamic from 'next/dynamic';
import { type Lead, type Stage, type Temp, type Task, type TaskPriority, sourceMeta, wonStage, lostStage, formatMoney, stageKey } from '@/lib/crm';
import type { CreateTaskInput } from '@vertex/shared';
import { useShortcut } from '@/lib/shortcuts';

// Only the active view mounts — the secondary views load on demand so opening
// /leads doesn't ship all of them up front.
const ViewFallback = () => <div className="v-skeleton h-64 w-full" />;
const ContactsView = nextDynamic(() => import('@/components/crm/ContactsView').then((m) => m.ContactsView), { loading: ViewFallback });
const CompaniesView = nextDynamic(() => import('@/components/crm/CompaniesView').then((m) => m.CompaniesView), { loading: ViewFallback });
const ActivitiesTimeline = nextDynamic(() => import('@/components/crm/ActivitiesTimeline').then((m) => m.ActivitiesTimeline), { loading: ViewFallback });
const TasksView = nextDynamic(() => import('@/components/crm/TasksView').then((m) => m.TasksView), { loading: ViewFallback });
const NotesView = nextDynamic(() => import('@/components/crm/NotesView').then((m) => m.NotesView), { loading: ViewFallback });
const ReportsView = nextDynamic(() => import('@/components/crm/ReportsView').then((m) => m.ReportsView), { loading: ViewFallback });

type View = 'pipeline' | 'contacts' | 'companies' | 'tasks' | 'timeline' | 'notes' | 'reports';
type Layout = 'board' | 'table';

export default function LeadsPage() {
  const router = useRouter();
  const { t } = useTranslation('crm');
  const { locale } = useLocale();
  // Opened again, the page starts from what it showed last time and refreshes behind it.
  const [leads, setLeads] = useState<Lead[]>(() => peek<Lead[]>('/leads') ?? []);
  const [stages, setStages] = useState<Stage[]>(() => peek<Stage[]>('/leads/stages') ?? []);
  const [tasks, setTasks] = useState<Task[]>(() => peek<Task[]>('/tasks') ?? []);
  // How many cards each board column draws (see ShowMore).
  const [boardLimit, setBoardLimit] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(() => !(peek('/leads') && peek('/leads/stages') && peek('/tasks')));
  const [error, setError] = useState('');

  const [view, setView] = useState<View>('pipeline');
  const [layout, setLayout] = useState<Layout>('board');
  const [query, setQuery] = useState('');
  const [tempFilter, setTempFilter] = useState<Temp | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [minDealValue, setMinDealValue] = useState<number>(0);

  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [patchBusy, setPatchBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [managingFields, setManagingFields] = useState(false);
  const customFields = useCustomFields();
  const [reviewing, setReviewing] = useState<{ focus: string | null } | null>(null);
  useShortcut('n', t('nav:shortcuts.newLead'), () => setAdding(true));
  // On a phone the pipeline is a list filtered by stage, not side-scrolling columns.
  const [isPhone, setIsPhone] = useState(false);
  const [phoneStage, setPhoneStage] = useState<string | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsPhone(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const load = useCallback(async () => {
    const [l, s, tk] = await Promise.all([
      authFetch<Lead[]>('/leads'),
      authFetch<Stage[]>('/leads/stages'),
      authFetch<Task[]>('/tasks'),
    ]);
    setStages(s);
    setLeads(l);
    setTasks(tk);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    // Remember the last layout; open a lead named in the URL (the command menu links here).
    try {
      const saved = localStorage.getItem('vertex_leads_layout');
      if (saved === 'board' || saved === 'table') setLayout(saved);
    } catch {}
    const linked = new URLSearchParams(window.location.search).get('lead');
    if (linked) setSelected(linked);
    // A view named in the URL (the app's "Tasks" opens /leads?view=tasks).
    const asked = new URLSearchParams(window.location.search).get('view');
    if (asked && (['pipeline', 'contacts', 'companies', 'tasks', 'timeline', 'notes', 'reports'] as string[]).includes(asked)) setView(asked as View);
    load().catch((e) => {
      setError(e.message);
      setLoading(false);
    });
    const onOpenLead = (e: Event) => setSelected((e as CustomEvent<string>).detail);
    window.addEventListener(OPEN_LEAD_EVENT, onOpenLead);
    return () => window.removeEventListener(OPEN_LEAD_EVENT, onOpenLead);
  }, [router, load]);

  function chooseLayout(next: Layout) {
    setLayout(next);
    try {
      localStorage.setItem('vertex_leads_layout', next);
    } catch {}
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 1800);
  }

  async function createTask(input: CreateTaskInput & { priority?: TaskPriority }) {
    const created = await authFetch<Task>('/tasks', { method: 'POST', body: JSON.stringify(input) });
    setTasks((ts) => [created, ...ts]);
    flash(t('toasts.taskAdded'));
  }

  async function toggleTask(id: string, completed: boolean) {
    const prev = tasks;
    setTasks((ts) => ts.map((tk) => (tk.id === id ? { ...tk, completed } : tk)));
    try {
      await authFetch(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ completed }) });
    } catch (e) {
      setTasks(prev);
      setError((e as Error).message);
    }
  }

  async function patchLead(
    id: string,
    patch: {
      stageId?: string | null;
      temperature?: Temp;
      value?: number;
      name?: string | null;
      email?: string | null;
      phone?: string | null;
      company?: string | null;
      customFields?: Record<string, string | number | boolean | null>;
    },
    label: string,
  ) {
    const prev = leads;
    // A field's value lays over the lead's others; an empty one takes it off.
    const merged = (l: Lead) => {
      if (!patch.customFields) return { ...l, ...patch, customFields: l.customFields };
      const next = { ...(l.customFields ?? {}) };
      for (const [k, v] of Object.entries(patch.customFields)) {
        if (v === null) delete next[k];
        else next[k] = v;
      }
      return { ...l, ...patch, customFields: next };
    };
    setLeads((ls) => ls.map((l) => (l.id === id ? merged(l) : l)));
    setPatchBusy(true);
    try {
      const saved = await authFetch<{ customFields?: Lead['customFields'] }>(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      if (patch.customFields) setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, customFields: saved.customFields ?? null } : l)));
      flash(label);
    } catch (e) {
      setLeads(prev);
      setError((e as Error).message);
    } finally {
      setPatchBusy(false);
    }
  }

  const firstStage = stages[0]?.id;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (tempFilter && l.temperature !== tempFilter) return false;
      if (sourceFilter && l.source !== sourceFilter) return false;
      if (minDealValue > 0 && l.value < minDealValue) return false;
      if (q) {
        const hay = `${l.name ?? ''} ${l.company ?? ''} ${l.email ?? ''} ${l.phone ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, query, tempFilter, sourceFilter, minDealValue]);

  const byStage = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const s of stages) map[s.id] = [];
    for (const lead of filtered) {
      const key = lead.stageId && map[lead.stageId] ? lead.stageId : firstStage;
      if (key && map[key]) map[key].push(lead);
    }
    return map;
  }, [filtered, stages, firstStage]);

  // One line of numbers instead of a row of stat boxes.
  const summary = useMemo(() => {
    const won = wonStage(stages)?.id;
    const lost = lostStage(stages)?.id;
    const open = leads.filter((l) => l.stageId !== won && l.stageId !== lost);
    const wonCount = won ? leads.filter((l) => l.stageId === won).length : 0;
    return {
      open: open.length,
      pipeline: open.reduce((sum, l) => sum + (l.value || 0), 0),
      wonPct: formatNumber(leads.length ? wonCount / leads.length : 0, locale, { style: 'percent', maximumFractionDigits: 0 }),
    };
  }, [leads, stages, locale]);

  const openTasks = tasks.filter((tk) => !tk.completed).length;
  const filtersActive = !!(query || tempFilter || sourceFilter || minDealValue);
  const clearFilters = () => {
    setQuery('');
    setTempFilter(null);
    setSourceFilter(null);
    setMinDealValue(0);
  };

  const selectedLead = leads.find((l) => l.id === selected) ?? null;
  const dupes = useDuplicates(leads);
  const dupeCount = dupes.groups.reduce((n, g) => n + g.leads.length, 0);

  const tabs: { id: View; label: string; count?: number }[] = [
    { id: 'pipeline', label: t('tabs.pipeline'), count: loading ? undefined : summary.open },
    { id: 'contacts', label: t('tabs.contacts') },
    { id: 'companies', label: t('tabs.companies') },
    { id: 'tasks', label: t('tabs.tasks'), count: openTasks || undefined },
    { id: 'timeline', label: t('tabs.timeline') },
    { id: 'notes', label: t('tabs.notes') },
    { id: 'reports', label: t('tabs.reports') },
  ];

  // Views that list leads share the filter toolbar.
  const filterable = view === 'pipeline' || view === 'contacts' || view === 'companies' || view === 'timeline';

  // The leads on screen (all of them, or what the filters leave) as a CSV for Excel.
  function exportLeads() {
    const rows = filtersActive ? filtered : leads;
    const csv = leadsCsv(rows, stages, {
      headers: {
        name: t('export.headers.name'),
        company: t('export.headers.company'),
        email: t('export.headers.email'),
        phone: t('export.headers.phone'),
        stage: t('export.headers.stage'),
        temperature: t('export.headers.temperature'),
        value: t('export.headers.value'),
        source: t('export.headers.source'),
        card: t('export.headers.card'),
        added: t('export.headers.added'),
      },
      stage: (st) => t(stageKey(st.name), st.name),
      temperature: (tp) => t(`temperature.${tp.toLowerCase()}`),
      source: (src) => t(`sources.${src}`, sourceMeta(src).label),
      fields: customFields ?? [],
      yesNo: [t('fields.yes'), t('fields.no')],
    });
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    downloadText(csv, `${t('export.file')}-${stamp}.csv`);
  }

  return (
    <AppShell
      title={t('title')}
      fluid
      action={
        <div className="flex gap-2">
          {leads.length > 0 && (
            <button type="button" onClick={exportLeads} className="v-btn v-btn-ghost" title={filtersActive ? t('export.filtered', { count: filtered.length }) : t('export.all')}>
              <Icon name="download" size={14} /> <span className="hidden sm:inline">{t('export.button')}</span>
            </button>
          )}
          <button type="button" onClick={() => setImporting(true)} className="v-btn v-btn-ghost" title={t('import.buttonHint')}>
            <Icon name="upload" size={14} /> <span className="hidden sm:inline">{t('import.button')}</span>
          </button>
          <Link href="/meet" className="v-btn v-btn-ghost" title={t('meet.title')}>
            <Icon name="users" size={14} /> <span className="hidden sm:inline">{t('meet.title')}</span>
          </Link>
          <button type="button" onClick={() => setAdding(true)} aria-keyshortcuts="n" title={`${t('add.button')} (N)`} className="v-btn">
            <Icon name="plus" size={14} /> {t('add.button')}
          </button>
        </div>
      }
    >
      {loading ? (
        // Not "no open leads" before they are in: a placeholder of the same height.
        <p aria-hidden className="flex h-6 items-center gap-3">
          <span className="v-skeleton block h-3.5 w-24 rounded" />
          <span className="v-skeleton block h-3.5 w-32 rounded" />
          <span className="v-skeleton block h-3.5 w-20 rounded" />
        </p>
      ) : (
        <p className="text-base text-muted">
          <span className="font-medium text-ink">{t('summary.open', { count: summary.open })}</span>
          <span className="mx-2 text-faint" aria-hidden>·</span>
          {t('summary.pipeline', { value: formatMoney(summary.pipeline, locale) })}
          <span className="mx-2 text-faint" aria-hidden>·</span>
          {t('summary.won', { pct: summary.wonPct })}
        </p>
      )}

      {dupes.groups.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-amber-500/[0.07] px-3 py-2 text-sm ring-1 ring-inset ring-amber-500/20">
          <Icon name="users" size={14} className="text-amber-700 dark:text-amber-300" />
          <span className="text-ink">{t('duplicates.banner', { count: dupeCount })}</span>
          <button type="button" onClick={() => setReviewing({ focus: null })} className="font-medium text-accent hover:underline">
            {t('duplicates.review')}
          </button>
        </div>
      )}

      <nav role="tablist" className="no-scrollbar -mx-5 mt-4 flex gap-5 overflow-x-auto border-b border-line px-5 md:-mx-8 md:px-8">
        {tabs.map((tab) => {
          const active = view === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={active}
              onClick={() => setView(tab.id)}
              className={`relative flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 text-sm font-medium transition-colors sm:min-h-10 ${
                active ? 'text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && <span className="tabular text-xs text-faint">{tab.count}</span>}
              {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink" />}
            </button>
          );
        })}
      </nav>

      {filterable && !loading && leads.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="relative min-w-[220px] flex-1 sm:max-w-[320px]">
            <span className="pointer-events-none absolute inset-y-0 start-2.5 flex items-center text-faint">
              <Icon name="search" size={14} />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('toolbar.search')}
              className="v-field !ps-8 !text-sm sm:!h-8"
            />
          </label>
          <SmartFilters
            leads={leads}
            tempFilter={tempFilter}
            setTempFilter={setTempFilter}
            sourceFilter={sourceFilter}
            setSourceFilter={setSourceFilter}
            minDealValue={minDealValue}
            setMinDealValue={setMinDealValue}
            onClear={clearFilters}
          />
          {filtersActive && (
            <>
              <span className="text-xs text-faint">{t('toolbar.results', { count: filtered.length })}</span>
              <button onClick={clearFilters} className="min-h-11 text-xs font-medium text-accent hover:underline sm:min-h-0">
                {t('toolbar.clear')}
              </button>
            </>
          )}
          {view === 'pipeline' && (
            <div role="radiogroup" aria-label={t('view.label')} className="ms-auto hidden rounded-lg bg-elevated p-0.5 ring-1 ring-inset ring-line md:inline-flex">
              {(['board', 'table'] as const).map((l) => (
                <button
                  key={l}
                  role="radio"
                  aria-checked={layout === l}
                  onClick={() => chooseLayout(l)}
                  className={`flex h-11 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors sm:h-7 ${
                    layout === l ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'
                  }`}
                >
                  <Icon name={l === 'board' ? 'columns' : 'list'} size={13} />
                  {t(`view.${l}`)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div role="alert" className="mt-4 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mt-4 min-h-[400px]">
        {loading ? (
          <BoardSkeleton />
        ) : leads.length === 0 && view === 'pipeline' ? (
          <EmptyState />
        ) : (
          <>
            {view === 'pipeline' && isPhone && (
              <LeadList
                leads={phoneStage ? filtered.filter((l) => (l.stageId ?? firstStage) === phoneStage) : filtered}
                stages={stages}
                stage={phoneStage}
                onStage={setPhoneStage}
                counts={Object.fromEntries(stages.map((st) => [st.id, (byStage[st.id] ?? []).length]))}
                onOpen={setSelected}
              />
            )}
            {view === 'pipeline' && !isPhone && layout === 'board' && (
              <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-4 md:-mx-8 md:px-8">
                {stages.map((stage) => {
                  const items = byStage[stage.id] ?? [];
                  const isOver = overStage === stage.id;
                  const colValue = items.reduce((sum, l) => sum + l.value, 0);
                  return (
                    <section
                      key={stage.id}
                      aria-label={t(stageKey(stage.name), stage.name)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setOverStage(stage.id);
                      }}
                      onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragId) patchLead(dragId, { stageId: stage.id }, t('toasts.movedTo', { stage: t(stageKey(stage.name), stage.name) }));
                        setDragId(null);
                        setOverStage(null);
                      }}
                      className={`flex max-h-[calc(100vh-260px)] min-h-[320px] w-[272px] shrink-0 flex-col rounded-xl p-2 ring-1 ring-inset transition-colors ${
                        isOver ? 'bg-accent/[0.05] ring-accent/40' : 'bg-elevated ring-line'
                      }`}
                    >
                      <header className="flex items-center gap-2 px-1.5 pb-2.5 pt-1">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: stage.color || 'hsl(var(--v-faint))' }} />
                        <h3 className="truncate text-sm font-medium text-ink">{t(stageKey(stage.name), stage.name)}</h3>
                        <span className="tabular text-xs text-faint">{items.length}</span>
                        {colValue > 0 && <span className="tabular ms-auto text-xs text-faint">{formatMoney(colValue, locale)}</span>}
                      </header>

                      <div className="no-scrollbar flex min-h-[80px] flex-1 flex-col gap-2 overflow-y-auto p-0.5">
                        <AnimatePresence>
                          {items.slice(0, boardLimit[stage.id] ?? BOARD_PAGE).map((lead) => (
                            <LeadCard
                              key={lead.id}
                              lead={lead}
                              selected={selected === lead.id}
                              dragging={dragId === lead.id}
                              still={filtered.length > 100}
                              onOpen={() => setSelected(lead.id)}
                              onDragStart={() => setDragId(lead.id)}
                              onDragEnd={() => setDragId(null)}
                            />
                          ))}
                        </AnimatePresence>
                        <ShowMore
                          rest={items.length - (boardLimit[stage.id] ?? BOARD_PAGE)}
                          shown={Math.min(items.length, boardLimit[stage.id] ?? BOARD_PAGE)}
                          step={BOARD_PAGE}
                          onMore={() => setBoardLimit((b) => ({ ...b, [stage.id]: (b[stage.id] ?? BOARD_PAGE) + BOARD_PAGE }))}
                        />
                        {items.length === 0 && (
                          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line py-8 text-xs text-faint">
                            {isOver ? t('board.releaseToDrop') : t('board.noLeads')}
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}

            {view === 'pipeline' && !isPhone && layout === 'table' && <LeadTable leads={filtered} stages={stages} onOpen={setSelected} selected={selected} />}

            {view === 'contacts' && <ContactsView leads={filtered} onOpen={setSelected} />}

            {view === 'companies' && (
              <CompaniesView
                leads={filtered}
                stages={stages}
                onOpenCompany={(name) => {
                  setQuery(name === 'No company' ? '' : name);
                  setView('pipeline');
                  chooseLayout('table');
                }}
              />
            )}

            {view === 'timeline' && <ActivitiesTimeline leads={filtered} filtered={filtersActive} stages={stages} onOpenLead={setSelected} />}

            {view === 'tasks' && (
              <TasksView leads={filtered} tasks={tasks} onAddTask={(input) => createTask(input)} onToggleTask={toggleTask} onOpenLead={setSelected} />
            )}

            {view === 'notes' && <NotesView onOpenLead={(id) => setSelected(id)} />}

            {view === 'reports' && <ReportsView leads={leads} stages={stages} />}
          </>
        )}
      </div>

      <ImportLeads open={importing} stages={stages} onClose={() => setImporting(false)} onImported={() => void load()} />
      <AddLead
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={(lead) => {
          setLeads((list) => [lead, ...list]);
          setView('pipeline');
          setSelected(lead.id);
        }}
      />
      <LeadDrawer
        lead={selectedLead}
        stages={stages}
        tasks={selectedLead ? tasks.filter((tk) => tk.leadId === selectedLead.id) : []}
        busy={patchBusy}
        onClose={() => setSelected(null)}
        onPatch={(patch) => selectedLead && patchLead(selectedLead.id, patch, t('toasts.leadUpdated'))}
        onAddTask={(input) => createTask(input)}
        onToggleTask={toggleTask}
        onContacted={(id, times) => setLeads((list) => list.map((l) => (l.id === id ? { ...l, ...times } : l)))}
        duplicates={selectedLead ? dupes.of(selectedLead.id) : []}
        onReviewDuplicates={() => selectedLead && setReviewing({ focus: selectedLead.id })}
        onManageFields={() => setManagingFields(true)}
      />
      {/* After the lead's panel, so it opens over it. */}
      <FieldsManager open={managingFields} onClose={() => setManagingFields(false)} />

      <MergeDuplicates
        open={!!reviewing}
        focus={reviewing?.focus}
        onClose={() => setReviewing(null)}
        groups={dupes.groups}
        stages={stages}
        onDismiss={dupes.dismiss}
        onMerged={(keepId, mergedIds) => {
          if (selected && mergedIds.includes(selected)) setSelected(keepId);
          flash(t('duplicates.done', { count: mergedIds.length + 1 }));
          void load();
        }}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            role="status"
            className="fixed inset-x-0 bottom-[calc(1.5rem+var(--v-dock,0px))] z-[60] mx-auto flex w-fit items-center gap-2 rounded-lg bg-[#17171a] px-3.5 py-2.5 text-sm font-medium text-white shadow-lg"
          >
            <Icon name="check" size={14} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="w-[272px] shrink-0 rounded-xl bg-elevated p-2 ring-1 ring-inset ring-line">
          <div className="v-skeleton mb-3 h-5 w-24" />
          <div className="space-y-2">
            {[0, 1, 2].map((j) => (
              <div key={j} className="v-skeleton h-[76px] w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation('crm');
  return (
    <div className="v-card flex flex-col items-center gap-4 px-6 py-16 text-center">
      <span className="v-icon-tile !h-11 !w-11">
        <Icon name="inbox" size={20} />
      </span>
      <div>
        <p className="text-md font-semibold text-ink">{t('emptyStateTitle')}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted">{t('emptyStateDesc')}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/cards" className="v-btn">
          <Icon name="grid" size={14} /> {t('openCards')}
        </Link>
        <Link href="/analytics" className="v-btn v-btn-ghost">
          {t('viewAnalytics')}
        </Link>
      </div>
    </div>
  );
}

function LeadTable({ leads, stages, onOpen, selected }: { leads: Lead[]; stages: Stage[]; onOpen: (id: string) => void; selected: string | null }) {
  const { t } = useTranslation('crm');
  const { locale } = useLocale();
  const stageOf = (id: string | null) => stages.find((s) => s.id === id);
  const { shown, rest, more } = useShowMore(leads);
  return (
    <div className="v-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="v-table">
          <thead>
            <tr>
              <th>{t('table.lead')}</th>
              <th>{t('table.company')}</th>
              <th>{t('table.stage')}</th>
              <th>{t('table.temperature')}</th>
              <th>{t('table.source')}</th>
              <th className="!text-end">{t('table.value')}</th>
              <th>{t('table.added')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => {
              const stage = stageOf(l.stageId);
              const src = sourceMeta(l.source);
              return (
                <tr
                  key={l.id}
                  onClick={() => onOpen(l.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onOpen(l.id);
                  }}
                  tabIndex={0}
                  className={`cursor-pointer outline-none focus-visible:bg-elevated ${selected === l.id ? '[&>td]:!bg-accent/[0.06]' : ''}`}
                >
                  <td>
                    <span className="block font-medium text-ink">{l.name || t('table.unknownLead')}</span>
                    {(l.email || l.phone) && (
                      <span dir="ltr" className="block text-start text-xs text-faint rtl:text-right">
                        {l.email || l.phone}
                      </span>
                    )}
                  </td>
                  <td className="text-muted">{l.company || '—'}</td>
                  <td>
                    {stage ? (
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-elevated px-2 py-0.5 text-xs text-ink ring-1 ring-inset ring-line">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: stage.color || 'hsl(var(--v-faint))' }} />
                        {t(stageKey(stage.name), stage.name)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-2 text-muted">
                      <Heat temp={l.temperature} />
                      {t(`temperature.${l.temperature.toLowerCase()}`)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name={src.icon} size={13} />
                      {t(`sources.${l.source}`, src.label)}
                    </span>
                  </td>
                  <td className="tabular text-end text-ink">{l.value ? formatMoney(l.value, locale) : '—'}</td>
                  <td className="whitespace-nowrap text-faint">{formatRelativeTime(l.createdAt, locale, 'narrow')}</td>
                </tr>
              );
            })}
            {leads.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-14 text-center text-muted">
                  {t('table.noMatch')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ShowMore rest={rest} shown={shown.length} onMore={more} className="border-t border-line" />
    </div>
  );
}
