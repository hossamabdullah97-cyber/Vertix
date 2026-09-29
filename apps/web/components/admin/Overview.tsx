'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { Icon } from '@/components/Icon';
import { OrgMark } from '@/components/OrgMark';
import { PLANS, PLAN_BADGE, type AdminOrg } from './shared';

interface Kpis {
  totals: {
    users: number;
    activeUsers: number;
    organizations: number;
    cards: number;
    publishedCards: number;
    nfcDevices: number;
    activeNfc: number;
    leads: number;
    events?: number;
    views?: number;
    profileViews: number;
    mrr: number;
    arr: number;
    enterpriseSubs: number;
    dbSize: string | null;
  };
  system: { uptimeSeconds: number; memoryMb: number; activeJobs: number; failedJobs: number };
}

/** Revenue is in Egyptian pounds, the currency plans are sold in. */
const egp = (v: number) => formatCurrency(v, 'en', 'EGP');

export function Overview({ orgs, onOpen }: { orgs: AdminOrg[] | null; onOpen: (tab: 'workspaces' | 'jobs') => void }) {
  const { t } = useTranslation('admin');
  const { locale } = useLocale();
  const [k, setK] = useState<Kpis | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    authFetch<Kpis>('/admin/kpis')
      .then(setK)
      .catch((e) => setError((e as Error).message));
  }, []);

  const n = (v: number) => formatNumber(v, locale);
  if (error) return <p className="text-[13px] text-muted">{error}</p>;
  if (!k) {
    return (
      <div className="grid gap-px overflow-hidden rounded-xl bg-line ring-1 ring-line sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="bg-surface p-5">
            <div className="v-skeleton h-3 w-24 rounded" />
            <div className="v-skeleton mt-3 h-7 w-16 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const paid = orgs?.filter((o) => o.plan !== 'FREE').length ?? 0;
  const views = k.totals.views ?? k.totals.profileViews;
  const events = k.totals.events ?? k.totals.profileViews;
  const metrics: { label: string; value: string; sub?: string; hint?: string }[] = [
    { label: t('overview.people'), value: n(k.totals.users), sub: t('overview.peopleSub', { count: k.totals.activeUsers }) },
    { label: t('overview.workspaces'), value: n(k.totals.organizations), sub: orgs ? t('overview.workspacesSub', { count: paid }) : undefined },
    { label: t('overview.cards'), value: n(k.totals.cards), sub: t('overview.cardsSub', { count: k.totals.publishedCards }) },
    { label: t('overview.chips'), value: n(k.totals.activeNfc), sub: t('overview.chipsSub', { count: k.totals.nfcDevices }) },
    { label: t('overview.leads'), value: n(k.totals.leads) },
    { label: t('overview.views'), value: n(views), sub: t('overview.viewsSub', { count: events }) },
    {
      label: t('overview.revenue'),
      value: egp(k.totals.mrr),
      sub: [t('overview.revenueSub', { arr: egp(k.totals.arr) }), k.totals.enterpriseSubs ? t('overview.enterprise', { count: k.totals.enterpriseSubs }) : ''].filter(Boolean).join(' '),
      hint: t('overview.revenueHint'),
    },
    { label: t('overview.database'), value: k.totals.dbSize ?? '—' },
  ];

  const s = k.system.uptimeSeconds;
  const uptime = [
    Math.floor(s / 86400) ? t('overview.d', { count: Math.floor(s / 86400) }) : '',
    Math.floor((s % 86400) / 3600) ? t('overview.h', { count: Math.floor((s % 86400) / 3600) }) : '',
    t('overview.m', { count: Math.floor((s % 3600) / 60) }),
  ]
    .filter(Boolean)
    .join(' ');

  const byPlan = PLANS.map((p) => ({ plan: p, count: orgs?.filter((o) => o.plan === p).length ?? 0 }));
  const total = Math.max(1, orgs?.length ?? 0);
  const recent = [...(orgs ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const PLAN_BAR: Record<string, string> = { FREE: 'bg-line-strong', PRO: 'bg-accent', BUSINESS: 'bg-accent/60', ENTERPRISE: 'bg-emerald-500' };

  return (
    <div className="max-w-[1180px] space-y-8">
      <p className="text-[13.5px] text-muted">{t('overview.intro')}</p>

      <dl className="grid gap-px overflow-hidden rounded-xl bg-line ring-1 ring-line sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="bg-surface p-5">
            <dt className="text-[12.5px] text-muted" title={m.hint}>
              {m.label}
            </dt>
            <dd className="tabular mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.02em] text-ink">
              <bdi>{m.value}</bdi>
            </dd>
            {m.sub && <dd className="mt-2 text-[12.5px] text-faint">{m.sub}</dd>}
          </div>
        ))}
      </dl>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="v-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[14px] font-semibold text-ink">{t('overview.recent')}</h2>
            <button onClick={() => onOpen('workspaces')} className="v-hit text-[12.5px] font-medium text-accent hover:underline">
              {t('overview.seeAll')}
            </button>
          </div>
          <ul className="-mx-5 mt-3 divide-y divide-line border-t border-line">
            {recent.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-5 py-3">
                <OrgMark name={o.name} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{o.name}</span>
                  <span className="block truncate text-[12.5px] text-faint">{o.owner ? o.owner.name || o.owner.email : t('workspaces.noOwner')}</span>
                </span>
                <span className={`v-badge ${PLAN_BADGE[o.plan]}`}>{t(`plans.${o.plan}`)}</span>
                <span className="hidden w-24 shrink-0 text-end text-[12.5px] text-faint sm:block">{formatDate(o.createdAt, locale, { month: 'short', day: 'numeric' })}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-6">
          <section className="v-card p-5">
            <h2 className="text-[14px] font-semibold text-ink">{t('overview.plans')}</h2>
            <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-elevated" aria-hidden>
              {byPlan.map((p) => (p.count ? <span key={p.plan} className={PLAN_BAR[p.plan]} style={{ width: `${(p.count / total) * 100}%`, ...(p.plan === 'FREE' ? { background: 'hsl(var(--v-border-strong))' } : {}) }} /> : null))}
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
              {byPlan.map((p) => (
                <li key={p.plan} className="flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-2 text-muted">
                    <span className={`h-2 w-2 rounded-full ${PLAN_BAR[p.plan]}`} style={p.plan === 'FREE' ? { background: 'hsl(var(--v-border-strong))' } : undefined} />
                    {t(`plans.${p.plan}`)}
                  </span>
                  <span className="tabular text-ink">{n(p.count)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="v-card p-5">
            <h2 className="text-[14px] font-semibold text-ink">{t('overview.server')}</h2>
            <dl className="mt-3 space-y-2.5 text-[13px]">
              {[
                [t('overview.uptime'), uptime],
                [t('overview.memory'), `${n(k.system.memoryMb)} MB`],
                [t('overview.queued'), n(k.system.activeJobs)],
                [t('overview.failed'), n(k.system.failedJobs)],
              ].map(([label, value], i) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="text-muted">{label}</dt>
                  <dd className={`tabular ${i === 3 && k.system.failedJobs ? 'font-medium text-red-600 dark:text-red-400' : 'text-ink'}`}>
                    <bdi>{value}</bdi>
                  </dd>
                </div>
              ))}
            </dl>
            <button onClick={() => onOpen('jobs')} className="v-hit mt-4 flex items-center gap-1.5 text-[12.5px] font-medium text-accent hover:underline">
              {t('overview.seeJobs')} <Icon name="arrow" size={13} className="rtl:-scale-x-100" />
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
