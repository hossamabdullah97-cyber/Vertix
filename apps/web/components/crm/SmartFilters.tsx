'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { type Lead, type Temp, sourceMeta } from '@/lib/crm';

interface SavedFilter {
  id: string;
  name: string;
  tempFilter: Temp | 'ALL';
  sourceFilter: string;
  minDealValue: number;
}

const STORAGE_KEY = 'crm_saved_filters';

/**
 * Source and value filters plus saved combinations, in a menu anchored to its
 * button. Saved filters live in this browser; the first visit seeds three
 * starting points the user can delete.
 */
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setSavedFilters(JSON.parse(saved));
        return;
      } catch {
        // fall through to the defaults
      }
    }
    const defaults: SavedFilter[] = [
      { id: '1', name: t('filters.defaults.hot'), tempFilter: 'HOT', sourceFilter: 'ALL', minDealValue: 0 },
      { id: '2', name: t('filters.defaults.highValue'), tempFilter: 'ALL', sourceFilter: 'ALL', minDealValue: 100000 },
      { id: '3', name: t('filters.defaults.nfc'), tempFilter: 'ALL', sourceFilter: 'nfc_scan', minDealValue: 0 },
    ];
    setSavedFilters(defaults);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    // Seed once, in the language in use on first visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function persist(next: SavedFilter[]) {
    setSavedFilters(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function handleSaveFilter(e: React.FormEvent) {
    e.preventDefault();
    if (!newFilterName.trim()) return;
    persist([
      ...savedFilters,
      {
        id: `filter-${Date.now()}`,
        name: newFilterName.trim(),
        tempFilter: tempFilter || 'ALL',
        sourceFilter: sourceFilter || 'ALL',
        minDealValue,
      },
    ]);
    setNewFilterName('');
  }

  function handleRemoveFilter(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    persist(savedFilters.filter((f) => f.id !== id));
  }

  function applySavedFilter(f: SavedFilter) {
    setTempFilter(f.tempFilter === 'ALL' ? null : f.tempFilter);
    setSourceFilter(f.sourceFilter === 'ALL' ? null : f.sourceFilter);
    setMinDealValue(f.minDealValue);
    setOpen(false);
  }

  const sources = useMemo(() => Array.from(new Set(leads.map((l) => l.source))), [leads]);
  const activeCount = (tempFilter ? 1 : 0) + (sourceFilter ? 1 : 0) + (minDealValue > 0 ? 1 : 0);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium ring-1 ring-inset transition-colors sm:h-8 ${
          activeCount ? 'bg-accent/[0.06] text-accent ring-accent/30' : 'text-muted ring-line hover:bg-elevated hover:text-ink'
        }`}
      >
        <Icon name="filter" size={13} /> {t('filters.smartFilters')}
        {activeCount > 0 && (
          <span className="tabular flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-3xs font-semibold text-white">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 top-full z-40 mt-2 w-[300px] max-w-[calc(100vw-2.5rem)] rounded-xl border border-line bg-surface p-1.5 shadow-lg">
          <div className="space-y-3 p-2.5">
            <label className="block">
              <span className="mb-1.5 block text-xs text-faint">{t('filters.priority')}</span>
              <select value={tempFilter || ''} onChange={(e) => setTempFilter((e.target.value as Temp) || null)} className="v-field !text-sm">
                <option value="">{t('filters.allPriorities')}</option>
                <option value="HOT">{t('temperature.hot')}</option>
                <option value="WARM">{t('temperature.warm')}</option>
                <option value="COLD">{t('temperature.cold')}</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs text-faint">{t('filters.captureSource')}</span>
              <select value={sourceFilter || ''} onChange={(e) => setSourceFilter(e.target.value || null)} className="v-field !text-sm">
                <option value="">{t('filters.allSources')}</option>
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {t(`sources.${s}`, sourceMeta(s).label)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs text-faint">{t('filters.minDealValue')}</span>
              <input
                type="number"
                min={0}
                dir="ltr"
                value={minDealValue || ''}
                onChange={(e) => setMinDealValue(Number(e.target.value) || 0)}
                placeholder={t('filters.valuePlaceholder')}
                className="v-field tabular !text-sm"
              />
            </label>
          </div>

          <div className="border-t border-line p-2.5">
            <p className="mb-2 text-xs text-faint">{t('filters.savedFilters')}</p>
            <div className="flex flex-wrap gap-1.5">
              {savedFilters.map((f) => (
                <span key={f.id} className="group inline-flex items-center rounded-md ring-1 ring-inset ring-line">
                  <button onClick={() => applySavedFilter(f)} className="h-11 ps-2.5 pe-1.5 text-xs text-ink hover:text-accent sm:h-7">
                    {f.name}
                  </button>
                  <button
                    onClick={(e) => handleRemoveFilter(f.id, e)}
                    aria-label={t('filters.remove', { name: f.name })}
                    className="flex h-11 w-7 items-center justify-center text-faint hover:text-ink sm:h-7"
                  >
                    <Icon name="x" size={11} />
                  </button>
                </span>
              ))}
            </div>
            {activeCount > 0 && (
              <form onSubmit={handleSaveFilter} className="mt-2.5 flex gap-1.5">
                <input
                  value={newFilterName}
                  onChange={(e) => setNewFilterName(e.target.value)}
                  placeholder={t('filters.nameFilter')}
                  className="v-field !text-xs"
                />
                <button type="submit" disabled={!newFilterName.trim()} className="v-btn shrink-0 !text-xs">
                  {t('filters.save')}
                </button>
              </form>
            )}
          </div>

          {activeCount > 0 && (
            <div className="border-t border-line p-1">
              <button
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
                className="flex h-11 w-full items-center gap-2 rounded-lg px-2.5 text-xs text-muted hover:bg-elevated hover:text-ink sm:h-8"
              >
                <Icon name="x" size={12} /> {t('filters.clearAll')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
