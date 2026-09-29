import { identityFields } from '../vcard';

/**
 * What a wallet pass shows for a card: the same identity the public card
 * shows, read from the resolved profile (base or variant).
 */
export interface WalletCard {
  /** Stable per card and profile, so re-adding updates the same pass. */
  serial: string;
  name: string;
  title: string;
  company: string;
  phone: string;
  email: string;
  accent: string;
  lang: 'en' | 'ar';
  /** The public card page, which the pass's code opens. */
  url: string;
  /** The contact photo's address, when it is a picture this API stored. */
  avatar: string | null;
}

const HEX = /^#[0-9a-f]{6}$/i;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Builds the pass data from a resolved public card. */
export function walletCardOf(
  card: {
    id: string;
    slug: string;
    theme: unknown;
    vcardData: unknown;
    profileName?: string | null;
    brand?: { name: string } | null;
  },
  opts: { appUrl: string; p?: string },
): WalletCard {
  const v = (card.vcardData && typeof card.vcardData === 'object' ? card.vcardData : {}) as Record<string, unknown>;
  const t = (card.theme && typeof card.theme === 'object' ? card.theme : {}) as Record<string, unknown>;
  const { title, company } = identityFields(v);
  const showBrand = t.brand !== false;
  return {
    // A profile opened by its private key is its own pass.
    serial: opts.p ? `${card.id}-${opts.p}` : card.id,
    name: str(v.fullName) || str(v.name) || card.slug,
    title,
    company: company || (showBrand ? card.brand?.name ?? '' : ''),
    phone: str(v.phone),
    email: str(v.email),
    accent: typeof t.accent === 'string' && HEX.test(t.accent) ? t.accent : '#2563eb',
    lang: t.lang === 'ar' ? 'ar' : 'en',
    url: `${opts.appUrl.replace(/\/$/, '')}/c/${card.slug}${opts.p ? `?p=${encodeURIComponent(opts.p)}` : ''}`,
    avatar: typeof v.avatar === 'string' && v.avatar ? v.avatar : null,
  };
}

/** Labels on the pass, in the card's language. */
export const WALLET_LABELS = {
  en: { name: 'Name', title: 'Title', company: 'Company', phone: 'Phone', email: 'Email', card: 'Card', description: 'Business card' },
  ar: { name: 'الاسم', title: 'المسمى', company: 'الشركة', phone: 'الهاتف', email: 'البريد', card: 'البطاقة', description: 'بطاقة أعمال' },
} as const;

/** "#2563eb" → "rgb(37, 99, 235)", the form Apple passes take. */
export function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

/** White or near-black, whichever reads on the colour. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return l > 0.45 ? '#17171a' : '#ffffff';
}
