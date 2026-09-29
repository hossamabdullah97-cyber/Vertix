import { describe, expect, it } from 'vitest';
import { setupCard, setupSteps } from './onboarding';

const card = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  ownerId: 'u1',
  isPublished: false,
  vcardData: {} as Record<string, unknown>,
  actions: [] as { isActive: boolean }[],
  sections: [] as { type: string; isVisible: boolean; content: Record<string, unknown> }[],
  ...over,
});
const done = (steps: ReturnType<typeof setupSteps>) => steps.filter((s) => s.done).map((s) => s.id);

describe('setupSteps', () => {
  it('starts with making a card', () => {
    const steps = setupSteps({ cards: [], userId: 'u1', tags: [], alertsChosen: false });
    expect(done(steps)).toEqual([]);
    expect(steps.find((s) => s.id === 'addPhoto')!.href).toBe('/cards?new=1');
  });

  it('follows the person’s own card, not a colleague’s', () => {
    const mine = card({ id: 'mine', vcardData: { avatar: 'a.jpg' } });
    const theirs = card({ id: 'theirs', ownerId: 'u2', isPublished: true });
    expect(setupCard([theirs, mine], 'u1')!.id).toBe('mine');
    const steps = setupSteps({ cards: [theirs, mine], userId: 'u1', tags: [], alertsChosen: false });
    expect(done(steps)).toEqual(['createCard', 'addPhoto']);
    expect(steps.find((s) => s.id === 'publishCard')!.href).toBe('/cards/mine');
  });

  it('needs a way to reach you and at least one link', () => {
    const phoneOnly = card({ vcardData: { phone: '+20100' } });
    expect(done(setupSteps({ cards: [phoneOnly], userId: 'u1', tags: [], alertsChosen: false }))).not.toContain('addContact');
    const withAction = card({ vcardData: { email: 'a@b.c' }, actions: [{ isActive: true }] });
    expect(done(setupSteps({ cards: [withAction], userId: 'u1', tags: [], alertsChosen: false }))).toContain('addContact');
    const withSocial = card({ vcardData: { phone: '1' }, sections: [{ type: 'SOCIAL', isVisible: true, content: { links: [{ url: 'x' }] } }] });
    expect(done(setupSteps({ cards: [withSocial], userId: 'u1', tags: [], alertsChosen: false }))).toContain('addContact');
  });

  it('ticks off everything for a finished setup', () => {
    const c = card({ isPublished: true, vcardData: { avatar: 'a', phone: '1' }, actions: [{ isActive: true }] });
    const steps = setupSteps({ cards: [c], userId: 'u1', tags: [{ cardId: 'c1' }], alertsChosen: true });
    expect(steps.every((s) => s.done)).toBe(true);
  });
});
