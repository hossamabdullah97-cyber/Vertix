'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FunnelChart } from '@/components/charts/FunnelChart';
import { formatMoney } from '@/lib/crm';
import { Panel, EmptyState } from './Shared';

interface LeadAnalyticsProps {
  leads: any[];
  overview: any;
}

const TEMP_COLOR: Record<string, string> = { HOT: '#ef4444', WARM: '#f59e0b', COLD: '#0ea5e9' };

export function LeadAnalytics({ leads, overview }: LeadAnalyticsProps) {
  const { t } = useTranslation('analytics');
  const m = useMemo(() => {
    const totals = overview?.totals ?? {};
    const total = leads.length;
    const hot = leads.filter((l) => l.temperature === 'HOT').length;
    const value = leads.reduce((sum, l) => sum + (l.value ?? 0), 0);
    const meetings = leads.filter((l) => l.intent === 'MEETING').length;

    // Real funnel — event totals down to booked meetings, no invented multipliers.
    const stages = [
      { name: t('leadFunnel.stages.views'), count: totals.VIEW ?? 0, label: t('leadFunnel.stageLabels.traffic') },
      { name: t('leadFunnel.stages.clicks'), count: totals.CLICK ?? 0, label: t('leadFunnel.stageLabels.engagement') },
      { name: t('leadFunnel.stages.saves'), count: totals.SAVE ?? 0, label: t('leadFunnel.stageLabels.interest') },
      { name: t('leadFunnel.stages.leads'), count: total, label: t('leadFunnel.stageLabels.prospects') },
      { name: t('leadFunnel.stages.meetings'), count: meetings, label: t('leadFunnel.stageLabels.meetings') },
    ];

    // Real temperature split.
    const byTemp = ['HOT', 'WARM', 'COLD'].map((tp) => ({
      key: tp,
      label: t(`leadFunnel.temp.${tp.toLowerCase()}`),
      color: TEMP_COLOR[tp],
      count: leads.filter((l) => l.temperature === tp).length,
    }));

    // Real source split.
    const sourceMap = new Map<string, number>();
    for (const l of leads) {
      const s = (l.source || 'Direct') as string;
      sourceMap.set(s, (sourceMap.get(s) ?? 0) + 1);
    }
    const bySource = [...sourceMap.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return { total, hot, value, meetings, stages, byTemp, bySource };
  }, [leads, overview, t]);

  return (
    <div className="space-y-6">
      {/* Real KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="v-stat">
          <span className="v-stat-label">{t('leadFunnel.totalLeads')}</span>
          <p className="v-stat-value mt-2">{m.total}</p>
        </div>
        <div className="v-stat">
          <span className="v-stat-label">{t('leadFunnel.hotLeads')}</span>
          <p className="v-stat-value mt-2">{m.hot}</p>
        </div>
        <div className="v-stat">
          <span className="v-stat-label">{t('leadFunnel.pipelineValue')}</span>
          <p className="v-stat-value mt-2 truncate">{formatMoney(m.value)}</p>
        </div>
        <div className="v-stat">
          <span className="v-stat-label">{t('leadFunnel.meetingsBooked')}</span>
          <p className="v-stat-value mt-2">{m.meetings}</p>
        </div>
      </div>

      {/* Real conversion funnel */}
      <Panel title={t('leadFunnel.funnelTitle')} subtitle={t('leadFunnel.funnelSubtitle')} icon="briefcase">
        {m.total === 0 && (m.stages[0].count ?? 0) === 0 ? (
          <EmptyState icon="briefcase" message={t('leadFunnel.funnelEmpty')} />
        ) : (
          <FunnelChart stages={m.stages} />
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Real temperature breakdown */}
        <Panel title={t('leadFunnel.tempTitle')} subtitle={t('leadFunnel.tempSubtitle')} icon="zap">
          {m.total === 0 ? (
            <EmptyState icon="zap" message={t('leadFunnel.tempEmpty')} />
          ) : (
            <div className="space-y-4">
              {m.byTemp.map((tp) => {
                const pct = m.total ? Math.round((tp.count / m.total) * 100) : 0;
                return (
                  <div key={tp.key}>
                    <div className="mb-1 flex items-center justify-between text-[12px] font-bold">
                      <span className="flex items-center gap-1.5 text-muted">
                        <span className="h-2 w-2 rounded-full" style={{ background: tp.color }} />
                        {tp.label}
                      </span>
                      <span className="text-ink tabular-nums">{tp.count} · {pct}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tp.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {/* Real source breakdown */}
        <Panel title={t('leadFunnel.sourcesTitle')} subtitle={t('leadFunnel.sourcesSubtitle')} icon="globe">
          {m.bySource.length === 0 ? (
            <EmptyState icon="globe" message={t('leadFunnel.sourcesEmpty')} />
          ) : (
            <div className="space-y-3">
              {m.bySource.map((s) => {
                const max = Math.max(...m.bySource.map((x) => x.count), 1);
                return (
                  <div key={s.label} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-ink">{s.label}</span>
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-canvas">
                      <div className="h-full rounded-full" style={{ width: `${(s.count / max) * 100}%`, background: 'var(--v-gradient-brand)' }} />
                    </div>
                    <span className="w-8 shrink-0 text-end text-[11.5px] font-semibold text-muted tabular-nums">{s.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
