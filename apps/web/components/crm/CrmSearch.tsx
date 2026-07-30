'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatDate } from '@/lib/format';
import { type Lead, type Task, initials, hueFor } from '@/lib/crm';

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  type: 'lead' | 'contact' | 'task' | 'meeting' | 'note';
  targetId: string; // The ID to navigate or open (usually leadId)
}

export function CrmSearch({
  leads,
  tasks,
  onOpenLead,
  onOpenView,
}: {
  leads: Lead[];
  tasks: Task[];
  onOpenLead: (id: string) => void;
  onOpenView: (view: 'overview' | 'board' | 'table' | 'contacts' | 'companies' | 'timeline' | 'meetings' | 'tasks' | 'notes' | 'reports') => void;
}) {
  const { t } = useTranslation('crm');
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Monitor global key presses for Ctrl+K / Cmd+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when search bar opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
      setSelectedIndex(0);
    } else {
      setQuery('');
    }
  }, [open]);

  // Aggregate searchable items
  const results = useMemo<SearchResult[]>(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();

    const list: SearchResult[] = [];

    // Search Leads
    leads.forEach((l) => {
      const matchesName = l.name?.toLowerCase().includes(q);
      const matchesCompany = l.company?.toLowerCase().includes(q);
      const matchesEmail = l.email?.toLowerCase().includes(q);
      const matchesPhone = l.phone?.toLowerCase().includes(q);
      const matchesSource = l.source?.toLowerCase().includes(q);

      if (matchesName || matchesCompany || matchesEmail || matchesPhone || matchesSource) {
        list.push({
          id: `lead-${l.id}`,
          title: l.name || t('contacts.unknownContact'),
          subtitle: t('search.leadIn', { company: l.company || t('search.directCapture'), priority: t(`temperature.${l.temperature.toLowerCase()}`) }),
          type: 'lead',
          targetId: l.id,
        });
      }
    });

    // Search Tasks
    tasks.forEach((tk) => {
      if (tk.title.toLowerCase().includes(q) || tk.notes?.toLowerCase().includes(q)) {
        list.push({
          id: `task-${tk.id}`,
          title: tk.title,
          subtitle: t('search.taskDue', { date: tk.dueDate ? formatDate(tk.dueDate, locale, { year: 'numeric', month: 'short', day: 'numeric' }) : t('search.noDate') }),
          type: 'task',
          targetId: tk.leadId || '',
        });
      }
    });

    return list.slice(0, 8); // Cap results at 8 items
  }, [query, leads, tasks, t, locale]);

  // Keyboard navigation logic
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const active = results[selectedIndex];
      if (active) {
        handleSelect(active);
      }
    }
  }

  function handleSelect(item: SearchResult) {
    setOpen(false);
    if (item.type === 'lead' || (item.type === 'task' && item.targetId)) {
      onOpenLead(item.targetId);
    } else if (item.type === 'note') {
      onOpenView('notes');
    }
  }

  return (
    <>
      {/* Global Shortcut Button (Clickable in toolbar) */}
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-[180px] items-center justify-between rounded-xl border border-line bg-canvas px-3.5 text-left text-[12.5px] font-semibold text-muted shadow-sm transition-colors hover:border-line-strong hover:text-ink md:w-[220px]"
      >
        <span className="flex items-center gap-1.5"><Icon name="search" size={14} /> {t('search.button')}</span>
        <kbd className="hidden rounded bg-canvas/60 border border-line/65 px-1.5 py-0.5 text-[9px] font-bold text-faint sm:inline-block">
          ⌘K
        </kbd>
      </button>

      {/* Backdrop & Command Menu Panel */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -20 }}
              transition={{ type: 'spring', stiffness: 350, damping: 32 }}
              onKeyDown={handleKeyDown}
              className="fixed inset-x-4 top-20 z-[110] mx-auto max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
            >
              {/* Search Field */}
              <div className="relative flex items-center border-b border-line px-4 py-3.5">
                <span className="text-muted"><Icon name="search" size={17} /></span>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedIndex(0);
                  }}
                  placeholder={t('search.placeholder')}
                  className="w-full bg-transparent ps-3 text-[14px] font-semibold text-ink outline-none placeholder:text-faint"
                />
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-line bg-canvas/30 px-1.5 py-0.5 text-[10px] font-bold text-faint hover:text-ink"
                >
                  ESC
                </button>
              </div>

              {/* Search Results list */}
              <div className="max-h-[300px] overflow-y-auto p-2.5 no-scrollbar">
                {results.length > 0 ? (
                  <div className="space-y-0.5">
                    {results.map((r, i) => {
                      const active = i === selectedIndex;
                      const hue = hueFor(r.title);
                      
                      let typeIcon = 'user';
                      let typeColor = 'var(--v-accent)';
                      if (r.type === 'task') { typeIcon = 'list'; typeColor = '#ef4444'; }
                      if (r.type === 'note') { typeIcon = 'file-text'; typeColor = '#3b82f6'; }

                      return (
                        <button
                          key={r.id}
                          onClick={() => handleSelect(r)}
                          className="w-full text-left rounded-xl p-3 flex items-center gap-3 transition-all focus:outline-none"
                          style={{
                            backgroundColor: active ? 'var(--v-accent)' : 'transparent',
                            color: active ? 'var(--v-accent-contrast)' : 'inherit',
                          }}
                        >
                          {/* Avatar */}
                          {r.type === 'lead' ? (
                            <span
                              className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold text-white shadow-sm"
                              style={{ background: `hsl(${hue} 62% 48%)` }}
                            >
                              {initials(r.title)}
                            </span>
                          ) : (
                            <span
                              className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-xl border border-line bg-canvas"
                              style={{ color: active ? 'inherit' : typeColor }}
                            >
                              <Icon name={typeIcon} size={14} />
                            </span>
                          )}

                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-bold truncate">{r.title}</p>
                            <p className={`text-[11px] truncate mt-0.5 ${active ? 'opacity-80' : 'text-muted'}`}>{r.subtitle}</p>
                          </div>

                          <Icon name="arrow" size={13} className={`shrink-0 ${active ? 'opacity-100' : 'opacity-0'} transition-opacity`} />
                        </button>
                      );
                    })}
                  </div>
                ) : query.trim() ? (
                  <div className="py-12 text-center text-faint">
                    <Icon name="inbox" size={24} className="mx-auto mb-2" />
                    <p className="text-[12.5px] font-semibold">{t('search.noResults', { query })}</p>
                  </div>
                ) : (
                  <div className="py-10 text-center text-muted">
                    <p className="text-[12px] font-bold uppercase tracking-wider text-faint mb-2">{t('search.jumpToView')}</p>
                    <div className="grid grid-cols-2 gap-2 max-w-sm mx-auto">
                      {[
                        { label: t('search.jump.board'), view: 'board', icon: 'columns' },
                        { label: t('search.jump.contacts'), view: 'contacts', icon: 'users' },
                        { label: t('search.jump.companies'), view: 'companies', icon: 'briefcase' },
                        { label: t('search.jump.reports'), view: 'reports', icon: 'chart-bar' },
                      ].map((item) => (
                        <button
                          key={item.view}
                          onClick={() => {
                            setOpen(false);
                            onOpenView(item.view as any);
                          }}
                          className="flex items-center gap-2 rounded-xl border border-line bg-canvas/30 px-3.5 py-2 text-[12px] font-bold text-ink hover:bg-canvas transition-colors"
                        >
                          <Icon name={item.icon} size={12} className="text-accent" />
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
