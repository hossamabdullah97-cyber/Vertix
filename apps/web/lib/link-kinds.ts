import type { CardAction } from './client';

/**
 * What can be put on a card as a button, and how each one is filled in: the
 * Studio asks for the one thing a kind needs (a number, an address, a
 * username or a link) before the button exists, so nothing empty reaches
 * the card. The stored shape is the API's (`type` + `config.phone | email |
 * url | query`), read by lib/actions.ts on the public card.
 */

export type LinkCategory = 'quickActions' | 'socialMedia' | 'business' | 'media' | 'custom';
export const LINK_CATEGORIES: LinkCategory[] = ['quickActions', 'socialMedia', 'business', 'media', 'custom'];

export interface LinkKind {
  key: string;
  label: string;
  arLabel: string;
  color: string;
  icon: string;
  type: string;
  /** Where a profile on that site starts: the owner then types only their username. */
  initialUrl?: string;
  category: LinkCategory;
}

export const LINK_KINDS: LinkKind[] = [
  { key: 'CALL', label: 'Phone', arLabel: 'رقم الهاتف', color: '#10b981', icon: 'phone', type: 'CALL', category: 'quickActions' },
  { key: 'WHATSAPP', label: 'WhatsApp', arLabel: 'واتساب', color: '#25d366', icon: 'whatsapp', type: 'WHATSAPP', category: 'quickActions' },
  { key: 'EMAIL', label: 'Email', arLabel: 'البريد الإلكتروني', color: '#ef4444', icon: 'mail', type: 'EMAIL', category: 'quickActions' },
  { key: 'SMS', label: 'SMS', arLabel: 'رسالة قصيرة', color: '#0ea5e9', icon: 'message', type: 'WEBSITE', initialUrl: 'sms:', category: 'quickActions' },
  { key: 'MAPS', label: 'Location', arLabel: 'الموقع على الخريطة', color: '#f43f5e', icon: 'map-pin', type: 'MAPS', category: 'quickActions' },
  { key: 'SAVE_CONTACT', label: 'Save contact', arLabel: 'حفظ جهة الاتصال', color: '#1d4ed8', icon: 'user-plus', type: 'SAVE_CONTACT', category: 'quickActions' },

  { key: 'LINKEDIN', label: 'LinkedIn', arLabel: 'لينكد إن', color: '#0a66c2', icon: 'linkedin', type: 'LINKEDIN', initialUrl: 'https://linkedin.com/in/', category: 'socialMedia' },
  { key: 'INSTAGRAM', label: 'Instagram', arLabel: 'انستجرام', color: '#e1306c', icon: 'instagram', type: 'WEBSITE', initialUrl: 'https://instagram.com/', category: 'socialMedia' },
  { key: 'FACEBOOK', label: 'Facebook', arLabel: 'فيسبوك', color: '#1877f2', icon: 'facebook', type: 'WEBSITE', initialUrl: 'https://facebook.com/', category: 'socialMedia' },
  { key: 'TIKTOK', label: 'TikTok', arLabel: 'تيك توك', color: '#ff0050', icon: 'youtube', type: 'WEBSITE', initialUrl: 'https://tiktok.com/@', category: 'socialMedia' },
  { key: 'TWITTER', label: 'X / Twitter', arLabel: 'إكس / تويتر', color: '#000000', icon: 'twitter', type: 'WEBSITE', initialUrl: 'https://x.com/', category: 'socialMedia' },
  { key: 'YOUTUBE', label: 'YouTube', arLabel: 'يوتيوب', color: '#ff0000', icon: 'youtube', type: 'WEBSITE', initialUrl: 'https://youtube.com/@', category: 'socialMedia' },
  { key: 'SNAPCHAT', label: 'Snapchat', arLabel: 'سناب شات', color: '#fffc00', icon: 'snapchat', type: 'WEBSITE', initialUrl: 'https://snapchat.com/add/', category: 'socialMedia' },
  { key: 'TELEGRAM', label: 'Telegram', arLabel: 'تليجرام', color: '#24a1de', icon: 'telegram', type: 'WEBSITE', initialUrl: 'https://t.me/', category: 'socialMedia' },
  { key: 'THREADS', label: 'Threads', arLabel: 'ثريدز', color: '#000000', icon: 'link', type: 'WEBSITE', initialUrl: 'https://threads.net/@', category: 'socialMedia' },
  { key: 'PINTEREST', label: 'Pinterest', arLabel: 'بينتريست', color: '#bd081c', icon: 'tag', type: 'WEBSITE', initialUrl: 'https://pinterest.com/', category: 'socialMedia' },
  { key: 'BEHANCE', label: 'Behance', arLabel: 'بيهانس', color: '#1769ff', icon: 'layers', type: 'WEBSITE', initialUrl: 'https://behance.net/', category: 'socialMedia' },
  { key: 'DRIBBBLE', label: 'Dribbble', arLabel: 'دريبل', color: '#ea4c89', icon: 'globe', type: 'WEBSITE', initialUrl: 'https://dribbble.com/', category: 'socialMedia' },
  { key: 'GITHUB', label: 'GitHub', arLabel: 'جيتهاب', color: '#24292e', icon: 'github', type: 'WEBSITE', initialUrl: 'https://github.com/', category: 'socialMedia' },
  { key: 'REDDIT', label: 'Reddit', arLabel: 'ريديت', color: '#ff4500', icon: 'users', type: 'WEBSITE', initialUrl: 'https://reddit.com/u/', category: 'socialMedia' },
  { key: 'DISCORD', label: 'Discord', arLabel: 'ديسكورد', color: '#5865f2', icon: 'message', type: 'WEBSITE', initialUrl: 'https://discord.gg/', category: 'socialMedia' },

  { key: 'WEBSITE', label: 'Website', arLabel: 'موقع إلكتروني', color: '#2563eb', icon: 'globe', type: 'WEBSITE', category: 'business' },
  { key: 'PORTFOLIO', label: 'Portfolio', arLabel: 'معرض الأعمال', color: '#3b82f6', icon: 'briefcase', type: 'WEBSITE', category: 'business' },
  { key: 'STORE', label: 'Online store', arLabel: 'المتجر الإلكتروني', color: '#10b981', icon: 'globe', type: 'WEBSITE', category: 'business' },
  { key: 'PRODUCT', label: 'Product link', arLabel: 'رابط المنتج', color: '#0ea5e9', icon: 'tag', type: 'WEBSITE', category: 'business' },
  { key: 'CALENDLY', label: 'Calendly', arLabel: 'حجز كاليندلي', color: '#006bff', icon: 'calendar', type: 'BOOK_MEETING', initialUrl: 'https://calendly.com/', category: 'business' },
  { key: 'BOOKING', label: 'Booking page', arLabel: 'صفحة الحجز', color: '#f59e0b', icon: 'clock', type: 'BOOK_MEETING', category: 'business' },
  { key: 'ZOOM', label: 'Zoom meeting', arLabel: 'اجتماع زووم', color: '#2d8cff', icon: 'youtube', type: 'BOOK_MEETING', category: 'business' },
  { key: 'GOOGLE_MEET', label: 'Google Meet', arLabel: 'جوجل ميت', color: '#00897b', icon: 'youtube', type: 'BOOK_MEETING', category: 'business' },
  { key: 'TEAMS', label: 'Microsoft Teams', arLabel: 'مايكروسوفت تيمز', color: '#464eb8', icon: 'youtube', type: 'BOOK_MEETING', category: 'business' },
  { key: 'PAYPAL', label: 'PayPal', arLabel: 'بايبال', color: '#003087', icon: 'globe', type: 'WEBSITE', initialUrl: 'https://paypal.me/', category: 'business' },
  { key: 'STRIPE', label: 'Stripe', arLabel: 'سترايب', color: '#635bff', icon: 'link', type: 'WEBSITE', category: 'business' },
  { key: 'REQUEST_QUOTE', label: 'Request a quote', arLabel: 'طلب تسعيرة', color: '#0ea5e9', icon: 'file-text', type: 'REQUEST_QUOTE', category: 'business' },

  { key: 'VIDEO', label: 'Video', arLabel: 'رابط فيديو', color: '#ff0000', icon: 'youtube', type: 'WEBSITE', category: 'media' },
  { key: 'GALLERY', label: 'Gallery', arLabel: 'معرض صور', color: '#ec4899', icon: 'image', type: 'WEBSITE', category: 'media' },
  { key: 'PDF', label: 'PDF document', arLabel: 'ملف PDF', color: '#ef4444', icon: 'file-text', type: 'FILE', category: 'media' },
  { key: 'RESUME', label: 'Resume', arLabel: 'السيرة الذاتية', color: '#10b981', icon: 'file-text', type: 'FILE', category: 'media' },
  { key: 'PRESENTATION', label: 'Presentation', arLabel: 'عرض تقديمي', color: '#f59e0b', icon: 'file-text', type: 'FILE', category: 'media' },
  { key: 'DOWNLOAD', label: 'Download a file', arLabel: 'تحميل ملف', color: '#64748b', icon: 'download', type: 'FILE', category: 'media' },

  { key: 'CUSTOM', label: 'Custom link', arLabel: 'رابط مخصص', color: '#3b82f6', icon: 'link', type: 'WEBSITE', category: 'custom' },
];

/** The kinds offered first, as tiles: what most cards have. */
export const QUICK_ADD = ['WHATSAPP', 'CALL', 'EMAIL', 'WEBSITE', 'INSTAGRAM', 'LINKEDIN', 'FACEBOOK', 'TIKTOK', 'MAPS'];

export const kindByKey = (key: string): LinkKind | undefined => LINK_KINDS.find((k) => k.key === key);

/** The kind a button is, when it is shown in the Studio: the site its address goes to when that is known, else its type. */
const URL_KINDS: [RegExp, string][] = [
  [/instagram\.com/i, 'INSTAGRAM'],
  [/facebook\.com|fb\.com|fb\.me/i, 'FACEBOOK'],
  [/(?:^|\/\/|\.)(?:twitter|x)\.com/i, 'TWITTER'],
  [/youtube\.com|youtu\.be/i, 'YOUTUBE'],
  [/t\.me\/|telegram\.(me|org)/i, 'TELEGRAM'],
  [/github\.com/i, 'GITHUB'],
  [/snapchat\.com/i, 'SNAPCHAT'],
  [/threads\.net/i, 'THREADS'],
  [/tiktok\.com/i, 'TIKTOK'],
  [/pinterest\.com/i, 'PINTEREST'],
  [/behance\.net/i, 'BEHANCE'],
  [/dribbble\.com/i, 'DRIBBBLE'],
  [/reddit\.com/i, 'REDDIT'],
  [/discord\.(gg|com)/i, 'DISCORD'],
  [/paypal\.me/i, 'PAYPAL'],
  [/stripe\.com/i, 'STRIPE'],
  [/calendly\.com/i, 'CALENDLY'],
  [/zoom\.us/i, 'ZOOM'],
  [/meet\.google\.com/i, 'GOOGLE_MEET'],
  [/teams\.microsoft\.com/i, 'TEAMS'],
  [/^sms:/i, 'SMS'],
];
const TYPE_KINDS: Record<string, string> = {
  CALL: 'CALL',
  WHATSAPP: 'WHATSAPP',
  EMAIL: 'EMAIL',
  LINKEDIN: 'LINKEDIN',
  MAPS: 'MAPS',
  SAVE_CONTACT: 'SAVE_CONTACT',
  BOOK_MEETING: 'BOOKING',
  REQUEST_QUOTE: 'REQUEST_QUOTE',
  FILE: 'DOWNLOAD',
  WEBSITE: 'WEBSITE',
};
export function kindOf(a: Pick<CardAction, 'type' | 'config'>): LinkKind {
  const url = typeof a.config?.url === 'string' ? a.config.url : '';
  if (url && (a.type === 'WEBSITE' || a.type === 'BOOK_MEETING')) {
    const hit = URL_KINDS.find(([re]) => re.test(url));
    const kind = hit && kindByKey(hit[1]);
    if (kind) return kind;
  }
  return kindByKey(TYPE_KINDS[a.type] ?? 'WEBSITE') ?? kindByKey('WEBSITE')!;
}

/** What a kind asks for. */
export type ValueInput = 'phone' | 'email' | 'url' | 'handle' | 'place' | 'none';
export function inputOf(kind: LinkKind): ValueInput {
  if (kind.type === 'CALL' || kind.type === 'WHATSAPP') return 'phone';
  if (kind.type === 'EMAIL') return 'email';
  if (kind.type === 'SAVE_CONTACT') return 'none';
  if (kind.type === 'MAPS') return 'place';
  if (kind.key === 'SMS') return 'phone';
  if (kind.initialUrl && /^https:\/\//.test(kind.initialUrl)) return 'handle';
  return 'url';
}

/** The prefix shown before a username ("instagram.com/"), without the scheme. */
export const handlePrefix = (kind: LinkKind) => (kind.initialUrl ?? '').replace(/^https?:\/\/(www\.)?/, '');

/** A web address as the card needs it: https:// added to a bare domain; other schemes (sms:, mailto:) kept. */
export function normalizeUrl(raw: string): string {
  const v = raw.trim();
  if (!v || /^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
  return `https://${v}`;
}

const looksLikeUrl = (v: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(v) || /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(v);

/**
 * The config a value becomes. A username is put after the site's address; a
 * whole link pasted instead is kept as it is.
 */
export function configFor(kind: LinkKind, raw: string): Record<string, unknown> {
  const v = raw.trim();
  switch (inputOf(kind)) {
    case 'phone':
      return kind.key === 'SMS' ? { url: `sms:${v.replace(/[^\d+]/g, '')}` } : { phone: v };
    case 'email':
      return { email: v };
    case 'none':
      return {};
    case 'place':
      return looksLikeUrl(v) ? { url: normalizeUrl(v) } : { query: v };
    case 'handle': {
      // A username can hold dots ("mariam.k") and a path ("mariam/30min"); only a
      // scheme, or a domain before the first slash, makes it a whole link.
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) || /^[^/\s]+\.[^/\s]+\//.test(v)) return { url: normalizeUrl(v) };
      const handle = v.replace(/^@/, '');
      // A site whose addresses carry the @ already ("tiktok.com/@") takes the name without it.
      return { url: `${kind.initialUrl}${handle}` };
    }
    default:
      return { url: normalizeUrl(v) };
  }
}

/** The value a button holds, as its field shows it (a username alone when it is on that site). */
export function valueOf(kind: LinkKind, config: Record<string, unknown>): string {
  const s = (k: string) => (typeof config[k] === 'string' ? (config[k] as string) : '');
  switch (inputOf(kind)) {
    case 'phone':
      return kind.key === 'SMS' ? s('url').replace(/^sms:/i, '') : s('phone');
    case 'email':
      return s('email');
    case 'none':
      return '';
    case 'place':
      return s('url') || s('query');
    case 'handle': {
      const url = s('url');
      const prefix = kind.initialUrl ?? '';
      const bare = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, '');
      return prefix && bare(url).toLowerCase().startsWith(bare(prefix).toLowerCase()) ? bare(url).slice(bare(prefix).length) : url;
    }
    default:
      return s('url');
  }
}

/** The destination a row shows under the button's name. */
export function summaryOf(a: Pick<CardAction, 'type' | 'config'>): string {
  const c = a.config ?? {};
  const raw = ((c.phone || c.email || c.url || c.query || '') as string) ?? '';
  return raw.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

/** Why a value cannot be used yet, or null. */
export function valueProblem(kind: LinkKind, raw: string): 'required' | 'phone' | 'email' | 'url' | null {
  const v = raw.trim();
  const input = inputOf(kind);
  if (input === 'none') return null;
  if (!v) return 'required';
  if (input === 'phone') {
    const digits = v.replace(/\D/g, '').length;
    return digits < 7 || !/^[+\d\s().-]+$/.test(v) ? 'phone' : null;
  }
  if (input === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'email';
  if (input === 'handle') return /\s/.test(v) ? 'url' : null;
  if (input === 'url') return /\s/.test(v) || !/[.:]/.test(v) ? 'url' : null;
  return null;
}

/** In the row of round buttons under the name, unless the owner moved it. */
export function isQuickAction(a: Pick<CardAction, 'type' | 'config'>): boolean {
  if (typeof a.config.isQuick === 'boolean') return a.config.isQuick;
  return ['CALL', 'EMAIL', 'WHATSAPP'].includes(a.type);
}

/** Where a new button of this kind goes by default. */
export const quickByDefault = (kind: LinkKind) => ['CALL', 'EMAIL', 'WHATSAPP'].includes(kind.type);

/** A button on, but going nowhere: shown to the owner as unfinished. */
export function isUnfinished(a: Pick<CardAction, 'type' | 'config'>): boolean {
  return a.type !== 'SAVE_CONTACT' && !summaryOf(a).trim();
}

/**
 * What a pasted or typed value is, for the Studio's one box: an email, a phone
 * number (WhatsApp or a call: the owner picks), or a link, named after the
 * site it goes to, with the value its dialog starts from. Null when it is
 * none of these.
 */
export type Detected = { kind: LinkKind; value: string } | { phone: string } | null;
export function detectLink(raw: string): Detected {
  const v = raw.trim();
  if (!v) return null;
  if (/^(mailto:)?[^\s@/]+@[^\s@/]+\.[^\s@/]+$/i.test(v)) return { kind: kindByKey('EMAIL')!, value: v.replace(/^mailto:/i, '') };
  if (/^(tel:)?\+?[\d\s().-]+$/i.test(v) && v.replace(/\D/g, '').length >= 7) return { phone: v.replace(/^tel:/i, '').trim() };
  if (!looksLikeUrl(v)) return null;
  const url = normalizeUrl(v);
  // A WhatsApp chat link is a number.
  const wa = url.match(/^https?:\/\/(?:api\.)?(?:wa\.me|whatsapp\.com\/send\?phone=)\/?\+?(\d{7,})/i);
  if (wa) return { kind: kindByKey('WHATSAPP')!, value: `+${wa[1]}` };
  if (/linkedin\.com\//i.test(url)) {
    const kind = kindByKey('LINKEDIN')!;
    return { kind, value: valueOf(kind, { url }) };
  }
  if (/(maps\.google\.|google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(url)) return { kind: kindByKey('MAPS')!, value: url };
  const kind = kindOf({ type: 'WEBSITE', config: { url } });
  return { kind, value: inputOf(kind) === 'handle' ? valueOf(kind, { url }) : url };
}
