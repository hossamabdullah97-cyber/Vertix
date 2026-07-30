'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { type Lead, type Task, type TaskPriority, TASK_PRIORITY, dueMeta, initials, hueFor } from '@/lib/crm';

export function TasksView({
  leads,
  tasks,
  onAddTask,
  onToggleTask,
  onOpenLead,
}: {
  leads: Lead[];
  tasks: Task[];
  onAddTask: (input: { title: string; leadId?: string; priority?: TaskPriority; dueDate?: string }) => void;
  onToggleTask: (id: string, completed: boolean) => void;
  onOpenLead: (id: string) => void;
}) {
  const { t } = useTranslation('crm');
  const [filterTab, setFilterTab] = useState<'pending' | 'completed' | 'all'>('pending');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  
  // New task form state
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [selectedLeadId, setSelectedLeadId] = useState('');

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // 1. Completion tab
      if (filterTab === 'pending' && t.completed) return false;
      if (filterTab === 'completed' && !t.completed) return false;

      // 2. Priority
      if (priorityFilter !== 'ALL' && t.priority !== priorityFilter) return false;

      // 3. Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesLead = t.lead?.name?.toLowerCase().includes(q) || false;
        if (!matchesTitle && !matchesLead) return false;
      }

      return true;
    }).sort((a, b) => {
      // Sort: incomplete first, then sort by due date (overdue first)
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      
      const dueA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const dueB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return dueA - dueB;
    });
  }, [tasks, filterTab, priorityFilter, search]);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    onAddTask({
      title: title.trim(),
      leadId: selectedLeadId || undefined,
      priority,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
    });

    setTitle('');
    setDueDate('');
    setPriority('MEDIUM');
    setSelectedLeadId('');
    setShowAdd(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h2 className="text-[16px] font-bold text-ink">{t('tasks.title')}</h2>
          <p className="text-[12.5px] text-muted">{t('tasks.subtitle')}</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="v-btn !h-9 px-3.5 text-[12.5px]">
          <Icon name="plus" size={14} /> {t('tasks.add')}
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex min-w-[200px] flex-1 items-center">
          <span className="absolute start-3 text-faint"><Icon name="search" size={14} /></span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('tasks.searchPlaceholder')}
            className="v-field !h-9 !ps-9 text-[12px]"
          />
        </div>

        {/* Tab selector */}
        <div className="flex items-center gap-0.5 rounded-lg border border-line bg-canvas/50 p-0.5">
          {(['pending', 'completed', 'all'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterTab(tab)}
              className="px-3 py-1 text-[12px] font-bold capitalize rounded-md transition-all"
              style={filterTab === tab ? { background: 'var(--v-gradient-brand)', color: '#fff', boxShadow: 'var(--v-shadow-accent)' } : { color: 'hsl(var(--v-muted))' }}
            >
              {t(`tasks.tabs.${tab}`)}
            </button>
          ))}
        </div>

        {/* Priority Filter */}
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | 'ALL')}
          className="v-field !h-9 !w-auto text-[12px] font-semibold"
        >
          <option value="ALL">{t('tasks.filter.allPriorities')}</option>
          <option value="HIGH">{t('tasks.filter.high')}</option>
          <option value="MEDIUM">{t('tasks.filter.medium')}</option>
          <option value="LOW">{t('tasks.filter.low')}</option>
        </select>
      </div>

      {/* Task List */}
      {filteredTasks.length === 0 ? (
        <div className="v-card flex flex-col items-center justify-center py-20 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-canvas text-faint mb-3">
            <Icon name="list" size={24} />
          </span>
          <div>
            <p className="text-[14px] font-bold text-ink">{t('tasks.emptyTitle')}</p>
            <p className="mt-1 text-[12px] text-muted">{t('tasks.emptyDesc')}</p>
          </div>
        </div>
      ) : (
        <div className="v-card overflow-hidden">
          <div className="divide-y divide-line">
            <AnimatePresence initial={false}>
              {filteredTasks.map((tk) => {
                const pr = TASK_PRIORITY[tk.priority];
                const due = dueMeta(tk.dueDate);
                const isOverdue = !tk.completed && due.tone === 'overdue';
                const isToday = !tk.completed && due.tone === 'today';
                const toneColor = isOverdue ? '#ef4444' : isToday ? '#f59e0b' : 'hsl(var(--v-muted))';
                const hue = tk.lead?.name ? hueFor(tk.lead.name) : 0;

                return (
                  <motion.div
                    key={tk.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-canvas/30"
                  >
                    <button
                      onClick={() => onToggleTask(tk.id, !tk.completed)}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors focus:outline-none"
                      style={tk.completed ? { background: 'var(--v-accent)', borderColor: 'var(--v-accent)', color: 'var(--v-accent-contrast)' } : { borderColor: 'hsl(var(--v-border-strong))' }}
                    >
                      {tk.completed && <Icon name="check" size={13} />}
                    </button>

                    {/* Priority Dot */}
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: pr.color }} title={t('tasks.priorityTitle', { priority: t(`tasks.priorityOptions.${tk.priority.toLowerCase()}`) })} />

                    {/* Title */}
                    <div className="min-w-0 flex-1">
                      <p className={`text-[13px] font-bold ${tk.completed ? 'text-faint line-through' : 'text-ink'}`}>
                        {tk.title}
                      </p>
                    </div>

                    {/* Connected Lead Link */}
                    {tk.lead && (
                      <button
                        onClick={() => tk.leadId && onOpenLead(tk.leadId)}
                        className="hidden items-center gap-1.5 rounded-lg border border-line bg-canvas/30 px-2 py-1 text-[11.5px] font-semibold text-muted hover:border-line-strong hover:text-accent sm:flex"
                      >
                        <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full text-[8px] font-black text-white" style={{ background: `hsl(${hue} 62% 48%)` }}>
                          {initials(tk.lead.name)}
                        </span>
                        {tk.lead.name}
                      </button>
                    )}

                    {/* Due Date Indicator */}
                    <span className="w-24 shrink-0 text-end text-[11px] font-bold" style={{ color: tk.completed ? 'hsl(var(--v-faint))' : toneColor }}>
                      {due.label}
                    </span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Schedule task Modal overlay */}
      <AnimatePresence>
        {showAdd && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAdd(false)}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="fixed inset-x-4 top-20 z-50 mx-auto max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-2xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[14.5px] font-bold text-ink">{t('tasks.create')}</h3>
                <button onClick={() => setShowAdd(false)} className="text-muted hover:text-ink">
                  <Icon name="x" size={16} />
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">{t('tasks.description')}</label>
                  <input
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('tasks.descPlaceholder')}
                    className="v-field text-[13px]"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">{t('tasks.linkToLead')}</label>
                  <select
                    value={selectedLeadId}
                    onChange={(e) => setSelectedLeadId(e.target.value)}
                    className="v-field text-[13px]"
                  >
                    <option value="">{t('tasks.noLink')}</option>
                    {leads.map((l) => (
                      <option key={l.id} value={l.id}>{l.name || t('tasks.unknown')} - {l.company || t('tasks.noCompany')}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">{t('tasks.priority')}</label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as TaskPriority)}
                      className="v-field text-[13px]"
                    >
                      <option value="LOW">{t('tasks.priorityOptions.low')}</option>
                      <option value="MEDIUM">{t('tasks.priorityOptions.medium')}</option>
                      <option value="HIGH">{t('tasks.priorityOptions.high')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">{t('tasks.dueDate')}</label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="v-field text-[13px]"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowAdd(false)} className="v-btn v-btn-ghost !h-9 text-[12.5px]">{t('tasks.cancel')}</button>
                  <button type="submit" className="v-btn !h-9 text-[12.5px]">{t('tasks.add')}</button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
