'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { plansFor, type UsageSummary } from '@vertex/shared';
import { authFetch, getActiveOrgId, getToken, type Me } from '@/lib/client';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import AppShell from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { SALES_MAILTO } from '@/lib/contact';
import { BillingDetailsForm, InvoiceList } from '@/components/billing/Invoices';

type Plan = 'FREE' | 'PERSONAL' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';
/** The plans bought at checkout. */
type Paid = 'PERSONAL' | 'PRO' | 'BUSINESS';
const isPaid = (p: string): p is Paid => p === 'PERSONAL' || p === 'PRO' || p === 'BUSINESS';
type Resource = 'cards' | 'members' | 'nfcTags';

interface PlanDef {
  label: string;
  cards: number | null;
  members: number | null;
  nfcTags: number | null;
}

interface PlansResponse {
  plans: Record<string, PlanDef>;
  /** Monthly prices in pounds; null when the server has none set. */
  prices: Record<Paid, number | null>;
  currency: string;
  billingEnabled: boolean;
  onSale: Record<Paid, boolean>;
}

// Every plan, cheapest first; a workspace is offered those for its kind (plansFor).
const ORDER: Plan[] = ['FREE', 'PERSONAL', 'PRO', 'BUSINESS', 'ENTERPRISE'];
const RESOURCES: { key: Resource; href: string; icon: string; page: string }[] = [
  { key: 'cards', href: '/cards', icon: 'grid', page: 'nav:items.cards' },
  { key: 'members', href: '/team', icon: 'users', page: 'nav:items.team' },
  { key: 'nfcTags', href: '/tags', icon: 'tag', page: 'nfc:title' },
];
/** Subscribed, and still billed. */
const LIVE = new Set(['ACTIVE', 'TRIALING', 'PAST_DUE']);
const rank = (p: string) => ORDER.indexOf(p as Plan);
/** The mobile number Paymob asks for, remembered on this device for next time. */
const PHONE_KEY = 'vertex_billing_phone';

type Notice = 'success' | 'failed' | 'cancelled' | null;

/**
 * The organization's plan: what it pays, what it uses against the limits, and
 * the other plans. Paying happens on Paymob's checkout page; this page starts
 * it, cancels renewals, and shows the result.
 */
export default function BillingPage() {
  const router = useRouter();
  const { t } = useTranslation('billing');
  const { locale } = useLocale();
  const [plans, setPlans] = useState<Record<string, PlanDef>>({});
  const [prices, setPrices] = useState<PlansResponse['prices']>({ PERSONAL: null, PRO: null, BUSINESS: null });
  const [onSale, setOnSale] = useState<PlansResponse['onSale']>({ PERSONAL: false, PRO: false, BUSINESS: false });
  const [enabled, setEnabled] = useState(true);
  // The plan waiting for a mobile number before checkout opens.
  const [asking, setAsking] = useState<Paid | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
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
    // Paymob sends the payer back with ?checkout=done and its own result in
    // ?success. The query stays until the notice is dismissed.
    const q = new URLSearchParams(window.location.search);
    const back: Notice = q.get('checkout') === 'done' ? (q.get('success') === 'false' ? 'failed' : 'success') : null;
    if (back) setNotice(back);
    if (!getActiveOrgId()) {
      setPersonal(true);
      return;
    }
    Promise.all([
      authFetch<PlansResponse>('/billing/plans'),
      loadUsage(),
      authFetch<Me>('/auth/me').then(setMe),
    ])
      .then(([p]) => {
        setPlans(p.plans);
        setPrices(p.prices);
        setOnSale(p.onSale);
        setEnabled(p.billingEnabled);
      })
      .catch((e) => setError((e as Error).message));

    // The plan changes when Paymob's callback lands, usually a moment after
    // the redirect, so look again a few times.
    if (back === 'success') {
      const timers = [3000, 8000, 15000].map((ms) => setTimeout(() => loadUsage().catch(() => {}), ms));
      return () => timers.forEach(clearTimeout);
    }
  }, [router, loadUsage]);

  const canChange = me?.role === 'OWNER' || me?.role === 'ADMIN';
  const isOwner = me?.role === 'OWNER';
  const live = !!sub && sub.plan !== 'FREE' && LIVE.has(sub.status);
  const canCancel = enabled && !!sub?.subscribed && isOwner;
  const name = (p: string) => t(`plans.${p}`, { defaultValue: plans[p]?.label ?? p });
  const priceOf = (p: Plan) => (isPaid(p) ? prices[p] ?? null : null);
  // A person's own workspace is offered the personal plan; a company's or team's, the team plans.
  const own = me?.workspaceKind === 'PERSONAL';
  const offered = plansFor(me?.workspaceKind) as Plan[];

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
  const checkout = (plan: Plan) => isPaid(plan) && setAsking(plan);
  function pay(plan: Paid, phone: string) {
    try {
      localStorage.setItem(PHONE_KEY, phone);
    } catch {
      // not remembered, which is fine
    }
    setAsking(null);
    void go(plan, '/billing/checkout', { plan, phone });
  }
  async function cancel() {
    setError('');
    setBusy('cancel');
    try {
      await authFetch('/billing/cancel', { method: 'POST' });
      setConfirmCancel(false);
      setNotice('cancelled');
      await loadUsage();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  if (personal) {
    return (
      <AppShell title={t('title')}>
        <div className="mx-auto max-w-[520px] rounded-xl px-6 py-10 text-center ring-1 ring-inset ring-line">
          <p className="text-sm leading-relaxed text-muted">{t('personal')}</p>
        </div>
      </AppShell>
    );
  }

  const successText = notice === 'success' && sub && sub.plan !== 'FREE' && LIVE.has(sub.status) ? t('notices.successDone', { plan: name(sub.plan) }) : t('notices.success');
  const noticeText = notice === 'success' ? successText : notice === 'failed' ? t('notices.failed') : t('notices.cancelled', { date: sub?.periodEnd ? formatDate(sub.periodEnd, locale) : '' });

  return (
    <AppShell title={t('title')}>
      <div className="max-w-[1040px] space-y-3">
        {notice && (
          <Banner tone={notice === 'failed' ? 'danger' : notice === 'success' ? 'success' : 'neutral'} icon={notice === 'success' ? 'check' : 'info'} onDismiss={dismissNotice} dismiss={t('dismiss')}>
            {noticeText}
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
          // The page's own outline: the plan with its three meters, then the plans.
          <div role="status" aria-label={t('common:states.loading')} className="space-y-10">
            <div className="v-card overflow-hidden">
              <div className="space-y-2.5 p-6">
                <span className="v-skeleton block h-3 w-12 rounded" />
                <span className="v-skeleton block h-7 w-48 rounded-md" />
              </div>
              <div className="grid border-t border-line sm:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="space-y-3 border-line p-6 max-sm:[&:not(:last-child)]:border-b sm:[&:not(:last-child)]:border-e">
                    <span className="flex justify-between">
                      <span className="v-skeleton block h-3.5 w-20 rounded" />
                      <span className="v-skeleton block h-3.5 w-10 rounded" />
                    </span>
                    <span className="v-skeleton block h-1.5 w-full rounded-full" />
                    <span className="v-skeleton block h-2.5 w-16 rounded" />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <span className="v-skeleton block h-4 w-16 rounded" />
              <span className="v-skeleton mt-2.5 block h-3 w-72 max-w-full rounded" />
              <div className="v-card mt-4 grid overflow-hidden sm:grid-cols-2 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="space-y-3 border-line p-6 [&:not(:last-child)]:border-e">
                    <span className="v-skeleton block h-4 w-24 rounded" />
                    <span className="v-skeleton block h-3 w-32 rounded" />
                    <span className="v-skeleton mt-5 block h-7 w-20 rounded-md" />
                    <span className="v-skeleton mt-6 block h-3 w-28 rounded" />
                    <span className="v-skeleton block h-3 w-24 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <Current
              sub={sub}
              def={plans[sub.plan]}
              plans={plans}
              price={priceOf(sub.plan as Plan)}
              name={name}
              busy={busy}
              canCancel={canCancel}
              onCancel={() => setConfirmCancel(true)}
              upgrade={canChange && enabled ? (plan) => checkout(plan) : undefined}
              live={live}
              offered={offered}
              own={own}
            />

            <section aria-labelledby="plans-title">
              <div className="mb-4">
                <h2 id="plans-title" className="text-md font-semibold text-ink">
                  {t('plansTitle')}
                </h2>
                <p className="mt-1 text-sm text-muted">{t('plansHint')}</p>
              </div>
              <div className={`grid gap-px overflow-hidden rounded-xl bg-line ring-1 ring-line sm:grid-cols-2 ${offered.length > 2 ? 'xl:grid-cols-4' : 'max-w-[760px]'}`}>
                {offered.filter((p) => plans[p]).map((p) => (
                  <PlanColumn
                    key={p}
                    plan={p}
                    def={plans[p]}
                    price={priceOf(p)}
                    name={name(p)}
                    current={sub.plan === p}
                    action={planAction(p)}
                    busy={busy === p}
                    own={own}
                  />
                ))}
              </div>
              {enabled && (
                <p className="mt-4 flex items-center gap-2 text-xs text-faint">
                  <Icon name="lock" size={13} className="shrink-0" />
                  {t('secure')}
                </p>
              )}
            </section>

            {/* Invoices and who they are made out to: for whoever may pay. */}
            {canChange && (
              <>
                <InvoiceList />
                <BillingDetailsForm />
              </>
            )}
          </>
        )}
      </div>

      {asking && <PhoneDialog plan={name(asking)} price={prices[asking]} onPay={(phone) => pay(asking, phone)} onClose={() => setAsking(null)} />}
      {confirmCancel && sub && (
        <ConfirmCancel
          plan={name(sub.plan)}
          until={sub.periodEnd ? formatDate(sub.periodEnd, locale) : ''}
          busy={busy === 'cancel'}
          onConfirm={() => void cancel()}
          onClose={() => setConfirmCancel(false)}
        />
      )}
    </AppShell>
  );

  /**
   * What a plan's column offers. A paid plan is bought at Paymob; moving to
   * another paid plan is a new subscription, and the old one stops once the
   * new one is paid. Going back to Free is cancelling the renewals.
   */
  function planAction(p: Plan): PlanAction {
    if (!sub) return { kind: 'none' };
    if (sub.plan === p && (live || p === 'FREE')) return { kind: 'current' };
    if (p === 'ENTERPRISE') return { kind: 'sales' };
    if (!enabled || !canChange) return { kind: 'none' };
    if (p === 'FREE') return live && canCancel ? { kind: 'button', primary: false, label: t('plan.switchTo', { plan: name(p) }), run: () => setConfirmCancel(true) } : { kind: 'none' };
    if (!isPaid(p) || !onSale[p]) return { kind: 'none' };
    const up = rank(p) > rank(sub.plan);
    return { kind: 'button', primary: up, label: t(sub.plan === p ? 'plan.resume' : up ? 'plan.upgrade' : 'plan.switchTo', { plan: name(p) }), run: () => checkout(p) };
  }
}

/** Paymob asks for the payer's mobile number; it is asked here, once, and remembered. */
function PhoneDialog({ plan, price, onPay, onClose }: { plan: string; price: number | null; onPay: (phone: string) => void; onClose: () => void }) {
  const { t } = useTranslation('billing');
  const { locale } = useLocale();
  const [phone, setPhone] = useState(() => {
    try {
      return localStorage.getItem(PHONE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const valid = /^\+?[0-9 ]{8,16}$/.test(phone.trim());
  return (
    <Dialog title={t('phone.title', { plan })} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onPay(phone.trim());
        }}
      >
        <p className="text-sm leading-relaxed text-muted">
          {price !== null ? t('phone.hint', { price: formatCurrency(price, locale, 'EGP') }) : t('phone.hintNoPrice')}
        </p>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-medium text-ink">{t('phone.label')}</span>
          <input
            type="tel"
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
            autoFocus
            className="v-field tabular rtl:text-right"
            placeholder="+20 100 000 0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="v-btn v-btn-ghost">
            {t('phone.back')}
          </button>
          <button type="submit" disabled={!valid} className="v-btn disabled:opacity-50">
            {t('phone.continue')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ConfirmCancel({ plan, until, busy, onConfirm, onClose }: { plan: string; until: string; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  const { t } = useTranslation('billing');
  return (
    <Dialog title={t('cancel.title')} onClose={onClose}>
      <p className="text-sm leading-relaxed text-muted">{until ? t('cancel.body', { plan, date: until }) : t('cancel.bodyNoDate', { plan })}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="v-btn v-btn-ghost">
          {t('cancel.keep')}
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} className="v-btn bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">
          {busy ? t('cancel.cancelling') : t('cancel.confirm')}
        </button>
      </div>
    </Dialog>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="w-full max-w-[420px] rounded-xl bg-surface p-5 shadow-xl ring-1 ring-line">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
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
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-lg px-4 py-3 text-sm leading-relaxed ring-1 ring-inset ${tones[tone]}`}>
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
  price: amount,
  name,
  busy,
  live,
  canCancel,
  onCancel,
  upgrade,
  offered,
  own,
}: {
  sub: UsageSummary;
  def: PlanDef;
  plans: Record<string, PlanDef>;
  price: number | null;
  name: (p: string) => string;
  busy: string;
  live: boolean;
  canCancel: boolean;
  onCancel: () => void;
  upgrade?: (plan: Plan) => void;
  offered: Plan[];
  own: boolean;
}) {
  const { t } = useTranslation('billing');
  const { locale } = useLocale();
  const plan = sub.plan as Plan;

  const price =
    plan === 'FREE'
      ? t('current.free')
      : plan === 'ENTERPRISE'
        ? t('current.contract')
        : amount !== null
          ? t('current.perMonth', { price: formatCurrency(amount, locale, 'EGP') })
          : '';
  // Renewing: "renews on"; cancelled but paid for: "ends on", then Free.
  const period = !sub.periodEnd
    ? ''
    : live && sub.status !== 'PAST_DUE'
      ? t('current.renews', { date: formatDate(sub.periodEnd, locale) })
      : sub.status === 'CANCELED' && plan !== 'FREE' && new Date(sub.periodEnd) > new Date()
        ? t('current.endsOn', { date: formatDate(sub.periodEnd, locale) })
        : '';

  // The first limit that is full, and the next plan that lifts it.
  // A person's own workspace has no seats to count.
  const resources = own ? RESOURCES.filter((r) => r.key !== 'members') : RESOURCES;
  const full = resources.find((r) => def[r.key] !== null && sub.usage[r.key] >= (def[r.key] as number));
  const next = full ? offered.find((p) => rank(p) > rank(plan) && plans[p] && (plans[p][full.key] === null || (plans[p][full.key] as number) > sub.usage[full.key])) : undefined;
  // Enterprise is sold by contract, so it is suggested but never a button.
  const nextAction = next && next !== 'ENTERPRISE' && upgrade ? () => upgrade(next) : undefined;

  return (
    <section aria-labelledby="current-title" className="v-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
        <div className="min-w-0">
          <p className="text-xs text-muted">{t('current.label')}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <h2 id="current-title" className="text-3xl font-semibold leading-tight tracking-[-0.015em] text-ink rtl:tracking-normal">
              {name(plan)}
            </h2>
            {STATUS_BADGE[sub.status] && <span className={`v-badge ${STATUS_BADGE[sub.status]}`}>{t(`status.${sub.status}`)}</span>}
          </div>
          <p className="mt-1.5 text-sm text-muted">
            {price}
            {period && (
              <span className="text-faint">
                {price ? ' · ' : ''}
                {period}
              </span>
            )}
          </p>
        </div>
        {canCancel && live && (
          <button onClick={onCancel} disabled={!!busy} className="v-btn v-btn-ghost shrink-0 disabled:opacity-60">
            {t('current.cancel')}
          </button>
        )}
      </div>

      {sub.status === 'PAST_DUE' && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-amber-500/[0.06] px-5 py-3.5 sm:px-6">
          <Icon name="alert" size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="min-w-0 flex-1 text-sm text-ink">{t('current.pastDue', { plan: name(plan) })}</p>
        </div>
      )}

      <ul className={`grid border-t border-line ${resources.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {resources.map((r, i) => (
          <UsageCell key={r.key} resource={r} used={sub.usage[r.key]} limit={def[r.key]} first={i === 0} />
        ))}
      </ul>

      {full && next && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t border-line bg-elevated/60 px-5 py-3.5 sm:px-6">
          <p className="min-w-0 flex-1 text-sm text-ink">
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
              <a href={SALES_MAILTO} className="v-btn v-btn-ghost !h-9 shrink-0">
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
        <Link href={resource.href} className="v-hit group flex items-center gap-2 text-sm font-medium text-ink" aria-label={t('usage.open', { page: t(resource.page) })}>
          <Icon name={resource.icon} size={14} className="text-faint" />
          <span className="group-hover:underline">{t(`usage.${resource.key}`)}</span>
        </Link>
        <span className="tabular text-sm text-muted">
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

      <p className={`mt-2.5 text-xs ${isFull ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-faint'}`}>
        {limit === null ? ' ' : isFull ? t('usage.full') : t('usage.left', { count: limit - used })}
      </p>
    </li>
  );
}

function PlanColumn({ plan, def, price, name, current, action, busy, own }: { plan: Plan; def: PlanDef; price: number | null; name: string; current: boolean; action: PlanAction; busy: boolean; own: boolean }) {
  const { t } = useTranslation('billing');
  const { locale } = useLocale();
  const paid = plan !== 'FREE';

  const features: string[] = (own ? (['cards', 'nfcTags'] as const) : (['cards', 'members', 'nfcTags'] as const)).map((k) =>
    def[k] === null ? t(`features.${k}Unlimited`) : t(`features.${k}`, { count: def[k] as number }),
  );
  if (paid) features.push(t('features.verified'));

  return (
    <div className={`relative flex flex-col bg-surface p-5 sm:p-6 ${current ? 'bg-[linear-gradient(to_bottom,rgb(var(--v-accent-ch)/0.05),transparent_140px)]' : ''}`}>
      {current && <span className="absolute inset-x-0 top-0 h-0.5 bg-accent" aria-hidden />}
      <h3 className="text-md font-semibold text-ink">{name}</h3>
      <p className="mt-1 min-h-[2.6em] text-xs leading-snug text-muted">{t(`taglines.${plan}`)}</p>

      <p className="mt-4 flex items-baseline gap-1.5">
        {plan === 'ENTERPRISE' ? (
          <span className="text-4xl font-semibold leading-none tracking-[-0.02em] text-ink rtl:tracking-normal">{t('plan.custom')}</span>
        ) : plan === 'FREE' || price !== null ? (
          <>
            <span className="tabular text-4xl font-semibold leading-none tracking-[-0.02em] text-ink rtl:tracking-normal">{formatCurrency(plan === 'FREE' ? 0 : price!, locale, 'EGP')}</span>
            <span className="text-sm text-muted">{t('plan.perMonth')}</span>
          </>
        ) : (
          <span className="text-md font-medium leading-[26px] text-muted">{t('plan.priceSoon')}</span>
        )}
      </p>

      {/* An empty slot keeps side-by-side columns aligned; stacked, it is only a gap. */}
      <div className={`mt-5 ${action.kind === 'none' ? 'hidden sm:grid' : 'grid'}`}>
        {action.kind === 'current' ? (
          <span className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-elevated text-sm font-medium text-muted ring-1 ring-inset ring-line sm:h-9">
            <Icon name="check" size={14} /> {t('plan.currentPlan')}
          </span>
        ) : action.kind === 'sales' ? (
          <a href={SALES_MAILTO} className="v-btn v-btn-ghost !h-11 w-full sm:!h-9">
            {t('plan.contactSales')}
          </a>
        ) : action.kind === 'button' ? (
          <button onClick={action.run} disabled={busy} className={`v-btn !h-11 w-full sm:!h-9 disabled:opacity-60 ${action.primary ? '' : 'v-btn-ghost'}`}>
            {busy ? t('plan.redirecting') : action.label}
          </button>
        ) : (
          <span className="block h-10 sm:h-9" aria-hidden />
        )}
      </div>

      <ul className="mt-5 space-y-2.5 border-t border-line pt-5 text-sm text-ink">
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
