'use client';

import { useCallback, useEffect, useState } from 'react';
import type { OnboardingUpdate, OnboardingView } from '@vertex/shared';
import { authFetch } from './client';

/**
 * The getting-started guide, as the API works it out for the person in the
 * workspace open now (GET /account/onboarding). Shared by the sidebar and
 * the home page, and looked at again on each page change, so a step done on
 * one page is ticked off on the next.
 */
export const ONBOARDING_CHANGED = 'vx:onboarding-changed';

export function useOnboarding(refreshKey?: unknown): { view: OnboardingView | null; update: (u: OnboardingUpdate) => Promise<void> } {
  const [view, setView] = useState<OnboardingView | null>(null);

  const load = useCallback(() => authFetch<OnboardingView>('/account/onboarding').then(setView, () => undefined), []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    const onChange = (e: Event) => setView((e as CustomEvent<OnboardingView>).detail);
    window.addEventListener(ONBOARDING_CHANGED, onChange);
    return () => window.removeEventListener(ONBOARDING_CHANGED, onChange);
  }, []);

  const update = useCallback(async (u: OnboardingUpdate) => {
    const next = await authFetch<OnboardingView>('/account/onboarding', { method: 'PATCH', body: JSON.stringify(u) });
    window.dispatchEvent(new CustomEvent(ONBOARDING_CHANGED, { detail: next }));
  }, []);

  return { view, update };
}

/** Whether the guide still has something to offer: not finished, not hidden. */
export function guideOpen(view: OnboardingView | null): boolean {
  return !!view && !view.completedAt && !view.dismissed && view.done < view.total;
}
