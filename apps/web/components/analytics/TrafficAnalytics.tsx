'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DonutChart } from '@/components/charts/DonutChart';
import { Panel, EmptyState } from './Shared';

interface TrafficAnalyticsProps {
  refs: any[];
}

const COLORS = ['#2563eb', '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#94a3b8'];

export function TrafficAnalytics({ refs }: TrafficAnalyticsProps) {
  const { t } = useTranslation('analytics');
  const data = useMemo(
    () =>
      (refs ?? []).map((r, i) => ({
        label: r.referrer && r.referrer !== 'direct' ? r.referrer : t('traffic.directNfc'),
        value: r.events ?? 0,
        color: COLORS[i % COLORS.length],
      })),
    [refs, t],
  );

  const total = data.reduce((a, d) => a + d.value, 0);

  return (
    <div className="space-y-6">
      <Panel
        title={t('traffic.title')}
        subtitle={t('traffic.subtitle')}
        icon="globe"
      >
        {data.length === 0 || total === 0 ? (
          <EmptyState icon="globe" message={t('traffic.empty')} />
        ) : (
          <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
            <div className="flex justify-center py-2">
              <DonutChart data={data} size={150} />
            </div>
            <div className="space-y-2">
              {data.map((d) => {
                const pct = total ? Math.round((d.value / total) * 100) : 0;
                return (
                  <div key={d.label} className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-ink">{d.label}</span>
                    <span className="shrink-0 text-[11.5px] font-semibold text-muted tabular-nums">
                      {d.value.toLocaleString()} · {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
