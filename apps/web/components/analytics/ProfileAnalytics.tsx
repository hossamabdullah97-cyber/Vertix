'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AreaChart } from '@/components/charts/AreaChart';
import { Panel, EmptyState } from './Shared';

interface ProfileAnalyticsProps {
  overview: any;
  series: any[];
}

const INTERACTIONS = [
  { key: 'VIEW', labelKey: 'metrics.views', color: '#2563eb' },
  { key: 'CLICK', labelKey: 'metrics.clicks', color: '#0ea5e9' },
  { key: 'SAVE', labelKey: 'metrics.saves', color: '#ec4899' },
  { key: 'SHARE', labelKey: 'metrics.shares', color: '#10b981' },
];

export function ProfileAnalytics({ overview, series }: ProfileAnalyticsProps) {
  const { t } = useTranslation('analytics');
  const totals = overview?.totals ?? {};
  const rows = INTERACTIONS.map((i) => ({ ...i, label: t(i.labelKey), value: totals[i.key] ?? 0 }));
  const grand = rows.reduce((a, r) => a + r.value, 0);

  const labels = useMemo(() => series.map((s) => String(s.day).slice(8)), [series]);
  const chartSeries = useMemo(
    () =>
      INTERACTIONS.map((i) => ({
        name: t(i.labelKey),
        color: i.color,
        points: series.map((s) => s[i.key] ?? 0),
      })),
    [series, t],
  );

  return (
    <div className="space-y-6">
      {/* Real interaction totals */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {rows.map((r) => (
          <div key={r.key} className="v-stat">
            <div className="flex items-center justify-between">
              <span className="v-stat-label">{r.label}</span>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
            </div>
            <p className="v-stat-value mt-2 tabular-nums">{r.value.toLocaleString()}</p>
            <p className="mt-1 text-[11px] font-semibold text-faint">
              {grand ? Math.round((r.value / grand) * 100) : 0}{t('profilePerf.pctOfInteractions')}
            </p>
          </div>
        ))}
      </div>

      {/* Real interaction timeline */}
      <Panel title={t('profilePerf.title')} subtitle={t('profilePerf.subtitle')} icon="eye">
        {series.length === 0 ? (
          <EmptyState icon="eye" message={t('profilePerf.empty')} />
        ) : (
          <AreaChart series={chartSeries} labels={labels} />
        )}
      </Panel>
    </div>
  );
}
