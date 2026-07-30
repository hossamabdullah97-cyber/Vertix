'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel, EmptyState } from './Shared';

interface CardAnalyticsProps {
  top: any[];
  overview: any;
}

export function CardAnalytics({ top, overview }: CardAnalyticsProps) {
  const { t } = useTranslation('analytics');
  const totals = overview?.totals ?? {};
  const views = totals.VIEW ?? 0;
  const clicks = totals.CLICK ?? 0;
  const saves = totals.SAVE ?? 0;
  const ctr = views ? ((clicks / views) * 100).toFixed(1) : '0.0';
  const saveRate = views ? ((saves / views) * 100).toFixed(1) : '0.0';

  const cards = Array.isArray(top) ? top : [];
  const totalEvents = useMemo(() => cards.reduce((a, c) => a + (c.events ?? 0), 0), [cards]);

  return (
    <div className="space-y-6">
      {/* Real workspace-level rates */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="v-stat">
          <span className="v-stat-label">{t('cardPerf.totalViews')}</span>
          <p className="v-stat-value mt-2 tabular-nums">{views.toLocaleString()}</p>
        </div>
        <div className="v-stat">
          <span className="v-stat-label">{t('cardPerf.ctr')}</span>
          <p className="v-stat-value mt-2 tabular-nums">{ctr}%</p>
        </div>
        <div className="v-stat">
          <span className="v-stat-label">{t('cardPerf.saveRate')}</span>
          <p className="v-stat-value mt-2 tabular-nums">{saveRate}%</p>
        </div>
        <div className="v-stat">
          <span className="v-stat-label">{t('cardPerf.rankedCards')}</span>
          <p className="v-stat-value mt-2 tabular-nums">{cards.length}</p>
        </div>
      </div>

      {/* Real per-card ranking from /analytics/top-cards */}
      <Panel title={t('cardPerf.title')} subtitle={t('cardPerf.subtitle')} icon="columns">
        {cards.length === 0 ? (
          <EmptyState icon="columns" message={t('cardPerf.empty')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="v-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('cardPerf.thCard')}</th>
                  <th>{t('cardPerf.thEvents')}</th>
                  <th>{t('cardPerf.thShare')}</th>
                  <th>{t('cardPerf.thDistribution')}</th>
                </tr>
              </thead>
              <tbody>
                {cards.map((c, idx) => {
                  const pct = totalEvents ? Math.round(((c.events ?? 0) / totalEvents) * 100) : 0;
                  return (
                    <tr key={c.cardId ?? idx}>
                      <td className="font-bold text-muted tabular-nums">{idx + 1}</td>
                      <td className="font-mono text-[12px] font-bold text-ink">/c/{c.slug}</td>
                      <td className="tabular-nums font-semibold">{(c.events ?? 0).toLocaleString()}</td>
                      <td className="tabular-nums text-muted">{pct}%</td>
                      <td>
                        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-canvas">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--v-gradient-brand)' }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
