'use client';

import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { type Lead, type Temp, sourceMeta, quickLinks, formatMoney } from '@/lib/crm';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatRelativeTime } from '@/lib/format';

const HEAT_LEVEL: Record<Temp, number> = { COLD: 1, WARM: 2, HOT: 3 };
const HEAT_COLOR: Record<Temp, string> = { COLD: 'hsl(var(--v-faint))', WARM: '#d98a1e', HOT: '#e0533f' };

/** Temperature as three bars: one for cold, two for warm, three for hot. */
export function Heat({ temp, label }: { temp: Temp; label?: string }) {
  const level = HEAT_LEVEL[temp];
  return (
    <span className="inline-flex items-end gap-[2px]" role="img" aria-label={label ?? temp.toLowerCase()} title={label}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-[1px]"
          style={{ height: 6 + i * 2, background: i <= level ? HEAT_COLOR[temp] : 'hsl(var(--v-border-strong))' }}
        />
      ))}
    </span>
  );
}

/** A lead on the pipeline board: who, where from, what it is worth. Drag to move stages. */
export function LeadCard({
  lead,
  onOpen,
  onDragStart,
  onDragEnd,
  dragging,
  selected,
  still,
}: {
  lead: Lead;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging?: boolean;
  selected?: boolean;
  /** No layout animation (a large board). */
  still?: boolean;
}) {
  const { t } = useTranslation('crm');
  const { locale } = useLocale();
  const src = sourceMeta(lead.source);
  const links = quickLinks(lead);

  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-ink">{lead.name || t('table.unknownLead')}</p>
        <span className="mt-1 shrink-0">
          <Heat temp={lead.temperature} label={t(`temperature.${lead.temperature.toLowerCase()}`)} />
        </span>
      </div>
      {lead.company && <p className="mt-0.5 truncate text-xs text-faint">{lead.company}</p>}

      <div className="mt-3 flex items-center gap-2 text-xs text-faint">
        <span className="inline-flex min-w-0 items-center gap-1 truncate">
          <Icon name={src.icon} size={12} />
          {t(`sources.${lead.source}`, src.label)}
        </span>
        {lead.value > 0 && (
          <>
            <span aria-hidden>·</span>
            <span className="tabular shrink-0 font-medium text-ink">{formatMoney(lead.value, locale)}</span>
          </>
        )}
        <span className="ms-auto shrink-0">{formatRelativeTime(lead.createdAt, locale, 'narrow')}</span>
      </div>

      {/* Contact shortcuts appear on hover so the card stays quiet at rest. */}
      {links.length > 0 && (
        <div className="pointer-events-none absolute end-2 top-2 flex gap-1 rounded-lg bg-surface p-0.5 opacity-0 shadow-sm ring-1 ring-line transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
          {links.map((l) => (
            <a
              key={l.key}
              href={l.href}
              target={l.key === 'whatsapp' ? '_blank' : undefined}
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={t(`drawer.actions.${l.key}`, l.label)}
              aria-label={t(`drawer.actions.${l.key}`, l.label)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-ink"
            >
              <Icon name={l.icon} size={13} />
            </a>
          ))}
        </div>
      )}
    </>
  );
  const className = `group relative cursor-pointer rounded-[10px] bg-surface p-3 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing ${
    selected ? 'ring-2 ring-accent' : 'shadow-[0_0_0_1px_hsl(var(--v-border)),0_1px_2px_rgba(23,23,26,0.04)] hover:shadow-[0_0_0_1px_hsl(var(--v-border-strong)),0_4px_12px_-6px_rgba(23,23,26,0.12)]'
  }`;
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };
  // Cards below a column's fold are not laid out or painted until scrolled to.
  const style = { opacity: dragging ? 0.45 : 1, contentVisibility: 'auto', containIntrinsicSize: 'auto 112px' } as const;

  // Sliding into a new column measures every card on the board and costs a
  // motion component per card: worth it for a small board, too costly for
  // hundreds, where no one would see it anyway.
  if (still) {
    return (
      <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onOpen} onKeyDown={onKeyDown} role="button" tabIndex={0} className={className} style={style}>
        {content}
      </div>
    );
  }
  return (
    <motion.div
      layout
      layoutId={lead.id}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      role="button"
      tabIndex={0}
      className={className}
      style={style}
    >
      {content}
    </motion.div>
  );
}
