import { describe, expect, it, jest } from '@jest/globals';
let mockLang = 'en';
jest.mock('./i18n', () => ({ currentLang: () => mockLang }));
import { number, relative } from './format';

describe('format', () => {
  const now = Date.parse('2026-10-07T12:00:00Z');
  it('says how long ago in the app language', () => {
    mockLang = 'en';
    expect(relative(new Date(now - 3 * 60_000), now)).toMatch(/^3 min\.? ago$/);
    expect(relative(new Date(now - 86_400_000), now)).toBe('yesterday');
    mockLang = 'ar';
    expect(relative(new Date(now - 86_400_000), now)).toBe('أمس');
  });
  it('writes numbers in the app language', () => {
    mockLang = 'en';
    expect(number(12500)).toBe('12,500');
    mockLang = 'ar';
    expect(number(12)).toBe('12');
  });
});
