'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { formatMoney } from '@/lib/crm';
import { EmptyState } from './Shared';

interface AiInsightsProps {
  overview: any;
  leads: any[];
  series: any[];
}

type Signal = { tone: 'good' | 'warn' | 'info'; tag: string; text: string };

function trend(seriesData: number[]): number | null {
  if (!seriesData || seriesData.length < 4) return null;
  const mid = Math.floor(seriesData.length / 2);
  const older = seriesData.slice(0, mid).reduce((a, b) => a + b, 0);
  const newer = seriesData.slice(mid).reduce((a, b) => a + b, 0);
  if (older === 0) return newer > 0 ? 100 : null;
  return Math.round(((newer - older) / older) * 100);
}

/**
 * Rule-based signals derived directly from real analytics — not an ML model and
 * not fabricated advice. Every statement below is a literal fact about the
 * workspace's own tracked data.
 */
export function AiInsights({ overview, leads, series }: AiInsightsProps) {
  const { t } = useTranslation('analytics');
  const signals = useMemo<Signal[]>(() => {
    const out: Signal[] = [];
    const totals = overview?.totals ?? {};
    const views = totals.VIEW ?? 0;
    const clicks = totals.CLICK ?? 0;
    const saves = totals.SAVE ?? 0;
    const scans = totals.NFC_SCAN ?? 0;
    const grand = views + clicks + saves + (totals.SHARE ?? 0) + scans;
    const leadCount = leads.length;
    const hot = leads.filter((l) => l.temperature === 'HOT').length;
    const value = leads.reduce((s, l) => s + (l.value ?? 0), 0);

    if (grand === 0 && leadCount === 0) return out;

    const viewsTrend = trend(series.map((s) => s.VIEW ?? 0));
    if (viewsTrend !== null) {
      out.push({
        tone: viewsTrend >= 0 ? 'good' : 'warn',
        tag: t('ai.tags.trend'),
        text: t(viewsTrend >= 0 ? 'ai.viewsUp' : 'ai.viewsDown', { pct: Math.abs(viewsTrend) }),
      });
    }

    if (views > 0) {
      const ctr = ((clicks / views) * 100).toFixed(1);
      out.push({
        tone: clicks > 0 ? 'info' : 'warn',
        tag: t('ai.tags.engagement'),
        text: t('ai.ctr', { ctr, clicks, views }),
      });
      const saveRate = ((saves / views) * 100).toFixed(1);
      out.push({
        tone: saves > 0 ? 'good' : 'info',
        tag: t('ai.tags.conversion'),
        text: t('ai.saveRate', { rate: saveRate, saves, views }),
      });
    }

    if (grand > 0) {
      const scanShare = Math.round((scans / grand) * 100);
      out.push({
        tone: 'info',
        tag: t('ai.tags.channels'),
        text: scans > 0 ? t('ai.scanShare', { share: scanShare }) : t('ai.noScans'),
      });
    }

    if (leadCount > 0) {
      out.push({
        tone: hot > 0 ? 'good' : 'info',
        tag: t('ai.tags.pipeline'),
        text: t('ai.pipeline', { hot, total: leadCount, pct: Math.round((hot / leadCount) * 100), value: formatMoney(value) }),
      });
    }

    return out;
  }, [overview, leads, series, t]);

  const toneStyle: Record<Signal['tone'], { bg: string; color: string; icon: string }> = {
    good: { bg: 'rgba(16,185,129,0.1)', color: '#10b981', icon: 'check' },
    warn: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', icon: 'zap' },
    info: { bg: 'var(--v-accent-soft)', color: 'var(--v-accent)', icon: 'sparkle' },
  };

  return (
    <div className="space-y-6">
      <div className="v-hero p-6">
        <div className="relative z-10">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/90">
            {t('ai.badge')}
          </span>
          <h3 className="mt-2 v-display text-[20px] font-extrabold tracking-tight text-white">{t('ai.title')}</h3>
          <p className="mt-1 max-w-xl text-[12.5px] font-medium text-white/80">
            {t('ai.subtitle')}
          </p>
        </div>
      </div>

      {signals.length === 0 ? (
        <EmptyState icon="sparkle" message={t('ai.empty')} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {signals.map((s, i) => {
            const st = toneStyle[s.tone];
            return (
              <div key={i} className="v-card flex items-start gap-3 p-5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: st.bg, color: st.color }}>
                  <Icon name={st.icon} size={15} />
                </span>
                <div>
                  <span className="v-section-label">{s.tag}</span>
                  <p className="mt-1 text-[13px] font-semibold leading-relaxed text-ink">{s.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
