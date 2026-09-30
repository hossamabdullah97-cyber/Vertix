/**
 * The public profile as data. Both the published page and the Studio preview
 * build one of these and hand it to <PublicProfile>, so what the owner sees
 * while editing is what a visitor gets.
 */
import type { PublicCardAction, PublicPaymentLink } from './api';
import type { Lang } from './profileI18n';
import { brandInk, hexChannels, readableOn } from './color';

export type CoverStyle = 'constellation' | 'gradient' | 'solid' | 'mesh' | 'lines';
export const COVER_STYLES: CoverStyle[] = ['solid', 'gradient', 'mesh', 'lines', 'constellation'];
function coverOf(v: unknown): CoverStyle | null {
  return COVER_STYLES.includes(v as CoverStyle) ? (v as CoverStyle) : null;
}

/** The card's layout: where the photo, name and buttons sit. */
export type Layout = 'classic' | 'centered' | 'spotlight' | 'minimal';
export const LAYOUTS: Layout[] = ['classic', 'centered', 'spotlight', 'minimal'];
export function layoutOf(v: unknown): Layout {
  return LAYOUTS.includes(v as Layout) ? (v as Layout) : 'classic';
}

/** Light, dark, or whichever the visitor's phone is set to. */
export type ThemeMode = 'light' | 'dark' | 'auto';
export function modeOf(v: unknown): ThemeMode {
  return v === 'dark' || v === 'auto' ? v : 'light';
}

/** The workspace behind a card, as the public card receives it. */
export interface CardBrand {
  name: string;
  logo: string | null;
}

/** How the card's links (all but the quick-contact tiles) are laid out. */
export type LinkStyle = 'list' | 'icons' | 'buttons';
export const LINK_STYLES: LinkStyle[] = ['list', 'icons', 'buttons'];
export function linkStyleOf(v: unknown): LinkStyle {
  return v === 'icons' || v === 'buttons' ? v : 'list';
}

export interface ProfileSection {
  id: string;
  type: string;
  order?: number;
  isVisible?: boolean;
  content: Record<string, unknown>;
}

export interface ProfileData {
  slug: string;
  name: string;
  /** Job title. */
  title: string;
  company: string;
  about: string;
  avatar: string;
  coverImage: string;
  coverStyle: CoverStyle;
  layout: Layout;
  accent: string;
  mode: ThemeMode;
  /** The language shown. */
  lang: Lang;
  /** Every language the card is written in, its own first. */
  langs: Lang[];
  circle: boolean;
  verified: boolean;
  /** The workspace's name and logo, unless the owner turned it off. */
  brand: CardBrand | null;
  /** Which wallet passes the server can make for this card. */
  wallet: { apple: boolean; google: boolean };
  /** The workspace's privacy policy, linked under the exchange form. */
  privacyUrl: string | null;
  linkStyle: LinkStyle;
  /** WhatsApp and LinkedIn links open their apps on a phone. */
  openInApp: boolean;
  /** Optional identity details, shown only when the owner filled them in. */
  meta: { available: string; location: string; languages: string; responseTime: string };
  /** The active profile variant's name, when one is being served. */
  profileName: string | null;
  actions: PublicCardAction[];
  paymentLinks: PublicPaymentLink[];
  /** Everything but the bio, in order. */
  sections: ProfileSection[];
}

/** First non-empty string among `keys`. */
export function pick(content: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  for (const k of keys) {
    const v = content?.[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return '';
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Builds the profile from a card's stored shape. vcardData is the identity's
 * single editor; the BIO section is a fallback for older cards and the About.
 */
export function buildProfile(input: {
  slug: string;
  theme: Record<string, unknown> | null | undefined;
  vcardData: Record<string, unknown> | null | undefined;
  sections: ProfileSection[];
  actions: PublicCardAction[];
  paymentLinks: PublicPaymentLink[];
  verified?: boolean;
  brand?: CardBrand | null;
  wallet?: { apple: boolean; google: boolean };
  privacyUrl?: string | null;
  profileName?: string | null;
  /** Shown when the owner has not written a name yet (the Studio preview). */
  fallbackName?: string;
  /** The language to show, when the card has it; otherwise its own. */
  viewLang?: Lang | null;
}): ProfileData {
  const theme = input.theme ?? {};
  const base = input.vcardData ?? {};
  const bio = input.sections.find((s) => s.type === 'BIO');
  const mode = modeOf(theme.mode);
  const primary: Lang = theme.lang === 'ar' ? 'ar' : 'en';
  const alt = altOf(base, primary);
  // In the second language, each field it has replaces the card's own.
  const showAlt = !!alt && input.viewLang === alt.lang;
  const v: Record<string, unknown> = showAlt ? { ...base, ...alt.fields } : base;
  const available = v.available === true ? 'now' : typeof v.available === 'string' ? v.available : '';

  return {
    slug: input.slug,
    name: pick(v, 'fullName') || pick(bio?.content, 'title', 'headline') || input.fallbackName || 'Vertex Connect',
    // Older cards kept the job title under `org`.
    title: pick(v, 'title', 'org') || pick(bio?.content, 'subtitle'),
    company: pick(v, 'company'),
    about: (showAlt && alt!.fields.about) || pick(bio?.content, 'body', 'about'),
    avatar: pick(v, 'avatar'),
    coverImage: pick(v, 'coverImage') || pick(theme, 'coverImage'),
    coverStyle: coverOf(theme.cover) ?? (mode === 'dark' ? 'constellation' : 'gradient'),
    layout: layoutOf(theme.layout),
    accent: typeof theme.accent === 'string' && HEX.test(theme.accent) ? theme.accent : '#2563eb',
    mode,
    lang: showAlt ? alt!.lang : primary,
    langs: alt ? [primary, alt.lang] : [primary],
    circle: theme.avatarShape !== 'square',
    linkStyle: linkStyleOf(theme.links),
    openInApp: theme.openInApp === true,
    verified: input.verified === true,
    brand: theme.brand === false ? null : input.brand ?? null,
    wallet: { apple: input.wallet?.apple === true, google: input.wallet?.google === true },
    privacyUrl: input.privacyUrl ?? null,
    meta: {
      available,
      location: pick(v, 'location'),
      languages: pick(v, 'languages'),
      responseTime: pick(v, 'responseTime'),
    },
    profileName: input.profileName ?? null,
    actions: [...input.actions].sort((a, b) => a.order - b.order),
    paymentLinks: [...input.paymentLinks].sort((a, b) => a.order - b.order),
    sections: input.sections
      .filter((s) => s.type !== 'BIO' && s.isVisible !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  };
}

/** A YouTube or Vimeo page link as its embeddable player URL, or null. */
export function embedUrl(raw: string): string | null {
  const yt = raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vimeo = raw.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

/** Adds a scheme to a bare domain so it opens as a link. */
export function externalUrl(raw: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
}

/**
 * The card's own light and dark palette, so it follows the card's theme
 * rather than whatever page it is rendered in (the Studio can be dark).
 */
const PALETTE = {
  light: {
    '--p-bg': '#f5f4f1',
    '--p-surface': '#ffffff',
    '--p-elevated': '#f5f4f1',
    '--p-fg': '#17171a',
    '--p-muted': '#5e5d63',
    '--p-faint': '#6f6e75',
    '--p-line': '#ecebe7',
    '--p-line-strong': '#dcd9d2',
  },
  dark: {
    '--p-bg': '#0c0c0e',
    '--p-surface': '#141416',
    '--p-elevated': '#1c1c1f',
    '--p-fg': '#ededee',
    '--p-muted': '#a1a1a8',
    '--p-faint': '#8b8b93',
    '--p-line': '#232327',
    '--p-line-strong': '#2f2f34',
  },
} as const;

/**
 * The style variables for a profile; the page uses them for its backdrop too.
 * An "auto" card starts light, and globals.css switches it to the dark palette
 * when the visitor's phone is dark (see `profileAttrs`).
 */
export function profileStyle(p: Pick<ProfileData, 'accent' | 'mode'>): React.CSSProperties {
  const vars: Record<string, string> = {
    ...PALETTE[p.mode === 'dark' ? 'dark' : 'light'],
    '--p-accent': p.accent,
    '--p-accent-ch': hexChannels(p.accent),
    '--p-on-accent': readableOn(p.accent),
  };
  return vars as React.CSSProperties;
}

/** Marks an "auto" card so the stylesheet can follow the visitor's setting. */
export function profileAttrs(p: Pick<ProfileData, 'mode'>): Record<string, string> {
  return p.mode === 'auto' ? { 'data-p-auto': '' } : {};
}

/**
 * A brand colour made readable on the card. On an "auto" card it carries both
 * versions, and the stylesheet picks one (class `p-ink`).
 */
export function inkStyle(color: string, mode: ThemeMode): React.CSSProperties {
  return {
    '--ink': brandInk(color, mode === 'dark' ? 'dark' : 'light'),
    '--ink-dark': brandInk(color, 'dark'),
  } as React.CSSProperties;
}

/**
 * "Mariam Khaled" → "MK"; one word gives one letter. Arabic letters would join
 * into a word, so an Arabic name gives its first letter only.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = (w: string | undefined) => (w ? Array.from(w)[0] ?? '' : '');
  if (/^[\u0600-\u06FF]/.test(words[0] ?? '')) return first(words[0]);
  const letters = words.length > 1 ? [first(words[0]), first(words[words.length - 1])] : [first(words[0])];
  return letters.join('').toUpperCase() || '•';
}

/** The identity fields a card can carry in its second language. */
export const ALT_FIELDS = ['fullName', 'title', 'company', 'location', 'languages', 'responseTime', 'about'] as const;

/**
 * The card's second language (`vcardData.alt`): the other language from its
 * own, with at least a name. An alt written for the language the card is now
 * in (the owner switched it) does not count.
 */
export function altOf(vcardData: Record<string, unknown> | null | undefined, primary: Lang): { lang: Lang; fields: Record<string, string> } | null {
  const raw = vcardData?.alt;
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const lang: Lang = primary === 'ar' ? 'en' : 'ar';
  if (a.lang !== lang) return null;
  const fields: Record<string, string> = {};
  for (const k of ALT_FIELDS) {
    const v = a[k];
    if (typeof v === 'string' && v.trim()) fields[k] = v.trim();
  }
  return fields.fullName ? { lang, fields } : null;
}

/**
 * Which language a visitor sees: the one asked for in the address, else the
 * first their browser prefers among the card's, else the card's own.
 */
export function pickViewLang(langs: Lang[], asked: string | null | undefined, acceptLanguage: string | null | undefined): Lang {
  if (asked === 'ar' || asked === 'en') {
    if (langs.includes(asked)) return asked;
  }
  const prefs = (acceptLanguage ?? '')
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { lang: tag!.slice(0, 2).toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((p) => p.lang && !Number.isNaN(p.q))
    .sort((a, b) => b.q - a.q);
  for (const p of prefs) if (langs.includes(p.lang as Lang)) return p.lang as Lang;
  return langs[0]!;
}
