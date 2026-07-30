'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { type Lead, type Temp } from '@/lib/crm';

interface SavedFilter {
  id: string;
  name: string;
  tempFilter: Temp | 'ALL';
  sourceFilter: string;
  minDealValue: number;
}

export function SmartFilters({
  leads,
  tempFilter,
  setTempFilter,
  sourceFilter,
  setSourceFilter,
  minDealValue,
  setMinDealValue,
  onClear,
}: {
  leads: Lead[];
  tempFilter: Temp | null;
  setTempFilter: (t: Temp | null) => void;
  sourceFilter: string | null;
  setSourceFilter: (s: string | null) => void;
  minDealValue: number;
  setMinDealValue: (v: number) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation('crm');
  const [open, setOpen] = useState(false);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [newFilterName, setNewFilterName] = useState('');

  // Load saved filters on mount
  useEffect(() => {
    const saved = localStorage.getItem('crm_saved_filters');
    if (saved) {
      try {
        setSavedFilters(JSON.parse(saved));
      } catch {
        // Fallback
      }
    } else {
      const defaults: SavedFilter[] = [
        { id: '1', name: '🔥 Hot Priority', tempFilter: 'HOT', sourceFilter: 'ALL', minDealValue: 0 },
        { id: '2', name: '💰 High Value (+$10k)', tempFilter: 'ALL', sourceFilter: 'ALL', minDealValue: 10000 },
        { id: '3', name: '📱 NFC scan taps', tempFilter: 'ALL', sourceFilter: 'nfc_scan', minDealValue: 0 },
      ];
      setSavedFilters(defaults);
      localStorage.setItem('crm_saved_filters', JSON.stringify(defaults));
    }
  }, []);

  // Save a custom filter
  function handleSaveFilter(e: React.FormEvent) {
    e.preventDefault();
    if (!newFilterName.trim()) return;

    const newFilter: SavedFilter = {
      id: `filter-${Date.now()}`,
      name: newFilterName.trim(),
      tempFilter: tempFilter || 'ALL',
      sourceFilter: sourceFilter || 'ALL',
      minDealValue: minDealValue,
    };

    const next = [...savedFilters, newFilter];
    setSavedFilters(next);
    localStorage.setItem('crm_saved_filters', JSON.stringify(next));
    setNewFilterName('');
  }

  function handleRemoveFilter(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const next = savedFilters.filter((f) => f.id !== id);
    setSavedFilters(next);
    localStorage.setItem('crm_saved_filters', JSON.stringify(next));
  }

  function applySavedFilter(f: SavedFilter) {
    setTempFilter(f.tempFilter === 'ALL' ? null : f.tempFilter);
    setSourceFilter(f.sourceFilter === 'ALL' ? null : f.sourceFilter);
    setMinDealValue(f.minDealValue);
    setOpen(false);
  }

  const sources = useMemo(() => Array.from(new Set(leads.map((l) => l.source))), [leads]);

  const activeFiltersCount = (tempFilter ? 1 : 0) + (sourceFilter ? 1 : 0) + (minDealValue > 0 ? 1 : 0);

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-1.5 rounded-xl border border-line bg-canvas px-3.5 text-[12.5px] font-bold text-muted hover:border-line-strong hover:text-ink relative shadow-sm"
      >
        <Icon name="filter" size={14} /> {t('filters.smartFilters')}
        {activeFiltersCount > 0 && (
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1.5 text-[9.5px] font-bold text-accent-contrast">
            {activeFiltersCount}
          </span>
        )}
      </button>

      {/* Popover overlay */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed right-6 top-24 z-50 w-[300px] rounded-2xl border border-line bg-surface p-4.5 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-line pb-2.5">
                <span className="text-[13px] font-bold text-ink flex items-center gap-1.5"><Icon name="filter" size={13} /> {t('filters.dashboard')}</span>
                <button onClick={() => setOpen(false)} className="text-muted hover:text-ink"><Icon name="x" size={15} /></button>
              </div>

              {/* Filters Form */}
              <div className="space-y-3.5">
                {/* Temp Priority */}
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">{t('filters.priority')}</label>
                  <select
                    value={tempFilter || ''}
                    onChange={(e) => setTempFilter((e.target.value as Temp) || null)}
                    className="v-field text-[12px] font-semibold"
                  >
                    <option value="">{t('filters.allPriorities')}</option>
                    <option value="HOT">{t('temperature.hot')}</option>
                    <option value="WARM">{t('temperature.warm')}</option>
                    <option value="COLD">{t('temperature.cold')}</option>
                  </select>
                </div>

                {/* Source */}
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">{t('filters.captureSource')}</label>
                  <select
                    value={sourceFilter || ''}
                    onChange={(e) => setSourceFilter(e.target.value || null)}
                    className="v-field text-[12px] font-semibold"
                  >
                    <option value="">{t('filters.allSources')}</option>
                    {sources.map((s) => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>

                {/* Min Value */}
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">{t('filters.minDealValue')}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      dir="ltr"
                      value={minDealValue || ''}
                      onChange={(e) => setMinDealValue(Number(e.target.value) || 0)}
                      placeholder={t('filters.valuePlaceholder')}
                      className="v-field text-[12.5px] font-bold"
                    />
                    {minDealValue > 0 && (
                      <button
                        onClick={() => setMinDealValue(0)}
                        className="text-faint hover:text-red-500"
                        title={t('filters.clearValue')}
                      >
                        <Icon name="x" size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Saved Filters Area */}
              <div className="border-t border-line pt-3.5 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted block">{t('filters.savedFilters')}</span>
                
                <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto no-scrollbar py-0.5">
                  {savedFilters.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => applySavedFilter(f)}
                      className="group/btn inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas/30 px-3 py-1 text-[11px] font-semibold text-muted hover:border-line-strong hover:text-ink"
                    >
                      {f.name}
                      <span
                        onClick={(e) => handleRemoveFilter(f.id, e)}
                        className="h-3 w-3 items-center justify-center rounded-full bg-line text-faint hover:bg-red-500 hover:text-white hidden group-hover/btn:inline-flex"
                      >
                        <Icon name="x" size={8} />
                      </span>
                    </button>
                  ))}
                </div>

                {/* Save Current Filter Form */}
                {activeFiltersCount > 0 && (
                  <form onSubmit={handleSaveFilter} className="flex gap-1.5 pt-1.5">
                    <input
                      value={newFilterName}
                      onChange={(e) => setNewFilterName(e.target.value)}
                      placeholder={t('filters.nameFilter')}
                      className="v-field !h-8 px-2.5 text-[11.5px] font-semibold flex-1"
                    />
                    <button
                      type="submit"
                      disabled={!newFilterName.trim()}
                      className="v-btn !h-8 !px-3 text-[11.5px] font-bold disabled:opacity-50"
                    >
                      {t('filters.save')}
                    </button>
                  </form>
                )}
              </div>

              {/* Clear Options */}
              {activeFiltersCount > 0 && (
                <button
                  onClick={() => {
                    onClear();
                    setOpen(false);
                  }}
                  className="v-btn v-btn-ghost w-full !h-8.5 text-[12px] font-bold border border-red-500/20 text-red-500 hover:bg-red-500/5 mt-2"
                >
                  <Icon name="x" size={12} /> {t('filters.clearAll')}
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
