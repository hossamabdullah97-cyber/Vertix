'use client';

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/components/i18n/LanguageProvider';
import { formatNumber } from '@/lib/format';

/**
 * Lists of leads draw a page at a time. A workspace with thousands of leads
 * used to put every one of them on screen at once (130,000 elements for
 * 5,000 leads), which froze a phone for over fifteen seconds; the totals
 * and filters still cover the whole list.
 */
export const PAGE = 50;
/** A board column shows a handful without scrolling; twenty is plenty to start. */
export const BOARD_PAGE = 20;

export function useShowMore<T>(items: T[], step = PAGE) {
  const [limit, setLimit] = useState(step);
  const more = useCallback(() => setLimit((l) => l + step), [step]);
  return { shown: items.length > limit ? items.slice(0, limit) : items, rest: Math.max(0, items.length - limit), more };
}

/** "Show 50 more · 120 of 5,000" under a list that holds more than it shows. */
export function ShowMore({ rest, shown, onMore, step = PAGE, className = '' }: { rest: number; shown: number; onMore: () => void; step?: number; className?: string }) {
  const { t } = useTranslation('crm');
  const { locale } = useLocale();
  if (rest <= 0) return null;
  const fmt = (n: number) => formatNumber(n, locale);
  return (
    <div className={`flex flex-col items-center gap-1 py-3 ${className}`}>
      <button type="button" onClick={onMore} className="v-btn v-btn-ghost !text-xs">
        {t('showMore.button', { count: Math.min(rest, step), n: fmt(Math.min(rest, step)) })}
      </button>
      <span className="tabular text-2xs text-faint">{t('showMore.of', { shown: fmt(shown), total: fmt(shown + rest) })}</span>
    </div>
  );
}
