import { actionHref, actionLabel } from './actions';
import type { PublicCardAction } from './api';

export interface Brand {
  label: string;
  color: string;
  icon: string; // Icon component name
}

// Platform detection by URL — lets a WEBSITE/LINKEDIN action render with its
// real brand icon + colour without any schema changes.
const DOMAIN_BRANDS: { match: RegExp; brand: Brand }[] = [
  { match: /wa\.me|whatsapp\.com|api\.whatsapp/i, brand: { label: 'WhatsApp', color: '#25D366', icon: 'whatsapp' } },
  { match: /instagram\.com/i, brand: { label: 'Instagram', color: '#E1306C', icon: 'instagram' } },
  { match: /(?:twitter|x)\.com/i, brand: { label: 'X', color: '#000000', icon: 'twitter' } },
  { match: /facebook\.com|fb\.com|fb\.me/i, brand: { label: 'Facebook', color: '#1877F2', icon: 'facebook' } },
  { match: /linkedin\.com/i, brand: { label: 'LinkedIn', color: '#0A66C2', icon: 'linkedin' } },
  { match: /youtube\.com|youtu\.be/i, brand: { label: 'YouTube', color: '#FF0000', icon: 'youtube' } },
  { match: /t\.me|telegram\.(me|org)/i, brand: { label: 'Telegram', color: '#26A5E4', icon: 'telegram' } },
  { match: /tiktok\.com/i, brand: { label: 'TikTok', color: '#010101', icon: 'tiktok' } },
  { match: /github\.com/i, brand: { label: 'GitHub', color: '#181717', icon: 'github' } },
  { match: /snapchat\.com/i, brand: { label: 'Snapchat', color: '#FFFC00', icon: 'snapchat' } },
  { match: /maps\.(google|app)\.|goo\.gl\/maps/i, brand: { label: 'Location', color: '#EA4335', icon: 'map-pin' } },
  { match: /cal\.com|calendly\.com/i, brand: { label: 'Book a meeting', color: '#7C3AED', icon: 'calendar' } },
];

// Fallback brand per action type.
const TYPE_BRANDS: Record<string, Brand> = {
  WHATSAPP: { label: 'WhatsApp', color: '#25D366', icon: 'whatsapp' },
  CALL: { label: 'Call', color: '#16A34A', icon: 'phone' },
  EMAIL: { label: 'Email', color: '#EA4335', icon: 'mail' },
  LINKEDIN: { label: 'LinkedIn', color: '#0A66C2', icon: 'linkedin' },
  WEBSITE: { label: 'Website', color: '#4F46E5', icon: 'globe' },
  BOOK_MEETING: { label: 'Book a meeting', color: '#7C3AED', icon: 'calendar' },
  REQUEST_QUOTE: { label: 'Request a quote', color: '#DB2777', icon: 'quote' },
  MAPS: { label: 'Directions', color: '#EA4335', icon: 'map-pin' },
  FILE: { label: 'Download', color: '#0EA5E9', icon: 'download' },
  SAVE_CONTACT: { label: 'Save contact', color: '#4F46E5', icon: 'user-plus' },
};

export interface ResolvedAction {
  href: string;
  brand: Brand;
  subtitle: string;
  isQuickContact: boolean;
}

/** Contact methods shown as round quick-action buttons at the top. */
const QUICK_TYPES = new Set(['CALL', 'EMAIL', 'WHATSAPP']);

/** Networks whose address ends in the person's handle, and where it sits in the path. */
const HANDLE_SITES: { match: RegExp; skip?: RegExp }[] = [
  { match: /(^|\.)instagram\.com$/i },
  { match: /(^|\.)(twitter|x)\.com$/i },
  { match: /(^|\.)tiktok\.com$/i },
  { match: /(^|\.)github\.com$/i },
  { match: /(^|\.)(t\.me|telegram\.me)$/i },
  { match: /(^|\.)snapchat\.com$/i, skip: /^add$/i },
  { match: /(^|\.)(facebook\.com|fb\.com|fb\.me)$/i },
  { match: /(^|\.)youtube\.com$/i, skip: /^(c|channel|user)$/i },
  // linkedin.com/in/<name>, linkedin.com/company/<name>
  { match: /(^|\.)linkedin\.com$/i, skip: /^(in|company|school)$/i },
];

/**
 * What a visitor reads under a link's name: "@mona.hassan" for a social
 * profile rather than its whole address, the bare domain for a website, and
 * nothing for a map (its name already says it). A phone, email or anything
 * that is not a web address is shown as it is.
 */
export function handleOf(raw: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:/i.test(raw)) return raw;
  let u: URL;
  try {
    u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return raw;
  }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return raw;
  const host = u.hostname.replace(/^(www|m|mobile)\./i, '');
  if (/^(maps\.(google|app)\.|goo\.gl$)/i.test(host) || (/^google\.[a-z.]+$/i.test(host) && u.pathname.startsWith('/maps'))) return '';
  const site = HANDLE_SITES.find((s) => s.match.test(host));
  if (site) {
    const parts = u.pathname.split('/').filter(Boolean);
    const at = parts.findIndex((p) => !(site.skip?.test(p)) && !/^(profile\.php|pages|people)$/i.test(p));
    const name = at >= 0 ? decodeURIComponent(parts[at]).replace(/^@/, '') : '';
    if (name && !/^(share|sharer|p|reel|watch|status)$/i.test(name)) return `@${name}`;
  }
  const path = u.pathname.replace(/\/$/, '');
  return host + (path && path.length <= 24 ? path : '');
}

function subtitleOf(action: PublicCardAction): string {
  const c = action.config ?? {};
  if (typeof c.url === 'string' && c.url) return handleOf(c.url);
  const raw = (c.phone as string) || (c.email as string) || (c.query as string) || '';
  return raw.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

/** Resolves an action to its href, brand (icon + colour + label), and subtitle. */
export function resolveAction(action: PublicCardAction, slug: string): ResolvedAction | null {
  const href = actionHref(action, slug);
  if (!href) return null;

  let brand = TYPE_BRANDS[action.type] ?? { label: actionLabel(action.type), color: '#4F46E5', icon: 'link' };
  const url = typeof action.config?.url === 'string' ? (action.config.url as string) : '';
  if (url) {
    const match = DOMAIN_BRANDS.find((d) => d.match.test(url));
    if (match) brand = match.brand;
  }

  const c = action.config ?? {};
  const isQuickContact = typeof c.isQuick === 'boolean' ? c.isQuick : QUICK_TYPES.has(action.type);

  return {
    href,
    brand,
    subtitle: subtitleOf(action),
    isQuickContact,
  };
}
