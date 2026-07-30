'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authFetch, getToken } from '@/lib/client';
import AppShell from '@/components/AppShell';
import { Icon } from '@/components/Icon';

export const dynamic = 'force-dynamic';

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted font-semibold">Loading subscription context…</div>}>
      <BillingInner />
    </Suspense>
  );
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
  const router = useRouter();
  const search = useSearchParams();
  const [plans, setPlans] = useState<Record<string, PlanDef>>({});
  const [enabled, setEnabled] = useState(false);
  const [sub, setSub] = useState<Usage | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

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
    <AppShell title="Subscription & Billing">
      <p className="text-[13px] text-muted -mt-2 font-semibold tracking-wide uppercase">Upgrade your plan and check current organization usage limits</p>

      {search.get('success') && (
        <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-sm font-semibold flex items-center gap-2">
          <Icon name="check" size={16} /> Subscription updated successfully. Thank you for choosing Vertex Connect!
        </div>
      )}
      {!enabled && (
        <div className="mt-4 p-4 rounded-xl bg-canvas border border-line text-muted text-sm font-medium flex items-center gap-2">
          <Icon name="settings" size={15} className="shrink-0" /> Billing is running in local Sandbox / Test Mode — subscription limits are active but Stripe checkout is simulated.
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
              <p className="text-[11px] font-bold text-muted uppercase tracking-wider">Active Subscription tier</p>
              <p className="text-xl font-extrabold text-ink tracking-tight mt-0.5">{sub.limits.label} Plan</p>
            </div>
            {sub.plan !== 'FREE' && enabled && (
              <button onClick={portal} className="v-btn v-btn-ghost !h-9 text-[12.5px] font-bold shadow-sm">
                Manage billing portal
              </button>
            )}
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {([
              { k: 'cards', label: 'Cards', icon: 'grid' },
              { k: 'members', label: 'Members', icon: 'users' },
              { k: 'nfcTags', label: 'NFC Tags', icon: 'tag' },
            ] as const).map(({ k, label, icon }) => (
              <div key={k} className="p-4 rounded-xl bg-canvas/30 border border-line">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-2 text-[12px] font-bold text-muted uppercase tracking-wider">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-soft text-accent"><Icon name={icon} size={13} /></span>
                    {label}
                  </span>
                  <span className="font-mono text-ink text-[12px] font-bold">
                    {sub.usage[k]} / {sub.limits[k] ?? '∞'}
                  </span>
                </div>
                {usageBar(sub.usage[k], sub.limits[k])}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Plans */}
      <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {ORDER.filter((p) => plans[p]).map((key) => {
          const p = plans[key];
          const current = sub?.plan === key;
          const upgradable = (key === 'PRO' || key === 'BUSINESS') && !current;
          
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
                  <span className="font-extrabold text-[15.5px] text-ink">{p.label}</span>
                  {current && (
                    <span className="rounded-full bg-accent-soft text-accent border border-accent/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                      Active
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-3xl font-black text-ink tracking-tight">
                    {key === 'ENTERPRISE' ? 'Custom' : `$${p.price}`}
                    {key !== 'ENTERPRISE' && <span className="text-[14px] text-muted font-semibold tracking-normal">/mo</span>}
                  </p>
                </div>
                <div className="border-t border-line/60 pt-4">
                  <ul className="grid gap-2.5 text-[13px] text-muted font-medium">
                    <li className="flex items-center gap-2">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Icon name="check" size={11} /></span>
                      <span><span className="font-bold text-ink">{p.cards ?? 'Unlimited'}</span> digital profile cards</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Icon name="check" size={11} /></span>
                      <span><span className="font-bold text-ink">{p.members ?? 'Unlimited'}</span> organization members</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Icon name="check" size={11} /></span>
                      <span><span className="font-bold text-ink">{p.nfcTags ?? 'Unlimited'}</span> programmable tags</span>
                    </li>
                  </ul>
                </div>
              </div>
              
              <div className="mt-6 pt-4 border-t border-line/60">
                {current ? (
                  <span className="block text-center text-sm font-bold text-accent py-2">Current active plan</span>
                ) : upgradable ? (
                  <button
                    onClick={() => upgrade(key)}
                    disabled={!enabled || busy === key}
                    className="v-btn w-full !h-10 text-[13.5px] font-bold shadow-md disabled:opacity-50"
                  >
                    {busy === key ? 'Redirecting…' : enabled ? `Upgrade to ${p.label}` : 'Sandbox — upgrade disabled'}
                  </button>
                ) : key === 'ENTERPRISE' ? (
                  <a href="mailto:sales@vertex.dev" className="v-btn v-btn-ghost w-full !h-10 text-[13.5px] font-bold shadow-sm">
                    Contact corporate sales
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
