'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { formatMoney, sourceMeta, stageKey, type Lead, type Stage } from '@/lib/crm';
import { shareOf } from '@/lib/analytics';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatNumber } from '@/lib/format';
import { BarList, PanelEmpty, PanelHeader } from './parts';

type PipelineStage = Stage & { isWon?: boolean; isLost?: boolean };

/** Leads that arrived in the period: where they are now and where they came from. */
export function LeadsView({ leads, stages }: { leads: Lead[] | null; stages: PipelineStage[] }) {
  const { t } = useTranslation('analytics');
  const { locale } = useLocale();
  const fmt = (n: number) => formatNumber(n, locale);

  if (leads === null) return <div className="v-skeleton h-64 w-full rounded-xl" />;

  if (leads.length === 0) {
    return (
      <section className="v-card">
        <PanelHeader title={t('leads.title')} />
        <PanelEmpty action={<Link href="/leads" className="v-btn v-btn-ghost">{t('leads.open')}</Link>}>{t('leads.empty')}</PanelEmpty>
      </section>
    );
  }

  const wonIds = new Set(stages.filter((s) => s.isWon).map((s) => s.id));
  const lostIds = new Set(stages.filter((s) => s.isLost).map((s) => s.id));
  const won = leads.filter((l) => l.stageId && wonIds.has(l.stageId));
  const open = leads.filter((l) => !l.stageId || (!wonIds.has(l.stageId) && !lostIds.has(l.stageId)));
  const wonValue = won.reduce((s, l) => s + l.value, 0);
  const openValue = open.reduce((s, l) => s + l.value, 0);

  const ordered = [...stages].sort((a, b) => a.order - b.order);
  const byStage = ordered.map((s) => {
    const inStage = leads.filter((l) => l.stageId === s.id);
    return { stage: s, count: inStage.length, value: inStage.reduce((sum, l) => sum + l.value, 0) };
  });
  const unstaged = leads.filter((l) => !l.stageId || !stages.some((s) => s.id === l.stageId)).length;

  const sources = new Map<string, number>();
  for (const l of leads) sources.set(l.source, (sources.get(l.source) ?? 0) + 1);
  const temps = (['HOT', 'WARM', 'COLD'] as const).map((temp) => ({ temp, count: leads.filter((l) => l.temperature === temp).length }));

  return (
    <div className="space-y-4">
      <p className="text-base text-muted">
        <span className="font-medium text-ink">{t('leads.summary.new', { count: leads.length, value: fmt(leads.length) })}</span>
        <span className="mx-2 text-faint" aria-hidden>
          ·
        </span>
        {t('leads.summary.won', { count: won.length, value: fmt(won.length), pct: fmt(Math.round(shareOf(won.length, leads.length))) })}
        {wonValue > 0 && ` (${formatMoney(wonValue, locale)})`}
        {openValue > 0 && (
          <>
            <span className="mx-2 text-faint" aria-hidden>
              ·
            </span>
            {t('leads.summary.open', { value: formatMoney(openValue, locale) })}
          </>
        )}
      </p>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <section className="v-card">
          <PanelHeader
            title={t('leads.byStage')}
            action={
              <Link href="/leads" className="v-hit text-xs font-medium text-accent hover:underline">
                {t('leads.open')}
              </Link>
            }
          />
          <BarList
            max={leads.length}
            rows={[
              ...byStage.map(({ stage, count, value }) => ({
                key: stage.id,
                label: (
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: stage.color || 'hsl(var(--v-faint))' }} />
                    <span className="truncate">{t(`crm:${stageKey(stage.name)}`, stage.name)}</span>
                  </span>
                ),
                value: count,
                aside: value > 0 ? formatMoney(value, locale) : '',
              })),
              ...(unstaged > 0 ? [{ key: 'none', label: t('leads.noStage'), value: unstaged, aside: '' }] : []),
            ]}
          />
        </section>

        <section className="v-card">
          <PanelHeader title={t('leads.bySource')} />
          <BarList
            max={leads.length}
            rows={[...sources.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([source, count]) => ({
                key: source,
                label: t(`crm:sources.${source}`, sourceMeta(source).label),
                value: count,
                aside: `${fmt(Math.round(shareOf(count, leads.length)))}%`,
              }))}
          />
        </section>

        <section className="v-card lg:col-span-2 xl:col-span-1">
          <PanelHeader title={t('leads.byTemperature')} />
          <BarList
            max={leads.length}
            rows={temps.map(({ temp, count }) => ({
              key: temp,
              label: t(`crm:temperature.${temp.toLowerCase()}`),
              value: count,
              aside: `${fmt(Math.round(shareOf(count, leads.length)))}%`,
            }))}
          />
        </section>
      </div>
    </div>
  );
}
