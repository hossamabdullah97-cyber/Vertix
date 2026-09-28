import { secondsBlocked, tooManyAttempts } from './auth-throttle.service';

const NOW = new Date('2026-09-28T12:00:00Z');
const WINDOW = 15 * 60_000;

describe('secondsBlocked', () => {
  it('lets a key with no count, or room left, go ahead', () => {
    expect(secondsBlocked(undefined, 5, WINDOW, NOW)).toBe(0);
    expect(secondsBlocked({ count: 4, windowStart: new Date(NOW.getTime() - 60_000) }, 5, WINDOW, NOW)).toBe(0);
  });

  it('blocks a key at its limit until its window ends', () => {
    expect(secondsBlocked({ count: 5, windowStart: new Date(NOW.getTime() - 60_000) }, 5, WINDOW, NOW)).toBe(14 * 60);
  });

  it('forgets a window that is over, however high it counted', () => {
    expect(secondsBlocked({ count: 99, windowStart: new Date(NOW.getTime() - WINDOW) }, 5, WINDOW, NOW)).toBe(0);
  });
});

describe('tooManyAttempts', () => {
  it('is a 429 that says when to try again, in whole minutes', () => {
    const e = tooManyAttempts(61);
    expect(e.getStatus()).toBe(429);
    expect(e.getResponse()).toEqual({ statusCode: 429, message: 'Too many attempts. Try again in 2 minutes.', retryAfter: 61 });
    expect((tooManyAttempts(30).getResponse() as { message: string }).message).toMatch(/in 1 minute\./);
  });
});
