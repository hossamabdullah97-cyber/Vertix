'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { authFetch, getToken, type Card, type Member } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatDate, formatNumber } from '@/lib/format';
import {
  change,
  countByDay,
  eventSeries,
  formatChange,
  periodWindows,
  rangeQuery,
  shareOf,
  type EventType,
  type Overview,
  type Point,
} from '@/lib/analytics';
import { type Lead, type Stage } from '@/lib/crm';
import { Icon } from '@/components/Icon';
import AppShell from '@/components/AppShell';
import { TrendChart } from '@/components/charts/TrendChart';
import { markersFor, type Occasion } from '@/lib/occasions';
import { CardThumb } from '@/components/cards/CardThumb';
import { BarList, PanelEmpty, PanelHeader } from '@/components/analytics/parts';
import { CardsView } from '@/components/analytics/CardsView';
import { ChipsView } from '@/components/analytics/ChipsView';
import { TeamView } from '@/components/analytics/TeamView';
import { LeadsView } from '@/components/analytics/LeadsView';

type Period = 7 | 30 | 90;
type View = 'overview' | 'cards' | 'chips' | 'team' | 'leads';
type Metric = EventType | 'LEADS';

const PERIODS: Period[] = [7, 30, 90];
const VIEWS: View[] = ['overview', 'cards', 'chips', 'team', 'leads'];
const METRICS: Metric[] = ['VIEW', 'CLICK', 'SAVE', 'NFC_SCAN', 'LEADS'];

interface TopCard {
  cardId: string;
  /** null when the card has since been deleted. */
  slug: string | null;
  events: number;
}
interface Referrer {
  referrer: string;
  events: number;
}
interface PeriodData {
  ov: Overview | null;
  ovPrev: Overview | null;
  ts: Point[];
  tsPrev: Point[];
  top: TopCard[];
  refs: Referrer[];
}

/** "https://www.linkedin.com/feed" → "linkedin.com"; anything unparseable is shown as sent. */
function referrerHost(ref: string): string {
  try {
    return new URL(ref).hostname.replace(/^www\./, '');
  } catch {
    return ref;
  }
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { t } = useTranslation('analytics');
  const { locale } = useLocale();
  const fmt = (n: number) => formatNumber(n, locale);

  const [view, setView] = useState<View>('overview');
  const [period, setPeriod] = useState<Period>(30);
  const [metric, setMetric] = useState<Metric>('VIEW');
  const [data, setData] = useState<PeriodData | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [stages, setStages] = useState<(Stage & { isWon?: boolean; isLost?: boolean })[]>([]);
  // null until known: the Team view only exists when several people share the workspace.
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [error, setError] = useState('');

  const windows = useMemo(() => periodWindows(period), [period]);

  // The tab lives in the address so a view can be linked to and survives a reload.
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('view') as View | null;
    if (v && VIEWS.includes(v)) setView(v);
  }, []);
  function chooseView(next: View) {
    setView(next);
    const url = new URL(window.location.href);
    if (next === 'overview') url.searchParams.delete('view');
    else url.searchParams.set('view', next);
    window.history.replaceState(null, '', url);
  }

  // Things that do not depend on the period.
  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    authFetch<Card[]>('/cards').then(setCards).catch(() => setCards([]));
    authFetch<Lead[]>('/leads').then(setLeads).catch(() => setLeads([]));
    authFetch<(Stage & { isWon?: boolean; isLost?: boolean })[]>('/leads/stages').then(setStages).catch(() => setStages([]));
    authFetch<Member[]>('/orgs/members').then((m) => setMemberCount(m.length)).catch(() => setMemberCount(0));
    authFetch<Occasion[]>('/orgs/occasions').then(setOccasions).catch(() => setOccasions([]));
  }, [router]);

  // Everything measured over the chosen period, plus the period before it.
  useEffect(() => {
    if (!getToken()) return;
    const now = new Date();
    const cur = rangeQuery(windows.from, now);
    const prev = rangeQuery(windows.prevFrom, windows.from);
    let alive = true;
    setData(null);
    Promise.all([
      authFetch<Overview>('/analytics/overview' + cur),
      authFetch<Overview>('/analytics/overview' + prev).catch(() => null),
      authFetch<Point[]>('/analytics/timeseries' + cur).catch(() => []),
      authFetch<Point[]>('/analytics/timeseries' + prev).catch(() => []),
      authFetch<TopCard[]>('/analytics/top-cards' + cur).catch(() => []),
      authFetch<Referrer[]>('/analytics/referrers' + cur).catch(() => []),
    ])
      .then(([ov, ovPrev, ts, tsPrev, top, refs]) => {
        if (!alive) return;
        setData({ ov, ovPrev, ts, tsPrev, top, refs });
        setError('');
      })
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [windows]);

  const periodLeads = useMemo(() => (leads ?? []).filter((l) => new Date(l.createdAt) >= windows.from), [leads, windows]);

  /** The period's numbers, day by day, as a spreadsheet. */
  function exportCsv() {
    if (!data) return;
    const leadDays = countByDay(leads ?? [], windows.keys);
    const types: EventType[] = ['VIEW', 'CLICK', 'SAVE', 'SHARE', 'NFC_SCAN'];
    const series = types.map((type) => eventSeries(data.ts, windows.keys, type));
    const header = [t('csv.day'), ...types.map((type) => t(`metrics.${type}`)), t('metrics.LEADS')];
    const rows = windows.keys.map((day, i) => [day, ...series.map((s) => s[i]), leadDays[i]]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    // The byte-order mark makes spreadsheet apps read Arabic headers correctly.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vertex-analytics-${windows.keys[0]}-${windows.keys[windows.keys.length - 1]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const teamAvailable = (memberCount ?? 0) > 1;
  const views: { id: View; label: string }[] = VIEWS.filter((v) => v !== 'team' || teamAvailable).map((id) => ({ id, label: t(`views.${id}`) }));
  // A link to the Team view in a one-person workspace lands on the overview.
  const shown: View = view === 'team' && memberCount !== null && !teamAvailable ? 'overview' : view;

  const totals = data?.ov?.totals ?? {};
  const people = data?.ov?.uniqueVisitors ?? 0;

  return (
    <AppShell
      title={t('title')}
      fluid
      action={
        <button onClick={exportCsv} disabled={!data} className="v-btn v-btn-ghost disabled:opacity-50">
          <Icon name="download" size={14} /> {t('export')}
        </button>
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="min-h-[22px] text-base text-muted">
          {data ? (
            <>
              <span className="font-medium text-ink">{t(`summary.period${period}`)}</span>
              {': '}
              {t('summary.views', { count: totals.VIEW ?? 0, value: fmt(totals.VIEW ?? 0) })}
              {people > 0 && ` ${t('summary.people', { count: people, value: fmt(people) })}`}
              {locale === 'ar' ? '، ' : ', '}
              {t('summary.leads', { count: data.ov?.leads ?? 0, value: fmt(data.ov?.leads ?? 0) })}
            </>
          ) : (
            <span className="v-skeleton inline-block h-4 w-72 align-middle" />
          )}
        </p>
        <div role="radiogroup" aria-label={t('period.label')} className="inline-flex rounded-lg bg-elevated p-0.5 ring-1 ring-inset ring-line">
          {PERIODS.map((p) => (
            <button
              key={p}
              role="radio"
              aria-checked={period === p}
              onClick={() => setPeriod(p)}
              className={`h-11 rounded-md px-3 text-xs font-medium transition-colors sm:h-7 ${
                period === p ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'
              }`}
            >
              {t(`period.d${p}`)}
            </button>
          ))}
        </div>
      </div>

      <nav role="tablist" aria-label={t('views.label')} className="no-scrollbar -mx-5 mt-4 flex gap-5 overflow-x-auto border-b border-line px-5 md:-mx-8 md:px-8">
        {views.map((v) => {
          const active = shown === v.id;
          return (
            <button
              key={v.id}
              role="tab"
              aria-selected={active}
              onClick={() => chooseView(v.id)}
              className={`relative flex min-h-11 shrink-0 items-center text-sm font-medium transition-colors sm:min-h-10 ${
                active ? 'text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {v.label}
              {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink" />}
            </button>
          );
        })}
      </nav>

      {error && (
        <div role="alert" className="mt-4 rounded-lg bg-red-500/[0.06] px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mt-5">
        {shown === 'overview' && (
          <OverviewView data={data} leads={leads} periodLeads={periodLeads} cards={cards} windows={windows} period={period} metric={metric} onMetric={setMetric} onView={chooseView} occasions={occasions} />
        )}
        {shown === 'cards' && <CardsView cards={cards} leads={leads} />}
        {shown === 'chips' && <ChipsView from={windows.from} />}
        {shown === 'team' && (memberCount === null ? <div className="v-skeleton h-64 w-full rounded-xl" /> : <TeamView from={windows.from} />)}
        {shown === 'leads' && <LeadsView leads={leads === null ? null : periodLeads} stages={stages} />}
      </div>
    </AppShell>
  );
}

/* ------------------------------------------------------------------------- */

function OverviewView({
  data,
  leads,
  periodLeads,
  cards,
  windows,
  period,
  metric,
  onMetric,
  onView,
  occasions,
}: {
  data: PeriodData | null;
  leads: Lead[] | null;
  periodLeads: Lead[];
  cards: Card[];
  windows: ReturnType<typeof periodWindows>;
  period: Period;
  metric: Metric;
  onMetric: (m: Metric) => void;
  onView: (v: View) => void;
  occasions: Occasion[];
}) {
  const { t } = useTranslation('analytics');
  const { locale } = useLocale();
  const fmt = (n: number) => formatNumber(n, locale);

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="v-skeleton h-[360px] w-full rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="v-skeleton h-56 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const cur = data.ov?.totals ?? {};
  const prev = data.ovPrev?.totals ?? {};
  const valueOf = (m: Metric, which: 'cur' | 'prev') =>
    m === 'LEADS' ? (which === 'cur' ? data.ov?.leads : data.ovPrev?.leads) ?? 0 : (which === 'cur' ? cur : prev)[m] ?? 0;

  const series =
    metric === 'LEADS'
      ? { current: countByDay(leads ?? [], windows.keys), previous: countByDay(leads ?? [], windows.prevKeys) }
      : { current: eventSeries(data.ts, windows.keys, metric), previous: eventSeries(data.tsPrev, windows.prevKeys, metric) };
  const labels = windows.keys.map((k) => formatDate(`${k}T12:00:00Z`, locale, { day: 'numeric', month: 'short' }));
  const hasActivity = series.current.some((v) => v > 0) || series.previous.some((v) => v > 0);

  // From a view to a lead: each step as a share of views.
  const views = cur.VIEW ?? 0;
  const funnel = (['VIEW', 'CLICK', 'SAVE', 'LEADS'] as const).map((m) => ({ key: m, value: valueOf(m, 'cur') }));

  const cardById = new Map(cards.map((c) => [c.id, c]));
  const cardName = (c: Card) => ((c.vcardData?.fullName as string) || '').trim() || `/c/${c.slug}`;
  const refTotal = data.refs.reduce((s, r) => s + r.events, 0);

  return (
    <div className="space-y-4">
      <section className="v-card overflow-hidden">
        <div role="tablist" aria-label={t('metrics.label')} className="grid grid-cols-2 gap-px bg-line lg:grid-cols-5">
          {METRICS.map((m, i) => {
            const active = m === metric;
            const value = valueOf(m, 'cur');
            const before = valueOf(m, 'prev');
            const pct = change(value, before);
            return (
              <button
                key={m}
                role="tab"
                aria-selected={active}
                onClick={() => onMetric(m)}
                className={`relative min-w-0 px-4 py-3.5 text-start transition-colors ${active ? 'bg-surface' : 'bg-elevated hover:bg-surface'} ${
                  i === METRICS.length - 1 ? 'col-span-2 lg:col-span-1' : ''
                }`}
              >
                {active && <span className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
                <span className="block truncate text-xs font-medium text-muted">{t(`metrics.${m}`)}</span>
                <span className="mt-2 flex items-baseline gap-2">
                  <span className="tabular text-4xl font-semibold leading-none tracking-[-0.025em] text-ink">{fmt(value)}</span>
                  {pct !== null && (
                    <span dir="ltr" className={`v-badge ${pct >= 0 ? 'v-badge-success' : 'v-badge-danger'}`}>
                      {formatChange(pct)}
                    </span>
                  )}
                </span>
                <span className="mt-1.5 block truncate text-xs text-faint">{t('metrics.before', { value: fmt(before) })}</span>
              </button>
            );
          })}
        </div>
        <div className="px-4 pb-2 pt-5 sm:px-5">
          {hasActivity ? (
            <TrendChart
              current={series.current}
              previous={series.previous}
              labels={labels}
              currentLabel={t(`metrics.${metric}`)}
              previousLabel={t('metrics.previous')}
              formatDelta={formatChange}
              markers={markersFor(occasions, windows.keys)}
            />
          ) : (
            <div className="flex h-[232px] items-center justify-center px-6 text-center text-sm leading-relaxed text-muted">
              <p className="max-w-sm">{t('metrics.noActivity')}</p>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <section className="v-card">
          <PanelHeader title={t('funnel.title')} meta={t('funnel.meta')} />
          {views === 0 ? (
            <PanelEmpty>{t('funnel.empty')}</PanelEmpty>
          ) : (
            <BarList
              max={views}
              rows={funnel.map((f) => ({
                key: f.key,
                label: t(`funnel.steps.${f.key}`),
                value: f.value,
                aside: `${fmt(Math.round(shareOf(f.value, views)))}%`,
              }))}
            />
          )}
        </section>

        <section className="v-card">
          <PanelHeader title={t('sources.title')} />
          {data.refs.length === 0 ? (
            <PanelEmpty>{t('sources.empty')}</PanelEmpty>
          ) : (
            <>
              <BarList
                rows={data.refs.map((r) => ({
                  key: r.referrer,
                  label: r.referrer === 'direct' ? t('sources.direct') : <span dir="ltr">{referrerHost(r.referrer)}</span>,
                  value: r.events,
                  aside: `${fmt(Math.round(shareOf(r.events, refTotal)))}%`,
                }))}
              />
              <p className="border-t border-line px-4 py-2.5 text-xs text-faint">{t('sources.note')}</p>
            </>
          )}
        </section>

        <section className="v-card lg:col-span-2 xl:col-span-1">
          <PanelHeader
            title={t('topCards.title')}
            action={
              <button onClick={() => onView('cards')} className="v-hit text-xs font-medium text-accent hover:underline">
                {t('topCards.all')}
              </button>
            }
          />
          {data.top.length === 0 ? (
            <PanelEmpty action={<Link href="/cards" className="v-btn v-btn-ghost">{t('topCards.open')}</Link>}>{t('topCards.empty')}</PanelEmpty>
          ) : (
            <BarList
              rows={data.top.map((row) => {
                const card = cardById.get(row.cardId);
                return {
                  key: row.cardId,
                  href: card ? `/cards/${card.id}` : undefined,
                  label: (
                    <span className="flex min-w-0 items-center gap-2.5">
                      {card && <CardThumb card={card} />}
                      <span className="truncate">{card ? cardName(card) : row.slug ? `/c/${row.slug}` : t('deletedCard')}</span>
                    </span>
                  ),
                  value: row.events,
                  aside: t('topCards.leads', { count: row.slug ? periodLeads.filter((l) => l.card?.slug === row.slug).length : 0 }),
                };
              })}
            />
          )}
        </section>
      </div>
    </div>
  );
}
