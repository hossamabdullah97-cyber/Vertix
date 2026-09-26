import { ForbiddenException, Injectable } from '@nestjs/common';
import { PLAN_LIMITS, type Plan, type UsageSummary } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';

type Resource = 'cards' | 'members' | 'nfcTags';

/**
 * The slice of the Prisma client the limit checks need. Typed structurally so
 * the same code works with the root client and with an interactive
 * transaction client (which carries the tenant extension too).
 */
type CountingClient = Pick<
  PrismaService['client'],
  'card' | 'membership' | 'nfcTag' | 'organization'
>;

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

  private count(resource: Resource, db: CountingClient = this.db): Promise<number> {
    // Counts are auto-scoped to the active org via the tenant extension, which
    // also applies to an interactive transaction client.
    if (resource === 'cards') return db.card.count();
    if (resource === 'members') return db.membership.count();
    return db.nfcTag.count();
  }

  /** Throws if adding `adding` of `resource` would exceed the org's plan limit. */
  async assertWithin(
    orgId: string,
    resource: Resource,
    adding = 1,
    db: CountingClient = this.db,
  ) {
    const plan = await this.plan(orgId);
    const limit = PLAN_LIMITS[plan][resource];
    if (limit === null) return; // unlimited
    const current = await this.count(resource, db);
    if (current + adding > limit) {
      throw new ForbiddenException(
        `Plan limit reached (${PLAN_LIMITS[plan].label}: ${limit} ${resource}). Upgrade your plan to add more.`,
      );
    }
  }

  /**
   * Runs a limit-consuming write so that the check and the write cannot be
   * interleaved. Callers previously checked and then wrote as two separate
   * statements, so N concurrent requests all read the same under-limit count
   * and every one of them proceeded — the plan cap was bypassable simply by
   * firing requests in parallel.
   *
   * The transaction-scoped advisory lock is keyed on org+resource, so only
   * writes competing for the same quota serialize; unrelated orgs and other
   * resources are unaffected. The lock is released when the transaction ends,
   * including on rollback.
   */
  async guard<T>(
    orgId: string,
    resource: Resource,
    fn: (tx: CountingClient) => Promise<T>,
    adding = 1,
  ): Promise<T> {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        `${orgId}:${resource}`,
      );
      await this.assertWithin(orgId, resource, adding, tx as unknown as CountingClient);
      return fn(tx as unknown as CountingClient);
    });
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
