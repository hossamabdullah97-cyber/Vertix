import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Plan } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PaymobClient, PaymobError, type PaymobSubscription } from './paymob.client';
import { planItemName, planPrices, toCents, type PaidPlan, type PlanPrices } from './prices';
import { InvoicesService } from './invoices.service';
import { plansFor } from '@vertex/shared';

export const PERSONAL_PLAN_ONLY = 'The personal plan is for your own workspace. Choose a team plan for a company or team.';
export const TEAM_PLANS_ONLY = 'A personal workspace has the personal plan. Make it a team workspace in Settings for the team plans.';
import { workspaceLink } from '../common/workspace-link';

type SubStatus = 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED';

/** Statuses in which the org is still subscribed, and still being billed. */
const LIVE = new Set<string>(['ACTIVE', 'TRIALING', 'PAST_DUE']);

/** Paymob's subscription state in the terms the app keeps. */
export function subStatus(state: string): SubStatus {
  const s = state.toLowerCase();
  if (s === 'active') return 'ACTIVE';
  if (s === 'suspended') return 'PAST_DUE';
  return 'CANCELED';
}

/**
 * The reference a checkout carries through Paymob and back:
 * "vc_<orgId>_<plan>_<nonce>". It is how a payment is tied to a workspace.
 */
export function checkoutReference(orgId: string, plan: PaidPlan): string {
  return `vc_${orgId}_${plan}_${randomUUID().slice(0, 8)}`;
}
export function parseReference(ref: unknown): { orgId: string; plan: PaidPlan } | null {
  const m = typeof ref === 'string' ? ref.match(/^vc_([a-z0-9]+)_(PERSONAL|PRO|BUSINESS)_[0-9a-f]{8}$/) : null;
  return m ? { orgId: m[1]!, plan: m[2] as PaidPlan } : null;
}

/**
 * The ids a Paymob callback names. Nothing else in a callback is believed:
 * each id is looked up at Paymob with the account's own keys, so a forged
 * callback can at most make the app re-read what Paymob already says.
 */
export function callbackIds(body: unknown): { transactionId: number | null; subscriptionId: number | null } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const obj = (b.obj && typeof b.obj === 'object' ? b.obj : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null);
  const type = typeof b.type === 'string' ? b.type.toUpperCase() : '';
  const sub = (b.subscription_data && typeof b.subscription_data === 'object' ? b.subscription_data : null) as Record<string, unknown> | null;
  return {
    transactionId: type === 'TRANSACTION' ? num(obj.id) : num(b.transaction_id) ?? num(sub?.initial_transaction),
    subscriptionId: num(sub?.id) ?? num(b.subscription_id) ?? (type.startsWith('SUBSCRIPTION') ? num(obj.id) : null),
  };
}

/** How often lapsed paid periods are closed. */
const SWEEP_MS = 60 * 60_000;

@Injectable()
export class BillingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingService.name);
  private readonly paymob: PaymobClient | null;
  private readonly plans: Record<PaidPlan, number | null>;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Optional() private readonly invoices?: InvoicesService,
  ) {
    const get = (k: string) => config.get<string>(k)?.trim() || undefined;
    const planId = (k: string) => (get(k) && /^\d+$/.test(get(k)!) ? Number(get(k)) : null);
    this.plans = { PERSONAL: planId('PAYMOB_PLAN_PERSONAL'), PRO: planId('PAYMOB_PLAN_PRO'), BUSINESS: planId('PAYMOB_PLAN_BUSINESS') };
    const apiKey = get('PAYMOB_API_KEY');
    const secretKey = get('PAYMOB_SECRET_KEY');
    const publicKey = get('PAYMOB_PUBLIC_KEY');
    const integration = get('PAYMOB_CARD_INTEGRATION_ID');
    this.paymob =
      apiKey && secretKey && publicKey && integration && /^\d+$/.test(integration)
        ? new PaymobClient({
            baseUrl: (get('PAYMOB_BASE_URL') ?? 'https://accept.paymob.com').replace(/\/$/, ''),
            apiKey,
            secretKey,
            publicKey,
            cardIntegrationId: Number(integration),
          })
        : null;
    if (!this.paymob) this.logger.warn('Paymob is not configured: billing is off');
  }

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.closeLapsed().catch((e) => this.logger.warn(`lapse sweep failed: ${(e as Error).message}`)), SWEEP_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private get db() {
    return this.prisma.client;
  }

  get enabled(): boolean {
    return !!this.paymob;
  }

  /** The monthly prices shown on the pricing pages. */
  prices(): PlanPrices {
    return planPrices((k) => this.config.get<string>(k));
  }

  /** Whether a plan can be bought right now: Paymob, its plan and its price are all set. */
  sells(plan: PaidPlan): boolean {
    return !!this.paymob && this.plans[plan] !== null && this.prices()[plan] !== null;
  }

  /**
   * Starts paying for a plan: a subscription intention at Paymob, and the
   * checkout page to open. Moving to another plan is a new subscription; the
   * old one is cancelled once the new one is paid (see `applySubscription`).
   */
  async createCheckout(
    orgId: string,
    plan: PaidPlan,
    customer: { email: string; name: string | null; phone: string },
    apiBase: string,
  ): Promise<{ url: string }> {
    if (!this.paymob) throw new ServiceUnavailableException('Billing is not configured');
    const planId = this.plans[plan];
    const price = this.prices()[plan];
    if (!planId || !price) throw new ServiceUnavailableException(`The ${plan} plan is not on sale`);
    // A person's own workspace buys the personal plan; a company's or team's, the team plans.
    const org = await this.db.organization.findUnique({ where: { id: orgId }, select: { kind: true } });
    if (!plansFor(org?.kind).includes(plan)) {
      throw new BadRequestException(plan === 'PERSONAL' ? PERSONAL_PLAN_ONLY : TEAM_PLANS_ONLY);
    }

    const existing = await this.db.subscription.findFirst({ where: { orgId } });
    if (existing?.paymobSubscriptionId && existing.plan === plan && LIVE.has(existing.status)) {
      throw new BadRequestException('This workspace is already on this plan.');
    }

    const [first, ...rest] = (customer.name ?? '').trim().split(/\s+/).filter(Boolean);
    const appUrl = this.config.get<string>('APP_PUBLIC_URL', 'http://localhost:3000').replace(/\/$/, '');
    const api = (this.config.get<string>('API_PUBLIC_URL') ?? apiBase).replace(/\/$/, '');
    const { checkoutUrl } = await this.paymob.createSubscriptionIntention({
      planId,
      amountCents: toCents(price),
      reference: checkoutReference(orgId, plan),
      itemName: planItemName(plan),
      customer: { firstName: first ?? 'Vertex', lastName: rest.join(' ') || 'Customer', email: customer.email, phone: customer.phone },
      notificationUrl: `${api}/api/billing/paymob/webhook`,
      redirectionUrl: appUrl + workspaceLink('/billing?checkout=done', orgId),
      extras: { orgId, plan },
    });
    return { url: checkoutUrl };
  }

  /**
   * Stops the renewals. The workspace keeps its plan until the end of what it
   * paid for, then goes back to Free (see `closeLapsed`).
   */
  async cancel(orgId: string): Promise<{ periodEnd: string | null }> {
    if (!this.paymob) throw new ServiceUnavailableException('Billing is not configured');
    const sub = await this.db.subscription.findFirst({ where: { orgId } });
    if (!sub?.paymobSubscriptionId || !LIVE.has(sub.status)) throw new BadRequestException('There is no subscription to cancel.');
    const remote = await this.paymob.cancelSubscription(Number(sub.paymobSubscriptionId));
    const periodEnd = remote.next_billing ? endOfDay(remote.next_billing) : sub.currentPeriodEnd;
    await this.db.subscription.update({ where: { orgId }, data: { status: 'CANCELED', currentPeriodEnd: periodEnd } });
    this.logger.log(`Cancelled the subscription of org ${orgId}; paid through ${periodEnd?.toISOString() ?? 'now'}`);
    return { periodEnd: periodEnd?.toISOString() ?? null };
  }

  /**
   * For a workspace being deleted: stops any paid renewal so a deleted
   * workspace is never charged again. Best-effort and quiet: true when a
   * subscription was cancelled at Paymob, false when there was none to
   * cancel or Paymob could not be reached (logged, for someone to follow up).
   */
  async stopRenewals(orgId: string): Promise<boolean> {
    const sub = await this.db.subscription.findFirst({ where: { orgId } });
    if (!sub?.paymobSubscriptionId || !LIVE.has(sub.status)) return false;
    if (!this.paymob) {
      this.logger.error(`Workspace ${orgId} was deleted with a live Paymob subscription, but billing is not configured: cancel ${sub.paymobSubscriptionId} at Paymob by hand`);
      return false;
    }
    try {
      await this.cancel(orgId);
      return true;
    } catch (e) {
      this.logger.error(`Workspace ${orgId} was deleted but its Paymob subscription ${sub.paymobSubscriptionId} could not be cancelled: ${(e as Error).message}`);
      return false;
    }
  }

  /**
   * A callback from Paymob: a payment was processed, or a subscription changed.
   * Only ids are read from it; the facts come from Paymob itself.
   */
  async handleCallback(body: unknown): Promise<{ received: true }> {
    if (!this.paymob) return { received: true };
    try {
      await this.readCallback(body);
    } catch (err) {
      // An id Paymob does not know is settled: answering with an error would
      // only make Paymob send it again. Anything else (Paymob unreachable) is
      // an error, so Paymob retries later.
      if (err instanceof PaymobError && err.status === 404) {
        this.logger.warn(`Paymob callback names something Paymob does not know: ${err.message}`);
        return { received: true };
      }
      throw err;
    }
    return { received: true };
  }

  private async readCallback(body: unknown) {
    const { transactionId, subscriptionId } = callbackIds(body);

    if (transactionId) {
      const tx = await this.paymob!.getTransaction(transactionId);
      const sub = tx.success ? await this.paymob!.subscriptionOfTransaction(transactionId) : null;
      if (sub) {
        // The first payment names the workspace; a renewal is found by its subscription.
        const ref = parseReference(tx.order?.merchant_order_id);
        const paid = await this.applySubscription(sub, ref?.orgId);
        // Every payment taken is invoiced, the first and each renewal.
        if (paid && this.invoices) await this.invoices.record(paid.orgId, paid.plan, tx, sub);
      } else if (!tx.success) {
        this.logger.warn(`Paymob payment ${transactionId} did not go through`);
      }
    }
    if (subscriptionId) {
      await this.applySubscription(await this.paymob!.getSubscription(subscriptionId));
    }
  }

  /** The plan a Paymob subscription plan pays for, or null for plans that are not ours. */
  private planOf(planId: number): PaidPlan | null {
    if (planId === this.plans.BUSINESS) return 'BUSINESS';
    if (planId === this.plans.PRO) return 'PRO';
    if (planId === this.plans.PERSONAL) return 'PERSONAL';
    return null;
  }

  /**
   * Brings a workspace in line with its subscription at Paymob. `orgId` is
   * known for a first payment; otherwise the subscription must be on file.
   * Says which workspace and plan it is for, when that is known.
   */
  private async applySubscription(sub: PaymobSubscription, orgId?: string): Promise<{ orgId: string; plan: PaidPlan } | null> {
    const plan = this.planOf(sub.plan_id);
    if (!plan) {
      this.logger.warn(`Paymob subscription ${sub.id} is on plan ${sub.plan_id}, which is not a Vertex plan`);
      return null;
    }
    const subId = String(sub.id);
    const stored = await this.db.subscription.findFirst({
      where: orgId ? { orgId } : { paymobSubscriptionId: subId },
      select: { orgId: true, paymobSubscriptionId: true, status: true },
    });
    const org = orgId ?? stored?.orgId;
    if (!org) {
      this.logger.warn(`Paymob subscription ${sub.id} is not tied to any workspace`);
      return null;
    }
    const status = subStatus(sub.state);
    const periodEnd = sub.next_billing ? endOfDay(sub.next_billing) : null;

    if (stored?.paymobSubscriptionId && stored.paymobSubscriptionId !== subId) {
      if (status !== 'ACTIVE') return { orgId: org, plan }; // news about an older subscription changes nothing
      // A new plan was paid for: stop the old one, so it is not billed twice.
      if (LIVE.has(stored.status)) {
        await this.paymob!.cancelSubscription(Number(stored.paymobSubscriptionId)).catch((e) =>
          this.logger.error(`Could not cancel the old Paymob subscription ${stored.paymobSubscriptionId}: ${(e as Error).message}`),
        );
      }
    }

    // A cancelled subscription keeps its plan until the paid period ends.
    const keepsPlan = status !== 'CANCELED' || (periodEnd !== null && periodEnd.getTime() > Date.now());
    const orgPlan: Plan = keepsPlan ? plan : 'FREE';
    await this.db.$transaction([
      this.db.organization.update({ where: { id: org }, data: { plan: orgPlan } }),
      this.db.subscription.upsert({
        where: { orgId: org },
        create: { orgId: org, plan: orgPlan, status, paymobSubscriptionId: subId, currentPeriodEnd: periodEnd },
        update: { plan: orgPlan, status, paymobSubscriptionId: subId, currentPeriodEnd: periodEnd },
      }),
    ]);
    this.logger.log(`Applied ${orgPlan} (${status}) to org ${org} from Paymob subscription ${subId}`);
    return { orgId: org, plan };
  }

  /**
   * Workspaces whose paid time is over go back to Free: a cancelled
   * subscription at the end of its period, and one whose renewal kept failing
   * a week after it was due.
   */
  async closeLapsed(now = new Date()): Promise<number> {
    const grace = new Date(now.getTime() - 7 * 86_400_000);
    const lapsed = await this.db.subscription.findMany({
      where: {
        deletedAt: null,
        plan: { in: ['PERSONAL', 'PRO', 'BUSINESS'] },
        OR: [
          { status: 'CANCELED', currentPeriodEnd: { lt: now } },
          { status: 'PAST_DUE', currentPeriodEnd: { lt: grace } },
        ],
      },
      select: { orgId: true },
    });
    for (const { orgId } of lapsed) {
      await this.db.$transaction([
        this.db.organization.update({ where: { id: orgId }, data: { plan: 'FREE' } }),
        this.db.subscription.update({ where: { orgId }, data: { plan: 'FREE', status: 'CANCELED' } }),
      ]);
      this.logger.log(`Org ${orgId} is back on Free: its paid period is over`);
    }
    return lapsed.length;
  }
}

/** "2026-10-31" → the end of that day, in Cairo, when the next charge is due. */
function endOfDay(date: string): Date {
  return new Date(`${date.slice(0, 10)}T23:59:59+02:00`);
}
