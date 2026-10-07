/**
 * When a card's owner takes meetings, and which times are still open. The
 * owner sets working days, hours, meeting length and time zone in the Studio
 * (stored as `theme.availability`); visitors pick from what is left.
 */

import { defaultWorkDays } from '@vertex/shared';

export interface Availability {
  /** Visitors may ask for a meeting at all. */
  enabled: boolean;
  /** IANA zone the hours are in, e.g. "Africa/Cairo". */
  timezone: string;
  /** Weekdays, 0 = Sunday. */
  days: number[];
  /** "09:00" and "17:00": the first start and when the last meeting must end. */
  start: string;
  end: string;
  /** Minutes per meeting. */
  length: number;
  /** Hours of warning the owner needs before a meeting. */
  notice: number;
}

export const DEFAULT_AVAILABILITY: Availability = {
  enabled: true,
  timezone: 'UTC',
  days: [1, 2, 3, 4, 5],
  start: '09:00',
  end: '17:00',
  length: 30,
  notice: 2,
};

/** How far ahead a visitor can book. */
export const BOOKING_DAYS = 14;

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function validTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The card's availability, with anything missing or malformed replaced by the
 * defaults. `fallbackZone` is the workspace's zone, for cards never set up.
 */
export function availabilityOf(theme: unknown, fallbackZone?: string): Availability {
  const t = (theme && typeof theme === 'object' ? (theme as Record<string, unknown>).availability : null) as Record<string, unknown> | null;
  const a = t && typeof t === 'object' ? t : {};
  const start = typeof a.start === 'string' && TIME.test(a.start) ? a.start : DEFAULT_AVAILABILITY.start;
  let end = typeof a.end === 'string' && TIME.test(a.end) ? a.end : DEFAULT_AVAILABILITY.end;
  if (minutes(end) <= minutes(start)) end = DEFAULT_AVAILABILITY.end;
  const timezone = validTimeZone(a.timezone) ? a.timezone : validTimeZone(fallbackZone) ? fallbackZone : DEFAULT_AVAILABILITY.timezone;
  // Until the owner picks days, the week is the one where they work: Sunday to
  // Thursday in Cairo or on an Arabic card, Monday to Friday elsewhere.
  const lang = theme && typeof theme === 'object' ? (theme as Record<string, unknown>).lang : undefined;
  const days = Array.isArray(a.days)
    ? [...new Set(a.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : defaultWorkDays(timezone, lang);
  return {
    enabled: a.enabled !== false,
    timezone,
    days,
    start,
    end,
    length: [15, 20, 30, 45, 60, 90].includes(a.length as number) ? (a.length as number) : DEFAULT_AVAILABILITY.length,
    notice: typeof a.notice === 'number' && a.notice >= 0 && a.notice <= 72 ? a.notice : DEFAULT_AVAILABILITY.notice,
  };
}

/** Minutes the zone is ahead of UTC at that instant. */
function offsetAt(instant: number, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  return Math.round((asUtc - instant) / 60_000);
}

/** The instant a wall-clock time on a date in a zone happens. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const wall = Date.UTC(y!, m! - 1, d!, Number(time.slice(0, 2)), Number(time.slice(3, 5)));
  // Twice, so a clock change between the guess and the answer is taken in.
  let utc = wall - offsetAt(wall, tz) * 60_000;
  utc = wall - offsetAt(utc, tz) * 60_000;
  return new Date(utc);
}

/** The calendar date in a zone, as YYYY-MM-DD. */
export function dateIn(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

export interface OpenDay {
  date: string;
  slots: { time: string; at: string }[];
}

/** A stretch of time the owner is taken (from their own calendar). */
export interface BusyTime {
  start: Date;
  end: Date;
}

/**
 * The open times over the next two weeks: on working days, inside working
 * hours, after the notice period, not overlapping a meeting already asked
 * for, and not when the owner's own calendar says they are busy.
 */
export function openSlots(a: Availability, now: Date, booked: Date[], days = BOOKING_DAYS, busy: BusyTime[] = []): OpenDay[] {
  if (!a.enabled) return [];
  const earliest = now.getTime() + a.notice * 3_600_000;
  const taken = booked.map((b) => b.getTime());
  const length = a.length * 60_000;
  const today = dateIn(now, a.timezone);
  const out: OpenDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const [y, m, d] = date.split('-').map(Number);
    if (!a.days.includes(new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay())) continue;
    const slots: OpenDay['slots'] = [];
    for (let t = minutes(a.start); t + a.length <= minutes(a.end); t += a.length) {
      const at = zonedToUtc(date, hhmm(t), a.timezone).getTime();
      if (at < earliest) continue;
      if (taken.some((b) => b < at + length && at < b + length)) continue;
      if (busy.some((b) => b.start.getTime() < at + length && at < b.end.getTime())) continue;
      slots.push({ time: hhmm(t), at: new Date(at).toISOString() });
    }
    if (slots.length) out.push({ date, slots });
  }
  return out;
}

/** Whether an instant is one of the open times (what a booking must be). */
export function isOpen(a: Availability, now: Date, booked: Date[], at: string, busy: BusyTime[] = []): boolean {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return false;
  const iso = when.toISOString();
  return openSlots(a, now, booked, BOOKING_DAYS, busy).some((d) => d.slots.some((s) => s.at === iso));
}
