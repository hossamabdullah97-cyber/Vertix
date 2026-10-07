import { describe, expect, it, jest } from '@jest/globals';
jest.mock('./api', () => ({ api: jest.fn(), publicApi: jest.fn() }));
jest.mock('./config', () => ({ TAP_BASE: 'https://tap.example' }));
import { normalizeUid, tapUrl } from './chips';

describe('chips', () => {
  it('writes serials the way the server stores them', () => {
    expect(normalizeUid('04a1b2c3d4e5f6')).toBe('04:A1:B2:C3:D4:E5:F6');
    expect(normalizeUid(' 04-a1-b2-c3 ')).toBe('04:A1:B2:C3');
    expect(normalizeUid('not-hex')).toBe('not-hex');
  });
  it('points a chip at its tap address', () => {
    expect(tapUrl('04:a1:b2:c3')).toBe('https://tap.example/t/04A1B2C3');
  });
});
