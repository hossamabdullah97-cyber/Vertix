'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { apiMessageOf, authFetch, type ApiError } from '@/lib/client';
import { formatDate, formatNumber, formatRelativeTime } from '@/lib/format';
import { csvCell, downloadText } from '@/lib/export-leads';
import { formatMoney, stageKey, type Stage } from '@/lib/crm';
import { useOccasionRange } from '@/components/occasions/OccasionsSheet';
import { WaitingBadge } from '@/components/crm/LeadCard';

interface Report {
  occasion: { id: string; name: string; startsOn: string; endsOn: string; days: number; status: 'upcoming' | 'live' | 'past'; day: number | null };
  totals: { taps: number; reached: number; views: number; leads: number; meetings: number; contacted: number; medianReplyHours: number | null; won: { count: number; value: number } };
  usual: { leads: number; taps: number; reached: number };
  days: { date: string; taps: number; views: number; leads: number }[];
  hours: number[];
  members: { user: { id: string; name: string | null; email: string }; scans: number; visitors: number; leads: number; wonLeads: number }[];
  chips: { tagId: string; uid: string | null; holder: { name: string | null; email: string } | null; scans: number; leads: number }[];
  leads: { id: string; name: string | null; company: string | null; email: string | null; phone: string | null; createdAt: string; firstContactedAt: string | null; stageId: string | null; value: number; by: string | null }[];
}

const HOUR = 3_600_000;

/**
 * What an occasion (an exhibition, a launch) brought in: its leads, the
 * people reached and the taps, against an ordinary day; how the team
 * followed up; when the stand was busiest; and every lead it produced, to
 * export. The numbers a company takes to the meeting about its next stand.
 */
export default function OccasionReportPage({ params }: { params: { id: string } }) {
  const { t } = useTranslation('dashboard');
  const { locale } = useLocale();
  const range = useOccasionRange();
  const [r, setR] = useState<Report | null>(null);
  const [stages, setStages] = useState<(Stage & { isWon?: boolean })[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    authFetch<Report>(`/reports/occasions/${params.id}`)
      .then(setR)
      .catch((e) => setError(apiMessageOf(e as ApiError) || t('eventReport.failed')));
    authFetch<(Stage & { isWon?: boolean })[]>('/leads/stages').then(setStages).catch(() => setStages([]));
  }, [params.id, t]);

  const n = (v: number) => formatNumber(v, locale);
  const o = r?.occasion;
  // Days so far, for a running occasion; all of them once it is over.
  const elapsed = o ? (o.status === 'live' ? o.day ?? 1 : o.days) : 1;
  const perDay = r ? r.totals.leads / elapsed : 0;
  const times = r && r.usual.leads > 0 ? perDay / r.usual.leads : null;
  const peak = useMemo(() => (r ? r.hours.indexOf(Math.max(...r.hours)) : -1), [r]);
  const stageName = (id: string | null) => {
    const s = stages.find((x) => x.id === id);
    return s ? t(`crm:${stageKey(s.name)}`, s.name) : '';
  };
  const hourLabel = (h: number) => formatDate(new Date(Date.UTC(2026, 0, 1, h)), locale, { hour: 'numeric', timeZone: 'UTC' });

  function exportCsv() {
    if (!r || !o) return;
    const h = t('eventReport.csv', { returnObjects: true }) as Record<string, string>;
    const rows = [[h.name, h.company, h.email, h.phone, h.by, h.added, h.contacted, h.stage]];
    const when = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') : '');
    for (const l of r.leads) rows.push([l.name ?? '', l.company ?? '', l.email ?? '', l.phone ?? '', l.by ?? '', when(l.createdAt), when(l.firstContactedAt), stageName(l.stageId)]);
    // A plain file name: some browsers drop a name with Arabic letters and save it as "download".
    const slug = o.name.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'event';
    downloadText(`\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`, `${slug}-leads-${o.startsOn}.csv`);
  }

  const status =
    o?.status === 'live'
      ? t('eventReport.live', { day: n(o.day ?? 1), days: n(o.days) })
      : o?.status === 'upcoming'
        ? t('eventReport.upcoming')
        : t('eventReport.ended');

  return (
    <AppShell
      title={
        <span className="flex min-w-0 items-center gap-1.5">
          <Link href="/analytics" className="shrink-0 text-muted hover:text-ink">
            {t('eventReport.crumb')}
          </Link>
          <span className="text-faint">/</span>
          <span className="truncate">{o?.name ?? '…'}</span>
        </span>
      }
      action={
        r && r.leads.length > 0 ? (
          <button type="button" onClick={exportCsv} className="v-btn v-btn-ghost gap-1.5">
            <Icon name="download" size={14} /> {t('eventReport.export')}
          </button>
        ) : undefined
      }
    >
      {error ? (
        <p role="alert" className="rounded-xl bg-red-500/[0.06] px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-300">
          {error}
        </p>
      ) : !r || !o ? (
        <div className="space-y-4">
          <div className="v-skeleton h-24 rounded-xl" />
          <div className="v-skeleton h-40 rounded-xl" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <Icon name="calendar" size={14} />
            <span>{range({ id: o.id, name: o.name, startsOn: o.startsOn, endsOn: o.endsOn })}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                o.status === 'live' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-elevated text-muted ring-1 ring-inset ring-line'
              }`}
            >
              {o.status === 'live' && <span className="me-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 align-middle" />}
              {status}
            </span>
          </div>

          {o.status === 'upcoming' ? (
            <p className="mt-6 rounded-xl bg-elevated px-5 py-8 text-center text-sm text-muted ring-1 ring-inset ring-line">{t('eventReport.notYet')}</p>
          ) : (
            <>
              {/* The headline: against an ordinary day. */}
              {r.totals.leads > 0 && (
                <p className="mt-5 rounded-xl bg-accent/[0.06] px-4 py-3 text-base font-medium text-ink ring-1 ring-inset ring-accent/15">
                  {times !== null && times >= 1.5
                    ? t('eventReport.times', { x: formatNumber(Math.round(times * 10) / 10, locale), per: formatNumber(Math.round(perDay * 10) / 10, locale) })
                    : times === null
                      ? t('eventReport.fromNothing', { count: r.totals.leads, n: n(r.totals.leads) })
                      : t('eventReport.perDay', { per: formatNumber(Math.round(perDay * 10) / 10, locale) })}
                </p>
              )}

              <div className="v-card mt-4 grid grid-cols-2 overflow-hidden lg:grid-cols-4">
                {[
                  { label: t('eventReport.leads'), value: r.totals.leads, sub: t('eventReport.usual', { n: formatNumber(r.usual.leads, locale) }) },
                  { label: t('eventReport.reached'), value: r.totals.reached, sub: t('eventReport.usual', { n: formatNumber(r.usual.reached, locale) }) },
                  { label: t('eventReport.taps'), value: r.totals.taps, sub: t('eventReport.usual', { n: formatNumber(r.usual.taps, locale) }) },
                  { label: t('eventReport.meetings'), value: r.totals.meetings, sub: t('eventReport.views', { n: n(r.totals.views) }) },
                ].map((s, i) => (
                  <div key={s.label} className={`px-4 py-4 ${i % 2 ? 'border-s border-line' : ''} ${i >= 2 ? 'border-t border-line lg:border-t-0' : ''} ${i === 2 ? 'lg:border-s' : ''}`}>
                    <p className="text-xs font-medium text-muted">{s.label}</p>
                    <p className="tabular mt-2 text-4xl font-semibold leading-none tracking-[-0.025em] text-ink">{n(s.value)}</p>
                    <p className="mt-1.5 truncate text-xs text-faint">{s.sub}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {/* Following up */}
                <section className="v-card p-5">
                  <h2 className="text-sm font-semibold text-ink">{t('eventReport.followUp')}</h2>
                  {r.totals.leads === 0 ? (
                    <p className="mt-2 text-sm text-muted">{t('eventReport.noLeads')}</p>
                  ) : (
                    <>
                      <div className="mt-3 flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-ink">{t('eventReport.contacted', { c: n(r.totals.contacted), n: n(r.totals.leads) })}</span>
                        <span className="tabular font-semibold text-ink">{n(Math.round((r.totals.contacted / r.totals.leads) * 100))}%</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-elevated">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(r.totals.contacted / r.totals.leads) * 100}%` }} />
                      </div>
                      <ul className="mt-4 space-y-1.5 text-sm text-muted">
                        {r.totals.medianReplyHours !== null && (
                          <li>{t('eventReport.median', { span: spanOf(r.totals.medianReplyHours, t) })}</li>
                        )}
                        {r.totals.leads - r.totals.contacted > 0 && (
                          <li className="font-medium text-amber-700 dark:text-amber-300">
                            {t('eventReport.stillWaiting', { count: r.totals.leads - r.totals.contacted, n: n(r.totals.leads - r.totals.contacted) })}
                          </li>
                        )}
                        {r.totals.won.count > 0 && (
                          <li className="font-medium text-ink">
                            {t('eventReport.won', { count: r.totals.won.count, n: n(r.totals.won.count), value: formatMoney(r.totals.won.value, locale) })}
                          </li>
                        )}
                      </ul>
                    </>
                  )}
                </section>

                {/* Day by day */}
                <section className="v-card p-5">
                  <h2 className="text-sm font-semibold text-ink">{t('eventReport.byDay')}</h2>
                  <ul className="mt-3 space-y-3">
                    {r.days.map((d) => {
                      const max = Math.max(1, ...r.days.map((x) => x.leads));
                      return (
                        <li key={d.date}>
                          <div className="flex items-baseline justify-between gap-2 text-xs">
                            <span className="text-ink">{formatDate(`${d.date}T12:00:00Z`, locale, { weekday: 'long', day: 'numeric', month: 'short' })}</span>
                            <span className="text-muted">
                              {t('eventReport.dayLine', { leads: n(d.leads), views: n(d.views), taps: n(d.taps) })}
                            </span>
                          </div>
                          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-elevated">
                            <div className="h-full rounded-full bg-accent" style={{ width: `${(d.leads / max) * 100}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </div>

              {/* When the stand was busiest */}
              {peak >= 0 && r.hours[peak] > 0 && (
                <section className="v-card mt-4 p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-sm font-semibold text-ink">{t('eventReport.hours')}</h2>
                    <span className="text-xs text-muted">{t('eventReport.peak', { from: hourLabel(peak), to: hourLabel((peak + 1) % 24) })}</span>
                  </div>
                  <div className="mt-3 grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }} dir="ltr">
                    {r.hours.map((v, h) => (
                      <div key={h} title={`${hourLabel(h)} · ${n(v)}`} className="flex flex-col items-center gap-1">
                        <span
                          className="h-8 w-full rounded-[4px] bg-accent"
                          style={{ opacity: v === 0 ? 0.07 : 0.2 + (0.8 * v) / r.hours[peak] }}
                        />
                        <span className="whitespace-nowrap text-3xs text-faint">{h % 6 === 0 ? hourLabel(h) : ''}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-faint">{t('eventReport.hoursHint')}</p>
                </section>
              )}

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <section className="v-card overflow-hidden">
                  <h2 className="px-5 pt-5 text-sm font-semibold text-ink">{t('eventReport.team')}</h2>
                  {r.members.length === 0 ? (
                    <p className="px-5 pb-5 pt-2 text-sm text-muted">{t('eventReport.noTeam')}</p>
                  ) : (
                    <table className="v-table mt-2">
                      <thead>
                        <tr>
                          <th>{t('eventReport.member')}</th>
                          <th className="whitespace-nowrap !text-end">{t('eventReport.cols.reached')}</th>
                          <th className="whitespace-nowrap !text-end">{t('eventReport.cols.leads')}</th>
                          <th className="whitespace-nowrap !text-end">{t('eventReport.cols.won')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.members.map((m) => (
                          <tr key={m.user.id}>
                            <td className="w-full max-w-0 truncate font-medium text-ink">{m.user.name || m.user.email}</td>
                            <td className="tabular !text-end">{n(m.visitors)}</td>
                            <td className="tabular !text-end">{n(m.leads)}</td>
                            <td className="tabular !text-end">{n(m.wonLeads)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>

                <section className="v-card p-5">
                  <h2 className="text-sm font-semibold text-ink">{t('eventReport.chips')}</h2>
                  {r.chips.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">{t('eventReport.noChips')}</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-line">
                      {r.chips.map((c) => (
                        <li key={c.tagId} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <span className="min-w-0 truncate text-ink">{c.holder?.name || c.holder?.email || <span dir="ltr" className="font-mono text-xs">{c.uid}</span>}</span>
                          <span className="shrink-0 text-xs text-muted">{t('eventReport.chipLine', { taps: n(c.scans), leads: n(c.leads) })}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              {/* Every lead it brought */}
              <section className="v-card mt-4 overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-5 pt-5">
                  <h2 className="text-sm font-semibold text-ink">{t('eventReport.leadsTitle', { n: n(r.leads.length) })}</h2>
                </div>
                {r.leads.length === 0 ? (
                  <p className="px-5 pb-5 pt-2 text-sm text-muted">{t('eventReport.noLeads')}</p>
                ) : (
                  <ul className="mt-2 divide-y divide-line">
                    {r.leads.map((l) => {
                      const waiting = l.firstContactedAt ? null : Math.floor((Date.now() - new Date(l.createdAt).getTime()) / HOUR);
                      return (
                        <li key={l.id}>
                          <Link href={`/leads?lead=${encodeURIComponent(l.id)}`} className="flex items-center gap-3 px-5 py-3 hover:bg-elevated">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-ink">{l.name || t('eventReport.unnamed')}</span>
                              <span className="block truncate text-xs text-muted">
                                {[l.company, l.by && t('eventReport.by', { name: l.by }), formatRelativeTime(l.createdAt, locale, 'narrow')].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                            {waiting !== null && waiting >= 1 ? (
                              <WaitingBadge hours={waiting} className="shrink-0" />
                            ) : l.firstContactedAt ? (
                              <span className="inline-flex shrink-0 items-center gap-1 text-2xs font-medium text-emerald-700 dark:text-emerald-300">
                                <Icon name="check" size={11} /> {t('eventReport.reachedOut')}
                              </span>
                            ) : null}
                            {l.stageId && <span className="hidden shrink-0 text-xs text-faint sm:inline">{stageName(l.stageId)}</span>}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}

function spanOf(hours: number, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (hours < 1) return t('eventReport.underHour');
  return hours < 24 ? t('crm:waiting.hours', { count: Math.round(hours) }) : t('crm:waiting.days', { count: Math.round(hours / 24) });
}
