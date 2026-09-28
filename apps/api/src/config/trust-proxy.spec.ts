import { trustProxySetting } from './trust-proxy';

describe('trustProxySetting', () => {
  it('leaves Express alone when unset', () => {
    expect(trustProxySetting(undefined)).toBeUndefined();
    expect(trustProxySetting('  ')).toBeUndefined();
  });

  it('takes a number of proxies, or their addresses', () => {
    expect(trustProxySetting('1')).toBe(1);
    expect(trustProxySetting('10.0.0.0/8, loopback')).toBe('10.0.0.0/8, loopback');
  });

  it('refuses true, which would let any client choose its own address', () => {
    expect(() => trustProxySetting('true')).toThrow(/not true\/false/);
    expect(() => trustProxySetting('TRUE')).toThrow();
  });
});
