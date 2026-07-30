'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { authFetch, getToken } from '@/lib/client';
import AppShell from '@/components/AppShell';
import { Icon } from '@/components/Icon';

export const dynamic = 'force-dynamic';

export default function BillingPage() {
  return (
    <Suspense fallback={<BillingFallback />}>
      <BillingInner />
    </Suspense>
  );
}

function BillingFallback() {
  const { t } = useTranslation('billing');
  return <div className="p-8 text-center text-muted font-semibold">{t('loading')}</div>;
}

interface PlanDef {
  label: string;
  price: number;
  cards: number | null;
  members: number | null;
  nfcTags: number | null;
}
interface Usage {
  plan: string;
  limits: PlanDef;
  usage: { cards: number; members: number; nfcTags: number };
  status: string;
}

const ORDER = ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'];

function BillingInner() {
  const { t } = useTranslation('billing');
  const router = useRouter();
  const search = useSearchParams();
  const [plans, setPlans] = useState<Record<string, PlanDef>>({});
  const [enabled, setEnabled] = useState(false);
  const [sub, setSub] = useState<Usage | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  /** Plan names are localized here; the API `label` is the English fallback. */
  const planName = (key: string, fallback: string) =>
    t(`plans.${key}`, { defaultValue: fallback });

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    Promise.all([
      authFetch<{ plans: Record<string, PlanDef>; billingEnabled: boolean }>('/billing/plans'),
      authFetch<Usage>('/billing/subscription'),
    ])
      .then(([p, s]) => {
        setPlans(p.plans);
        setEnabled(p.billingEnabled);
        setSub(s);
      })
      .catch((e) => setError(e.message));
  }, [router]);

  async function upgrade(plan: string) {
    setError('');
    setBusy(plan);
    try {
      const { url } = await authFetch<{ url: string }>('/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan }),
      });
      window.location.href = url;
    } catch (e) {
      setError((e as Error).message);
      setBusy('');
    }
  }

  async function portal() {
    try {
      const { url } = await authFetch<{ url: string }>('/billing/portal', { method: 'POST' });
      window.location.href = url;
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const usageBar = (used: number, limit: number | null) => {
    if (limit === null) return null;
    const pct = Math.min(100, (used / limit) * 100);
    return (
      <div className="h-2 bg-canvas rounded-full overflow-hidden mt-2 border border-line">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: 'var(--v-gradient-brand)' }} />
      </div>
    );
  };

  return (
    <AppShell title={t('title')}>
      <p className="text-[13px] text-muted -mt-2 font-semibold tracking-wide uppercase">{t('subtitle')}</p>

      {search.get('success') && (
        <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-sm font-semibold flex items-center gap-2">
          <Icon name="check" size={16} /> {t('successBanner')}
        </div>
      )}
      {!enabled && (
        <div className="mt-4 p-4 rounded-xl bg-canvas border border-line text-muted text-sm font-medium flex items-center gap-2">
          <Icon name="settings" size={15} className="shrink-0" /> {t('sandboxBanner')}
        </div>
      )}
      {error && (
        <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-semibold flex items-center gap-2">
          <Icon name="x" size={16} className="shrink-0" />{error}
        </div>
      )}

      {/* Current usage */}
      {sub && (
        <section className="mt-6 v-card p-6 bg-surface">
          <div className="flex items-center justify-between flex-wrap gap-4 border-b border-line pb-4 mb-5">
            <div>
              <p className="text-[11px] font-bold text-muted uppercase tracking-wider">{t('current.tier')}</p>
              <p className="text-xl font-extrabold text-ink tracking-tight mt-0.5">
                {t('current.planSuffix', { name: planName(sub.plan, sub.limits.label) })}
              </p>
            </div>
            {sub.plan !== 'FREE' && enabled && (
              <button onClick={portal} className="v-btn v-btn-ghost !h-9 text-[12.5px] font-bold shadow-sm">
                {t('current.managePortal')}
              </button>
            )}
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {(['cards', 'members', 'nfcTags'] as const).map((k) => {
              const icon = k === 'cards' ? 'grid' : k === 'members' ? 'users' : 'tag';
              return (
                <div key={k} className="p-4 rounded-xl bg-canvas/30 border border-line">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-2 text-[12px] font-bold text-muted uppercase tracking-wider">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-soft text-accent"><Icon name={icon} size={13} /></span>
                      {t(`usage.${k}`)}
                    </span>
                    {/* Kept LTR so "2 / 5" never reorders in RTL. */}
                    <span dir="ltr" className="font-mono text-ink text-[12px] font-bold">
                      {sub.usage[k]} / {sub.limits[k] ?? '∞'}
                    </span>
                  </div>
                  {usageBar(sub.usage[k], sub.limits[k])}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Plans */}
      <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {ORDER.filter((p) => plans[p]).map((key) => {
          const p = plans[key];
          const current = sub?.plan === key;
          const upgradable = (key === 'PRO' || key === 'BUSINESS') && !current;
          const name = planName(key, p.label);

          return (
            <div
              key={key}
              className={`rounded-2xl border p-6 flex flex-col justify-between transition-all bg-surface ${
                current
                  ? 'border-accent shadow-md ring-2 ring-accent-soft'
                  : 'border-line hover:shadow-md'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-[15.5px] text-ink">{name}</span>
                  {current && (
                    <span className="rounded-full bg-accent-soft text-accent border border-accent/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                      {t('plan.active')}
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-3xl font-black text-ink tracking-tight">
                    {key === 'ENTERPRISE' ? t('plan.custom') : <span dir="ltr">${p.price}</span>}
                    {key !== 'ENTERPRISE' && <span className="text-[14px] text-muted font-semibold tracking-normal">{t('plan.perMonth')}</span>}
                  </p>
                </div>
                <div className="border-t border-line/60 pt-4">
                  <ul className="grid gap-2.5 text-[13px] text-muted font-medium">
                    {([
                      ['cards', p.cards],
                      ['members', p.members],
                      ['tags', p.nfcTags],
                    ] as const).map(([labelKey, value]) => (
                      <li key={labelKey} className="flex items-center gap-2">
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Icon name="check" size={11} /></span>
                        <span>
                          <span className="font-bold text-ink">{value ?? t('plan.unlimited')}</span>{' '}
                          {/* count drives Arabic plural agreement. Real limits are >= 1, so
                              count 0 is reserved for "unlimited" and maps to the definite plural. */}
                          {t(`plan.${labelKey}`, { count: value ?? 0 })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-line/60">
                {current ? (
                  <span className="block text-center text-sm font-bold text-accent py-2">{t('plan.currentPlan')}</span>
                ) : upgradable ? (
                  <button
                    onClick={() => upgrade(key)}
                    disabled={!enabled || busy === key}
                    className="v-btn w-full !h-10 text-[13.5px] font-bold shadow-md disabled:opacity-50"
                  >
                    {busy === key
                      ? t('plan.redirecting')
                      : enabled
                        ? t('plan.upgradeTo', { name })
                        : t('plan.sandboxDisabled')}
                  </button>
                ) : key === 'ENTERPRISE' ? (
                  <a href="mailto:sales@vertex.dev" className="v-btn v-btn-ghost w-full !h-10 text-[13.5px] font-bold shadow-sm">
                    {t('plan.contactSales')}
                  </a>
                ) : (
                  <span className="block text-center text-sm text-muted py-2 font-medium">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
