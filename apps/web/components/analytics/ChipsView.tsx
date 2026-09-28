'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { authFetch } from '@/lib/client';
import { rangeQuery } from '@/lib/analytics';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatNumber, formatRelativeTime } from '@/lib/format';
import { PanelEmpty, PanelHeader } from './parts';

interface ChipRow {
  tagId: string;
  uid: string;
  hardwareType: string | null;
  holder: { id: string; name: string | null; email: string } | null;
  cardSlug: string | null;
  scans: number;
  visitors: number;
  leads: number;
  lastScanAt: string | null;
}

/** Each chip tapped in the period: how often, how many people, how many leads. */
export function ChipsView({ from }: { from: Date }) {
  const { t } = useTranslation('analytics');
  const { locale } = useLocale();
  const fmt = (n: number) => formatNumber(n, locale);
  const [rows, setRows] = useState<ChipRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setRows(null);
    authFetch<ChipRow[]>('/analytics/nfc-tags' + rangeQuery(from, new Date()))
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

  const sum = (k: 'scans' | 'visitors' | 'leads') => rows.reduce((s, r) => s + r[k], 0);

  return (
    <div className="space-y-4">
      {rows.length > 0 && (
        <p className="text-[14px] text-muted">
          {t('chips.summary', {
            taps: fmt(sum('scans')),
            chips: fmt(rows.length),
            people: fmt(sum('visitors')),
            leads: fmt(sum('leads')),
          })}
        </p>
      )}
      <section className="v-card overflow-hidden">
        <PanelHeader
          title={t('chips.title')}
          action={
            <Link href="/tags" className="text-[12.5px] font-medium text-accent hover:underline">
              {t('chips.manage')}
            </Link>
          }
        />
        {error ? (
          <PanelEmpty>{error}</PanelEmpty>
        ) : rows.length === 0 ? (
          <PanelEmpty>{t('chips.empty')}</PanelEmpty>
        ) : (
          <div className="overflow-x-auto">
            <table className="v-table">
              <thead>
                <tr>
                  <th>{t('chips.chip')}</th>
                  <th className="hidden md:table-cell">{t('chips.holder')}</th>
                  <th className="hidden lg:table-cell">{t('chips.card')}</th>
                  <th className="!text-end">{t('metrics.NFC_SCAN')}</th>
                  <th className="!text-end">{t('chips.people')}</th>
                  <th className="!text-end">{t('metrics.LEADS')}</th>
                  <th className="hidden sm:table-cell">{t('chips.lastTap')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.tagId}>
                    <td>
                      <span dir="ltr" className="block font-mono text-[12.5px] text-ink rtl:text-right">
                        {r.uid}
                      </span>
                      {r.hardwareType && <span className="block text-[12px] text-faint">{t(`nfc:hardwareType.${r.hardwareType.toLowerCase()}`, r.hardwareType)}</span>}
                    </td>
                    <td className="hidden text-muted md:table-cell">{r.holder ? r.holder.name || r.holder.email : '—'}</td>
                    <td className="hidden lg:table-cell">
                      {r.cardSlug ? (
                        <span dir="ltr" className="font-mono text-[12px] text-muted">
                          /c/{r.cardSlug}
                        </span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="text-end">{fmt(r.scans)}</td>
                    <td className="text-end">{fmt(r.visitors)}</td>
                    <td className="text-end">{fmt(r.leads)}</td>
                    <td className="hidden whitespace-nowrap text-muted sm:table-cell">{r.lastScanAt ? formatRelativeTime(r.lastScanAt, locale, 'short') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
