'use client';

import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import type { Locale } from '@/lib/i18n/config';
import { formatDate, formatRelativeTime } from '@/lib/format';
import type { LeadActivity, Task } from '@/lib/crm';
import { visitActionKey, visitMinutes, type TimelineSummary, type VisitItem } from '@/lib/timeline';

const CONTACTS = new Set(['CALL', 'EMAIL', 'WHATSAPP', 'MEETING']);
const time = (iso: string, locale: Locale) => formatDate(iso, locale, { hour: 'numeric', minute: '2-digit' });

/**
 * The lead at a glance: how often they came to the card (and came back), how
 * often someone reached out, and what is still to do. Visits are as loaded;
 * the rest follows what is logged in the drawer.
 */
export function TimelineSummaryStrip({ summary, activities, tasks, locale }: { summary: TimelineSummary; activities: LeadActivity[]; tasks: Task[]; locale: Locale }) {
  const { t } = useTranslation('crm');
  const contacts = activities.filter((a) => CONTACTS.has(a.type)).length;
  const open = tasks.filter((x) => !x.completed);
  const overdue = open.filter((x) => x.dueDate && new Date(x.dueDate).getTime() < Date.now()).length;
  const stats = [
    {
      key: 'visits',
      icon: 'eye',
      value: summary.visits,
      label: t('timeline.summary.visits', { count: summary.visits }),
      note: summary.lastVisitAt ? t('timeline.summary.lastSeen', { when: formatRelativeTime(summary.lastVisitAt, locale, 'narrow') }) : t('timeline.summary.noVisits'),
      strong: summary.returns > 0 ? t('timeline.summary.returns', { count: summary.returns }) : '',
    },
    { key: 'contacts', icon: 'message', value: contacts, label: t('timeline.summary.contacts', { count: contacts }), note: '', strong: '' },
    {
      key: 'tasks',
      icon: 'check',
      value: open.length,
      label: t('timeline.summary.openTasks', { count: open.length }),
      note: '',
      strong: overdue ? t('timeline.summary.overdue', { count: overdue }) : '',
    },
  ];
  return (
    <div className="mt-5 grid grid-cols-3 gap-2" data-testid="timeline-summary">
      {stats.map((s) => (
        <div key={s.key} className="min-w-0 rounded-[10px] px-3 py-2.5 ring-1 ring-inset ring-line" data-testid={`timeline-stat-${s.key}`}>
          <p className="flex items-center gap-1.5 text-2xs text-faint">
            <Icon name={s.icon} size={11} />
            <span className="truncate">{s.label}</span>
          </p>
          <p className="tabular mt-0.5 text-lg font-semibold text-ink">{s.value}</p>
          {s.strong && <p className="truncate text-2xs font-medium text-accent">{s.strong}</p>}
          {s.note && <p className="truncate text-2xs text-faint">{s.note}</p>}
        </div>
      ))}
    </div>
  );
}

/** A visit to the card: when, how they opened it, and what they did there. */
export function VisitRow({ visit, locale }: { visit: VisitItem; locale: Locale }) {
  const { t } = useTranslation('crm');
  const minutes = visitMinutes(visit);
  const card = visit.card?.name;
  const title = visit.returning
    ? card ? t('timeline.cameBack', { card }) : t('timeline.cameBackYours')
    : card ? t('timeline.viewed', { card }) : t('timeline.viewedYours');
  // The same thing done twice in one visit reads once, with how many times.
  const did = new Map<string, number>();
  for (const a of visit.actions) {
    const label = t(visitActionKey(a), { platform: a.platform ?? '' });
    did.set(label, (did.get(label) ?? 0) + 1);
  }
  return (
    <li className="relative flex items-start gap-3" data-testid="timeline-visit">
      <span
        className={`z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 ${
          visit.returning ? 'bg-accent text-white ring-accent' : 'bg-surface text-muted ring-line'
        }`}
      >
        <Icon name="eye" size={11} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-medium text-ink">{title}</p>
          <span className="shrink-0 text-xs text-faint">{time(visit.at, locale)}</span>
        </div>
        <p className="text-xs text-faint">
          {[visit.tapped ? t('timeline.byTap') : t('timeline.byLink'), minutes >= 1 ? t('timeline.minutes', { count: minutes }) : ''].filter(Boolean).join(' · ')}
        </p>
        {did.size > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {[...did].map(([label, n]) => (
              <li key={label} className="rounded-full bg-elevated px-2 py-0.5 text-2xs font-medium text-muted ring-1 ring-inset ring-line">
                {n > 1 ? `${label} ×${n}` : label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

/** A task given for this lead, or done. */
export function TaskRow({ event, task, at, locale }: { event: 'created' | 'completed'; task: Task; at: string; locale: Locale }) {
  const { t } = useTranslation('crm');
  const done = event === 'completed';
  return (
    <li className="relative flex items-start gap-3" data-testid="timeline-task">
      <span className={`z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 ${done ? 'bg-emerald-500 text-white ring-emerald-500' : 'bg-surface text-muted ring-line'}`}>
        <Icon name={done ? 'check' : 'plus'} size={11} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-medium text-ink">{done ? t('timeline.taskDone') : t('timeline.taskAdded')}</p>
          <span className="shrink-0 text-xs text-faint">{time(at, locale)}</span>
        </div>
        <p className={`text-xs ${done ? 'text-faint line-through' : 'text-muted'}`} dir="auto">
          {task.title}
        </p>
        {!done && task.dueDate && (
          <p className="text-2xs text-faint">{t('timeline.due', { date: formatDate(task.dueDate, locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) })}</p>
        )}
      </div>
    </li>
  );
}
