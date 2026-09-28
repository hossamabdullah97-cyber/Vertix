import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { Plan } from '@vertex/shared';
import { PrismaService } from '../prisma/prisma.service';

type SubStatus = 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED';

/** Statuses in which the org is still subscribed, and still being billed. */
const LIVE = new Set<string>(['ACTIVE', 'TRIALING', 'PAST_DUE']);

/**
 * Stripe's subscription status in the terms the app keeps, or null while the
 * first payment is still pending (nothing is granted until it clears).
 */
function subStatus(status: Stripe.Subscription.Status): SubStatus | null {
  if (status === 'active') return 'ACTIVE';
  if (status === 'trialing') return 'TRIALING';
  if (status === 'past_due' || status === 'unpaid') return 'PAST_DUE';
  if (status === 'canceled' || status === 'incomplete_expired') return 'CANCELED';
  return null;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe | null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const key = config.get<string>('STRIPE_SECRET_KEY');
    this.stripe = key ? new Stripe(key) : null;
    if (!this.stripe) this.logger.warn('Stripe not configured — billing disabled');
  }

  private get db() {
    return this.prisma.client;
  }

  get enabled(): boolean {
    return !!this.stripe;
  }

  private priceId(plan: 'PRO' | 'BUSINESS'): string | undefined {
    return plan === 'PRO'
      ? this.config.get<string>('STRIPE_PRICE_PRO')
      : this.config.get<string>('STRIPE_PRICE_BUSINESS');
  }

  /** Creates a Stripe Checkout session to subscribe the org to a paid plan. */
  async createCheckout(
    orgId: string,
    plan: 'PRO' | 'BUSINESS',
    email: string,
  ): Promise<{ url: string }> {
    if (!this.stripe) throw new ServiceUnavailableException('Billing is not configured');
    const price = this.priceId(plan);
    if (!price) throw new ServiceUnavailableException(`Price for ${plan} is not configured`);

    const org = await this.db.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });
    const existing = await this.db.subscription.findFirst({ where: { orgId } });
    // A second checkout would start a second subscription and bill both, so an
    // org that is already subscribed changes plans from the billing portal.
    if (existing?.stripeSubId && existing.plan !== 'FREE' && LIVE.has(existing.status)) {
      throw new BadRequestException('This workspace already has a subscription. Change plans from the billing portal.');
    }

    let customerId = existing?.stripeCustomerId ?? undefined;
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email,
        name: org?.name,
        metadata: { orgId },
      });
      customerId = customer.id;
    }

    const appUrl = this.config.get<string>('APP_PUBLIC_URL', 'http://localhost:3000');
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      success_url: `${appUrl}/billing?success=1`,
      cancel_url: `${appUrl}/billing?canceled=1`,
      metadata: { orgId, plan },
      // Stripe does not copy the session's metadata onto the subscription, and
      // the subscription's later updates and cancellation only carry their own.
      subscription_data: { metadata: { orgId, plan } },
    });
    if (!session.url) throw new BadRequestException('Failed to create checkout session');
    return { url: session.url };
  }

  /** Opens the Stripe customer portal for managing/cancelling the subscription. */
  async createPortal(orgId: string): Promise<{ url: string }> {
    if (!this.stripe) throw new ServiceUnavailableException('Billing is not configured');
    const sub = await this.db.subscription.findFirst({ where: { orgId } });
    if (!sub?.stripeCustomerId) throw new BadRequestException('No billing account yet');
    const appUrl = this.config.get<string>('APP_PUBLIC_URL', 'http://localhost:3000');
    const session = await this.stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${appUrl}/billing`,
    });
    return { url: session.url };
  }

  /** Handles Stripe webhooks: applies the new plan to the organization. */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<{ received: true }> {
    if (!this.stripe) return { received: true };
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) return { received: true };

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      throw new BadRequestException(`Webhook signature failed: ${(err as Error).message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const s = event.data.object as Stripe.Checkout.Session;
      const orgId = s.metadata?.orgId;
      const plan = (s.metadata?.plan as Plan) ?? 'PRO';
      if (orgId) {
        await this.applyPlan(orgId, plan, 'ACTIVE', s.customer as string, s.subscription as string);
      }
    } else if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const sub = event.data.object as Stripe.Subscription;
      // Subscriptions started before their metadata was set are found by id.
      const stored = await this.db.subscription.findFirst({
        where: sub.metadata?.orgId ? { orgId: sub.metadata.orgId } : { stripeSubId: sub.id },
        select: { orgId: true, stripeSubId: true, status: true },
      });
      const orgId = sub.metadata?.orgId ?? stored?.orgId;
      // Events can arrive late: one about an older subscription must not undo
      // the one the org is paying for now.
      const stale = !!stored?.stripeSubId && stored.stripeSubId !== sub.id && LIVE.has(stored.status);
      const status = event.type === 'customer.subscription.deleted' ? 'CANCELED' : subStatus(sub.status);
      if (orgId && status && !stale) {
        const periodEnd = sub.items?.data?.[0]?.current_period_end;
        await this.applyPlan(
          orgId,
          status === 'CANCELED' ? 'FREE' : this.planOf(sub),
          status,
          sub.customer as string,
          sub.id,
          status === 'CANCELED' || !periodEnd ? null : new Date(periodEnd * 1000),
        );
      }
    }

    return { received: true };
  }

  /**
   * The plan a subscription pays for. A plan switched in the billing portal
   * changes the price but not the metadata written at checkout, so the price
   * decides and the metadata is only the fallback.
   */
  private planOf(sub: Stripe.Subscription): Plan {
    const price = sub.items?.data?.[0]?.price?.id;
    if (price && price === this.priceId('BUSINESS')) return 'BUSINESS';
    if (price && price === this.priceId('PRO')) return 'PRO';
    return (sub.metadata?.plan as Plan) ?? 'PRO';
  }

  private async applyPlan(
    orgId: string,
    plan: Plan,
    status: SubStatus,
    customerId: string,
    subId: string,
    periodEnd?: Date | null,
  ) {
    const period = periodEnd === undefined ? {} : { currentPeriodEnd: periodEnd };
    // Runs outside tenant context (public webhook) — orgId is set explicitly.
    await this.db.$transaction([
      this.db.organization.update({ where: { id: orgId }, data: { plan } }),
      this.db.subscription.upsert({
        where: { orgId },
        create: { orgId, plan, status, stripeCustomerId: customerId, stripeSubId: subId, ...period },
        update: { plan, status, stripeCustomerId: customerId, stripeSubId: subId, ...period },
      }),
    ]);
    this.logger.log(`Applied plan ${plan} (${status}) to org ${orgId}`);
  }
}
