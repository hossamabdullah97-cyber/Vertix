import { API_URL, type PublicCardAction } from './api';

const LABELS: Record<string, string> = {
  SAVE_CONTACT: 'Save contact',
  WHATSAPP: 'WhatsApp',
  LINKEDIN: 'LinkedIn',
  BOOK_MEETING: 'Book a meeting',
  REQUEST_QUOTE: 'Request a quote',
  CALL: 'Call',
  EMAIL: 'Email',
  MAPS: 'Directions',
  WEBSITE: 'Website',
  FILE: 'Download',
};

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function digits(v: string): string {
  return v.replace(/[^0-9]/g, '');
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  // Already has a protocol (http, https, tel, mailto, etc.)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Builds the destination URL for a card action (mirrors the API action-resolver). */
export function actionHref(
  action: PublicCardAction,
  slug: string,
): string | null {
  const c = action.config ?? {};
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
      if (url) return normalizeUrl(url);
      const query = str(c.query);
      return query
        ? `https://maps.google.com/?q=${encodeURIComponent(query)}`
        : null;
    }
    case 'SAVE_CONTACT':
      return `${API_URL}/c/${slug}/vcard`;
    case 'LINKEDIN':
    case 'WEBSITE':
    case 'BOOK_MEETING':
    case 'REQUEST_QUOTE':
    case 'FILE':
      return url ? normalizeUrl(url) : null;
    default:
      return null;
  }
}

export function actionLabel(type: string): string {
  return LABELS[type] ?? type;
}
