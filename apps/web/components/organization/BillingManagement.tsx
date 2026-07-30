'use client';

import { Icon } from '@/components/Icon';

interface PlanDef {
  label: string;
  price: number;
  cards: number | null;
  members: number | null;
  nfcTags: number | null;
}

export interface UsageSummary {
  plan: string;
  limits: PlanDef;
  usage: { cards: number; members: number; nfcTags: number };
  status: string;
}

interface BillingProps {
  usage: UsageSummary | null;
  plans: Record<string, PlanDef> | null;
  billingEnabled: boolean;
  canManage: boolean;
  onUpgrade: (plan: 'PRO' | 'BUSINESS') => void;
}

const ORDER = ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'];

function Meter({ label, used, limit, icon }: { label: string; used: number; limit: number | null; icon: string }) {
  const unlimited = limit === null;
  const pct = unlimited ? 6 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const near = !unlimited && pct >= 80;
  return (
    <div className="p-4 bg-canvas/30 border border-line rounded-xl space-y-2">
      <div className="flex items-center gap-1.5 text-muted">
        <Icon name={icon} size={13} />
        <p className="text-[10px] font-bold uppercase tracking-wider">{label}</p>
      </div>
      <h4 className="text-[17px] font-black text-ink tabular-nums">
        {used} <span className="text-[12px] font-bold text-muted">/ {unlimited ? '∞' : limit}</span>
      </h4>
      <div className="h-1.5 w-full bg-canvas rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: near ? '#f43f5e' : 'var(--v-accent)' }} />
      </div>
    </div>
  );
}

export function BillingManagement({ usage, plans, billingEnabled, canManage, onUpgrade }: BillingProps) {
  const current = usage?.plan ?? 'FREE';
  const currentDef = usage?.limits;
  const planList = plans ? ORDER.filter((p) => plans[p]).map((p) => ({ key: p, ...plans[p] })) : [];

  return (
    <div className="grid lg:grid-cols-5 gap-6">
      {/* Current plan + real usage */}
      <div className="lg:col-span-3 v-card p-5 bg-surface border border-line rounded-2xl shadow-sm flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-5">
          <div>
            <h3 className="text-[14.5px] font-bold text-ink tracking-tight">Billing Overview</h3>
            <p className="text-[11.5px] text-muted">Your plan and real-time usage against its limits</p>
          </div>
          <span className="v-chip !px-2.5 !py-1 !text-[10.5px] font-bold text-blue-600 bg-blue-600/10 border-blue-600/20">
            {currentDef?.label ?? current} · {currentDef?.price ? `$${currentDef.price}/mo` : 'Free'}
          </span>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <Meter label="Members" used={usage?.usage.members ?? 0} limit={currentDef?.members ?? null} icon="users" />
          <Meter label="Cards" used={usage?.usage.cards ?? 0} limit={currentDef?.cards ?? null} icon="columns" />
          <Meter label="NFC Devices" used={usage?.usage.nfcTags ?? 0} limit={currentDef?.nfcTags ?? null} icon="sparkle" />
        </div>

        <div className="mt-auto pt-4 flex items-center gap-2 text-[11px] font-semibold text-muted">
          <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 ${usage?.status === 'ACTIVE' ? 'text-emerald-500 bg-emerald-500/10' : 'text-muted bg-canvas'}`}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: usage?.status === 'ACTIVE' ? '#10b981' : '#94a3b8' }} />
            Subscription: {usage?.status ?? 'NONE'}
          </span>
          {!billingEnabled && <span className="text-faint">· Online checkout is not configured on this instance.</span>}
        </div>
      </div>

      {/* Plans comparison */}
      <div className="lg:col-span-2 v-card p-5 bg-surface border border-line rounded-2xl shadow-sm">
        <h3 className="text-[14.5px] font-bold text-ink tracking-tight mb-3">Plans</h3>
        <div className="space-y-2.5">
          {planList.map((p) => {
            const isCurrent = p.key === current;
            const upgradable = (p.key === 'PRO' || p.key === 'BUSINESS') && !isCurrent && ORDER.indexOf(p.key) > ORDER.indexOf(current);
            return (
              <div key={p.key} className={`rounded-xl border p-3 ${isCurrent ? 'border-blue-600/40 bg-blue-600/5' : 'border-line bg-canvas/20'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[13px] font-bold text-ink">{p.label}</span>
                    <span className="text-[11px] font-semibold text-muted"> · {p.price ? `$${p.price}/mo` : p.key === 'ENTERPRISE' ? 'Custom' : 'Free'}</span>
                  </div>
                  {isCurrent ? (
                    <span className="v-chip !px-2 !py-0.5 !text-[9.5px] font-bold text-blue-600 bg-blue-600/10 border-blue-600/20">Current</span>
                  ) : upgradable && canManage && billingEnabled ? (
                    <button onClick={() => onUpgrade(p.key as 'PRO' | 'BUSINESS')} className="v-btn !h-7 px-3 text-[11px] font-bold">Upgrade</button>
                  ) : p.key === 'ENTERPRISE' && !isCurrent ? (
                    <span className="text-[10.5px] font-bold text-muted">Contact sales</span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] font-semibold text-muted">
                  <span>{p.members ?? '∞'} members</span>
                  <span>·</span>
                  <span>{p.cards ?? '∞'} cards</span>
                  <span>·</span>
                  <span>{p.nfcTags ?? '∞'} NFC</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
