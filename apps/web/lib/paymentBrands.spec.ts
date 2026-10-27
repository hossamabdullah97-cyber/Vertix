import { describe, expect, it } from 'vitest';
import { paymentAddress } from './paymentBrands';

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
