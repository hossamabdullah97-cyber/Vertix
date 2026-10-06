import { Injectable } from '@nestjs/common';
import type { Prisma, TenantContext } from '@vertex/db';
import type { OnboardingStep, OnboardingUpdate, OnboardingView } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { leadsVisibleTo } from '../leads/lead-visibility';

type State = { welcomedAt?: string; dismissedAt?: string; completedAt?: string };

const stateOf = (v: unknown): State => (v && typeof v === 'object' && !Array.isArray(v) ? (v as State) : {});
const filled = (v: unknown) => typeof v === 'string' && v.trim() !== '';

interface CardFacts {
  id: string;
  ownerId: string;
  isPublished: boolean;
  vcardData: unknown;
  actions: { isActive: boolean }[];
  sections: { type: string; isVisible: boolean; content: unknown }[];
}

/** Whether the card has a way to reach its owner besides the phone and email: an action or a social link. */
export function hasLinks(card: Pick<CardFacts, 'actions' | 'sections'>): boolean {
  if (card.actions.some((a) => a.isActive)) return true;
  return card.sections.some((s) => {
    if (s.type !== 'SOCIAL' || !s.isVisible) return false;
    const links = (s.content as { links?: unknown } | null)?.links;
    return Array.isArray(links) && links.length > 0;
  });
}

/**
 * The steps from a new account to a card that brings in clients, worked out
 * from what the person already has in the workspace open now, so each ticks
 * itself off: a card made, with a face, reachable, live, seen, a first lead,
 * alerts chosen, the team invited (a company's owners and admins only) and a
 * chip linked. Whether the welcome was shown, the guide hidden, or finished
 * is kept on the person, so it is the same on every device.
 */
@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async view(userId: string, tenant?: TenantContext): Promise<OnboardingView> {
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { onboarding: true } });
    const state = stateOf(user?.onboarding);
    const steps = await this.steps(userId, tenant);
    const done = steps.filter((s) => s.done).length;

    // Finished: kept once, so the guide makes way for good and says so once.
    let justCompleted = false;
    if (done === steps.length && !state.completedAt) {
      state.completedAt = new Date().toISOString();
      justCompleted = true;
      await this.save(userId, state);
    }
    const org = tenant ? await this.db.organization.findUnique({ where: { id: tenant.orgId }, select: { kind: true } }) : null;
    return {
      steps,
      done,
      total: steps.length,
      welcomed: !!state.welcomedAt,
      dismissed: !!state.dismissedAt,
      completedAt: state.completedAt ?? null,
      justCompleted,
      workspaceKind: org?.kind ?? null,
    };
  }

  async update(userId: string, input: OnboardingUpdate, tenant?: TenantContext): Promise<OnboardingView> {
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { onboarding: true } });
    const state = stateOf(user?.onboarding);
    const now = new Date().toISOString();
    if (input.welcomed) state.welcomedAt ??= now;
    if (input.dismissed === true) state.dismissedAt = now;
    if (input.dismissed === false) delete state.dismissedAt;
    await this.save(userId, state);
    return this.view(userId, tenant);
  }

  private save(userId: string, state: State) {
    return this.db.user.update({ where: { id: userId }, data: { onboarding: state as Prisma.InputJsonValue } });
  }

  private async steps(userId: string, tenant?: TenantContext): Promise<OnboardingStep[]> {
    const alerts = await this.db.leadAlertSettings.findUnique({ where: { userId }, select: { userId: true } });
    if (!tenant) {
      // In no workspace there is nothing to set up but how one hears about leads.
      return [{ id: 'leadAlerts', done: !!alerts, href: '/notifications?settings=1' }];
    }
    const cards = await this.db.card.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        ownerId: true,
        isPublished: true,
        vcardData: true,
        actions: { select: { isActive: true } },
        sections: { select: { type: true, isVisible: true, content: true } },
      },
    });
    // The card the steps are about: the person's own, else the newest they can see.
    const card = (cards.find((c) => c.ownerId === userId) ?? cards[0] ?? null) as CardFacts | null;
    const v = (card?.vcardData ?? {}) as Record<string, unknown>;
    const edit = card ? `/cards/${card.id}` : '/cards?new=1';

    const [views, leads, chips, org, others] = await Promise.all([
      card ? this.db.event.count({ where: { cardId: card.id, type: 'VIEW' } }) : Promise.resolve(0),
      this.db.lead.count({ where: leadsVisibleTo(tenant) }),
      this.db.nfcTag.count({ where: { cardId: { not: null } } }),
      this.db.organization.findUnique({ where: { id: tenant.orgId }, select: { kind: true } }),
      this.db.membership.count({ where: { userId: { not: userId }, status: { in: ['ACTIVE', 'INVITED'] } } }),
    ]);

    const steps: OnboardingStep[] = [
      { id: 'createCard', done: !!card, href: '/cards?new=1' },
      { id: 'addPhoto', done: filled(v.avatar), href: edit },
      { id: 'addContact', done: !!card && (filled(v.phone) || filled(v.email)) && hasLinks(card), href: edit },
      { id: 'publishCard', done: !!card?.isPublished, href: edit },
      { id: 'shareCard', done: views > 0, href: card ? `${edit}?share=1` : '/cards?new=1' },
      { id: 'firstLead', done: leads > 0, href: '/leads' },
      { id: 'leadAlerts', done: !!alerts, href: '/notifications?settings=1' },
    ];
    // A team is built by those who may invite; a person's own workspace has no team.
    if (org?.kind === 'TEAM' && (tenant.role === 'OWNER' || tenant.role === 'ADMIN')) {
      steps.push({ id: 'inviteTeam', done: others > 0, href: '/team' });
    }
    steps.push({ id: 'linkTag', done: chips > 0, href: '/tags' });
    return steps;
  }
}
