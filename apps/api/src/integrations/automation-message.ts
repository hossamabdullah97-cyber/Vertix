/**
 * The body an automation's webhook action posts. Most receivers (Zapier, Make,
 * n8n, a custom server) take the event as JSON. A Slack incoming webhook only
 * accepts a message, and rejects anything without `text`, so it gets the event
 * as one readable line instead.
 */
export function webhookBody(url: string, event: string, payload: unknown): Record<string, unknown> {
  if (isSlack(url)) {
    const data = ((payload as { data?: unknown })?.data ?? {}) as Record<string, unknown>;
    return { text: summarize(event, data) };
  }
  return { event, ...(payload as object) };
}

function isSlack(url: string): boolean {
  try {
    return new URL(url).hostname === 'hooks.slack.com';
  } catch {
    return false;
  }
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');

/** One line a person can read in a channel. */
export function summarize(event: string, data: Record<string, unknown>): string {
  const who = [str(data.name), str(data.email), str(data.phone), str(data.company)].filter(Boolean).join(' · ');
  const card = str(data.cardSlug) || str(data.slug);
  const from = card ? ` (card: ${card})` : '';
  switch (event) {
    case 'lead.created':
      return `New lead: ${who || 'no details'}${from}`;
    case 'meeting.requested':
      return `Meeting requested by ${who || 'a visitor'}${from}`;
    case 'quote.requested':
      return `Quote requested by ${who || 'a visitor'}${from}`;
    case 'lead.updated':
      return `Lead updated: ${str(data.name) || 'a lead'}`;
    case 'nfc.tapped':
      return `NFC chip ${str(data.tagUid) || ''} tapped${from}`.replace('  ', ' ');
    case 'card.viewed':
      return `Card viewed${from}`;
    case 'contact.saved':
      return `Contact saved${from}`;
    case 'member.added':
      return `New member: ${str(data.email) || 'someone'}${str(data.role) ? ` (${str(data.role)})` : ''}`;
    default:
      return `Vertex Connect: ${event}`;
  }
}
