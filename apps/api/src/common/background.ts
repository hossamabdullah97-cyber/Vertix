/**
 * How often the background sweeps (follow-up reminders, goals, tips, the
 * weekly report, plan lapses, the status checks) look at the database.
 *
 * The database (Neon) sleeps after a few minutes without a query and is billed
 * for the time it is awake, so a sweep every few minutes keeps it awake all
 * day. The sweeps therefore share one hourly beat, started together, so the
 * database wakes once an hour for all of them and sleeps in between; requests
 * from people still wake it as they come. Nothing they do needs to be sooner:
 * reminders are measured in hours, the report goes out "from 9:00 on Sunday".
 * `SWEEP_EVERY_MINUTES` overrides it (at least 5).
 */
export const SWEEP_EVERY_MS = Math.max(5, Number(process.env.SWEEP_EVERY_MINUTES) || 60) * 60_000;
