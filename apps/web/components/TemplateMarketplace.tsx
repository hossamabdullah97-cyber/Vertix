'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { TEMPLATES, type Template } from '@/lib/templates';
import { readableOn, shade } from '@/lib/color';

/* ---------- metadata derived from the template itself (no invented ratings) ---------- */
/** Style family, a product name shown as-is in every language. */
function family(t: Template): string {
  if (t.id.startsWith('swiss')) return 'Swiss';
  if (t.id.startsWith('noir')) return 'Noir';
  if (t.id === 'carbon') return 'Carbon';
  if (t.id === 'onyx') return 'Onyx';
  return 'Signature';
}
function coverOf(t: Template): NonNullable<Template['cover']> {
  return t.cover ?? (t.mode === 'dark' ? 'constellation' : 'gradient');
}
const FAV_KEY = 'vertex_template_favs';
const MAX_COMPARE = 4;

/* ---------- a small drawing of the card in the template's real colours ---------- */
function MiniPreview({ t, cta }: { t: Template; cta: string }) {
  const accent = t.accent;
  const contrast = readableOn(accent);
  const dark = t.mode === 'dark';
  const cover = coverOf(t);
  const round = t.avatar === 'square' ? 'rounded-[9px]' : 'rounded-full';
  return (
    <div
      className="overflow-hidden rounded-lg"
      style={{ background: dark ? '#0e0e12' : '#ffffff', boxShadow: `inset 0 0 0 1px ${dark ? '#23232b' : '#e7e5e4'}` }}
      aria-hidden
    >
      <div className="relative h-12">
        {cover === 'constellation' ? (
          <div className="absolute inset-0" style={{ background: '#0b0b0e' }}>
            <span className="absolute inset-0" style={{ background: `radial-gradient(70% 90% at 30% 10%, ${accent}55, transparent 70%)` }} />
          </div>
        ) : cover === 'solid' ? (
          <div className="absolute inset-0" style={{ background: accent }} />
        ) : (
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${accent}, ${shade(accent, -46)})` }} />
        )}
      </div>
      <div className="px-3 pb-3">
        {/* `relative` lifts the avatar above the positioned cover it overlaps. */}
        <div className="relative -mt-4 mb-2">
          <div
            className={`flex h-8 w-8 items-center justify-center text-xs font-semibold ${round}`}
            style={{ background: accent, color: contrast, boxShadow: `0 0 0 2px ${dark ? '#0e0e12' : '#fff'}` }}
          >
            A
          </div>
        </div>
        <div className="h-1.5 w-2/3 rounded" style={{ background: dark ? '#26262e' : '#e7e5e4' }} />
        <div className="mt-1 h-1.5 w-1/2 rounded" style={{ background: dark ? '#1c1c22' : '#f0efed' }} />
        <div
          className="mt-2.5 flex h-6 items-center justify-center rounded-md text-[9.5px] font-medium"
          style={{ background: accent, color: contrast }}
        >
          {cta}
        </div>
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 rounded-lg bg-elevated p-0.5 ring-1 ring-inset ring-line">
      {options.map((o) => (
        <button
          key={o.key}
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          className={`h-11 rounded-md px-3 text-xs font-medium transition-colors sm:h-8 ${
            value === o.key ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TemplateMarketplace({
  currentTemplateId,
  onApply,
  applyingId,
}: {
  currentTemplateId: string;
  onApply: (t: Template) => void;
  applyingId?: string | null;
}) {
  const { t } = useTranslation('cardEditor');
  const [query, setQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | 'light' | 'dark'>('all');
  const [familyFilter, setFamilyFilter] = useState<string | null>(null);
  const [favOnly, setFavOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [compare, setCompare] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  useEffect(() => {
    try {
      setFavorites(JSON.parse(localStorage.getItem(FAV_KEY) || '[]'));
    } catch {
      // storage unavailable: start with no favourites
    }
  }, []);

  function toggleFav(id: string) {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(next));
      } catch {
        // favourites still work for this visit
      }
      return next;
    });
  }

  function toggleCompare(id: string) {
    setCompare((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_COMPARE ? prev : [...prev, id]));
  }
  const compareTemplates = TEMPLATES.filter((tpl) => compare.includes(tpl.id));

  const families = useMemo(() => Array.from(new Set(TEMPLATES.map(family))), []);
  const modeLabel = (mode: Template['mode']) => (mode === 'dark' ? t('design.darkMode') : t('design.lightMode'));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TEMPLATES.filter((tpl) => {
      if (modeFilter !== 'all' && tpl.mode !== modeFilter) return false;
      if (familyFilter && family(tpl) !== familyFilter) return false;
      if (favOnly && !favorites.includes(tpl.id)) return false;
      if (q && !`${tpl.name} ${family(tpl)} ${tpl.mode} ${modeLabel(tpl.mode)}`.toLowerCase().includes(q)) return false;
      return true;
    });
    // modeLabel only depends on the language, which re-renders this component anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, modeFilter, familyFilter, favOnly, favorites]);

  const filtersActive = Boolean(query || modeFilter !== 'all' || familyFilter || favOnly);
  const cta = t('templates.miniCta');

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex min-w-[200px] flex-1 items-center">
          <span className="pointer-events-none absolute start-3 text-faint">
            <Icon name="search" size={14} />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('templates.searchPlaceholder')}
            aria-label={t('templates.searchPlaceholder')}
            className="v-field !ps-9"
          />
        </div>
        <Segmented
          label={t('design.themeMode')}
          value={modeFilter}
          onChange={setModeFilter}
          options={[
            { key: 'all', label: t('templates.all') },
            { key: 'light', label: t('design.lightMode') },
            { key: 'dark', label: t('design.darkMode') },
          ]}
        />
        <button
          onClick={() => setFavOnly((f) => !f)}
          aria-pressed={favOnly}
          className={`v-btn v-btn-ghost ${favOnly ? '!bg-elevated' : ''}`}
        >
          <Icon name="star" size={14} className={favOnly ? 'fill-current text-amber-500' : undefined} />
          {t('templates.favourites')}
          {favorites.length > 0 && <span className="tabular text-faint">{favorites.length}</span>}
        </button>
      </div>

      {/* Style families */}
      <div className="flex items-center gap-3">
        <div className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {[null, ...families].map((f) => {
            const selected = familyFilter === f;
            return (
              <button
                key={f ?? 'all'}
                onClick={() => setFamilyFilter(f)}
                aria-pressed={selected}
                className={`h-11 shrink-0 rounded-md px-2.5 text-xs transition-colors sm:h-7 ${
                  selected ? 'bg-elevated font-medium text-ink ring-1 ring-inset ring-line' : 'text-muted hover:text-ink'
                }`}
              >
                {f ?? t('templates.allStyles')}
              </button>
            );
          })}
        </div>
        <span className="tabular shrink-0 text-xs text-faint">{t('templates.count', { count: filtered.length })}</span>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-6 py-14 text-center">
          <p className="text-sm text-muted">{t('templates.empty')}</p>
          {filtersActive && (
            <button
              onClick={() => {
                setQuery('');
                setModeFilter('all');
                setFamilyFilter(null);
                setFavOnly(false);
              }}
              className="v-btn v-btn-ghost"
            >
              {t('templates.clearFilters')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {filtered.map((tpl) => {
            const active = tpl.id === currentTemplateId;
            const fav = favorites.includes(tpl.id);
            const inCompare = compare.includes(tpl.id);
            const applying = applyingId === tpl.id;
            return (
              <div
                key={tpl.id}
                className={`group flex flex-col rounded-xl bg-surface p-2 transition-shadow ${
                  active
                    ? 'shadow-[inset_0_0_0_1.5px_var(--v-accent),0_0_0_3px_rgba(var(--v-accent-rgb),0.15)]'
                    : 'ring-1 ring-inset ring-line hover:ring-[hsl(var(--v-border-strong))]'
                }`}
              >
                <button
                  onClick={() => !active && onApply(tpl)}
                  disabled={applying}
                  aria-label={`${active ? t('templates.applied') : t('templates.apply')}: ${tpl.name}`}
                  className="block rounded-lg text-start outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <MiniPreview t={tpl} cta={cta} />
                </button>

                <div className="flex items-start gap-1 px-1 pt-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{tpl.name}</p>
                    <p className="truncate text-xs text-faint">
                      {family(tpl)} · {modeLabel(tpl.mode)}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleFav(tpl.id)}
                    aria-pressed={fav}
                    aria-label={fav ? t('platformPicker.unfavorite') : t('platformPicker.favorite')}
                    title={fav ? t('platformPicker.unfavorite') : t('platformPicker.favorite')}
                    className={`flex h-11 w-9 shrink-0 items-center justify-center rounded-md transition-colors sm:h-7 sm:w-7 ${
                      fav ? 'text-amber-500' : 'text-faint hover:bg-elevated hover:text-ink'
                    }`}
                  >
                    <Icon name="star" size={14} className={fav ? 'fill-current' : undefined} />
                  </button>
                  <button
                    onClick={() => toggleCompare(tpl.id)}
                    aria-pressed={inCompare}
                    disabled={!inCompare && compare.length >= MAX_COMPARE}
                    aria-label={inCompare ? t('templates.compareRemove') : t('templates.compareAdd')}
                    title={inCompare ? t('templates.compareRemove') : t('templates.compareAdd')}
                    className={`flex h-11 w-9 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-40 sm:h-7 sm:w-7 ${
                      inCompare ? 'bg-accent/10 text-accent' : 'text-faint hover:bg-elevated hover:text-ink'
                    }`}
                  >
                    <Icon name="columns" size={14} />
                  </button>
                </div>

                <div className="px-1 pb-1 pt-2">
                  {active ? (
                    <span className="flex h-11 items-center justify-center gap-1.5 text-xs font-medium text-accent sm:h-8">
                      <Icon name="check" size={13} /> {t('templates.applied')}
                    </span>
                  ) : (
                    <button onClick={() => onApply(tpl)} disabled={applying} className="v-btn v-btn-ghost w-full !h-11 sm:!h-8">
                      {applying ? (
                        <>
                          <Icon name="loader" size={13} className="animate-spin" /> {t('templates.applying')}
                        </>
                      ) : (
                        t('templates.apply')
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Compare tray */}
      <AnimatePresence>
        {compare.length > 0 && !compareOpen && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed inset-x-0 bottom-[calc(1.25rem+var(--v-dock,0px))] z-40 mx-auto flex w-fit items-center gap-3 rounded-xl border border-line bg-surface py-2 pe-2 ps-4 shadow-lg"
          >
            <span className="text-xs text-ink">{t('templates.selected', { count: compare.length })}</span>
            <div className="flex -space-x-1.5 rtl:space-x-reverse">
              {compareTemplates.map((tpl) => (
                <span key={tpl.id} className="h-5 w-5 rounded-full ring-2 ring-surface" style={{ background: tpl.accent }} title={tpl.name} />
              ))}
            </div>
            <button onClick={() => setCompareOpen(true)} disabled={compare.length < 2} className="v-btn !h-8 disabled:opacity-50">
              <Icon name="columns" size={13} /> {t('templates.compare')}
            </button>
            <button
              onClick={() => setCompare([])}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-ink"
              aria-label={t('templates.clearCompare')}
            >
              <Icon name="x" size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <CompareView
        open={compareOpen}
        templates={compareTemplates}
        currentTemplateId={currentTemplateId}
        onApply={onApply}
        onRemove={toggleCompare}
        onClose={() => setCompareOpen(false)}
      />
    </div>
  );
}

/* ---------- side-by-side comparison of the real, derived attributes ---------- */
function CompareRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="border-t border-line align-top">
      <td className="w-28 py-3 pe-3 text-xs text-faint">{label}</td>
      {children}
    </tr>
  );
}

function CompareView({
  open,
  templates,
  currentTemplateId,
  onApply,
  onRemove,
  onClose,
}: {
  open: boolean;
  templates: Template[];
  currentTemplateId: string;
  onApply: (t: Template) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('cardEditor');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && templates.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t('templates.compareTitle')}
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={(e) => e.stopPropagation()}
            className="my-8 w-full max-w-[880px] overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <div>
                <h2 className="text-md font-semibold text-ink">{t('templates.compareTitle')}</h2>
                <p className="text-xs text-faint">{t('templates.compareCount', { count: templates.length })}</p>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-ink"
                aria-label={t('templates.close')}
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto px-5 py-4">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <td className="w-28" />
                    {templates.map((tpl) => (
                      <td key={tpl.id} className="px-2 pb-3 align-top" style={{ minWidth: 150 }}>
                        <div className="relative">
                          <button
                            onClick={() => onRemove(tpl.id)}
                            className="absolute -end-1.5 -top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-surface text-muted shadow-sm ring-1 ring-line hover:text-ink"
                            aria-label={`${t('templates.compareRemove')}: ${tpl.name}`}
                          >
                            <Icon name="x" size={11} />
                          </button>
                          <MiniPreview t={tpl} cta={t('templates.miniCta')} />
                        </div>
                        <p className="mt-2 truncate text-sm font-medium text-ink">{tpl.name}</p>
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <CompareRow label={t('templates.rows.style')}>
                    {templates.map((tpl) => (
                      <td key={tpl.id} className="px-2 py-3 text-sm text-ink">
                        {family(tpl)}
                      </td>
                    ))}
                  </CompareRow>
                  <CompareRow label={t('design.themeMode')}>
                    {templates.map((tpl) => (
                      <td key={tpl.id} className="px-2 py-3 text-sm text-ink">
                        {tpl.mode === 'dark' ? t('design.darkMode') : t('design.lightMode')}
                      </td>
                    ))}
                  </CompareRow>
                  <CompareRow label={t('design.accent')}>
                    {templates.map((tpl) => (
                      <td key={tpl.id} className="px-2 py-3">
                        <span className="flex items-center gap-1.5">
                          {[tpl.accent, shade(tpl.accent, -40), shade(tpl.accent, 40)].map((c, i) => (
                            <span key={i} className="h-4 w-4 rounded-full ring-1 ring-inset ring-black/10" style={{ background: c }} />
                          ))}
                          <span dir="ltr" className="ms-1 font-mono text-2xs text-muted">
                            {tpl.accent}
                          </span>
                        </span>
                      </td>
                    ))}
                  </CompareRow>
                  <CompareRow label={t('design.cover')}>
                    {templates.map((tpl) => (
                      <td key={tpl.id} className="px-2 py-3 text-sm text-muted">
                        {t(`design.covers.${coverOf(tpl)}`)}
                      </td>
                    ))}
                  </CompareRow>
                  <CompareRow label={t('templates.rows.avatar')}>
                    {templates.map((tpl) => (
                      <td key={tpl.id} className="px-2 py-3 text-sm text-muted">
                        {t(`templates.avatars.${tpl.avatar ?? 'circle'}`)}
                      </td>
                    ))}
                  </CompareRow>
                  <CompareRow label="">
                    {templates.map((tpl) => {
                      const active = tpl.id === currentTemplateId;
                      return (
                        <td key={tpl.id} className="px-2 py-3">
                          {active ? (
                            <span className="flex h-8 items-center justify-center gap-1.5 text-xs font-medium text-accent">
                              <Icon name="check" size={13} /> {t('templates.applied')}
                            </span>
                          ) : (
                            <button onClick={() => onApply(tpl)} className="v-btn v-btn-ghost !h-8 w-full">
                              {t('templates.apply')}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </CompareRow>
                </tbody>
              </table>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
