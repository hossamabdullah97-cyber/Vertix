'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@/components/Icon';
import { TEMPLATES, type Template } from '@/lib/templates';

/* ---------- real, derived metadata (no fabricated ratings/downloads) ---------- */
function shade(hex: string, amt: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const c = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${c(parseInt(m[1], 16) + amt)}${c(parseInt(m[2], 16) + amt)}${c(parseInt(m[3], 16) + amt)}`;
}
function contrastOf(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return '#ffffff';
  const L = [1, 2, 3].map((i) => { const c = parseInt(m[i], 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * L[0] + 0.7152 * L[1] + 0.0722 * L[2] > 0.6 ? '#141414' : '#ffffff';
}
function family(t: Template): string {
  if (t.id.startsWith('swiss')) return 'Swiss';
  if (t.id.startsWith('noir')) return 'Noir';
  if (t.id === 'carbon') return 'Carbon';
  if (t.id === 'onyx') return 'Onyx';
  return 'Signature';
}
function isMono(t: Template): boolean {
  return /^#(fff|e5e5e5|ffffff|141414|0a0a0a)/i.test(t.accent) || family(t) === 'Carbon';
}
function tagsFor(t: Template): string[] {
  const tags = [t.mode === 'dark' ? 'Dark' : 'Light', family(t)];
  if (isMono(t)) tags.push('Monochrome');
  if (t.cover === 'constellation') tags.push('Animated');
  return tags;
}
const FAV_KEY = 'vertex_template_favs';

/* ---------- mini live preview (uses the real theme colors) ---------- */
function MiniPreview({ t }: { t: Template }) {
  const accent = t.accent;
  const contrast = contrastOf(accent);
  const dark = t.mode === 'dark';
  const cover = t.cover ?? (dark ? 'constellation' : 'gradient');
  const round = t.avatar === 'square' ? 'rounded-[9px]' : 'rounded-full';
  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: dark ? '#23232b' : '#e5e7eb', background: dark ? '#0e0e12' : '#ffffff', color: dark ? '#fafafa' : '#0a0a0a' }}>
      <div className="relative h-14">
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
        <div className="-mt-5 mb-2">
          <div className={`flex h-9 w-9 items-center justify-center text-[13px] font-bold shadow ring-2 ${round}`} style={{ background: accent, color: contrast, boxShadow: `0 0 0 2px ${dark ? '#0e0e12' : '#fff'}` }}>A</div>
        </div>
        <div className="h-1.5 w-2/3 rounded" style={{ background: dark ? '#26262e' : '#e5e7eb' }} />
        <div className="mt-1 h-1.5 w-1/2 rounded" style={{ background: dark ? '#1c1c22' : '#eef0f3' }} />
        <div className="mt-2.5 flex h-6 items-center justify-center rounded-md text-[9px] font-bold" style={{ background: accent, color: contrast }}>Save contact</div>
      </div>
    </div>
  );
}

const MODE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
] as const;

export function TemplateMarketplace({
  currentTemplateId,
  onApply,
  applyingId,
}: {
  currentTemplateId: string;
  onApply: (t: Template) => void;
  applyingId?: string | null;
}) {
  const [query, setQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | 'light' | 'dark'>('all');
  const [familyFilter, setFamilyFilter] = useState<string | null>(null);
  const [favOnly, setFavOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [compare, setCompare] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const MAX_COMPARE = 4;

  useEffect(() => {
    try { setFavorites(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch { /* ignore */ }
  }, []);

  function toggleFav(id: string) {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
      return next;
    });
  }

  function toggleCompare(id: string) {
    setCompare((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_COMPARE ? prev : [...prev, id]));
  }
  const compareTemplates = TEMPLATES.filter((t) => compare.includes(t.id));

  const families = useMemo(() => Array.from(new Set(TEMPLATES.map(family))), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TEMPLATES.filter((t) => {
      if (modeFilter !== 'all' && t.mode !== modeFilter) return false;
      if (familyFilter && family(t) !== familyFilter) return false;
      if (favOnly && !favorites.includes(t.id)) return false;
      if (q && !(`${t.name} ${family(t)} ${tagsFor(t).join(' ')}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [query, modeFilter, familyFilter, favOnly, favorites]);

  return (
    <div className="space-y-5">
      {/* Marketplace toolbar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex min-w-[200px] flex-1 items-center">
          <span className="absolute start-3 text-faint"><Icon name="search" size={15} /></span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates, styles…" className="v-field !h-10 !ps-9 text-[13px]" />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-line bg-canvas/50 p-0.5">
          {MODE_FILTERS.map((m) => (
            <button key={m.key} onClick={() => setModeFilter(m.key)} className="rounded-lg px-3 py-1.5 text-[12px] font-bold transition-all" style={modeFilter === m.key ? { background: 'var(--v-accent)', color: 'var(--v-accent-contrast)' } : { color: 'hsl(var(--v-muted))' }}>{m.label}</button>
          ))}
        </div>
        <button onClick={() => setFavOnly((f) => !f)} className="v-btn v-btn-ghost !h-10 text-[12.5px] font-bold" style={favOnly ? { color: '#f59e0b', borderColor: '#f59e0b55' } : undefined}>
          <Icon name="sparkle" size={14} /> Favorites{favorites.length ? ` (${favorites.length})` : ''}
        </button>
      </div>

      {/* Family chips */}
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        <button onClick={() => setFamilyFilter(null)} className="shrink-0 rounded-full px-3 py-1 text-[11.5px] font-bold transition-all" style={!familyFilter ? { background: 'var(--v-accent)', color: 'var(--v-accent-contrast)' } : { background: 'hsl(var(--v-canvas))', color: 'hsl(var(--v-muted))', border: '1px solid hsl(var(--v-border))' }}>All styles</button>
        {families.map((f) => (
          <button key={f} onClick={() => setFamilyFilter(familyFilter === f ? null : f)} className="shrink-0 rounded-full px-3 py-1 text-[11.5px] font-bold transition-all" style={familyFilter === f ? { background: 'var(--v-accent)', color: 'var(--v-accent-contrast)' } : { background: 'hsl(var(--v-canvas))', color: 'hsl(var(--v-muted))', border: '1px solid hsl(var(--v-border))' }}>{f}</button>
        ))}
        <span className="ms-auto shrink-0 self-center text-[11px] font-semibold text-faint">{filtered.length} templates</span>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="v-card flex flex-col items-center gap-2 py-16 text-center text-faint">
          <Icon name="layers" size={26} />
          <p className="text-[13px] font-semibold text-muted">No templates match your filters</p>
        </div>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const active = t.id === currentTemplateId;
            const fav = favorites.includes(t.id);
            const applying = applyingId === t.id;
            return (
              <motion.div
                key={t.id}
                layout
                whileHover={{ y: -3 }}
                transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                className="group relative flex flex-col gap-3 rounded-2xl border bg-surface p-3.5 shadow-sm transition-shadow hover:shadow-md"
                style={{ borderColor: active ? 'var(--v-accent)' : 'hsl(var(--v-border))', boxShadow: active ? '0 0 0 2px var(--v-accent-soft)' : undefined }}
              >
                {active && <span className="absolute end-3 top-3 z-10 v-chip !px-2 !py-0.5 !text-[9.5px] font-bold text-accent bg-accent-soft border-accent/20">Applied</span>}

                <button
                  onClick={() => toggleCompare(t.id)}
                  aria-label={compare.includes(t.id) ? 'Remove from compare' : 'Add to compare'}
                  aria-pressed={compare.includes(t.id)}
                  className="absolute start-3 top-3 z-10 flex h-6 items-center gap-1 rounded-lg border px-2 text-[9.5px] font-bold uppercase tracking-wide shadow-sm transition-all"
                  style={compare.includes(t.id)
                    ? { background: 'var(--v-accent)', color: 'var(--v-accent-contrast)', borderColor: 'var(--v-accent)' }
                    : { background: 'hsl(var(--v-surface))', color: 'hsl(var(--v-muted))', borderColor: 'hsl(var(--v-border))' }}
                >
                  <Icon name={compare.includes(t.id) ? 'check' : 'columns'} size={10} /> Compare
                </button>

                <MiniPreview t={t} />

                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-ink">{t.name}</p>
                    <p className="text-[10.5px] font-semibold text-muted">{family(t)} · {t.mode === 'dark' ? 'Dark' : 'Light'}</p>
                  </div>
                  <button onClick={() => toggleFav(t.id)} aria-label={fav ? 'Unfavorite' : 'Favorite'} className="shrink-0 rounded-lg p-1 transition-colors" style={{ color: fav ? '#f59e0b' : 'hsl(var(--v-faint))' }}>
                    <Icon name="sparkle" size={15} />
                  </button>
                </div>

                {/* palette + tags */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-1">
                    {[t.accent, shade(t.accent, -40), shade(t.accent, 40)].map((c, i) => (
                      <span key={i} className="h-4 w-4 rounded-full border border-line/60" style={{ background: c }} title={c} />
                    ))}
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {tagsFor(t).slice(0, 2).map((tag) => (
                      <span key={tag} className="rounded-md bg-canvas px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted border border-line/60">{tag}</span>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => onApply(t)}
                  disabled={applying}
                  className="v-btn !h-9 w-full text-[12px] font-bold disabled:opacity-70"
                  style={active ? { background: '#10b981' } : undefined}
                >
                  {applying ? 'Applying…' : active ? (<><Icon name="check" size={14} /> Applied</>) : 'Apply template'}
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Floating compare tray */}
      <AnimatePresence>
        {compare.length > 0 && !compareOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-x-0 bottom-5 z-40 mx-auto flex w-fit items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5 shadow-2xl"
          >
            <span className="text-[12.5px] font-bold text-ink">{compare.length} selected</span>
            <div className="flex -space-x-1.5">
              {compareTemplates.map((t) => (
                <span key={t.id} className="h-5 w-5 rounded-full border-2 border-surface" style={{ background: t.accent }} title={t.name} />
              ))}
            </div>
            <button onClick={() => setCompareOpen(true)} disabled={compare.length < 2} className="v-btn !h-8 px-3.5 text-[12px] font-bold disabled:opacity-50">
              <Icon name="columns" size={13} /> Compare
            </button>
            <button onClick={() => setCompare([])} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink" aria-label="Clear comparison">
              <Icon name="x" size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compare modal */}
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

/* ---------- side-by-side comparison (all real, derived attributes) ---------- */
function CompareRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="border-t border-line/60 align-top">
      <td className="w-28 py-3 pe-3 text-[11px] font-bold uppercase tracking-wider text-faint">{label}</td>
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
  return (
    <AnimatePresence>
      {open && templates.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center"
          style={{ background: 'rgba(6,6,10,0.55)', backdropFilter: 'blur(6px)' }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Compare templates"
            initial={{ scale: 0.97, y: 14, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.97, y: 14, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="v-card my-8 w-full max-w-[880px] overflow-hidden p-0"
            style={{ boxShadow: 'var(--v-shadow-lg)' }}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2 className="v-display text-[17px] font-bold">Compare templates</h2>
                <p className="text-[12px] text-muted">{templates.length} templates side by side</p>
              </div>
              <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink" aria-label="Close">
                <Icon name="x" size={18} />
              </button>
            </div>

            <div className="no-scrollbar max-h-[70vh] overflow-auto px-5 py-4">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <td className="w-28" />
                    {templates.map((t) => (
                      <td key={t.id} className="px-2 pb-3 align-top" style={{ minWidth: 150 }}>
                        <div className="relative">
                          <button onClick={() => onRemove(t.id)} className="absolute -end-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-ink/70 text-white" aria-label="Remove">
                            <Icon name="x" size={11} />
                          </button>
                          <MiniPreview t={t} />
                        </div>
                        <p className="mt-2 truncate text-[12.5px] font-bold text-ink">{t.name}</p>
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <CompareRow label="Style">
                    {templates.map((t) => <td key={t.id} className="px-2 py-3 text-[12px] font-semibold text-ink">{family(t)}</td>)}
                  </CompareRow>
                  <CompareRow label="Mode">
                    {templates.map((t) => (
                      <td key={t.id} className="px-2 py-3">
                        <span className="v-chip !px-2 !py-0.5 !text-[10px] font-bold" style={{ background: t.mode === 'dark' ? '#0b0b0e' : 'hsl(var(--v-canvas))', color: t.mode === 'dark' ? '#fff' : 'hsl(var(--v-fg))' }}>{t.mode === 'dark' ? 'Dark' : 'Light'}</span>
                      </td>
                    ))}
                  </CompareRow>
                  <CompareRow label="Accent">
                    {templates.map((t) => (
                      <td key={t.id} className="px-2 py-3">
                        <span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded-full border border-line/60" style={{ background: t.accent }} /><span className="font-mono text-[11px] text-muted">{t.accent}</span></span>
                      </td>
                    ))}
                  </CompareRow>
                  <CompareRow label="Palette">
                    {templates.map((t) => (
                      <td key={t.id} className="px-2 py-3">
                        <span className="flex gap-1">
                          {[t.accent, shade(t.accent, -40), shade(t.accent, 40)].map((c, i) => <span key={i} className="h-4 w-4 rounded-full border border-line/60" style={{ background: c }} />)}
                        </span>
                      </td>
                    ))}
                  </CompareRow>
                  <CompareRow label="Cover">
                    {templates.map((t) => <td key={t.id} className="px-2 py-3 text-[12px] capitalize text-muted">{t.cover ?? (t.mode === 'dark' ? 'constellation' : 'gradient')}</td>)}
                  </CompareRow>
                  <CompareRow label="Avatar">
                    {templates.map((t) => <td key={t.id} className="px-2 py-3 text-[12px] capitalize text-muted">{t.avatar ?? 'circle'}</td>)}
                  </CompareRow>
                  <CompareRow label="Tags">
                    {templates.map((t) => (
                      <td key={t.id} className="px-2 py-3">
                        <span className="flex flex-wrap gap-1">
                          {tagsFor(t).map((tag) => <span key={tag} className="rounded-md bg-canvas px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted border border-line/60">{tag}</span>)}
                        </span>
                      </td>
                    ))}
                  </CompareRow>
                  <CompareRow label="">
                    {templates.map((t) => {
                      const active = t.id === currentTemplateId;
                      return (
                        <td key={t.id} className="px-2 py-3">
                          <button onClick={() => onApply(t)} className="v-btn !h-8 w-full text-[11.5px] font-bold" style={active ? { background: '#10b981' } : undefined}>
                            {active ? 'Applied' : 'Apply'}
                          </button>
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
