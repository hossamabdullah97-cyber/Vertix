/**
 * How long a deleted card, link, section or payment link can be brought
 * back. It backs the "Undo" shown after a delete, so it is short: an undo,
 * not a recycle bin.
 */
export const RESTORE_WINDOW_MS = 10 * 60_000;

/** A where clause for rows deleted within the window. */
export const recentlyDeleted = (now = Date.now()) => ({ deletedAt: { gte: new Date(now - RESTORE_WINDOW_MS) } });
