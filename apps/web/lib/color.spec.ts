import { describe, expect, it } from 'vitest';
import { hexChannels, readableOn, shade } from './color';

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

describe('shade', () => {
  it('moves every channel by the same amount and clamps at the ends', () => {
    expect(shade('#2563eb', 16)).toBe('#3573fb');
    expect(shade('#101010', -32)).toBe('#000000');
    expect(shade('#f0f0f0', 32)).toBe('#ffffff');
  });

  it('leaves anything that is not a six-digit hex alone', () => {
    expect(shade('red', 20)).toBe('red');
  });
});

describe('readableOn', () => {
  it('picks dark text on light colours and white on dark ones', () => {
    expect(readableOn('#ffffff')).toBe('#141414');
    expect(readableOn('#e5e5e5')).toBe('#141414');
    expect(readableOn('#2563eb')).toBe('#ffffff');
    expect(readableOn('#09090b')).toBe('#ffffff');
  });
});
