'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { authFetch, type Card } from '@/lib/client';
import { type Lead } from '@/lib/crm';
import { shareOf } from '@/lib/analytics';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatNumber } from '@/lib/format';
import { CardThumb } from '@/components/cards/CardThumb';
import { Num, PanelEmpty, PanelHeader } from './parts';

type CardStats = { VIEW: number; CLICK: number; SAVE: number; SHARE: number; NFC_SCAN: number };
type SortKey = 'VIEW' | 'CLICK' | 'SAVE' | 'SHARE' | 'NFC_SCAN' | 'leads' | 'saveRate';

const STATS_CONCURRENCY = 4;

/**
 * Every card side by side over its whole life. The API keeps per-card counts
 * all-time only, so this view says so rather than pretend to follow the period.
 */
export function CardsView({ cards, leads }: { cards: Card[]; leads: Lead[] | null }) {
  const { t } = useTranslation('analytics');
  const { locale } = useLocale();
  const [stats, setStats] = useState<Record<string, CardStats | null>>({});
  const [sort, setSort] = useState<SortKey>('VIEW');

  useEffect(() => {
    if (!cards.length) return;
    let cancelled = false;
    const queue = cards.map((c) => c.id).filter((id) => !(id in stats));
    const worker = async () => {
      while (!cancelled && queue.length) {
        const id = queue.shift()!;
        const s = await authFetch<CardStats>(`/analytics/cards/${id}`).catch(() => null);
        if (!cancelled) setStats((prev) => ({ ...prev, [id]: s }));
      }
    };
    Array.from({ length: STATS_CONCURRENCY }, worker);
    return () => {
      cancelled = true;
    };
    // `stats` is only read to skip cards already fetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  const leadsBySlug = useMemo(() => {
    const by = new Map<string, number>();
    for (const l of leads ?? []) if (l.card?.slug) by.set(l.card.slug, (by.get(l.card.slug) ?? 0) + 1);
    return by;
  }, [leads]);

  const valueOf = (c: Card, key: SortKey): number => {
    const s = stats[c.id];
    if (key === 'leads') return leadsBySlug.get(c.slug) ?? 0;
    if (!s) return -1;
    if (key === 'saveRate') return shareOf(s.SAVE, s.VIEW);
    return s[key];
  };
  const rows = [...cards].sort((a, b) => valueOf(b, sort) - valueOf(a, sort));

  if (cards.length === 0) {
    return (
      <section className="v-card">
        <PanelHeader title={t('cards.title')} />
        <PanelEmpty action={<Link href="/cards?new=1" className="v-btn">{t('cards.create')}</Link>}>{t('cards.empty')}</PanelEmpty>
      </section>
    );
  }

  const columns: { key: SortKey; label: string; className?: string }[] = [
    { key: 'VIEW', label: t('metrics.VIEW') },
    { key: 'CLICK', label: t('metrics.CLICK'), className: 'hidden sm:table-cell' },
    { key: 'SAVE', label: t('metrics.SAVE'), className: 'hidden sm:table-cell' },
    { key: 'SHARE', label: t('metrics.SHARE'), className: 'hidden lg:table-cell' },
    { key: 'NFC_SCAN', label: t('metrics.NFC_SCAN'), className: 'hidden md:table-cell' },
    { key: 'leads', label: t('metrics.LEADS') },
    { key: 'saveRate', label: t('cards.saveRate'), className: 'hidden lg:table-cell' },
  ];

  return (
    <section className="v-card overflow-hidden">
      <PanelHeader title={t('cards.title')} meta={t('cards.meta')} />
      <p className="px-4 pb-3 text-[12.5px] text-faint">{t('cards.note')}</p>
      <div className="overflow-x-auto">
        <table className="v-table">
          <thead>
            <tr>
              <th>{t('cards.card')}</th>
              {columns.map((col) => (
                <th key={col.key} className={`!text-end ${col.className ?? ''}`} aria-sort={sort === col.key ? 'descending' : 'none'}>
                  <button onClick={() => setSort(col.key)} className={`inline-flex min-h-11 items-center gap-1 sm:min-h-0 ${sort === col.key ? 'text-ink' : 'hover:text-ink'}`}>
                    {col.label}
                    {sort === col.key && <span aria-hidden>↓</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const s = c.id in stats ? stats[c.id] : undefined;
              const pick = (k: keyof CardStats) => (s === undefined ? undefined : s?.[k] ?? null);
              const name = ((c.vcardData?.fullName as string) || '').trim();
              return (
                <tr key={c.id}>
                  <td className="w-full max-w-0">
                    <Link href={`/cards/${c.id}`} className="flex min-w-0 items-center gap-3 hover:underline">
                      <CardThumb card={c} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{name || `/c/${c.slug}`}</span>
                        <span dir="ltr" className="block truncate text-start font-mono text-[12px] text-faint rtl:text-right">
                          /c/{c.slug}
                        </span>
                      </span>
                    </Link>
                  </td>
                  {columns.map((col) => (
                    <td key={col.key} className={`text-end ${col.className ?? ''}`}>
                      {col.key === 'leads' ? (
                        <Num value={leads === null ? undefined : leadsBySlug.get(c.slug) ?? 0} />
                      ) : col.key === 'saveRate' ? (
                        s === undefined ? (
                          <Num value={undefined} />
                        ) : !s || s.VIEW === 0 ? (
                          <span className="text-faint">—</span>
                        ) : (
                          `${formatNumber(Math.round(shareOf(s.SAVE, s.VIEW)), locale)}%`
                        )
                      ) : (
                        <Num value={pick(col.key)} />
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
