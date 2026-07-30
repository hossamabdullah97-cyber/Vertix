'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { authFetch, getToken, getActiveOrgId, type Card as CardType, type NfcTag, type Member, type Team, type Me } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatDate, formatTime, formatDateTime } from '@/lib/format';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { Sparkline } from '@/components/charts/Sparkline';
import { AreaChart } from '@/components/charts/AreaChart';
import AppShell from '@/components/AppShell';

// Design System Imports
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Badge,
  ProgressBar,
  Skeleton,
  Alert,
} from '@/design-system';

interface Overview {
  totals: Record<string, number>;
  uniqueVisitors: number;
  leads: number;
}

interface Point {
  day: string;
  VIEW: number;
  CLICK: number;
  SAVE: number;
  SHARE: number;
  NFC_SCAN: number;
}

interface Lead {
  id: string;
  name: string | null;
  company: string | null;
  temperature: 'COLD' | 'WARM' | 'HOT';
  source: string;
  stageId: string | null;
  createdAt: string;
  intent?: string | null;
  meetingAt?: string | null;
  email?: string | null;
  phone?: string | null;
}

interface Stage {
  id: string;
  name: string;
  order: number;
}

interface Department {
  id: string;
  name: string;
  color: string | null;
  manager: { name: string; email: string } | null;
  _count: { teams: number; memberships: number };
}

interface ApprovalRequest {
  id: string;
  title: string;
  type: string;
  status: string;
  comment: string | null;
  requester: { name: string; email: string };
  createdAt: string;
  metadata: Record<string, any> | null;
}

export default function CommandCenter() {
  const router = useRouter();
  const { t } = useTranslation('dashboard');
  const { locale } = useLocale();
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [me, setMe] = useState<Me | null>(null);
  // Switcher and Org details
  const [org, setOrg] = useState<{ id: string; name: string; slug: string; plan: string } | null>(null);

  // Common workspace stats
  const [cards, setCards] = useState<CardType[]>([]);
  const [tags, setTags] = useState<NfcTag[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);

  // Org Specific states
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Personal workspace extra states
  const [personalTasks, setPersonalTasks] = useState<any[]>([]);
  const [personalNotifications, setPersonalNotifications] = useState<any[]>([]);

  // Analytics states
  const [ov, setOv] = useState<Overview | null>(null);
  const [ts, setTs] = useState<Point[]>([]);

  // Filter State
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState('ALL');

  const [showOnboarding, setShowOnboarding] = useState(true);

  const onboardingSteps = useMemo(() => {
    const hasCard = cards.length > 0;
    const hasPublishedCard = cards.some(c => c.isPublished);
    const hasLinkedTag = tags.some(t => t.cardId !== null);
    const hasLeads = leads.length > 0;

    return [
      {
        id: 'create-card',
        label: t('onboarding.steps.createCard.label'),
        desc: t('onboarding.steps.createCard.desc'),
        completed: hasCard,
        link: '/cards',
        linkText: t('onboarding.steps.createCard.link'),
      },
      {
        id: 'publish-card',
        label: t('onboarding.steps.publishCard.label'),
        desc: t('onboarding.steps.publishCard.desc'),
        completed: hasPublishedCard,
        link: cards[0] ? `/cards/${cards[0].id}` : '/cards',
        linkText: cards[0] ? t('onboarding.steps.publishCard.link') : t('onboarding.steps.publishCard.linkAlt'),
      },
      {
        id: 'link-tag',
        label: t('onboarding.steps.linkTag.label'),
        desc: t('onboarding.steps.linkTag.desc'),
        completed: hasLinkedTag,
        link: '/tags',
        linkText: t('onboarding.steps.linkTag.link'),
      },
      {
        id: 'capture-lead',
        label: t('onboarding.steps.captureLead.label'),
        desc: t('onboarding.steps.captureLead.desc'),
        completed: hasLeads,
        link: '/leads',
        linkText: t('onboarding.steps.captureLead.link'),
      },
    ];
  }, [cards, tags, leads, t]);

  const onboardingProgress = useMemo(() => {
    const completedCount = onboardingSteps.filter(s => s.completed).length;
    return Math.round((completedCount / onboardingSteps.length) * 100);
  }, [onboardingSteps]);

  const toggleOnboarding = () => {
    setShowOnboarding((prev) => {
      const next = !prev;
      localStorage.setItem('vertex_show_onboarding', String(next));
      return next;
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const orgId = getActiveOrgId();
    setActiveOrgId(orgId);

    try {
      const meInfo = await authFetch<Me>('/auth/me');
      setMe(meInfo);

      if (!orgId) {
        // PERSONAL WORKSPACE DATA
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
        // ORGANIZATION WORKSPACE DATA
        const [o, c, tg, l, stg, mem, tm, dept, appList, logs, currentOrg] = await Promise.all([
          authFetch<Overview>('/analytics/overview').catch(() => null),
          authFetch<Point[]>('/analytics/timeseries').catch(() => []),
          authFetch<NfcTag[]>('/nfc/tags').catch(() => []),
          authFetch<Lead[]>('/leads').catch(() => []),
          authFetch<Stage[]>('/leads/stages').catch(() => []),
          authFetch<Member[]>('/orgs/members').catch(() => []),
          authFetch<Team[]>('/orgs/teams').catch(() => []),
          authFetch<Department[]>('/orgs/departments').catch(() => []),
          authFetch<ApprovalRequest[]>('/orgs/approvals').catch(() => []),
          authFetch<any[]>('/orgs/audit-logs').catch(() => []),
          authFetch<{ id: string; name: string; slug: string; plan: string }>('/orgs/current').catch(() => null),
        ]);

        setOv(o);
        setTs(c as any); // timeseries
        setTags(tg);
        setLeads(l);
        setStages(stg);
        setMembers(mem);
        setTeams(tm);
        setDepartments(dept);
        setApprovals(appList);
        setAuditLogs(logs);
        setOrg(currentOrg);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    const savedOnboarding = localStorage.getItem('vertex_show_onboarding');
    if (savedOnboarding !== null) {
      setShowOnboarding(savedOnboarding === 'true');
    }
    load().catch((e) => setError(e.message));
  }, [router, load]);

  const handleResolveApproval = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await authFetch(`/orgs/approvals/${id}/resolve`, {
        method: 'PATCH',
        body: JSON.stringify({ status, comment: `${status} via CommandCenter Dashboard` }),
      });
      // reload data
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Helper selectors & aggregations
  const totalViews = useMemo(() => {
    if (activeOrgId) return ov?.totals?.VIEW ?? 0;
    return cards.length * 15; // fallback client-side estimation for personal mode
  }, [activeOrgId, ov, cards]);

  const totalTaps = useMemo(() => {
    if (activeOrgId) return ov?.totals?.NFC_SCAN ?? 0;
    return tags.reduce((sum, t) => sum + (t.activationCount ?? 0), 0);
  }, [activeOrgId, ov, tags]);

  const totalLeads = leads.length;

  const convRate = useMemo(() => {
    return totalViews ? ((totalLeads / totalViews) * 100).toFixed(1) : '0.0';
  }, [totalViews, totalLeads]);

  const filteredCards = useMemo(() => {
    if (!searchQuery) return [];
    return cards.filter(c => c.slug.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [cards, searchQuery]);

  // Timeseries graphs data
  const days = useMemo(() => ts.map((p) => p.day), [ts]);
  const viewsSeries = useMemo(() => ts.map((p) => p.VIEW), [ts]);
  const scansSeries = useMemo(() => ts.map((p) => p.NFC_SCAN), [ts]);
  const clicksSeries = useMemo(() => ts.map((p) => p.CLICK), [ts]);
  const savesSeries = useMemo(() => ts.map((p) => p.SAVE), [ts]);
  const graphLabels = useMemo(() => days.map((d) => d.slice(5)), [days]);

  if (loading) {
    return (
      <AppShell title={t('titles.command')}>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <Skeleton className="h-10 w-64 animate-pulse bg-line" />
            <Skeleton className="h-10 w-36 animate-pulse bg-line" />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((n) => (
              <Skeleton key={n} className="h-28 rounded-2xl animate-pulse bg-line" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <Skeleton className="h-96 rounded-2xl animate-pulse bg-line" />
            <Skeleton className="h-96 rounded-2xl animate-pulse bg-line" />
          </div>
        </div>
      </AppShell>
    );
  }

  // --------------------------------------------------------------------------
  const handleToggleTask = async (taskId: string, completed: boolean) => {
    try {
      await authFetch(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed }),
      });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // --------------------------------------------------------------------------
  // (A) PERSONAL WORKSPACE VIEW
  // --------------------------------------------------------------------------
  if (!activeOrgId) {
    const initialLetter = (me?.email?.charAt(0) ?? 'P').toUpperCase();
    const personalLeads = leads.length;
    const personalTaps = tags.reduce((sum, t) => sum + (t.activationCount ?? 0), 0);
    const publishedCount = cards.filter((c) => c.isPublished).length;

    const activeTasks = personalTasks.filter(t => !t.completed);
    const upcomingMeetings = leads.filter(l => l.intent === 'MEETING' && l.meetingAt).sort((a, b) => new Date(a.meetingAt!).getTime() - new Date(b.meetingAt!).getTime());

    return (
      <AppShell title={t('titles.personal')}>
        <div className="space-y-8">
          {/* Hero Banner */}
          <div className="v-hero p-6 md:p-7">
            <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4 min-w-0">
                {me?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={me.avatarUrl}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-2xl object-cover ring-2 ring-white/25"
                  />
                ) : (
                  // On the gradient hero the frosted tile reads better than a
                  // solid initials circle, so keep the banner's own treatment.
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-lg font-extrabold text-white backdrop-blur">
                    {initialLetter}
                  </span>
                )}
                <div className="min-w-0">
                  <h2 className="v-display text-[22px] font-extrabold tracking-tight text-white">{t('titles.personal')}</h2>
                  <p className="mt-1 max-w-xl text-[12.5px] font-medium text-white/75">
                    {t('personal.heroSubtitle')}
                  </p>
                </div>
              </div>
              <Link
                href="/cards"
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-bold text-[#1d4ed8] shadow-sm transition-transform hover:-translate-y-0.5"
              >
                <Icon name="plus" size={15} /> {t('personal.createCard')}
              </Link>
            </div>
          </div>

          {/* Onboarding Checklist */}
          <OnboardingWizard
            steps={onboardingSteps}
            progress={onboardingProgress}
            visible={showOnboarding}
            onToggle={toggleOnboarding}
            t={t}
          />

          {/* Quick Metrics Grid — real counts only */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label={t('personal.kpi.myCards')} value={cards.length} icon="grid" sub={t('personal.kpi.published', { count: publishedCount })} />
            <KpiCard label={t('personal.kpi.leadsCaptured')} value={personalLeads} icon="inbox" sub={t('personal.kpi.crmContacts')} />
            <KpiCard label={t('personal.kpi.nfcDevices')} value={tags.length} icon="tag" sub={t('personal.kpi.registered')} />
            <KpiCard label={t('personal.kpi.nfcTaps')} value={personalTaps} icon="sparkle" sub={t('personal.kpi.lifetimeScans')} />
          </div>

          {/* 3-Column Content Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Column 1: Profile & Card List */}
            <div className="space-y-6">
              <Card variant="standard" className="p-5 space-y-4">
                <h3 className="text-[13.5px] font-black text-ink tracking-tight flex items-center gap-2 border-b border-line pb-2.5">
                  <Icon name="user" size={15} /> {t('personal.creatorProfile')}
                </h3>
                <div className="space-y-3.5 text-xs font-semibold text-muted">
                  <div className="flex items-center justify-between py-1 border-b border-line/60">
                    <span>{t('personal.emailAddress')}</span>
                    <span dir="ltr" className="text-ink font-bold font-mono truncate max-w-[150px]">{me?.email}</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-line/60">
                    <span>{t('personal.workspaceLevel')}</span>
                    <span className="text-ink font-bold uppercase tracking-wider">{t('personal.freeDeveloper')}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span>{t('personal.userTokenId')}</span>
                    <span className="text-faint font-mono">{me?.sub?.slice(0, 10)}...</span>
                  </div>
                </div>
              </Card>

              <Card variant="standard" className="p-5 space-y-4">
                <h3 className="text-[13.5px] font-black text-ink tracking-tight flex items-center gap-2 border-b border-line pb-2.5">
                  <Icon name="grid" size={15} /> {t('personal.activeCards', { count: cards.length })}
                </h3>
                {cards.length === 0 ? (
                  <div className="text-center py-6 text-faint">
                    <p className="text-xs font-bold">{t('personal.noCards')}</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {cards.map((c) => (
                      <Link
                        key={c.id}
                        href={`/cards/${c.id}`}
                        className="p-3 bg-canvas/30 border border-line rounded-xl hover:border-accent transition-all flex items-center justify-between text-xs"
                      >
                        <div>
                          <p className="font-bold text-ink truncate max-w-[150px]">{c.slug}</p>
                          <p className="text-[10px] text-faint font-mono mt-0.5">/c/{c.slug}</p>
                        </div>
                        <Badge variant={c.isPublished ? 'success' : 'neutral'} className="text-[9px] uppercase font-black">
                          {c.isPublished ? t('personal.live') : t('personal.draft')}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Column 2: CRM & Tasks */}
            <div className="space-y-6">
              <Card variant="standard" className="p-5 space-y-4">
                <h3 className="text-[13.5px] font-black text-ink tracking-tight flex items-center gap-2 border-b border-line pb-2.5">
                  <Icon name="check-circle" size={15} /> {t('personal.personalTasks', { count: activeTasks.length })}
                </h3>
                {activeTasks.length === 0 ? (
                  <p className="text-xs font-bold text-muted text-center py-6">{t('personal.allTasksDone')}</p>
                ) : (
                  <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                    {activeTasks.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-center gap-2.5 p-2.5 bg-canvas/30 border border-line rounded-xl cursor-pointer hover:bg-canvas/60 transition-all text-xs font-semibold text-ink"
                      >
                        <input
                          type="checkbox"
                          checked={t.completed}
                          onChange={() => handleToggleTask(t.id, !t.completed)}
                          className="h-4 w-4 rounded border-line text-accent focus:ring-accent"
                        />
                        <span className="truncate">{t.title}</span>
                      </label>
                    ))}
                  </div>
                )}
              </Card>

              <Card variant="standard" className="p-5 space-y-4">
                <h3 className="text-[13.5px] font-black text-ink tracking-tight flex items-center gap-2 border-b border-line pb-2.5">
                  <Icon name="calendar" size={15} /> {t('personal.upcomingMeetings', { count: upcomingMeetings.length })}
                </h3>
                {upcomingMeetings.length === 0 ? (
                  <p className="text-xs font-bold text-muted text-center py-6">{t('personal.noMeetings')}</p>
                ) : (
                  <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                    {upcomingMeetings.map((m) => (
                      <div key={m.id} className="p-2.5 bg-canvas/30 border border-line rounded-xl text-xs font-semibold">
                        <div className="flex justify-between items-center">
                          <span className="text-ink font-bold">{m.name}</span>
                          <Badge variant="warning" className="text-[9px] uppercase font-black">{t('personal.scheduled')}</Badge>
                        </div>
                        <p className="text-muted mt-1 text-[11px]">
                          📅 {formatDateTime(m.meetingAt!, locale)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Column 3: Activity & Notifications */}
            <div className="space-y-6">
              <Card variant="standard" className="p-5 space-y-4">
                <h3 className="text-[13.5px] font-black text-ink tracking-tight flex items-center gap-2 border-b border-line pb-2.5">
                  <Icon name="bell" size={15} /> {t('personal.notifications', { count: personalNotifications.filter(n => !n.readAt).length })}
                </h3>
                {personalNotifications.length === 0 ? (
                  <p className="text-xs font-bold text-muted text-center py-6">{t('personal.allClear')}</p>
                ) : (
                  <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                    {personalNotifications.slice(0, 4).map((n) => (
                      <div
                        key={n.id}
                        className="p-2.5 bg-canvas/30 border border-line rounded-xl text-xs font-semibold text-muted flex gap-2 items-start"
                        style={{ background: n.readAt ? undefined : 'var(--v-accent-soft)' }}
                      >
                        <span className="h-2 w-2 shrink-0 rounded-full bg-accent mt-1.5" />
                        <div>
                          <p className="text-ink font-bold">{n.title}</p>
                          <p className="text-[10px] text-faint mt-0.5">{n.body || n.category}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card variant="standard" className="p-5 space-y-4">
                <h3 className="text-[13.5px] font-black text-ink tracking-tight flex items-center gap-2 border-b border-line pb-2.5">
                  <Icon name="clock" size={15} /> {t('personal.quickActions')}
                </h3>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <Link href="/cards" className="p-3 bg-canvas/30 hover:bg-canvas border border-line rounded-xl text-xs font-bold text-ink block transition-colors">
                    📇 {t('personal.qaCards')}
                  </Link>
                  <Link href="/tags" className="p-3 bg-canvas/30 hover:bg-canvas border border-line rounded-xl text-xs font-bold text-ink block transition-colors">
                    🏷️ {t('personal.qaLinkNfc')}
                  </Link>
                  <Link href="/leads" className="p-3 bg-canvas/30 hover:bg-canvas border border-line rounded-xl text-xs font-bold text-ink block transition-colors col-span-2">
                    🎯 {t('personal.qaCrm')}
                  </Link>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // --------------------------------------------------------------------------
  // (B) ORGANIZATION WORKSPACE VIEW
  // --------------------------------------------------------------------------
  const orgName = org?.name ?? 'Corporate Hub';
  const orgPlan = org?.plan ?? 'PRO';

  // Dynamic filter for approvals
  const pendingApprovals = approvals.filter(a => a.status === 'PENDING');

  // Largest teams — ranked by real membership counts (no fabricated scores).
  const topTeams = [...teams]
    .map((t) => ({ id: t.id, name: t.name, seats: t._count?.memberships ?? 0 }))
    .sort((a, b) => b.seats - a.seats)
    .slice(0, 4);

  // Recently joined members — real directory data, newest first where available.
  const recentMembers = [...members].slice(0, 4);

  return (
    <AppShell title={t('titles.command')}>
      {/* 1. Hero Banner */}
      <div className="v-hero mb-6 p-6 md:p-7">
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/90 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> {t('org.planConnected', { plan: orgPlan })}
            </span>
            <h2 className="v-display text-[22px] font-extrabold tracking-tight text-white md:text-[26px]">
              {t('org.welcome')}
            </h2>
            <p className="text-[12.5px] font-medium text-white/75">
              {t('org.activeWorkspace')} <span className="font-bold text-white">{orgName}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/10 px-4 py-2.5 text-end backdrop-blur">
              <p className="text-[12.5px] font-extrabold text-white">
                {formatDate(new Date(), locale, { weekday: 'long', month: 'short', day: 'numeric' })}
              </p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-white/70">{t('org.systemOnline')}</p>
            </div>
            <Link
              href="/cards"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-bold text-[#1d4ed8] shadow-sm transition-transform hover:-translate-y-0.5"
            >
              <Icon name="plus" size={15} /> {t('org.newCard')}
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="error" className="mb-6">
          {error}
        </Alert>
      )}

      {/* Onboarding Checklist */}
      <OnboardingWizard
        steps={onboardingSteps}
        progress={onboardingProgress}
        visible={showOnboarding}
        onToggle={toggleOnboarding}
        t={t}
      />

      {/* 2. Primary metrics — real analytics with sparklines & computed trends */}
      <div className="mb-4 flex items-center gap-2">
        <span className="v-section-label">{t('org.engagementLast30')}</span>
        <span className="v-divider flex-1" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <KpiCard label={t('org.kpi.profileViews')} value={totalViews} icon="search" spark={viewsSeries} color="#2563eb" trend={seriesTrend(viewsSeries)} sub={t('org.vsPrior')} />
        <KpiCard label={t('org.kpi.nfcTaps')} value={totalTaps} icon="tag" spark={scansSeries} color="#4f46e5" trend={seriesTrend(scansSeries)} sub={t('org.vsPrior')} />
        <KpiCard label={t('org.kpi.linkClicks')} value={ov?.totals?.CLICK ?? 0} icon="chart-bar" spark={clicksSeries} color="#0ea5e9" trend={seriesTrend(clicksSeries)} sub={t('org.vsPrior')} />
        <KpiCard label={t('org.kpi.contactSaves')} value={ov?.totals?.SAVE ?? 0} icon="copy" spark={savesSeries} color="#10b981" trend={seriesTrend(savesSeries)} sub={t('org.vsPrior')} />
      </div>

      {/* 3. Workspace composition — real counts, no fabricated deltas */}
      <div className="mb-4 flex items-center gap-2">
        <span className="v-section-label">{t('org.workspace')}</span>
        <span className="v-divider flex-1" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 mb-8">
        <KpiCard label={t('org.kpi.leads')} value={totalLeads} icon="inbox" sub={t('org.kpi.inPipeline')} />
        <KpiCard label={t('org.kpi.conversion')} value={`${convRate}%`} icon="sparkle" sub={t('org.kpi.leadsPerViews')} />
        <KpiCard label={t('org.kpi.members')} value={members.length} icon="users" sub={t('org.kpi.inWorkspace')} />
        <KpiCard label={t('org.kpi.teams')} value={teams.length} icon="grid" sub={t('org.kpi.depts', { count: departments.length })} />
        <KpiCard label={t('org.kpi.cards')} value={cards.length} icon="layers" sub={t('org.kpi.publishedCount', { count: cards.filter((c) => c.isPublished).length })} />
        <KpiCard label={t('org.kpi.meetings')} value={leads.filter((l) => l.intent === 'MEETING').length} icon="calendar" sub={t('org.kpi.booked')} />
      </div>

      {/* 3. Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Left Side: Interative Charts & Approvals */}
        <div className="space-y-6">
          {/* Chart */}
          <section className="v-card p-6">
            <div className="mb-5 flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <span className="v-icon-tile"><Icon name="chart-bar" size={16} /></span>
                <div>
                  <h2 className="text-[15px] font-extrabold text-ink tracking-tight">{t('org.timeline')}</h2>
                  <p className="text-[11.5px] text-muted font-medium">{t('org.timelineSub')}</p>
                </div>
              </div>
              <div className="flex gap-4 text-[11.5px] font-bold text-muted">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#2563eb]" />{t('org.views')}</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#4f46e5]" />{t('org.taps')}</span>
              </div>
            </div>
            {ts.length ? (
              <AreaChart
                labels={graphLabels}
                series={[
                  { name: t('org.views'), color: '#2563eb', points: viewsSeries },
                  { name: t('org.taps'), color: '#4f46e5', points: scansSeries },
                ]}
              />
            ) : (
              <div className="py-20 text-center text-sm font-semibold text-muted">{t('org.noInteractions')}</div>
            )}
          </section>

          {/* Approval Center */}
          <section className="v-card p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="v-icon-tile"><Icon name="check-circle" size={16} /></span>
              <div>
                <h2 className="text-[15px] font-extrabold text-ink tracking-tight">{t('org.approvalCenter')}</h2>
                <p className="text-[11.5px] text-muted font-medium">{t('org.approvalSub')}</p>
              </div>
            </div>

            {pendingApprovals.length === 0 ? (
              <div className="py-12 border border-dashed border-line rounded-xl text-center text-muted font-semibold text-xs flex flex-col items-center gap-2">
                <Icon name="check-circle" size={24} className="text-emerald-500" />
                <span>{t('org.allCaughtUp')}</span>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingApprovals.map((req) => (
                  <div key={req.id} className="p-4 bg-canvas/30 border border-line rounded-xl flex items-center justify-between flex-wrap sm:flex-nowrap gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="warning" className="text-[8px] font-black uppercase">{req.type}</Badge>
                        <h4 className="text-[13px] font-bold text-ink truncate">{req.title}</h4>
                      </div>
                      <p className="text-[11px] text-muted mt-1 truncate">{t('org.requestedBy', { name: req.requester.name, email: req.requester.email })}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => handleResolveApproval(req.id, 'REJECTED')} className="!text-red-500 hover:!bg-red-500/10 font-bold border-red-500/20">
                        {t('org.reject')}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleResolveApproval(req.id, 'APPROVED')} className="!text-emerald-500 hover:!bg-emerald-500/10 font-bold border-emerald-500/20">
                        {t('org.approve')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Side: Leaders & Activity logs */}
        <div className="space-y-6">
          {/* Workspace composition — real team & member data */}
          <section className="v-card p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="v-icon-tile"><Icon name="users" size={16} /></span>
              <div>
                <h2 className="text-[15px] font-extrabold text-ink tracking-tight">{t('org.composition')}</h2>
                <p className="text-[11.5px] text-muted font-medium">{t('org.compositionSub')}</p>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <p className="v-section-label mb-2.5">{t('org.largestTeams')}</p>
                <div className="space-y-1.5">
                  {topTeams.map((item, idx) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs font-semibold hover:bg-ink/[0.03] transition-colors">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-accent-soft text-[10px] font-bold text-accent">{idx + 1}</span>
                        <span className="text-ink font-bold truncate">{item.name}</span>
                      </span>
                      <span className="v-badge v-badge-neutral shrink-0">{t('org.seat', { count: item.seats })}</span>
                    </div>
                  ))}
                  {topTeams.length === 0 && <p className="text-[11px] text-faint px-2">{t('org.noTeams')}</p>}
                </div>
              </div>

              <div className="v-divider" />

              <div>
                <p className="v-section-label mb-2.5">{t('org.members')}</p>
                <div className="space-y-1.5">
                  {recentMembers.map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs font-semibold hover:bg-ink/[0.03] transition-colors">
                      <span className="flex items-center gap-2 min-w-0">
                        <Avatar user={m.user} size={24} />
                        <span className="text-ink font-bold truncate">{m.user?.name || m.user?.email || t('org.pendingInvite')}</span>
                      </span>
                      <span className="v-badge v-badge-accent shrink-0">{m.role.toLowerCase()}</span>
                    </div>
                  ))}
                  {recentMembers.length === 0 && <p className="text-[11px] text-faint px-2">{t('org.noMembers')}</p>}
                </div>
              </div>
            </div>
          </section>

          {/* Org Activity Feed */}
          <section className="v-card p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="v-icon-tile"><Icon name="clock" size={16} /></span>
              <div>
                <h2 className="text-[15px] font-extrabold text-ink tracking-tight">{t('org.activityFeed')}</h2>
                <p className="text-[11.5px] text-muted font-medium">{t('org.activitySub')}</p>
              </div>
            </div>

            {auditLogs.length === 0 ? (
              <p className="text-xs text-muted text-center py-6">{t('org.noEvents')}</p>
            ) : (
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 no-scrollbar">
                {auditLogs.slice(0, 10).map((log: any) => {
                  const actionLower = log.action.toLowerCase();
                  let iconName = 'clock';
                  let iconBg = 'bg-slate-500/10 text-slate-500';
                  
                  if (actionLower.includes('card')) {
                    iconName = 'grid';
                    iconBg = 'bg-emerald-500/10 text-emerald-500';
                  } else if (actionLower.includes('member') || actionLower.includes('role')) {
                    iconName = 'user';
                    iconBg = 'bg-blue-600/10 text-blue-600';
                  } else if (actionLower.includes('dept') || actionLower.includes('department')) {
                    iconName = 'layers';
                    iconBg = 'bg-amber-500/10 text-amber-500';
                  } else if (actionLower.includes('team')) {
                    iconName = 'users';
                    iconBg = 'bg-blue-500/10 text-blue-500';
                  } else if (actionLower.includes('lead')) {
                    iconName = 'inbox';
                    iconBg = 'bg-rose-500/10 text-rose-500';
                  } else if (actionLower.includes('tag') || actionLower.includes('nfc')) {
                    iconName = 'tag';
                    iconBg = 'bg-blue-500/10 text-blue-500';
                  }

                  return (
                    <div key={log.id} className="flex gap-3 text-xs font-semibold text-muted items-start p-2.5 bg-canvas/30 rounded-xl border border-line/50">
                      <span className={`flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
                        <Icon name={iconName} size={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-ink font-bold leading-tight">{log.action}</p>
                        <p className="text-[10px] text-faint mt-0.5 font-mono truncate">
                          {t('org.target')} {log.targetType} · {log.targetId?.slice(0, 8)}
                        </p>
                      </div>
                      <span className="text-[9px] text-faint font-mono shrink-0 whitespace-nowrap pt-0.5">
                        {formatTime(log.createdAt, locale)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

/**
 * Compute an honest period-over-period trend from a real timeseries.
 * Compares the sum of the newer half against the older half. Returns null
 * when there isn't enough real data to make a claim — no fabricated deltas.
 */
function seriesTrend(series: number[]): string | null {
  if (!series || series.length < 4) return null;
  const mid = Math.floor(series.length / 2);
  const older = series.slice(0, mid).reduce((a, b) => a + b, 0);
  const newer = series.slice(mid).reduce((a, b) => a + b, 0);
  if (older === 0 && newer === 0) return null;
  if (older === 0) return '+100%';
  const pct = ((newer - older) / older) * 100;
  if (!isFinite(pct)) return null;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function KpiCard({
  label,
  value,
  icon,
  spark,
  color,
  trend,
  sub,
}: {
  label: string;
  value: number | string;
  icon: string;
  spark?: number[];
  color?: string;
  trend?: string | null;
  sub?: string;
}) {
  const trendDown = trend ? trend.startsWith('-') : false;
  const hasSpark = Array.isArray(spark) && spark.filter((n) => n > 0).length > 1;
  return (
    <div className="v-stat group">
      <div className="flex items-center justify-between">
        <span className="v-stat-label">{label}</span>
        <span className="v-icon-tile !h-8 !w-8">
          <Icon name={icon} size={15} />
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="v-stat-value truncate">{value}</p>
          {(trend || sub) && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold">
              {trend && (
                <span className={`v-badge ${trendDown ? 'v-badge-danger' : 'v-badge-success'} !py-0`}>
                  {trendDown ? '▾' : '▴'} {trend}
                </span>
              )}
              {sub && <span className="text-faint truncate">{sub}</span>}
            </p>
          )}
        </div>
        {hasSpark && (
          <div className="h-[32px] w-[78px] shrink-0 overflow-hidden">
            <Sparkline data={spark!} color={color ?? 'var(--v-accent)'} />
          </div>
        )}
      </div>
    </div>
  );
}

function OnboardingWizard({
  steps,
  progress,
  visible,
  onToggle,
  t,
}: {
  steps: { id: string; label: string; desc: string; completed: boolean; link: string; linkText: string }[];
  progress: number;
  visible: boolean;
  onToggle: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  if (!visible) {
    return (
      <div className="flex justify-end mb-6">
        <button
          onClick={onToggle}
          className="text-xs font-bold text-accent hover:underline flex items-center gap-1.5 bg-accent/5 border border-accent/15 px-3 py-1.5 rounded-xl transition-all"
        >
          <span>🎯 {t('onboarding.showChecklist', { progress })}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-line p-6 rounded-2xl shadow-sm relative overflow-hidden mb-6 transition-all group">
      {/* Background radial accent */}
      <span className="absolute top-0 right-0 h-40 w-40 rounded-full bg-accent/5 blur-2xl pointer-events-none" />

      <div className="flex justify-between items-center mb-4 flex-wrap gap-2 relative z-10">
        <div className="space-y-1">
          <h3 className="text-[14px] font-black text-ink flex items-center gap-2">
            <span>🎯</span> {t('onboarding.title')}
            <span className="text-[11px] text-muted font-black ms-2 bg-canvas px-2 py-0.5 rounded-md border border-line">{t('onboarding.complete', { progress })}</span>
          </h3>
          <p className="text-[11.5px] text-muted font-semibold">{t('onboarding.subtitle')}</p>
        </div>
        <button
          onClick={onToggle}
          className="text-[11px] font-extrabold text-muted hover:text-ink transition-colors px-2.5 py-1 border border-line rounded-lg bg-canvas/40 hover:bg-canvas"
        >
          {t('onboarding.hide')}
        </button>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-canvas rounded-full h-2 mb-6 overflow-hidden border border-line/50 relative z-10">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%`, background: 'var(--v-gradient-brand)' }}
        />
      </div>

      {/* Steps Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
        {steps.map((step, idx) => (
          <div
            key={step.id}
            className={`p-4 border rounded-xl flex flex-col justify-between transition-all ${
              step.completed
                ? 'border-emerald-500/25 bg-emerald-500/[0.02]'
                : 'border-line bg-canvas/30 hover:border-line-strong'
            }`}
          >
            <div className="space-y-2">
              <div className="flex justify-between items-start">
                <span className="text-[9.5px] font-extrabold uppercase tracking-wider text-muted">
                  {t('onboarding.step', { number: idx + 1 })}
                </span>
                {step.completed ? (
                  <span className="h-5 w-5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center justify-center text-[10px] font-black">
                    ✓
                  </span>
                ) : (
                  <span className="h-5 w-5 rounded-full bg-canvas text-faint border border-line flex items-center justify-center text-[9px] font-bold">
                    {idx + 1}
                  </span>
                )}
              </div>
              <h4 className={`text-[12.5px] font-bold leading-snug ${step.completed ? 'text-emerald-700 line-through opacity-70' : 'text-ink'}`}>
                {step.label}
              </h4>
              <p className="text-[11px] text-muted font-medium leading-relaxed">
                {step.desc}
              </p>
            </div>
            {!step.completed && (
              <Link
                href={step.link}
                className="v-btn !h-8 px-3 text-[11px] font-bold mt-4 bg-accent text-white hover:shadow-sm rounded-lg text-center flex items-center justify-center"
              >
                {step.linkText}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
