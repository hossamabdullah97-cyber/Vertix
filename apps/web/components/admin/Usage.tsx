'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { formatDate, formatNumber } from '@/lib/format';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { TrendChart } from '@/components/charts/TrendChart';
import { BarList, PanelHeader } from '@/components/analytics/parts';
import { Notice, Pills } from './shared';

interface UsageView {
  since: string | null;
  range: number;
  tiles: { dau: number; wau: number; mau: number; signups: number; signupsBefore: number; workspaces: number; activeWorkspaces: number };
  daily: { day: string; users: number; before: number }[];
  funnel: { step: string; users: number }[];
  adoption: { feature: string; users: number }[];
  retention: { week: string; size: number; weeks: (number | null)[] }[];
  plans: { plan: string; workspaces: number }[];
}

/**
 * How the product is used: active people, how far new sign-ups get, which
 * parts are used, whether people come back, and the workspaces by plan.
 */
export function Usage() {
  const { t } = useTranslation('admin');
  const { locale } = useLocale();
  const [range, setRange] = useState<'30' | '90'>('30');
  const [v, setV] = useState<UsageView | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setV(null);
    authFetch<UsageView>(`/admin/usage?range=${range}`)
      .then(setV)
      .catch((e) => setError((e as Error).message));
  }, [range]);

  const n = (x: number) => formatNumber(x, locale);
  const pct = (x: number) => formatNumber(x, locale, { style: 'percent', maximumFractionDigits: 0 });
  const day = (d: string) => formatDate(`${d}T12:00:00Z`, locale, { day: 'numeric', month: 'short' });
  const change = (now: number, then: number) => (then ? formatNumber((now - then) / then, locale, { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' }) : '');

  const tiles = v
    ? [
        { key: 'dau', value: n(v.tiles.dau), hint: t('usage.tiles.dauHint') },
        { key: 'wau', value: n(v.tiles.wau), hint: t('usage.tiles.wauHint') },
        { key: 'mau', value: n(v.tiles.mau), hint: v.tiles.mau ? t('usage.tiles.stickiness', { value: pct(v.tiles.dau / v.tiles.mau) }) : t('usage.tiles.mauHint') },
        { key: 'signups', value: n(v.tiles.signups), hint: v.tiles.signupsBefore ? t('usage.tiles.vsBefore', { change: change(v.tiles.signups, v.tiles.signupsBefore) }) : t('usage.tiles.signupsHint', { days: v.range }) },
        { key: 'workspaces', value: n(v.tiles.workspaces), hint: t('usage.tiles.activeWorkspaces', { count: v.tiles.activeWorkspaces }) },
      ]
    : [];

  const top = v?.funnel[0]?.users ?? 0;

  return (
    <div className="max-w-[1180px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[720px] text-sm text-muted">
          {t('usage.intro')} {v?.since && t('usage.since', { date: formatDate(`${v.since}T12:00:00Z`, locale) })}
        </p>
        <Pills
          label={t('usage.range')}
          value={range}
          onChange={setRange}
          options={[
            { key: '30', label: t('usage.days', { count: 30 }) },
            { key: '90', label: t('usage.days', { count: 90 }) },
          ]}
        />
      </div>
      {error && (
        <Notice tone="danger" onDismiss={() => setError('')}>
          {error}
        </Notice>
      )}

      {!v ? (
        <div className="v-skeleton h-96 rounded-xl" />
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="usage-tiles">
            {tiles.map((x) => (
              <li key={x.key} className="v-card p-4">
                <p className="text-xs text-muted">{t(`usage.tiles.${x.key}`)}</p>
                <p className="tabular mt-1 text-2xl font-semibold text-ink">{x.value}</p>
                <p className="mt-1 truncate text-xs text-faint">{x.hint}</p>
              </li>
            ))}
          </ul>

          <section className="v-card">
            <PanelHeader title={t('usage.activeTitle')} meta={t('usage.days', { count: v.range })} />
            <div className="px-4 pb-4">
              <TrendChart
                current={v.daily.map((d) => d.users)}
                previous={v.daily.map((d) => d.before)}
                labels={v.daily.map((d) => day(d.day))}
                currentLabel={t('usage.activePeople')}
                previousLabel={t('usage.periodBefore')}
                formatDelta={(p) => formatNumber(p / 100, locale, { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' })}
              />
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="v-card" data-testid="usage-funnel">
              <PanelHeader title={t('usage.funnelTitle')} meta={t('usage.funnelMeta', { days: v.range })} />
              <BarList
                max={Math.max(1, top)}
                rows={v.funnel.map((s) => ({ key: s.step, label: t(`usage.steps.${s.step}`), value: s.users, aside: top ? pct(s.users / top) : '—' }))}
              />
            </section>
            <section className="v-card" data-testid="usage-adoption">
              <PanelHeader title={t('usage.adoptionTitle')} meta={t('usage.adoptionMeta')} />
              <BarList
                max={Math.max(1, v.tiles.mau)}
                rows={v.adoption.map((a) => ({ key: a.feature, label: t(`usage.features.${a.feature}`), value: a.users, aside: v.tiles.mau ? pct(a.users / v.tiles.mau) : '—' }))}
              />
            </section>
          </div>

          <section className="v-card overflow-hidden">
            <PanelHeader title={t('usage.retentionTitle')} meta={t('usage.retentionMeta')} />
            <div className="overflow-x-auto px-4 pb-4">
              <table className="w-full min-w-[640px] border-separate border-spacing-[3px] text-xs" data-testid="usage-retention">
                <thead>
                  <tr className="text-faint">
                    <th className="px-2 py-1 text-start font-medium">{t('usage.cohort')}</th>
                    <th className="px-2 py-1 text-end font-medium">{t('usage.people')}</th>
                    {v.retention[0]?.weeks.map((_, k) => (
                      <th key={k} className="px-2 py-1 text-center font-medium">
                        {t('usage.weekN', { n: k })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {v.retention.map((c) => (
                    <tr key={c.week}>
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted">{day(c.week)}</td>
                      <td className="tabular px-2 py-1.5 text-end text-ink">{n(c.size)}</td>
                      {c.weeks.map((w, k) => (
                        <td
                          key={k}
                          title={w === null ? undefined : t('usage.cellTitle', { week: k, share: pct(w), cohort: day(c.week) })}
                          className={`tabular rounded px-2 py-1.5 text-center ${w === null ? 'text-faint' : w >= 0.5 ? 'font-medium text-white' : 'text-ink'}`}
                          style={w === null ? undefined : { background: `rgb(var(--v-accent-ch) / ${0.08 + w * 0.82})` }}
                        >
                          {w === null ? '' : pct(w)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="v-card">
            <PanelHeader title={t('usage.plansTitle')} />
            <BarList rows={v.plans.map((p) => ({ key: p.plan, label: t(`billing:plans.${p.plan}`, { defaultValue: p.plan }), value: p.workspaces }))} />
          </section>
        </>
      )}
    </div>
  );
}
