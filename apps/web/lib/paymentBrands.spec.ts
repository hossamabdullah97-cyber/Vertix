import { describe, expect, it } from 'vitest';
import { paymentAddress, paymentBrandLine } from './paymentBrands';

describe('paymentAddress', () => {
  it('reads the InstaPay address out of its link', () => {
    expect(paymentAddress('instapay', 'https://ipn.eg/S/hossam/instapay/4Fh2a')).toBe('hossam@instapay');
    expect(paymentAddress('instapay', 'https://IPN.EG/S/mona.k/instapay/x?ref=1')).toBe('mona.k@instapay');
  });

  it('gives nothing when the link carries no address', () => {
    expect(paymentAddress('instapay', 'https://instapay.eg/')).toBe('');
    expect(paymentAddress('paypal', 'https://paypal.me/mona')).toBe('');
  });
});

describe('paymentBrandLine', () => {
  it('names the platform under a link with its own name', () => {
    expect(paymentBrandLine('vodafone_cash', 'My shop wallet')).toBe('Vodafone Cash (فودافون كاش)');
  });

  it('says nothing when the name already is the platform', () => {
    expect(paymentBrandLine('vodafone_cash', 'Vodafone Cash')).toBe('');
    expect(paymentBrandLine('instapay', 'InstaPay (إينستاباي)')).toBe('');
  });
});
