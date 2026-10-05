import type { PaidPlan } from '@vertex/shared';

/**
 * Monthly plan prices, in Egyptian pounds. They are settings
 * (PRICE_PERSONAL_EGP, PRICE_PRO_EGP, PRICE_BUSINESS_EGP) so they can change
 * without a release; a plan whose price is not set is not sold and shows no price.
 */
export type { PaidPlan };
export type PlanPrices = Record<PaidPlan, number | null>;

export const CURRENCY = 'EGP';

function price(v: string | undefined): number | null {
  if (!v?.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function planPrices(get: (key: string) => string | undefined): PlanPrices {
  return { PERSONAL: price(get('PRICE_PERSONAL_EGP')), PRO: price(get('PRICE_PRO_EGP')), BUSINESS: price(get('PRICE_BUSINESS_EGP')) };
}

/** The name a plan is charged under at Paymob. */
export function planItemName(plan: PaidPlan): string {
  return `Vertex Connect ${plan === 'PERSONAL' ? 'Personal' : plan === 'PRO' ? 'Pro' : 'Business'}`;
}

/** Pounds to piastres, the unit Paymob charges in. */
export const toCents = (egp: number) => Math.round(egp * 100);
