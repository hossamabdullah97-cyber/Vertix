'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { AreaChart } from '@/components/charts/AreaChart';
import { Panel, EmptyState } from './Shared';

interface NfcAnalyticsProps {
  series: any[];
  overview: any;
}

export function NfcAnalytics({ series, overview }: NfcAnalyticsProps) {
  const { t } = useTranslation('analytics');
  const totalScans = overview?.totals?.NFC_SCAN ?? 0;
  const points = useMemo(() => series.map((s) => s.NFC_SCAN ?? 0), [series]);
  const labels = useMemo(() => series.map((s) => String(s.day).slice(8)), [series]);
  const activeDays = points.filter((p) => p > 0).length;
  const peak = points.length ? Math.max(...points) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="v-stat">
          <span className="v-stat-label">{t('nfcPerf.totalScans')}</span>
          <p className="v-stat-value mt-2 tabular-nums">{totalScans.toLocaleString()}</p>
        </div>
        <div className="v-stat">
          <span className="v-stat-label">{t('nfcPerf.activeDays')}</span>
          <p className="v-stat-value mt-2 tabular-nums">{activeDays}</p>
        </div>
        <div className="v-stat">
          <span className="v-stat-label">{t('nfcPerf.peakDay')}</span>
          <p className="v-stat-value mt-2 tabular-nums">{peak}</p>
        </div>
      </div>

      <Panel title={t('nfcPerf.title')} subtitle={t('nfcPerf.subtitle')} icon="zap">
        {totalScans === 0 ? (
          <EmptyState icon="zap" message={t('nfcPerf.empty')} />
        ) : (
          <AreaChart series={[{ name: t('nfcPerf.scans'), color: '#4f46e5', points }]} labels={labels} />
        )}
      </Panel>

      <div className="flex items-start gap-3 rounded-xl border border-line bg-elevated/50 p-4">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Icon name="sparkle" size={14} />
        </span>
        <p className="text-[12px] font-medium leading-relaxed text-muted">
          {t('nfcPerf.note')}
        </p>
      </div>
    </div>
  );
}
