import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  createCardSchema,
  PLAN_LIMITS,
  Plan,
  isPaidPlan,
  trackEventSchema,
} from './index';

describe('registerSchema', () => {
  it('accepts a valid payload', () => {
    const r = registerSchema.safeParse({
      email: 'a@b.co',
      password: 'longenough',
      organizationName: 'Acme',
    });
    expect(r.success).toBe(true);
  });

  it('rejects short passwords and bad emails', () => {
    expect(registerSchema.safeParse({ email: 'a@b.co', password: 'short', organizationName: 'Acme' }).success).toBe(false);
    expect(registerSchema.safeParse({ email: 'nope', password: 'longenough', organizationName: 'Acme' }).success).toBe(false);
  });
});

describe('createCardSchema slug rules', () => {
  it('accepts lowercase/digits/dashes', () => {
    expect(createCardSchema.safeParse({ slug: 'jane-doe-1', templateId: 't' }).success).toBe(true);
  });
  it('rejects uppercase or spaces', () => {
    expect(createCardSchema.safeParse({ slug: 'Jane Doe', templateId: 't' }).success).toBe(false);
    expect(createCardSchema.safeParse({ slug: 'ab', templateId: 't' }).success).toBe(false); // too short
  });
});

describe('trackEventSchema', () => {
  it('only allows public event types', () => {
    expect(trackEventSchema.safeParse({ slug: 'x', type: 'VIEW' }).success).toBe(true);
    expect(trackEventSchema.safeParse({ slug: 'x', type: 'NFC_SCAN' }).success).toBe(false);
  });
});

describe('PLAN_LIMITS', () => {
  it('increase monotonically and unlimited at the top', () => {
    expect(PLAN_LIMITS.FREE.cards).toBeLessThan(PLAN_LIMITS.PRO.cards!);
    expect(PLAN_LIMITS.PRO.cards).toBeLessThan(PLAN_LIMITS.BUSINESS.cards!);
    expect(PLAN_LIMITS.ENTERPRISE.cards).toBeNull();
  });
  it('FREE is the only zero-price tier alongside enterprise-custom', () => {
    expect(PLAN_LIMITS.FREE.price).toBe(0);
    expect(PLAN_LIMITS.PRO.price).toBeGreaterThan(0);
  });
});

describe('isPaidPlan', () => {
  it('separates the paid tiers from free', () => {
    expect(isPaidPlan('PRO')).toBe(true);
    expect(isPaidPlan('BUSINESS')).toBe(true);
    expect(isPaidPlan('FREE')).toBe(false);
  });

  it('counts ENTERPRISE as paid despite its zero table price', () => {
    // Enterprise is quoted per contract, so price is 0 in PLAN_LIMITS. Deriving
    // "paid" from price would silently strip its verified badge.
    expect(PLAN_LIMITS.ENTERPRISE.price).toBe(0);
    expect(isPaidPlan('ENTERPRISE')).toBe(true);
  });

  it('is unpaid for a missing plan rather than throwing', () => {
    // The badge must fail closed: a personal workspace has no organization.
    expect(isPaidPlan(null)).toBe(false);
    expect(isPaidPlan(undefined)).toBe(false);
  });

  it('covers every plan in the enum, so a new tier cannot be missed silently', () => {
    for (const plan of Plan.options) {
      expect(typeof isPaidPlan(plan)).toBe('boolean');
    }
    expect(Plan.options.filter(isPaidPlan)).toEqual(['PRO', 'BUSINESS', 'ENTERPRISE']);
  });
});
