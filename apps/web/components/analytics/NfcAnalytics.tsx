'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { AreaChart } from '@/components/charts/AreaChart';
import { Panel, EmptyState } from './Shared';
import {
  authFetch,
  type MemberPerformance,
  type TagPerformance,
} from '@/lib/client';

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

  // Per-chip and per-member standings come from their own endpoints: the
  // timeseries this component is handed is aggregated over the whole workspace,
  // so it cannot say which chip or which member produced any of it.
  const [tagRows, setTagRows] = useState<TagPerformance[] | null>(null);
  const [memberRows, setMemberRows] = useState<MemberPerformance[] | null>(null);

  useEffect(() => {
    Promise.all([
      authFetch<TagPerformance[]>('/analytics/nfc-tags'),
      authFetch<MemberPerformance[]>('/analytics/members'),
    ])
      .then(([tags, members]) => {
        setTagRows(tags);
        setMemberRows(members);
      })
      .catch(() => {
        setTagRows([]);
        setMemberRows([]);
      });
  }, []);

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

      {/* Who is carrying what, and what it produced. Visitors are distinct
          people, not taps: a chip tapped twenty times by its owner reached one
          person. */}
      <Panel
        title={t('tagPerf.title', 'Per-chip performance')}
        subtitle={t('tagPerf.subtitle', 'Taps, people reached, and clients produced by each piece of hardware')}
        icon="tag"
      >
        {tagRows === null ? (
          <div className="v-skeleton h-24 rounded-xl" />
        ) : tagRows.length === 0 ? (
          <EmptyState icon="tag" message={t('tagPerf.empty', 'No chip has been tapped in this period yet.')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-start text-[12px]">
              <thead>
                <tr className="border-b border-line text-[10px] font-extrabold uppercase tracking-wider text-muted">
                  <th className="p-3 text-start">{t('tagPerf.chip', 'Chip')}</th>
                  <th className="p-3 text-start">{t('tagPerf.holder', 'Holder')}</th>
                  <th className="p-3 text-start">{t('tagPerf.taps', 'Taps')}</th>
                  <th className="p-3 text-start">{t('tagPerf.visitors', 'People reached')}</th>
                  <th className="p-3 text-start">{t('tagPerf.leads', 'Clients')}</th>
                </tr>
              </thead>
              <tbody>
                {tagRows.map((row) => (
                  <tr key={row.tagId} className="border-b border-line">
                    <td className="p-3 font-mono text-ink" dir="ltr">{row.uid}</td>
                    <td className="p-3 text-muted">
                      {row.holder ? row.holder.name || row.holder.email : '—'}
                    </td>
                    <td className="p-3 font-bold text-ink tabular-nums">{row.scans}</td>
                    <td className="p-3 font-bold text-ink tabular-nums">{row.visitors}</td>
                    <td className="p-3 font-bold text-accent tabular-nums">{row.leads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Ordered by clients won, then clients, then people reached - a chip that
          is tapped constantly but closes nothing should not lead the table. */}
      <Panel
        title={t('memberPerf.title', 'Team standings')}
        subtitle={t('memberPerf.subtitle', 'Counted through the chip each member carries')}
        icon="users"
      >
        {memberRows === null ? (
          <div className="v-skeleton h-24 rounded-xl" />
        ) : memberRows.length === 0 ? (
          <EmptyState
            icon="users"
            message={t('memberPerf.empty', 'No chip has been given to a member yet, so there is nothing to rank.')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-start text-[12px]">
              <thead>
                <tr className="border-b border-line text-[10px] font-extrabold uppercase tracking-wider text-muted">
                  <th className="p-3 text-start">{t('memberPerf.member', 'Member')}</th>
                  <th className="p-3 text-start">{t('memberPerf.chips', 'Chips')}</th>
                  <th className="p-3 text-start">{t('tagPerf.taps', 'Taps')}</th>
                  <th className="p-3 text-start">{t('tagPerf.visitors', 'People reached')}</th>
                  <th className="p-3 text-start">{t('tagPerf.leads', 'Clients')}</th>
                  <th className="p-3 text-start">{t('memberPerf.won', 'Won')}</th>
                </tr>
              </thead>
              <tbody>
                {memberRows.map((row) => (
                  <tr key={row.user.id} className="border-b border-line">
                    <td className="p-3 font-semibold text-ink">
                      {row.user.name || row.user.email}
                    </td>
                    <td className="p-3 text-muted tabular-nums">{row.tags}</td>
                    <td className="p-3 text-ink tabular-nums">{row.scans}</td>
                    <td className="p-3 text-ink tabular-nums">{row.visitors}</td>
                    <td className="p-3 font-bold text-accent tabular-nums">{row.leads}</td>
                    <td className="p-3 font-bold text-emerald-600 tabular-nums">{row.wonLeads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
