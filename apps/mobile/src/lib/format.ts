import { currentLang } from './i18n';

// Western digits in Arabic too, as on the website (apps/web/lib/format.ts).
const tag = () => (currentLang() === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB');

/** "3 min ago", "yesterday", in the app's language. */
export function relative(iso: string | Date, now = Date.now()): string {
  const t = new Date(iso).getTime();
  const s = Math.round((t - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(tag(), { numeric: 'auto', style: 'short' });
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(s, 'second');
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(s / 86400), 'day');
  return date(iso);
}

export function date(iso: string | Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  return new Intl.DateTimeFormat(tag(), opts).format(new Date(iso));
}

export function time(iso: string | Date): string {
  return new Intl.DateTimeFormat(tag(), { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export function number(n: number): string {
  return new Intl.NumberFormat(tag()).format(n);
}

/** A phone number as WhatsApp's link wants it: digits only. */
export function waDigits(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}
