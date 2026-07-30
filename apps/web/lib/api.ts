export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

/** Server-side GET against the Vertex API. Returns null on non-2xx. */
export async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface PublicCardSection {
  id: string;
  type: 'BIO' | 'SOCIAL' | 'PORTFOLIO' | 'BOOKING' | 'VIDEO';
  order: number;
  content: Record<string, unknown>;
}

export interface PublicCardAction {
  id: string;
  type: string;
  order: number;
  config: Record<string, unknown>;
}

export interface PublicPaymentLink {
  id: string;
  platform: string;
  displayName: string;
  url: string;
  description: string | null;
  order: number;
}

export interface PublicCard {
  id: string;
  slug: string;
  templateId: string;
  theme: Record<string, unknown> | null;
  vcardData: Record<string, unknown> | null;
  sections: PublicCardSection[];
  actions: PublicCardAction[];
  /** External payment links (link-sharing only), for the resolved identity. */
  paymentLinks: PublicPaymentLink[];
  /** Earned by the owning organization's paid plan — computed server-side. */
  verified: boolean;
  /** Name of the active profile variant (null when the base profile is served). */
  profileName?: string | null;
}

/** Returned instead of a card when a passcode-gated variant is requested without the code. */
export interface PublicCardLocked {
  id: string;
  slug: string;
  locked: true;
  profileName: string;
  requiresPasscode: true;
}
