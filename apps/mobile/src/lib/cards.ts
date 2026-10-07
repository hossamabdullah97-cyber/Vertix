import { WEB_BASE } from './config';

export interface CardRow {
  id: string;
  slug: string;
  isPublished: boolean;
  vcardData: Record<string, unknown> | null;
  ownerId: string;
}

/** The name a card goes by: the person on it, else its address. */
export function cardName(c: Pick<CardRow, 'slug' | 'vcardData'>): string {
  const v = c.vcardData ?? {};
  const name = [v.fullName, v.name, [v.firstName, v.lastName].filter(Boolean).join(' ')].find((x) => typeof x === 'string' && x.trim());
  return typeof name === 'string' ? name.trim() : c.slug;
}

/** The card's public page: what its QR code and its link open. */
export function cardUrl(slug: string): string {
  return `${WEB_BASE}/c/${slug}`;
}
