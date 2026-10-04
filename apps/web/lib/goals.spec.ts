import { describe, expect, it } from 'vitest';
import { paceOf } from '@/components/goals/GoalsPanel';

describe('goal pace', () => {
  it('is reached at the target, and gives the start of a period some slack', () => {
    expect(paceOf(25, 25, 0.5)).toBe('done');
    expect(paceOf(0, 4, 0.08)).toBe('ahead');
    expect(paceOf(0, 50000, 0.12)).toBe('behind');
    expect(paceOf(9, 20, 0.5)).toBe('ahead');
    expect(paceOf(5, 20, 0.5)).toBe('behind');
  });
});
