/**
 * Centralized, locale-aware formatting. Every page must format dates, numbers,
 * and currency through these helpers — never hand-roll formatting per page.
 * Built on the standard `Intl` APIs so behavior is correct and consistent.
 */
import type { Locale } from '@/lib/i18n/config';

const localeTag: Record<Locale, string> = {
  // Arabic-Egypt with Latin digits keeps numbers readable while localizing
  // month/day names; swap to 'ar-EG' (default) if Arabic-Indic digits are
  // desired platform-wide.
  en: 'en-US',
  ar: 'ar-EG',
};

export function formatDate(
  date: Date | string | number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' },
): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(localeTag[locale], options).format(d);
}

export function formatTime(date: Date | string | number, locale: Locale): string {
  return formatDate(date, locale, { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(date: Date | string | number, locale: Locale): string {
  return formatDate(date, locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Relative time, e.g. "3 days ago" / "منذ ٣ أيام". */
export function formatRelativeTime(date: Date | string | number, locale: Locale): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const rtf = new Intl.RelativeTimeFormat(localeTag[locale], { numeric: 'auto' });
  const diffMs = d.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000000],
    ['month', 2592000000],
    ['day', 86400000],
    ['hour', 3600000],
    ['minute', 60000],
    ['second', 1000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === 'second') {
      return rtf.format(Math.round(diffMs / ms), unit);
    }
  }
  return '';
}

export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(localeTag[locale], options).format(value);
}

export function formatPercent(value: number, locale: Locale, fractionDigits = 0): string {
  return new Intl.NumberFormat(localeTag[locale], {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatCurrency(
  value: number,
  locale: Locale,
  currency = 'EGP',
): string {
  return new Intl.NumberFormat(localeTag[locale], {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * The correct `dir` for a single input based on the kind of data it holds.
 * URLs, emails, phones, API keys, and slugs are always LTR even in an RTL UI to
 * prevent mixed-direction editing bugs; free text follows the UI locale.
 */
export type InputKind = 'text' | 'url' | 'email' | 'phone' | 'apiKey' | 'slug' | 'number';

export function inputDir(kind: InputKind, locale: Locale): 'rtl' | 'ltr' {
  if (kind === 'text') return locale === 'ar' ? 'rtl' : 'ltr';
  return 'ltr';
}
