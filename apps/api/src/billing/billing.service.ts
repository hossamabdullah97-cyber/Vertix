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
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = sub.metadata?.orgId;
      if (orgId) {
        const canceled = event.type === 'customer.subscription.deleted' || sub.status === 'canceled';
        await this.applyPlan(
          orgId,
          canceled ? 'FREE' : ((sub.metadata?.plan as Plan) ?? 'PRO'),
          canceled ? 'CANCELED' : 'ACTIVE',
          sub.customer as string,
          sub.id,
        );
      }
    }

    return { received: true };
  }

  private async applyPlan(
    orgId: string,
    plan: Plan,
    status: 'ACTIVE' | 'CANCELED',
    customerId: string,
    subId: string,
  ) {
    // Runs outside tenant context (public webhook) — orgId is set explicitly.
    await this.db.$transaction([
      this.db.organization.update({ where: { id: orgId }, data: { plan } }),
      this.db.subscription.upsert({
        where: { orgId },
        create: { orgId, plan, status, stripeCustomerId: customerId, stripeSubId: subId },
        update: { plan, status, stripeCustomerId: customerId, stripeSubId: subId },
      }),
    ]);
    this.logger.log(`Applied plan ${plan} (${status}) to org ${orgId}`);
  }
}
