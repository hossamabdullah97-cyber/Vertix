'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { rangeQuery } from '@/lib/analytics';
import { formatMoney } from '@/lib/crm';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatNumber } from '@/lib/format';
import { Avatar } from '@/components/Avatar';
import { PanelEmpty, PanelHeader } from './parts';

interface MemberRow {
  user: { id: string; name: string | null; email: string; avatarUrl: string | null };
  tags: number;
  scans: number;
  visitors: number;
  leads: number;
  wonLeads: number;
  wonValue: number;
}

/**
 * Who brings clients in, counted by the chip each person carries. The API
 * orders by clients won, then leads, then people reached.
 */
export function TeamView({ from }: { from: Date }) {
  const { t } = useTranslation('analytics');
  const { locale } = useLocale();
  const fmt = (n: number) => formatNumber(n, locale);
  const [rows, setRows] = useState<MemberRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setRows(null);
    authFetch<MemberRow[]>('/analytics/members' + rangeQuery(from, new Date()))
      .then((r) => alive && setRows(r))
      .catch((e) => {
        if (!alive) return;
        setRows([]);
        setError((e as Error).message);
      });
    return () => {
      alive = false;
    };
  }, [from]);

  if (rows === null) return <div className="v-skeleton h-64 w-full rounded-xl" />;

  return (
    <section className="v-card overflow-hidden">
      <PanelHeader title={t('team.title')} meta={t('team.meta')} />
      {error ? (
        <PanelEmpty>{error}</PanelEmpty>
      ) : rows.length === 0 ? (
        <PanelEmpty action={<Link href="/tags" className="v-btn v-btn-ghost">{t('team.assign')}</Link>}>{t('team.empty')}</PanelEmpty>
      ) : (
        <div className="overflow-x-auto">
          <table className="v-table">
            <thead>
              <tr>
                <th>{t('team.member')}</th>
                <th className="hidden !text-end md:table-cell">{t('team.chips')}</th>
                <th className="hidden !text-end sm:table-cell">{t('metrics.NFC_SCAN')}</th>
                <th className="hidden !text-end sm:table-cell">{t('chips.people')}</th>
                <th className="!text-end">{t('metrics.LEADS')}</th>
                <th className="!text-end">{t('team.won')}</th>
                <th className="hidden !text-end lg:table-cell">{t('team.wonValue')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.user.id}>
                  <td className="w-full max-w-0">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="tabular w-4 shrink-0 text-[12px] text-faint">{fmt(i + 1)}</span>
                      <Avatar user={r.user} size={28} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{r.user.name || r.user.email}</span>
                        {r.user.name && (
                          <span dir="ltr" className="block truncate text-start text-[12px] text-faint rtl:text-right">
                            {r.user.email}
                          </span>
                        )}
                      </span>
                    </span>
                  </td>
                  <td className="hidden text-end md:table-cell">{fmt(r.tags)}</td>
                  <td className="hidden text-end sm:table-cell">{fmt(r.scans)}</td>
                  <td className="hidden text-end sm:table-cell">{fmt(r.visitors)}</td>
                  <td className="text-end">{fmt(r.leads)}</td>
                  <td className="text-end">{fmt(r.wonLeads)}</td>
                  <td className="hidden text-end lg:table-cell">{formatMoney(r.wonValue, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
