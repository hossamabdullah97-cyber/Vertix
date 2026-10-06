import { describe, expect, it } from 'vitest';
import type { OnboardingView } from '@vertex/shared';
import { guideOpen } from './onboarding';

const view = (over: Partial<OnboardingView> = {}): OnboardingView => ({
  steps: [],
  done: 2,
  total: 9,
  welcomed: true,
  dismissed: false,
  completedAt: null,
  justCompleted: false,
  workspaceKind: 'TEAM',
  ...over,
});

describe('the getting-started guide', () => {
  it('stays until it is finished or hidden', () => {
    expect(guideOpen(view())).toBe(true);
    expect(guideOpen(view({ dismissed: true }))).toBe(false);
    expect(guideOpen(view({ completedAt: '2026-10-01' }))).toBe(false);
    expect(guideOpen(view({ done: 9 }))).toBe(false);
    expect(guideOpen(null)).toBe(false);
  });
});
