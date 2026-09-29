'use client';

import { useTranslation } from 'react-i18next';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { Heat } from './LeadCard';
import { type Lead, type Stage, quickLinks, sourceMeta, stageKey } from '@/lib/crm';

/**
 * The pipeline on a phone: one list instead of columns that scroll sideways,
 * with the stages as a row of filters, and calling or messaging a lead one
 * tap away without opening it.
 */
export function LeadList({
  leads,
  stages,
  stage,
  onStage,
  counts,
  onOpen,
}: {
  leads: Lead[];
  stages: Stage[];
  /** The stage shown, or null for all. */
  stage: string | null;
  onStage: (id: string | null) => void;
  counts: Record<string, number>;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation('crm');
  const { locale } = useLocale();
  const byId = new Map(stages.map((s) => [s.id, s]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const chips = [{ id: null as string | null, label: t('list.allStages'), count: total }, ...stages.map((s) => ({ id: s.id as string | null, label: t(stageKey(s.name), s.name), count: counts[s.id] ?? 0 }))];

  return (
    <div>
      <div role="radiogroup" aria-label={t('list.stages')} className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-3">
        {chips.map((c) => {
          const on = stage === c.id;
          return (
            <button
              key={c.id ?? 'all'}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onStage(c.id)}
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium ring-1 ring-inset transition-colors ${
                on ? 'bg-ink text-surface ring-ink' : 'bg-surface text-muted ring-line'
              }`}
            >
              {c.label}
              <span className={`tabular text-[12px] ${on ? 'opacity-70' : 'text-faint'}`}>{formatNumber(c.count, locale)}</span>
            </button>
          );
        })}
      </div>

      {leads.length === 0 ? (
        <p className="rounded-xl px-4 py-12 text-center text-[13px] text-muted ring-1 ring-inset ring-line">{t('table.noMatch')}</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl ring-1 ring-inset ring-line">
          {leads.map((l) => {
            const s = l.stageId ? byId.get(l.stageId) : undefined;
            const src = sourceMeta(l.source);
            const reach = quickLinks(l).filter((q) => q.key === 'call' || q.key === 'whatsapp');
            return (
              <li key={l.id} className="flex items-center gap-3 bg-surface py-3 pe-2 ps-3.5">
                <button type="button" onClick={() => onOpen(l.id)} className="flex min-w-0 flex-1 items-center gap-3 text-start">
                  <Avatar user={{ id: l.id, name: l.name, email: l.email }} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14.5px] font-medium text-ink">{l.name || t('table.unknownLead')}</span>
                      <Heat temp={l.temperature} />
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-muted">
                      {[l.company, s ? t(stageKey(s.name), s.name) : null].filter(Boolean).join(' · ')}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-faint">
                      <Icon name={src.icon} size={12} />
                      {t(`sources.${l.source}`, src.label)} · {formatRelativeTime(l.createdAt, locale, 'narrow')}
                    </span>
                  </span>
                </button>
                {reach.map((q) => (
                  <a
                    key={q.key}
                    href={q.href}
                    target={q.key === 'whatsapp' ? '_blank' : undefined}
                    rel="noreferrer"
                    aria-label={`${t(`drawer.actions.${q.key}`, q.label)} ${l.name ?? ''}`.trim()}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink ring-1 ring-inset ring-line active:bg-elevated"
                  >
                    <Icon name={q.icon} size={18} />
                  </a>
                ))}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
