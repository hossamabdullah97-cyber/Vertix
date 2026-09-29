import { BOOKING_DAYS } from './availability';

/** Enough of the database to read a card's meeting requests. */
interface Db {
  leadActivity: {
    findMany(args: unknown): Promise<{ metadata: unknown }[]>;
  };
}

/**
 * The times already asked for on a card: meeting requests from its exchange
 * form (kept on the lead's activity), from leads that still exist. Requests
 * can be made up to two weeks ahead, so older activity cannot matter.
 */
export async function bookedMeetings(db: Db, cardId: string, now: Date): Promise<Date[]> {
  const since = new Date(now.getTime() - (BOOKING_DAYS + 1) * 86_400_000);
  const rows = await db.leadActivity.findMany({
    where: { type: 'MEETING', createdAt: { gte: since }, lead: { cardId, deletedAt: null } },
    select: { metadata: true },
  });
  const out: Date[] = [];
  for (const r of rows) {
    const at = (r.metadata as Record<string, unknown> | null)?.meetingAt;
    const d = typeof at === 'string' ? new Date(at) : null;
    if (d && !Number.isNaN(d.getTime()) && d.getTime() >= now.getTime()) out.push(d);
  }
  return out;
}
