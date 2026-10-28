/**
 * Display metadata for external payment platforms.
 *
 * `logo` points to an OFFICIAL brand asset, served from `/public/brands`: for
 * the Egyptian wallets and gateways, each company's own app icon as published
 * on Google Play (see public/brands/README.md). When the file is absent the UI falls back to a
 * brand-colored tile — so the product works before any asset is added and shows
 * the real logo as soon as the official file is dropped in. We never redraw a
 * trademarked logo in code; the real vector/PNG file is the source of truth.
 */
export interface PaymentBrand {
  key: string;
  label: string;
  /** Brand color, used for the fallback tile + accents. */
  color: string;
  /** Path under /public to the official logo (SVG or PNG). Undefined = generic. */
  logo?: string;
  /** Generic icon name for the fallback tile (see components/Icon). */
  icon: string;
}

export const PAYMENT_BRANDS: Record<string, PaymentBrand> = {
  instapay: { key: 'instapay', label: 'InstaPay (إينستاباي)', color: '#4B1F80', logo: '/brands/instapay.png', icon: 'link' },
  vodafone_cash: { key: 'vodafone_cash', label: 'Vodafone Cash (فودافون كاش)', color: '#E60000', logo: '/brands/vodafone-cash.png', icon: 'phone' },
  orange_cash: { key: 'orange_cash', label: 'Orange Cash (أورنج كاش)', color: '#FF7900', logo: '/brands/orange-cash.png', icon: 'phone' },
  etisalat_cash: { key: 'etisalat_cash', label: 'Etisalat Cash / e& Cash (اتصالات كاش)', color: '#00A651', logo: '/brands/etisalat-cash.png', icon: 'phone' },
  we_pay: { key: 'we_pay', label: 'WE Pay (وي باي)', color: '#5F259F', logo: '/brands/we-pay.png', icon: 'phone' },
  fawry: { key: 'fawry', label: 'Fawry (فوري)', color: '#FFC700', logo: '/brands/fawry.png', icon: 'link' },
  meeza: { key: 'meeza', label: 'Meeza (ميزة)', color: '#004A7C', icon: 'credit-card' },
  smart_wallet: { key: 'smart_wallet', label: 'Bank Smart Wallet (المحفظة البنكية)', color: '#1E3A8A', logo: '/brands/smart-wallet.svg', icon: 'phone' },
  valu: { key: 'valu', label: 'valU (فاليو)', color: '#5B168C', logo: '/brands/valu.png', icon: 'link' },
  bank_card: { key: 'bank_card', label: 'Bank Card / Visa & Mastercard (بطاقة بنكية)', color: '#0F172A', logo: '/brands/bank-card.svg', icon: 'credit-card' },
  paypal: { key: 'paypal', label: 'PayPal (بايبال)', color: '#003087', logo: '/brands/paypal.png', icon: 'link' },
  paymob: { key: 'paymob', label: 'Paymob (باي مب)', color: '#0052FF', logo: '/brands/paymob.png', icon: 'link' },
  custom: { key: 'custom', label: 'Custom Payment Link (رابط دفع آخر)', color: '#334155', logo: '/brands/custom.svg', icon: 'link' },
};

/**
 * The address to send money to, when the link carries one: an InstaPay link
 * (ipn.eg/S/<name>/instapay/…) is the payment address <name>@instapay. Shown
 * on the card with a copy button, since many pay by typing it into their app.
 */
export function paymentAddress(platform: string, url: string): string {
  if (platform === 'instapay') {
    const m = /ipn\.eg\/S\/([^/?#]+)\/instapay/i.exec(url);
    if (m) return `${decodeURIComponent(m[1])}@instapay`;
  }
  return '';
}

/**
 * The platform's name under a payment link's own name, unless it would only
 * repeat it ("Vodafone Cash" over "Vodafone Cash (فودافون كاش)").
 */
export function paymentBrandLine(platform: string, displayName: string): string {
  const label = paymentBrand(platform).label;
  const name = displayName.trim().toLowerCase();
  return name && label.toLowerCase().includes(name) ? '' : label;
}

export function paymentBrand(platform: string): PaymentBrand {
  return PAYMENT_BRANDS[platform] ?? PAYMENT_BRANDS.custom;
}
