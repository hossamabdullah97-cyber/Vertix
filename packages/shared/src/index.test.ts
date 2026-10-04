import { describe, it, expect } from 'vitest';
import {
  checkoutSchema,
  registerSchema,
  createCardSchema,
  createTagSchema,
  createTagsBatchSchema,
  normalizeUid,
  renderTemplate,
  PLAN_LIMITS,
  Plan,
  isPaidPlan,
  trackEventSchema,
  createOccasionSchema,
  occasionRangeError,
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
  it('carries limits only: prices are server settings, in pounds', () => {
    for (const def of Object.values(PLAN_LIMITS)) expect(def).not.toHaveProperty('price');
  });
});

describe('isPaidPlan', () => {
  it('separates the paid tiers from free', () => {
    expect(isPaidPlan('PRO')).toBe(true);
    expect(isPaidPlan('BUSINESS')).toBe(true);
    expect(isPaidPlan('FREE')).toBe(false);
  });

  it('counts ENTERPRISE as paid, though it has no listed price', () => {
    // Enterprise is quoted per contract. Deriving "paid" from a price would
    // silently strip its verified badge.
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

describe('occasions', () => {
  it('accepts a range of whole days, one day included', () => {
    expect(occasionRangeError('2026-09-19', '2026-09-21')).toBeNull();
    expect(occasionRangeError('2026-09-20', '2026-09-20')).toBeNull();
  });

  it('refuses an end before the start, and a range longer than the limit', () => {
    expect(occasionRangeError('2026-09-21', '2026-09-20')).toMatch(/ends before/);
    expect(occasionRangeError('2026-01-01', '2026-12-31')).toMatch(/at most 62 days/);
  });

  it('takes dates as YYYY-MM-DD only', () => {
    expect(createOccasionSchema.safeParse({ name: 'Expo', startsOn: '2026-09-19', endsOn: '2026-09-21' }).success).toBe(true);
    expect(createOccasionSchema.safeParse({ name: 'Expo', startsOn: '19/09/2026', endsOn: '2026-09-21' }).success).toBe(false);
    expect(createOccasionSchema.safeParse({ name: '  ', startsOn: '2026-09-19', endsOn: '2026-09-21' }).success).toBe(false);
  });
});

describe('checkoutSchema', () => {
  it('asks for the mobile number Paymob needs', () => {
    expect(checkoutSchema.safeParse({ plan: 'PRO', phone: '+20 100 123 4567' }).success).toBe(true);
    expect(checkoutSchema.safeParse({ plan: 'PRO' }).success).toBe(false);
    expect(checkoutSchema.safeParse({ plan: 'PRO', phone: 'call me' }).success).toBe(false);
    expect(checkoutSchema.safeParse({ plan: 'ENTERPRISE', phone: '+201001234567' }).success).toBe(false);
  });
});

describe('normalizeUid', () => {
  it('gives one spelling to a hex serial however it arrives', () => {
    for (const raw of ['04:a1:b2:c3:d4:e5:f6', '04A1B2C3D4E5F6', '04-a1-b2-c3-d4-e5-f6', ' 04 A1 B2 C3 D4 E5 F6 ']) {
      expect(normalizeUid(raw)).toBe('04:A1:B2:C3:D4:E5:F6');
    }
  });

  it('only trims what is not a hex serial', () => {
    expect(normalizeUid('  demo-tag-1 ')).toBe('demo-tag-1');
    expect(normalizeUid('ABC')).toBe('ABC');
    expect(normalizeUid('04A1B2C3D')).toBe('04A1B2C3D');
  });

  it('is applied by the tag schemas', () => {
    expect(createTagSchema.parse({ uid: '04a1b2c3' }).uid).toBe('04:A1:B2:C3');
    expect(createTagsBatchSchema.parse({ uids: ['04a1b2c3'] }).uids).toEqual(['04:A1:B2:C3']);
  });
});

describe('renderTemplate', () => {
  it('fills known fields and drops empty ones cleanly', () => {
    expect(renderTemplate('Hi {{first_name}}, this is {{my_name}} from {{my_company}}.', { first_name: 'Mona', my_name: 'Omar', my_company: '' })).toBe('Hi Mona, this is Omar from.');
    expect(renderTemplate('أهلاً {{first_name}}، معك {{my_name}}', { first_name: '', my_name: 'عمر' })).toBe('أهلاً، معك عمر');
  });

  it('leaves an unknown field visible', () => {
    expect(renderTemplate('Hi {{frist_name}}', { first_name: 'Mona' })).toBe('Hi {{frist_name}}');
  });
});

import { duplicateGroups, emailKey, phoneKey } from './index';

describe('duplicate leads', () => {
  it('reads one Egyptian number however it was written', () => {
    for (const p of ['+20 100 123 4567', '00201001234567', '0100-123-4567', '٠١٠٠١٢٣٤٥٦٧']) expect(phoneKey(p)).toBe('1001234567');
    expect(phoneKey('123')).toBeNull();
    expect(emailKey('  Mona@X.com ')).toBe('mona@x.com');
    expect(emailKey('nope')).toBeNull();
  });

  it('groups through shared emails and phones, and leaves the rest alone', () => {
    const leads = [
      { id: 'a', email: 'mona@x.com', phone: null },
      { id: 'b', email: 'other@y.com', phone: '01001234567' },
      { id: 'c', email: 'MONA@x.com', phone: '+201001234567' },
      { id: 'd', email: 'solo@z.com', phone: '01112223334' },
    ];
    const groups = duplicateGroups(leads);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.leads.map((l) => l.id)).toEqual(['a', 'b', 'c']);
    expect(groups[0]!.by).toEqual(['email', 'phone']);
  });
});
