import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { BillingService } from './billing.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * The revenue path. The webhook is a public endpoint that grants paid plans, so
 * the signature check is the only thing standing between a forged POST and a
 * free upgrade to ENTERPRISE. It is asserted from the deny side first.
 */

jest.mock('stripe');

type StripeDouble = {
  webhooks: { constructEvent: jest.Mock };
  checkout: { sessions: { create: jest.Mock } };
  billingPortal: { sessions: { create: jest.Mock } };
  customers: { create: jest.Mock };
};

function makeService(
  env: Record<string, string | undefined> = {
    STRIPE_SECRET_KEY: 'sk_test',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    STRIPE_PRICE_PRO: 'price_pro',
    STRIPE_PRICE_BUSINESS: 'price_biz',
  },
  db: Record<string, unknown> = {},
) {
  const orgUpdate = jest.fn().mockResolvedValue({});
  const subUpsert = jest.fn().mockResolvedValue({});
  const prisma = {
    client: {
      organization: {
        update: orgUpdate,
        findUnique: jest.fn().mockResolvedValue({ name: 'Acme' }),
      },
      subscription: {
        upsert: subUpsert,
        findFirst: jest.fn().mockResolvedValue(null),
        ...(db.subscription as object),
      },
      // Transactions here are arrays of promises, not a callback.
      $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
    },
  } as unknown as PrismaService;

  const config = {
    get: (k: string, dflt?: string) => env[k] ?? dflt,
    getOrThrow: (k: string) => env[k],
  };

  const service = new BillingService(config as never, prisma);

  // Replace the constructed Stripe instance with a double we can drive.
  const stripe: StripeDouble = {
    webhooks: { constructEvent: jest.fn() },
    checkout: { sessions: { create: jest.fn() } },
    billingPortal: { sessions: { create: jest.fn() } },
    customers: { create: jest.fn().mockResolvedValue({ id: 'cus_1' }) },
  };
  if (env.STRIPE_SECRET_KEY) {
    (service as unknown as { stripe: StripeDouble | null }).stripe = stripe;
  } else {
    (service as unknown as { stripe: null }).stripe = null;
  }

  return { service, stripe, prisma, orgUpdate, subUpsert };
}

const body = Buffer.from('{}');

describe('BillingService.handleWebhook — signature', () => {
  it('rejects a payload whose signature does not verify', async () => {
    const { service, stripe, orgUpdate } = makeService();
    stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('no signatures found matching the expected signature');
    });
    await expect(service.handleWebhook(body, 'forged')).rejects.toThrow(
      BadRequestException,
    );
    // The decisive assertion: a forged event grants nothing.
    expect(orgUpdate).not.toHaveBeenCalled();
  });

  it('verifies against the raw body and the configured secret', async () => {
    const { service, stripe } = makeService();
    stripe.webhooks.constructEvent.mockReturnValue({ type: 'ping' });
    await service.handleWebhook(body, 'sig_1');
    expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(
      body,
      'sig_1',
      'whsec_test',
    );
  });

  it('grants nothing when no webhook secret is configured', async () => {
    // Fail closed: without a secret there is no way to trust the payload.
    const { service, stripe, orgUpdate } = makeService({ STRIPE_SECRET_KEY: 'sk_test' });
    await expect(service.handleWebhook(body, 'sig')).resolves.toEqual({ received: true });
    expect(stripe.webhooks.constructEvent).not.toHaveBeenCalled();
    expect(orgUpdate).not.toHaveBeenCalled();
  });

  it('is inert when Stripe is not configured at all', async () => {
    const { service, orgUpdate } = makeService({});
    await expect(service.handleWebhook(body, 'sig')).resolves.toEqual({ received: true });
    expect(orgUpdate).not.toHaveBeenCalled();
  });
});

describe('BillingService.handleWebhook — applying plans', () => {
  function withEvent(event: unknown) {
    const made = makeService();
    made.stripe.webhooks.constructEvent.mockReturnValue(event);
    return made;
  }

  it('upgrades the organization named in the checkout metadata', async () => {
    const { service, orgUpdate, subUpsert } = withEvent({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { orgId: 'org_acme', plan: 'BUSINESS' },
          customer: 'cus_1',
          subscription: 'sub_1',
        },
      },
    });
    await service.handleWebhook(body, 'sig');
    expect(orgUpdate).toHaveBeenCalledWith({
      where: { id: 'org_acme' },
      data: { plan: 'BUSINESS' },
    });
    expect(subUpsert.mock.calls[0][0]).toMatchObject({
      where: { orgId: 'org_acme' },
      create: { orgId: 'org_acme', plan: 'BUSINESS', status: 'ACTIVE' },
    });
  });

  it('applies the plan to the metadata org, never to some ambient tenant', async () => {
    // The webhook is public and runs with no tenant context, so the orgId in
    // the verified payload is the only thing that may decide who gets upgraded.
    const { service, orgUpdate } = withEvent({
      type: 'checkout.session.completed',
      data: {
        object: { metadata: { orgId: 'org_globex' }, customer: 'c', subscription: 's' },
      },
    });
    await service.handleWebhook(body, 'sig');
    expect(orgUpdate.mock.calls[0][0].where.id).toBe('org_globex');
  });

  it('defaults to PRO when checkout metadata names no plan', async () => {
    const { service, orgUpdate } = withEvent({
      type: 'checkout.session.completed',
      data: { object: { metadata: { orgId: 'org_acme' }, customer: 'c', subscription: 's' } },
    });
    await service.handleWebhook(body, 'sig');
    expect(orgUpdate.mock.calls[0][0].data.plan).toBe('PRO');
  });

  it('ignores an event that carries no organization', async () => {
    const { service, orgUpdate } = withEvent({
      type: 'checkout.session.completed',
      data: { object: { metadata: {}, customer: 'c', subscription: 's' } },
    });
    await expect(service.handleWebhook(body, 'sig')).resolves.toEqual({ received: true });
    expect(orgUpdate).not.toHaveBeenCalled();
  });

  it('ignores event types it does not handle', async () => {
    const { service, orgUpdate } = withEvent({
      type: 'invoice.payment_succeeded',
      data: { object: { metadata: { orgId: 'org_acme' } } },
    });
    await service.handleWebhook(body, 'sig');
    expect(orgUpdate).not.toHaveBeenCalled();
  });
});

describe('BillingService.handleWebhook — downgrades', () => {
  function subEvent(type: string, object: Record<string, unknown>) {
    const made = makeService();
    made.stripe.webhooks.constructEvent.mockReturnValue({ type, data: { object } });
    return made;
  }

  it('drops a deleted subscription back to FREE and marks it CANCELED', async () => {
    const { service, orgUpdate, subUpsert } = subEvent('customer.subscription.deleted', {
      metadata: { orgId: 'org_acme', plan: 'BUSINESS' },
      customer: 'cus_1',
      id: 'sub_1',
      status: 'active',
    });
    await service.handleWebhook(body, 'sig');
    // Even though the metadata still says BUSINESS, deletion wins.
    expect(orgUpdate.mock.calls[0][0].data.plan).toBe('FREE');
    expect(subUpsert.mock.calls[0][0].update).toMatchObject({
      plan: 'FREE',
      status: 'CANCELED',
    });
  });

  it('drops to FREE when an update reports a canceled status', async () => {
    const { service, orgUpdate } = subEvent('customer.subscription.updated', {
      metadata: { orgId: 'org_acme', plan: 'PRO' },
      customer: 'cus_1',
      id: 'sub_1',
      status: 'canceled',
    });
    await service.handleWebhook(body, 'sig');
    expect(orgUpdate.mock.calls[0][0].data.plan).toBe('FREE');
  });

  it('keeps the paid plan on a routine subscription update', async () => {
    const { service, orgUpdate } = subEvent('customer.subscription.updated', {
      metadata: { orgId: 'org_acme', plan: 'BUSINESS' },
      customer: 'cus_1',
      id: 'sub_1',
      status: 'active',
    });
    await service.handleWebhook(body, 'sig');
    expect(orgUpdate.mock.calls[0][0].data.plan).toBe('BUSINESS');
  });

  it('writes the org plan and the subscription row in one transaction', async () => {
    // A half-applied upgrade would leave billing and entitlements disagreeing.
    const { service, prisma } = subEvent('customer.subscription.updated', {
      metadata: { orgId: 'org_acme', plan: 'PRO' },
      customer: 'c',
      id: 's',
      status: 'active',
    });
    await service.handleWebhook(body, 'sig');
    expect(prisma.client.$transaction).toHaveBeenCalledTimes(1);
    expect((prisma.client.$transaction as unknown as jest.Mock).mock.calls[0][0]).toHaveLength(2);
  });
});

describe('BillingService.handleWebhook — subscription lifecycle', () => {
  function subEvent(type: string, object: Record<string, unknown>, db: Record<string, unknown> = {}) {
    const made = makeService(undefined, db);
    made.stripe.webhooks.constructEvent.mockReturnValue({ type, data: { object } });
    return made;
  }
  const item = (price: string, end = 1_792_540_800) => ({ data: [{ price: { id: price }, current_period_end: end }] });

  it('finds the org by the stored subscription when the event carries no metadata', async () => {
    // Subscriptions created before checkout stamped their metadata still have
    // to downgrade when they are cancelled.
    const findFirst = jest.fn().mockResolvedValue({ orgId: 'org_acme' });
    const { service, orgUpdate } = subEvent(
      'customer.subscription.deleted',
      { metadata: {}, customer: 'cus_1', id: 'sub_1', status: 'canceled' },
      { subscription: { findFirst } },
    );
    await service.handleWebhook(body, 'sig');
    expect(findFirst.mock.calls[0][0].where).toEqual({ stripeSubId: 'sub_1' });
    expect(orgUpdate).toHaveBeenCalledWith({ where: { id: 'org_acme' }, data: { plan: 'FREE' } });
  });

  it('ignores a late event about an older subscription once a newer one is live', async () => {
    const findFirst = jest.fn().mockResolvedValue({ orgId: 'org_acme', stripeSubId: 'sub_new', status: 'ACTIVE' });
    const { service, orgUpdate } = subEvent(
      'customer.subscription.deleted',
      { metadata: { orgId: 'org_acme', plan: 'PRO' }, customer: 'cus_1', id: 'sub_old', status: 'canceled' },
      { subscription: { findFirst } },
    );
    await service.handleWebhook(body, 'sig');
    expect(orgUpdate).not.toHaveBeenCalled();
  });

  it('applies an event about the subscription the org has on file', async () => {
    const findFirst = jest.fn().mockResolvedValue({ orgId: 'org_acme', stripeSubId: 'sub_1', status: 'ACTIVE' });
    const { service, orgUpdate } = subEvent(
      'customer.subscription.deleted',
      { metadata: { orgId: 'org_acme', plan: 'PRO' }, customer: 'cus_1', id: 'sub_1', status: 'canceled' },
      { subscription: { findFirst } },
    );
    await service.handleWebhook(body, 'sig');
    expect(orgUpdate.mock.calls[0][0].data.plan).toBe('FREE');
  });

  it('ignores a subscription it cannot tie to any org', async () => {
    const { service, orgUpdate } = subEvent('customer.subscription.updated', {
      metadata: {},
      customer: 'cus_x',
      id: 'sub_x',
      status: 'active',
    });
    await service.handleWebhook(body, 'sig');
    expect(orgUpdate).not.toHaveBeenCalled();
  });

  it('follows the price when the plan was switched in the portal', async () => {
    // The metadata still names the plan bought at checkout.
    const { service, orgUpdate } = subEvent('customer.subscription.updated', {
      metadata: { orgId: 'org_acme', plan: 'PRO' },
      items: item('price_biz'),
      customer: 'cus_1',
      id: 'sub_1',
      status: 'active',
    });
    await service.handleWebhook(body, 'sig');
    expect(orgUpdate.mock.calls[0][0].data.plan).toBe('BUSINESS');
  });

  it('keeps the plan but records a failed payment as past due', async () => {
    const { service, orgUpdate, subUpsert } = subEvent('customer.subscription.updated', {
      metadata: { orgId: 'org_acme', plan: 'PRO' },
      items: item('price_pro'),
      customer: 'cus_1',
      id: 'sub_1',
      status: 'past_due',
    });
    await service.handleWebhook(body, 'sig');
    expect(orgUpdate.mock.calls[0][0].data.plan).toBe('PRO');
    expect(subUpsert.mock.calls[0][0].update.status).toBe('PAST_DUE');
  });

  it('grants nothing while the first payment is still pending', async () => {
    const { service, orgUpdate } = subEvent('customer.subscription.created', {
      metadata: { orgId: 'org_acme', plan: 'BUSINESS' },
      items: item('price_biz'),
      customer: 'cus_1',
      id: 'sub_1',
      status: 'incomplete',
    });
    await service.handleWebhook(body, 'sig');
    expect(orgUpdate).not.toHaveBeenCalled();
  });

  it('records the paid period as soon as the subscription starts', async () => {
    const { service, subUpsert } = subEvent('customer.subscription.created', {
      metadata: { orgId: 'org_acme', plan: 'PRO' },
      items: item('price_pro', 1_792_540_800),
      customer: 'cus_1',
      id: 'sub_1',
      status: 'active',
    });
    await service.handleWebhook(body, 'sig');
    expect(subUpsert.mock.calls[0][0].create).toMatchObject({ plan: 'PRO', status: 'ACTIVE', currentPeriodEnd: new Date(1_792_540_800_000) });
  });

  it('records when the paid period ends, and clears it on cancellation', async () => {
    const live = subEvent('customer.subscription.updated', {
      metadata: { orgId: 'org_acme' },
      items: item('price_pro', 1_792_540_800),
      customer: 'cus_1',
      id: 'sub_1',
      status: 'active',
    });
    await live.service.handleWebhook(body, 'sig');
    expect(live.subUpsert.mock.calls[0][0].update.currentPeriodEnd).toEqual(new Date(1_792_540_800_000));

    const gone = subEvent('customer.subscription.deleted', {
      metadata: { orgId: 'org_acme' },
      items: item('price_pro'),
      customer: 'cus_1',
      id: 'sub_1',
      status: 'canceled',
    });
    await gone.service.handleWebhook(body, 'sig');
    expect(gone.subUpsert.mock.calls[0][0].update.currentPeriodEnd).toBeNull();
  });
});

describe('BillingService.createCheckout', () => {
  it('refuses when billing is not configured', async () => {
    const { service } = makeService({});
    await expect(service.createCheckout('org', 'PRO', 'a@b.co')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('refuses when the plan has no configured price', async () => {
    const { service } = makeService({ STRIPE_SECRET_KEY: 'sk_test' });
    await expect(service.createCheckout('org', 'BUSINESS', 'a@b.co')).rejects.toThrow(
      /Price for BUSINESS/,
    );
  });

  it('carries the org and plan in metadata so the webhook can act on them', async () => {
    const { service, stripe } = makeService();
    stripe.checkout.sessions.create.mockResolvedValue({ url: 'https://pay/x' });
    await expect(service.createCheckout('org_acme', 'PRO', 'a@b.co')).resolves.toEqual({
      url: 'https://pay/x',
    });
    expect(stripe.checkout.sessions.create.mock.calls[0][0]).toMatchObject({
      mode: 'subscription',
      metadata: { orgId: 'org_acme', plan: 'PRO' },
      line_items: [{ price: 'price_pro', quantity: 1 }],
    });
  });

  it('stamps the subscription itself with the org, so its later updates can be applied', async () => {
    const { service, stripe } = makeService();
    stripe.checkout.sessions.create.mockResolvedValue({ url: 'https://pay/x' });
    await service.createCheckout('org_acme', 'BUSINESS', 'a@b.co');
    expect(stripe.checkout.sessions.create.mock.calls[0][0].subscription_data).toEqual({
      metadata: { orgId: 'org_acme', plan: 'BUSINESS' },
    });
  });

  it('refuses a second subscription for an org that is already paying', async () => {
    // A new checkout would bill both subscriptions every month.
    for (const status of ['ACTIVE', 'TRIALING', 'PAST_DUE']) {
      const { service, stripe } = makeService(undefined, {
        subscription: {
          findFirst: jest.fn().mockResolvedValue({ stripeCustomerId: 'cus_1', stripeSubId: 'sub_1', plan: 'PRO', status }),
        },
      });
      await expect(service.createCheckout('org_acme', 'BUSINESS', 'a@b.co')).rejects.toThrow(/billing portal/);
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    }
  });

  it('lets an org whose subscription was cancelled subscribe again', async () => {
    const { service, stripe } = makeService(undefined, {
      subscription: {
        findFirst: jest.fn().mockResolvedValue({ stripeCustomerId: 'cus_1', stripeSubId: 'sub_1', plan: 'FREE', status: 'CANCELED' }),
      },
    });
    stripe.checkout.sessions.create.mockResolvedValue({ url: 'https://pay/x' });
    await expect(service.createCheckout('org_acme', 'PRO', 'a@b.co')).resolves.toEqual({ url: 'https://pay/x' });
    expect(stripe.checkout.sessions.create.mock.calls[0][0].customer).toBe('cus_1');
  });

  it('reuses an existing Stripe customer instead of creating a duplicate', async () => {
    const { service, stripe } = makeService(undefined, {
      subscription: { findFirst: jest.fn().mockResolvedValue({ stripeCustomerId: 'cus_old' }) },
    });
    stripe.checkout.sessions.create.mockResolvedValue({ url: 'https://pay/x' });
    await service.createCheckout('org_acme', 'PRO', 'a@b.co');
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create.mock.calls[0][0].customer).toBe('cus_old');
  });

  it('creates a customer stamped with the org on first checkout', async () => {
    const { service, stripe } = makeService();
    stripe.checkout.sessions.create.mockResolvedValue({ url: 'https://pay/x' });
    await service.createCheckout('org_acme', 'PRO', 'a@b.co');
    expect(stripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@b.co', metadata: { orgId: 'org_acme' } }),
    );
  });

  it('fails loudly when Stripe returns a session with no url', async () => {
    const { service, stripe } = makeService();
    stripe.checkout.sessions.create.mockResolvedValue({ url: null });
    await expect(service.createCheckout('org_acme', 'PRO', 'a@b.co')).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('BillingService.createPortal', () => {
  it('refuses when billing is not configured', async () => {
    const { service } = makeService({});
    await expect(service.createPortal('org')).rejects.toThrow(ServiceUnavailableException);
  });

  it('refuses for an org that has never had a billing account', async () => {
    const { service } = makeService();
    await expect(service.createPortal('org')).rejects.toThrow(/No billing account/);
  });

  it("opens the portal for the org's own customer", async () => {
    const { service, stripe } = makeService(undefined, {
      subscription: { findFirst: jest.fn().mockResolvedValue({ stripeCustomerId: 'cus_1' }) },
    });
    stripe.billingPortal.sessions.create.mockResolvedValue({ url: 'https://portal/x' });
    await expect(service.createPortal('org_acme')).resolves.toEqual({
      url: 'https://portal/x',
    });
    expect(stripe.billingPortal.sessions.create.mock.calls[0][0].customer).toBe('cus_1');
  });
});

describe('BillingService.enabled', () => {
  it('reports whether Stripe is wired up', () => {
    expect(makeService().service.enabled).toBe(true);
    expect(makeService({}).service.enabled).toBe(false);
  });
});
