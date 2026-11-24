/**
 * "A webhook delivery is waiting": rung by whatever queues one (an event, a
 * replay, an admin's retry) so the dispatcher sends it at once, instead of
 * asking the database every few seconds whether there is anything to send.
 * In-process, as the dispatcher is single-instance.
 */
const listeners = new Set<() => void>();

export function webhookQueued(): void {
  for (const listener of listeners) listener();
}

/** Listens for queued deliveries; returns the way to stop listening. */
export function onWebhookQueued(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
