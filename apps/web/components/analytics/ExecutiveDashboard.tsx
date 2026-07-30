'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { Sparkline } from '@/components/charts/Sparkline';

interface ExecutiveDashboardProps {
  overview: any;
  series: any[];
  leads: any[];
  tasks: any[];
  top: any[];
  compareMode: boolean;
}

/**
 * Honest period-over-period trend from a real timeseries. Compares the newer
 * half against the older half; returns null when there isn't enough real data
 * to make a claim — no fabricated deltas.
 */
function seriesTrend(seriesData: number[]): string | null {
  if (!seriesData || seriesData.length < 4) return null;
  const mid = Math.floor(seriesData.length / 2);
  const older = seriesData.slice(0, mid).reduce((a, b) => a + b, 0);
  const newer = seriesData.slice(mid).reduce((a, b) => a + b, 0);
  if (older === 0 && newer === 0) return null;
  if (older === 0) return '+100%';
  const pct = ((newer - older) / older) * 100;
  if (!isFinite(pct)) return null;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`;
}

export function ExecutiveDashboard({ overview, series, leads, top }: ExecutiveDashboardProps) {
  const { t } = useTranslation('analytics');
  const totals = overview?.totals ?? {};
  const views = totals.VIEW ?? 0;
  const clicks = totals.CLICK ?? 0;
  const saves = totals.SAVE ?? 0;
  const shares = totals.SHARE ?? 0;
  const scans = totals.NFC_SCAN ?? 0;
  const unique = overview?.uniqueVisitors ?? 0;
  const leadCount = leads.length;

  const viewsSeries = useMemo(() => series.map((s) => s.VIEW ?? 0), [series]);
  const scansSeries = useMemo(() => series.map((s) => s.NFC_SCAN ?? 0), [series]);
  const clicksSeries = useMemo(() => series.map((s) => s.CLICK ?? 0), [series]);
  const savesSeries = useMemo(() => series.map((s) => s.SAVE ?? 0), [series]);

  // Every KPI below is derived from real analytics — no simulated fields.
  const kpis: {
    label: string;
    value: number | string;
    icon: string;
    color: string;
    spark?: number[];
    trend?: string | null;
  }[] = [
    { label: t('metrics.views', 'Profile Views'), value: views, icon: 'eye', color: '#2563eb', spark: viewsSeries, trend: seriesTrend(viewsSeries) },
    { label: t('metrics.unique', 'Unique Visitors'), value: unique, icon: 'users', color: '#10b981' },
    { label: t('metrics.scans', 'NFC & QR Scans'), value: scans, icon: 'zap', color: '#4f46e5', spark: scansSeries, trend: seriesTrend(scansSeries) },
    { label: t('metrics.clicks', 'Link Clicks'), value: clicks, icon: 'chart-bar', color: '#0ea5e9', spark: clicksSeries, trend: seriesTrend(clicksSeries) },
    { label: t('metrics.saves', 'Contact Saves'), value: saves, icon: 'check-circle', color: '#ec4899', spark: savesSeries, trend: seriesTrend(savesSeries) },
    { label: t('metrics.leads', 'Generated Leads'), value: leadCount, icon: 'briefcase', color: '#f59e0b' },
  ];

  // Real interaction mix across channels (percentages of actual totals).
  const channels = [
    { label: t('metrics.views', 'Profile Views'), value: views, color: '#2563eb' },
    { label: t('metrics.clicks', 'Link Clicks'), value: clicks, color: '#0ea5e9' },
    { label: t('metrics.saves', 'Contact Saves'), value: saves, color: '#ec4899' },
    { label: t('metrics.shares', 'Shares'), value: shares, color: '#10b981' },
    { label: t('metrics.scans', 'NFC & QR Scans'), value: scans, color: '#4f46e5' },
  ];
  const channelTotal = channels.reduce((a, c) => a + c.value, 0);

  const topCards = Array.isArray(top) ? top : [];
  const maxEvents = Math.max(...topCards.map((c) => c.events ?? 0), 1);

  return (
    <div className="space-y-6">
      {/* KPI grid — real analytics only */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((kpi, idx) => {
          const hasSpark = Array.isArray(kpi.spark) && kpi.spark.filter((n) => n > 0).length > 1;
          const trendDown = kpi.trend ? kpi.trend.startsWith('-') : false;
          return (
            <div key={idx} className="v-stat group">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-[10px]"
                    style={{ background: `${kpi.color}1a`, color: kpi.color }}
                  >
                    <Icon name={kpi.icon} size={15} />
                  </span>
                  <span className="v-stat-label">{kpi.label}</span>
                </span>
                {kpi.trend && (
                  <span className={`v-badge ${trendDown ? 'v-badge-danger' : 'v-badge-success'} !py-0`}>
                    {trendDown ? '▾' : '▴'} {kpi.trend}
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <p className="v-stat-value tabular-nums">{kpi.value}</p>
                {hasSpark && (
                  <div className="h-[30px] w-[80px] shrink-0 overflow-hidden">
                    <Sparkline data={kpi.spark!} color={kpi.color} width={80} height={28} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Real panels: top cards + channel mix */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Top performing cards — from /analytics/top-cards */}
        <section className="v-card p-6 lg:col-span-3">
          <div className="mb-5 flex items-center gap-3">
            <span className="v-icon-tile"><Icon name="columns" size={16} /></span>
            <div>
              <h3 className="text-[15px] font-extrabold tracking-tight text-ink">{t('sections.topCards', 'Top Performing Cards')}</h3>
              <p className="text-[11.5px] font-medium text-muted">{t('sections.topCardsSub', 'Ranked by total tracked interactions')}</p>
            </div>
          </div>

          {topCards.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-12 text-center">
              <Icon name="columns" size={22} className="text-faint" />
              <p className="text-xs font-semibold text-muted">{t('exec.noInteractions')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topCards.map((c, idx) => (
                <div key={c.cardId ?? idx} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-[10px] font-bold text-accent">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-[12.5px] font-bold text-ink">/c/{c.slug}</span>
                      <span className="shrink-0 text-[11.5px] font-bold text-muted tabular-nums">{c.events} {t('exec.events')}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-canvas">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${((c.events ?? 0) / maxEvents) * 100}%`, background: 'var(--v-gradient-brand)' }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Channel mix — real proportions of actual interaction totals */}
        <section className="v-card flex flex-col p-6 lg:col-span-2">
          <div className="mb-5 flex items-center gap-3">
            <span className="v-icon-tile"><Icon name="chart-bar" size={16} /></span>
            <div>
              <h3 className="text-[15px] font-extrabold tracking-tight text-ink">{t('sections.interactionMix', 'Interaction Mix')}</h3>
              <p className="text-[11.5px] font-medium text-muted">{t('sections.interactionMixSub', 'Share of total tracked events')}</p>
            </div>
          </div>

          {channelTotal === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-line py-10 text-center">
              <p className="text-xs font-semibold text-muted">{t('exec.noEvents')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {channels.map((ch) => {
                const pct = Math.round((ch.value / channelTotal) * 100);
                return (
                  <div key={ch.label}>
                    <div className="mb-1 flex items-center justify-between text-[12px] font-bold">
                      <span className="flex items-center gap-1.5 text-muted">
                        <span className="h-2 w-2 rounded-full" style={{ background: ch.color }} />
                        {ch.label}
                      </span>
                      <span className="text-ink tabular-nums">{pct}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: ch.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-5 border-t border-line pt-4 text-[11.5px] font-semibold text-muted">
            <span className="flex items-center justify-between">
              <span>{t('exec.totalEvents')}</span>
              <span className="text-ink tabular-nums">{channelTotal.toLocaleString()}</span>
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
