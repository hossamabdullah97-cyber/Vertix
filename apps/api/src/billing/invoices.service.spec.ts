import { Prisma } from '@vertex/db';
import { InvoicesService, billingDetailsOf, cardLabel, invoiceNumber, taxInside } from './invoices.service';

const NOW = new Date('2026-10-06T10:00:00Z');

function setup(env: Record<string, string> = {}, existing: unknown = null) {
  const created: Record<string, unknown>[] = [];
  const invoice = {
    findUnique: jest.fn(async () => existing),
    findUniqueOrThrow: jest.fn(async () => ({ id: 'inv1', number: 'VC-2026-00042', plan: 'PRO', amountCents: 49900, currency: 'EGP', periodStart: NOW, periodEnd: new Date('2026-11-05T21:59:59Z'), paymentMethod: 'MasterCard •••• 2346' })),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => (created.push(data), { id: 'inv1', ...data })),
    findMany: jest.fn(async () => []),
    findFirst: jest.fn(async () => null),
  };
  const db: Record<string, unknown> = {
    invoice,
    organization: {
      findUnique: jest.fn(async () => ({ name: 'Nile Trading', settings: { language: 'ar', billing: { legalName: 'Nile Trading LLC', taxId: '123-456-789', address: '', email: 'accounts@nile.co' } } })),
      update: jest.fn(async () => ({})),
    },
    membership: { findMany: jest.fn(async () => [{ user: { email: 'owner@nile.co' } }]) },
  };
  db.$transaction = jest.fn(async (fn: (t: unknown) => unknown) => fn({ ...db, $queryRaw: jest.fn(async () => [{ n: 42n }]) }));
  const mail = { send: jest.fn(async (_m: { to: string; html: string }) => true) };
  const config = { get: (k: string) => ({ APP_PUBLIC_URL: 'https://app.vertex.test', ...env })[k] };
  const service = new InvoicesService({ client: db } as never, config as never, mail as never);
  return { service, db: db as { invoice: typeof invoice; organization: { update: jest.Mock } }, created, mail };
}

const paid = { id: 7001, success: true, pending: false, amount_cents: 49900, currency: 'EGP', source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' } };
const sub = { id: 900, plan_id: 501, state: 'active', next_billing: '2026-11-05' };

describe('an invoice for a payment', () => {
  it('is numbered, billed to the workspace’s details, and sent to its owners and billing email', async () => {
    const { service, created, mail } = setup({ BILLING_SELLER_NAME: 'Vertex Connect LLC', BILLING_SELLER_TAX_ID: '999-888-777' });
    await service.record('org1', 'PRO', paid, sub, NOW);
    expect(created[0]).toMatchObject({
      orgId: 'org1',
      number: 'VC-2026-00042',
      paymobTransactionId: '7001',
      plan: 'PRO',
      amountCents: 49900,
      taxCents: 0,
      paymentMethod: 'MasterCard •••• 2346',
      periodStart: NOW,
      periodEnd: new Date('2026-11-05T23:59:59+02:00'),
      billedTo: { name: 'Nile Trading', legalName: 'Nile Trading LLC', taxId: '123-456-789', address: null, email: 'accounts@nile.co' },
      seller: { name: 'Vertex Connect LLC', taxId: '999-888-777', address: null, email: null },
    });
    expect(mail.send.mock.calls.map(([m]) => m.to)).toEqual(['accounts@nile.co', 'owner@nile.co']);
    expect(mail.send.mock.calls[0]![0].html).toContain('https://app.vertex.test/billing/invoices/inv1?w=org1');
  });

  it('shows the VAT inside the price when a rate is set', async () => {
    const { service, created } = setup({ BILLING_VAT_PERCENT: '14' });
    await service.record('org1', 'PRO', paid, sub, NOW);
    expect(created[0]).toMatchObject({ taxPercent: 14, taxCents: 6128 });
  });

  it('is made once, however many times Paymob reports the payment', async () => {
    const again = setup({}, { id: 'inv1' });
    await expect(again.service.record('org1', 'PRO', paid, sub, NOW)).resolves.toBeNull();
    expect(again.db.invoice.create).not.toHaveBeenCalled();

    const race = setup();
    race.db.invoice.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }));
    await expect(race.service.record('org1', 'PRO', paid, sub, NOW)).resolves.toBeNull();
    expect(race.mail.send).not.toHaveBeenCalled();
  });
});

describe('invoice details', () => {
  it('reads the card Paymob names, however much of it', () => {
    expect(cardLabel({ pan: 'xxxx-xxxx-xxxx-2346', sub_type: 'Visa' })).toBe('Visa •••• 2346');
    expect(cardLabel({ type: 'wallet' })).toBe('wallet');
    expect(cardLabel(null)).toBeNull();
  });

  it('works out the VAT inside a price, and numbers by year', () => {
    expect(taxInside(11400, 14)).toBe(1400);
    expect(taxInside(11400, null)).toBe(0);
    expect(invoiceNumber(7, new Date('2027-01-01T00:00:00Z'))).toBe('VC-2027-00007');
  });

  it('keeps the other settings when billing details change', async () => {
    const { service, db } = setup();
    await expect(service.setDetails('org1', { legalName: '  Nile LLC ', taxId: '', email: 'a@b.co' })).resolves.toEqual({ legalName: 'Nile LLC', taxId: '', address: '', email: 'a@b.co' });
    expect(db.organization.update).toHaveBeenCalledWith({
      where: { id: 'org1' },
      data: { settings: { language: 'ar', billing: { legalName: 'Nile LLC', taxId: null, address: null, email: 'a@b.co' } } },
    });
    expect(billingDetailsOf(null)).toEqual({ legalName: '', taxId: '', address: '', email: '' });
  });
});
