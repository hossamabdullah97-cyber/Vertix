'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { useCountUp } from '@/lib/useCountUp';
import { type Lead, type Stage, type Temp, type Task, TEMP_META, TASK_PRIORITY, sourceMeta, initials, hueFor, relativeTime, isOverdue, isDueToday, dueMeta, wonStage, lostStage, formatMoney } from '@/lib/crm';

const SOURCE_COLORS = ['#2563eb', '#0ea5e9', '#22c55e', '#f59e0b', '#ec4899', '#3b82f6', '#14b8a6', '#ef4444'];
const DAY_MS = 86_400_000;

/** Executive CRM overview — every number is computed from the real lead list. */
export function CrmDashboard({
  leads,
  stages,
  tasks,
  onOpen,
  onToggleTask,
}: {
  leads: Lead[];
  stages: Stage[];
  tasks: Task[];
  onOpen: (id: string) => void;
  onToggleTask: (id: string, completed: boolean) => void;
}) {
  const { t } = useTranslation('crm');
  const openTasks = tasks.filter((t) => !t.completed);
  const dueTodayCount = openTasks.filter(isDueToday).length;
  const overdueTasks = openTasks.filter(isOverdue);
  // Overdue first, then due-today — the "act now" list.
  const todaysTasks = [...overdueTasks, ...openTasks.filter(isDueToday)];

  const m = useMemo(() => {
    const total = leads.length;
    const byTemp = { HOT: 0, WARM: 0, COLD: 0 } as Record<Temp, number>;
    leads.forEach((l) => (byTemp[l.temperature] += 1));

    // Won / Lost resolved by stage NAME (last stage is "Lost", not "Won").
    const wonId = wonStage(stages)?.id;
    const lostId = lostStage(stages)?.id;
    const won = wonId ? leads.filter((l) => l.stageId === wonId).length : 0;
    const lost = lostId ? leads.filter((l) => l.stageId === lostId).length : 0;

    // Money. Pipeline value = open deals (not won/lost); won value = closed-won.
    const openLeads = leads.filter((l) => l.stageId !== wonId && l.stageId !== lostId);
    const pipelineValue = openLeads.reduce((s, l) => s + l.value, 0);
    const wonValue = wonId ? leads.filter((l) => l.stageId === wonId).reduce((s, l) => s + l.value, 0) : 0;
    const withValue = leads.filter((l) => l.value > 0).length;
    const avgDeal = withValue ? Math.round(leads.reduce((s, l) => s + l.value, 0) / withValue) : 0;

    // per-stage counts + value (pipeline funnel)
    const stageStats = stages.map((s) => {
      const items = leads.filter((l) => (l.stageId ?? stages[0]?.id) === s.id);
      return { stage: s, count: items.length, value: items.reduce((a, l) => a + l.value, 0) };
    });

    // sources breakdown
    const srcMap = new Map<string, number>();
    leads.forEach((l) => srcMap.set(l.source, (srcMap.get(l.source) ?? 0) + 1));
    const sources = [...srcMap.entries()].sort((a, b) => b[1] - a[1]).map(([key, count], i) => ({ key, count, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }));

    // last 7 days trend
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const week = Array.from({ length: 7 }, (_, i) => {
      const dayStart = start - (6 - i) * DAY_MS;
      const count = leads.filter((l) => { const t = new Date(l.createdAt).getTime(); return t >= dayStart && t < dayStart + DAY_MS; }).length;
      return { label: new Date(dayStart).toLocaleDateString(undefined, { weekday: 'short' }), count };
    });

    const recent = [...leads].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 6);

    return {
      total, byTemp, won, lost, pipelineValue, wonValue, avgDeal,
      conv: total ? Math.round((won / total) * 100) : 0,
      stageStats, sources, week, recent,
    };
  }, [leads, stages]);

  const maxStage = Math.max(1, ...m.stageStats.map((s) => s.count));
  const maxDay = Math.max(1, ...m.week.map((d) => d.count));

  return (
    <div className="space-y-5">
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('dash.totalLeads')} value={m.total} icon="users" />
        <Stat label={t('dash.pipelineValue')} value={m.pipelineValue} money icon="chart-bar" tint="#10b981" />
        <Stat label={t('dash.wonDeals')} value={m.won} icon="check" tint="#2563eb" />
        <Stat label={t('dash.lostDeals')} value={m.lost} icon="x" tint="#94a3b8" />
        <Stat label={t('dash.conversion')} value={m.conv} suffix="%" icon="gauge" />
        <Stat label={t('dash.avgDeal')} value={m.avgDeal} money icon="sparkle" tint="#3b82f6" />
        <Stat label={t('dash.openTasks')} value={openTasks.length} icon="list" tint="#0ea5e9" />
        <Stat label={t('dash.dueToday')} value={dueTodayCount} icon="clock" tint={overdueTasks.length ? '#ef4444' : '#f59e0b'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Pipeline funnel */}
        <Panel title={t('dash.pipelineOverview')} icon="columns">
          <div className="space-y-2.5">
            {m.stageStats.map(({ stage, count, value }) => (
              <div key={stage.id} className="flex items-center gap-3">
                <span className="w-24 shrink-0 truncate text-[12px] font-semibold text-muted">{stage.name}</span>
                <div className="relative h-7 flex-1 overflow-hidden rounded-lg bg-canvas">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(count / maxStage) * 100}%` }}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    className="flex h-full min-w-[2px] items-center rounded-lg"
                    style={{ background: stage.color ?? 'var(--v-accent)' }}
                  />
                  <span className="absolute inset-y-0 start-2.5 flex items-center text-[11px] font-bold text-ink mix-blend-difference">{count > 0 ? count : ''}</span>
                </div>
                <span className="w-16 shrink-0 text-end text-[11px] font-semibold text-faint">{formatMoney(value)}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Lead sources donut */}
        <Panel title={t('dash.leadSources')} icon="tag">
          {m.sources.length === 0 ? (
            <EmptyMini text={t('dash.noSources')} />
          ) : (
            <div className="flex items-center gap-5">
              <Donut data={m.sources} total={m.total} />
              <div className="min-w-0 flex-1 space-y-2">
                {m.sources.map((s) => (
                  <div key={s.key} className="flex items-center gap-2 text-[12px]">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">{sourceMeta(s.key).label}</span>
                    <span className="shrink-0 font-bold tabular-nums text-muted">{s.count}</span>
                    <span className="w-9 shrink-0 text-end text-[11px] text-faint">{Math.round((s.count / m.total) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        {/* New leads this week */}
        <Panel title={t('dash.newLeads7d')} icon="chart-bar">
          <div className="flex h-40 items-end justify-between gap-2 pt-2">
            {m.week.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-[11px] font-bold tabular-nums text-muted">{d.count || ''}</span>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${(d.count / maxDay) * 100}%` }}
                  transition={{ duration: 0.6, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full rounded-t-md"
                  style={{ background: d.count ? 'var(--v-gradient-brand)' : 'hsl(var(--v-border))', minHeight: 4 }}
                />
                <span className="text-[10px] font-semibold text-faint">{d.label}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Recent captures */}
        <Panel title={t('dash.recentCaptures')} icon="inbox">
          {m.recent.length === 0 ? (
            <EmptyMini text={t('dash.noCaptures')} />
          ) : (
            <div className="divide-y divide-line">
              {m.recent.map((l) => {
                const tm = TEMP_META[l.temperature];
                const hue = hueFor(l.name || l.id);
                const src = sourceMeta(l.source);
                return (
                  <button key={l.id} onClick={() => onOpen(l.id)} className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-canvas/40">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: `hsl(${hue} 62% 48%)` }}>
                      {initials(l.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-ink">{l.name || t('table.unknownLead')}</p>
                      <p className="truncate text-[11px] text-muted">{l.company || sourceMeta(l.source).label}</p>
                    </div>
                    <span className="hidden items-center gap-1 text-[10.5px] font-semibold text-faint sm:flex"><Icon name={src.icon} size={11} /> {src.label}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: tm.dot }} />
                      <span className="w-14 text-end text-[11px] text-faint">{relativeTime(l.createdAt)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* Today's tasks — overdue + due today, complete inline */}
      <Panel title={t('dash.todaysTasks')} icon="list">
        {todaysTasks.length === 0 ? (
          <EmptyMini text={t('dash.nothingDue')} />
        ) : (
          <div className="divide-y divide-line">
            {todaysTasks.map((t) => (
              <TaskRow key={t.id} task={t} onToggle={onToggleTask} onOpenLead={onOpen} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function TaskRow({ task, onToggle, onOpenLead }: { task: Task; onToggle: (id: string, c: boolean) => void; onOpenLead: (id: string) => void }) {
  const { t } = useTranslation('crm');
  const pr = TASK_PRIORITY[task.priority];
  const due = dueMeta(task.dueDate);
  const toneColor = due.tone === 'overdue' ? '#ef4444' : due.tone === 'today' ? '#f59e0b' : 'hsl(var(--v-faint))';
  return (
    <div className="flex items-center gap-3 py-2.5">
      <button
        onClick={() => onToggle(task.id, !task.completed)}
        aria-label={task.completed ? t('dash.markIncomplete') : t('dash.markComplete')}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors"
        style={task.completed ? { background: 'var(--v-accent)', borderColor: 'var(--v-accent)', color: 'var(--v-accent-contrast)' } : { borderColor: 'hsl(var(--v-border-strong))' }}
      >
        {task.completed && <Icon name="check" size={13} />}
      </button>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: pr.color }} title={`${pr.label} priority`} />
      <p className={`min-w-0 flex-1 truncate text-[13px] font-semibold ${task.completed ? 'text-faint line-through' : 'text-ink'}`}>{task.title}</p>
      {task.lead?.name && (
        <button onClick={() => task.leadId && onOpenLead(task.leadId)} className="hidden shrink-0 text-[11px] font-semibold text-muted hover:text-accent sm:block">
          {task.lead.name}
        </button>
      )}
      <span className="w-20 shrink-0 text-end text-[11px] font-bold" style={{ color: toneColor }}>{due.label}</span>
    </div>
  );
}

function Stat({ label, value, icon, tint, suffix, money }: { label: string; value: number; icon: string; tint?: string; suffix?: string; money?: boolean }) {
  const v = useCountUp(value, 900);
  return (
    <div className="v-stat">
      <div className="flex items-center justify-between">
        <span className="v-stat-label">{label}</span>
        <span
          className="flex h-8 w-8 items-center justify-center rounded-[10px]"
          style={{ background: tint ? `${tint}1a` : 'var(--v-accent-soft)', color: tint ?? 'var(--v-accent)' }}
        >
          <Icon name={icon} size={15} />
        </span>
      </div>
      <p className="v-stat-value mt-3 tabular-nums" style={tint ? { color: tint } : undefined}>
        {money ? formatMoney(v) : v}{suffix}
      </p>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="v-card p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="v-icon-tile !h-8 !w-8"><Icon name={icon} size={15} /></span>
        <h3 className="text-[14px] font-extrabold tracking-tight text-ink">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function EmptyMini({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center text-faint">
      <Icon name="inbox" size={22} />
      <span className="text-[12px] font-semibold">{text}</span>
    </div>
  );
}

/** Lightweight SVG donut — no chart library. */
function Donut({ data, total }: { data: { key: string; count: number; color: string }[]; total: number }) {
  const size = 120;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--v-border))" strokeWidth={stroke} />
      {data.map((s) => {
        const frac = s.count / total;
        const dash = frac * c;
        const el = (
          <circle
            key={s.key}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={-offset}
          />
        );
        offset += dash;
        return el;
      })}
      <text x="50%" y="50%" className="rotate-90" transform={`rotate(90 ${size / 2} ${size / 2})`} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 22, fontWeight: 800, fill: 'hsl(var(--v-fg))' }}>
        {total}
      </text>
    </svg>
  );
}
