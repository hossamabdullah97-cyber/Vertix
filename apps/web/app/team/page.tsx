'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import {
  authFetch,
  createBlankCard,
  getToken,
  getActiveOrgId,
  type Member,
  type Team,
  type Me,
  type Role,
  type Card,
} from '@/lib/client';
import AppShell from '@/components/AppShell';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatDate } from '@/lib/format';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/Avatar';
import { ProfilePhotoCard } from '@/components/ProfilePhotoCard';
import { isPaidPlan, type Plan } from '@vertex/shared';

// Import organization subviews
import dynamic from 'next/dynamic';
import type { Asset } from '@/components/organization/AssetTemplates';
import type { UsageSummary } from '@/components/organization/BillingManagement';
import type { AuditEntry } from '@/components/organization/SecurityAuditLogs';

// Each admin tab renders one at a time — lazy-load them so opening /team never
// ships all 9 modules up front (route-based / component-level code splitting).
const TabFallback = () => <div className="v-skeleton h-64 w-full rounded-2xl" />;
const OrgDashboard = dynamic(() => import('@/components/organization/OrgDashboard').then((m) => m.OrgDashboard), { loading: TabFallback });
const MemberDirectory = dynamic(() => import('@/components/organization/MemberDirectory').then((m) => m.MemberDirectory), { loading: TabFallback });
const DepartmentsTeams = dynamic(() => import('@/components/organization/DepartmentsTeams').then((m) => m.DepartmentsTeams), { loading: TabFallback });
const PermissionMatrix = dynamic(() => import('@/components/organization/PermissionMatrix').then((m) => m.PermissionMatrix), { loading: TabFallback });
const BrandCenter = dynamic(() => import('@/components/organization/BrandCenter').then((m) => m.BrandCenter), { loading: TabFallback });
const AssetTemplates = dynamic(() => import('@/components/organization/AssetTemplates').then((m) => m.AssetTemplates), { loading: TabFallback });
const BillingManagement = dynamic(() => import('@/components/organization/BillingManagement').then((m) => m.BillingManagement), { loading: TabFallback });
const SecurityAuditLogs = dynamic(() => import('@/components/organization/SecurityAuditLogs').then((m) => m.SecurityAuditLogs), { loading: TabFallback });
const WorkspaceSettings = dynamic(() => import('@/components/organization/WorkspaceSettings').then((m) => m.WorkspaceSettings), { loading: TabFallback });

interface PlanDef { label: string; price: number; cards: number | null; members: number | null; nfcTags: number | null }

type AdminTab =
  | 'dashboard'
  | 'members'
  | 'teams'
  | 'permissions'
  | 'branding'
  | 'assets'
  | 'billing'
  | 'security'
  | 'settings';

const TABS = [
  { id: 'dashboard', label: 'Admin Dashboard', icon: 'gauge' },
  { id: 'members', label: 'Member Directory', icon: 'users' },
  { id: 'teams', label: 'Departments & Teams', icon: 'grid' },
  { id: 'permissions', label: 'Role Permissions', icon: 'check-circle' },
  { id: 'branding', label: 'Brand Center', icon: 'sparkle' },
  { id: 'assets', label: 'Assets & Templates', icon: 'file-text' },
  { id: 'billing', label: 'Billing & Plans', icon: 'chart-bar' },
  { id: 'security', label: 'Security & Audit Logs', icon: 'x' },
  { id: 'settings', label: 'API Keys & Settings', icon: 'refresh' },
] as const;

export default function TeamPortal() {
  const router = useRouter();
  const { t } = useTranslation('teams');
  const { locale } = useLocale();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  const [me, setMe] = useState<Me | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [org, setOrg] = useState<{ id: string; name: string; slug: string; plan: string; branding: Record<string, unknown> | null; settings: Record<string, unknown> | null } | null>(null);
  const [leadsCount, setLeadsCount] = useState(0);
  const [nfcCount, setNfcCount] = useState(0);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [billing, setBilling] = useState<UsageSummary | null>(null);
  const [plans, setPlans] = useState<Record<string, PlanDef> | null>(null);
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Personal Workspace States
  const [personalCards, setPersonalCards] = useState<Card[]>([]);
  const [personalLeads, setPersonalLeads] = useState<any[]>([]);
  const [personalNfc, setPersonalNfc] = useState<any[]>([]);
  const [creatingCard, setCreatingCard] = useState(false);

  /** Same single onboarding path the Cards page uses. */
  const startNewCard = async () => {
    if (creatingCard) return;
    setCreatingCard(true);
    try {
      const card = await createBlankCard();
      router.push(`/cards/${card.id}`);
    } catch {
      setCreatingCard(false);
    }
  };

  // Subview Details Routing States (Dynamic pages)
  const [subView, setSubView] = useState<{ type: 'department' | 'team'; id: string } | null>(null);
  const [teamTab, setTeamTab] = useState<'members' | 'cards' | 'leads' | 'tasks'>('members');

  const load = useCallback(async () => {
    const orgId = getActiveOrgId();
    setActiveOrgId(orgId);

    if (!orgId) {
      // Load personal context only
      const [m, crd, lds, nfc] = await Promise.all([
        authFetch<Me>('/auth/me'),
        authFetch<Card[]>('/cards').catch(() => []),
        authFetch<any[]>('/leads').catch(() => []),
        authFetch<any[]>('/nfc/tags').catch(() => []),
      ]);
      setMe(m);
      setPersonalCards(crd);
      setPersonalLeads(lds);
      setPersonalNfc(nfc);
      setLoading(false);
      return;
    }

    const [m, mem, tm, crd, cur, lds, nfc] = await Promise.all([
      authFetch<Me>('/auth/me'),
      authFetch<Member[]>('/orgs/members'),
      authFetch<Team[]>('/orgs/teams'),
      authFetch<Card[]>('/cards'),
      authFetch<{ id: string; name: string; slug: string; plan: string; branding: Record<string, unknown> | null; settings: Record<string, unknown> | null }>('/orgs/current'),
      authFetch<unknown[]>('/leads').catch(() => []),
      authFetch<unknown[]>('/nfc/tags').catch(() => []),
    ]);
    setMe(m);
    setMembers(mem);
    setTeams(tm);
    setCards(crd);
    setOrg(cur);
    setLeadsCount(Array.isArray(lds) ? lds.length : 0);
    setNfcCount(Array.isArray(nfc) ? nfc.length : 0);
    setLoading(false);

    // Audit logs
    authFetch<AuditEntry[]>('/orgs/audit-logs')
      .then(setAuditLogs)
      .catch(() => setAuditLogs([]));

    // Shared asset library
    authFetch<Asset[]>('/orgs/assets').then(setAssets).catch(() => setAssets([]));

    // Billing subscription + usage
    authFetch<UsageSummary>('/billing/subscription').then(setBilling).catch(() => setBilling(null));
    authFetch<{ plans: Record<string, PlanDef>; billingEnabled: boolean }>('/billing/plans')
      .then((r) => { setPlans(r.plans); setBillingEnabled(r.billingEnabled); })
      .catch(() => setPlans(null));
  }, []);

  const handleCreateAsset = async (input: { name: string; url: string; mimeType?: string; size?: number }) => {
    try {
      const created = await authFetch<Asset>('/orgs/assets', { method: 'POST', body: JSON.stringify(input) });
      setAssets((a) => [created, ...a]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleDeleteAsset = (id: string) => {
    const prev = assets;
    setAssets((a) => a.filter((x) => x.id !== id));
    authFetch(`/orgs/assets/${id}`, { method: 'DELETE' }).catch((e) => { setAssets(prev); setError((e as Error).message); });
  };

  const handleUpgrade = async (plan: 'PRO' | 'BUSINESS') => {
    try {
      const res = await authFetch<{ url: string }>('/billing/checkout', { method: 'POST', body: JSON.stringify({ plan }) });
      if (res?.url) window.location.href = res.url;
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load().catch((e) => {
      setError(e.message);
      setLoading(false);
    });
  }, [router, load]);

  const runAction = async (fn: () => Promise<unknown>, successMsg?: string) => {
    setError('');
    setNotice('');
    try {
      await fn();
      if (successMsg) setNotice(successMsg);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Administrative mutations
  const handleInvite = (email: string, name: string, role: Role, teamId: string) => {
    runAction(
      async () =>
        authFetch('/orgs/members/invite', {
          method: 'POST',
          body: JSON.stringify({ email, name: name || undefined, role, teamId: teamId || undefined }),
        }),
      t('toasts.inviteSent', { email })
    );
  };

  const handleUpdateRole = (id: string, role: Role) => {
    runAction(
      async () =>
        authFetch(`/orgs/members/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ role }),
        }),
      t('toasts.roleUpdated')
    );
  };

  const handleUpdateTeam = (id: string, teamId: string | null) => {
    runAction(
      async () =>
        authFetch(`/orgs/members/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ teamId }),
        }),
      t('toasts.teamAssignmentUpdated')
    );
  };

  const [brandSaving, setBrandSaving] = useState(false);
  const handleSaveBranding = async (input: { name: string; branding: Record<string, unknown> }) => {
    setBrandSaving(true);
    await runAction(
      async () => authFetch('/orgs/current', { method: 'PATCH', body: JSON.stringify(input) }),
      t('toasts.brandSaved')
    );
    setBrandSaving(false);
  };

  const handleSaveSettings = async (input: { name: string; settings: Record<string, unknown> }) => {
    setBrandSaving(true);
    await runAction(
      async () => authFetch('/orgs/current', { method: 'PATCH', body: JSON.stringify(input) }),
      t('toasts.settingsSaved')
    );
    setBrandSaving(false);
  };

  const handleUpdateStatus = (id: string, status: 'ACTIVE' | 'SUSPENDED') => {
    runAction(
      async () =>
        authFetch(`/orgs/members/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        }),
      status === 'SUSPENDED' ? t('toasts.memberSuspended') : t('toasts.memberReactivated')
    );
  };

  const handleRemoveMember = (id: string) => {
    runAction(
      async () =>
        authFetch(`/orgs/members/${id}`, {
          method: 'DELETE',
        }),
      t('toasts.memberRemoved')
    );
  };

  const handleCreateTeam = (name: string) => {
    runAction(
      async () =>
        authFetch('/orgs/teams', {
          method: 'POST',
          body: JSON.stringify({ name }),
        }),
      t('toasts.teamCreated', { name })
    );
  };

  const handleDeleteTeam = (id: string) => {
    runAction(
      async () =>
        authFetch(`/orgs/teams/${id}`, {
          method: 'DELETE',
        }),
      t('toasts.teamDeleted')
    );
    setSubView(null);
  };

  const handleUpdateTeamManager = (id: string, managerId: string | null) => {
    runAction(
      async () =>
        authFetch(`/orgs/teams/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ managerId }),
        }),
      t('toasts.teamManagerUpdated')
    );
  };

  // Render personal workspace overview dashboard
  if (!loading && !activeOrgId) {
    return (
      <AppShell title={t('personal.title')}>
        <div className="space-y-6">
          {/* Header summary card */}
          <div className="bg-surface border border-line p-6 rounded-2xl shadow-sm flex items-center gap-4 flex-wrap sm:flex-nowrap">
            {me && <Avatar user={me} size={56} className="shadow-sm" />}
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-black text-ink">{me?.name || t('personal.dashboard')}</h2>
              <p className="text-xs text-muted mt-0.5 font-medium leading-relaxed">
                {t('personal.welcome')}
              </p>
            </div>
            <button
              onClick={startNewCard}
              disabled={creatingCard}
              className="v-btn flex items-center gap-2 px-4.5 !h-9 text-xs font-bold rounded-xl bg-accent text-white shrink-0 hover:shadow-md transition-all"
            >
              <Icon name="plus" size={14} /> {t('personal.createCard')}
            </button>
          </div>

          {me && <ProfilePhotoCard me={me} onChange={setMe} />}

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="bg-surface border border-line p-5 rounded-2xl shadow-sm relative group hover:shadow-md transition-all">
              <div className="flex justify-between items-start text-muted">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-faint">{t('personal.myCards')}</p>
                  <h3 className="text-2xl font-black text-ink mt-1.5">{personalCards.length}</h3>
                </div>
                <span className="p-2.5 rounded-lg bg-canvas text-muted group-hover:text-accent transition-colors"><Icon name="grid" size={16} /></span>
              </div>
              <div className="absolute bottom-0 inset-x-0 h-1 bg-accent/20 group-hover:bg-accent transition-colors" />
            </div>

            <div className="bg-surface border border-line p-5 rounded-2xl shadow-sm relative group hover:shadow-md transition-all">
              <div className="flex justify-between items-start text-muted">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-faint">{t('personal.leadsCaptured')}</p>
                  <h3 className="text-2xl font-black text-ink mt-1.5">{personalLeads.length}</h3>
                </div>
                <span className="p-2.5 rounded-lg bg-canvas text-muted group-hover:text-emerald-500 transition-colors"><Icon name="inbox" size={16} /></span>
              </div>
              <div className="absolute bottom-0 inset-x-0 h-1 bg-emerald-500/20 group-hover:bg-emerald-500 transition-colors" />
            </div>

            <div className="bg-surface border border-line p-5 rounded-2xl shadow-sm relative group hover:shadow-md transition-all">
              <div className="flex justify-between items-start text-muted">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-faint">{t('personal.nfcTags')}</p>
                  <h3 className="text-2xl font-black text-ink mt-1.5">{personalNfc.length}</h3>
                </div>
                <span className="p-2.5 rounded-lg bg-canvas text-muted group-hover:text-amber-500 transition-colors"><Icon name="tag" size={16} /></span>
              </div>
              <div className="absolute bottom-0 inset-x-0 h-1 bg-amber-500/20 group-hover:bg-amber-500 transition-colors" />
            </div>
          </div>

          {/* User Details & Quick Actions */}
          <div className="grid md:grid-cols-5 gap-6">
            {/* User Account Info card */}
            <div className="md:col-span-2 bg-surface border border-line p-5 rounded-2xl shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-[13.5px] font-black text-ink tracking-tight mb-3">{t('personal.profileAccount')}</h3>
                <div className="space-y-3.5 text-xs font-semibold text-muted">
                  <div className="flex items-center justify-between py-1.5 border-b border-line/60">
                    <span>{t('personal.emailAddress')}</span>
                    <span className="text-ink font-bold font-mono" dir="ltr">{me?.email}</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-line/60">
                    <span>{t('personal.accountTier')}</span>
                    <span className="text-ink font-bold uppercase tracking-wider">{t('personal.freeSandbox')}</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <span>{t('personal.activeMemberId')}</span>
                    <span className="text-faint font-mono" dir="ltr">{me?.sub.slice(0, 10)}...</span>
                  </div>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-line">
                <Link href="/cards" className="w-full py-2.5 rounded-xl border border-line bg-canvas hover:bg-elevated transition-colors text-xs font-bold text-ink flex items-center justify-center gap-1.5">
                  <Icon name="settings" size={13} /> {t('personal.manageMyCards')}
                </Link>
              </div>
            </div>

            {/* Quick Actions / Recent Leads */}
            <div className="md:col-span-3 bg-surface border border-line p-5 rounded-2xl shadow-sm">
              <h3 className="text-[13.5px] font-black text-ink tracking-tight mb-3">{t('personal.recentActivity')}</h3>
              {personalLeads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-faint">
                  <Icon name="clock" size={24} />
                  <p className="text-xs font-bold text-muted mt-2">{t('personal.noRecentEvents')}</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {personalLeads.slice(0, 4).map((l: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center p-2.5 bg-canvas/30 border border-line rounded-xl text-xs">
                      <div>
                        <p className="font-bold text-ink">{l.name || t('personal.anonymousLead')}</p>
                        <p className="text-[10px] text-muted font-medium mt-0.5">{t('personal.capturedVia', { slug: l.card?.slug })}</p>
                      </div>
                      <span className="text-[10px] font-bold text-faint">{formatDate(l.createdAt, locale, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // --- Dynamic Subviews / Sub-pages (linear workspace details) ---

  // A. RENDER DEPARTMENT DETAILS
  if (subView?.type === 'department') {
    const deptId = subView.id;
    // Map team lists belonging to department
    const deptTeams = teams.filter((t) => t.name.toLowerCase().includes(deptId.toLowerCase()));
    const deptTeamIds = deptTeams.map((t) => t.id);
    const deptMembers = members.filter((m) => m.teamId && deptTeamIds.includes(m.teamId));

    return (
      <AppShell title={t('subview.deptHub', { dept: deptId })}>
        <div className="space-y-6">
          {/* Top Back Nav Bar */}
          <div className="flex items-center justify-between pb-4 border-b border-line">
            <button
              onClick={() => setSubView(null)}
              className="px-3.5 py-1.5 border border-line rounded-xl bg-surface hover:bg-canvas text-xs font-bold text-ink flex items-center gap-1.5 transition-colors"
            >
              <Icon name="arrow" size={13} className="rtl:rotate-0 rotate-180" /> {t('subview.backToDashboard')}
            </button>
            <span className="text-xs font-bold text-muted bg-canvas border border-line px-3 py-1 rounded-full uppercase tracking-wider">
              {t('subview.section', { dept: deptId })}
            </span>
          </div>

          {/* Department Meta */}
          <div className="bg-surface border border-line p-5 rounded-2xl shadow-sm relative overflow-hidden">
            <div className="absolute top-0 start-0 w-1.5 h-full bg-accent" />
            <h2 className="text-[18px] font-black text-ink">{t('subview.division', { dept: deptId })}</h2>
            <p className="text-xs text-muted font-medium mt-1 leading-relaxed max-w-2xl">
              {t('subview.divisionSummary', { teams: t('subview.team', { count: deptTeams.length }), members: t('subview.member', { count: deptMembers.length }) })}
            </p>
            <div className="mt-4 flex gap-4 text-xs font-bold text-muted">
              <span>{t('subview.teamsCount')} <strong className="text-ink">{deptTeams.length}</strong></span>
              <span>•</span>
              <span>{t('subview.activeMembersLabel')} <strong className="text-ink">{deptMembers.length}</strong></span>
            </div>
          </div>

          <div className="grid md:grid-cols-5 gap-6">
            {/* Child Teams Column */}
            <div className="md:col-span-3 space-y-4">
              <h3 className="text-[14px] font-black text-ink tracking-tight">{t('subview.teamsIn', { dept: deptId })}</h3>
              {deptTeams.length === 0 ? (
                <div className="p-10 text-center bg-surface border border-line border-dashed rounded-2xl text-faint">
                  <Icon name="grid" size={24} />
                  <p className="text-xs font-bold text-muted mt-2">{t('subview.noDivisionTeams')}</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {deptTeams.map((tm) => (
                    <div
                      key={tm.id}
                      onClick={() => setSubView({ type: 'team', id: tm.id })}
                      className="bg-surface border border-line hover:border-accent hover:shadow-sm p-4.5 rounded-2xl flex items-center justify-between gap-4 cursor-pointer transition-all"
                    >
                      <div className="min-w-0">
                        <p className="font-extrabold text-[14px] text-ink">{tm.name}</p>
                        <p className="text-[11px] text-muted font-medium mt-0.5">
                          {t('subview.manager', { name: tm.manager?.name || tm.manager?.email || t('subview.managerNone') })}
                        </p>
                      </div>
                      <span className="px-2.5 py-1 bg-canvas border border-line rounded-lg text-[10.5px] font-bold text-muted">
                        {t('subview.seat', { count: tm._count?.memberships ?? 0 })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Department Members List */}
            <div className="md:col-span-2 bg-surface border border-line p-5 rounded-2xl shadow-sm h-fit">
              <h3 className="text-[13.5px] font-black text-ink tracking-tight mb-3">{t('subview.membersCount', { count: deptMembers.length })}</h3>
              {deptMembers.length === 0 ? (
                <p className="text-xs font-bold text-muted text-center py-6">{t('subview.noDeptMembers')}</p>
              ) : (
                <div className="divide-y divide-line/60">
                  {deptMembers.map((m) => (
                    <div key={m.id} className="py-2.5 flex items-center justify-between text-xs font-semibold text-ink">
                      <span>{m.user.name || m.user.email}</span>
                      <span className="text-[10px] uppercase font-bold text-muted bg-canvas border border-line px-1.5 py-0.5 rounded">
                        {m.role.toLowerCase()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // B. RENDER TEAM DETAILS
  if (subView?.type === 'team') {
    const teamId = subView.id;
    const team = teams.find((t) => t.id === teamId);
    
    // Team Members
    const teamMembers = members.filter((m) => m.teamId === teamId);
    const teamMemberUserIds = teamMembers.map((m) => m.user.id);
    // Team Cards (cards belonging to members of the team)
    const teamCards = cards.filter((c) => teamMemberUserIds.includes(c.ownerId));

    if (!team) {
      return (
        <AppShell title={t('subview.teamDetails')}>
          <div className="p-8 text-center text-rose-500 font-bold bg-rose-500/10 border border-rose-500/20 rounded-2xl">
            {t('subview.teamNotFound')}
          </div>
        </AppShell>
      );
    }

    // Determine team health score
    let healthLabel = t('subview.healthExcellent');
    let healthColor = 'text-emerald-500 border-emerald-500/15 bg-emerald-500/5';
    const suspendedCount = teamMembers.filter((m) => m.status === 'SUSPENDED').length;
    if (suspendedCount > 0) {
      healthLabel = t('subview.healthGood');
      healthColor = 'text-amber-500 border-amber-500/15 bg-amber-500/5';
    }
    if (teamMembers.length === 0) {
      healthLabel = t('subview.healthNeeds');
      healthColor = 'text-orange-500 border-orange-500/15 bg-orange-500/5';
    }

    return (
      <AppShell title={t('subview.teamHub', { name: team.name })}>
        <div className="space-y-6">
          {/* Top Back Nav Bar */}
          <div className="flex items-center justify-between pb-4 border-b border-line">
            <button
              onClick={() => setSubView(null)}
              className="px-3.5 py-1.5 border border-line rounded-xl bg-surface hover:bg-canvas text-xs font-bold text-ink flex items-center gap-1.5 transition-colors"
            >
              <Icon name="arrow" size={13} className="rtl:rotate-0 rotate-180" /> {t('subview.backToDashboard')}
            </button>
            <div className="flex gap-2">
              {me && (me.role === 'OWNER' || me.role === 'ADMIN') && (
                <button
                  onClick={() => handleDeleteTeam(team.id)}
                  className="px-3 py-1.5 border border-red-500/10 hover:border-red-500 hover:bg-red-500/5 text-rose-500 rounded-xl text-xs font-bold transition-all"
                >
                  {t('subview.deleteTeam')}
                </button>
              )}
            </div>
          </div>

          {/* Team Dashboard Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2 bg-surface border border-line p-5 rounded-2xl shadow-sm relative">
              <h2 className="text-[17px] font-black text-ink">{team.name}</h2>
              <p className="text-[11.5px] text-muted font-semibold mt-1">
                {t('subview.activeGroup', { org: org?.name ?? t('sections.workspace') })}
              </p>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 items-center text-xs font-bold text-muted">
                <span>{t('subview.managerLabel')} <strong className="text-ink">{team.manager?.name || team.manager?.email || t('subview.managerUnassigned')}</strong></span>
                <span>•</span>
                <span>{t('subview.activeSeats')} <strong className="text-ink">{teamMembers.length}</strong></span>
              </div>
            </div>

            <div className={`p-5 border rounded-2xl shadow-sm flex flex-col justify-between ${healthColor}`}>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-faint">{t('subview.teamStatus')}</p>
                <h3 className="text-[16px] font-black text-ink mt-2">{healthLabel}</h3>
              </div>
              <p className="text-[10.5px] text-muted mt-1 leading-normal font-semibold">
                {t('subview.seat', { count: teamMembers.length })}{suspendedCount > 0 ? t('subview.suspendedSuffix', { count: suspendedCount }) : ''}.
              </p>
            </div>

            <div className="bg-surface border border-line p-5 rounded-2xl shadow-sm flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-faint">{t('subview.generatedCards')}</p>
                <h3 className="text-2xl font-black text-ink mt-1">{teamCards.length}</h3>
              </div>
              <p className="text-[10.5px] text-muted font-semibold">{t('subview.generatedCardsSub')}</p>
            </div>
          </div>

          {/* Team Tabs Switcher */}
          <div className="flex border-b border-line gap-2 pb-1.5">
            {([
              { id: 'members', labelKey: 'subview.tabs.members', icon: 'users' },
              { id: 'cards', labelKey: 'subview.tabs.cards', icon: 'grid' },
              { id: 'leads', labelKey: 'subview.crmLeadsTab', icon: 'inbox' },
              { id: 'tasks', labelKey: 'subview.teamTasks', icon: 'check-circle' }
            ] as const).map((tb) => (
              <button
                key={tb.id}
                onClick={() => setTeamTab(tb.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  teamTab === tb.id ? 'bg-accent/15 text-accent' : 'text-muted hover:text-ink'
                }`}
              >
                <Icon name={tb.icon === 'check-circle' ? 'check' : tb.icon} size={13} /> {t(tb.labelKey)}
              </button>
            ))}
          </div>

          {/* Sub Tab Panels */}
          <div className="bg-surface border border-line p-5 rounded-2xl shadow-sm min-h-[220px]">
            {teamTab === 'members' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-[13.5px] font-bold text-ink">{t('subview.activeMembers')}</h4>
                </div>
                {teamMembers.length === 0 ? (
                  <p className="text-xs font-semibold text-muted text-center py-8">{t('subview.noTeamMembers')}</p>
                ) : (
                  <div className="divide-y divide-line/60">
                    {teamMembers.map((m) => (
                      <div key={m.id} className="py-3 flex items-center justify-between text-xs font-semibold text-ink">
                        <div className="flex items-center gap-2.5">
                          <Avatar user={m.user} size={28} />
                          <div>
                            <p className="font-bold text-ink">{m.user.name || t('subview.pendingInvite')}</p>
                            <p className="text-[10px] text-muted font-medium">{m.user.email}</p>
                          </div>
                        </div>
                        <span className="text-[10.5px] font-bold text-muted uppercase bg-canvas border border-line px-2 py-0.5 rounded-lg">
                          {m.role}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {teamTab === 'cards' && (
              <div className="space-y-4">
                <h4 className="text-[13.5px] font-bold text-ink">{t('subview.cardsList')}</h4>
                {teamCards.length === 0 ? (
                  <p className="text-xs font-semibold text-muted text-center py-8">{t('subview.noTeamCards')}</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {teamCards.map((c) => (
                      <Link
                        key={c.id}
                        href={`/cards/${c.id}`}
                        className="p-3 border border-line hover:border-accent rounded-xl hover:shadow-sm transition-all flex items-center justify-between text-xs"
                      >
                        <div>
                          <p className="font-bold text-ink">{(c.vcardData?.fullName as string) || c.slug}</p>
                          <p className="text-[10px] text-faint font-mono mt-0.5">/c/{c.slug}</p>
                        </div>
                        <span className="v-chip !px-2 !py-0.5 !text-[10px]">{c.isPublished ? t('subview.live') : t('subview.draft')}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {teamTab === 'leads' && (
              <div className="space-y-4">
                <h4 className="text-[13.5px] font-bold text-ink">{t('subview.recentLeads')}</h4>
                <p className="text-xs text-muted">{t('subview.recentLeadsSub')}</p>
                <div className="p-8 text-center text-xs font-bold text-muted border border-line border-dashed rounded-xl">
                  {t('subview.noCrmLeads')}
                </div>
              </div>
            )}

            {teamTab === 'tasks' && (
              <div className="space-y-4">
                <h4 className="text-[13.5px] font-bold text-ink">{t('subview.teamTasks')}</h4>
                <div className="flex items-start gap-3 rounded-xl border border-line bg-elevated/50 p-4 text-xs font-medium text-muted">
                  <Icon name="check" size={15} className="mt-0.5 shrink-0 text-accent" />
                  <span>
                    {t('subview.tasksRoadmap')}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </AppShell>
    );
  }

  // --- RENDER MAIN TEAM PAGE PORTAL (Under Org Context) ---

  return (
    <AppShell title={t('title', 'Team Directory & Organization')}>
      {notice && (
        <div className="mb-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-sm font-semibold flex items-center gap-2">
          <span>✓</span> {notice}
        </div>
      )}
      {error && (
        <div className="mb-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-semibold flex items-center gap-2">
          <span>⚠️</span> {error}
        </div>
      )}

      {/* Navigation tabs */}
      <div className="no-scrollbar mb-6 flex gap-1.5 overflow-x-auto border-b border-line pb-3">
        {TABS.map((tabItem) => {
          const active = activeTab === tabItem.id;
          return (
            <button
              key={tabItem.id}
              onClick={() => setActiveTab(tabItem.id)}
              className={`flex items-center gap-2 rounded-[10px] px-3.5 py-3.5 sm:py-2 text-[12.5px] font-bold transition-all shrink-0 ${
                active ? 'text-white' : 'text-muted hover:text-ink hover:bg-ink/5'
              }`}
              style={active ? { background: 'var(--v-gradient-brand)', boxShadow: 'var(--v-shadow-accent)' } : undefined}
            >
              <Icon name={tabItem.icon === 'check-circle' ? 'check' : tabItem.icon === 'x' ? 'lock' : tabItem.icon} size={13} /> {t(`tabs.${tabItem.id}`, tabItem.label)}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="v-skeleton h-24 rounded-2xl" />
            ))}
          </div>
          <div className="v-skeleton h-60 rounded-2xl w-full" />
        </div>
      ) : (
        <div className="min-h-[400px]">
          {activeTab === 'dashboard' && (
            <OrgDashboard
              members={members}
              teams={teams}
              cardsCount={cards.length}
              leadsCount={leadsCount}
              nfcCount={nfcCount}
              org={org}
              auditLogs={auditLogs}
            />
          )}

          {activeTab === 'members' && (
            <div className="space-y-6">
            {me && (
              <ProfilePhotoCard
                me={me}
                onChange={(next) => {
                  setMe(next);
                  // The directory lists this user too — keep their row in sync.
                  setMembers((list) =>
                    list.map((m) =>
                      m.user.id === next.id
                        ? { ...m, user: { ...m.user, name: next.name ?? null, avatarUrl: next.avatarUrl } }
                        : m,
                    ),
                  );
                }}
              />
            )}
            <MemberDirectory
              members={members}
              teams={teams}
              me={me}
              verified={isPaidPlan(org?.plan as Plan | undefined)}
              onInvite={handleInvite}
              onUpdateRole={handleUpdateRole}
              onUpdateTeam={handleUpdateTeam}
              onUpdateStatus={handleUpdateStatus}
              onRemove={handleRemoveMember}
            />
            </div>
          )}

          {activeTab === 'teams' && (
            <DepartmentsTeams
              teams={teams}
              members={members}
              me={me}
              onCreateTeam={handleCreateTeam}
              onDeleteTeam={handleDeleteTeam}
              onUpdateTeamManager={handleUpdateTeamManager}
              onOpenTeam={(id) => setSubView({ type: 'team', id })}
              onOpenDepartment={(id) => setSubView({ type: 'department', id })}
            />
          )}

          {activeTab === 'permissions' && (
            <PermissionMatrix me={me} />
          )}

          {activeTab === 'branding' && (
            <BrandCenter org={org} saving={brandSaving} onSave={handleSaveBranding} />
          )}

          {activeTab === 'assets' && (
            <AssetTemplates
              assets={assets}
              canManage={me?.role === 'OWNER' || me?.role === 'ADMIN' || me?.role === 'MANAGER'}
              onCreate={handleCreateAsset}
              onDelete={handleDeleteAsset}
            />
          )}

          {activeTab === 'billing' && (
            <BillingManagement
              usage={billing}
              plans={plans}
              billingEnabled={billingEnabled}
              canManage={me?.role === 'OWNER' || me?.role === 'ADMIN'}
              onUpgrade={handleUpgrade}
            />
          )}

          {activeTab === 'security' && (
            <SecurityAuditLogs logs={auditLogs} />
          )}

          {activeTab === 'settings' && (
            <WorkspaceSettings org={org} saving={brandSaving} onSave={handleSaveSettings} />
          )}
        </div>
      )}
    </AppShell>
  );
}
