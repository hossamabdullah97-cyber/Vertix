import { GatewayService } from './gateway.service';

/** A gateway over an in-memory stand-in for the few queries it makes. */
function setup(opts: { tag?: Record<string, unknown> | null; card?: Record<string, unknown> | null; recent?: boolean } = {}) {
  const tag = opts.tag === undefined ? { id: 'tag1', orgId: 'org1', uid: '04:A1:B2:C3', status: 'ACTIVE', cardId: 'card1' } : opts.tag;
  const card = opts.card === undefined ? { id: 'card1', slug: 'jane', actions: [] } : opts.card;
  const db = {
    nfcTag: { findFirst: jest.fn().mockResolvedValue(tag), update: jest.fn().mockReturnValue('tagUpdate') },
    card: { findFirst: jest.fn().mockResolvedValue(card) },
    visitor: { upsert: jest.fn().mockResolvedValue({}), findFirst: jest.fn().mockResolvedValue({ id: 'vis1' }) },
    event: { findFirst: jest.fn().mockResolvedValue(opts.recent ? { id: 'e0' } : null), create: jest.fn().mockReturnValue('eventCreate') },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const webhooks = { emit: jest.fn().mockResolvedValue(undefined) };
  const config = { get: (_k: string, d: string) => (_k === 'APP_PUBLIC_URL' ? 'https://web.test' : d) };
  const gateway = new GatewayService({ client: db } as never, config as never, webhooks as never);
  return { gateway, db, webhooks };
}

const ctx = { visitorId: 'v-1', ip: '1.2.3.4', userAgent: 'phone', apiBaseUrl: 'https://api.test/api' };

describe('GatewayService', () => {
  it('finds a chip however its serial is spelled in the URL', async () => {
    const { gateway, db } = setup();
    const r = await gateway.resolve('04a1b2c3', ctx);
    expect(db.nfcTag.findFirst).toHaveBeenCalledWith({ where: { uid: '04:A1:B2:C3' } });
    expect(r.state).toBe('ok');
    expect(r.redirectUrl).toBe('https://web.test/c/jane?t=04%3AA1%3AB2%3AC3');
  });

  it('sends an unknown chip to a page that says so instead of failing', async () => {
    const { gateway, db } = setup({ tag: null });
    const r = await gateway.resolve('04A1B2C3', ctx);
    expect(r.state).toBe('unknown');
    expect(r.redirectUrl).toBe('https://web.test/tap/04%3AA1%3AB2%3AC3?s=unknown');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('sends a turned-off chip to that page, uncounted', async () => {
    const { gateway, db } = setup({ tag: { id: 'tag1', orgId: 'org1', status: 'DISABLED', cardId: 'card1' } });
    const r = await gateway.resolve('04A1B2C3', ctx);
    expect(r.state).toBe('disabled');
    expect(r.redirectUrl).toContain('/tap/');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('sends a chip with no card to the link-it page, and counts the tap', async () => {
    const { gateway, db } = setup({ card: null });
    const r = await gateway.resolve('04A1B2C3', ctx);
    expect(r.state).toBe('unassigned');
    expect(r.redirectUrl).toBe('https://web.test/tap/04%3AA1%3AB2%3AC3?s=unassigned');
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('counts a tap and tells integrations', async () => {
    const { gateway, db, webhooks } = setup();
    await gateway.resolve('04A1B2C3', ctx);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(webhooks.emit).toHaveBeenCalledWith('org1', 'nfc.tapped', expect.objectContaining({ tagUid: '04:A1:B2:C3' }));
  });

  it('does not count the same phone tapping again moments later', async () => {
    const { gateway, db, webhooks } = setup({ recent: true });
    const r = await gateway.resolve('04A1B2C3', ctx);
    expect(r.redirectUrl).toContain('/c/jane');
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(webhooks.emit).not.toHaveBeenCalled();
    const where = db.event.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ tagId: 'tag1', type: 'NFC_SCAN' });
    expect(where.OR).toEqual([
      { visitorId: 'vis1' },
      { AND: [{ device: { path: ['ip'], equals: '1.2.3.4' } }, { device: { path: ['userAgent'], equals: 'phone' } }] },
    ]);
  });
});
