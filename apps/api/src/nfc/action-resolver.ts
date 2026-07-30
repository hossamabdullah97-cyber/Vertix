import type { ActionType } from '@vertex/shared';

export interface ActionLike {
  type: ActionType;
  config: unknown;
}

export interface ResolveContext {
  /** Public vCard download URL for this card. */
  vcardUrl: string;
  /** Public card page URL for this card. */
  cardPageUrl: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Keeps digits only (for phone numbers in wa.me / tel links). */
function digits(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

/**
 * Maps a card action (type + config) to a concrete destination URL.
 * Returns null when the action lacks the data needed to build a target.
 */
export function resolveActionTarget(
  action: ActionLike,
  ctx: ResolveContext,
): string | null {
  const c = asRecord(action.config);
  const url = str(c.url);
  const phone = str(c.phone);
  const email = str(c.email);

  switch (action.type) {
    case 'WHATSAPP': {
      if (!phone) return null;
      const text = str(c.text);
      return `https://wa.me/${digits(phone)}${
        text ? `?text=${encodeURIComponent(text)}` : ''
      }`;
    }
    case 'CALL':
      return phone ? `tel:${phone}` : null;
    case 'EMAIL':
      return email ? `mailto:${email}` : null;
    case 'MAPS': {
      if (url) return url;
      const query = str(c.query);
      return query
        ? `https://maps.google.com/?q=${encodeURIComponent(query)}`
        : null;
    }
    case 'LINKEDIN':
    case 'WEBSITE':
    case 'BOOK_MEETING':
    case 'REQUEST_QUOTE':
    case 'FILE':
      return url ?? null;
    case 'SAVE_CONTACT':
      return ctx.vcardUrl;
    default:
      return null;
  }
}
