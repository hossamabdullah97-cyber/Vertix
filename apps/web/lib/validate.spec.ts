import { describe, expect, it } from 'vitest';
import { registerSchema, leadCaptureSchema } from '@vertex/shared';
import { isEmail, isPhone, problemOf } from './validate';

describe('field checks agree with the API', () => {
  const emails = ['a@b.co', 'name@company.com', 'first.last+tag@sub.domain.eg', 'x@y', 'x@y.c', '@b.co', 'a@@b.co', 'a b@c.co', '.a@b.co', 'a..b@c.co', 'ahmed@'];
  it.each(emails)('email %s', (email) => {
    const api = registerSchema.safeParse({ email, password: 'longenough', organizationName: 'Acme' }).success;
    expect(isEmail(email)).toBe(api);
  });

  it('accepts the mobile numbers the API accepts', () => {
    expect(isPhone('+20 100 123 4567')).toBe(true);
    expect(isPhone('01001234567')).toBe(true);
    expect(isPhone('12')).toBe(false);
    expect(isPhone('+20-100-123')).toBe(false);
  });

  it('says what is wrong, in order', () => {
    expect(problemOf('', { required: true, kind: 'email' })).toBe('required');
    expect(problemOf('', { kind: 'email' })).toBeNull();
    expect(problemOf('x@y', { kind: 'email' })).toBe('email');
    expect(problemOf('short', { required: true, min: 8 })).toBe('short');
    expect(problemOf('  longenough  ', { required: true, min: 8 })).toBeNull();
    expect(problemOf('ftp://x', { kind: 'url' })).toBe('url');
  });

  it('lets through what the card form sends', () => {
    expect(leadCaptureSchema.safeParse({ slug: 's', name: 'N', email: 'a@b.co' }).success).toBe(isEmail('a@b.co'));
  });
});
