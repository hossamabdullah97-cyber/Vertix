'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { type Lead, TEMP_META, initials, hueFor, relativeTime, sourceMeta, quickLinks, formatMoney } from '@/lib/crm';

/** Premium pipeline lead card — avatar, identity, score, temperature, source, hover quick actions. */
export function LeadCard({
  lead,
  onOpen,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  lead: Lead;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging?: boolean;
}) {
  const { t } = useTranslation('crm');
  const tm = TEMP_META[lead.temperature];
  const hue = hueFor(lead.name || lead.email || lead.id);
  const src = sourceMeta(lead.source);
  const links = quickLinks(lead);

  const displayTags = useMemo(() => {
    // Generate virtual tags for visualization based on company/priority
    const list = [];
    if (lead.company) list.push(lead.company.split(' ')[0]);
    if (lead.value > 15000) list.push('High-Value');
    if (lead.temperature === 'HOT') list.push('Hot-Lead');
    return list;
  }, [lead]);

  return (
    <motion.div
      layout
      layoutId={lead.id}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="group relative cursor-pointer rounded-2xl border border-line bg-canvas p-3.5 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
      style={{ opacity: dragging ? 0.4 : 1, boxShadow: dragging ? '0 20px 40px rgba(0,0,0,0.18)' : undefined }}
    >
      {/* temperature accent rail */}
      <span className="absolute inset-y-3.5 start-0 w-1 rounded-full" style={{ background: tm.dot }} aria-hidden />

      {/* Unread activity indicator badge */}
      {lead.score > 2 && (
        <span className="absolute right-3.5 top-3.5 h-2 w-2 rounded-full bg-blue-600 ring-4 ring-canvas" title={t('leadCard.unreadActivity')} />
      )}

      <div className="flex items-start gap-3 ps-1.5">
        {/* avatar with temperature ring */}
        <span className="relative shrink-0">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-bold text-white"
            style={{ background: `hsl(${hue} 62% 48%)`, boxShadow: `0 0 0 2px hsl(var(--v-canvas, 240 14% 97%)), 0 0 0 3.5px ${tm.dot}` }}
          >
            {initials(lead.name)}
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-[13.5px] font-bold leading-tight text-ink transition-colors group-hover:text-accent">
              {lead.name || t('table.unknownLead')}
            </p>
            <span className="v-chip shrink-0 !gap-1 !px-2 !py-0.5 !text-[9.5px] font-bold" style={{ background: tm.bg, color: tm.fg, borderColor: tm.border }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: tm.dot }} />
              {tm.short}
            </span>
          </div>
          {lead.company && <p className="mt-0.5 truncate text-[11.5px] font-semibold text-muted">{lead.company}</p>}
        </div>
      </div>

      {/* Tags row */}
      {displayTags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1 ps-1.5">
          {displayTags.map((tag) => (
            <span key={tag} className="v-chip !px-1.5 !py-0.5 !text-[9.5px] font-extrabold uppercase tracking-wider bg-canvas/30 text-faint">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* meta row */}
      <div className="mt-3 flex items-center justify-between gap-2 ps-1.5 text-[10.5px] text-muted">
        <span className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-1.5 py-0.5 font-semibold">
          <Icon name={src.icon} size={11} /> {src.label}
        </span>
        <span className="inline-flex items-center gap-2">
          {lead.value > 0 && (
            <span className="inline-flex items-center gap-0.5 font-bold text-emerald-600" title={t('leadCard.estimatedValue')}>
              {formatMoney(lead.value)}
            </span>
          )}
          {lead.score > 0 && (
            <span className="inline-flex items-center gap-1 font-bold text-ink" title={t('leadCard.leadScore')}>
              <Icon name="sparkle" size={11} className="text-accent" /> {lead.score}
            </span>
          )}
          <span className="inline-flex items-center gap-1"><Icon name="clock" size={11} /> {relativeTime(lead.createdAt)}</span>
        </span>
      </div>

      {/* hover quick actions */}
      {links.length > 0 && (
        <div className="pointer-events-none absolute end-2.5 top-2.5 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
          {links.map((l) => (
            <a
              key={l.key}
              href={l.href}
              target={l.key === 'whatsapp' ? '_blank' : undefined}
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={l.label}
              aria-label={l.label}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface text-muted shadow-sm hover:text-ink"
              style={{ color: l.color }}
            >
              <Icon name={l.icon} size={13} />
            </a>
          ))}
          {/* Quick meeting icon */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpen(); // Open details directly to the meeting planner tab
            }}
            title={t('leadCard.scheduleMeeting')}
            aria-label={t('leadCard.scheduleMeeting')}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface text-blue-600 shadow-sm hover:text-blue-800"
          >
            <Icon name="calendar" size={13} />
          </button>
        </div>
      )}
    </motion.div>
  );
}
