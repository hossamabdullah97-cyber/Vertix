import {
  createPaymentLinkSchema,
  updatePaymentLinkSchema,
  PAYMENT_PLATFORMS,
} from '@vertex/shared';

/**
 * Payment links are for sharing EXTERNAL URLs only. These tests pin the
 * validation contract: a valid platform, a non-empty display name, and a safe
 * http(s) URL — no credentials, amounts, or transaction fields ever accepted.
 */
describe('payment link schemas', () => {
  const base = {
    platform: 'instapay' as const,
    displayName: 'InstaPay',
    url: 'https://ipn.eg/S/username',
  };

  it('accepts a well-formed external payment link', () => {
    const parsed = createPaymentLinkSchema.parse(base);
    expect(parsed.url).toBe('https://ipn.eg/S/username');
    expect(parsed.platform).toBe('instapay');
  });

  it('accepts every catalogued platform key', () => {
    for (const p of PAYMENT_PLATFORMS) {
      expect(() => createPaymentLinkSchema.parse({ ...base, platform: p.key })).not.toThrow();
    }
  });

  it('rejects an unknown platform', () => {
    expect(() => createPaymentLinkSchema.parse({ ...base, platform: 'bitcoin' })).toThrow();
  });

  it('rejects a missing display name', () => {
    expect(() => createPaymentLinkSchema.parse({ ...base, displayName: '   ' })).toThrow();
  });

  it('rejects a non-http(s) or unsafe URL', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'ftp://x', 'not a url', '']) {
      expect(() => createPaymentLinkSchema.parse({ ...base, url })).toThrow();
    }
  });

  it('accepts both http and https schemes', () => {
    expect(() => createPaymentLinkSchema.parse({ ...base, url: 'http://pay.example.com/x' })).not.toThrow();
    expect(() => createPaymentLinkSchema.parse({ ...base, url: 'https://pay.example.com/x' })).not.toThrow();
  });

  it('trims the URL before validating', () => {
    const parsed = createPaymentLinkSchema.parse({ ...base, url: '  https://ipn.eg/S/u  ' });
    expect(parsed.url).toBe('https://ipn.eg/S/u');
  });

  it('never accepts credential/amount fields (strips unknown keys)', () => {
    const parsed = createPaymentLinkSchema.parse({
      ...base,
      pin: '1234',
      amount: 500,
      cardNumber: '4111111111111111',
    } as Record<string, unknown>);
    expect(parsed).not.toHaveProperty('pin');
    expect(parsed).not.toHaveProperty('amount');
    expect(parsed).not.toHaveProperty('cardNumber');
  });

  it('allows a partial update and still validates the URL when present', () => {
    expect(() => updatePaymentLinkSchema.parse({ isActive: false })).not.toThrow();
    expect(() => updatePaymentLinkSchema.parse({ url: 'javascript:alert(1)' })).toThrow();
    expect(updatePaymentLinkSchema.parse({ displayName: 'Vodafone Cash' }).displayName).toBe('Vodafone Cash');
  });
});
