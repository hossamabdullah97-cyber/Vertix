'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { duplicateGroups } from '@vertex/shared';
import { authFetch } from '@/lib/client';
import { formatDate } from '@/lib/format';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Sheet } from '@/components/ui/Sheet';
import { Icon } from '@/components/Icon';
import { stageKey, type Lead, type Stage } from '@/lib/crm';

const DISMISSED_KEY = 'vertex_not_duplicates';
const groupKey = (leads: { id: string }[]) => leads.map((l) => l.id).sort().join(',');

function readDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** The leads that look like one person, less the groups someone said are not. */
export function useDuplicates(leads: Lead[]) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  useEffect(() => setDismissed(readDismissed()), []);
  const groups = useMemo(() => duplicateGroups(leads).filter((g) => !dismissed.has(groupKey(g.leads))), [leads, dismissed]);
  const dismiss = (g: { leads: Lead[] }) => {
    const next = new Set(dismissed).add(groupKey(g.leads));
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
    } catch {
      /* private mode: for this visit only */
    }
  };
  /** The other leads that look like the same person as `id`. */
  const of = (id: string) => groups.find((g) => g.leads.some((l) => l.id === id))?.leads.filter((l) => l.id !== id) ?? [];
  return { groups, dismiss, of };
}

const filled = (l: Lead) => [l.name, l.email, l.phone, l.company].filter(Boolean).length;
/** Kept by default: the most complete, then the one that came in first. */
const defaultKeep = (leads: Lead[]) =>
  [...leads].sort((a, b) => filled(b) - filled(a) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]!.id;

/**
 * Reviewing possible duplicates, a group at a time: choose the lead to keep
 * and merge the rest into it, or say they are different people.
 */
export function MergeDuplicates({
  open,
  onClose,
  groups,
  stages,
  focus,
  onMerged,
  onDismiss,
}: {
  open: boolean;
  onClose: () => void;
  groups: { leads: Lead[]; by: ('email' | 'phone')[] }[];
  stages: Stage[];
  /** A lead whose group is shown first (opened from that lead). */
  focus?: string | null;
  onMerged: (keepId: string, mergedIds: string[]) => void;
  onDismiss: (g: { leads: Lead[] }) => void;
}) {
  const { t } = useTranslation('crm');
  const ordered = useMemo(() => {
    if (!focus) return groups;
    const i = groups.findIndex((g) => g.leads.some((l) => l.id === focus));
    return i > 0 ? [groups[i]!, ...groups.slice(0, i), ...groups.slice(i + 1)] : groups;
  }, [groups, focus]);

  return (
    <Sheet open={open} onClose={onClose} closeLabel={t('drawer.close')} title={t('duplicates.title')} subtitle={t('duplicates.subtitle')}>
      {ordered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{t('duplicates.none')}</p>
      ) : (
        <div className="space-y-4">
          {ordered.map((g) => (
            <Group key={groupKey(g.leads)} group={g} stages={stages} onMerged={onMerged} onDismiss={() => onDismiss(g)} />
          ))}
        </div>
      )}
    </Sheet>
  );
}

function Group({
  group,
  stages,
  onMerged,
  onDismiss,
}: {
  group: { leads: Lead[]; by: ('email' | 'phone')[] };
  stages: Stage[];
  onMerged: (keepId: string, mergedIds: string[]) => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation('crm');
  const { locale } = useLocale();
  const [keep, setKeep] = useState(() => defaultKeep(group.leads));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const stageName = (id: string | null) => {
    const s = stages.find((x) => x.id === id);
    return s ? t(stageKey(s.name), s.name) : null;
  };

  async function merge() {
    setBusy(true);
    setError('');
    const others = group.leads.filter((l) => l.id !== keep).map((l) => l.id);
    try {
      await authFetch(`/leads/${keep}/merge`, { method: 'POST', body: JSON.stringify({ duplicateIds: others }) });
      onMerged(keep, others);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl ring-1 ring-inset ring-line">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        {group.by.map((b) => (
          <span key={b} className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
            {t(`duplicates.by.${b}`)}
          </span>
        ))}
        <span className="ms-auto text-xs text-faint">{t('duplicates.pickKeep')}</span>
      </header>
      <ul role="radiogroup" aria-label={t('duplicates.pickKeep')}>
        {group.leads.map((l) => {
          const on = keep === l.id;
          return (
            <li key={l.id}>
              <label className={`flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors ${on ? 'bg-accent/[0.06]' : 'hover:bg-elevated'}`}>
                <input type="radio" name={`keep-${groupKey(group.leads)}`} checked={on} onChange={() => setKeep(l.id)} className="mt-1 accent-[hsl(var(--v-accent))]" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="truncate text-sm font-medium text-ink">{l.name || l.email || l.phone || '—'}</span>
                    {l.company && <span className="truncate text-xs text-muted">{l.company}</span>}
                    {on && <span className="text-xs font-medium text-accent">{t('duplicates.kept')}</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted" dir="ltr">
                    {[l.email, l.phone].filter(Boolean).join(' · ')}
                  </span>
                  <span className="mt-0.5 block text-xs text-faint">
                    {[t(`sources.${l.source}`, l.source), stageName(l.stageId), formatDate(l.createdAt, locale)].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <footer className="border-t border-line px-4 py-3">
        <p className="text-xs leading-relaxed text-muted">{t('duplicates.how')}</p>
        {error && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={merge} disabled={busy} className="v-btn disabled:opacity-50">
            <Icon name="users" size={14} /> {busy ? t('duplicates.merging') : t('duplicates.merge', { count: group.leads.length })}
          </button>
          <button type="button" onClick={onDismiss} disabled={busy} className="v-btn v-btn-ghost">
            {t('duplicates.different')}
          </button>
        </div>
      </footer>
    </section>
  );
}
