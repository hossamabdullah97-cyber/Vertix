import type { CardRow } from './cards';

/**
 * A card as the editor holds it, and the choices it offers: the same stored
 * shape and the same lists as the website's Studio (apps/web/app/cards/[id],
 * apps/web/lib/templates.ts, apps/web/lib/profile.ts), so a card edited here
 * reads the same there.
 */

export type ActionType = 'SAVE_CONTACT' | 'WHATSAPP' | 'LINKEDIN' | 'BOOK_MEETING' | 'REQUEST_QUOTE' | 'CALL' | 'EMAIL' | 'MAPS' | 'WEBSITE' | 'FILE';

export interface CardAction {
  id: string;
  type: ActionType;
  order: number;
  isActive: boolean;
  config: Record<string, unknown>;
}

export interface CardSection {
  id: string;
  type: string;
  order: number;
  isVisible: boolean;
  content: Record<string, unknown>;
}

export interface FullCard extends CardRow {
  templateId: string;
  theme: Record<string, unknown> | null;
  sections?: CardSection[];
  actions?: CardAction[];
}

// ------------------------------------------------------------------ identity

/** The fields of the card's identity the app edits; the rest of vcardData is kept as it is. */
export const IDENTITY_KEYS = ['fullName', 'title', 'company', 'phone', 'email', 'location', 'avatar', 'coverImage'] as const;
export type IdentityKey = (typeof IDENTITY_KEYS)[number];
export type Identity = Record<IdentityKey, string>;

export function identityOf(card: Pick<CardRow, 'vcardData'>): Identity {
  const v = (card.vcardData ?? {}) as Record<string, unknown>;
  const out = {} as Identity;
  for (const k of IDENTITY_KEYS) out[k] = typeof v[k] === 'string' ? (v[k] as string) : '';
  // Older cards kept the job title under `org`.
  if (!out.title && typeof v.org === 'string') out.title = v.org;
  return out;
}

/** vcardData with the edited fields laid over it: the server stores it whole, so nothing else may drop out. */
export function vcardWith(card: Pick<CardRow, 'vcardData'>, identity: Identity): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(card.vcardData ?? {}) };
  for (const k of IDENTITY_KEYS) {
    const value = identity[k].trim();
    if (value) next[k] = value;
    else delete next[k];
  }
  return next;
}

/** The About text: the BIO section's body, as the public card reads it. */
export function aboutOf(card: Pick<FullCard, 'sections'>): { section: CardSection | null; text: string } {
  const section = card.sections?.find((s) => s.type === 'BIO') ?? null;
  const c = section?.content ?? {};
  const text = typeof c.body === 'string' ? c.body : typeof c.about === 'string' ? c.about : '';
  return { section, text };
}

// ------------------------------------------------------------------ look

export type Mode = 'light' | 'dark' | 'auto';
export type Cover = 'constellation' | 'gradient' | 'solid' | 'mesh' | 'lines';
export type Layout = 'classic' | 'centered' | 'spotlight' | 'minimal';
export type LinkStyle = 'list' | 'icons' | 'buttons';

export const MODES: Mode[] = ['light', 'dark', 'auto'];
export const COVERS: Cover[] = ['gradient', 'constellation', 'solid', 'mesh', 'lines'];
export const LAYOUTS: Layout[] = ['classic', 'centered', 'spotlight', 'minimal'];
export const LINK_STYLES: LinkStyle[] = ['list', 'icons', 'buttons'];
export const SWATCHES = ['#2563eb', '#1d4ed8', '#06b6d4', '#0ea5e9', '#10b981', '#16a34a', '#ec4899', '#f97316', '#eab308', '#ffffff', '#09090b'];

export interface Template {
  id: string;
  name: string;
  mode: 'light' | 'dark';
  accent: string;
  cover?: Cover;
}

export const TEMPLATES: Template[] = [
  { id: 'carbon', name: 'Carbon', mode: 'dark', accent: '#ffffff', cover: 'constellation' },
  { id: 'onyx', name: 'Onyx', mode: 'dark', accent: '#7f77dd', cover: 'constellation' },
  { id: 'swiss-indigo', name: 'Swiss Indigo', mode: 'light', accent: '#534ab7' },
  { id: 'swiss-teal', name: 'Swiss Teal', mode: 'light', accent: '#1d9e75' },
  { id: 'swiss-coral', name: 'Swiss Coral', mode: 'light', accent: '#d85a30' },
  { id: 'swiss-pink', name: 'Swiss Pink', mode: 'light', accent: '#d4537e' },
  { id: 'swiss-blue', name: 'Swiss Blue', mode: 'light', accent: '#2563eb' },
  { id: 'swiss-amber', name: 'Swiss Amber', mode: 'light', accent: '#b45309' },
  { id: 'swiss-green', name: 'Swiss Green', mode: 'light', accent: '#15803d' },
  { id: 'swiss-slate', name: 'Swiss Slate', mode: 'light', accent: '#475569' },
  { id: 'swiss-violet', name: 'Swiss Violet', mode: 'light', accent: '#7c3aed' },
  { id: 'noir-indigo', name: 'Noir Indigo', mode: 'dark', accent: '#7f77dd' },
  { id: 'noir-teal', name: 'Noir Teal', mode: 'dark', accent: '#5dcaa5' },
  { id: 'noir-coral', name: 'Noir Coral', mode: 'dark', accent: '#f0997b' },
  { id: 'noir-pink', name: 'Noir Pink', mode: 'dark', accent: '#ed93b1' },
  { id: 'noir-blue', name: 'Noir Blue', mode: 'dark', accent: '#60a5fa' },
  { id: 'noir-amber', name: 'Noir Amber', mode: 'dark', accent: '#fbbf24' },
  { id: 'noir-green', name: 'Noir Green', mode: 'dark', accent: '#4ade80' },
  { id: 'noir-mono', name: 'Noir Mono', mode: 'dark', accent: '#e5e5e5' },
];

/** A template's cover when it names none: the dark ones get the night sky. */
export const templateCover = (t: Template): Cover => t.cover ?? (t.mode === 'dark' ? 'constellation' : 'gradient');

export interface Look {
  templateId: string;
  accent: string;
  mode: Mode;
  cover: Cover;
  layout: Layout;
  links: LinkStyle;
  lang: 'en' | 'ar';
  brand: boolean;
  openInApp: boolean;
}

const HEX = /^#[0-9a-f]{6}$/i;
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

/** How the card looks, read the way the public card reads it (apps/web/lib/profile.ts). */
export function lookOf(card: Pick<FullCard, 'templateId' | 'theme'>): Look {
  const th = card.theme ?? {};
  const mode = oneOf(MODES, th.mode, 'light');
  return {
    templateId: card.templateId,
    accent: typeof th.accent === 'string' && HEX.test(th.accent) ? th.accent : '#2563eb',
    mode,
    cover: oneOf(COVERS, th.cover, mode === 'dark' ? 'constellation' : 'gradient'),
    layout: oneOf(LAYOUTS, th.layout, 'classic'),
    links: oneOf(LINK_STYLES, th.links, 'list'),
    lang: th.lang === 'ar' ? 'ar' : 'en',
    brand: th.brand !== false,
    openInApp: th.openInApp === true,
  };
}

/** The theme keys the app writes. The server lays them over what is stored, so other editors' keys stay. */
export function themeOf(look: Look): Record<string, unknown> {
  const { templateId: _template, ...theme } = look;
  return theme;
}

/** A colour's brightness (0 dark – 1 light), to put readable text on it. */
export function lightness(hex: string): number {
  if (!HEX.test(hex)) return 0;
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// ------------------------------------------------------------------ link

/** The card's address: what /c/<slug> takes (packages/shared, slugField). */
export function slugProblem(slug: string): 'short' | 'long' | 'chars' | null {
  if (slug.length < 3) return 'short';
  if (slug.length > 60) return 'long';
  if (!/^[a-z0-9-]+$/.test(slug)) return 'chars';
  return null;
}

// ------------------------------------------------------------------ buttons

export type Category = 'quick' | 'social' | 'business' | 'media' | 'custom';
export const CATEGORIES: Category[] = ['quick', 'social', 'business', 'media', 'custom'];

export interface Platform {
  key: string;
  en: string;
  ar: string;
  color: string;
  icon: string;
  type: ActionType;
  /** Where its address starts, for a link to a profile on that site. */
  initialUrl?: string;
  category: Category;
}

/** What can be added to a card, as the Studio's picker lists it. */
export const PLATFORMS: Platform[] = [
  { key: 'CALL', en: 'Phone', ar: 'رقم الهاتف', color: '#10b981', icon: 'phone', type: 'CALL', category: 'quick' },
  { key: 'WHATSAPP', en: 'WhatsApp', ar: 'واتساب', color: '#25d366', icon: 'whatsapp', type: 'WHATSAPP', category: 'quick' },
  { key: 'EMAIL', en: 'Email', ar: 'البريد الإلكتروني', color: '#ef4444', icon: 'mail', type: 'EMAIL', category: 'quick' },
  { key: 'SMS', en: 'SMS', ar: 'رسالة قصيرة', color: '#0ea5e9', icon: 'message', type: 'WEBSITE', initialUrl: 'sms:', category: 'quick' },
  { key: 'MAPS', en: 'Location', ar: 'الموقع على الخريطة', color: '#f43f5e', icon: 'map-pin', type: 'MAPS', category: 'quick' },
  { key: 'SAVE_CONTACT', en: 'Save contact', ar: 'حفظ جهة الاتصال', color: '#1d4ed8', icon: 'user-plus', type: 'SAVE_CONTACT', category: 'quick' },

  { key: 'LINKEDIN', en: 'LinkedIn', ar: 'لينكد إن', color: '#0a66c2', icon: 'linkedin', type: 'LINKEDIN', initialUrl: 'https://linkedin.com/in/', category: 'social' },
  { key: 'INSTAGRAM', en: 'Instagram', ar: 'انستجرام', color: '#e1306c', icon: 'instagram', type: 'WEBSITE', initialUrl: 'https://instagram.com/', category: 'social' },
  { key: 'FACEBOOK', en: 'Facebook', ar: 'فيسبوك', color: '#1877f2', icon: 'facebook', type: 'WEBSITE', initialUrl: 'https://facebook.com/', category: 'social' },
  { key: 'TWITTER', en: 'X / Twitter', ar: 'إكس / تويتر', color: '#000000', icon: 'twitter', type: 'WEBSITE', initialUrl: 'https://x.com/', category: 'social' },
  { key: 'TIKTOK', en: 'TikTok', ar: 'تيك توك', color: '#ff0050', icon: 'youtube', type: 'WEBSITE', initialUrl: 'https://tiktok.com/@', category: 'social' },
  { key: 'YOUTUBE', en: 'YouTube', ar: 'يوتيوب', color: '#ff0000', icon: 'youtube', type: 'WEBSITE', initialUrl: 'https://youtube.com/', category: 'social' },
  { key: 'SNAPCHAT', en: 'Snapchat', ar: 'سناب شات', color: '#fffc00', icon: 'snapchat', type: 'WEBSITE', initialUrl: 'https://snapchat.com/add/', category: 'social' },
  { key: 'TELEGRAM', en: 'Telegram', ar: 'تليجرام', color: '#24a1de', icon: 'telegram', type: 'WEBSITE', initialUrl: 'https://t.me/', category: 'social' },
  { key: 'THREADS', en: 'Threads', ar: 'ثريدز', color: '#000000', icon: 'link', type: 'WEBSITE', initialUrl: 'https://threads.net/@', category: 'social' },
  { key: 'PINTEREST', en: 'Pinterest', ar: 'بينتريست', color: '#bd081c', icon: 'tag', type: 'WEBSITE', initialUrl: 'https://pinterest.com/', category: 'social' },
  { key: 'BEHANCE', en: 'Behance', ar: 'بيهانس', color: '#1769ff', icon: 'layers', type: 'WEBSITE', initialUrl: 'https://behance.net/', category: 'social' },
  { key: 'DRIBBBLE', en: 'Dribbble', ar: 'دريبل', color: '#ea4c89', icon: 'globe', type: 'WEBSITE', initialUrl: 'https://dribbble.com/', category: 'social' },
  { key: 'GITHUB', en: 'GitHub', ar: 'جيتهاب', color: '#24292e', icon: 'github', type: 'WEBSITE', initialUrl: 'https://github.com/', category: 'social' },

  { key: 'WEBSITE', en: 'Website', ar: 'موقع إلكتروني', color: '#2563eb', icon: 'globe', type: 'WEBSITE', category: 'business' },
  { key: 'PORTFOLIO', en: 'Portfolio', ar: 'معرض الأعمال', color: '#3b82f6', icon: 'briefcase', type: 'WEBSITE', category: 'business' },
  { key: 'STORE', en: 'Online store', ar: 'المتجر الإلكتروني', color: '#10b981', icon: 'globe', type: 'WEBSITE', category: 'business' },
  { key: 'CALENDLY', en: 'Calendly', ar: 'حجز كاليندلي', color: '#006bff', icon: 'calendar', type: 'BOOK_MEETING', initialUrl: 'https://calendly.com/', category: 'business' },
  { key: 'BOOKING', en: 'Booking page', ar: 'صفحة الحجز', color: '#f59e0b', icon: 'clock', type: 'BOOK_MEETING', category: 'business' },
  { key: 'PAYPAL', en: 'PayPal', ar: 'بايبال', color: '#003087', icon: 'wallet', type: 'WEBSITE', initialUrl: 'https://paypal.me/', category: 'business' },

  { key: 'VIDEO', en: 'Video', ar: 'رابط فيديو', color: '#ff0000', icon: 'youtube', type: 'WEBSITE', category: 'media' },
  { key: 'PDF', en: 'PDF document', ar: 'ملف PDF', color: '#ef4444', icon: 'file-text', type: 'FILE', category: 'media' },
  { key: 'RESUME', en: 'Resume', ar: 'السيرة الذاتية', color: '#10b981', icon: 'file-text', type: 'FILE', category: 'media' },
  { key: 'DOWNLOAD', en: 'Download a file', ar: 'تحميل ملف', color: '#64748b', icon: 'download', type: 'FILE', category: 'media' },

  { key: 'CUSTOM', en: 'Custom link', ar: 'رابط مخصص', color: '#3b82f6', icon: 'link', type: 'WEBSITE', category: 'custom' },
];

export interface Brand {
  en: string;
  ar: string;
  color: string;
  icon: string;
}

const TYPE_BRANDS: Record<ActionType, Brand> = {
  SAVE_CONTACT: { en: 'Save contact', ar: 'حفظ جهة الاتصال', color: '#1d4ed8', icon: 'user-plus' },
  WHATSAPP: { en: 'WhatsApp', ar: 'واتساب', color: '#25d366', icon: 'whatsapp' },
  CALL: { en: 'Phone', ar: 'اتصال هاتفي', color: '#10b981', icon: 'phone' },
  EMAIL: { en: 'Email', ar: 'بريد إلكتروني', color: '#ef4444', icon: 'mail' },
  LINKEDIN: { en: 'LinkedIn', ar: 'لينكد إن', color: '#0a66c2', icon: 'linkedin' },
  WEBSITE: { en: 'Website', ar: 'موقع إلكتروني', color: '#2563eb', icon: 'globe' },
  BOOK_MEETING: { en: 'Book a meeting', ar: 'حجز موعد', color: '#f59e0b', icon: 'calendar' },
  REQUEST_QUOTE: { en: 'Request a quote', ar: 'طلب تسعيرة', color: '#0ea5e9', icon: 'file-text' },
  MAPS: { en: 'Location', ar: 'الموقع على الخريطة', color: '#f43f5e', icon: 'map-pin' },
  FILE: { en: 'Download a file', ar: 'تحميل ملف', color: '#64748b', icon: 'download' },
};

/** Sites a WEBSITE link is recognised as, by its address (the Studio's list). */
const URL_BRANDS: [RegExp, string][] = [
  [/instagram\.com/i, 'INSTAGRAM'],
  [/facebook\.com|fb\.com|fb\.me/i, 'FACEBOOK'],
  [/(?:^|\/\/|\.)(?:twitter|x)\.com/i, 'TWITTER'],
  [/youtube\.com|youtu\.be/i, 'YOUTUBE'],
  [/t\.me|telegram\.(me|org)/i, 'TELEGRAM'],
  [/github\.com/i, 'GITHUB'],
  [/snapchat\.com/i, 'SNAPCHAT'],
  [/threads\.net/i, 'THREADS'],
  [/tiktok\.com/i, 'TIKTOK'],
  [/pinterest\.com/i, 'PINTEREST'],
  [/behance\.net/i, 'BEHANCE'],
  [/dribbble\.com/i, 'DRIBBBLE'],
  [/paypal\.me/i, 'PAYPAL'],
  [/calendly\.com/i, 'CALENDLY'],
  [/^sms:/i, 'SMS'],
];

/** How a button shows in the editor: the site it goes to when that is known, else its kind. */
export function brandOf(a: Pick<CardAction, 'type' | 'config'>): Brand {
  const url = typeof a.config.url === 'string' ? a.config.url : '';
  if ((a.type === 'WEBSITE' || a.type === 'BOOK_MEETING') && url) {
    const hit = URL_BRANDS.find(([re]) => re.test(url));
    const p = hit && PLATFORMS.find((x) => x.key === hit[1]);
    if (p) return { en: p.en, ar: p.ar, color: p.color, icon: p.icon };
  }
  return TYPE_BRANDS[a.type] ?? TYPE_BRANDS.WEBSITE;
}

/** The config key a type keeps its destination under (the Studio's ActionCard). */
export function valueKey(type: ActionType): 'phone' | 'email' | 'url' | null {
  if (type === 'CALL' || type === 'WHATSAPP') return 'phone';
  if (type === 'EMAIL') return 'email';
  if (type === 'SAVE_CONTACT') return null;
  return 'url';
}

/** The destination a button shows under its name. */
export function valueOf(a: Pick<CardAction, 'type' | 'config'>): string {
  const key = valueKey(a.type);
  const v = key ? a.config[key] : null;
  return typeof v === 'string' ? v : '';
}

/** In the row of quick-contact buttons at the top of the card, unless the owner moved it. */
export function isQuick(a: Pick<CardAction, 'type' | 'config'>): boolean {
  if (typeof a.config.isQuick === 'boolean') return a.config.isQuick;
  return a.type === 'CALL' || a.type === 'EMAIL' || a.type === 'WHATSAPP';
}

/** A button nobody can use yet: on, but going nowhere. */
export function isDraft(a: Pick<CardAction, 'type' | 'config' | 'isActive'>): boolean {
  return valueKey(a.type) !== null && !valueOf(a).trim();
}

/** The first config of a new button from the picker, prefilled from the card where it can be. */
export function initialConfig(p: Platform, identity: Pick<Identity, 'phone' | 'email'>): Record<string, unknown> {
  const key = valueKey(p.type);
  if (key === 'phone') return { phone: identity.phone };
  if (key === 'email') return { email: identity.email };
  if (key === 'url') return { url: p.initialUrl ?? '' };
  return {};
}

/** A web address as the card needs it: https:// added to a bare domain; other schemes (sms:, mailto:) kept. */
export function normalizeUrl(raw: string): string {
  const v = raw.trim();
  if (!v || /^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
  return `https://${v}`;
}

/** A phone number or an address kept left to right inside Arabic text (Unicode isolates), so "+20 …" keeps its plus in front. */
export const ltr = (s: string) => `\u2066${s}\u2069`;
