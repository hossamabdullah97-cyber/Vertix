'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { authFetch, getToken } from '@/lib/client';
import { Icon } from '@/components/Icon';
import AppShell from '@/components/AppShell';
import { useCountUp } from '@/lib/useCountUp';
import { LeadCard } from '@/components/crm/LeadCard';
import { LeadDrawer } from '@/components/crm/LeadDrawer';
import { CrmDashboard } from '@/components/crm/CrmDashboard';
import nextDynamic from 'next/dynamic';
// Only the active CRM view mounts — lazy-load the non-default views so opening
// /leads doesn't ship all of them up front (component-level code splitting).
const ViewFallback = () => <div className="v-skeleton h-64 w-full rounded-2xl" />;
const ContactsView = nextDynamic(() => import('@/components/crm/ContactsView').then((m) => m.ContactsView), { loading: ViewFallback });
const CompaniesView = nextDynamic(() => import('@/components/crm/CompaniesView').then((m) => m.CompaniesView), { loading: ViewFallback });
const ActivitiesTimeline = nextDynamic(() => import('@/components/crm/ActivitiesTimeline').then((m) => m.ActivitiesTimeline), { loading: ViewFallback });
const MeetingsView = nextDynamic(() => import('@/components/crm/MeetingsView').then((m) => m.MeetingsView), { loading: ViewFallback });
const TasksView = nextDynamic(() => import('@/components/crm/TasksView').then((m) => m.TasksView), { loading: ViewFallback });
const NotesView = nextDynamic(() => import('@/components/crm/NotesView').then((m) => m.NotesView), { loading: ViewFallback });
const ReportsView = nextDynamic(() => import('@/components/crm/ReportsView').then((m) => m.ReportsView), { loading: ViewFallback });
import { CrmSearch } from '@/components/crm/CrmSearch';
import { SmartFilters } from '@/components/crm/SmartFilters';
import { type Lead, type Stage, type Temp, type Task, type TaskPriority, TEMP_META, sourceMeta, isToday, wonStage, formatMoney } from '@/lib/crm';
import type { CreateTaskInput } from '@vertex/shared';

const TEMPS: Temp[] = ['HOT', 'WARM', 'COLD'];

export default function LeadsPipeline() {
  const router = useRouter();
  const { t } = useTranslation('crm');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [view, setView] = useState<'overview' | 'board' | 'table' | 'contacts' | 'companies' | 'timeline' | 'meetings' | 'tasks' | 'notes' | 'reports'>('overview');
  const [query, setQuery] = useState('');
  const [tempFilter, setTempFilter] = useState<Temp | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [minDealValue, setMinDealValue] = useState<number>(0);

  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [patchBusy, setPatchBusy] = useState(false);
  const [toast, setToast] = useState('');

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

  async function createTask(input: CreateTaskInput & { priority?: TaskPriority }) {
    const created = await authFetch<Task>('/tasks', { method: 'POST', body: JSON.stringify(input) });
    setTasks((ts) => [created, ...ts]);
    flash(t('toasts.taskAdded'));
  }

  async function toggleTask(id: string, completed: boolean) {
    const prev = tasks;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, completed } : t)));
    try {
      await authFetch(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ completed }) });
    } catch (e) {
      setTasks(prev);
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    load().catch((e) => { setError(e.message); setLoading(false); });
  }, [router, load]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 1800);
  }

  const firstStage = stages[0]?.id;
  const sources = useMemo(() => Array.from(new Set(leads.map((l) => l.source))), [leads]);

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

  // --- Real KPIs computed from the lead list ---
  const wonStageId = wonStage(stages)?.id;
  const kpis = useMemo(() => {
    const total = leads.length;
    const hot = leads.filter((l) => l.temperature === 'HOT').length;
    const today = leads.filter((l) => isToday(l.createdAt)).length;
    const won = wonStageId ? leads.filter((l) => l.stageId === wonStageId).length : 0;
    const conv = total ? Math.round((won / total) * 100) : 0;
    return { total, hot, today, won, conv };
  }, [leads, wonStageId]);

  async function patchLead(id: string, patch: { stageId?: string | null; temperature?: Temp; value?: number; name?: string | null; email?: string | null; phone?: string | null; company?: string | null }, label: string) {
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setPatchBusy(true);
    try {
      await authFetch(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      flash(label);
    } catch (e) {
      setLeads(prev);
      setError((e as Error).message);
    } finally {
      setPatchBusy(false);
    }
  }

  const selectedLead = leads.find((l) => l.id === selected) ?? null;

  const tabs = [
    { id: 'overview', label: t('tabs.overview', 'Dashboard'), icon: 'gauge' },
    { id: 'board', label: t('tabs.board', 'Board View'), icon: 'columns' },
    { id: 'table', label: t('tabs.table', 'Table View'), icon: 'list' },
    { id: 'contacts', label: t('tabs.contacts', 'Contacts'), icon: 'users' },
    { id: 'companies', label: t('tabs.companies', 'Companies'), icon: 'briefcase' },
    { id: 'timeline', label: t('tabs.timeline', 'Timeline'), icon: 'clock' },
    { id: 'meetings', label: t('tabs.meetings', 'Meetings'), icon: 'calendar' },
    { id: 'tasks', label: t('tabs.tasks', 'Tasks'), icon: 'check' },
    { id: 'notes', label: t('tabs.notes', 'Notes'), icon: 'file-text' },
    { id: 'reports', label: t('tabs.reports', 'Analytics'), icon: 'chart-bar' },
  ] as const;

  return (
    <AppShell
      title={t('title', 'CRM Hub')}
      action={
        <div className="flex items-center gap-2">
          {/* Global Search shortcut widget */}
          <CrmSearch leads={leads} tasks={tasks} onOpenLead={setSelected} onOpenView={setView} />
          
          {/* Smart Advanced Filters widget */}
          <SmartFilters
            leads={leads}
            tempFilter={tempFilter}
            setTempFilter={setTempFilter}
            sourceFilter={sourceFilter}
            setSourceFilter={setSourceFilter}
            minDealValue={minDealValue}
            setMinDealValue={setMinDealValue}
            onClear={() => {
              setQuery('');
              setTempFilter(null);
              setSourceFilter(null);
              setMinDealValue(0);
            }}
          />
        </div>
      }
    >
      {/* Horizontal Premium Tabs Navbar */}
      <div className="no-scrollbar mb-6 flex gap-1.5 overflow-x-auto border-b border-line pb-3">
        {tabs.map((t) => {
          const active = view === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className={`flex items-center gap-2 rounded-[10px] px-3.5 py-2 text-[12.5px] font-bold transition-all shrink-0 ${
                active ? 'text-white' : 'text-muted hover:text-ink hover:bg-ink/5'
              }`}
              style={active ? { background: 'var(--v-gradient-brand)', boxShadow: 'var(--v-shadow-accent)' } : undefined}
            >
              <Icon name={t.icon} size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-sm font-semibold text-red-500">
          <Icon name="x" size={15} /> {error}
        </div>
      )}

      {loading ? (
        <BoardSkeleton />
      ) : leads.length === 0 && view === 'overview' ? (
        // Only the dashboard shows the friendly full-page empty state. Board,
        // Table and the other views render their own structure (pipeline
        // columns, empty tables, per-view empties) so they stay usable at zero leads.
        <EmptyState />
      ) : (
        <div className="min-h-[400px]">
          {view === 'overview' && (
            <CrmDashboard leads={leads} stages={stages} tasks={tasks} onOpen={setSelected} onToggleTask={toggleTask} />
          )}
          
          {view === 'board' && (
            <div className="no-scrollbar flex gap-4 overflow-x-auto pb-4">
              {stages.map((stage) => {
                const items = byStage[stage.id] ?? [];
                const isOver = overStage === stage.id;
                const colValue = items.reduce((sum, l) => sum + l.value, 0);
                const mix = { HOT: 0, WARM: 0, COLD: 0 } as Record<Temp, number>;
                items.forEach((l) => (mix[l.temperature] += 1));
                return (
                  <div
                    key={stage.id}
                    onDragOver={(e) => { e.preventDefault(); setOverStage(stage.id); }}
                    onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
                    onDrop={(e) => { e.preventDefault(); if (dragId) patchLead(dragId, { stageId: stage.id }, t('toasts.movedTo', { stage: stage.name })); setDragId(null); setOverStage(null); }}
                    className="flex max-h-[calc(100vh-320px)] w-[300px] shrink-0 flex-col rounded-2xl border p-3 transition-all"
                    style={{
                      borderColor: isOver ? 'var(--v-accent)' : 'hsl(var(--v-border))',
                      background: isOver ? 'var(--v-accent-soft)' : 'hsl(var(--v-surface))',
                      boxShadow: isOver ? '0 12px 32px rgba(37, 99, 235,0.12)' : 'var(--v-shadow-sm)',
                    }}
                  >
                    {/* column header */}
                    <div className="mb-3 px-1">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-[13px] font-bold text-ink">
                          {stage.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />}
                          {stage.name}
                        </span>
                        <span className="v-chip !px-2 !py-0.5 !text-[11px] font-bold text-muted">{items.length}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10.5px] font-semibold text-faint">
                        <span className="inline-flex items-center gap-1 font-bold text-muted"><Icon name="chart-bar" size={10} className="text-emerald-500" /> {formatMoney(colValue)}</span>
                        <span className="flex items-center gap-1">
                          {TEMPS.map((tm) => mix[tm] > 0 && (
                            <span key={tm} className="inline-flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: TEMP_META[tm].dot }} />{mix[tm]}</span>
                          ))}
                        </span>
                      </div>
                      <div className="mt-2 flex h-1 overflow-hidden rounded-full bg-line">
                        {TEMPS.map((tm) => mix[tm] > 0 && <span key={tm} style={{ flex: mix[tm], background: TEMP_META[tm].dot }} />)}
                      </div>
                    </div>

                    {/* cards */}
                    <div className="no-scrollbar flex min-h-[120px] flex-col gap-2.5 overflow-y-auto">
                      <AnimatePresence>
                        {items.map((lead) => (
                          <LeadCard
                            key={lead.id}
                            lead={lead}
                            dragging={dragId === lead.id}
                            onOpen={() => setSelected(lead.id)}
                            onDragStart={() => setDragId(lead.id)}
                            onDragEnd={() => setDragId(null)}
                          />
                        ))}
                      </AnimatePresence>
                      {items.length === 0 && (
                        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed border-line py-10 text-center">
                          <Icon name="inbox" size={20} className="text-faint" />
                          <span className="mt-1.5 text-[11.5px] font-semibold text-faint">{isOver ? t('board.releaseToDrop') : t('board.noLeads')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {view === 'table' && (
            <LeadTable leads={filtered} stages={stages} onOpen={setSelected} />
          )}

          {view === 'contacts' && (
            <ContactsView leads={filtered} onOpen={setSelected} />
          )}

          {view === 'companies' && (
            <CompaniesView leads={filtered} stages={stages} onOpenCompany={(name) => {
              setQuery(name === 'No company' ? '' : name);
              setView('table');
            }} />
          )}

          {view === 'timeline' && (
            <ActivitiesTimeline leads={filtered} stages={stages} onOpenLead={setSelected} />
          )}

          {view === 'meetings' && (
            <MeetingsView leads={filtered} onOpenLead={setSelected} />
          )}

          {view === 'tasks' && (
            <TasksView
              leads={filtered}
              tasks={tasks}
              onAddTask={(input) => createTask(input)}
              onToggleTask={toggleTask}
              onOpenLead={setSelected}
            />
          )}

          {view === 'notes' && (
            <NotesView />
          )}

          {view === 'reports' && (
            <ReportsView leads={leads} stages={stages} />
          )}
        </div>
      )}

      <LeadDrawer
        lead={selectedLead}
        stages={stages}
        tasks={selectedLead ? tasks.filter((t) => t.leadId === selectedLead.id) : []}
        busy={patchBusy}
        onClose={() => setSelected(null)}
        onPatch={(patch) => selectedLead && patchLead(selectedLead.id, patch, t('toasts.leadUpdated'))}
        onAddTask={(input) => createTask(input)}
        onToggleTask={toggleTask}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed inset-x-0 bottom-6 z-[60] mx-auto flex w-fit items-center gap-2 rounded-full bg-[#16161a] px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg"
          >
            <Icon name="check" size={15} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}

function Kpi({ label, value, icon, tint, suffix }: { label: string; value: number; icon: string; tint?: string; suffix?: string }) {
  const v = useCountUp(value, 900);
  return (
    <div className="v-card p-4">
      <div className="mb-2 flex items-center gap-1.5 text-muted">
        <span style={tint ? { color: tint } : undefined}><Icon name={icon} size={14} /></span>
        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-[26px] font-black leading-none tracking-tight tabular-nums text-ink" style={tint ? { color: tint } : undefined}>
        {v}{suffix}
      </p>
    </div>
  );
}

function FilterChip({ active, onClick, dot, children }: { active: boolean; onClick: () => void; dot?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition-all"
      style={active ? { background: 'var(--v-accent)', color: 'var(--v-accent-contrast)' } : { color: 'hsl(var(--v-muted))' }}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
      {children}
    </button>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="w-[300px] shrink-0 rounded-2xl border border-line bg-surface p-3">
          <div className="v-skeleton mb-3 h-5 w-24" />
          <div className="space-y-2.5">
            {[0, 1, 2].map((j) => <div key={j} className="v-skeleton h-[92px] w-full" />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation('crm');
  return (
    <div className="v-card flex flex-col items-center gap-4 py-20 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'var(--v-accent-soft)', color: 'var(--v-accent)' }}>
        <Icon name="users" size={28} />
      </span>
      <div>
        <p className="text-[16px] font-bold text-ink">{t('emptyStateTitle', 'No leads yet')}</p>
        <p className="mt-1 max-w-sm text-[13px] text-muted">{t('emptyStateDesc', 'Every time someone saves your contact, taps your NFC card, or submits a form on your public profile, they land here automatically.')}</p>
      </div>
      <div className="flex gap-2.5">
        <Link href="/cards" className="v-btn"><Icon name="grid" size={15} /> {t('openCards', 'Open my cards')}</Link>
        <Link href="/analytics" className="v-btn v-btn-ghost">{t('viewAnalytics', 'View analytics')}</Link>
      </div>
    </div>
  );
}

function LeadTable({ leads, stages, onOpen }: { leads: Lead[]; stages: Stage[]; onOpen: (id: string) => void }) {
  const { t } = useTranslation('crm');
  const stageName = (id: string | null) => stages.find((s) => s.id === id)?.name ?? '—';
  const headers = ['lead', 'company', 'stage', 'priority', 'score', 'source', 'contact'] as const;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <div className="overflow-x-auto">
        <table className="v-table">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h}>{t(`table.${h}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => {
              const tm = TEMP_META[l.temperature];
              return (
                <tr key={l.id} onClick={() => onOpen(l.id)} className="cursor-pointer">
                  <td className="font-bold text-ink">{l.name || t('table.unknownLead')}</td>
                  <td className="font-medium text-muted">{l.company || '—'}</td>
                  <td className="text-muted">{stageName(l.stageId)}</td>
                  <td>
                    <span className="v-chip !px-2 !py-0.5 !text-[10px] font-bold" style={{ background: tm.bg, color: tm.fg, borderColor: tm.border }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tm.dot }} /> {t(`temperature.${l.temperature.toLowerCase()}`)}
                    </span>
                  </td>
                  <td className="font-bold tabular-nums text-ink">{l.score}</td>
                  <td className="text-[12px] text-muted">{sourceMeta(l.source).label}</td>
                  <td className="truncate font-mono text-[11.5px] text-muted">{l.email || l.phone || '—'}</td>
                </tr>
              );
            })}
            {leads.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-16 text-center font-semibold text-muted">{t('table.noMatch')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
