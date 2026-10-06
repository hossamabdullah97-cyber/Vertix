import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { BillingService, callbackIds, checkoutReference, parseReference, PERSONAL_PLAN_ONLY, subStatus, TEAM_PLANS_ONLY } from './billing.service';
import type { PaymobClient, PaymobSubscription, PaymobTransaction } from './paymob.client';

/**
 * The revenue path. Paymob's callback is a public endpoint that grants paid
 * plans, so nothing in it is believed but ids: each is looked up at Paymob.
 * The deny side is asserted first.
 */

const ENV = {
  PAYMOB_API_KEY: 'api',
  PAYMOB_SECRET_KEY: 'sk',
  PAYMOB_PUBLIC_KEY: 'pk',
  PAYMOB_CARD_INTEGRATION_ID: '111',
  PAYMOB_PLAN_PERSONAL: '500',
  PAYMOB_PLAN_PRO: '501',
  PAYMOB_PLAN_BUSINESS: '502',
  PRICE_PERSONAL_EGP: '149',
  PRICE_PRO_EGP: '499',
  PRICE_BUSINESS_EGP: '1999',
  APP_PUBLIC_URL: 'https://app.vertex.test',
};

type Paymob = { [K in keyof PaymobClient]: jest.Mock };

function makeService(env: Record<string, string | undefined> = ENV, stored: Record<string, unknown> | null = null, kind: 'PERSONAL' | 'TEAM' = 'TEAM', invoices?: { record: jest.Mock }) {
  const orgUpdate = jest.fn().mockResolvedValue({});
  const subUpsert = jest.fn().mockResolvedValue({});
  const subUpdate = jest.fn().mockResolvedValue({});
  const findFirst = jest.fn().mockResolvedValue(stored);
  const findMany = jest.fn().mockResolvedValue([]);
  const prisma = {
    client: {
      organization: { update: orgUpdate, findUnique: jest.fn().mockResolvedValue({ kind }) },
      subscription: { upsert: subUpsert, update: subUpdate, findFirst, findMany },
      $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
    },
  };
  const config = { get: (k: string, dflt?: string) => env[k] ?? dflt };
  const service = new BillingService(config as never, prisma as never, invoices as never);

  const paymob: Paymob = {
    createSubscriptionIntention: jest.fn().mockResolvedValue({ clientSecret: 'cs', checkoutUrl: 'https://accept.paymob.com/unifiedcheckout/?x' }),
    getTransaction: jest.fn(),
    getSubscription: jest.fn(),
    subscriptionOfTransaction: jest.fn(),
    cancelSubscription: jest.fn().mockResolvedValue({ id: 900, plan_id: 501, state: 'canceled', next_billing: '2026-10-29' }),
    createPlan: jest.fn(),
    updatePlan: jest.fn(),
  } as unknown as Paymob;
  if ((service as unknown as { paymob: unknown }).paymob) (service as unknown as { paymob: Paymob }).paymob = paymob;
  return { service, paymob, orgUpdate, subUpsert, subUpdate, findFirst, findMany };
}

const sub = (over: Partial<PaymobSubscription> = {}): PaymobSubscription => ({ id: 900, plan_id: 501, state: 'active', next_billing: '2026-10-29', ...over });
const tx = (over: Partial<PaymobTransaction> = {}): PaymobTransaction => ({
  id: 7001,
  success: true,
  pending: false,
  amount_cents: 49900,
  order: { id: 1, merchant_order_id: 'vc_org1_PRO_0a1b2c3d' },
  ...over,
});

describe('reading a callback', () => {
  it('takes only ids from it', () => {
    expect(callbackIds({ type: 'TRANSACTION', obj: { id: 7001, success: true, amount_cents: 1 } })).toEqual({ transactionId: 7001, subscriptionId: null });
    expect(callbackIds({ subscription_data: { id: 900, initial_transaction: 7001 } })).toEqual({ transactionId: 7001, subscriptionId: 900 });
    expect(callbackIds({ type: 'SUBSCRIPTION', obj: { id: '900' } })).toEqual({ transactionId: null, subscriptionId: 900 });
    expect(callbackIds('nonsense')).toEqual({ transactionId: null, subscriptionId: null });
    expect(callbackIds({ type: 'TRANSACTION', obj: { id: -1 } })).toEqual({ transactionId: null, subscriptionId: null });
  });

  it('ties a checkout to a workspace by its reference, and nothing else', () => {
    const ref = checkoutReference('cmorg123', 'BUSINESS');
    expect(parseReference(ref)).toEqual({ orgId: 'cmorg123', plan: 'BUSINESS' });
    expect(parseReference('vc_cmorg123_ENTERPRISE_0a1b2c3d')).toBeNull();
    expect(parseReference('someone-elses-order')).toBeNull();
    expect(parseReference(undefined)).toBeNull();
  });

  it('maps Paymob states', () => {
    expect(subStatus('active')).toBe('ACTIVE');
    expect(subStatus('suspended')).toBe('PAST_DUE');
    expect(subStatus('canceled')).toBe('CANCELED');
    expect(subStatus('cancelled')).toBe('CANCELED');
  });
});

describe('BillingService.handleCallback — trust', () => {
  it('is inert when Paymob is not configured', async () => {
    const { service, orgUpdate } = makeService({});
    await expect(service.handleCallback({ type: 'TRANSACTION', obj: { id: 7001, success: true } })).resolves.toEqual({ received: true });
    expect(orgUpdate).not.toHaveBeenCalled();
  });

  it('grants nothing when Paymob says the payment failed, whatever the callback claims', async () => {
    const { service, paymob, orgUpdate } = makeService();
    paymob.getTransaction.mockResolvedValue(tx({ success: false }));
    await service.handleCallback({ type: 'TRANSACTION', obj: { id: 7001, success: true } });
    expect(paymob.getTransaction).toHaveBeenCalledWith(7001);
    expect(paymob.subscriptionOfTransaction).not.toHaveBeenCalled();
    expect(orgUpdate).not.toHaveBeenCalled();
  });

  it('grants nothing for a payment that belongs to no subscription', async () => {
    const { service, paymob, orgUpdate } = makeService();
    paymob.getTransaction.mockResolvedValue(tx());
    paymob.subscriptionOfTransaction.mockResolvedValue(null);
    await service.handleCallback({ type: 'TRANSACTION', obj: { id: 7001 } });
    expect(orgUpdate).not.toHaveBeenCalled();
  });

  it('grants nothing for a subscription on a plan that is not ours', async () => {
    const { service, paymob, orgUpdate } = makeService();
    paymob.getTransaction.mockResolvedValue(tx());
    paymob.subscriptionOfTransaction.mockResolvedValue(sub({ plan_id: 999 }));
    await service.handleCallback({ type: 'TRANSACTION', obj: { id: 7001 } });
    expect(orgUpdate).not.toHaveBeenCalled();
  });

  it('settles an id Paymob does not know, and passes on Paymob being down so it retries', async () => {
    const { PaymobError } = jest.requireActual('./paymob.client');
    const a = makeService();
    a.paymob.getTransaction.mockRejectedValue(new PaymobError('not found', 404));
    await expect(a.service.handleCallback({ type: 'TRANSACTION', obj: { id: 1 } })).resolves.toEqual({ received: true });
    const b = makeService();
    b.paymob.getTransaction.mockRejectedValue(new PaymobError('bad gateway', 502));
    await expect(b.service.handleCallback({ type: 'TRANSACTION', obj: { id: 1 } })).rejects.toThrow('bad gateway');
  });

  it('grants nothing for a subscription tied to no workspace', async () => {
    const { service, paymob, orgUpdate } = makeService();
    paymob.getSubscription.mockResolvedValue(sub());
    await service.handleCallback({ subscription_data: { id: 900 } });
    expect(orgUpdate).not.toHaveBeenCalled();
  });
});

describe('BillingService.handleCallback — applying plans', () => {
  it('upgrades the workspace named in the paid checkout, to the plan Paymob bills', async () => {
    const { service, paymob, orgUpdate, subUpsert } = makeService();
    paymob.getTransaction.mockResolvedValue(tx({ order: { merchant_order_id: 'vc_org1_PRO_0a1b2c3d' } }));
    paymob.subscriptionOfTransaction.mockResolvedValue(sub({ plan_id: 502 }));
    await service.handleCallback({ type: 'TRANSACTION', obj: { id: 7001 } });
    // The plan comes from Paymob's subscription, not from the reference.
    expect(orgUpdate).toHaveBeenCalledWith({ where: { id: 'org1' }, data: { plan: 'BUSINESS' } });
    expect(subUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: 'org1' },
        update: expect.objectContaining({ plan: 'BUSINESS', status: 'ACTIVE', paymobSubscriptionId: '900', currentPeriodEnd: new Date('2026-10-29T23:59:59+02:00') }),
      }),
    );
  });

  it('applies a renewal to the workspace the subscription is on file for', async () => {
    const { service, paymob, orgUpdate, findFirst } = makeService(ENV, { orgId: 'org1', paymobSubscriptionId: '900', status: 'ACTIVE' });
    paymob.getTransaction.mockResolvedValue(tx({ order: { merchant_order_id: null } }));
    paymob.subscriptionOfTransaction.mockResolvedValue(sub({ next_billing: '2026-11-28' }));
    await service.handleCallback({ type: 'TRANSACTION', obj: { id: 7002 } });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { paymobSubscriptionId: '900' } }));
    expect(orgUpdate).toHaveBeenCalledWith({ where: { id: 'org1' }, data: { plan: 'PRO' } });
  });

  it('keeps the plan but marks a failing subscription past due', async () => {
    const { service, paymob, subUpsert } = makeService(ENV, { orgId: 'org1', paymobSubscriptionId: '900', status: 'ACTIVE' });
    paymob.getSubscription.mockResolvedValue(sub({ state: 'suspended' }));
    await service.handleCallback({ subscription_data: { id: 900 } });
    expect(subUpsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ plan: 'PRO', status: 'PAST_DUE' }) }));
  });

  it('keeps the plan of a cancelled subscription until its paid period ends', async () => {
    const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const { service, paymob, orgUpdate } = makeService(ENV, { orgId: 'org1', paymobSubscriptionId: '900', status: 'ACTIVE' });
    paymob.getSubscription.mockResolvedValue(sub({ state: 'canceled', next_billing: future }));
    await service.handleCallback({ subscription_data: { id: 900 } });
    expect(orgUpdate).toHaveBeenCalledWith({ where: { id: 'org1' }, data: { plan: 'PRO' } });
  });

  it('drops to Free when a cancelled subscription has no paid time left', async () => {
    const { service, paymob, orgUpdate } = makeService(ENV, { orgId: 'org1', paymobSubscriptionId: '900', status: 'ACTIVE' });
    paymob.getSubscription.mockResolvedValue(sub({ state: 'canceled', next_billing: '2020-01-01' }));
    await service.handleCallback({ subscription_data: { id: 900 } });
    expect(orgUpdate).toHaveBeenCalledWith({ where: { id: 'org1' }, data: { plan: 'FREE' } });
  });

  it('cancels the old subscription when a new plan is paid for, so nothing is billed twice', async () => {
    const { service, paymob, orgUpdate } = makeService(ENV, { orgId: 'org1', paymobSubscriptionId: '800', status: 'ACTIVE' });
    paymob.getTransaction.mockResolvedValue(tx({ order: { merchant_order_id: 'vc_org1_BUSINESS_0a1b2c3d' } }));
    paymob.subscriptionOfTransaction.mockResolvedValue(sub({ id: 900, plan_id: 502 }));
    await service.handleCallback({ type: 'TRANSACTION', obj: { id: 7003 } });
    expect(paymob.cancelSubscription).toHaveBeenCalledWith(800);
    expect(orgUpdate).toHaveBeenCalledWith({ where: { id: 'org1' }, data: { plan: 'BUSINESS' } });
  });

  it('ignores late news about an older subscription', async () => {
    const { service, paymob, orgUpdate } = makeService(ENV, { orgId: 'org1', paymobSubscriptionId: '900', status: 'ACTIVE' });
    paymob.getTransaction.mockResolvedValue(tx({ order: { merchant_order_id: 'vc_org1_PRO_0a1b2c3d' } }));
    paymob.subscriptionOfTransaction.mockResolvedValue(sub({ id: 800, state: 'canceled' }));
    await service.handleCallback({ type: 'TRANSACTION', obj: { id: 6001 } });
    expect(orgUpdate).not.toHaveBeenCalled();
  });
});

describe('BillingService.createCheckout', () => {
  const customer = { email: 'owner@acme.test', name: 'Mariam Khaled', phone: '+201001234567' };

  it('refuses when billing is not configured', async () => {
    const { service } = makeService({});
    await expect(service.createCheckout('org1', 'PRO', customer, 'https://api.test')).rejects.toThrow(ServiceUnavailableException);
  });

  it('refuses a plan with no price or no Paymob plan', async () => {
    await expect(makeService({ ...ENV, PRICE_PRO_EGP: '' }).service.createCheckout('org1', 'PRO', customer, 'https://api.test')).rejects.toThrow(ServiceUnavailableException);
    await expect(makeService({ ...ENV, PAYMOB_PLAN_BUSINESS: undefined }).service.createCheckout('org1', 'BUSINESS', customer, 'https://api.test')).rejects.toThrow(ServiceUnavailableException);
  });

  it('refuses the plan the workspace is already paying for', async () => {
    const { service } = makeService(ENV, { orgId: 'org1', plan: 'PRO', status: 'ACTIVE', paymobSubscriptionId: '900' });
    await expect(service.createCheckout('org1', 'PRO', customer, 'https://api.test')).rejects.toThrow(BadRequestException);
  });

  it('asks Paymob for the configured price, and ties the payment to the workspace', async () => {
    const { service, paymob } = makeService();
    await expect(service.createCheckout('org1', 'PRO', customer, 'https://api.test')).resolves.toEqual({ url: 'https://accept.paymob.com/unifiedcheckout/?x' });
    const arg = paymob.createSubscriptionIntention.mock.calls[0][0];
    expect(arg).toMatchObject({
      planId: 501,
      amountCents: 49900,
      customer: { firstName: 'Mariam', lastName: 'Khaled', email: 'owner@acme.test', phone: '+201001234567' },
      notificationUrl: 'https://api.test/api/billing/paymob/webhook',
      // Back in the workspace that paid, whichever was open last.
      redirectionUrl: 'https://app.vertex.test/billing?checkout=done&w=org1',
    });
    expect(parseReference(arg.reference)).toEqual({ orgId: 'org1', plan: 'PRO' });
  });

  it('sells a person’s own workspace the personal plan, and only that', async () => {
    const own = makeService(ENV, null, 'PERSONAL');
    await expect(own.service.createCheckout('org1', 'PERSONAL', customer, 'https://api.test')).resolves.toMatchObject({ url: expect.any(String) });
    const arg = own.paymob.createSubscriptionIntention.mock.calls[0][0];
    expect(arg).toMatchObject({ planId: 500, amountCents: 14900, itemName: 'Vertex Connect Personal' });
    expect(parseReference(arg.reference)).toEqual({ orgId: 'org1', plan: 'PERSONAL' });
    await expect(makeService(ENV, null, 'PERSONAL').service.createCheckout('org1', 'PRO', customer, 'https://api.test')).rejects.toThrow(TEAM_PLANS_ONLY);
  });

  it('does not sell the personal plan to a company or team', async () => {
    const { service, paymob } = makeService(ENV, null, 'TEAM');
    await expect(service.createCheckout('org1', 'PERSONAL', customer, 'https://api.test')).rejects.toThrow(PERSONAL_PLAN_ONLY);
    expect(paymob.createSubscriptionIntention).not.toHaveBeenCalled();
  });
});

describe('BillingService.cancel and lapses', () => {
  it('stops the renewals and keeps the plan through the paid period', async () => {
    const { service, paymob, subUpdate } = makeService(ENV, { orgId: 'org1', plan: 'PRO', status: 'ACTIVE', paymobSubscriptionId: '900' });
    await expect(service.cancel('org1')).resolves.toEqual({ periodEnd: '2026-10-29T21:59:59.000Z' });
    expect(paymob.cancelSubscription).toHaveBeenCalledWith(900);
    expect(subUpdate).toHaveBeenCalledWith({ where: { orgId: 'org1' }, data: { status: 'CANCELED', currentPeriodEnd: new Date('2026-10-29T23:59:59+02:00') } });
  });

  it('refuses when there is nothing to cancel', async () => {
    await expect(makeService(ENV, null).service.cancel('org1')).rejects.toThrow(BadRequestException);
    await expect(makeService(ENV, { orgId: 'org1', status: 'CANCELED', paymobSubscriptionId: '900' }).service.cancel('org1')).rejects.toThrow(BadRequestException);
  });

  it('puts workspaces whose paid time is over back on Free', async () => {
    const { service, findMany, orgUpdate } = makeService();
    findMany.mockResolvedValue([{ orgId: 'org1' }]);
    await expect(service.closeLapsed(new Date('2026-11-01T00:00:00Z'))).resolves.toBe(1);
    expect(orgUpdate).toHaveBeenCalledWith({ where: { id: 'org1' }, data: { plan: 'FREE' } });
    const where = findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { status: 'CANCELED', currentPeriodEnd: { lt: new Date('2026-11-01T00:00:00Z') } },
      { status: 'PAST_DUE', currentPeriodEnd: { lt: new Date('2026-10-25T00:00:00Z') } },
    ]);
  });
});

describe('BillingService prices', () => {
  it('reads prices in pounds and sells only what is fully set up', () => {
    const { service } = makeService({ ...ENV, PRICE_BUSINESS_EGP: 'abc' });
    expect(service.prices()).toEqual({ PERSONAL: 149, PRO: 499, BUSINESS: null });
    expect(service.sells('PRO')).toBe(true);
    expect(service.sells('BUSINESS')).toBe(false);
    expect(makeService({}).service.enabled).toBe(false);
  });
});

describe('invoicing each payment', () => {
  it('invoices a paid first month for the workspace and plan Paymob confirms', async () => {
    const invoices = { record: jest.fn().mockResolvedValue({}) };
    const { service, paymob } = makeService(ENV, null, 'TEAM', invoices);
    const paid = tx({ order: { merchant_order_id: 'vc_org1_PRO_0a1b2c3d' } });
    paymob.getTransaction.mockResolvedValue(paid);
    paymob.subscriptionOfTransaction.mockResolvedValue(sub({ plan_id: 501 }));
    await service.handleCallback({ type: 'TRANSACTION', obj: { id: 7001 } });
    expect(invoices.record).toHaveBeenCalledWith('org1', 'PRO', paid, expect.objectContaining({ id: 900 }));
  });

  it('invoices each renewal, including the personal plan', async () => {
    const invoices = { record: jest.fn().mockResolvedValue({}) };
    const { service, paymob, orgUpdate } = makeService(ENV, { orgId: 'org9', paymobSubscriptionId: '900', status: 'ACTIVE' }, 'PERSONAL', invoices);
    paymob.getTransaction.mockResolvedValue(tx({ id: 7100, order: { merchant_order_id: null } }));
    paymob.subscriptionOfTransaction.mockResolvedValue(sub({ plan_id: 500 }));
    await service.handleCallback({ type: 'TRANSACTION', obj: { id: 7100 } });
    expect(orgUpdate).toHaveBeenCalledWith({ where: { id: 'org9' }, data: { plan: 'PERSONAL' } });
    expect(invoices.record).toHaveBeenCalledWith('org9', 'PERSONAL', expect.objectContaining({ id: 7100 }), expect.anything());
  });

  it('invoices nothing for a payment that did not go through, or a subscription change alone', async () => {
    const invoices = { record: jest.fn() };
    const { service, paymob } = makeService(ENV, { orgId: 'org1', paymobSubscriptionId: '900', status: 'ACTIVE' }, 'TEAM', invoices);
    paymob.getTransaction.mockResolvedValue(tx({ success: false }));
    await service.handleCallback({ type: 'TRANSACTION', obj: { id: 7001 } });
    paymob.getSubscription.mockResolvedValue(sub({ state: 'suspended' }));
    await service.handleCallback({ subscription_data: { id: 900 } });
    expect(invoices.record).not.toHaveBeenCalled();
  });

  it('closes a lapsed personal plan too', async () => {
    const { service, findMany } = makeService();
    await service.closeLapsed(new Date('2026-10-01'));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ plan: { in: ['PERSONAL', 'PRO', 'BUSINESS'] } }) }));
  });
});
