'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { authFetch } from '@/lib/client';
import { type Lead, type Stage, type ActivityType, ACTIVITY_META, sourceMeta, initials, avatarColor } from '@/lib/crm';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatDate } from '@/lib/format';
import { byDay, TIMELINE_FILTERS, type TimelineFilter } from '@/lib/timeline';

type LeadRef = { id: string; name: string | null; company: string | null };
type Person = { id: string; name: string; avatarUrl: string | null };

export type FeedItem =
  | { kind: 'activity'; id: string; at: string; lead: LeadRef; type: ActivityType; metadata: Record<string, unknown> | null; author: Person | null }
  | { kind: 'captured'; id: string; at: string; lead: LeadRef; source: string | null; card: string | null }
  | { kind: 'returned'; id: string; at: string; lead: LeadRef; card: string | null }
  | { kind: 'task'; id: string; at: string; lead: LeadRef; title: string; by: Person | null };

/** Adds a page to what is shown, leaving out what is already there (pages meet at a shared moment). */
export function addPage(shown: FeedItem[], page: FeedItem[]): FeedItem[] {
  const seen = new Set(shown.map((i) => i.id));
  return [...shown, ...page.filter((i) => !seen.has(i.id))];
}

/**
 * What happened across the workspace's leads, newest first: conversations,
 * notes, pipeline moves, new leads, leads coming back to a card and tasks
 * done. The list's own filters narrow it to the leads they show.
 */
export function ActivitiesTimeline({ leads, stages, onOpenLead, filtered = false }: { leads: Lead[]; stages: Stage[]; onOpenLead: (id: string) => void; filtered?: boolean }) {
  const { t } = useTranslation('crm');
  const { locale } = useLocale();
  const [kind, setKind] = useState<TimelineFilter>('all');
  const [items, setItems] = useState<FeedItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (before: string | null) => {
      const q = new URLSearchParams({ kind, ...(before ? { before } : {}) });
      const r = await authFetch<{ items: FeedItem[]; next: string | null }>(`/leads/activity?${q}`);
      setItems((shown) => (before ? addPage(shown, r.items) : r.items));
      setNext(r.next);
    },
    [kind],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    load(null)
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [load]);

  const loadMore = () => {
    if (!next || more) return;
    setMore(true);
    load(next)
      .catch(() => setFailed(true))
      .finally(() => setMore(false));
  };

  // With the list's filters on, only the leads they show.
  const allowed = useMemo(() => (filtered ? new Set(leads.map((l) => l.id)) : null), [filtered, leads]);
  const days = byDay(allowed ? items.filter((i) => allowed.has(i.lead.id)) : items);
  const stageName = (id: unknown) => stages.find((s) => s.id === id)?.name ?? t('feed.noStage');
  const dayLabel = (day: string) => {
    const key = (d: number) => byDay([{ at: new Date(Date.now() - d * 86_400_000).toISOString() }])[0]!.day;
    if (day === key(0)) return t('timeline.today');
    if (day === key(1)) return t('timeline.yesterday');
    return formatDate(`${day}T12:00:00`, locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  function describe(i: FeedItem): { icon: string; tone: string; title: string; body: string; who: string } {
    switch (i.kind) {
      case 'activity': {
        const m = i.metadata ?? {};
        const meta = ACTIVITY_META[i.type] ?? { icon: 'sparkle' };
        const title = i.type === 'STAGE_CHANGE' ? t('feed.moved', { from: stageName(m.from), to: stageName(m.to) }) : t(`activity.types.${i.type}`, t('activity.fallback'));
        return { icon: meta.icon, tone: 'bg-surface text-muted ring-line', title, body: typeof m.note === 'string' ? m.note : '', who: i.author?.name ?? '' };
      }
      case 'captured':
        return {
          icon: 'user-plus',
          tone: 'bg-surface text-muted ring-line',
          title: t('feed.captured', { source: t(`sources.${i.source}`, sourceMeta(i.source ?? '').label) }),
          body: i.card ? t('timeline.onCard', { card: i.card }) : '',
          who: '',
        };
      case 'returned':
        return { icon: 'eye', tone: 'bg-accent text-white ring-accent', title: i.card ? t('timeline.cameBack', { card: i.card }) : t('timeline.cameBackYours'), body: '', who: '' };
      case 'task':
        return { icon: 'check', tone: 'bg-emerald-500 text-white ring-emerald-500', title: t('timeline.taskDone'), body: i.title, who: i.by?.name ?? '' };
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">{t('activity.title')}</h2>
          <p className="text-xs text-muted">{t('activity.subtitle')}</p>
        </div>
        <div role="group" aria-label={t('timeline.filter')} className="no-scrollbar -mx-1 flex max-w-full gap-1 overflow-x-auto px-1">
          {TIMELINE_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setKind(f)}
              aria-pressed={kind === f}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${kind === f ? 'bg-ink text-canvas' : 'text-muted ring-1 ring-inset ring-line hover:text-ink'}`}
            >
              {t(`timeline.filters.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="v-skeleton h-12 w-full" />
          ))}
        </div>
      ) : failed && !items.length ? (
        <p className="py-16 text-center text-sm text-muted">{t('feed.failed')}</p>
      ) : days.length === 0 ? (
        <div className="v-card flex flex-col items-center gap-4 py-20 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-canvas text-faint">
            <Icon name="clock" size={28} />
          </span>
          <div>
            <p className="text-md font-semibold text-ink">{t('activity.noMatch')}</p>
            <p className="mt-1 text-xs text-muted">{t('activity.noMatchDesc')}</p>
          </div>
        </div>
      ) : (
        days.map((d) => (
          <section key={d.day}>
            <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-faint rtl:tracking-normal">{dayLabel(d.day)}</h3>
            <ol className="v-card divide-y divide-line overflow-hidden">
              {d.items.map((i) => {
                const x = describe(i);
                const name = i.lead.name || t('table.unknownLead');
                return (
                  <li key={i.id} data-testid="feed-item" data-kind={i.kind}>
                    <button type="button" onClick={() => onOpenLead(i.lead.id)} className="flex w-full items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-elevated">
                      <span className="relative mt-0.5 shrink-0">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full text-3xs font-semibold text-white" style={{ background: avatarColor(name) }}>
                          {initials(name)}
                        </span>
                        <span className={`absolute -bottom-1 -end-1 flex h-4 w-4 items-center justify-center rounded-full ring-2 ${x.tone}`}>
                          <Icon name={x.icon} size={9} />
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate text-sm text-ink">
                            <span className="font-semibold">{name}</span>
                            {i.lead.company && <span className="text-muted"> · {i.lead.company}</span>}
                          </span>
                          <span className="shrink-0 text-xs text-faint">{formatDate(i.at, locale, { hour: 'numeric', minute: '2-digit' })}</span>
                        </span>
                        <span className="block text-xs text-muted">
                          {x.title}
                          {x.who && <span className="text-faint"> · {x.who}</span>}
                        </span>
                        {x.body && (
                          <span className="mt-1 line-clamp-2 block text-xs text-faint" dir="auto">
                            {x.body}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        ))
      )}

      {!loading && next && (
        <div className="flex justify-center">
          <button type="button" onClick={loadMore} disabled={more} className="v-btn v-btn-ghost !text-xs">
            {more ? t('feed.loading') : t('feed.more')}
          </button>
        </div>
      )}
    </div>
  );
}
