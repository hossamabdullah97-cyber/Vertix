/**
 * Period maths shared by Home and Analytics, so both count the same days the
 * same way. Days are whole UTC calendar days, matching how
 * /analytics/timeseries groups events.
 */

export const DAY = 86_400_000;

export type EventType = 'VIEW' | 'CLICK' | 'SAVE' | 'SHARE' | 'NFC_SCAN';

export interface Overview {
  totals: Record<string, number>;
  uniqueVisitors: number;
  leads: number;
}

/** One day from /analytics/timeseries. Days without events are left out. */
export interface Point {
  day: string;
  VIEW: number;
  CLICK: number;
  SAVE: number;
  SHARE: number;
  NFC_SCAN: number;
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** UTC calendar days, oldest first. */
export function dayKeys(from: Date, days: number): string[] {
  return Array.from({ length: days }, (_, i) => new Date(from.getTime() + i * DAY).toISOString().slice(0, 10));
}

/**
 * A window of `days` whole days ending today, and the same number of days
 * immediately before it for comparison.
 */
export function periodWindows(days: number, now = new Date()) {
  const today = startOfUtcDay(now);
  const from = new Date(today.getTime() - (days - 1) * DAY);
  const prevFrom = new Date(from.getTime() - days * DAY);
  return { from, prevFrom, keys: dayKeys(from, days), prevKeys: dayKeys(prevFrom, days) };
}

/** `?from=…&to=…` for the analytics endpoints. */
export function rangeQuery(from: Date, to: Date): string {
  return `?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
}

/** One event type per day over `keys`, with missing days as zero. */
export function eventSeries(points: Point[], keys: string[], type: EventType): number[] {
  const byDay = new Map(points.map((p) => [p.day, p]));
  return keys.map((k) => byDay.get(k)?.[type] ?? 0);
}

/** Items per day over `keys`, bucketed by the UTC day of `createdAt`. */
export function countByDay(items: { createdAt: string }[], keys: string[]): number[] {
  const counts = new Map<string, number>();
  for (const it of items) {
    const k = it.createdAt.slice(0, 10);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return keys.map((k) => counts.get(k) ?? 0);
}

/** A period-over-period change in percent, or null when there is nothing to compare against. */
export function change(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

/** "+12%", "−3.5%": one decimal below ten, whole numbers above. */
export function formatChange(pct: number): string {
  const abs = Math.abs(pct);
  return `${pct >= 0 ? '+' : '−'}${abs < 10 ? abs.toFixed(1) : Math.round(abs)}%`;
}

/** `part` as a share of `whole`, or 0 when there is no whole. */
export function shareOf(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}
