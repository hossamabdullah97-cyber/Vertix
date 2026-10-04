import type { GoalPeriod } from '@vertex/shared';

const DAY = 86_400_000;

/** How far `zone` is ahead of UTC at `at`, in ms. */
function offsetMs(zone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - (at.getTime() - at.getMilliseconds());
}

/** The instant a local calendar day starts in `zone`. */
function localMidnight(zone: string, y: number, m: number, d: number): Date {
  const guess = Date.UTC(y, m, d);
  // Twice, so a day on which the clocks change still lands on its own midnight.
  const first = guess - offsetMs(zone, new Date(guess));
  return new Date(guess - offsetMs(zone, new Date(first)));
}

/**
 * The week (from Sunday, the first working day in Egypt) or calendar month
 * that `now` falls in, in the workspace's time zone, and how much of it has
 * gone: what "on pace" is measured against.
 */
export function goalWindow(period: GoalPeriod, zone: string, now = new Date()): { from: Date; to: Date; elapsed: number } {
  const local = new Date(now.getTime() + offsetMs(zone, now));
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  let from: Date;
  let to: Date;
  if (period === 'WEEK') {
    const start = d - local.getUTCDay();
    from = localMidnight(zone, y, m, start);
    to = localMidnight(zone, y, m, start + 7);
  } else {
    from = localMidnight(zone, y, m, 1);
    to = localMidnight(zone, y, m + 1, 1);
  }
  const elapsed = Math.min(1, Math.max(0, (now.getTime() - from.getTime()) / (to.getTime() - from.getTime())));
  return { from, to, elapsed };
}

export const daysLeft = (to: Date, now = new Date()) => Math.max(0, Math.ceil((to.getTime() - now.getTime()) / DAY));
