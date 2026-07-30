'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatDate } from '@/lib/format';
import { type Lead, type Stage, wonStage, lostStage, formatMoney } from '@/lib/crm';

export function ReportsView({ leads, stages }: { leads: Lead[]; stages: Stage[] }) {
  const { t } = useTranslation('crm');
  const { locale } = useLocale();
  const a = useMemo(() => {
    const total = leads.length;
    const wonId = wonStage(stages)?.id;
    const lostId = lostStage(stages)?.id;
    const firstId = stages[0]?.id;

    const won = wonId ? leads.filter((l) => l.stageId === wonId).length : 0;
    const openLeads = leads.filter((l) => l.stageId !== wonId && l.stageId !== lostId);
    const pipelineValue = openLeads.reduce((s, l) => s + l.value, 0);
    const conv = total ? Math.round((won / total) * 100) : 0;
    const withValue = leads.filter((l) => l.value > 0).length;
    const avgDeal = withValue ? Math.round(leads.reduce((s, l) => s + l.value, 0) / withValue) : 0;

    // Real per-stage funnel.
    const funnel = stages.map((s) => {
      const items = leads.filter((l) => (l.stageId ?? firstId) === s.id);
      return { stage: s.name, count: items.length, value: items.reduce((sum, l) => sum + l.value, 0), color: s.color || 'var(--v-accent)' };
    });

    // Real monthly lead counts from createdAt (last 6 months). Month labels are
    // locale-aware (short month name in the active language).
    const now = new Date();
    const growth = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const y = d.getFullYear();
      const mo = d.getMonth();
      const count = leads.filter((l) => {
        const c = new Date(l.createdAt);
        return c.getFullYear() === y && c.getMonth() === mo;
      }).length;
      return { label: formatDate(d, locale, { month: 'short' }), count };
    });

    // Real source breakdown.
    const srcMap: Record<string, number> = {};
    leads.forEach((l) => { const s = l.source || 'Direct'; srcMap[s] = (srcMap[s] || 0) + 1; });
    const sources = Object.entries(srcMap)
      .map(([source, count]) => ({ source, count, percentage: total ? Math.round((count / total) * 100) : 0 }))
      .sort((x, y) => y.count - x.count);

    return { total, won, pipelineValue, conv, avgDeal, funnel, growth, sources };
  }, [leads, stages, locale]);

  const maxGrowth = Math.max(1, ...a.growth.map((g) => g.count));
  const maxFunnel = Math.max(1, ...a.funnel.map((f) => f.count));

  return (
    <div className="space-y-6">
      <div className="border-b border-line pb-4">
        <h2 className="text-[16px] font-extrabold tracking-tight text-ink">{t('reports.title')}</h2>
        <p className="text-[12.5px] text-muted">{t('reports.subtitle')}</p>
      </div>

      {/* Real KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="v-stat"><span className="v-stat-label">{t('reports.totalLeads')}</span><p className="v-stat-value mt-2 tabular-nums">{a.total}</p></div>
        <div className="v-stat"><span className="v-stat-label">{t('reports.pipelineValue')}</span><p className="v-stat-value mt-2 truncate tabular-nums">{formatMoney(a.pipelineValue)}</p></div>
        <div className="v-stat"><span className="v-stat-label">{t('reports.wonDeals')}</span><p className="v-stat-value mt-2 tabular-nums">{a.won}</p></div>
        <div className="v-stat"><span className="v-stat-label">{t('reports.conversion')}</span><p className="v-stat-value mt-2 tabular-nums">{a.conv}%</p></div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Real monthly growth */}
        <div className="v-card p-5">
          <h3 className="mb-4 flex items-center gap-2.5 text-[14px] font-extrabold tracking-tight text-ink">
            <span className="v-icon-tile !h-8 !w-8"><Icon name="chart-bar" size={15} /></span> {t('reports.growth6m')}
          </h3>
          <div className="flex h-44 items-end justify-between gap-4 pt-2">
            {a.growth.map((g, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-[10px] font-bold tabular-nums text-muted">{g.count || ''}</span>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${(g.count / maxGrowth) * 100}%` }}
                  className="w-full rounded-t-md"
                  style={{ minHeight: 4, background: g.count ? 'var(--v-gradient-brand)' : 'hsl(var(--v-border))' }}
                />
                <span className="text-[10.5px] font-semibold text-faint">{g.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Real funnel */}
        <div className="v-card p-5">
          <h3 className="mb-4 flex items-center gap-2.5 text-[14px] font-extrabold tracking-tight text-ink">
            <span className="v-icon-tile !h-8 !w-8"><Icon name="gauge" size={15} /></span> {t('reports.funnel')}
          </h3>
          <div className="space-y-3">
            {a.funnel.map((f, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-[11.5px] font-bold">
                  <span className="text-ink">{f.stage}</span>
                  <span className="text-muted">{f.count} · {formatMoney(f.value)}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-canvas">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(f.count / maxFunnel) * 100}%` }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: f.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Real source performance */}
      <div className="v-card p-5">
        <h3 className="mb-4 flex items-center gap-2.5 text-[14px] font-extrabold tracking-tight text-ink">
          <span className="v-icon-tile !h-8 !w-8"><Icon name="tag" size={15} /></span> {t('reports.sourcePerformance')}
        </h3>
        {a.sources.length === 0 ? (
          <p className="py-6 text-center text-xs font-semibold text-muted">{t('reports.noSources')}</p>
        ) : (
          <div className="grid gap-x-8 gap-y-3.5 sm:grid-cols-2">
            {a.sources.map((s) => (
              <div key={s.source} className="space-y-1">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="font-semibold capitalize text-ink">{s.source.replace(/_/g, ' ')}</span>
                  <span className="font-bold text-muted">{s.count} · {s.percentage}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-canvas">
                  <div className="h-full rounded-full" style={{ width: `${s.percentage}%`, background: 'var(--v-gradient-brand)' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
