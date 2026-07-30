import { ForbiddenException, Injectable } from '@nestjs/common';
import { PLAN_LIMITS, type Plan, type UsageSummary } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';

type Resource = 'cards' | 'members' | 'nfcTags';

@Injectable()
export class LimitsService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  private async plan(orgId: string): Promise<Plan> {
    const org = await this.db.organization.findUnique({
      where: { id: orgId },
      select: { plan: true },
    });
    return (org?.plan ?? 'FREE') as Plan;
  }

  private count(resource: Resource): Promise<number> {
    // Counts are auto-scoped to the active org via the tenant extension.
    if (resource === 'cards') return this.db.card.count();
    if (resource === 'members') return this.db.membership.count();
    return this.db.nfcTag.count();
  }

  /** Throws if adding `adding` of `resource` would exceed the org's plan limit. */
  async assertWithin(orgId: string, resource: Resource, adding = 1) {
    const plan = await this.plan(orgId);
    const limit = PLAN_LIMITS[plan][resource];
    if (limit === null) return; // unlimited
    const current = await this.count(resource);
    if (current + adding > limit) {
      throw new ForbiddenException(
        `Plan limit reached (${PLAN_LIMITS[plan].label}: ${limit} ${resource}). Upgrade your plan to add more.`,
      );
    }
  }

  async usage(orgId: string): Promise<UsageSummary> {
    const plan = await this.plan(orgId);
    const [cards, members, nfcTags, sub] = await Promise.all([
      this.db.card.count(),
      this.db.membership.count(),
      this.db.nfcTag.count(),
      this.db.subscription.findFirst({
        where: { orgId },
        select: { status: true },
      }),
    ]);
    return {
      plan,
      limits: PLAN_LIMITS[plan],
      usage: { cards, members, nfcTags },
      status: sub?.status ?? 'NONE',
    };
  }
}
