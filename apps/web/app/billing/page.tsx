'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import type { UsageSummary } from '@vertex/shared';
import { authFetch, getActiveOrgId, getToken, type Me } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import AppShell from '@/components/AppShell';
import { Icon } from '@/components/Icon';

type Plan = 'FREE' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';
type Resource = 'cards' | 'members' | 'nfcTags';

interface PlanDef {
  label: string;
  price: number;
  cards: number | null;
  members: number | null;
  nfcTags: number | null;
}

const ORDER: Plan[] = ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'];
const RESOURCES: { key: Resource; href: string; icon: string; page: string }[] = [
  { key: 'cards', href: '/cards', icon: 'grid', page: 'nav:items.cards' },
  { key: 'members', href: '/team', icon: 'users', page: 'nav:items.team' },
  { key: 'nfcTags', href: '/tags', icon: 'tag', page: 'nfc:title' },
];
const SALES = 'mailto:sales@vertex.dev';
/** Subscribed, and still billed: plan changes go through the billing portal. */
const LIVE = new Set(['ACTIVE', 'TRIALING', 'PAST_DUE']);
const rank = (p: string) => ORDER.indexOf(p as Plan);
/** Prices are set in US dollars and read as "$19" in either language. */
const usd = (v: number) => formatCurrency(v, 'en', 'USD');

type Notice = 'success' | 'canceled' | null;

/**
 * The organization's plan: what it pays, what it uses against the limits, and
 * the other plans. Paying and plan changes happen on Stripe; this page starts
 * them and shows the result.
 */
export default function BillingPage() {
  const router = useRouter();
  const { t } = useTranslation('billing');
  const [plans, setPlans] = useState<Record<string, PlanDef>>({});
  const [enabled, setEnabled] = useState(true);
  const [sub, setSub] = useState<UsageSummary | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [personal, setPersonal] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const loadUsage = useCallback(() => authFetch<UsageSummary>('/billing/subscription').then(setSub), []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    // Stripe sends the owner back with ?success or ?canceled. The query stays
    // until the notice is dismissed, so a remount still shows it.
    const q = new URLSearchParams(window.location.search);
    const back: Notice = q.has('success') ? 'success' : q.has('canceled') ? 'canceled' : null;
    if (back) setNotice(back);
    if (!getActiveOrgId()) {
      setPersonal(true);
      return;
    }
    Promise.all([
      authFetch<{ plans: Record<string, PlanDef>; billingEnabled: boolean }>('/billing/plans'),
      loadUsage(),
      authFetch<Me>('/auth/me').then(setMe),
    ])
      .then(([p]) => {
        setPlans(p.plans);
        setEnabled(p.billingEnabled);
      })
      .catch((e) => setError((e as Error).message));

    // The plan changes when Stripe's webhook lands, usually a moment after
    // the redirect, so look again a couple of times.
    if (back === 'success') {
      const timers = [3000, 8000].map((ms) => setTimeout(() => loadUsage().catch(() => {}), ms));
      return () => timers.forEach(clearTimeout);
    }
  }, [router, loadUsage]);

  const canChange = me?.role === 'OWNER' || me?.role === 'ADMIN';
  const isOwner = me?.role === 'OWNER';
  const live = !!sub && sub.plan !== 'FREE' && LIVE.has(sub.status);
  const portalReady = enabled && !!sub?.billingAccount && isOwner;
  const name = (p: string) => t(`plans.${p}`, { defaultValue: plans[p]?.label ?? p });

  async function go(key: string, path: string, body?: unknown) {
    setError('');
    setBusy(key);
    try {
      const { url } = await authFetch<{ url: string }>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      window.location.href = url;
    } catch (e) {
      setError((e as Error).message);
      setBusy('');
    }
  }
  function dismissNotice() {
    setNotice(null);
    window.history.replaceState(null, '', window.location.pathname);
  }
  const checkout = (plan: Plan) => go(plan, '/billing/checkout', { plan });
  const portal = (key = 'portal') => go(key, '/billing/portal');

  if (personal) {
    return (
      <AppShell title={t('title')}>
        <div className="mx-auto max-w-[520px] rounded-xl px-6 py-10 text-center ring-1 ring-inset ring-line">
          <p className="text-[13.5px] leading-relaxed text-muted">{t('personal')}</p>
        </div>
      </AppShell>
    );
  }

  const successText = notice === 'success' && sub && sub.plan !== 'FREE' && LIVE.has(sub.status) ? t('notices.successDone', { plan: name(sub.plan) }) : t('notices.success');

  return (
    <AppShell title={t('title')}>
      <div className="max-w-[1040px] space-y-3">
        {notice && (
          <Banner tone={notice === 'success' ? 'success' : 'neutral'} icon={notice === 'success' ? 'check' : 'info'} onDismiss={dismissNotice} dismiss={t('dismiss')}>
            {notice === 'success' ? successText : t('notices.canceled')}
          </Banner>
        )}
        {!enabled && (
          <Banner tone="neutral" icon="info">
            {t('notices.disabled')}
          </Banner>
        )}
        {me && !canChange && enabled && (
          <Banner tone="neutral" icon="lock">
            {t('readOnly')}
          </Banner>
        )}
        {error && (
          <Banner tone="danger" icon="x" onDismiss={() => setError('')} dismiss={t('dismiss')}>
            {error}
          </Banner>
        )}
      </div>

      <div className="mt-3 max-w-[1040px] space-y-10">
        {!sub || !plans[sub.plan] ? (
          <div className="space-y-4">
            <div className="v-skeleton h-[228px] w-full rounded-xl" />
            <div className="v-skeleton h-[380px] w-full rounded-xl" />
          </div>
        ) : (
          <>
            <Current
              sub={sub}
              def={plans[sub.plan]}
              plans={plans}
              name={name}
              busy={busy}
              portalReady={portalReady}
              onPortal={portal}
              upgrade={
                canChange && enabled
                  ? (plan) => (live ? (portalReady ? portal(plan) : undefined) : checkout(plan))
                  : undefined
              }
              live={live}
            />

            <section aria-labelledby="plans-title">
              <div className="mb-4">
                <h2 id="plans-title" className="text-[15px] font-semibold text-ink">
                  {t('plansTitle')}
                </h2>
                <p className="mt-1 text-[13px] text-muted">{t('plansHint')}</p>
              </div>
              <div className="grid gap-px overflow-hidden rounded-xl bg-line ring-1 ring-line sm:grid-cols-2 xl:grid-cols-4">
                {ORDER.filter((p) => plans[p]).map((p) => (
                  <PlanColumn
                    key={p}
                    plan={p}
                    def={plans[p]}
                    name={name(p)}
                    current={sub.plan === p}
                    action={planAction(p)}
                    busy={busy === p}
                  />
                ))}
              </div>
              {enabled && (
                <p className="mt-4 flex items-center gap-2 text-[12.5px] text-faint">
                  <Icon name="lock" size={13} className="shrink-0" />
                  {t('secure')}
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );

  /**
   * What a plan's column offers. A first subscription goes through checkout;
   * once subscribed, every change (up, down, or cancelling to Free) goes
   * through the billing portal so nothing is billed twice.
   */
  function planAction(p: Plan): PlanAction {
    if (!sub) return { kind: 'none' };
    if (sub.plan === p) return { kind: 'current' };
    if (p === 'ENTERPRISE') return { kind: 'sales' };
    if (!enabled || !canChange) return { kind: 'none' };
    const up = rank(p) > rank(sub.plan);
    if (live) return portalReady ? { kind: 'button', primary: up, label: t(up ? 'plan.upgrade' : 'plan.switchTo', { plan: name(p) }), run: () => portal(p) } : { kind: 'none' };
    if (p === 'FREE') return { kind: 'none' };
    return { kind: 'button', primary: up, label: t(up ? 'plan.upgrade' : 'plan.switchTo', { plan: name(p) }), run: () => checkout(p) };
  }
}

type PlanAction =
  | { kind: 'none' }
  | { kind: 'current' }
  | { kind: 'sales' }
  | { kind: 'button'; primary: boolean; label: string; run: () => void };

function Banner({
  tone,
  icon,
  children,
  onDismiss,
  dismiss,
}: {
  tone: 'success' | 'neutral' | 'danger';
  icon: string;
  children: React.ReactNode;
  onDismiss?: () => void;
  dismiss?: string;
}) {
  const tones = {
    success: 'bg-emerald-500/[0.07] text-emerald-800 ring-emerald-500/20 dark:text-emerald-300',
    neutral: 'bg-elevated text-muted ring-line',
    danger: 'bg-red-500/[0.06] text-red-700 ring-red-500/20 dark:text-red-300',
  };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-lg px-4 py-3 text-[13px] leading-relaxed ring-1 ring-inset ${tones[tone]}`}>
      <Icon name={icon} size={15} className="mt-[3px] shrink-0" />
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button onClick={onDismiss} aria-label={dismiss} className="-m-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-black/5 dark:hover:bg-white/5">
          <Icon name="x" size={13} />
        </button>
      )}
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'v-badge-success',
  TRIALING: 'v-badge-accent',
  PAST_DUE: 'v-badge-warning',
  CANCELED: 'v-badge-neutral',
};

function Current({
  sub,
  def,
  plans,
  name,
  busy,
  live,
  portalReady,
  onPortal,
  upgrade,
}: {
  sub: UsageSummary;
  def: PlanDef;
  plans: Record<string, PlanDef>;
  name: (p: string) => string;
  busy: string;
  live: boolean;
  portalReady: boolean;
  onPortal: () => void;
  upgrade?: (plan: Plan) => void;
}) {
  const { t } = useTranslation('billing');
  const { locale } = useLocale();
  const plan = sub.plan as Plan;

  const price =
    plan === 'FREE'
      ? t('current.free')
      : plan === 'ENTERPRISE'
        ? t('current.contract')
        : t('current.perMonth', { price: usd(def.price) });
  const period = sub.periodEnd && live && sub.status !== 'PAST_DUE' ? t('current.paidThrough', { date: formatDate(sub.periodEnd, locale) }) : '';

  // The first limit that is full, and the next plan that lifts it.
  const full = RESOURCES.find((r) => def[r.key] !== null && sub.usage[r.key] >= (def[r.key] as number));
  const next = full ? ORDER.find((p) => rank(p) > rank(plan) && plans[p] && (plans[p][full.key] === null || (plans[p][full.key] as number) > sub.usage[full.key])) : undefined;
  // Enterprise is sold by contract, so it is suggested but never a button.
  const nextAction = next && next !== 'ENTERPRISE' && upgrade && (!live || portalReady) ? () => upgrade(next) : undefined;

  return (
    <section aria-labelledby="current-title" className="v-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
        <div className="min-w-0">
          <p className="text-[12.5px] text-muted">{t('current.label')}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <h2 id="current-title" className="text-[22px] font-semibold leading-tight tracking-[-0.015em] text-ink rtl:tracking-normal">
              {name(plan)}
            </h2>
            {STATUS_BADGE[sub.status] && <span className={`v-badge ${STATUS_BADGE[sub.status]}`}>{t(`status.${sub.status}`)}</span>}
          </div>
          <p className="mt-1.5 text-[13px] text-muted">
            {price}
            {period && <span className="text-faint"> · {period}</span>}
          </p>
        </div>
        {portalReady && (
          <button onClick={() => onPortal()} disabled={!!busy} className="v-btn v-btn-ghost shrink-0 disabled:opacity-60">
            <Icon name="external-link" size={14} />
            {busy === 'portal' ? t('current.opening') : t('current.manage')}
          </button>
        )}
      </div>

      {sub.status === 'PAST_DUE' && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-amber-500/[0.06] px-5 py-3.5 sm:px-6">
          <Icon name="alert" size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="min-w-0 flex-1 text-[13px] text-ink">{t('current.pastDue', { plan: name(plan) })}</p>
          {portalReady && (
            <button onClick={() => onPortal()} disabled={!!busy} className="v-btn !h-9 shrink-0 disabled:opacity-60">
              {t('current.updatePayment')}
            </button>
          )}
        </div>
      )}

      <ul className="grid border-t border-line sm:grid-cols-3">
        {RESOURCES.map((r, i) => (
          <UsageCell key={r.key} resource={r} used={sub.usage[r.key]} limit={def[r.key]} first={i === 0} />
        ))}
      </ul>

      {full && next && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t border-line bg-elevated/60 px-5 py-3.5 sm:px-6">
          <p className="min-w-0 flex-1 text-[13px] text-ink">
            {t(`nudge.${full.key}`)}{' '}
            <span className="text-muted">
              {plans[next][full.key] === null
                ? t('nudge.noLimit', { plan: name(next) })
                : t('nudge.upTo', { plan: name(next), count: plans[next][full.key] as number })}
            </span>
          </p>
          {nextAction ? (
            <button onClick={nextAction} disabled={!!busy} className="v-btn !h-9 shrink-0 disabled:opacity-60">
              {busy === next ? t('plan.redirecting') : t('plan.upgrade', { plan: name(next) })}
            </button>
          ) : (
            next === 'ENTERPRISE' && (
              <a href={SALES} className="v-btn v-btn-ghost !h-9 shrink-0">
                {t('plan.contactSales')}
              </a>
            )
          )}
        </div>
      )}
    </section>
  );
}

function UsageCell({ resource, used, limit, first }: { resource: (typeof RESOURCES)[number]; used: number; limit: number | null; first: boolean }) {
  const { t } = useTranslation('billing');
  const { locale } = useLocale();
  const n = (v: number) => formatNumber(v, locale);
  const isFull = limit !== null && used >= limit;
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const fill = isFull ? 'bg-amber-500' : 'bg-accent';

  return (
    <li className={`p-5 sm:p-6 ${first ? '' : 'border-t border-line sm:border-t-0 sm:border-s'}`}>
      <div className="flex items-center justify-between gap-3">
        <Link href={resource.href} className="group flex items-center gap-2 text-[13px] font-medium text-ink" aria-label={t('usage.open', { page: t(resource.page) })}>
          <Icon name={resource.icon} size={14} className="text-faint" />
          <span className="group-hover:underline">{t(`usage.${resource.key}`)}</span>
        </Link>
        <span className="tabular text-[13px] text-muted">
          {limit === null ? t('usage.unlimited', { used: n(used) }) : t('usage.of', { used: n(used), limit: n(limit) })}
        </span>
      </div>

      {limit !== null ? (
        limit <= 12 ? (
          <span className="mt-3 flex gap-[3px]" aria-hidden>
            {Array.from({ length: limit }, (_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i < used ? fill : 'bg-line'}`} />
            ))}
          </span>
        ) : (
          <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
            <span className={`block h-full rounded-full ${fill}`} style={{ width: `${Math.max(pct, used > 0 ? 2 : 0)}%` }} />
          </span>
        )
      ) : (
        <span className="mt-3 block h-1.5 rounded-full bg-line" aria-hidden />
      )}

      <p className={`mt-2.5 text-[12.5px] ${isFull ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-faint'}`}>
        {limit === null ? ' ' : isFull ? t('usage.full') : t('usage.left', { count: limit - used })}
      </p>
    </li>
  );
}

function PlanColumn({ plan, def, name, current, action, busy }: { plan: Plan; def: PlanDef; name: string; current: boolean; action: PlanAction; busy: boolean }) {
  const { t } = useTranslation('billing');
  const paid = plan !== 'FREE';

  const features: string[] = (['cards', 'members', 'nfcTags'] as const).map((k) =>
    def[k] === null ? t(`features.${k}Unlimited`) : t(`features.${k}`, { count: def[k] as number }),
  );
  if (paid) features.push(t('features.verified'));

  return (
    <div className={`relative flex flex-col bg-surface p-5 sm:p-6 ${current ? 'bg-[linear-gradient(to_bottom,rgb(var(--v-accent-ch)/0.05),transparent_140px)]' : ''}`}>
      {current && <span className="absolute inset-x-0 top-0 h-0.5 bg-accent" aria-hidden />}
      <h3 className="text-[15px] font-semibold text-ink">{name}</h3>
      <p className="mt-1 min-h-[2.6em] text-[12.5px] leading-snug text-muted">{t(`taglines.${plan}`)}</p>

      <p className="mt-4 flex items-baseline gap-1.5">
        {plan === 'ENTERPRISE' ? (
          <span className="text-[26px] font-semibold leading-none tracking-[-0.02em] text-ink rtl:tracking-normal">{t('plan.custom')}</span>
        ) : (
          <>
            <span dir="ltr" className="tabular text-[26px] font-semibold leading-none tracking-[-0.02em] text-ink">{usd(def.price)}</span>
            <span className="text-[13px] text-muted">{t('plan.perMonth')}</span>
          </>
        )}
      </p>

      {/* An empty slot keeps side-by-side columns aligned; stacked, it is only a gap. */}
      <div className={`mt-5 ${action.kind === 'none' ? 'hidden sm:grid' : 'grid'}`}>
        {action.kind === 'current' ? (
          <span className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-elevated text-[13px] font-medium text-muted ring-1 ring-inset ring-line sm:h-9">
            <Icon name="check" size={14} /> {t('plan.currentPlan')}
          </span>
        ) : action.kind === 'sales' ? (
          <a href={SALES} className="v-btn v-btn-ghost !h-10 w-full sm:!h-9">
            {t('plan.contactSales')}
          </a>
        ) : action.kind === 'button' ? (
          <button onClick={action.run} disabled={busy} className={`v-btn !h-10 w-full sm:!h-9 disabled:opacity-60 ${action.primary ? '' : 'v-btn-ghost'}`}>
            {busy ? t('plan.redirecting') : action.label}
          </button>
        ) : (
          <span className="block h-10 sm:h-9" aria-hidden />
        )}
      </div>

      <ul className="mt-5 space-y-2.5 border-t border-line pt-5 text-[13px] text-ink">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Icon name="check" size={14} className="mt-[3px] shrink-0 text-accent" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
