import { describe, expect, it, jest } from '@jest/globals';
jest.mock('expo-local-authentication', () => ({}));
jest.mock('./storage', () => ({ secrets: {} }));
import { LOCK_AFTER_MS, shouldLock } from './lock';

describe('shouldLock', () => {
  const now = 1_000_000;
  it('asks again after a minute away', () => {
    expect(shouldLock(true, now - LOCK_AFTER_MS, now)).toBe(true);
    expect(shouldLock(true, now - 10_000, now)).toBe(false);
  });
  it('never, while the lock is off or the app never left', () => {
    expect(shouldLock(false, now - 10 * LOCK_AFTER_MS, now)).toBe(false);
    expect(shouldLock(true, null, now)).toBe(false);
  });
});
