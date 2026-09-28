import { describe, expect, it } from 'vitest';
import { hexChannels } from './color';

describe('hexChannels', () => {
  it('splits a hex colour into space-separated channels', () => {
    expect(hexChannels('#2563eb')).toBe('37 99 235');
    expect(hexChannels('0F172A')).toBe('15 23 42');
  });

  it('falls back to the house blue for anything else', () => {
    expect(hexChannels('#abc')).toBe('37 99 235');
    expect(hexChannels('rgb(1, 2, 3)')).toBe('37 99 235');
    expect(hexChannels('')).toBe('37 99 235');
  });
});
