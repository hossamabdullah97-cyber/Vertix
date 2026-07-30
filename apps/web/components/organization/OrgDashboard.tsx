'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { relativeTime } from '@/lib/crm';
import { auditActionMeta, type AuditEntry } from './SecurityAuditLogs';
import type { Member, Team } from '@/lib/client';
import { authFetch } from '@/lib/client';
import { Button } from '@/design-system';

interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

interface ApprovalRequest {
  id: string;
  title: string;
  type: string;
  status: string;
  comment: string | null;
  requester: { name: string; email: string };
  createdAt: string;
}

interface OrgDashboardProps {
  members: Member[];
  teams: Team[];
  cardsCount: number;
  leadsCount: number;
  nfcCount: number;
  org: OrgInfo | null;
  auditLogs: AuditEntry[];
}

const PLAN_KEY: Record<string, string> = { FREE: 'plans.free', PRO: 'plans.pro', BUSINESS: 'plans.business', ENTERPRISE: 'plans.enterprise' };

export function OrgDashboard({ members, teams, cardsCount, leadsCount, nfcCount, org, auditLogs }: OrgDashboardProps) {
  const { t } = useTranslation('teams');
  const activeMembers = useMemo(() => members.filter((m) => m.status === 'ACTIVE').length, [members]);

  // Real pending approvals from the API — no seeded demo request.
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  useEffect(() => {
    authFetch<ApprovalRequest[]>('/orgs/approvals')
      .then((list) => setApprovals(list.filter((a) => a.status === 'PENDING')))
      .catch(() => setApprovals([]));
  }, []);

  const handleResolve = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await authFetch(`/orgs/approvals/${id}/resolve`, {
        method: 'PATCH',
        body: JSON.stringify({ status, comment: `${status} via Admin panel` }),
      });
      setApprovals((prev) => prev.filter((a) => a.id !== id));
    } catch {}
  };

  // Every stat below is a real count.
  const stats = [
    { label: t('stats.activeSeats', 'Active Seats'), value: `${activeMembers} / ${members.length}`, icon: 'users', color: '#2563eb' },
    { label: t('stats.teams', 'Teams'), value: teams.length, icon: 'grid', color: '#10b981' },
    { label: t('stats.cards', 'Cards Created'), value: cardsCount, icon: 'columns', color: '#0ea5e9' },
    { label: t('stats.leads', 'Leads'), value: leadsCount, icon: 'inbox', color: '#f59e0b' },
    { label: t('stats.nfc', 'NFC Devices'), value: nfcCount, icon: 'tag', color: '#ec4899' },
  ];

  const recent = auditLogs.slice(0, 6);

  // Largest teams by real membership count — no fabricated scores.
  const topTeams = useMemo(
    () =>
      [...teams]
        .map((tm) => ({ name: tm.name, seats: tm._count?.memberships ?? 0 }))
        .sort((a, b) => b.seats - a.seats)
        .slice(0, 4),
    [teams],
  );

  return (
    <div className="space-y-6">
      {/* 1. Real KPI statistics row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((item) => (
          <div key={item.label} className="v-stat">
            <div className="flex items-center justify-between">
              <span className="v-stat-label">{item.label}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: `${item.color}1a`, color: item.color }}>
                <Icon name={item.icon} size={15} />
              </span>
            </div>
            <p className="v-stat-value mt-2 tabular-nums">{item.value}</p>
          </div>
        ))}
      </div>

      {/* 2. Main Dashboard Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Activity + Approvals */}
        <div className="space-y-6 lg:col-span-2">
          <section className="v-card p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="v-icon-tile"><Icon name="clock" size={16} /></span>
              <div>
                <h3 className="text-[15px] font-extrabold tracking-tight text-ink">{t('sections.timeline', 'Organization Timeline')}</h3>
                <p className="text-[11.5px] font-medium text-muted">{t('sections.timelineSub', 'Real-time collaboration audit logs')}</p>
              </div>
            </div>

            {recent.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center text-faint">
                <Icon name="clock" size={24} />
                <p className="text-[12px] font-semibold text-muted">{t('dash.noActivities')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recent.map((log) => {
                  const meta = auditActionMeta(log.action);
                  const target = (log.metadata?.email as string) || (log.metadata?.name as string) || '';
                  return (
                    <div key={log.id} className="flex items-center justify-between gap-3 rounded-xl border border-line/60 bg-canvas/30 p-3 transition-colors hover:bg-canvas/50">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${meta.color}15`, color: meta.color }}>
                          <Icon name="clock" size={13} />
                        </span>
                        <div className="min-w-0">
                          <span className="block truncate text-[12px] font-bold text-ink">
                            {meta.label}{target ? <span className="font-semibold text-muted"> · {target}</span> : ''}
                          </span>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{log.actor?.name || log.actor?.email || t('dash.system')}</span>
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] font-bold text-faint">{relativeTime(log.createdAt)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="v-card p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="v-icon-tile"><Icon name="check-circle" size={16} /></span>
              <div>
                <h3 className="text-[15px] font-extrabold tracking-tight text-ink">{t('sections.approvals', 'Approval Queue')}</h3>
                <p className="text-[11.5px] font-medium text-muted">{t('sections.approvalsSub', 'Card & template publishing authorization')}</p>
              </div>
            </div>

            {approvals.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-canvas/20 py-8 text-faint">
                <Icon name="check" size={20} className="text-emerald-500" />
                <p className="mt-2 text-xs font-bold text-muted">{t('sections.noPendingApprovals', 'All caught up — no pending requests.')}</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {approvals.map((req) => (
                  <div key={req.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-canvas/30 p-3 text-xs font-semibold">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-ink">{req.title}</p>
                      <p className="mt-0.5 text-[10px] font-medium text-muted">{t('dash.requestedBy', { name: req.requester.name })} · {relativeTime(req.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => handleResolve(req.id, 'REJECTED')} className="!text-red-500 hover:!bg-red-500/10 font-bold border-red-500/20">{t('dash.reject')}</Button>
                      <Button variant="outline" size="sm" onClick={() => handleResolve(req.id, 'APPROVED')} className="!text-emerald-500 hover:!bg-emerald-500/10 font-bold border-emerald-500/20">{t('dash.approve')}</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right: Plan + real team composition */}
        <div className="space-y-6">
          <section className="v-card flex flex-col p-6">
            <h3 className="text-[14px] font-extrabold tracking-tight text-ink">{t('sections.workspace', 'Workspace')}</h3>
            <div className="mt-4 v-hero p-5 text-center">
              <div className="relative z-10">
                <span className="inline-flex rounded-full bg-white/15 px-2.5 py-0.5 text-[9.5px] font-black uppercase tracking-wider text-white/90">
                  {org ? (PLAN_KEY[org.plan] ? t(PLAN_KEY[org.plan]) : org.plan) : '—'} {t('dash.planSuffix')}
                </span>
                <h4 className="mt-2 truncate text-[17px] font-black text-white">{org?.name ?? t('dash.organization')}</h4>
                <p className="mt-1 font-mono text-[10.5px] text-white/70">/c/{org?.slug ?? ''}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl border border-line bg-canvas/30 p-3">
                <p className="v-stat-label">{t('stats.totalMembers', 'Members')}</p>
                <p className="mt-1 text-[18px] font-black tabular-nums text-ink">{members.length}</p>
              </div>
              <div className="rounded-xl border border-line bg-canvas/30 p-3">
                <p className="v-stat-label">{t('stats.cards', 'Cards')}</p>
                <p className="mt-1 text-[18px] font-black tabular-nums text-ink">{cardsCount}</p>
              </div>
            </div>
          </section>

          <section className="v-card p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="v-icon-tile !h-8 !w-8"><Icon name="grid" size={15} /></span>
              <h3 className="text-[14px] font-extrabold tracking-tight text-ink">{t('sections.largestTeams', 'Largest Teams')}</h3>
            </div>
            {topTeams.length === 0 ? (
              <p className="py-2 text-[11px] font-medium text-muted">{t('sections.noTeamsCreated', 'No teams created yet.')}</p>
            ) : (
              <div className="space-y-1.5">
                {topTeams.map((tm, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs font-semibold hover:bg-ink/[0.03]">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-accent-soft text-[10px] font-bold text-accent">{idx + 1}</span>
                      <span className="truncate font-bold text-ink">{tm.name}</span>
                    </span>
                    <span className="v-badge v-badge-neutral shrink-0">{t('subview.seat', { count: tm.seats })}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
