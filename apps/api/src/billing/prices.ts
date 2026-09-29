/**
 * Monthly plan prices, in Egyptian pounds. They are settings (PRICE_PRO_EGP,
 * PRICE_BUSINESS_EGP) so they can change without a release; a plan whose
 * price is not set is not sold and shows no price.
 */
export type PaidPlan = 'PRO' | 'BUSINESS';
export type PlanPrices = Record<PaidPlan, number | null>;

export const CURRENCY = 'EGP';

function price(v: string | undefined): number | null {
  if (!v?.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function planPrices(get: (key: string) => string | undefined): PlanPrices {
  return { PRO: price(get('PRICE_PRO_EGP')), BUSINESS: price(get('PRICE_BUSINESS_EGP')) };
}

/** Pounds to piastres, the unit Paymob charges in. */
export const toCents = (egp: number) => Math.round(egp * 100);
