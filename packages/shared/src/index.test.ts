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
  plansFor,
  Plan,
  isPaidPlan,
  trackEventSchema,
  createOccasionSchema,
  occasionRangeError,
} from './index';

describe('registerSchema', () => {
  it('asks a team for its name, and someone on their own only for theirs', () => {
    expect(registerSchema.safeParse({ email: 'a@b.co', password: 'longenough', kind: 'personal', name: 'Mona' }).success).toBe(true);
    expect(registerSchema.safeParse({ email: 'a@b.co', password: 'longenough', kind: 'personal' }).success).toBe(false);
    expect(registerSchema.safeParse({ email: 'a@b.co', password: 'longenough', kind: 'team', name: 'Mona' }).success).toBe(false);
    // An older client sends no kind: a team, as before.
    expect(registerSchema.safeParse({ email: 'a@b.co', password: 'longenough', organizationName: 'Acme' })).toMatchObject({ success: true, data: { kind: 'team' } });
  });

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

  it('has a personal plan for one person: more than Free, no seats to share', () => {
    expect(PLAN_LIMITS.PERSONAL.members).toBe(1);
    expect(PLAN_LIMITS.PERSONAL.cards).toBeGreaterThan(PLAN_LIMITS.FREE.cards!);
    expect(isPaidPlan('PERSONAL')).toBe(true);
    expect(plansFor('PERSONAL')).toEqual(['FREE', 'PERSONAL']);
    expect(plansFor('TEAM')).not.toContain('PERSONAL');
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
    expect(Plan.options.filter(isPaidPlan)).toEqual(['PERSONAL', 'PRO', 'BUSINESS', 'ENTERPRISE']);
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

import { describeDevice, deviceLabel } from './index';

describe('describeDevice', () => {
  it('names the browser, the system and the kind of device', () => {
    const chromeWin = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
    const safariPhone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
    const edgeMac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0';
    const samsungTab = 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Safari/537.36';
    expect(describeDevice(chromeWin)).toEqual({ browser: 'Chrome', os: 'Windows', kind: 'desktop' });
    expect(describeDevice(safariPhone)).toEqual({ browser: 'Safari', os: 'iPhone', kind: 'phone' });
    expect(describeDevice(edgeMac)).toEqual({ browser: 'Edge', os: 'macOS', kind: 'desktop' });
    expect(describeDevice(samsungTab)).toEqual({ browser: 'Samsung Internet', os: 'Android', kind: 'tablet' });
    expect(deviceLabel(chromeWin)).toBe('Chrome on Windows');
  });

  it('names the Vertex app on a phone', () => {
    expect(deviceLabel('VertexConnectApp/1.0 (iPhone; iOS 18.2; Mobile)')).toBe('Vertex app on iPhone');
    expect(deviceLabel('VertexConnectApp/1.0 (Linux; Android 15; Mobile)')).toBe('Vertex app on Android');
    expect(describeDevice('VertexConnectApp/1.0 (Linux; Android 15; Mobile)').kind).toBe('phone');
  });

  it('says nothing it does not know', () => {
    expect(describeDevice(null)).toEqual({ browser: null, os: null, kind: 'desktop' });
    expect(deviceLabel('curl/8.0')).toBe('Unknown device');
  });
});

import { coerceFieldValue, customFieldSchema } from './index';

describe('custom field values', () => {
  const sel = { type: 'SELECT' as const, options: ['Retail', 'Real estate'] };
  it('stores each kind of value in one shape', () => {
    expect(coerceFieldValue({ type: 'TEXT', options: [] }, '  Cairo ')).toBe('Cairo');
    expect(coerceFieldValue({ type: 'NUMBER', options: [] }, '25,000')).toBe(25000);
    expect(coerceFieldValue({ type: 'DATE', options: [] }, '2025-03-01')).toBe('2025-03-01');
    expect(coerceFieldValue({ type: 'CHECKBOX', options: [] }, 'نعم')).toBe(true);
    expect(coerceFieldValue({ type: 'URL', options: [] }, 'nile.com/x')).toBe('https://nile.com/x');
    expect(coerceFieldValue(sel, 'real ESTATE')).toBe('Real estate');
  });

  it('clears on empty, and refuses what does not fit', () => {
    expect(coerceFieldValue(sel, '')).toBeNull();
    expect(coerceFieldValue(sel, 'Banking')).toBeUndefined();
    expect(coerceFieldValue({ type: 'NUMBER', options: [] }, 'a lot')).toBeUndefined();
    expect(coerceFieldValue({ type: 'DATE', options: [] }, '2025-02-30')).toBeUndefined();
    expect(coerceFieldValue({ type: 'URL', options: [] }, 'javascript:alert(1)')).toBeUndefined();
  });

  it('needs options for a choice field, each once', () => {
    expect(customFieldSchema.safeParse({ label: 'Industry', type: 'SELECT', options: [] }).success).toBe(false);
    expect(customFieldSchema.safeParse({ label: 'Industry', type: 'SELECT', options: ['A', 'a'] }).success).toBe(false);
    expect(customFieldSchema.safeParse({ label: 'Budget', type: 'NUMBER' }).success).toBe(true);
  });
});
