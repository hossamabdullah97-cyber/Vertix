/**
 * The steps from a new account to a card that works: made, with a face,
 * reachable, live, heard from, and on a chip. Worked out from what the
 * person already has, so a step ticks itself off when it is done.
 */

export type SetupStepId = 'createCard' | 'addPhoto' | 'addContact' | 'publishCard' | 'leadAlerts' | 'linkTag';

export interface SetupStep {
  id: SetupStepId;
  done: boolean;
  href: string;
}

interface CardLike {
  id: string;
  ownerId: string;
  isPublished: boolean;
  vcardData: Record<string, unknown> | null;
  actions?: { isActive: boolean }[];
  sections?: { type: string; isVisible: boolean; content: Record<string, unknown> }[];
}

const filled = (v: unknown) => typeof v === 'string' && v.trim() !== '';

/** The card the steps are about: the person's own, else the newest they can see. */
export function setupCard<C extends CardLike>(cards: C[], userId: string | null | undefined): C | null {
  return cards.find((c) => c.ownerId === userId) ?? cards[0] ?? null;
}

function hasLinks(card: CardLike): boolean {
  if (card.actions?.some((a) => a.isActive)) return true;
  return !!card.sections?.some((s) => {
    if (s.type !== 'SOCIAL' || !s.isVisible) return false;
    const links = (s.content as { links?: unknown }).links;
    return Array.isArray(links) && links.length > 0;
  });
}

export function setupSteps(input: {
  cards: CardLike[];
  userId: string | null | undefined;
  tags: { cardId: string | null }[];
  alertsChosen: boolean;
}): SetupStep[] {
  const card = setupCard(input.cards, input.userId);
  const v = card?.vcardData ?? {};
  const edit = card ? `/cards/${card.id}` : '/cards?new=1';
  return [
    { id: 'createCard', done: !!card, href: '/cards?new=1' },
    { id: 'addPhoto', done: filled(v.avatar), href: edit },
    { id: 'addContact', done: !!card && (filled(v.phone) || filled(v.email)) && hasLinks(card), href: edit },
    { id: 'publishCard', done: !!card?.isPublished, href: edit },
    { id: 'leadAlerts', done: input.alertsChosen, href: '/notifications?settings=1' },
    { id: 'linkTag', done: input.tags.some((t) => t.cardId !== null), href: '/tags' },
  ];
}
