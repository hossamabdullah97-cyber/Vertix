'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trans, useTranslation } from 'react-i18next';
import { authFetch, getToken, getActiveOrgId, type Card as CardType, type NfcTag, type Member, type Team, type Me } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { DirectionalIcon } from '@/components/i18n/DirectionalIcon';
import { formatDate, formatNumber, formatRelativeTime } from '@/lib/format';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { TrendChart } from '@/components/charts/TrendChart';
import { OccasionsSheet } from '@/components/occasions/OccasionsSheet';
import { countDuring, markersFor, occasionOn, type Occasion } from '@/lib/occasions';
import AppShell from '@/components/AppShell';
import { setupSteps } from '@/lib/onboarding';
import { CardThumb } from '@/components/cards/CardThumb';
import { DAY, change, countByDay, eventSeries, formatChange, periodWindows, rangeQuery, type Overview, type Point } from '@/lib/analytics';


interface Lead {
  id: string;
  name: string | null;
  company: string | null;
  email?: string | null;
  temperature: 'COLD' | 'WARM' | 'HOT';
  source: string | null;
  stageId: string | null;
  createdAt: string;
  card?: { slug: string } | null;
}

interface Stage {
  id: string;
  name: string;
  order: number;
}

interface Department {
  id: string;
  name: string;
  _count: { teams: number; memberships: number };
}

interface ApprovalRequest {
  id: string;
  title: string;
  type: string;
  status: string;
  requester: { name: string; email: string };
  createdAt: string;
}

interface TopCard {
  cardId: string;
  slug: string;
  events: number;
}

interface AuditLog {
  id: string;
  action: string;
  targetType: string | null;
  createdAt: string;
  actor: { name: string | null; email: string } | null;
}

type Period = 7 | 30 | 90;
type MetricKey = 'VIEW' | 'NFC_SCAN' | 'SAVE' | 'LEADS';

const PERIODS: Period[] = [7, 30, 90];

/** "org.branding_updated" → "Branding updated". */
function humanizeAction(action: string) {
  const last = action.split('.').pop() ?? action;
  const words = last.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export default function HomePage() {
  const router = useRouter();
  const { t } = useTranslation('dashboard');
  const { locale } = useLocale();
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [me, setMe] = useState<Me | null>(null);
  const [alertsChosen, setAlertsChosen] = useState(true);

  const [cards, setCards] = useState<CardType[]>([]);
  const [tags, setTags] = useState<NfcTag[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);

  // Organization workspace
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Personal workspace
  const [personalTasks, setPersonalTasks] = useState<any[]>([]);
  const [personalNotifications, setPersonalNotifications] = useState<any[]>([]);

  // Analytics for the chosen period and the one before it
  const [period, setPeriod] = useState<Period>(30);
  const [metric, setMetric] = useState<MetricKey>('VIEW');
  const [ov, setOv] = useState<Overview | null>(null);
  const [ovPrev, setOvPrev] = useState<Overview | null>(null);
  const [ts, setTs] = useState<Point[]>([]);
  const [tsPrev, setTsPrev] = useState<Point[]>([]);
  const [topCards, setTopCards] = useState<TopCard[]>([]);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [showOccasions, setShowOccasions] = useState(false);
  const loadOccasions = useCallback(() => authFetch<Occasion[]>('/orgs/occasions').then(setOccasions).catch(() => setOccasions([])), []);

  const [showOnboarding, setShowOnboarding] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const orgId = getActiveOrgId();
    setActiveOrgId(orgId);

    try {
      const meInfo = await authFetch<Me>('/auth/me');
      setMe(meInfo);
      authFetch<{ saved: boolean }>('/notifications/lead-alerts')
        .then((r) => setAlertsChosen(r.saved))
        .catch(() => setAlertsChosen(true));

      if (!orgId) {
        const [c, tg, l, tsk, ntf] = await Promise.all([
          authFetch<CardType[]>('/cards').catch(() => []),
          authFetch<NfcTag[]>('/nfc/tags').catch(() => []),
          authFetch<Lead[]>('/leads').catch(() => []),
          authFetch<any[]>('/tasks').catch(() => []),
          authFetch<any[]>('/notifications').catch(() => []),
        ]);
        setCards(c);
        setTags(tg);
        setLeads(l);
        setPersonalTasks(tsk);
        setPersonalNotifications(ntf);
      } else {
        const [c, tg, l, stg, mem, tm, dept, appList, logs] = await Promise.all([
          authFetch<CardType[]>('/cards').catch(() => []),
          authFetch<NfcTag[]>('/nfc/tags').catch(() => []),
          authFetch<Lead[]>('/leads').catch(() => []),
          authFetch<Stage[]>('/leads/stages').catch(() => []),
          authFetch<Member[]>('/orgs/members').catch(() => []),
          authFetch<Team[]>('/orgs/teams').catch(() => []),
          authFetch<Department[]>('/orgs/departments').catch(() => []),
          authFetch<ApprovalRequest[]>('/orgs/approvals').catch(() => []),
          authFetch<AuditLog[]>('/orgs/audit-logs').catch(() => []),
        ]);
        setCards(c);
        setTags(tg);
        setLeads(l);
        setStages(stg);
        setMembers(mem);
        setTeams(tm);
        setDepartments(dept);
        setApprovals(appList);
        setAuditLogs(logs);
        loadOccasions();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [loadOccasions]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    const savedOnboarding = localStorage.getItem('vertex_show_onboarding');
    if (savedOnboarding !== null) setShowOnboarding(savedOnboarding === 'true');
    load().catch((e) => setError(e.message));
  }, [router, load]);

  // The window is whole UTC days ending today; the comparison window is the
  // same number of days immediately before it.
  const windows = useMemo(() => periodWindows(period), [period]);

  useEffect(() => {
    if (!activeOrgId) return;
    const now = new Date();
    const q = rangeQuery;
    let alive = true;
    Promise.all([
      authFetch<Overview>('/analytics/overview' + q(windows.from, now)).catch(() => null),
      authFetch<Overview>('/analytics/overview' + q(windows.prevFrom, windows.from)).catch(() => null),
      authFetch<Point[]>('/analytics/timeseries' + q(windows.from, now)).catch(() => []),
      authFetch<Point[]>('/analytics/timeseries' + q(windows.prevFrom, windows.from)).catch(() => []),
      authFetch<TopCard[]>('/analytics/top-cards' + q(windows.from, now)).catch(() => []),
    ]).then(([o, op, s, sp, top]) => {
      if (!alive) return;
      setOv(o);
      setOvPrev(op);
      setTs(s);
      setTsPrev(sp);
      setTopCards(top);
    });
    return () => {
      alive = false;
    };
  }, [activeOrgId, windows]);

  const handleResolveApproval = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await authFetch(`/orgs/approvals/${id}/resolve`, {
        method: 'PATCH',
        body: JSON.stringify({ status, comment: `${status} from the home page` }),
      });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    try {
      await authFetch(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ completed }) });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleOnboarding = () => {
    setShowOnboarding((prev) => {
      const next = !prev;
      localStorage.setItem('vertex_show_onboarding', String(next));
      return next;
    });
  };

  const onboardingSteps = useMemo(
    () =>
      setupSteps({ cards, userId: me?.sub, tags, alertsChosen }).map((step) => ({
        id: step.id,
        label: t(`onboarding.steps.${step.id}.label`),
        desc: t(`onboarding.steps.${step.id}.desc`),
        completed: step.done,
        link: step.href,
        linkText: t(`onboarding.steps.${step.id}.link`),
      })),
    [cards, tags, alertsChosen, me?.sub, t],
  );

  // Leads still sitting in the first pipeline stage have not been picked up yet.
  const firstStageId = useMemo(() => [...stages].sort((a, b) => a.order - b.order)[0]?.id ?? null, [stages]);
  const waitingLeads = useMemo(
    () =>
      leads
        .filter((l) => !l.stageId || l.stageId === firstStageId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [leads, firstStageId],
  );

  const firstName = (me?.name?.trim().split(/\s+/)[0] || me?.email?.split('@')[0] || '').trim();
  const hour = new Date().getHours();
  const greeting = t(hour < 12 ? 'greeting.morning' : hour < 18 ? 'greeting.afternoon' : 'greeting.evening', {
    name: firstName,
  });
  const today = formatDate(new Date(), locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const comma = locale === 'ar' ? '، ' : ', ';
  const fmt = (n: number) => formatNumber(n, locale);
  // Percentages go through Intl so the sign sits on the right side in Arabic too.
  const pctOf = (part: number, whole: number, digits: number) =>
    formatNumber(whole ? part / whole : 0, locale, { style: 'percent', maximumFractionDigits: digits, minimumFractionDigits: digits });

  const newCardAction = (
    <Link href="/cards?new=1" className="v-btn">
      <Icon name="plus" size={15} />
      {t('newCard')}
    </Link>
  );

  if (loading) {
    return (
      <AppShell title={t('titles.command')} action={newCardAction}>
        <div className="space-y-5">
          <div className="v-skeleton h-14 w-80" />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="v-skeleton h-[420px]" />
            <div className="v-skeleton h-[420px]" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="v-skeleton h-60" />
            <div className="v-skeleton h-60" />
          </div>
        </div>
      </AppShell>
    );
  }

  const errorBanner = error && (
    <div role="alert" className="mt-4 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-[13px] text-red-700 dark:text-red-300">
      {error}
    </div>
  );

  const onboarding = (
    <Onboarding steps={onboardingSteps} visible={showOnboarding} onToggle={toggleOnboarding} t={t} />
  );

  const recentLeadsPanel = (
    <section className="v-card flex flex-col">
      <PanelHeader title={t('recent.title')} />
      {leads.length === 0 ? (
        <p className="px-4 pb-6 pt-2 text-[13px] leading-relaxed text-muted">{t('recent.empty')}</p>
      ) : (
        <ul className="px-2 pb-1">
          {leads.slice(0, 6).map((l) => (
            <li key={l.id}>
              <Link href="/leads" className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-elevated">
                <Avatar user={{ id: l.id, name: l.name, email: l.email }} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{l.name || t('recent.unnamed')}</span>
                  <span className="block truncate text-[12px] text-faint">
                    {[l.company, t(`recent.sources.${sourceKey(l.source)}`)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 text-[12px] text-faint">{formatRelativeTime(l.createdAt, locale)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/leads" className="mt-auto border-t border-line px-4 py-3 text-[12.5px] font-medium text-accent hover:underline">
        {t('recent.all')}
      </Link>
    </section>
  );

  // --------------------------------------------------------------------------
  // Personal workspace
  // --------------------------------------------------------------------------
  if (!activeOrgId) {
    const taps = tags.reduce((sum, tg) => sum + (tg.activationCount ?? 0), 0);
    const openTasks = personalTasks.filter((task) => !task.completed);
    const meetingRequests = leads.filter((l) => l.source === 'meeting');
    const stats = [
      { label: t('personal.kpi.cards'), value: cards.length, sub: t('personal.kpi.published', { count: cards.filter((c) => c.isPublished).length }) },
      { label: t('personal.kpi.leads'), value: leads.length, sub: t('personal.kpi.leadsSub') },
      { label: t('personal.kpi.chips'), value: tags.length, sub: t('personal.kpi.chipsSub') },
      { label: t('personal.kpi.taps'), value: taps, sub: t('personal.kpi.tapsSub') },
    ];

    return (
      <AppShell title={t('titles.personal')} action={newCardAction}>
        <h2 className="text-[24px] font-semibold tracking-[-0.022em] text-ink rtl:tracking-normal">{greeting}</h2>
        <p className="mt-1 text-[14px] text-muted">{t('personal.subtitle')}</p>
        {errorBanner}
        {onboarding}

        <div className="v-card mt-5 grid grid-cols-2 overflow-hidden lg:grid-cols-4">
          {stats.map((s, i) => (
            <div key={s.label} className={`px-4 py-4 ${i % 2 ? 'border-s border-line' : ''} ${i >= 2 ? 'border-t border-line lg:border-t-0' : ''} ${i === 2 ? 'lg:border-s' : ''}`}>
              <p className="text-[12.5px] font-medium text-muted">{s.label}</p>
              <p className="tabular mt-2 text-[26px] font-semibold leading-none tracking-[-0.025em] text-ink">{fmt(s.value)}</p>
              <p className="mt-1.5 truncate text-[12px] text-faint">{s.sub}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="v-card">
            <PanelHeader title={t('personal.cards')} meta={cards.length ? fmt(cards.length) : undefined} />
            {cards.length === 0 ? (
              <p className="px-4 pb-6 pt-2 text-[13px] text-muted">{t('personal.noCards')}</p>
            ) : (
              <ul className="px-2 pb-2">
                {cards.map((c) => (
                  <li key={c.id}>
                    <Link href={`/cards/${c.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-elevated">
                      <CardThumb card={c} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-ink">{cardName(c)}</span>
                        <span dir="ltr" className="block truncate text-start font-mono text-[11.5px] text-faint">/c/{c.slug}</span>
                      </span>
                      <span className={`v-badge ${c.isPublished ? 'v-badge-success' : 'v-badge-neutral'}`}>
                        {c.isPublished ? t('personal.live') : t('personal.draft')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {recentLeadsPanel}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <section className="v-card">
            <PanelHeader title={t('personal.tasks')} meta={openTasks.length ? fmt(openTasks.length) : undefined} />
            {openTasks.length === 0 ? (
              <p className="px-4 pb-6 pt-2 text-[13px] text-muted">{t('personal.noTasks')}</p>
            ) : (
              <ul className="px-2 pb-2">
                {openTasks.map((task) => (
                  <li key={task.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-[13.5px] text-ink hover:bg-elevated">
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => handleToggleTask(task.id, !task.completed)}
                        className="h-4 w-4 rounded border-line accent-[var(--v-accent)]"
                      />
                      <span className="truncate">{task.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="v-card">
            <PanelHeader title={t('personal.meetings')} meta={meetingRequests.length ? fmt(meetingRequests.length) : undefined} />
            {meetingRequests.length === 0 ? (
              <p className="px-4 pb-6 pt-2 text-[13px] text-muted">{t('personal.noMeetings')}</p>
            ) : (
              <ul className="px-2 pb-2">
                {meetingRequests.slice(0, 5).map((m) => (
                  <li key={m.id} className="flex items-center gap-3 rounded-lg px-2 py-2.5">
                    <span className="text-faint">
                      <Icon name="calendar" size={16} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{m.name || t('recent.unnamed')}</span>
                    <span className="shrink-0 text-[12px] text-faint">{formatRelativeTime(m.createdAt, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="v-card">
            <PanelHeader
              title={t('personal.notifications')}
              meta={personalNotifications.filter((n) => !n.readAt).length ? fmt(personalNotifications.filter((n) => !n.readAt).length) : undefined}
            />
            {personalNotifications.length === 0 ? (
              <p className="px-4 pb-6 pt-2 text-[13px] text-muted">{t('personal.noNotifications')}</p>
            ) : (
              <ul className="px-2 pb-2">
                {personalNotifications.slice(0, 5).map((n) => (
                  <li key={n.id}>
                    <Link href="/notifications" className="flex gap-3 rounded-lg px-2 py-2.5 hover:bg-elevated">
                      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : 'bg-accent'}`} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-medium text-ink">{n.title}</span>
                        <span className="block truncate text-[12px] text-faint">{n.body || n.category}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </AppShell>
    );
  }

  // --------------------------------------------------------------------------
  // Organization workspace
  // --------------------------------------------------------------------------
  const cur = ov?.totals ?? {};
  const prev = ovPrev?.totals ?? {};
  const views = cur.VIEW ?? 0;
  const newLeads = ov?.leads ?? 0;
  const activeChips = tags.filter((tg) => tg.status === 'ACTIVE').length;

  const tabs: { key: MetricKey; label: string; value: number; previous: number; sub: string }[] = [
    { key: 'VIEW', label: t('metrics.views'), value: views, previous: prev.VIEW ?? 0, sub: t('metrics.viewsSub', { value: fmt(prev.VIEW ?? 0) }) },
    { key: 'NFC_SCAN', label: t('metrics.taps'), value: cur.NFC_SCAN ?? 0, previous: prev.NFC_SCAN ?? 0, sub: t('metrics.tapsSub', { active: activeChips, total: tags.length }) },
    { key: 'SAVE', label: t('metrics.saves'), value: cur.SAVE ?? 0, previous: prev.SAVE ?? 0, sub: t('metrics.savesSub', { pct: pctOf(cur.SAVE ?? 0, views, 0) }) },
    { key: 'LEADS', label: t('metrics.leads'), value: newLeads, previous: ovPrev?.leads ?? 0, sub: t('metrics.leadsSub', { pct: pctOf(newLeads, views, 1) }) },
  ];
  const selected = tabs.find((tab) => tab.key === metric) ?? tabs[0];

  const series =
    metric === 'LEADS'
      ? { current: countByDay(leads, windows.keys), previous: countByDay(leads, windows.prevKeys) }
      : { current: eventSeries(ts, windows.keys, metric), previous: eventSeries(tsPrev, windows.prevKeys, metric) };
  const dayLabel = (key: string) => formatDate(`${key}T12:00:00Z`, locale, { day: 'numeric', month: 'short' });
  const labels = windows.keys.map(dayLabel);
  const hasActivity = series.current.some((v) => v > 0) || series.previous.some((v) => v > 0);
  const peak = series.current.reduce((best, v, i) => (v > series.current[best] ? i : best), 0);
  const markers = markersFor(occasions, windows.keys);
  const peakOccasion = occasionOn(occasions, windows.keys[peak]);
  const leadsDuringPeak = peakOccasion ? countDuring(peakOccasion.occasion, leads.map((l) => l.createdAt)) : 0;
  const myRole = members.find((m) => m.user.id === me?.id)?.role;
  const canManageOccasions = !!me?.isSuperAdmin || myRole === 'OWNER' || myRole === 'ADMIN' || myRole === 'MANAGER';

  // The headline: this week's new leads, and how many of them nobody has picked up yet.
  const weekAgo = Date.now() - 7 * DAY;
  const thisWeek = leads.filter((l) => new Date(l.createdAt).getTime() >= weekAgo);
  const waitingThisWeek = thisWeek.filter((l) => !l.stageId || l.stageId === firstStageId).length;

  const pendingApprovals = approvals.filter((a) => a.status === 'PENDING');
  const unlinkedChips = tags.filter((tg) => !tg.cardId && tg.status !== 'DISABLED');
  const draftCards = cards.filter((c) => !c.isPublished);

  const leadsBySlug = new Map<string, number>();
  for (const l of leads) if (l.card?.slug) leadsBySlug.set(l.card.slug, (leadsBySlug.get(l.card.slug) ?? 0) + 1);
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const topRows = topCards.slice(0, 5);
  const topMax = Math.max(1, ...topRows.map((r) => r.events));

  const largestTeams = [...teams]
    .map((tm) => ({ id: tm.id, name: tm.name, seats: tm._count?.memberships ?? 0 }))
    .sort((a, b) => b.seats - a.seats)
    .slice(0, 3);

  return (
    <AppShell title={t('titles.command')} action={newCardAction}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[24px] font-semibold tracking-[-0.022em] text-ink rtl:tracking-normal">{greeting}</h2>
          <p className="mt-1 text-[14px] text-muted">
            {today} ·{' '}
            {thisWeek.length > 0 ? (
              <>
                <span className="font-medium text-ink">{t('summary.newLeads', { count: thisWeek.length })}</span>
                {comma}
                {waitingThisWeek > 0 ? t('summary.waiting', { count: waitingThisWeek }) : t('summary.allAnswered')}
              </>
            ) : (
              `${t('summary.noNewLeads')}.`
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setShowOccasions(true)} className="v-btn v-btn-ghost sm:!h-8">
          <Icon name="calendar" size={14} /> {t('occasions.button')}
        </button>
        <div role="radiogroup" aria-label={t('period.label')} className="inline-flex rounded-lg bg-elevated p-0.5 ring-1 ring-inset ring-line">
          {PERIODS.map((p) => (
            <button
              key={p}
              role="radio"
              aria-checked={period === p}
              onClick={() => setPeriod(p)}
              className={`h-11 rounded-md px-3 text-[12.5px] font-medium transition-colors sm:h-7 ${
                period === p ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'
              }`}
            >
              {t(`period.d${p}`)}
            </button>
          ))}
        </div>
        </div>
      </div>

      {errorBanner}
      {onboarding}

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="v-card min-w-0 overflow-hidden">
          <div role="tablist" className="grid grid-cols-2 border-b border-line lg:grid-cols-4">
            {tabs.map((tab, i) => {
              const active = tab.key === metric;
              const pct = change(tab.value, tab.previous);
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMetric(tab.key)}
                  className={`relative min-w-0 px-4 py-3.5 text-start transition-colors ${
                    active ? 'bg-surface' : 'bg-elevated hover:bg-surface'
                  } ${i % 2 ? 'border-s border-line' : ''} ${i >= 2 ? 'border-t border-line lg:border-t-0' : ''} ${i === 2 ? 'lg:border-s' : ''}`}
                >
                  {active && <span className="absolute inset-x-0 top-0 h-0.5 bg-accent" />}
                  <span className="block truncate text-[12.5px] font-medium text-muted">{tab.label}</span>
                  <span className="mt-2 flex items-baseline gap-2">
                    <span className="tabular text-[26px] font-semibold leading-none tracking-[-0.025em] text-ink">{fmt(tab.value)}</span>
                    {pct !== null && (
                      <span dir="ltr" className={`v-badge ${pct >= 0 ? 'v-badge-success' : 'v-badge-danger'}`}>
                        {formatChange(pct)}
                      </span>
                    )}
                  </span>
                  <span className="mt-1.5 block truncate text-[12px] text-faint">{tab.sub}</span>
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
                currentLabel={selected.label}
                previousLabel={t('metrics.previous')}
                formatDelta={formatChange}
                markers={markers}
              />
            ) : (
              <div className="flex h-[232px] items-center justify-center px-6 text-center text-[13px] leading-relaxed text-muted">
                <p className="max-w-sm">{t('metrics.noActivity')}</p>
              </div>
            )}
          </div>

          {hasActivity && series.current[peak] > 0 && (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line bg-elevated px-4 py-3 text-[13px] text-muted sm:px-5">
              <span className="v-badge v-badge-neutral">{t('metrics.insight')}</span>
              <span className="min-w-0 flex-1">
                {peakOccasion ? (
                  <>
                    <Trans
                      t={t}
                      i18nKey="metrics.busiestDuring"
                      values={{
                        date: dayLabel(windows.keys[peak]),
                        count: fmt(series.current[peak]),
                        metric: selected.label.toLocaleLowerCase(locale),
                        day: fmt(peakOccasion.day),
                        occasion: peakOccasion.occasion.name,
                      }}
                      components={{ b: <b className="font-medium text-ink" /> }}
                    />
                    {leadsDuringPeak > 0 && (
                      <>
                        {' '}
                        <Trans t={t} i18nKey="metrics.leadsDuring" values={{ count: fmt(leadsDuringPeak) }} components={{ b: <b className="font-medium text-ink" /> }} />
                      </>
                    )}
                  </>
                ) : (
                  <Trans
                    t={t}
                    i18nKey="metrics.busiest"
                    values={{ date: dayLabel(windows.keys[peak]), count: fmt(series.current[peak]), metric: selected.label.toLocaleLowerCase(locale) }}
                    components={{ b: <b className="font-medium text-ink" /> }}
                  />
                )}
              </span>
              <Link href="/analytics" className="text-[12.5px] font-medium text-accent hover:underline">
                {t('metrics.openAnalytics')}
              </Link>
            </div>
          )}
        </section>

        {recentLeadsPanel}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="v-card">
          <PanelHeader title={t('attention.title')} />
          <ul className="px-2 pb-2">
            {waitingLeads.length > 0 && (
              <AttentionRow
                icon="inbox"
                tone="accent"
                title={t('attention.newLeads', { count: waitingLeads.length })}
                desc={t('attention.oldestWaiting', { time: formatRelativeTime(waitingLeads[0].createdAt, locale) })}
                action={
                  <Link href="/leads" className="v-btn v-btn-ghost !h-11 !px-3 !text-[12.5px] sm:!h-8">
                    {t('attention.openLeads')}
                  </Link>
                }
              />
            )}
            {pendingApprovals.map((req) => (
              <AttentionRow
                key={req.id}
                icon="check"
                tone="warning"
                title={req.title}
                desc={t('attention.requestedBy', { name: req.requester.name || req.requester.email })}
                action={
                  <span className="flex gap-1.5">
                    <button
                      onClick={() => handleResolveApproval(req.id, 'REJECTED')}
                      className="v-btn v-btn-ghost !h-11 !px-3 !text-[12.5px] sm:!h-8"
                    >
                      {t('attention.reject')}
                    </button>
                    <button onClick={() => handleResolveApproval(req.id, 'APPROVED')} className="v-btn !h-11 !px-3 !text-[12.5px] sm:!h-8">
                      {t('attention.approve')}
                    </button>
                  </span>
                }
              />
            ))}
            {unlinkedChips.length > 0 && (
              <AttentionRow
                icon="tag"
                title={t('attention.unlinked', { count: unlinkedChips.length })}
                desc={
                  <span dir="ltr" className="font-mono">
                    {unlinkedChips
                      .slice(0, 2)
                      .map((tg) => tg.uid)
                      .join(', ')}
                    {unlinkedChips.length > 2 ? ', …' : ''}
                  </span>
                }
                action={
                  <Link href="/tags" className="v-btn v-btn-ghost !h-11 !px-3 !text-[12.5px] sm:!h-8">
                    {t('attention.link')}
                  </Link>
                }
              />
            )}
            {draftCards.length > 0 && (
              <AttentionRow
                icon="grid"
                title={t('attention.drafts', { count: draftCards.length })}
                desc={draftCards.slice(0, 2).map(cardName).join(comma) + (draftCards.length > 2 ? comma + '…' : '')}
                action={
                  <Link
                    href={draftCards.length === 1 ? `/cards/${draftCards[0].id}` : '/cards'}
                    className="v-btn v-btn-ghost !h-11 !px-3 !text-[12.5px] sm:!h-8"
                  >
                    {t('attention.review')}
                  </Link>
                }
              />
            )}
            {!waitingLeads.length && !pendingApprovals.length && !unlinkedChips.length && !draftCards.length && (
              <li className="flex items-center gap-3 px-2 py-5 text-[13px] text-muted">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                  <Icon name="check" size={14} />
                </span>
                {t('attention.clear')}
              </li>
            )}
          </ul>
        </section>

        <section className="v-card overflow-hidden">
          <PanelHeader
            title={t('top.title')}
            action={
              <Link href="/cards" className="text-[12.5px] font-medium text-accent hover:underline">
                {t('top.all')}
              </Link>
            }
          />
          {topRows.length === 0 ? (
            <p className="px-4 pb-6 pt-2 text-[13px] text-muted">{t('top.empty')}</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[12px] text-faint">
                  <th className="px-4 pb-2 pt-1 text-start font-medium">{t('top.card')}</th>
                  <th className="px-4 pb-2 pt-1 text-end font-medium">{t('top.interactions')}</th>
                  <th className="px-4 pb-2 pt-1 text-end font-medium">{t('top.leads')}</th>
                </tr>
              </thead>
              <tbody>
                {topRows.map((row) => {
                  const card = cardById.get(row.cardId);
                  return (
                    <tr key={row.cardId} className="border-t border-line">
                      <td className="w-full max-w-0 px-4 py-2.5">
                        <Link href={card ? `/cards/${card.id}` : '/cards'} className="flex min-w-0 items-center gap-3">
                          {card ? <CardThumb card={card} /> : <span className="h-[25px] w-10 rounded bg-elevated" />}
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink">{card ? cardName(card) : row.slug}</span>
                            <span dir="ltr" className="block truncate text-start font-mono text-[11.5px] text-faint">/c/{row.slug}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center justify-end gap-2.5 whitespace-nowrap">
                          <span className="tabular text-ink">{fmt(row.events)}</span>
                          <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-elevated ring-1 ring-inset ring-line sm:block">
                            <span className="block h-full rounded-full bg-accent" style={{ width: `${(row.events / topMax) * 100}%` }} />
                          </span>
                        </span>
                      </td>
                      <td className="tabular px-4 py-2.5 text-end text-ink">{fmt(leadsBySlug.get(row.slug) ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="v-card">
          <PanelHeader title={t('activity.title')} />
          {auditLogs.length === 0 ? (
            <p className="px-4 pb-6 pt-2 text-[13px] text-muted">{t('activity.empty')}</p>
          ) : (
            <ul className="px-2 pb-2">
              {auditLogs.slice(0, 6).map((log) => (
                <li key={log.id} className="flex items-center gap-3 rounded-lg px-2 py-2.5">
                  <span className="v-icon-tile !h-7 !w-7">
                    <Icon name={auditIcon(log.action)} size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-ink">{humanizeAction(log.action)}</span>
                    <span className="block truncate text-[12px] text-faint">
                      {[log.actor?.name || log.actor?.email, log.targetType].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-[12px] text-faint">{formatRelativeTime(log.createdAt, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="v-card flex flex-col">
          <PanelHeader title={t('team.title')} />
          <dl className="grid grid-cols-3 border-y border-line">
            {[
              [t('team.members'), members.length],
              [t('team.teams'), teams.length],
              [t('team.departments'), departments.length],
            ].map(([label, value], i) => (
              <div key={label as string} className={`px-4 py-3 ${i ? 'border-s border-line' : ''}`}>
                <dt className="truncate text-[12px] text-faint">{label}</dt>
                <dd className="tabular mt-1 text-[20px] font-semibold leading-none text-ink">{fmt(value as number)}</dd>
              </div>
            ))}
          </dl>
          <div className="px-4 py-3">
            <p className="text-[12px] text-faint">{t('team.largest')}</p>
            {largestTeams.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted">{t('team.noTeams')}</p>
            ) : (
              <ul className="mt-1">
                {largestTeams.map((tm) => (
                  <li key={tm.id} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
                    <Link href={`/team?team=${tm.id}`} className="truncate text-ink hover:underline">
                      {tm.name}
                    </Link>
                    <span className="shrink-0 text-faint">{t('team.seat', { count: tm.seats })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link href="/team" className="mt-auto border-t border-line px-4 py-3 text-[12.5px] font-medium text-accent hover:underline">
            {t('team.manage')}
          </Link>
        </section>
      </div>
      <OccasionsSheet open={showOccasions} onClose={() => setShowOccasions(false)} occasions={occasions} canManage={canManageOccasions} onChanged={loadOccasions} />
    </AppShell>
  );
}

function sourceKey(source: string | null) {
  return source && ['nfc_scan', 'card_form', 'meeting', 'quote'].includes(source) ? source : 'other';
}

function cardName(card: CardType) {
  return ((card.vcardData?.fullName as string) || card.slug).trim();
}

/** A tiny rendition of the card in its own colours, so a list reads at a glance. */
function auditIcon(action: string) {
  const a = action.toLowerCase();
  if (a.includes('card')) return 'grid';
  if (a.includes('member') || a.includes('role') || a.includes('invite')) return 'user';
  if (a.includes('team')) return 'users';
  if (a.includes('dept') || a.includes('department')) return 'layers';
  if (a.includes('lead')) return 'inbox';
  if (a.includes('tag') || a.includes('nfc') || a.includes('chip')) return 'tag';
  return 'clock';
}

function PanelHeader({ title, meta, action }: { title: string; meta?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 pb-2 pt-3.5">
      <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
      {meta && <span className="tabular text-[12.5px] text-faint">{meta}</span>}
      {action && <span className="ms-auto">{action}</span>}
    </div>
  );
}

function AttentionRow({
  icon,
  tone,
  title,
  desc,
  action,
}: {
  icon: string;
  tone?: 'accent' | 'warning';
  title: string;
  desc: React.ReactNode;
  action: React.ReactNode;
}) {
  const toneClass =
    tone === 'accent'
      ? 'bg-accent/10 text-accent'
      : tone === 'warning'
        ? 'bg-amber-500/10 text-amber-600'
        : 'bg-elevated text-muted ring-1 ring-inset ring-line';
  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-line px-2 py-3 last:border-b-0 sm:flex-nowrap">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
        <Icon name={icon} size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-ink">{title}</span>
        <span className="block truncate text-[12px] text-faint">{desc}</span>
      </span>
      <span className="shrink-0">{action}</span>
    </li>
  );
}

function Onboarding({
  steps,
  visible,
  onToggle,
  t,
}: {
  steps: { id: string; label: string; desc: string; completed: boolean; link: string; linkText: string }[];
  visible: boolean;
  onToggle: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const done = steps.filter((s) => s.completed).length;
  if (done === steps.length) return null;

  if (!visible) {
    return (
      <button onClick={onToggle} className="mt-4 min-h-11 text-[12.5px] font-medium text-accent hover:underline sm:min-h-0">
        {t('onboarding.show', { done, total: steps.length })}
      </button>
    );
  }

  return (
    <section className="v-card mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3">
        <h3 className="text-[14px] font-semibold text-ink">{t('onboarding.title')}</h3>
        <span className="text-[12.5px] text-faint">{t('onboarding.progress', { done, total: steps.length })}</span>
        <span className="flex gap-1" aria-hidden>
          {steps.map((s) => (
            <span key={s.id} className={`h-1 w-6 rounded-full ${s.completed ? 'bg-accent' : 'bg-line'}`} />
          ))}
        </span>
        <button onClick={onToggle} className="ms-auto min-h-11 text-[12.5px] text-muted hover:text-ink sm:min-h-0">
          {t('onboarding.hide')}
        </button>
      </div>
      <ol className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.id} className="flex gap-3 bg-surface p-4">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                s.completed ? 'bg-accent text-white' : 'text-faint ring-1 ring-inset ring-faint/40'
              }`}
            >
              {s.completed ? <Icon name="check" size={12} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-[13.5px] font-medium ${s.completed ? 'text-faint line-through' : 'text-ink'}`}>{s.label}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{s.desc}</p>
              {!s.completed && (
                <Link href={s.link} className="mt-2 inline-flex min-h-11 items-center gap-1 text-[12.5px] font-medium text-accent hover:underline sm:min-h-0">
                  {s.linkText}
                  <DirectionalIcon name="arrow" size={13} />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
